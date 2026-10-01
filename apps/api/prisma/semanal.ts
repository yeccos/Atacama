// DBC es FOB (confirmado) y los parámetros del flujo semanal. Se carga una sola vez (marca `semanalDBCFobCargado`)
// y no pisa lo que el usuario haya editado.
import type { PrismaClient } from '@prisma/client'

export async function completarSemanalYDBC(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'semanalDBCFobCargado' } })) return

  // DBC Ingredients es FOB: no paga flete marítimo, pero sí transporte interno y aduana.
  const fob = await prisma.incoterm.findUnique({ where: { codigo: 'FOB' } })
  if (fob) {
    await prisma.cliente.updateMany({ where: { nombre: 'DBC Ingredients', incotermId: null }, data: { incotermId: fob.id, nota: 'Incoterm FOB confirmado. Forma de pago por confirmar.' } })
  }

  const parametros: [string, string, string][] = [
    ['diaPagoFijos', '10', 'Flujo semanal: día del mes en que se pagan los gastos fijos'],
    ['diaPagoPrevired', '10', 'Flujo semanal: día del mes en que se paga Previred'],
    ['diaPagoCuotas', '10', 'Flujo semanal: día del mes en que se pagan las cuotas de deudas'],
    ['diaDevolucionIVA', '20', 'Flujo semanal: día del mes en que llega la devolución de IVA'],
  ]
  for (const [clave, valor, descripcion] of parametros) {
    if (!(await prisma.parametro.findUnique({ where: { clave } }))) await prisma.parametro.create({ data: { clave, valor, descripcion } })
  }

  await prisma.parametro.create({
    data: { clave: 'semanalDBCFobCargado', valor: '1', descripcion: 'Marca interna: DBC FOB y parámetros del flujo semanal ya cargados' },
  })
}
