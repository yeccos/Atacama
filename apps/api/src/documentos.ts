// Facturas recibidas: qué se debe a cada proveedor y qué pagos de la cartola las cubren.
import { compacto, GRUPO_INSUMOS, GRUPO_MP, grupoGasto, GRUPO_EXPORTACION } from '@atacama/core'
import type { FastifyInstance } from 'fastify'
import { auditar } from './crud'
import { prisma } from './db'

const iso = (d: Date) => d.toISOString().slice(0, 10)
const SUPUESTO = 'Supuesto'

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
  return docs.map((d) => {
    const pagado = d.aplicaciones.reduce((s, a) => s + a.monto, 0)
    const supuesto = d.aplicaciones.length > 0 && d.aplicaciones.every((a) => (a.pago.nota ?? '').startsWith(SUPUESTO))
    const total = signo(d.tipo) * d.total
    const saldo = total - signo(d.tipo) * pagado
    const estado: EstadoDoc = Math.abs(saldo) < 1 ? (supuesto ? 'SUPUESTA' : 'PAGADA') : pagado > 0 ? 'PARCIAL' : 'PENDIENTE'
    return {
      id: d.id, proveedorId: d.proveedorId, proveedor: d.proveedor.nombre, tipo: d.tipo, folio: d.folio,
      emision: iso(d.emision), vencimiento: d.vencimiento ? iso(d.vencimiento) : null,
      total, pagado: signo(d.tipo) * pagado, saldo, estado, enPresupuesto: enPresupuesto.has(d.proveedorId), grupo: enPresupuesto.get(d.proveedorId) ?? null,
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
    const usados = new Set((await prisma.conciliacion.findMany({ where: { tipoDestino: 'PAGO' } })).map((c) => c.movimientoId))
    const movs = await prisma.movimientoBanco.findMany({ where: { cargo: { gt: 0 }, cuenta: { moneda: 'CLP' } }, orderBy: { fecha: 'asc' } })
    let verificadas = 0
    let nuevas = 0
    let porDetalle = 0
    const dudosas: string[] = []
    // 1) Por el detalle que escribió quien pagó ("Fact 129683"): el número de factura manda aunque el monto no calce
    //    (un pago puede cubrir varias facturas o una parte).
    const folioDe = (nota: string | null) => [...(nota ?? '').matchAll(/\b(?:fac|fact|factura|fc)\w*\.?\s*(?:n[°º]?\s*)?(\d{2,9})/gi)].map((x) => x[1])
    for (const d of docs) {
      const yaPagado = d.aplicaciones.length > 0 && !d.aplicaciones.every((a) => (a.pago.nota ?? '').startsWith(SUPUESTO))
      if (yaPagado) continue
      const nombre = compacto(d.proveedor.nombre)
      const m = movs.find(
        (x) =>
          !usados.has(x.id) && folioDe(x.nota).includes(d.folio) &&
          (x.proveedorId === d.proveedorId || (x.contraparte && (compacto(x.contraparte).includes(nombre) || nombre.includes(compacto(x.contraparte).slice(0, 8))))),
      )
      if (!m) continue
      for (const a of d.aplicaciones) await prisma.pago.delete({ where: { id: a.pagoId } })
      const monto = Math.min(d.total, m.cargo)
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
      const candidatos = movs.filter((m) => m.cargo === d.total && !usados.has(m.id) && m.fecha.getTime() >= d.emision.getTime() - 10 * 86400000)
      const delProveedor = candidatos.filter((m) => m.proveedorId === d.proveedorId || (m.contraparte && (compacto(m.contraparte).includes(nombre) || nombre.includes(compacto(m.contraparte)))))
      let m: (typeof movs)[number] | undefined = delProveedor[0] ?? (candidatos.length === 1 && !candidatos[0].proveedorId ? candidatos[0] : undefined)
      // Materia prima: el pago puede diferir un poco de la factura (anticipos, ajustes); se acepta hasta 1,5% con el mismo proveedor, cerca de la fecha.
      let aproximado = false
      if (!m && d.proveedor.tipo === 'MP') {
        m = movs.find((x) => !usados.has(x.id) && x.proveedorId === d.proveedorId && Math.abs(x.cargo - d.total) / d.total <= 0.015 && Math.abs(Date.parse(iso(x.fecha)) - Date.parse(iso(d.emision))) <= 15 * 86400000)
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
    await auditar(req.usuario, 'Documento', null, 'MODIFICAR', null, { conciliadas: verificadas + nuevas + porDetalle })
    return { verificadas, nuevas, porDetalle, dudosas }
  })
}
