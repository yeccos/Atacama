// El saldo de caja con que parte el flujo es el real al 1 de octubre de 2026: $2.538.855 en la cuenta Bice en pesos (cartola
// provisoria). La base nueva traía $10.102.270 (el saldo del Excel al 30-09). Solo se corrige si la cuenta todavía tiene un
// saldo anterior al 1 de octubre: si ya se importaron cartolas más recientes, no se toca. Marca `saldoCajaOctubreCargado`.
import type { PrismaClient } from '@prisma/client'

export async function cargarSaldoCajaOctubre(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'saldoCajaOctubreCargado' } })) return
  const corte = new Date('2026-10-01T00:00:00.000Z')
  const cuentas = await prisma.cuentaBancaria.findMany({ where: { OR: [{ numero: '06-01766-5' }, { nombre: 'Bice CLP' }] } })
  for (const c of cuentas) {
    if (!c.fechaSaldoInicial || c.fechaSaldoInicial < corte) {
      await prisma.cuentaBancaria.update({ where: { id: c.id }, data: { saldoInicial: 2538855, fechaSaldoInicial: corte } })
    }
  }
  // Las demás cuentas en pesos (Bancoestado) sin cartola no suman: el saldo de caja es el del Bice.
  await prisma.cuentaBancaria.updateMany({ where: { moneda: 'CLP', nombre: { not: 'Bice CLP' }, fechaSaldoInicial: null }, data: { saldoInicial: 0 } })
  await prisma.parametro.create({ data: { clave: 'saldoCajaOctubreCargado', valor: '1', descripcion: 'Marca interna: saldo de caja real al 1-10-2026 ($2.538.855)' } })
}
