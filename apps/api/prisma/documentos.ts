// Carga las 61 facturas de agosto y septiembre 2026 como documentos de proveedores. Se carga una sola vez (marca
// `facturasComoDocumentosCargadas`). Según el dueño, se suponen pagadas las de agosto o antes; las de septiembre quedan
// pendientes hasta que una cartola muestre su pago (Facturas recibidas → Conciliar con cartolas).
import type { PrismaClient } from '@prisma/client'
import { FACTURAS_RECIBIDAS } from './facturasData'

const f = (iso: string) => new Date(iso + 'T00:00:00.000Z')
const sumarDias = (iso: string, dias: number) => new Date(f(iso).getTime() + dias * 86400000)

export async function cargarFacturasComoDocumentos(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'facturasComoDocumentosCargadas' } })) return
  for (const [rut, emisor, tipo, folio, emision, neto, exento, iva, total] of FACTURAS_RECIBIDAS) {
    let prov = await prisma.proveedor.findFirst({ where: { rut } })
    if (!prov) prov = await prisma.proveedor.create({ data: { rut, nombre: emisor.slice(0, 60) } }).catch(async () => (await prisma.proveedor.findFirst({ where: { nombre: emisor.slice(0, 60) } }))!)
    if (await prisma.documento.findFirst({ where: { proveedorId: prov.id, tipo, folio } })) continue
    const doc = await prisma.documento.create({
      data: { proveedorId: prov.id, tipo, folio, emision: f(emision), vencimiento: sumarDias(emision, prov.diasPago), neto, exento, iva, total },
    })
    if (tipo === 'FACTURA' && emision <= '2026-08-31') {
      const pago = await prisma.pago.create({
        data: { proveedorId: prov.id, fecha: sumarDias(emision, prov.diasPago), monto: total, nota: 'Supuesto pagado (factura de agosto o antes); se verifica con la cartola' },
      })
      await prisma.aplicacionPago.create({ data: { pagoId: pago.id, documentoId: doc.id, monto: total } })
    }
  }
  await prisma.parametro.create({ data: { clave: 'facturasComoDocumentosCargadas', valor: '1', descripcion: 'Marca interna: facturas de ago-sep 2026 cargadas como documentos' } })
}
