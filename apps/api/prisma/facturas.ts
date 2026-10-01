// Proveedores, cuentas, insumos y gastos que salen del análisis de 61 facturas recibidas (ago-sep 2026).
// Se carga una sola vez (marca `facturasSep2026Cargadas`) y nunca pisa lo que el usuario ya haya editado.
import type { PrismaClient } from '@prisma/client'

interface Prov {
  /** Nombre con que ya existe en la base (de la semilla), si lo hay. */
  existente?: string
  nombre: string
  rut: string
  giro: string
  tipo: 'GENERAL' | 'MP' | 'ADUANA' | 'NAVIERA' | 'TRANSPORTE'
  cuenta: string
  /** Pisar la cuenta aunque ya tuviera una (corrige una suposición de la semilla). */
  corregirCuenta?: boolean
}

const PROVEEDORES: Prov[] = [
  { existente: 'Rossi', nombre: 'Rossi', rut: '78.461.670-3', giro: 'Agencia de aduanas (Sandro Rossi Wittemann y Cía. Ltda.)', tipo: 'ADUANA', cuenta: '5200' },
  { existente: 'Servitral', nombre: 'Servitral', rut: '76.392.448-3', giro: 'Transporte y almacenaje (Servicios de Transporte, Almacenaje y Logística)', tipo: 'TRANSPORTE', cuenta: '5210' },
  { existente: 'Transportes Mendoza', nombre: 'Transportes Mendoza', rut: '76.801.527-9', giro: 'Transporte y Logística Raquel Mendoza: flete de silvinita Albemarle a Santiago', tipo: 'TRANSPORTE', cuenta: '5100', corregirCuenta: true },
  { existente: 'SQM', nombre: 'SQM', rut: '79.947.100-0', giro: 'SQM Industrial S.A.: sal 27/15', tipo: 'MP', cuenta: '5100' },
  { existente: 'Rosa Durán', nombre: 'Rosa Durán', rut: '76.499.236-9', giro: 'Reparación y mantención de balanza', tipo: 'GENERAL', cuenta: '6130' },
  { existente: 'Fenway', nombre: 'Fenway', rut: '76.526.262-3', giro: 'Fenway Tecnologías SpA: etiquetas', tipo: 'GENERAL', cuenta: '5110' },
  { existente: 'VSS Consultores', nombre: 'VSS Consultores', rut: '77.976.300-5', giro: 'VSS Auditores Consultores S.A.: asesorías contables', tipo: 'GENERAL', cuenta: '6150' },
  { existente: 'Manuel Errázuriz (arriendo bodega)', nombre: 'Inmobiliaria Covintec (arriendo bodega)', rut: '76.927.748-K', giro: 'Inmobiliaria Covintec Limitada: arriendo de la bodega', tipo: 'GENERAL', cuenta: '6110' },
  { existente: 'Banco Bice', nombre: 'Banco Bice', rut: '97.080.000-K', giro: 'Banco: comisiones por transferencias', tipo: 'GENERAL', cuenta: '7100' },
  { existente: 'DHL', nombre: 'DHL', rut: '86.966.100-7', giro: 'DHL Express (Chile) Ltda.: transporte expreso internacional', tipo: 'GENERAL', cuenta: '6170' },
  { nombre: 'Coisa', rut: '78.438.124-2', giro: 'Coisa SpA: sacos y maxisacos de polipropileno', tipo: 'GENERAL', cuenta: '5110' },
  { nombre: 'Rhodia Chile', rut: '77.322.460-9', giro: 'Rhodia Chile Ltda.: Tixosil 38A (sílice, antiaglomerante)', tipo: 'GENERAL', cuenta: '5110' },
  { nombre: 'Embalajes y Servicios Industriales', rut: '76.120.767-9', giro: 'Rollos de cartón y film', tipo: 'GENERAL', cuenta: '5110' },
  { nombre: 'Comercial Teca', rut: '78.252.401-1', giro: 'Comercial Teca Ltda.: pallets de madera', tipo: 'GENERAL', cuenta: '5120' },
  { nombre: 'Combustibles San Luis', rut: '78.401.330-8', giro: 'Combustibles y Comercial San Luis Ltda.: diésel', tipo: 'GENERAL', cuenta: '5140' },
  { nombre: 'Marcos Zambón', rut: '8.409.664-4', giro: 'Arriendo de grúa horquilla 3 t', tipo: 'GENERAL', cuenta: '5130' },
  { nombre: 'Medlog Chile', rut: '76.172.595-5', giro: 'Medlog Chile S.A.: gate out de contenedores', tipo: 'GENERAL', cuenta: '5240' },
  { nombre: 'Terminal Pacífico Sur (TPS)', rut: '96.908.870-3', giro: 'Terminal Pacífico Sur Valparaíso: pesaje y seguridad de carga', tipo: 'GENERAL', cuenta: '5240' },
  { nombre: 'San Antonio Terminal Internacional (STI)', rut: '96.908.970-K', giro: 'Tarifa de seguridad en la transferencia de contenedores', tipo: 'GENERAL', cuenta: '5240' },
  { nombre: 'Italcargo', rut: '77.452.590-4', giro: 'Italcargo Chile Transportes: flete marítimo y seguro de carga', tipo: 'NAVIERA', cuenta: '5220' },
  { nombre: 'Eurofins', rut: '99.521.990-5', giro: 'Eurofins Testing Chile S.A.: análisis de laboratorio', tipo: 'GENERAL', cuenta: '6120' },
  { nombre: 'Kronox', rut: '96.972.640-8', giro: 'Control de plagas mensual', tipo: 'GENERAL', cuenta: '6140' },
  { nombre: 'Entel', rut: '96.806.980-2', giro: 'Telefonía móvil e internet', tipo: 'GENERAL', cuenta: '6200' },
  { nombre: 'BCI Seguros', rut: '99.147.000-K', giro: 'BCI Seguros Generales: póliza 3712585', tipo: 'GENERAL', cuenta: '6185' },
  { nombre: 'Mapfre Vida', rut: '96.933.030-K', giro: 'Mapfre Cía. de Seguros de Vida: seguro complementario de salud', tipo: 'GENERAL', cuenta: '6180' },
  { nombre: 'Vivianna Rebolledo', rut: '14.232.013-4', giro: 'Retiro de excedentes y escombros', tipo: 'GENERAL', cuenta: '6190' },
  { nombre: 'Electricidad Gobantes', rut: '80.409.800-3', giro: 'Materiales eléctricos', tipo: 'GENERAL', cuenta: '6130' },
  { nombre: 'Emmanuela Menares', rut: '76.971.525-8', giro: 'Mantención de equipos de aire acondicionado', tipo: 'GENERAL', cuenta: '6130' },
  { nombre: 'Inversiones y Servicios Transcapital', rut: '76.050.537-4', giro: 'Arriendo de andamios', tipo: 'GENERAL', cuenta: '6130' },
  { nombre: 'Inversiones J.F.', rut: '77.162.105-8', giro: 'Herramientas', tipo: 'GENERAL', cuenta: '6900' },
  { nombre: 'Distribuidora Jaque', rut: '76.350.101-9', giro: 'Agua purificada', tipo: 'GENERAL', cuenta: '6900' },
  { nombre: 'Transportes Ríos', rut: '77.837.343-2', giro: 'Transporte y Logística Ríos SpA: traslado de sal a Macul', tipo: 'TRANSPORTE', cuenta: '5210' },
  { nombre: 'Comercial Fersas', rut: '76.985.852-0', giro: 'Regalos corporativos grabados', tipo: 'GENERAL', cuenta: '6170' },
]

