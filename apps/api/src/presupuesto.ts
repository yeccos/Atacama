// Endpoints del presupuesto y del flujo de caja. Cargan las entidades de la base, las convierten a la
// entrada del motor (@atacama/core) y devuelven el resultado; nada se calcula aquí.
import {
  armarFlujo,
  calcularPresupuesto,
  cobrosProyectados,
  economiaPorContenedor,
  listaMeses,
  resolverContenedores,
  sumarDias,
  type CobroFlujo,
  type EntradaPpto,
} from '@atacama/core'
import type { FastifyInstance } from 'fastify'
import { auditar } from './crud'
import { prisma } from './db'

const iso = (d: Date) => d.toISOString().slice(0, 10)
const num = (x: unknown) => Number(x)

async function parametros() {
  const filas = await prisma.parametro.findMany()
  const m = Object.fromEntries(filas.map((p) => [p.clave, p.valor]))
  return {
    texto: (clave: string, def: string) => m[clave] ?? def,
    numero: (clave: string, def: number) => (m[clave] !== undefined && m[clave] !== '' ? Number(m[clave]) : def),
  }
}

interface Opciones {
  tc?: number
  sinCliente?: number
}

async function cargarEntrada(versionId: number, op: Opciones = {}) {
  const version = await prisma.versionPresupuesto.findUnique({ where: { id: versionId } })
  if (!version) return null
  const par = await parametros()
  const meses = listaMeses(iso(version.mesInicio), iso(version.mesFin))

  const clientesDb = await prisma.cliente.findMany({
    where: { activo: true },
    include: { precios: true, escalas: true, hitos: true, incoterm: true, destino: { include: { tarifas: true } } },
    orderBy: { id: 'asc' },
  })
  const origenes = await prisma.origenMP.findMany({ orderBy: { id: 'asc' } })
  const gastosDb = await prisma.gastoDriver.findMany({ where: { versionId, activo: true }, include: { tipoCosto: true }, orderBy: { id: 'asc' } })
  const empleados = await prisma.empleado.findMany({ where: { activo: true }, orderBy: { id: 'asc' } })
  const matriz = await prisma.incotermCosto.findMany({ include: { incoterm: true, tipoCosto: true } })
  const incotermCostos: Record<string, string[]> = {}
  for (const i of await prisma.incoterm.findMany()) incotermCostos[i.codigo] = []
  for (const m of matriz) incotermCostos[m.incoterm.codigo].push(m.tipoCosto.codigo)

  const reglas = await prisma.reglaFrecuencia.findMany({ where: { versionId } })
  const ediciones: Record<number, Record<string, number>> = {}
  for (const x of await prisma.contenedorMes.findMany({ where: { versionId } })) {
    ;(ediciones[x.clienteId] ??= {})[iso(x.mes).slice(0, 7)] = x.contenedores
  }
  const compras = await prisma.compraMPPlan.findMany({ where: { versionId } })
  const camiones = meses.map((m) => compras.filter((c) => iso(c.mes).slice(0, 7) === m).reduce((s, c) => s + c.camiones, 0))

  // Stock inicial: lo recibido menos lo consumido hasta hoy.
  const recibido = (await prisma.camionMP.findMany()).reduce((s, c) => s + num(c.toneladasRecibidas), 0)
  const consumido = (await prisma.consumoMP.findMany()).reduce((s, c) => s + num(c.toneladasMP), 0)

  const clientes = clientesDb.map((c) => {
    const precio = [...c.precios].sort((a, b) => b.desde.getTime() - a.desde.getTime()).find((p) => p.desde <= version.mesInicio && (!p.hasta || p.hasta >= version.mesInicio))
    const tarifa = c.destino && [...c.destino.tarifas].sort((a, b) => b.desde.getTime() - a.desde.getTime())[0]
    return {
      id: c.id,
      nombre: c.nombre,
      kgPorCont: c.kgPorContenedor,
      usdPorKg: precio ? num(precio.usdPorKg) : 0,
      escalas: c.escalas.map((x) => ({ nContenedor: x.nContenedor, pctDescuento: num(x.pctDescuento) })),
      origenId: c.origenId,
      incoterm: c.incoterm?.codigo ?? null,
      fleteUsdPorCont: tarifa ? num(tarifa.usdPorCont) : null,
      // Solo para el flujo:
      diasTransito: c.destino?.diasTransito ?? 20,
      hitos: [...c.hitos].sort((a, b) => a.orden - b.orden).map((h) => ({ pct: num(h.pct), evento: h.evento, diasDesfase: h.diasDesfase })),
    }
  })

  let contenedores = resolverContenedores(meses, reglas.map((r) => ({ ...r, desde: iso(r.desde), hasta: r.hasta ? iso(r.hasta) : null })), ediciones)
  if (op.sinCliente) contenedores = { ...contenedores, [op.sinCliente]: meses.map(() => 0) }

  const entrada: EntradaPpto = {
    meses,
    tc: op.tc ?? num(version.tcPresupuesto),
    uf: num(version.ufPresupuesto),
    mermaPct: par.numero('mermaDefectoPct', 5),
    tonPorCamion: par.numero('toneladasPorCamion', 28),
    stockInicialTon: recibido - consumido,
    clientes,
    origenes: origenes.map((o) => ({ id: o.id, nombre: o.nombre, usdPorTon: num(o.usdPorTon), fleteUsdPorTon: num(o.fleteUsdPorTon) })),
    gastos: gastosDb.map((g) => ({
      id: g.id, nombre: g.nombre, driver: g.driver, moneda: g.moneda,
      valorFijo: num(g.valorFijo), valorVariable: num(g.valorVariable), mesEspecifico: g.mesEspecifico,
      tipoCosto: g.tipoCosto?.codigo ?? null, afectoIVA: g.afectoIVA, soloFlujo: g.soloFlujo,
      modoExcel: g.modoExcel as 'NORMAL' | 'FUERA_DE_TOTAL' | 'NO_EXISTE', deudaId: g.deudaId,
    })),
    empleados: empleados.map((e) => ({ cargo: e.cargo, bruto: e.bruto })),
    incotermCostos,
    contenedores,
    camiones,
    bonoDescargaPorCamion: par.numero('bonoDescargaPorCamion', 0),
  }
  return { version, entrada, clientes, par }
}

