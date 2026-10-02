// La devolución de IVA llega, como fecha probable, el 25 de cada mes. Se carga una sola vez (marca `diaIVA25Cargado`) y solo
// si el parámetro seguía en 20 (el valor de origen).
import type { PrismaClient } from '@prisma/client'

export async function cargarDiaIVA25(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'diaIVA25Cargado' } })) return
  await prisma.parametro.updateMany({ where: { clave: 'diaDevolucionIVA', valor: '20' }, data: { valor: '25' } })
  await prisma.parametro.create({ data: { clave: 'diaIVA25Cargado', valor: '1', descripcion: 'Marca interna: devolución de IVA el 25 de cada mes' } })
}
