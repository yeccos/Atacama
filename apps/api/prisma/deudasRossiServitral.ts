// Rossi y Servitral no tienen una cuota fija: se pagan con lo facturado cada mes, que ya está en los costos de exportación.
// Se deja anotada la deuda (sin cuota) hasta que se conozca su saldo. Se carga una sola vez (marca `deudasRossiServitralCargadas`).
import type { PrismaClient } from '@prisma/client'

export async function quitarCuotasRossiServitral(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'deudasRossiServitralCargadas' } })) return
  await prisma.deuda.updateMany({
    where: { acreedor: { in: ['Rossi', 'Servitral'] } },
    data: { cuota: null, nota: 'Saldo por definir. No es una cuota: se paga con lo facturado cada mes, que ya está en los costos de exportación del presupuesto.' },
  })
  await prisma.parametro.create({ data: { clave: 'deudasRossiServitralCargadas', valor: '1', descripcion: 'Marca interna: Rossi y Servitral sin cuota fija' } })
}
