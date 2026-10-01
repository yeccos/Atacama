// Catálogo de antiaglomerantes. Se carga una sola vez (marca `antiaglomerantesCargados`), tanto en una
// base nueva como en una existente, sin pisar lo que el usuario haya editado después.
import type { PrismaClient } from '@prisma/client'

/** Pallets ya no es un gasto con driver: es un insumo de $20.766 por unidad, 1 por tonelada vendida. */
export async function completarInsumosConsumo(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'insumosConsumoCargados' } })) return

  const pallets = await prisma.insumo.findFirst({ where: { nombre: 'Pallets' } })
  if (pallets) {
    await prisma.insumo.update({ where: { id: pallets.id }, data: { costoUnitario: 20766, base: 'POR_TONELADA', cantidadPorBase: 1, unidad: 'pallet' } })
    await prisma.gastoDriver.updateMany({
      where: { nombre: 'Pallets', driver: 'POR_TONELADA' },
      data: { activo: false, nota: 'Reemplazado por el insumo Pallets ($20.766 por unidad, 1 por tonelada)' },
    })
  }
  // Sacos: el flujo al 30-09 los valora a $3.000 cada uno; falta cuántos lleva cada contenedor.
  await prisma.insumo.updateMany({ where: { nombre: 'Sacos', costoUnitario: null }, data: { costoUnitario: 3000 } })

  await prisma.parametro.create({
    data: { clave: 'insumosConsumoCargados', valor: '1', descripcion: 'Marca interna: insumos con consumo ya cargados' },
  })
}

export async function completarAntiaglomerantes(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'antiaglomerantesCargados' } })) return

  // El insumo que ya existía como "Dióxido de silicio (antiaglomerante)" pasa a ser el primero del catálogo.
  const previo = await prisma.insumo.findFirst({ where: { nombre: 'Dióxido de silicio (antiaglomerante)' } })
  if (previo) await prisma.insumo.update({ where: { id: previo.id }, data: { nombre: 'Dióxido de silicio', tipo: 'ANTIAGLOMERANTE' } })

  for (const nombre of ['Dióxido de silicio', 'Nuflow', 'Harina de arroz']) {
    if (!(await prisma.insumo.findUnique({ where: { nombre } }))) {
      await prisma.insumo.create({ data: { nombre, unidad: 'kg', tipo: 'ANTIAGLOMERANTE' } })
    }
  }
  const yodo = await prisma.insumo.findFirst({ where: { nombre: { startsWith: 'Yodo' } } })
  if (yodo) await prisma.insumo.update({ where: { id: yodo.id }, data: { tipo: 'YODO' } })

  await prisma.parametro.create({
    data: { clave: 'antiaglomerantesCargados', valor: '1', descripcion: 'Marca interna: catálogo de antiaglomerantes ya cargado' },
  })
}
