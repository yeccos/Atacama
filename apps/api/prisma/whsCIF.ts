// WHS Process / Global Supply Mexico se vende CIF: el flete marítimo (tarifa de su destino) pasa a ser costo de la venta. Marca `whsCIFCargado`.
import type { PrismaClient } from '@prisma/client'

export async function cargarWHSCIF(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'whsCIFCargado' } })) return
  const cif = await prisma.incoterm.findFirst({ where: { codigo: 'CIF' } })
  if (cif) await prisma.cliente.updateMany({ where: { nombre: { contains: 'WHS' }, incotermId: null }, data: { incotermId: cif.id } })
  await prisma.parametro.create({ data: { clave: 'whsCIFCargado', valor: '1', descripcion: 'Marca interna: WHS con incoterm CIF' } })
}
