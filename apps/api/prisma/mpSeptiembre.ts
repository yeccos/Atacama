// Compras de materia prima de septiembre, ya pagadas (cartola del Bice): SQM 11-09 y 25-09, Albemarle 29-09.
// Quedan como partidas con el nombre de la línea del presupuesto, así se suman a "MP SQM" y "MP Albemarle" en la columna
// de septiembre del flujo. Se carga una sola vez (marca `mpSeptiembreCargada`).
import type { PrismaClient } from '@prisma/client'

const PAGOS = [
  { fecha: '2026-09-11', concepto: 'MP SQM', monto: -11460127, nota: 'Pago a SQM Industrial, OC 47 (cartola Bice)' },
  { fecha: '2026-09-25', concepto: 'MP SQM', monto: -11809127, nota: 'Pago a SQM Industrial (cartola Bice)' },
  { fecha: '2026-09-29', concepto: 'MP Albemarle', monto: -4595631, nota: 'Pago a Albemarle (cartola Bice)' },
]

export async function cargarMPDeSeptiembre(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'mpSeptiembreCargada' } })) return
  for (const p of PAGOS) {
    await prisma.partidaFlujo.create({ data: { fecha: new Date(p.fecha + 'T00:00:00.000Z'), concepto: p.concepto, monto: p.monto, nota: p.nota } })
  }
  await prisma.parametro.create({ data: { clave: 'mpSeptiembreCargada', valor: '1', descripcion: 'Marca interna: pagos de MP de septiembre (SQM y Albemarle) como partidas' } })
}
