// Registra el camión de Albemarle pedido en octubre: llegó con guía de despacho, la factura sale ~30 días después y vence el 31-10.
// Queda "por pagar" para que el flujo lo pague el 31-10. Se corre una sola vez (marca `camionAlbemarleOctCargado`).
import type { PrismaClient } from '@prisma/client'

export async function cargarCamionAlbemarleOct(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'camionAlbemarleOctCargado' } })) return
  const origen = await prisma.origenMP.findFirst({ where: { nombre: 'Albemarle' } })
  if (origen) {
    const monto = Math.round(((origen.valorCamionCLP ?? 0) + (origen.fleteCamionCLP ?? 0)) * 1.19)
    await prisma.camionMP.create({
      data: {
        origenId: origen.id, fecha: new Date('2026-10-01T00:00:00.000Z'), guia: 'Guía de despacho (factura por emitir)',
        toneladasFacturadas: 28, toneladasRecibidas: 28, porPagar: true, montoEstimado: monto || null, vencimientoEst: new Date('2026-10-31T00:00:00.000Z'),
        nota: 'Camión pedido en octubre. Albemarle factura 30 días después de la guía. Verificar fecha y N° de guía, y las toneladas reales.',
      },
    })
  }
  await prisma.parametro.create({ data: { clave: 'camionAlbemarleOctCargado', valor: '1', descripcion: 'Marca interna: camión de Albemarle de octubre (por pagar) registrado' } })
}