const CUENTAS: [string, string, string][] = [
  ['5240', 'Gastos portuarios y gate out', 'COSTO_VENTAS'],
  ['6185', 'Seguros generales', 'GAV'],
  ['6200', 'Telefonía e internet', 'GAV'],
]

// Gasto de la semilla → proveedor que le corresponde según las facturas. Solo se asigna si no tenía
// proveedor, o si tenía el que la semilla había supuesto sin evidencia (`suposicion`).
const GASTO_PROVEEDOR: { gasto: string; proveedor: string; suposicion?: string }[] = [
  { gasto: 'Agencia de aduanas', proveedor: 'Rossi' },
  { gasto: 'Transporte SAI/VAP', proveedor: 'Servitral', suposicion: 'Transportes Mendoza' },
  { gasto: 'Grúa horquilla', proveedor: 'Marcos Zambón', suposicion: 'Grúas SPV' },
  { gasto: 'Petróleo', proveedor: 'Combustibles San Luis' },
  { gasto: 'Laboratorio y análisis', proveedor: 'Eurofins' },
  { gasto: 'Fumigaciones', proveedor: 'Kronox' },
  { gasto: 'Contabilidad', proveedor: 'VSS Consultores' },
  { gasto: 'Seguro complementario de salud', proveedor: 'Mapfre Vida' },
  { gasto: 'Retiro de escombros', proveedor: 'Vivianna Rebolledo' },
]

