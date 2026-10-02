// La devolución de IVA exportador pasa de un monto fijo ($1.500.000 al mes) a calcularse: IVA crédito de las compras de cada mes,
// que el SII devuelve el mes siguiente (en 2026 llegó entre el 13 y el 27 de cada mes: $1,3 a $2,7 MM). Se puede ajustar cada mes
// con la devolución esperada y su fecha. Se carga una sola vez (marca `ivaCalculadoCargado`) y solo si el modo seguía en "fijo".
import type { PrismaClient } from '@prisma/client'

export async function cargarIVACalculado(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'ivaCalculadoCargado' } })) return
  await prisma.parametro.updateMany({
    where: { clave: 'devolucionIVAModo', valor: 'fijo' },
    data: { valor: 'calculado', descripcion: 'calculado = IVA crédito de las compras de cada mes, devuelto "rezagoIVAMeses" después (× devolucionIVAPct); fijo = monto fijo mensual (devolucionIVAMensual)' },
  })
  await prisma.parametro.updateMany({
    where: { clave: 'rezagoIVAMeses' },
    data: { descripcion: 'Meses entre las compras y la devolución de IVA (modo calculado). En 2026 la devolución llegó ~1 mes después' },
  })
  if (!(await prisma.parametro.findUnique({ where: { clave: 'devolucionIVAPct' } }))) {
    await prisma.parametro.create({ data: { clave: 'devolucionIVAPct', valor: '100', descripcion: '% del IVA crédito que se recupera (modo calculado); bájalo si parte de las compras no da derecho a devolución' } })
  }
  await prisma.parametro.create({ data: { clave: 'ivaCalculadoCargado', valor: '1', descripcion: 'Marca interna: devolución de IVA calculada' } })
}
