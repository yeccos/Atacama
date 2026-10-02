// El arriendo de la bodega se paga el día 5 de cada mes. Se carga una sola vez (marca `diaArriendoCargado`).
import type { PrismaClient } from '@prisma/client'

export async function cargarDiaArriendo(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'diaArriendoCargado' } })) return
  await prisma.gastoDriver.updateMany({ where: { nombre: { contains: 'Arriendo' }, diaPago: null }, data: { diaPago: 5 } })
  await prisma.parametro.create({ data: { clave: 'diaArriendoCargado', valor: '1', descripcion: 'Marca interna: arriendo de la bodega se paga el día 5' } })
}
