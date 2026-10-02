// El costo de cada camión se registra con el flete incluido (neto, 28 t): Albemarle cobra el flete aparte (Transportes Mendoza) y
// se suma al valor del camión; SQM lo incluye en su factura. Marca `costoCamionConFleteCargado`.
import type { PrismaClient } from '@prisma/client'

export async function cargarCostoCamionConFlete(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'costoCamionConFleteCargado' } })) return
  const alb = await prisma.origenMP.findFirst({ where: { nombre: 'Albemarle' } })
  if (alb) {
    const total = (alb.valorCamionCLP ?? 0) + (alb.fleteCamionCLP ?? 0)
    await prisma.origenMP.update({
      where: { id: alb.id },
      data: { valorCamionCLP: total, fleteCamionCLP: 0, nota: `Camión de 28 t con el flete incluido: $${(alb.valorCamionCLP ?? 0).toLocaleString('es-CL')} del camión (Fac 8749) + $${(alb.fleteCamionCLP ?? 0).toLocaleString('es-CL')} de flete, que Albemarle cobra aparte (Transportes Mendoza, Fac 6656).` },
    })
  }
  await prisma.origenMP.updateMany({ where: { nombre: 'SQM' }, data: { fleteCamionCLP: 0, nota: 'Obligatorio para Europa. El flete viene incluido en la factura (Fac 92867).' } })
  await prisma.parametro.create({ data: { clave: 'costoCamionConFleteCargado', valor: '1', descripcion: 'Marca interna: costo por camión con flete incluido' } })
}
