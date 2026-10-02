// Facturas recibidas: qué se debe a cada proveedor y qué pagos de la cartola las cubren.
import { compacto, GRUPO_INSUMOS, GRUPO_MP, grupoGasto, GRUPO_EXPORTACION } from '@atacama/core'
import type { FastifyInstance } from 'fastify'
import { auditar } from './crud'
import { prisma } from './db'

const iso = (d: Date) => d.toISOString().slice(0, 10)
const SUPUESTO = 'Supuesto'

const GENERICAS = new Set(['COMERCIAL', 'COMERCIALIZADORA', 'LTDA', 'LIMITADA', 'SPA', 'SA', 'CIA', 'DE', 'Y', 'INVERSIONES', 'SERVICIOS', 'CHILE', 'DISTRIBUIDORA', 'EMPRESA', 'SOCIEDAD', 'AG', 'TRANSPORTES', 'TRANSPORTE'])
const palabras = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().split(/[^A-Z0-9]+/).filter((w) => w.length >= 3 && !GENERICAS.has(w))
/** El nombre del proveedor y el del destinatario de la cartola comparten alguna palabra propia (no "comercial", "ltda", etc.). */
const mismoNombre = (a: string, b: string | null) => {
  if (!b) return false
  const A = palabras(a)
  const B = palabras(b)
  return A.some((x) => B.some((y) => x === y || (x.length >= 5 && y.length >= 5 && (x.startsWith(y) || y.startsWith(x)))))
}
const AVISO = 'Aviso'

/** Positivo para facturas y notas de débito, negativo para notas de crédito. */
const signo = (tipo: string) => (tipo === 'NOTA_CREDITO' ? -1 : 1)

export type EstadoDoc = 'PAGADA' | 'SUPUESTA' | 'PARCIAL' | 'PENDIENTE'

/**
 * Proveedores cuyo gasto el presupuesto ya proyecta mes a mes (gastos, insumos, materia prima y fletes), con el gran grupo
 * donde aparece: sus facturas no se suman otra vez al flujo, se muestran dentro de ese grupo.
 */
async function proveedoresEnPresupuesto() {
  const grupos = new Map<number, string>()
  for (const g of await prisma.gastoDriver.findMany({ where: { activo: true, proveedorId: { not: null } }, include: { tipoCosto: true } })) grupos.set(g.proveedorId!, grupoGasto(g.tipoCosto?.codigo ?? null, g.driver))
  for (const i of await prisma.insumo.findMany({ where: { proveedorId: { not: null } }, select: { proveedorId: true } })) grupos.set(i.proveedorId!, GRUPO_INSUMOS)
  for (const o of await prisma.origenMP.findMany({ where: { proveedorId: { not: null } }, select: { proveedorId: true } })) grupos.set(o.proveedorId!, GRUPO_MP)
  for (const t of await prisma.tarifaFlete.findMany({ where: { navieraId: { not: null } }, select: { navieraId: true } })) grupos.set(t.navieraId!, GRUPO_EXPORTACION)
  return grupos
}

/** Facturas pendientes que el presupuesto ya incluye: se muestran bajo su grupo del flujo, sin sumarse. */
export async function facturasIncluidas() {
  const hoy = new Date().toISOString().slice(0, 10)
  return (await documentosConSaldo())
    .filter((d) => (d.estado === 'PENDIENTE' || d.estado === 'PARCIAL') && d.grupo)
    .map((d) => ({ grupo: d.grupo!, proveedor: d.proveedor, folio: d.folio, fecha: (d.vencimiento ?? d.emision) < hoy ? hoy : (d.vencimiento ?? d.emision), saldo: d.saldo }))
}

