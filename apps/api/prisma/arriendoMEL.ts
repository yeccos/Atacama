// Manuel Errázuriz L. paga el arriendo de la bodega y la empresa se lo reembolsa (línea "Arriendo bodega" del presupuesto):
// las facturas de Covintec no son una deuda de la empresa con el proveedor. Se carga una sola vez (marca `arriendoMELCargado`).
import type { PrismaClient } from '@prisma/client'

export async function marcarArriendoPagadoPorMEL(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'arriendoMELCargado' } })) return
  const prov = await prisma.proveedor.findFirst({ where: { rut: '76.927.748-K' } })
  if (prov) {
    for (const d of await prisma.documento.findMany({ where: { proveedorId: prov.id }, include: { aplicaciones: true } })) {
      if (d.aplicaciones.length > 0) continue
      const pago = await prisma.pago.create({
        data: { proveedorId: prov.id, fecha: d.emision, monto: d.total, nota: 'Supuesto pagado por Manuel Errázuriz L., a quien la empresa se lo reembolsa (Arriendo bodega)' },
      })
      await prisma.aplicacionPago.create({ data: { pagoId: pago.id, documentoId: d.id, monto: d.total } })
    }
  }
  await prisma.parametro.create({ data: { clave: 'arriendoMELCargado', valor: '1', descripcion: 'Marca interna: facturas del arriendo marcadas como pagadas por Manuel Errázuriz L.' } })
}
