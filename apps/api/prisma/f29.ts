// F29 de agosto 2026 (pagado el 16-09 por $555.879): PPM de 1% sobre las ventas ($198.060) más la retención de impuesto único de
// trabajadores ($357.819). Son impuestos que se pagan aparte de la devolución de IVA. Se cargan como parámetros del flujo.
// Se carga una sola vez (marca `f29Cargado`).
import type { PrismaClient } from '@prisma/client'

export async function cargarParametrosF29(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'f29Cargado' } })) return
  const nuevos: [string, string, string][] = [
    ['ppmPct', '1', 'Tasa de PPM (% de las ventas del mes, F29 código 115). Se paga con el F29 el mes siguiente'],
    ['retencionImpuestoUnico', '357819', 'Retención de impuesto único de trabajadores (art. 74 N°1, F29 código 048), $ al mes. Valor del F29 de agosto 2026'],
    ['ppmVentasMesPrevio', '21945000', 'Exportaciones de septiembre ($), base del PPM que se paga en octubre: el contenedor de DBC (US$23.100 al dólar del presupuesto). Ajústalo con las ventas reales de septiembre'],
    ['diaPagoF29', '15', 'Flujo semanal: día del mes en que se paga el F29 (PPM y retención). En 2026 se pagó entre el 9 y el 18'],
  ]
  for (const [clave, valor, descripcion] of nuevos) {
    if (!(await prisma.parametro.findUnique({ where: { clave } }))) await prisma.parametro.create({ data: { clave, valor, descripcion } })
  }
  await prisma.parametro.create({ data: { clave: 'f29Cargado', valor: '1', descripcion: 'Marca interna: parámetros del F29 (PPM y retención)' } })
}
