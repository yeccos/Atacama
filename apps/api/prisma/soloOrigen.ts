// Europa (NADARRA) solo puede llevar sal de SQM por el límite de arsénico; el resto de los países (límite 0,1) admite
// cualquier origen y se puede mezclar. Se carga una sola vez (marca `soloOrigenCargado`).
import type { PrismaClient } from '@prisma/client'

export async function marcarSoloOrigen(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'soloOrigenCargado' } })) return
  await prisma.cliente.updateMany({ where: { nombre: { contains: 'NADARRA' }, origenId: { not: null } }, data: { soloOrigen: true } })
  await prisma.parametro.create({ data: { clave: 'soloOrigenCargado', valor: '1', descripcion: 'Marca interna: NADARRA solo con MP de su origen (SQM)' } })
}
