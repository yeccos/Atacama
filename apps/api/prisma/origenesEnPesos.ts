// Los proveedores de materia prima se compran en pesos: se registra el valor del último camión (neto, de 28 t) y su flete en vez de
// los dólares por tonelada. Albemarle: factura 8749 ($4.595.631 con IVA) y flete de Transportes Mendoza, factura 6656 ($2.194.170 con IVA).
// SQM: factura 92867 ($11.792.270 con IVA), sin flete aparte. Marca `origenesEnPesosCargados`.
import type { PrismaClient } from '@prisma/client'

export async function cargarOrigenesEnPesos(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'origenesEnPesosCargados' } })) return
  const neto = (conIva: number) => Math.round(conIva / 1.19)
  await prisma.origenMP.updateMany({ where: { nombre: 'Albemarle' }, data: { valorCamionCLP: neto(4595631), fleteCamionCLP: neto(2194170) } })
  await prisma.origenMP.updateMany({ where: { nombre: 'SQM' }, data: { valorCamionCLP: neto(11792270), fleteCamionCLP: 0 } })
  await prisma.parametro.create({ data: { clave: 'origenesEnPesosCargados', valor: '1', descripcion: 'Marca interna: orígenes de MP con valor del camión y flete en pesos' } })
}
