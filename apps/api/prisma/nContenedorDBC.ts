// El embarque de DBC Ingredients de octubre va en el contenedor 117. Se corre una sola vez (marca `contenedorDBC117Cargado`).
import type { PrismaClient } from '@prisma/client'

export async function cargarContenedorDBC(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'contenedorDBC117Cargado' } })) return
  const dbc = await prisma.cliente.findFirst({ where: { nombre: { startsWith: 'DBC' } } })
  if (dbc) {
    await prisma.embarque.updateMany({ where: { clienteId: dbc.id, versionId: null, nContenedor: null, fETDEst: { gte: new Date('2026-10-01T00:00:00.000Z'), lt: new Date('2026-11-01T00:00:00.000Z') } }, data: { nContenedor: '117' } })
  }
  await prisma.parametro.create({ data: { clave: 'contenedorDBC117Cargado', valor: '1', descripcion: 'Marca interna: contenedor 117 asignado al embarque de DBC de octubre' } })
}
