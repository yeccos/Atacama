// Los tres créditos de Bancoestado (FOGAPE, otorgados el 19-11-2024; cuotas el día 5, con pago automático desde la cuenta
// corriente 34000013490), leídos del portal el 2-10-2026, y el saldo de esa cuenta. Reemplazan la cuota única de $1,2 MM del
// presupuesto: hoy suman $1.190.393 al mes (con ligeras variaciones de una cuota a otra). Marca `creditosBancoestadoCargados`.
import type { PrismaClient } from '@prisma/client'

const CREDITOS = [
  { n: '38135425', producto: 'Crédito FOGAPE Reactiva (renegociado, mora hasta 89 días)', monto: 3264554, saldo: 2526916, cuota: 58088, cuotas: 74, fin: '2031-02-01' },
  { n: '38135532', producto: 'Crédito FOGAPE Chile Apoya (renegociado)', monto: 50000000, saldo: 39066316, cuota: 920968, cuotas: 74, fin: '2031-02-01' },
  { n: '38135641', producto: 'Crédito renegociado (mora hasta 89 días, sin garantía)', monto: 6071222, saldo: 2729303, cuota: 211337, cuotas: 35, fin: '2027-11-01' },
]

export async function cargarCreditosBancoestado(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'creditosBancoestadoCargados' } })) return
  const antiguo = await prisma.deuda.findFirst({ where: { acreedor: 'Bancoestado' } })
  const proveedorId = antiguo?.proveedorId ?? null
  for (const c of CREDITOS) {
    await prisma.deuda.create({
      data: {
        acreedor: `Bancoestado crédito ${c.n}`, proveedorId, moneda: 'CLP', montoOriginal: c.monto, saldo: c.saldo, cuota: c.cuota,
        inicio: new Date('2025-01-06T00:00:00.000Z'), fin: new Date(c.fin + 'T00:00:00.000Z'),
        nota: `${c.producto}. ${c.cuotas} cuotas desde el 06-01-2025; al 2-10-2026 van 21 pagadas y ninguna vencida. Próxima cuota el 05-10-2026. Pago automático desde la cuenta corriente 34000013490.`,
      },
    })
  }
  // La cuota única de $1,2 MM del presupuesto queda reemplazada por los tres créditos.
  if (antiguo) {
    await prisma.gastoDriver.updateMany({ where: { deudaId: antiguo.id }, data: { activo: false, nota: 'Reemplazada por los tres créditos de Bancoestado (ver Deudas).' } })
    await prisma.deuda.update({ where: { id: antiguo.id }, data: { cuota: null, nota: 'Reemplazada por los tres créditos individuales de Bancoestado.' } })
  }
  // Las cuotas se pagan el día 5.
  await prisma.parametro.upsert({
    where: { clave: 'diaPagoCuotas' },
    create: { clave: 'diaPagoCuotas', valor: '5', descripcion: 'Día del mes en que se pagan las cuotas de deudas (Bancoestado: día 5)' },
    update: { valor: '5' },
  })
  // Saldo de la cuenta corriente de Bancoestado.
  await prisma.cuentaBancaria.updateMany({
    where: { nombre: 'Bancoestado', banco: 'Bancoestado' },
    data: { numero: '34000013490', saldoInicial: 2054204, fechaSaldoInicial: new Date('2026-10-02T00:00:00.000Z') },
  })
  await prisma.parametro.create({ data: { clave: 'creditosBancoestadoCargados', valor: '1', descripcion: 'Marca interna: créditos y saldo de Bancoestado cargados' } })
}
