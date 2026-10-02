// Los pagos a Antyanir Victzarick y a Claudio Concha son por equipos nuevos (inversión), no devolución de préstamos.
// Se carga una sola vez (marca `equiposNuevosCargados`).
import type { PrismaClient } from '@prisma/client'

export async function cargarEquiposNuevos(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'equiposNuevosCargados' } })) return
  for (const patron of ['VICTZARICK', 'CLAUDIO CONCHA']) {
    const regla = await prisma.reglaCartola.findFirst({ where: { patron } })
    if (regla) await prisma.reglaCartola.update({ where: { id: regla.id }, data: { categoria: 'Equipos nuevos (inversión)' } })
    else await prisma.reglaCartola.create({ data: { patron, categoria: 'Equipos nuevos (inversión)' } })
  }
  await prisma.parametro.create({ data: { clave: 'equiposNuevosCargados', valor: '1', descripcion: 'Marca interna: pagos a Victzarick y Concha = equipos nuevos' } })
}