export async function completarFacturasSep2026(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'facturasSep2026Cargadas' } })) return

  // ── Cuentas contables nuevas ──
  const cuenta: Record<string, number> = {}
  for (const [codigo, nombre, seccion] of CUENTAS) {
    const c = (await prisma.cuentaContable.findUnique({ where: { codigo } })) ?? (await prisma.cuentaContable.create({ data: { codigo, nombre, seccion } }))
    cuenta[codigo] = c.id
  }
  for (const c of await prisma.cuentaContable.findMany()) cuenta[c.codigo] = c.id

  // ── Proveedores: se actualizan los que ya existían y se crean los que faltan ──
  const prov: Record<string, number> = {}
  for (const p of PROVEEDORES) {
    const previo =
      (await prisma.proveedor.findFirst({ where: { rut: p.rut } })) ??
      (p.existente ? await prisma.proveedor.findUnique({ where: { nombre: p.existente } }) : null) ??
      (await prisma.proveedor.findUnique({ where: { nombre: p.nombre } }))
    if (previo) {
      await prisma.proveedor.update({
        where: { id: previo.id },
        data: {
          rut: previo.rut ?? p.rut,
          giro: previo.giro ?? p.giro,
          tipo: previo.tipo === 'GENERAL' ? p.tipo : previo.tipo,
          cuentaId: previo.cuentaId === null || p.corregirCuenta ? cuenta[p.cuenta] : previo.cuentaId,
          ...(p.existente === 'Manuel Errázuriz (arriendo bodega)' ? { nombre: p.nombre } : {}),
        },
      })
      prov[p.nombre] = previo.id
    } else {
      prov[p.nombre] = (await prisma.proveedor.create({ data: { nombre: p.nombre, rut: p.rut, giro: p.giro, tipo: p.tipo, cuentaId: cuenta[p.cuenta] } })).id
    }
  }
  // Los gastos del arriendo apuntaban al proveedor con el nombre anterior: el id es el mismo, no hay que tocarlos.

  // ── Proveedor de cada gasto del presupuesto ──
  for (const g of GASTO_PROVEEDOR) {
    const suposicion = g.suposicion ? await prisma.proveedor.findUnique({ where: { nombre: g.suposicion } }) : null
    await prisma.gastoDriver.updateMany({
      where: { nombre: g.gasto, OR: [{ proveedorId: null }, ...(suposicion ? [{ proveedorId: suposicion.id }] : [])] },
      data: { proveedorId: prov[g.proveedor] },
    })
  }

  // ── Gastos recurrentes que faltaban en el presupuesto (y por lo tanto en el flujo) ──
  const version = await prisma.versionPresupuesto.findFirst({ orderBy: { id: 'asc' } })
  const transporteInterno = await prisma.tipoCosto.findUnique({ where: { codigo: 'TRANSPORTE_INTERNO' } })
  if (version) {
    const nuevos = [
      { nombre: 'Telefonía móvil (Entel)', driver: 'FIJO_MENSUAL', fijo: 12135, cuenta: '6200', proveedor: 'Entel', nota: 'Factura mensual de Entel: $12.135 neto ($14.441 con IVA).' },
      { nombre: 'Seguros generales (BCI)', driver: 'FIJO_MENSUAL', fijo: 54740, cuenta: '6185', proveedor: 'BCI Seguros', nota: 'Póliza 3712585: cuota mensual ≈ $54.740 neto (se factura de a 3 cuotas).' },
      { nombre: 'Pesaje y seguridad portuaria (TPS)', driver: 'POR_CONTENEDOR', variable: 100000, cuenta: '5240', proveedor: 'Terminal Pacífico Sur (TPS)', tipoCostoId: transporteInterno?.id ?? null, afectoIVA: false, nota: 'Facturas de TPS: $97.818 y $102.551 por contenedor, exentas de IVA.' },
    ]
    for (const n of nuevos) {
      if (await prisma.gastoDriver.findFirst({ where: { versionId: version.id, nombre: n.nombre } })) continue
      await prisma.gastoDriver.create({
        data: {
          versionId: version.id, nombre: n.nombre, driver: n.driver, moneda: 'CLP',
          valorFijo: n.fijo ?? 0, valorVariable: n.variable ?? 0, cuentaId: cuenta[n.cuenta], proveedorId: prov[n.proveedor],
          tipoCostoId: n.tipoCostoId ?? null, afectoIVA: n.afectoIVA ?? true, nota: n.nota,
        },
      })
    }
  }

  // ── Insumos: valores unitarios netos de las facturas ──
  // Sacos: la semilla había leído "248 × 3.000" del flujo al revés; la factura de Coisa dice 2.030 sacos a $248.
  await prisma.insumo.updateMany({ where: { nombre: 'Sacos', OR: [{ costoUnitario: null }, { costoUnitario: 3000 }] }, data: { costoUnitario: 248, proveedorId: prov['Coisa'] } })
  await prisma.insumo.updateMany({ where: { nombre: 'Dióxido de silicio', costoUnitario: null }, data: { costoUnitario: 3569.9, proveedorId: prov['Rhodia Chile'] } })
  await prisma.insumo.updateMany({ where: { nombre: 'Etiquetas autoadhesivas', costoUnitario: null }, data: { costoUnitario: 6100 } })
  await prisma.insumo.updateMany({ where: { nombre: 'Pallets' }, data: { proveedorId: prov['Comercial Teca'] } })
  for (const [nombre, unidad, costo, base] of [
    ['Rollo de cartón 1,2 m', 'rollo', 36400, 'POR_CONTENEDOR'],
    ['Rollo de film', 'rollo', 3680, 'POR_CONTENEDOR'],
    ['Cera 74 (cinta de la etiquetadora)', 'unidad', 1900, 'POR_CONTENEDOR'],
  ] as const) {
    if (!(await prisma.insumo.findUnique({ where: { nombre } }))) {
      await prisma.insumo.create({
        data: { nombre, unidad, tipo: 'GENERAL', costoUnitario: costo, base, proveedorId: prov[nombre.startsWith('Rollo') ? 'Embalajes y Servicios Industriales' : 'Fenway'] ?? null },
      })
    }
  }

  await prisma.parametro.create({
    data: { clave: 'facturasSep2026Cargadas', valor: '1', descripcion: 'Marca interna: proveedores e insumos del análisis de 61 facturas ya cargados' },
  })
}
