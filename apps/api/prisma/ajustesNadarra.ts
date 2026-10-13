// Quita los ajustes manuales que quedaron sobre las líneas antiguas de cobros de NADARRA (30% a la OC / 70% contra BL, juntas):
// ahora cada contenedor tiene sus propias líneas y esos ajustes duplicaban el cobro. Se corre una sola vez (marca `ajustesNadarraRetirados`).
import type { PrismaClient } from '@prisma/client'

export async function retirarAjustesNadarra(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'ajustesNadarraRetirados' } })) return
  const nadarra = await prisma.cliente.findFirst({ where: { nombre: 'NADARRA' } })
  if (nadarra) {
    await prisma.ajusteFlujo.deleteMany({
      where: { clave: { in: [`cobro-${nadarra.id}-OC`, `cobro-${nadarra.id}-BL`] }, mes: { lt: '2027-01' } },
    })
  }
  await prisma.parametro.create({ data: { clave: 'ajustesNadarraRetirados', valor: '1', descripcion: 'Marca interna: ajustes viejos de cobros de NADARRA retirados' } })
}
