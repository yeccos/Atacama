// WHS 30% a la OC con los pesos reales de la cartola: los US$6.762 llegaron el 30-09 y se vendieron el 1-10 por $6.559.140
// (dólar $970), no a los $950 del presupuesto. Se carga una sola vez (marca `cobrosRealesCargados`).
import type { PrismaClient } from '@prisma/client'

export async function cargarCobrosReales(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'cobrosRealesCargados' } })) return
  const hitos = await prisma.hitoCobro.findMany({ where: { evento: 'OC', estado: 'COBRADO', montoUsdCent: 676200, clpRecibido: null } })
  for (const h of hitos) await prisma.hitoCobro.update({ where: { id: h.id }, data: { clpRecibido: 6559140 } })
  await prisma.parametro.create({ data: { clave: 'cobrosRealesCargados', valor: '1', descripcion: 'Marca interna: WHS 30% con los pesos reales de la cartola' } })
}
