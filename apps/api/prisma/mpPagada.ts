// SQM y Albemarle ya están pagados para los pedidos de octubre 2026. Se carga una sola vez (marca `mpPagadaCargada`).
import type { PrismaClient } from '@prisma/client'

export async function marcarMPPagada(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'mpPagadaCargada' } })) return
  if (!(await prisma.parametro.findUnique({ where: { clave: 'mpPagadaHasta' } }))) {
    await prisma.parametro.create({
      data: {
        clave: 'mpPagadaHasta', valor: '2026-10',
        descripcion: "Mes (aaaa-mm) hasta el cual la materia prima ya está pagada: sigue siendo costo del presupuesto, pero no una salida futura del flujo. Súbelo cuando pagues más pedidos.",
      },
    })
  }
  await prisma.parametro.create({ data: { clave: 'mpPagadaCargada', valor: '1', descripcion: 'Marca interna: materia prima de octubre 2026 marcada como pagada' } })
}
