// Endpoints del presupuesto y del flujo de caja. Cargan las entidades de la base, las convierten a la
// entrada del motor (@atacama/core) y devuelven el resultado; nada se calcula aquí.
import {
  armarFlujo,
  armarFlujoSemanal,
  calcularPresupuesto,
  cobrosProyectados,
  economiaPorContenedor,
  listaMeses,
  PARAMS_SEMANAL_POR_DEFECTO,
  planificarMP,
  resolverContenedores,
  resumirFlujoSemanal,
  sumarDias,
  type CobroFlujo,
  type EntradaPpto,
  type ResultadoPpto,
} from '@atacama/core'
import type { FastifyInstance } from 'fastify'
import { auditar } from './crud'
import { prisma } from './db'
import { documentosConSaldo, facturasIncluidas } from './documentos'

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

export async function cargarEntrada(versionId: number, op: Opciones = {}) {
  const version = await prisma.versionPresupuesto.findUnique({ where: { id: versionId } })
  if (!version) return null
  const par = await parametros()
  const meses = listaMeses(iso(version.mesInicio), iso(version.mesFin))

  const clientesDb = await prisma.cliente.findMany({
    where: { activo: true },
    include: { precios: true, escalas: true, hitos: true, incoterm: true, producto: true, destino: { include: { tarifas: true } } },
    orderBy: { id: 'asc' },
  })
  const origenes = await prisma.origenMP.findMany({ include: { proveedor: true }, orderBy: { id: 'asc' } })
  const gastosDb = await prisma.gastoDriver.findMany({ where: { versionId, activo: true }, include: { tipoCosto: true, proveedor: true }, orderBy: { id: 'asc' } })
  const empleados = await prisma.empleado.findMany({ where: { activo: true }, orderBy: { id: 'asc' } })
  const insumos = await prisma.insumo.findMany({ include: { proveedor: true }, orderBy: { id: 'asc' } })
  const matriz = await prisma.incotermCosto.findMany({ include: { incoterm: true, tipoCosto: true } })
  const incotermCostos: Record<string, string[]> = {}
  for (const i of await prisma.incoterm.findMany()) incotermCostos[i.codigo] = []
  for (const m of matriz) incotermCostos[m.incoterm.codigo].push(m.tipoCosto.codigo)

  const reglas = await prisma.reglaFrecuencia.findMany({ where: { versionId } })
  const ediciones: Record<number, Record<string, number>> = {}
  for (const x of await prisma.contenedorMes.findMany({ where: { versionId } })) {
    ;(ediciones[x.clienteId] ??= {})[iso(x.mes).slice(0, 7)] = x.contenedores
  }
  const mezcla: Record<number, Record<number, number[]>> = {}
  for (const x of await prisma.mezclaOrigen.findMany({ where: { versionId } })) {
    const i = meses.indexOf(iso(x.mes).slice(0, 7))
    if (i < 0) continue
    const porOrigen = ((mezcla[x.clienteId] ??= {})[x.origenId] ??= meses.map(() => 0))
    porOrigen[i] = x.contenedores
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
      yodada: c.producto?.yodada ?? false,
      antiaglomeranteId: c.producto?.antiaglomeranteId ?? null,
      soloOrigen: c.soloOrigen,
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
    origenes: origenes.map((o) => ({ id: o.id, nombre: o.nombre, usdPorTon: num(o.usdPorTon), fleteUsdPorTon: num(o.fleteUsdPorTon), diasPago: o.proveedor?.diasPago ?? 0 })),
    gastos: gastosDb.map((g) => ({
      id: g.id, nombre: g.nombre, driver: g.driver, moneda: g.moneda,
      valorFijo: num(g.valorFijo), valorVariable: num(g.valorVariable), mesEspecifico: g.mesEspecifico,
      tipoCosto: g.tipoCosto?.codigo ?? null, afectoIVA: g.afectoIVA, soloFlujo: g.soloFlujo,
      diaDelMes: g.diaPago, modoExcel: g.modoExcel as 'NORMAL' | 'FUERA_DE_TOTAL' | 'NO_EXISTE', deudaId: g.deudaId, diasPago: g.proveedor?.diasPago ?? 0,
    })),
    insumos: insumos.map((i) => ({
      id: i.id, nombre: i.nombre, tipo: i.tipo, base: i.base, afectoIVA: i.afectoIVA, diasPago: i.proveedor?.diasPago ?? 0,
      costoUnitario: i.costoUnitario === null ? null : num(i.costoUnitario),
      cantidadPorBase: i.cantidadPorBase === null ? null : num(i.cantidadPorBase),
    })),
    empleados: empleados.map((e) => ({ cargo: e.cargo, bruto: e.bruto })),
    incotermCostos,
    contenedores,
    mezcla,
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

  // Decidir cuántos contenedores de un cliente en un mes se producen con MP de otro origen (mezcla de saldos).
  app.put('/api/presupuesto/:id/mezcla', async (req, reply) => {
    const versionId = Number((req.params as any).id)
    const { clienteId, origenId, mes, contenedores } = (req.body ?? {}) as { clienteId?: number; origenId?: number; mes?: string; contenedores?: number }
    if (!clienteId || !origenId || !mes || !/^\d{4}-\d{2}$/.test(mes) || !Number.isInteger(contenedores) || contenedores! < 0) {
      return reply.code(400).send({ error: 'Datos no válidos' })
    }
    const cliente = await prisma.cliente.findUnique({ where: { id: clienteId } })
    if (!cliente) return reply.code(400).send({ error: 'El cliente no existe' })
    if (cliente.soloOrigen && origenId !== cliente.origenId) {
      return reply.code(400).send({ error: `${cliente.nombre} solo puede llevar materia prima de su origen (límite de arsénico).` })
    }
    if (origenId === cliente.origenId) return reply.code(400).send({ error: 'Ese ya es el origen habitual del cliente' })
    const fecha = new Date(mes + '-01T00:00:00.000Z')
    const clave = { versionId_clienteId_origenId_mes: { versionId, clienteId, origenId, mes: fecha } }
    const antes = await prisma.mezclaOrigen.findUnique({ where: clave })
    const despues = await prisma.mezclaOrigen.upsert({
      where: clave,
      update: { contenedores: contenedores! },
      create: { versionId, clienteId, origenId, mes: fecha, contenedores: contenedores! },
    })
    await auditar(req.usuario, 'MezclaOrigen', despues.id, antes ? 'MODIFICAR' : 'CREAR', antes, despues)
    return despues
  })

  // Editar los camiones de MP de un mes.
  app.put('/api/presupuesto/:id/camiones', async (req, reply) => {
    const versionId = Number((req.params as any).id)
    const { mes, camiones, origenId } = (req.body ?? {}) as { mes?: string; camiones?: number; origenId?: number }
    if (!mes || !/^\d{4}-\d{2}$/.test(mes) || !Number.isInteger(camiones) || camiones! < 0) {
      return reply.code(400).send({ error: 'Datos no válidos' })
    }
    const origen = origenId ? await prisma.origenMP.findUnique({ where: { id: origenId } }) : await prisma.origenMP.findFirst({ orderBy: { id: 'asc' } })
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

  /** Plan de materia prima por origen: stock, compras, consumo, excedente y camiones sugeridos. */
  app.get('/api/materia-prima/:id', async (req, reply) => {
    const versionId = Number((req.params as any).id)
    const q = req.query as { meses?: string }
    const c = await cargarEntrada(versionId)
    if (!c) return reply.code(404).send({ error: 'La versión no existe' })
    const { entrada, par } = c
    const compras = await prisma.compraMPPlan.findMany({ where: { versionId } })
    const porOrigen: Record<number, number[]> = {}
    for (const x of compras) {
      const i = entrada.meses.indexOf(iso(x.mes).slice(0, 7))
      if (i < 0) continue
      ;(porOrigen[x.origenId] ??= entrada.meses.map(() => 0))[i] += x.camiones
    }
    // Stock de hoy por origen: lo recibido menos lo consumido de cada camión.
    const stock: Record<number, number> = {}
    for (const l of await prisma.camionMP.findMany({ include: { consumos: true } })) {
      stock[l.origenId] = (stock[l.origenId] ?? 0) + num(l.toneladasRecibidas) - l.consumos.reduce((s, x) => s + num(x.toneladasMP), 0)
    }
    const stockMinimoT = par.numero('stockMinimoMPTon', 0)
    const n = Math.min(Number(q.meses) || 24, entrada.meses.length)
    const recortar = <T>(xs: T[]) => xs.slice(0, n)
    const planes = planificarMP(entrada, porOrigen, stock, stockMinimoT).map((p) => ({
      ...p,
      meses: recortar(p.meses), camiones: recortar(p.camiones), compradasT: recortar(p.compradasT), consumoT: recortar(p.consumoT),
      stockInicioMesT: recortar(p.stockInicioMesT), stockFinalT: recortar(p.stockFinalT), ventaSinComprar: recortar(p.ventaSinComprar),
      camionesSugeridos: recortar(p.camionesSugeridos), valorStockFinalCLP: recortar(p.valorStockFinalCLP),
    }))
    const clientesMezcla = entrada.clientes
      .filter((cl) => cl.origenId && (entrada.contenedores[cl.id] ?? []).some((k) => k > 0))
      .map((cl) => ({
        clienteId: cl.id, nombre: cl.nombre, origenId: cl.origenId, soloOrigen: !!cl.soloOrigen,
        contenedores: recortar(entrada.contenedores[cl.id] ?? []),
        desviados: Object.fromEntries(
          entrada.origenes.filter((o) => o.id !== cl.origenId).map((o) => [o.id, recortar(entrada.meses.map((_, i) => (entrada.mezcla?.[cl.id]?.[o.id]?.[i] ?? 0)))]),
        ),
      }))
    return {
      version: { id: c.version.id, nombre: c.version.nombre }, tonPorCamion: entrada.tonPorCamion, mermaPct: entrada.mermaPct, stockMinimoT, tc: entrada.tc, planes,
      origenes: entrada.origenes.map((o) => ({ id: o.id, nombre: o.nombre })), clientesMezcla,
    }
  })

  /** Ajustes del usuario sobre la proyección: lista, cambiar (monto) o volver al valor proyectado (monto nulo). */
  app.get('/api/ajustes', async () => prisma.ajusteFlujo.findMany({ orderBy: [{ mes: 'asc' }, { clave: 'asc' }] }))
  app.put('/api/ajustes', async (req, reply) => {
    const { clave, mes, monto, nota } = (req.body ?? {}) as { clave?: string; mes?: string; monto?: number | null; nota?: string }
    if (!clave || !mes || !/^\d{4}-\d{2}$/.test(mes)) return reply.code(400).send({ error: 'Datos no válidos' })
    const antes = await prisma.ajusteFlujo.findUnique({ where: { clave_mes: { clave, mes } } })
    if (monto === null || monto === undefined) {
      if (antes) await prisma.ajusteFlujo.delete({ where: { id: antes.id } })
      await auditar(req.usuario, 'AjusteFlujo', antes?.id ?? null, 'ELIMINAR', antes, null)
      return { ok: true }
    }
    if (!Number.isInteger(monto) || monto < 0) return reply.code(400).send({ error: 'El monto debe ser un entero en pesos, positivo' })
    const despues = await prisma.ajusteFlujo.upsert({ where: { clave_mes: { clave, mes } }, update: { monto, nota }, create: { clave, mes, monto, nota } })
    await auditar(req.usuario, 'AjusteFlujo', despues.id, antes ? 'MODIFICAR' : 'CREAR', antes, despues)
    return despues
  })

  /** Flujo mensual (24 meses por defecto). */
  app.get('/api/flujo/:id', async (req, reply) => {
    const q = req.query as { tc?: string; meses?: string }
    const prep = await prepararFlujo(Number((req.params as any).id), { tc: q.tc ? Number(q.tc) : undefined })
    if (!prep) return reply.code(404).send({ error: 'La versión no existe' })
    const { c, ppto, par } = prep
    const nMeses = Math.min(Number(q.meses) || 24, ppto.meses.length)
    const mesesPpto = ppto.meses.slice(0, nMeses)
    // Mes previo al presupuesto: la última semana de septiembre vive en partidas manuales.
    const [a, m] = mesesPpto[0].split('-').map(Number)
    const previo = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`
    const flujo = armarFlujo({ ...prep.base, meses: [previo, ...mesesPpto] })
    return { version: { id: c.version.id, nombre: c.version.nombre, tc: c.entrada.tc }, flujo, advertencias: prep.advertencias, modoIVA: par.texto('devolucionIVAModo', 'fijo'), facturas: await facturasIncluidas(), saldoReal: await saldoRealDeCaja() }
  })

  /** Flujo semanal: una columna de cierre más N semanas desde el primer día del presupuesto. */
  app.get('/api/flujo/:id/semanal', async (req, reply) => {
    const q = req.query as { tc?: string; semanas?: string; atraso?: string; costos?: string; sin?: string }
    const prep = await prepararFlujo(Number((req.params as any).id), {
      tc: q.tc ? Number(q.tc) : undefined, atrasoCobros: Number(q.atraso) || 0, costosPct: Number(q.costos) || 0, sinCliente: q.sin ? Number(q.sin) : undefined,
    })
    if (!prep) return reply.code(404).send({ error: 'La versión no existe' })
    const flujo = armarFlujoSemanal(prep.semanal(Math.min(Number(q.semanas) || 13, 52)))
    return {
      version: { id: prep.c.version.id, nombre: prep.c.version.nombre, tc: prep.c.entrada.tc },
      flujo, resumen: resumirFlujoSemanal(flujo, prep.base.saldoMinimo), advertencias: prep.advertencias, facturas: await facturasIncluidas(), saldoReal: await saldoRealDeCaja(),
    }
  })

  /** Compara escenarios: cada uno cambia el dólar, el atraso de los cobros, los costos o el cliente que se pierde. */
  app.post('/api/escenarios/:id', async (req, reply) => {
    const versionId = Number((req.params as any).id)
    const body = (req.body ?? {}) as {
      semanas?: number
      escenarios?: { nombre?: string; tc?: number | null; atrasoCobros?: number | null; costosPct?: number | null; sinCliente?: number | null }[]
    }
    const lista = (body.escenarios ?? []).slice(0, 5)
    if (lista.length === 0) return reply.code(400).send({ error: 'Falta al menos un escenario' })
    const semanas = Math.min(Number(body.semanas) || 13, 52)
    const resultados = []
    let periodos: unknown = null
    for (const [i, esc] of lista.entries()) {
      const prep = await prepararFlujo(versionId, {
        tc: esc.tc || undefined, atrasoCobros: esc.atrasoCobros || 0, costosPct: esc.costosPct || 0, sinCliente: esc.sinCliente || undefined,
      })
      if (!prep) return reply.code(404).send({ error: 'La versión no existe' })
      const flujo = armarFlujoSemanal(prep.semanal(semanas))
      periodos = flujo.periodos
      resultados.push({
        nombre: esc.nombre?.trim() || `Escenario ${i + 1}`,
        tc: prep.c.entrada.tc,
        resumen: resumirFlujoSemanal(flujo, prep.base.saldoMinimo),
        saldos: flujo.saldoFinal,
        // Margen de los primeros 12 meses del presupuesto, con los supuestos del escenario.
        margen12m: prep.ppto.margen.slice(0, 12).reduce((s, x) => s + x, 0),
      })
    }
    return { periodos, escenarios: resultados }
  })
}

// ───────────── Preparación del flujo (compartida por el mensual, el semanal y los escenarios) ─────────────

interface OpFlujo extends Opciones {
  /** Días que se atrasan todos los cobros (reales y proyectados). */
  atrasoCobros?: number
  /** Aumento porcentual de todos los costos de operación. */
  costosPct?: number
}

/** Aplica un aumento porcentual a los egresos y recalcula totales y margen. */
function escalarCostos(ppto: ResultadoPpto, pct: number): ResultadoPpto {
  const egresos = ppto.egresos.map((l) => ({ ...l, valores: l.valores.map((v) => v * (1 + pct / 100)) }))
  const totalEgresos = ppto.meses.map((_, i) => egresos.filter((l) => !l.fueraDeTotal).reduce((s, l) => s + l.valores[i], 0))
  const margen = ppto.meses.map((_, i) => ppto.totalVentas[i] + totalEgresos[i])
  let acum = 0
  return { ...ppto, egresos, totalEgresos, margen, margenAcum: margen.map((m) => (acum += m)) }
}

/**
 * Fecha en que se espera un cobro de un embarque real: la fecha del evento del embarque (real si ya ocurrió, si no
 * la estimada) más los días de desfase de la forma de pago del cliente. Si el embarque no tiene esa fecha, se usa
 * la fecha base que quedó guardada en el hito. La llegada (ETA) sale del embarque más los días de tránsito del destino.
 */
function fechaDelHito(
  e: { fOCReal: Date | null; fOCEst: Date | null; fProdReal: Date | null; fProdEst: Date | null; fETDReal: Date | null; fETDEst: Date | null; fBLReal: Date | null; fBLEst: Date | null; fETAReal: Date | null; fETAEst: Date | null },
  h: { evento: string; fechaEsperada: Date | null },
  diasTransito: number,
  formaDePago: { evento: string; diasDesfase: number }[],
): string | null {
  const etd = e.fETDReal ?? e.fETDEst
  const bl = e.fBLReal ?? e.fBLEst ?? etd
  const porEvento: Record<string, Date | null | undefined> = {
    OC: e.fOCReal ?? e.fOCEst,
    PRODUCCION: e.fProdReal ?? e.fProdEst,
    ETD: etd,
    BL: bl,
    FACTURA: bl,
    ETA: e.fETAReal ?? e.fETAEst ?? (etd ? new Date(etd.getTime() + diasTransito * 86_400_000) : null),
  }
  const base = porEvento[h.evento]
  if (!base) return h.fechaEsperada ? iso(h.fechaEsperada) : null
  const desfase = formaDePago.find((x) => x.evento === h.evento)?.diasDesfase ?? 0
  return sumarDias(iso(base), desfase)
}

/** Saldo de caja con que parte el flujo: la suma de las cuentas en pesos según su última cartola. */
async function saldoRealDeCaja() {
  const cuentas = await prisma.cuentaBancaria.findMany({ where: { moneda: 'CLP', enFlujo: true } })
  const fechas = cuentas.map((c) => c.fechaSaldoInicial).filter((f): f is Date => !!f).sort((a, b) => b.getTime() - a.getTime())
  return { monto: cuentas.reduce((s, c) => s + c.saldoInicial, 0), fecha: fechas[0] ? iso(fechas[0]) : null, cuentas: cuentas.filter((c) => c.fechaSaldoInicial).map((c) => c.nombre) }
}

async function prepararFlujo(versionId: number, op: OpFlujo = {}) {
  const c = await cargarEntrada(versionId, { tc: op.tc, sinCliente: op.sinCliente })
  if (!c) return null
  const { entrada, par } = c
  let ppto = calcularPresupuesto(entrada, 'corregido')
  if (op.costosPct) ppto = escalarCostos(ppto, op.costosPct)
  const advertencias = [...ppto.advertencias]
  const atraso = op.atrasoCobros ?? 0

  // Cobros reales: hitos pendientes de embarques reales, con sus días de atraso.
  const embarques = await prisma.embarque.findMany({
    where: { versionId: null, estado: { not: 'COBRADO' } },
    include: { hitos: true, cliente: { include: { hitos: true, destino: true } } },
  })
  const cobros: CobroFlujo[] = []
  const cubiertos = new Set<string>()
  for (const e of embarques) {
    const pendientes = e.hitos.filter((h) => h.estado !== 'COBRADO')
    const ref = e.fETDReal ?? e.fETDEst ?? pendientes.find((h) => h.fechaEsperada)?.fechaEsperada
    if (ref) cubiertos.add(`${e.clienteId}|${iso(ref).slice(0, 7)}`)
    // Lo ya cobrado: se muestra el día en que llegó, con los pesos reales de la cartola cuando se conocen.
    for (const h of e.hitos.filter((x) => x.estado === 'COBRADO' && (x.fechaCobro ?? x.fechaEsperada))) {
      cobros.push({
        clienteId: e.clienteId, nombre: e.cliente.nombre, fecha: iso((h.fechaCobro ?? h.fechaEsperada)!), usdCent: h.montoUsdCent,
        origen: 'REAL', evento: h.evento, pct: num(h.pct), clp: h.clpRecibido ?? undefined, cobrado: true,
      })
    }
    for (const h of pendientes) {
      const fecha = fechaDelHito(e, h, e.cliente.destino?.diasTransito ?? 20, e.cliente.hitos)
      if (!fecha) continue
      cobros.push({
        clienteId: e.clienteId, nombre: e.cliente.nombre, fecha: sumarDias(fecha, h.diasAtraso + atraso), usdCent: h.montoUsdCent,
        origen: 'REAL', evento: h.evento, pct: num(h.pct),
      })
    }
  }

  const proy = cobrosProyectados(
    c.clientes, ppto.meses,
    Object.fromEntries(ppto.contenedores.map((x) => [x.clienteId, x.valores])),
    cubiertos,
    { diaETD: par.numero('diaETD', 15), diasOCAntesETD: par.numero('diasOCAntesETD', 30), diasProduccionAntesETD: par.numero('diasProduccionAntesETD', 7) },
  )
  advertencias.push(...proy.advertencias)
  cobros.push(...proy.cobros.map((x) => ({ ...x, fecha: sumarDias(x.fecha, atraso) })))

  const cuentas = await prisma.cuentaBancaria.findMany({ where: { moneda: 'CLP', enFlujo: true } })
  // Lo que se debe a proveedores y el presupuesto no proyecta (el resto ya está en sus líneas: sumarlo duplicaría); sale el día de su vencimiento, o hoy si ya venció.
  const hoy = new Date().toISOString().slice(0, 10)
  const facturasPendientes = (await documentosConSaldo()).filter((d) => (d.estado === 'PENDIENTE' || d.estado === 'PARCIAL') && !d.enPresupuesto && d.saldo > 0)
  const partidas = [
    ...(await prisma.partidaFlujo.findMany({ orderBy: { fecha: 'asc' } })).map((p) => ({ fecha: iso(p.fecha), concepto: p.concepto, monto: p.monto })),
    ...facturasPendientes.map((d) => ({ fecha: (d.vencimiento ?? d.emision) < hoy ? hoy : (d.vencimiento ?? d.emision), concepto: `${d.saldo < 0 ? "Nota de crédito" : "Factura"} ${d.proveedor} N° ${d.folio}`, monto: -d.saldo })),
  ]

  const deudasDb = await prisma.deuda.findMany({ where: { cuota: { not: null }, enFlujo: true }, include: { gastos: true } })
  const deudas = deudasDb
    .filter((d) => d.gastos.length === 0)
    .map((d) => ({ acreedor: d.acreedor, cuota: d.cuota!, desde: d.inicio ? iso(d.inicio).slice(0, 7) : null, hasta: d.fin ? iso(d.fin).slice(0, 7) : null }))
  for (const d of deudas) if (!d.hasta) advertencias.push(`Cuota ${d.acreedor}: sin fecha de término; se proyecta ${par.numero('mesesCuotaSinFin', 12)} meses.`)

  // Todo lo que el flujo mensual y el semanal comparten.
  const base = {
    ppto, tc: entrada.tc,
    saldoInicial: cuentas.reduce((s, x) => s + x.saldoInicial, 0),
    cobros, partidas, deudas,
    sueldosLiquidos: (await prisma.empleado.findMany({ where: { activo: true } })).reduce((s, e) => s + (e.liquido ?? 0), 0),
    previredMensual: par.numero('previredMensual', 0),
    ivaPct: par.numero('ivaPct', 19),
    devolucionIVAModo: (par.texto('devolucionIVAModo', 'fijo') === 'calculado' ? 'calculado' : 'fijo') as 'fijo' | 'calculado',
    devolucionIVAMensual: par.numero('devolucionIVAMensual', 0),
    devolucionIVAPct: par.numero('devolucionIVAPct', 100),
    ppmPct: par.numero('ppmPct', 0),
    retencionImpuestoUnico: par.numero('retencionImpuestoUnico', 0),
    ppmVentasMesPrevio: par.numero('ppmVentasMesPrevio', 0) || undefined,
    periodosIVA: (await prisma.periodoIVA.findMany()).map((x) => ({
      mes: iso(x.mes).slice(0, 7), ivaCredito: x.ivaCredito || null, devolucionEsperada: x.devolucionEsperada || null,
      fechaDevolucion: x.fechaDevolucionEst ? iso(x.fechaDevolucionEst) : null,
    })),
    rezagoIVAMeses: par.numero('rezagoIVAMeses', 1),
    mesesSinFin: par.numero('mesesCuotaSinFin', 12),
    saldoMinimo: par.numero('saldoMinimoCaja', 0),
    primerPeriodoInformativo: true,
    ajustes: (await prisma.ajusteFlujo.findMany()).map((a) => ({ clave: a.clave, mes: a.mes, monto: a.monto })),
    mpPagadoHasta: par.texto('mpPagadaHasta', '') || undefined,
  }

  const params = {
    diaPagoFijos: par.numero('diaPagoFijos', PARAMS_SEMANAL_POR_DEFECTO.diaPagoFijos),
    diaPagoPrevired: par.numero('diaPagoPrevired', PARAMS_SEMANAL_POR_DEFECTO.diaPagoPrevired),
    diaPagoCuotas: par.numero('diaPagoCuotas', PARAMS_SEMANAL_POR_DEFECTO.diaPagoCuotas),
    diaPagoF29: par.numero('diaPagoF29', PARAMS_SEMANAL_POR_DEFECTO.diaPagoF29),
    diaDevolucionIVA: par.numero('diaDevolucionIVA', PARAMS_SEMANAL_POR_DEFECTO.diaDevolucionIVA),
    diaETD: par.numero('diaETD', PARAMS_SEMANAL_POR_DEFECTO.diaETD),
    diasProduccionAntesETD: par.numero('diasProduccionAntesETD', PARAMS_SEMANAL_POR_DEFECTO.diasProduccionAntesETD),
  }
  const semanal = (nSemanas: number) => ({ ...base, inicio: `${ppto.meses[0]}-01`, nSemanas, params })

  return { c, par, ppto, advertencias, base, semanal }
}
