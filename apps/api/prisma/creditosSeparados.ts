// Los tres créditos de Bancoestado quedan registrados por separado (monto, cuotas pagadas, término), pero el flujo sigue contando
// la transferencia mensual de $1,2 MM desde el Bice con que se pagan, y la caja parte solo con el Bice (la cuenta de Bancoestado
// se registra sin sumar). Marca `creditosSeparadosCargados`.
import type { PrismaClient } from '@prisma/client'

export async function cargarCreditosSeparados(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'creditosSeparadosCargados' } })) return
  const totales: Record<string, number> = { '38135425': 74, '38135532': 74, '38135641': 35 }
  for (const [n, total] of Object.entries(totales)) {
    await prisma.deuda.updateMany({ where: { acreedor: `Bancoestado crédito ${n}` }, data: { cuotasTotal: total, cuotasPagadas: 21, enFlujo: false } })
  }
  await prisma.cuentaBancaria.updateMany({ where: { nombre: 'Bancoestado' }, data: { enFlujo: false } })
  // La línea de $1,2 MM del presupuesto vuelve a ser la que paga la deuda en el flujo: sale del Bice hacia la cuenta de Bancoestado.
  const antigua = await prisma.deuda.findFirst({ where: { acreedor: 'Bancoestado' } })
  if (antigua) {
    await prisma.gastoDriver.updateMany({ where: { deudaId: antigua.id }, data: { activo: true, diaPago: 3, nota: 'Transferencia mensual desde el Bice a la cuenta de Bancoestado que paga los tres créditos (cuotas del día 5, hoy $1.190.393).' } })
    await prisma.deuda.update({ where: { id: antigua.id }, data: { cuota: 1200000, nota: 'Registro del pago mensual desde el Bice. El detalle está en los tres créditos individuales.' } })
  }
  await prisma.parametro.create({ data: { clave: 'creditosSeparadosCargados', valor: '1', descripcion: 'Marca interna: créditos de Bancoestado separados del flujo' } })
}
