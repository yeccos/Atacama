// Las guías de despacho no son documentos de cobro (la factura llega aparte): se retiran de las facturas recibidas junto con
// los pagos que se les habían supuesto. Eran la guía 80 de Comercial Teca (la misma compra de la factura 243) y la guía 1395822
// de SQM (el camión de materia prima ya está en el plan de MP). Marca `guiasDespachoRetiradas`.
import type { PrismaClient } from '@prisma/client'

const GUIAS: { rut: string; folio: string }[] = [
  { rut: '78.252.401-1', folio: '80' },
  { rut: '79.947.100-0', folio: '1395822' },
]

export async function retirarGuiasDespacho(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'guiasDespachoRetiradas' } })) return
  for (const g of GUIAS) {
    const docs = await prisma.documento.findMany({ where: { folio: g.folio, proveedor: { rut: g.rut } }, include: { aplicaciones: true } })
    for (const d of docs) {
      for (const a of d.aplicaciones) {
        await prisma.aplicacionPago.delete({ where: { id: a.id } })
        const otras = await prisma.aplicacionPago.count({ where: { pagoId: a.pagoId } })
        if (otras === 0) {
          await prisma.conciliacion.deleteMany({ where: { tipoDestino: 'PAGO', destinoId: a.pagoId } })
          await prisma.pago.delete({ where: { id: a.pagoId } })
        }
      }
      await prisma.documento.delete({ where: { id: d.id } })
    }
  }
  await prisma.parametro.create({ data: { clave: 'guiasDespachoRetiradas', valor: '1', descripcion: 'Marca interna: guías de despacho retiradas de las facturas recibidas' } })
}
