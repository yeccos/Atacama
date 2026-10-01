// Cuenta corriente del Bice donde se mueve la operación: se le anota el número para reconocerla en las cartolas.
// Se carga una sola vez (marca `cuentaBiceCargada`).
import type { PrismaClient } from '@prisma/client'

export async function cargarCuentaBice(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'cuentaBiceCargada' } })) return
  const existente = await prisma.cuentaBancaria.findFirst({ where: { OR: [{ numero: '06-01766-5' }, { nombre: 'Bice CLP' }] } })
  if (existente) await prisma.cuentaBancaria.update({ where: { id: existente.id }, data: { numero: '06-01766-5' } })
  else await prisma.cuentaBancaria.create({ data: { nombre: 'Bice CLP', banco: 'Bice', moneda: 'CLP', numero: '06-01766-5', saldoInicial: 0 } })
  await prisma.parametro.create({ data: { clave: 'cuentaBiceCargada', valor: '1', descripcion: 'Marca interna: cuenta corriente Bice identificada por su número' } })
}