export async function documentosConSaldo() {
  const enPresupuesto = await proveedoresEnPresupuesto()
  const docs = await prisma.documento.findMany({
    include: { proveedor: true, aplicaciones: { include: { pago: true } } },
    orderBy: [{ emision: 'desc' }, { id: 'desc' }],
  })
  const conPdf = new Set((await prisma.documentoArchivo.findMany({ select: { documentoId: true } })).map((x) => x.documentoId))
  const movs = await prisma.movimientoBanco.findMany({ where: { cargo: { gt: 0 }, cuenta: { moneda: 'CLP' } }, orderBy: { fecha: 'asc' } })
  // Lo realmente transferido según la cartola para cada factura: los movimientos que se le asociaron. Si un mismo movimiento
  // cubre varias facturas no se puede repartir, y queda como "compartido".
  const concs = await prisma.conciliacion.findMany({ where: { tipoDestino: 'PAGO' } })
  const movPorPago = new Map<number, number[]>()
  for (const c of concs) if (c.destinoId != null) movPorPago.set(c.destinoId, [...(movPorPago.get(c.destinoId) ?? []), c.movimientoId])
  const cargoMov = new Map((await prisma.movimientoBanco.findMany({ where: { id: { in: [...new Set(concs.map((c) => c.movimientoId))] } }, select: { id: true, cargo: true } })).map((x) => [x.id, x.cargo]))
  const docsPorMov = new Map<number, Set<number>>()
  for (const d of docs) for (const a of d.aplicaciones) for (const mid of movPorPago.get(a.pagoId) ?? []) docsPorMov.set(mid, (docsPorMov.get(mid) ?? new Set()).add(d.id))
  const asignado = new Map<number, number>()
  for (const c of concs) asignado.set(c.movimientoId, (asignado.get(c.movimientoId) ?? 0) + c.monto)
  const pagoCartola = (d: (typeof docs)[number]) => {
    const ids = [...new Set(d.aplicaciones.flatMap((a) => movPorPago.get(a.pagoId) ?? []))]
    if (!ids.length) return { real: null as number | null, compartido: false, movimiento: null as number | null }
    const monto = ids.reduce((s, id) => s + (cargoMov.get(id) ?? 0), 0)
    const compartido = ids.some((id) => (docsPorMov.get(id)?.size ?? 0) > 1 || (cargoMov.get(id) ?? 0) > (asignado.get(id) ?? 0) * 1.02)
    return { real: compartido ? null : monto, compartido, movimiento: monto }
  }
  const hastaCartola = movs.length ? iso(movs[movs.length - 1].fecha) : null
  const peso = (n: number) => '$' + n.toLocaleString('es-CL')
  /** Por qué una factura figura como pagada "supuesta": qué se buscó en la cartola y qué se encontró. */
  const motivoSupuesto = (d: (typeof docs)[number]) => {
    const nombre = compacto(d.proveedor.nombre)
    const desde = d.emision.getTime() - 10 * 86400000
    const delProv = movs.filter((x) => x.fecha.getTime() >= desde && (x.proveedorId === d.proveedorId || mismoNombre(d.proveedor.nombre, x.contraparte)))
    if (!delProv.length) return `No hay ningún pago a ${d.proveedor.nombre} en la cartola desde ${iso(d.emision)} (la cartola llega hasta ${hastaCartola ?? '—'}). Puede estar pagada con otro medio o aún no pagada.`
    const cerca = delProv.slice(0, 3).map((x) => `${iso(x.fecha)} ${peso(x.cargo)}${x.nota ? ' «' + x.nota + '»' : ''}`).join('; ')
    return `Hay pagos a ${d.proveedor.nombre}, pero ninguno por ${peso(d.total)} (${cerca}). Pueden cubrir otras facturas o esta en partes: revisa que el monto calce.`
  }
  return docs.map((d) => {
    const pagado = d.aplicaciones.reduce((s, a) => s + a.monto, 0)
    const supuesto = d.aplicaciones.length > 0 && d.aplicaciones.every((a) => (a.pago.nota ?? '').startsWith(SUPUESTO))
    const total = signo(d.tipo) * d.total
    const saldo = total - signo(d.tipo) * pagado
    const estado: EstadoDoc = Math.abs(saldo) < 1 ? (supuesto ? 'SUPUESTA' : 'PAGADA') : pagado > 0 ? 'PARCIAL' : 'PENDIENTE'
    return {
      id: d.id, proveedorId: d.proveedorId, proveedor: d.proveedor.nombre, proveedorRut: d.proveedor.rut, tienePdf: conPdf.has(d.id), tipo: d.tipo, folio: d.folio,
      emision: iso(d.emision), vencimiento: d.vencimiento ? iso(d.vencimiento) : null,
      total, pagado: signo(d.tipo) * pagado, saldo, estado, ...(() => { const p = pagoCartola(d); return { pagadoReal: p.real, pagoCompartido: p.compartido, montoMovimiento: p.movimiento, diferencia: p.real === null ? null : p.real - d.total } })(), motivo: (supuesto ? motivoSupuesto(d) : null) as string | null, aviso: (d.aplicaciones.find((a) => (a.pago.nota ?? '').startsWith(AVISO))?.pago.nota ?? null) as string | null, enPresupuesto: enPresupuesto.has(d.proveedorId), grupo: enPresupuesto.get(d.proveedorId) ?? null,
    }
  })
}