export function registrarPresupuesto(app: FastifyInstance) {
  app.get('/api/presupuesto/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const q = req.query as { tc?: string; sin?: string }
    const c = await cargarEntrada(Number(id), { tc: q.tc ? Number(q.tc) : undefined, sinCliente: q.sin ? Number(q.sin) : undefined })
    if (!c) return reply.code(404).send({ error: 'La versión no existe' })
    return {
      version: { id: c.version.id, nombre: c.version.nombre, tc: c.entrada.tc },
      resultado: calcularPresupuesto(c.entrada, 'corregido'),
    }
  })

  app.get('/api/presupuesto/:id/economia', async (req, reply) => {
    const c = await cargarEntrada(Number((req.params as any).id))
    if (!c) return reply.code(404).send({ error: 'La versión no existe' })
    return economiaPorContenedor(c.entrada)
  })

  // Editar la cantidad de contenedores de un cliente en un mes (celda de la grilla).
  app.put('/api/presupuesto/:id/contenedor', async (req, reply) => {
    const versionId = Number((req.params as any).id)
    const { clienteId, mes, contenedores } = (req.body ?? {}) as { clienteId?: number; mes?: string; contenedores?: number }
    if (!clienteId || !mes || !/^\d{4}-\d{2}$/.test(mes) || !Number.isInteger(contenedores) || contenedores! < 0) {
      return reply.code(400).send({ error: 'Datos no válidos' })
    }
    const clave = { versionId_clienteId_mes: { versionId, clienteId, mes: new Date(mes + '-01T00:00:00.000Z') } }
    const antes = await prisma.contenedorMes.findUnique({ where: clave })
    const despues = await prisma.contenedorMes.upsert({
      where: clave,
      update: { contenedores: contenedores! },
      create: { versionId, clienteId, mes: new Date(mes + '-01T00:00:00.000Z'), contenedores: contenedores! },
    })
    await auditar(req.usuario, 'ContenedorMes', despues.id, antes ? 'MODIFICAR' : 'CREAR', antes, despues)
    return despues
  })

  // Editar los camiones de MP de un mes.
  app.put('/api/presupuesto/:id/camiones', async (req, reply) => {
    const versionId = Number((req.params as any).id)
    const { mes, camiones } = (req.body ?? {}) as { mes?: string; camiones?: number }
    if (!mes || !/^\d{4}-\d{2}$/.test(mes) || !Number.isInteger(camiones) || camiones! < 0) {
      return reply.code(400).send({ error: 'Datos no válidos' })
    }
    const origen = await prisma.origenMP.findFirst({ orderBy: { id: 'asc' } })
    if (!origen) return reply.code(400).send({ error: 'No hay orígenes de materia prima' })
    const fecha = new Date(mes + '-01T00:00:00.000Z')
    const clave = { versionId_origenId_mes: { versionId, origenId: origen.id, mes: fecha } }
    const antes = await prisma.compraMPPlan.findUnique({ where: clave })
    const despues = await prisma.compraMPPlan.upsert({
      where: clave,
      update: { camiones: camiones! },
      create: { versionId, origenId: origen.id, mes: fecha, camiones: camiones! },
    })
    await auditar(req.usuario, 'CompraMPPlan', despues.id, antes ? 'MODIFICAR' : 'CREAR', antes, despues)
    return despues
  })

  app.get('/api/flujo/:id', async (req, reply) => {
    const q = req.query as { tc?: string; meses?: string }
    const c = await cargarEntrada(Number((req.params as any).id), { tc: q.tc ? Number(q.tc) : undefined })
    if (!c) return reply.code(404).send({ error: 'La versión no existe' })
    const { entrada, par } = c
    const ppto = calcularPresupuesto(entrada, 'corregido')
    const advertencias = [...ppto.advertencias]

    // Cobros reales: hitos pendientes de embarques reales, con sus días de atraso.
    const embarques = await prisma.embarque.findMany({ where: { versionId: null, estado: { not: 'COBRADO' } }, include: { hitos: true, cliente: true } })
    const cobros: CobroFlujo[] = []
    const cubiertos = new Set<string>()
    for (const e of embarques) {
      const pendientes = e.hitos.filter((h) => h.estado !== 'COBRADO' && h.fechaEsperada)
      const ref = e.fETDReal ?? e.fETDEst ?? pendientes[0]?.fechaEsperada
      if (ref) cubiertos.add(`${e.clienteId}|${iso(ref).slice(0, 7)}`)
      for (const h of pendientes) {
        cobros.push({ clienteId: e.clienteId, nombre: e.cliente.nombre, fecha: sumarDias(iso(h.fechaEsperada!), h.diasAtraso), usdCent: h.montoUsdCent, origen: 'REAL' })
      }
    }

    const nMeses = Math.min(Number(q.meses) || 24, ppto.meses.length)
    const mesesPpto = ppto.meses.slice(0, nMeses)
    const proy = cobrosProyectados(
      c.clientes, mesesPpto,
      Object.fromEntries(ppto.contenedores.map((x) => [x.clienteId, x.valores.slice(0, nMeses)])),
      cubiertos,
      { diaETD: par.numero('diaETD', 15), diasOCAntesETD: par.numero('diasOCAntesETD', 30), diasProduccionAntesETD: par.numero('diasProduccionAntesETD', 7) },
    )
    advertencias.push(...proy.advertencias)

    // Mes previo al presupuesto: la última semana de septiembre vive en partidas manuales.
    const [a, m] = mesesPpto[0].split('-').map(Number)
    const previo = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`
    const meses = [previo, ...mesesPpto]

    const cuentas = await prisma.cuentaBancaria.findMany({ where: { moneda: 'CLP' } })
    const partidas = (await prisma.partidaFlujo.findMany({ orderBy: { fecha: 'asc' } })).map((p) => ({ fecha: iso(p.fecha), concepto: p.concepto, monto: p.monto }))

    const deudasDb = await prisma.deuda.findMany({ where: { cuota: { not: null } }, include: { gastos: true } })
    const deudas = deudasDb
      .filter((d) => d.gastos.length === 0)
      .map((d) => ({ acreedor: d.acreedor, cuota: d.cuota!, desde: d.inicio ? iso(d.inicio).slice(0, 7) : null, hasta: d.fin ? iso(d.fin).slice(0, 7) : null }))
    for (const d of deudas) if (!d.hasta) advertencias.push(`Cuota ${d.acreedor}: sin fecha de término; se proyecta ${par.numero('mesesCuotaSinFin', 12)} meses.`)

    const flujo = armarFlujo({
      ppto, tc: entrada.tc, meses,
      saldoInicial: cuentas.reduce((s, x) => s + x.saldoInicial, 0),
      cobros: [...cobros, ...proy.cobros],
      partidas, deudas,
      sueldosLiquidos: (await prisma.empleado.findMany({ where: { activo: true } })).reduce((s, e) => s + (e.liquido ?? 0), 0),
      previredMensual: par.numero('previredMensual', 0),
      ivaPct: par.numero('ivaPct', 19),
      devolucionIVAModo: par.texto('devolucionIVAModo', 'fijo') === 'calculado' ? 'calculado' : 'fijo',
      devolucionIVAMensual: par.numero('devolucionIVAMensual', 0),
      rezagoIVAMeses: par.numero('rezagoIVAMeses', 1),
      mesesSinFin: par.numero('mesesCuotaSinFin', 12),
      saldoMinimo: par.numero('saldoMinimoCaja', 0),
    })
    return { version: { id: c.version.id, nombre: c.version.nombre, tc: entrada.tc }, flujo, advertencias, modoIVA: par.texto('devolucionIVAModo', 'fijo') }
  })
}
