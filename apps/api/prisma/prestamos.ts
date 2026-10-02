// Según el dueño: Manuel Errázuriz S. recibe sueldo desde septiembre 2026 (lo anterior fueron devoluciones de préstamos)
// y los pagos a Victzarick, Concha, Noguera y familiares también lo son. Se carga una sola vez (marca `prestamosCargados`).
import type { PrismaClient } from '@prisma/client'

const PATRONES = ['DAVID NOGUERA', 'CARLOS ERRAZURIZ SAAVEDRA', 'XIMENA SAAVEDRA', 'MARIA EUGENIA ERRAZURIZ']

export async function cargarDevolucionesDePrestamos(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'prestamosCargados' } })) return
  await prisma.empleado.updateMany({ where: { nombre: { contains: 'Errázuriz S' } }, data: { fechaIngreso: new Date('2026-09-01T00:00:00.000Z') } })
  for (const patron of PATRONES) {
    if (!(await prisma.reglaCartola.findFirst({ where: { patron } }))) {
      await prisma.reglaCartola.create({ data: { patron, categoria: 'Devolución de préstamos' } })
    }
  }
  await prisma.parametro.create({ data: { clave: 'prestamosCargados', valor: '1', descripcion: 'Marca interna: reglas de devolución de préstamos y fecha de ingreso de Manuel Errázuriz S.' } })
}
