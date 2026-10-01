// Valores del presupuesto corregidos con las facturas de agosto y septiembre 2026.
// Solo cambia una línea si todavía tiene el valor original del Excel: nunca pisa lo que el usuario ya editó.
// El Excel mezclaba valores con IVA y sin IVA; el presupuesto va en neto.
import type { PrismaClient } from '@prisma/client'

interface Cambio {
  gasto: string
  campo: 'valorFijo' | 'valorVariable'
  de: number
  a: number
  nota: string
}

const CAMBIOS: Cambio[] = [
  { gasto: 'Fumigaciones', campo: 'valorFijo', de: 110000, a: 92382, nota: 'Kronox: $92.382 neto al mes (el Excel tenía $110.000 con IVA).' },
  { gasto: 'Contabilidad', campo: 'valorFijo', de: 6, a: 5, nota: 'VSS: 5 UF netas al mes (el Excel tenía 6 UF con IVA).' },
  { gasto: 'Seguro complementario de salud', campo: 'valorFijo', de: 129000, a: 108206, nota: 'Mapfre: $108.206 neto (el Excel tenía $129.000 con IVA).' },
  { gasto: 'Comisiones Bice', campo: 'valorFijo', de: 50000, a: 43500, nota: 'Bice: $35.569 y $51.464 netos en ago-sep; promedio $43.500.' },
  { gasto: 'Agencia de aduanas', campo: 'valorVariable', de: 450000, a: 219000, nota: 'Rossi: promedio de 4 facturas, $219.000 neto por contenedor. El gate out de Medlog ($154.000) va aparte. El Excel tenía $450.000 con IVA, que sumaba ambos.' },
  { gasto: 'Transporte SAI/VAP', campo: 'valorVariable', de: 450000, a: 529000, nota: 'Servitral: $472.000 y $587.000 netos por contenedor en ago-sep (flete $405.415 más retiro de vacío o porteo). Promedio $529.000.' },
  { gasto: 'Grúa horquilla', campo: 'valorVariable', de: 80000, a: 62400, nota: 'Zambón: $62.400 neto por servicio de arriendo (el Excel tenía 4 × $20.000).' },
  { gasto: 'Petróleo', campo: 'valorVariable', de: 15, a: 12.6, nota: 'San Luis: $458.975 neto en septiembre para 36,5 t ≈ $12,6 por kg. Es el dato de un solo mes.' },
]

export async function aplicarValoresDeFacturas(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'correccionesFacturasSep2026' } })) return

  for (const c of CAMBIOS) {
    await prisma.gastoDriver.updateMany({
      where: { nombre: c.gasto, [c.campo]: c.de },
      data: { [c.campo]: c.a, nota: c.nota },
    })
  }

  // Las muestras de DHL se facturan casi todas como servicio exento de IVA.
  await prisma.gastoDriver.updateMany({ where: { nombre: 'Muestras DHL' }, data: { afectoIVA: false, nota: 'Septiembre: $13.903 afectos y $415.322 exentos. Ago: sin facturas.' } })

  // Gate out de cada contenedor (Medlog): antes iba dentro de los $450.000 de aduana.
  const version = await prisma.versionPresupuesto.findFirst({ orderBy: { id: 'asc' } })
  const medlog = await prisma.proveedor.findFirst({ where: { nombre: 'Medlog Chile' } })
  const cuenta = await prisma.cuentaContable.findUnique({ where: { codigo: '5240' } })
  const aduana = await prisma.tipoCosto.findUnique({ where: { codigo: 'ADUANA' } })
  if (version && !(await prisma.gastoDriver.findFirst({ where: { versionId: version.id, nombre: 'Gate out del contenedor (Medlog)' } }))) {
    await prisma.gastoDriver.create({
      data: {
        versionId: version.id, nombre: 'Gate out del contenedor (Medlog)', driver: 'POR_CONTENEDOR', valorVariable: 154000,
        cuentaId: cuenta?.id ?? null, proveedorId: medlog?.id ?? null, tipoCostoId: aduana?.id ?? null,
        nota: 'Medlog: $154.000 neto por contenedor (3 facturas ago-sep).',
      },
    })
  }

  // Insumos con consumo conocido
  await prisma.insumo.updateMany({ where: { nombre: 'Pallets', costoUnitario: 20766 }, data: { costoUnitario: 16250 } }) // $14.450 + despacho: 3 pedidos, 100 pallets, $1.625.000
  await prisma.insumo.updateMany({ where: { nombre: 'Sacos', cantidadPorBase: null }, data: { base: 'POR_TONELADA', cantidadPorBase: 40 } }) // sacos de 25 kg
  // Cartón y film se usan por pallet (1 pallet = 1 t). Estimación con las compras de septiembre para 36,5 t:
  // 7 rollos de cartón y 24 de film. Hay que verificarla.
  await prisma.insumo.updateMany({ where: { nombre: 'Rollo de cartón 1,2 m', cantidadPorBase: null }, data: { base: 'POR_TONELADA', cantidadPorBase: 0.19 } })
  await prisma.insumo.updateMany({ where: { nombre: 'Rollo de film', cantidadPorBase: null }, data: { base: 'POR_TONELADA', cantidadPorBase: 0.66 } })
  // 1 etiqueta por saco = 40 por tonelada; el costo es por rollo y falta saber cuántas etiquetas trae.
  await prisma.insumo.updateMany({ where: { nombre: 'Etiquetas autoadhesivas' }, data: { unidad: 'rollo' } })

  // Los sacos ahora se calculan aparte: se descuentan del valor global para no contarlos dos veces
  // (35 − 9,92 × 1,19 = 23,2 por kg para etiquetas, dióxido de silicio, yodo y otros).
  await prisma.gastoDriver.updateMany({
    where: { nombre: 'Otros costos MP (sal, etiquetas, dióxido, yodo)', valorVariable: 35 },
    data: {
      nombre: 'Otros costos MP (etiquetas, dióxido, yodo; falta detallar)',
      valorVariable: 23.2,
      nota: 'Eran $35 por kg con sacos, etiquetas, dióxido y yodo. Se descontaron los sacos ($9,92 por kg neto, con IVA $11,8). Reemplazar cuando estén cargados los insumos de etiquetas, dióxido y yodo.',
    },
  })

  await prisma.parametro.create({
    data: { clave: 'correccionesFacturasSep2026', valor: '1', descripcion: 'Marca interna: valores del presupuesto corregidos con las facturas ya aplicados' },
  })
}
