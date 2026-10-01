// Cuenta corriente del Bice donde se mueve la operación: se le anota el número para reconocerla en las cartolas.
// Se carga una sola vez (marca `cuentaBiceCargada`).
import type { PrismaClient } from '@prisma/client'

export async function cargarCuentaBice(prisma: PrismaClient) {
  await cargarCuentaBiceUsd(prisma)
  if (await prisma.parametro.findUnique({ where: { clave: 'cuentaBiceCargada' } })) return
  const existente = await prisma.cuentaBancaria.findFirst({ where: { OR: [{ numero: '06-01766-5' }, { nombre: 'Bice CLP' }] } })
  if (existente) await prisma.cuentaBancaria.update({ where: { id: existente.id }, data: { numero: '06-01766-5' } })
  else await prisma.cuentaBancaria.create({ data: { nombre: 'Bice CLP', banco: 'Bice', moneda: 'CLP', numero: '06-01766-5', saldoInicial: 0 } })
  await prisma.parametro.create({ data: { clave: 'cuentaBiceCargada', valor: '1', descripcion: 'Marca interna: cuenta corriente Bice identificada por su número' } })
}

/** Cuenta en dólares del Bice (013-21-00430-6): donde llegan los pagos de los clientes antes de venderse en pesos. */
async function cargarCuentaBiceUsd(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'cuentaBiceUsdCargada' } })) return
  const existente = await prisma.cuentaBancaria.findFirst({ where: { OR: [{ numero: '013-21-00430-6' }, { nombre: 'Bice USD' }] } })
  if (existente) await prisma.cuentaBancaria.update({ where: { id: existente.id }, data: { numero: '013-21-00430-6' } })
  else await prisma.cuentaBancaria.create({ data: { nombre: 'Bice USD', banco: 'Bice', moneda: 'USD', numero: '013-21-00430-6', saldoInicial: 0 } })
  await prisma.parametro.create({ data: { clave: 'cuentaBiceUsdCargada', valor: '1', descripcion: 'Marca interna: cuenta en dólares del Bice identificada por su número' } })
}
