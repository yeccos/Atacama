// El bono de descarga es de $35.000 por persona y descargan 2 personas por camión: $70.000 por camión.
// Se carga una sola vez (marca `bonoDescargaCargado`); si el usuario ya lo cambió a otro valor, no se toca.
import type { PrismaClient } from '@prisma/client'

export async function cargarBonoDescarga(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'bonoDescargaCargado' } })) return
  await prisma.parametro.updateMany({
    where: { clave: 'bonoDescargaPorCamion', valor: '35000' },
    data: { valor: '70000', descripcion: 'Bono de descarga líquido por camión (CLP): $35.000 por persona × 2 personas que descargan' },
  })
  await prisma.parametro.create({ data: { clave: 'bonoDescargaCargado', valor: '1', descripcion: 'Marca interna: bono de descarga a $70.000 por camión' } })
}