export function registrarDocumentos(app: FastifyInstance) {
  app.get('/api/documentos/resumen', async () => {
    const docs = await documentosConSaldo()
    const porProveedor: Record<number, { proveedorId: number; proveedor: string; n: number; saldo: number; masAntiguo: string }> = {}
    for (const d of docs.filter((x) => x.estado === 'PENDIENTE' || x.estado === 'PARCIAL')) {
      const p = (porProveedor[d.proveedorId] ??= { proveedorId: d.proveedorId, proveedor: d.proveedor, n: 0, saldo: 0, masAntiguo: d.emision })
      p.n++
      p.saldo += d.saldo
      if (d.emision < p.masAntiguo) p.masAntiguo = d.emision
    }
    return { documentos: docs, saldosPorProveedor: Object.values(porProveedor).sort((a, b) => b.saldo - a.saldo) }
  })

  // Detalle de una factura: sus montos, los pagos aplicados y el movimiento de la cartola de cada uno.
  app.get('/api/documentos/:id/detalle', async (req, reply) => {
    const id = Number((req.params as any).id)
    const d = await prisma.documento.findUnique({ where: { id }, include: { proveedor: true, aplicaciones: { include: { pago: true } }, archivo: { select: { nombre: true } } } })
    if (!d) return reply.code(404).send({ error: 'La factura no existe' })
    const resumen = (await documentosConSaldo()).find((x) => x.id === id)
    const pagos = []
    for (const a of d.aplicaciones) {
      const concs = await prisma.conciliacion.findMany({ where: { tipoDestino: 'PAGO', destinoId: a.pagoId } })
      const movs = await prisma.movimientoBanco.findMany({ where: { id: { in: concs.map((c) => c.movimientoId) } }, include: { cuenta: true } })
      pagos.push({
        fecha: iso(a.pago.fecha), monto: a.monto, nota: a.pago.nota,
        movimientos: movs.map((m) => ({ fecha: iso(m.fecha), cargo: m.cargo, cuenta: m.cuenta.nombre, contraparte: m.contraparte, glosa: m.glosa, detalle: m.nota })),
      })
    }
    return {
      proveedor: d.proveedor.nombre, rut: d.proveedor.rut, tipo: d.tipo, folio: d.folio, emision: iso(d.emision), vencimiento: d.vencimiento ? iso(d.vencimiento) : null,
      neto: d.neto, exento: d.exento, iva: d.iva, total: d.total, nota: d.nota, estado: resumen?.estado, saldo: resumen?.saldo, motivo: resumen?.motivo ?? null,
      aviso: resumen?.aviso ?? null, grupo: resumen?.grupo ?? null, pdf: d.archivo?.nombre ?? null, lineas: d.lineas ? (JSON.parse(d.lineas) as string[]) : [], pagos,
    }
  })

  // El PDF de la factura: se sube desde la pantalla (base64) y se abre desde ella.
  app.post('/api/documentos/:id/pdf', { bodyLimit: 12 * 1024 * 1024 }, async (req, reply) => {
    const id = Number((req.params as any).id)
    const { nombre, base64 } = (req.body ?? {}) as { nombre?: string; base64?: string }
    if (!base64) return reply.code(400).send({ error: 'Falta el archivo' })
    const datos = Buffer.from(base64, 'base64')
    if (datos.subarray(0, 4).toString() !== '%PDF') return reply.code(400).send({ error: 'El archivo no es un PDF' })
    if (!(await prisma.documento.findUnique({ where: { id } }))) return reply.code(404).send({ error: 'La factura no existe' })
    await prisma.documentoArchivo.upsert({ where: { documentoId: id }, create: { documentoId: id, nombre: nombre ?? 'factura.pdf', datos }, update: { nombre: nombre ?? 'factura.pdf', datos } })
    return { ok: true }
  })
  app.get('/api/documentos/:id/pdf', async (req, reply) => {
    const a = await prisma.documentoArchivo.findUnique({ where: { documentoId: Number((req.params as any).id) } })
    if (!a) return reply.code(404).send({ error: 'Esta factura no tiene PDF adjunto' })
    return reply.header('Content-Type', 'application/pdf').header('Content-Disposition', 'inline').send(Buffer.from(a.datos))
  })

  // Marcar una factura como pagada (con un pago por su saldo) o dejarla pendiente (se borran sus pagos supuestos).
  app.post('/api/documentos/:id/estado', async (req, reply) => {
    const id = Number((req.params as any).id)
    const { pagada } = (req.body ?? {}) as { pagada?: boolean }
    const doc = await prisma.documento.findUnique({ where: { id }, include: { aplicaciones: { include: { pago: true } } } })
    if (!doc) return reply.code(404).send({ error: 'La factura no existe' })
    if (pagada) {
      const pagado = doc.aplicaciones.reduce((s, a) => s + a.monto, 0)
      if (doc.total - pagado > 0) {
        const pago = await prisma.pago.create({ data: { proveedorId: doc.proveedorId, fecha: new Date(), monto: doc.total - pagado, nota: `${SUPUESTO} pagado (marcado a mano)` } })
        await prisma.aplicacionPago.create({ data: { pagoId: pago.id, documentoId: id, monto: doc.total - pagado } })
      }
    } else {
      for (const a of doc.aplicaciones.filter((x) => (x.pago.nota ?? '').startsWith(SUPUESTO))) await prisma.pago.delete({ where: { id: a.pagoId } })
    }
    await auditar(req.usuario, 'Documento', id, 'MODIFICAR', null, { pagada })
    return { ok: true }
  })

  // Cruza las facturas pendientes (o solo supuestas) con los pagos de la cartola: mismo monto y mismo proveedor.
  app.post('/api/documentos/conciliar', async (req) => {
    const docs = await prisma.documento.findMany({ where: { tipo: { not: 'NOTA_CREDITO' } }, include: { proveedor: true, aplicaciones: { include: { pago: true } } } })
    const concs = await prisma.conciliacion.findMany({ where: { tipoDestino: 'PAGO' } })
    const usados = new Set(concs.map((c) => c.movimientoId))
    const movs = await prisma.movimientoBanco.findMany({ where: { cargo: { gt: 0 }, cuenta: { moneda: 'CLP' } }, orderBy: { fecha: 'asc' } })
    // Lo que queda de cada pago sin asignar a una factura (un pago puede cubrir varias facturas).
    const resto = new Map(movs.map((x) => [x.id, x.cargo - concs.filter((c) => c.movimientoId === x.id).reduce((a, c) => a + c.monto, 0)]))
    let verificadas = 0
    let nuevas = 0
    let porDetalle = 0
    const dudosas: string[] = []
    // 1) Por el detalle que escribió quien pagó ("Fact 129683"): el número de factura manda aunque el monto no calce
    //    (un pago puede cubrir varias facturas o una parte).
    // Acepta varios números seguidos: "Fac 89524 89755", "Fac 114694 y 114809".
    const folioDe = (nota: string | null) =>
      [...(nota ?? '').matchAll(/\b(?:fac|fact|factura|fc)\w*\.?\s*(?:n[°º]?\s*)?(\d{2,9}(?:\s*(?:y|e|,)?\s*\d{2,9}\b)*)/gi)].flatMap((x) => x[1].split(/\D+/).filter(Boolean))
    for (const d of docs) {
      const yaPagado = d.aplicaciones.length > 0 && !d.aplicaciones.every((a) => (a.pago.nota ?? '').startsWith(SUPUESTO))
      if (yaPagado) continue
      const nombre = compacto(d.proveedor.nombre)
      const m = movs.find(
        (x) =>
          (resto.get(x.id) ?? 0) > 0 && folioDe(x.nota).includes(d.folio) &&
          (x.proveedorId === d.proveedorId || mismoNombre(d.proveedor.nombre, x.contraparte)),
      )
      if (!m) continue
      for (const a of d.aplicaciones) await prisma.pago.delete({ where: { id: a.pagoId } })
      const monto = Math.min(d.total, resto.get(m.id)!)
      resto.set(m.id, resto.get(m.id)! - monto)
      const pago = await prisma.pago.create({ data: { proveedorId: d.proveedorId, fecha: m.fecha, monto, cuentaBancariaId: m.cuentaId, nota: `Verificado con el detalle de la transferencia: ${m.nota}` } })
      await prisma.aplicacionPago.create({ data: { pagoId: pago.id, documentoId: d.id, monto } })
      await prisma.conciliacion.create({ data: { movimientoId: m.id, tipoDestino: 'PAGO', destinoId: pago.id, monto } })
      await prisma.movimientoBanco.update({ where: { id: m.id }, data: { estado: 'CONCILIADO', proveedorId: m.proveedorId ?? d.proveedorId, categoria: m.categoria ?? 'Proveedores' } })
      usados.add(m.id)
      porDetalle++
    }

    // 2) Por monto y proveedor.
    for (const d of docs) {
      const supuesto = d.aplicaciones.length > 0 && d.aplicaciones.every((a) => (a.pago.nota ?? '').startsWith(SUPUESTO))
      const pagadoReal = d.aplicaciones.length > 0 && !supuesto
      if (pagadoReal) continue
      const nombre = compacto(d.proveedor.nombre)
      const candidatos = movs.filter((m) => Math.abs(m.cargo - d.total) <= 2 && !usados.has(m.id) && m.fecha.getTime() >= d.emision.getTime() - 10 * 86400000)
      const delProveedor = candidatos.filter((m) => m.proveedorId === d.proveedorId || mismoNombre(d.proveedor.nombre, m.contraparte))
      let m: (typeof movs)[number] | undefined = delProveedor[0] ?? (candidatos.length === 1 && !candidatos[0].proveedorId ? candidatos[0] : undefined)
      // Materia prima: el pago puede diferir un poco de la factura (anticipos, ajustes); se acepta hasta 1,5% con el mismo proveedor, a menos de 30 días de la factura.
      let aproximado = false
      if (!m && d.proveedor.tipo === 'MP') {
        m = movs.find((x) => !usados.has(x.id) && x.proveedorId === d.proveedorId && Math.abs(x.cargo - d.total) / d.total <= 0.015 && Math.abs(Date.parse(iso(x.fecha)) - Date.parse(iso(d.emision))) <= 30 * 86400000)
        aproximado = !!m
      }
      if (!m) continue
      if (aproximado) dudosas.push(`${d.proveedor.nombre} ${d.folio}: se asoció el pago de ${m.cargo} del ${iso(m.fecha)}, que difiere de la factura (${d.total})`)
      else if (!delProveedor.length) dudosas.push(`${d.proveedor.nombre} ${d.folio}: el pago de ${m.contraparte ?? 'otro destinatario'} calza por monto, no por nombre`)
      for (const a of d.aplicaciones) await prisma.pago.delete({ where: { id: a.pagoId } })
      const pago = await prisma.pago.create({
        data: { proveedorId: d.proveedorId, fecha: m.fecha, monto: d.total, cuentaBancariaId: m.cuentaId, nota: `Verificado con la cartola (doc. ${m.nDoc ?? 's/n'})` },
      })
      await prisma.aplicacionPago.create({ data: { pagoId: pago.id, documentoId: d.id, monto: d.total } })
      await prisma.conciliacion.create({ data: { movimientoId: m.id, tipoDestino: 'PAGO', destinoId: pago.id, monto: Math.min(d.total, m.cargo) } })
      await prisma.movimientoBanco.update({ where: { id: m.id }, data: { estado: 'CONCILIADO', proveedorId: m.proveedorId ?? d.proveedorId, categoria: m.categoria ?? 'Proveedores' } })
      usados.add(m.id)
      if (supuesto) verificadas++
      else nuevas++
    }
    // 3) Pagos que no calzan exacto: una factura pagada en dos partes, o cubierta por un reembolso a Manuel Errázuriz Lagos
    //    (que paga con su plata y se le devuelve, a veces agrupando meses). Se marcan pagadas, con un aviso de la diferencia.
    const REEMBOLSO = [
      { proveedor: 'entel', clave: 'entel' },
      { proveedor: 'bciseguros', clave: 'seguro bci' },
      { proveedor: 'combustiblessanluis', clave: 'petroleo' },
    ]
    const pendientes = docs.filter((d) => d.aplicaciones.length === 0 || d.aplicaciones.every((a) => (a.pago.nota ?? '').startsWith(SUPUESTO)))
    const pendientesReales = pendientes.filter((d) => d.aplicaciones.length === 0)
    const aplicar = async (d: (typeof docs)[number], partes: { m: (typeof movs)[number]; monto: number }[], aviso: string, conciliar: boolean) => {
      for (const p of partes) {
        const pago = await prisma.pago.create({ data: { proveedorId: d.proveedorId, fecha: p.m.fecha, monto: p.monto, cuentaBancariaId: p.m.cuentaId, nota: `${AVISO}: ${aviso}` } })
        await prisma.aplicacionPago.create({ data: { pagoId: pago.id, documentoId: d.id, monto: p.monto } })
        await prisma.conciliacion.create({ data: { movimientoId: p.m.id, tipoDestino: 'PAGO', destinoId: pago.id, monto: p.monto } })
        if (conciliar) await prisma.movimientoBanco.update({ where: { id: p.m.id }, data: { estado: 'CONCILIADO', proveedorId: p.m.proveedorId ?? d.proveedorId, categoria: p.m.categoria ?? 'Proveedores' } })
        usados.add(p.m.id)
      }
      aproximadas++
      avisos.push(`${d.proveedor.nombre} ${d.folio}: ${aviso}`)
    }
    let aproximadas = 0
    const avisos: string[] = []
    // 3a) Dos pagos al mismo proveedor que suman (casi) la factura.
    for (const d of pendientesReales) {
      const nombre = compacto(d.proveedor.nombre)
      const cand = movs.filter((x) => !usados.has(x.id) && mismoNombre(d.proveedor.nombre, x.contraparte) && x.fecha.getTime() >= d.emision.getTime() - 20 * 86400000 && x.cargo < d.total)
      let par: [(typeof movs)[number], (typeof movs)[number]] | null = null
      for (let i = 0; i < cand.length && !par; i++) for (let j = i + 1; j < cand.length; j++) {
        if (Math.abs(cand[i].cargo + cand[j].cargo - d.total) / d.total <= 0.02) { par = [cand[i], cand[j]]; break }
      }
      if (!par) continue
      const dif = par[0].cargo + par[1].cargo - d.total
      const primero = Math.min(par[0].cargo, d.total)
      await aplicar(d, [{ m: par[0], monto: primero }, { m: par[1], monto: d.total - primero }], `pagada en dos partes (${par[0].cargo} + ${par[1].cargo}); ${dif === 0 ? 'calza exacto' : 'difiere en ' + Math.abs(dif) + ' de la factura (' + d.total + ')'}`, true)
    }
    // 3b) Reembolsos a Manuel Errázuriz Lagos que dicen de qué eran (Entel, seguro BCI, petróleo).
    const reembolsos = movs.filter((x) => !usados.has(x.id) && x.nota && compacto(x.contraparte ?? '').includes('ERRAZURIZLAGOS'))
    const pares: { d: (typeof docs)[number]; m: (typeof movs)[number]; dif: number }[] = []
    for (const d of pendientesReales) {
      if (d.aplicaciones.length) continue
      const regla = REEMBOLSO.find((r) => compacto(d.proveedor.nombre).includes(r.proveedor.toUpperCase()))
      if (!regla) continue
      for (const x of reembolsos) {
        if (!compacto(x.nota!).includes(compacto(regla.clave)) || x.fecha.getTime() < d.emision.getTime() - 10 * 86400000 || x.cargo < d.total * 0.98) continue
        pares.push({ d, m: x, dif: Math.abs(x.cargo - d.total) })
      }
    }
    pares.sort((a, b) => a.dif - b.dif)
    const docsHechos = new Set<number>()
    for (const p of pares) {
      const agrupado = p.m.cargo > p.d.total * 1.5
      if (docsHechos.has(p.d.id) || (!agrupado && usados.has(p.m.id))) continue
      docsHechos.add(p.d.id)
      const aviso = agrupado
        ? `cubierta por el reembolso agrupado a M. Errázuriz Lagos de ${p.m.cargo} del ${iso(p.m.fecha)} («${p.m.nota}»); el monto de la factura (${p.d.total}) no se puede verificar`
        : `cubierta por el reembolso a M. Errázuriz Lagos de ${p.m.cargo} del ${iso(p.m.fecha)} («${p.m.nota}»); difiere en ${p.dif} de la factura (${p.d.total})`
      await aplicar(p.d, [{ m: p.m, monto: p.d.total }], aviso, !agrupado)
    }
    await auditar(req.usuario, 'Documento', null, 'MODIFICAR', null, { conciliadas: verificadas + nuevas + porDetalle + aproximadas })
    return { verificadas, nuevas, porDetalle, aproximadas, avisos, dudosas }
  })
}
