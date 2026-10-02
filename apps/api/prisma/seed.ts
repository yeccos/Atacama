// Datos semilla de Atacama Sea Salt (PPTO a octubre 2026 + flujo al 30-09-2026).
// Uso: npm run seed            → carga solo si la base está vacía
//      npm run seed -- --reset → borra todo y vuelve a cargar
import { PrismaClient } from '@prisma/client'
import { totalPedidoUsdCent } from '@atacama/core'
import { hashClave } from '../src/auth'
import { aplicarValoresDeFacturas, fijarIFSEnAgosto } from './correcciones'
import { completarFacturasSep2026 } from './facturas'
import { ajustarCobrosMexicoNadarra } from './cobros'
import { completarFase2 } from './fase2'
import { marcarMPPagada } from './mpPagada'
import { repartirMPPorOrigen } from './mpPorOrigen'
import { marcarSoloOrigen } from './soloOrigen'
import { cargarFacturasComoDocumentos } from './documentos'
import { cargarCobrosDeSeptiembre } from './cobrosSeptiembre'
import { cargarCobrosReales } from './cobrosReales'
import { cargarDiaArriendo } from './diaArriendo'
import { cargarParametrosF29 } from './f29'
import { cargarDiaIVA25 } from './diaIVA25'
import { cargarIVACalculado } from './ivaCalculado'
import { cargarSaldoCajaOctubre } from './saldoCajaOctubre'
import { cargarMPDeSeptiembre } from './mpSeptiembre'
import { quitarCuotasRossiServitral } from './deudasRossiServitral'
import { cargarBonoDescarga } from './bonoDescarga'
import { cargarMPDeOctubre } from './mpOctubre'
import { marcarArriendoPagadoPorMEL } from './arriendoMEL'
import { cargarDevolucionesDePrestamos } from './prestamos'
import { cargarCuentaBice } from './bancos'
import { ajustarCamionesMinimos } from './camionesMinimos'
import { completarSemanalYDBC } from './semanal'
import { completarAntiaglomerantes, completarInsumosConsumo } from './productos'

const prisma = new PrismaClient()
const f = (iso: string) => new Date(iso + 'T00:00:00.000Z')

// Orden de borrado: primero las tablas que dependen de otras.
const TABLAS = [
  'conciliacion', 'movimientoBanco', 'ventaUSD', 'cobroCliente', 'aplicacionPago', 'pago',
  'consumoMP', 'camionMP', 'costoEmbarque', 'facturaExportacion', 'hitoCobro', 'embarque',
  'documento', 'cuotaDeuda', 'deuda', 'reglaCartola', 'compraMPPlan', 'gastoDriver',
  'reglaFrecuencia', 'versionPresupuesto', 'hitoPagoCliente', 'escalaDescuento', 'precioCliente',
  'cliente', 'recetaInsumo', 'insumo', 'producto', 'tarifaFlete', 'destino', 'origenMP',
  'incotermCosto', 'tipoCosto', 'incoterm', 'proveedor', 'cuentaBancaria', 'empleado',
  'periodoIVA', 'cuentaContable', 'indicador', 'parametro', 'auditoria', 'sesion', 'usuario',
]

async function main() {
  const reset = process.argv.includes('--reset')
  if ((await prisma.cliente.count()) > 0 && !reset) {
    await completarFase2(prisma)
    await completarAntiaglomerantes(prisma)
    await completarInsumosConsumo(prisma)
    await completarFacturasSep2026(prisma)
    await aplicarValoresDeFacturas(prisma)
    await fijarIFSEnAgosto(prisma)
    await completarSemanalYDBC(prisma)
    await ajustarCobrosMexicoNadarra(prisma)
    await marcarMPPagada(prisma)
    await repartirMPPorOrigen(prisma)
    await marcarSoloOrigen(prisma)
    await cargarCuentaBice(prisma)
    await cargarDevolucionesDePrestamos(prisma)
    await cargarFacturasComoDocumentos(prisma)
    await marcarArriendoPagadoPorMEL(prisma)
    await cargarCobrosDeSeptiembre(prisma)
    await cargarCobrosReales(prisma)
    await cargarDiaArriendo(prisma)
    await cargarParametrosF29(prisma)
    await cargarDiaIVA25(prisma)
    await cargarIVACalculado(prisma)
    await cargarSaldoCajaOctubre(prisma)
    await cargarMPDeSeptiembre(prisma)
    await quitarCuotasRossiServitral(prisma)
    await cargarBonoDescarga(prisma)
    await cargarMPDeOctubre(prisma)
    await ajustarCamionesMinimos(prisma)
    console.log('La base ya tiene datos. Usa "npm run seed -- --reset" para borrarla y recargar.')
    return
  }
  for (const t of TABLAS) await (prisma as any)[t].deleteMany()

  // ── Usuario inicial (credenciales en apps/api/.env) ──
  const usuario = process.env.ADMIN_USUARIO ?? 'admin'
  const clave = process.env.ADMIN_CLAVE
  if (!clave) throw new Error('Falta ADMIN_CLAVE en apps/api/.env')
  await prisma.usuario.create({ data: { usuario, nombre: 'Administrador', claveHash: hashClave(clave) } })

  // ── Parámetros e indicadores ──
  await prisma.parametro.createMany({
    data: [
      { clave: 'mermaDefectoPct', valor: '5', descripcion: 'Merma de MP por defecto (%), cuando el camión no tiene merma registrada' },
      { clave: 'toneladasPorCamion', valor: '28', descripcion: 'Toneladas de MP por camión' },
      { clave: 'bonoDescargaPorCamion', valor: '70000', descripcion: 'Bono de descarga líquido por camión (CLP): $35.000 por persona × 2 personas que descargan' },
      { clave: 'ivaPct', valor: '19', descripcion: 'Tasa de IVA (%)' },
      { clave: 'devolucionIVAMensual', valor: '1500000', descripcion: 'Devolución de IVA exportador aproximada (CLP/mes), mientras no haya IVA crédito real' },
      { clave: 'tasaImpuestoRentaPct', valor: '25', descripcion: 'Provisión de impuesto a la renta, régimen Pyme (%). Verificar con contabilidad' },
      { clave: 'saldoMinimoCaja', valor: '0', descripcion: 'Saldo mínimo de caja para alertas del flujo (CLP)' },
    ],
  })
  await prisma.indicador.createMany({
    data: [
      { tipo: 'UF', fecha: f('2026-09-30'), valor: 41050 },
      { tipo: 'USD_OBS', fecha: f('2026-09-30'), valor: 950 },
    ],
  })

  // ── Plan de cuentas ──
  const cuentas: [string, string, string][] = [
    ['4100', 'Ventas de exportación', 'VENTAS'],
    ['5100', 'Materia prima', 'COSTO_VENTAS'],
    ['5110', 'Insumos y aditivos', 'COSTO_VENTAS'],
    ['5120', 'Pallets', 'COSTO_VENTAS'],
    ['5130', 'Grúa horquilla', 'COSTO_VENTAS'],
    ['5140', 'Petróleo', 'COSTO_VENTAS'],
    ['5200', 'Agencia de aduanas', 'COSTO_VENTAS'],
    ['5210', 'Transporte a puerto', 'COSTO_VENTAS'],
    ['5220', 'Flete marítimo', 'COSTO_VENTAS'],
    ['5230', 'Seguro de carga', 'COSTO_VENTAS'],
    ['6100', 'Remuneraciones', 'GAV'],
    ['6110', 'Arriendo y gastos comunes', 'GAV'],
    ['6120', 'Laboratorio y análisis', 'GAV'],
    ['6130', 'Mantención', 'GAV'],
    ['6140', 'Fumigaciones', 'GAV'],
    ['6150', 'Contabilidad y asesorías', 'GAV'],
    ['6160', 'Certificaciones', 'GAV'],
    ['6170', 'Marketing y muestras', 'GAV'],
    ['6180', 'Seguros del personal', 'GAV'],
    ['6190', 'Retiro de escombros', 'GAV'],
    ['6900', 'Varios', 'GAV'],
    ['7100', 'Comisiones bancarias', 'NO_OPERACIONAL'],
    ['7110', 'Intereses', 'NO_OPERACIONAL'],
    ['7120', 'Diferencia de cambio realizada', 'NO_OPERACIONAL'],
    ['7130', 'Diferencia de cambio no realizada', 'NO_OPERACIONAL'],
    ['1900', 'Inversiones en activo fijo', 'SOLO_FLUJO'],
    ['2100', 'Amortización de deudas', 'SOLO_FLUJO'],
  ]
  const cta: Record<string, number> = {}
  for (const [codigo, nombre, seccion] of cuentas) {
    cta[codigo] = (await prisma.cuentaContable.create({ data: { codigo, nombre, seccion } })).id
  }

  // ── Incoterms: tabla configurable de qué costos asume la empresa ──
  const tipos: Record<string, number> = {}
  for (const [codigo, nombre] of [
    ['TRANSPORTE_INTERNO', 'Transporte a puerto chileno'],
    ['ADUANA', 'Agencia de aduanas'],
    ['FLETE_MARITIMO', 'Flete marítimo'],
    ['SEGURO', 'Seguro de carga'],
    ['DESTINO', 'Costos en destino'],
  ]) {
    tipos[codigo] = (await prisma.tipoCosto.create({ data: { codigo, nombre } })).id
  }
  const matriz: Record<string, [string, string[]]> = {
    EXW: ['En fábrica', []],
    FCA: ['Franco transportista', []],
    FOB: ['Franco a bordo', ['TRANSPORTE_INTERNO', 'ADUANA']],
    CFR: ['Costo y flete', ['TRANSPORTE_INTERNO', 'ADUANA', 'FLETE_MARITIMO']],
    CIF: ['Costo, seguro y flete', ['TRANSPORTE_INTERNO', 'ADUANA', 'FLETE_MARITIMO', 'SEGURO']],
    DAP: ['Entregado en lugar', ['TRANSPORTE_INTERNO', 'ADUANA', 'FLETE_MARITIMO', 'SEGURO', 'DESTINO']],
    DDP: ['Entregado con derechos pagados', ['TRANSPORTE_INTERNO', 'ADUANA', 'FLETE_MARITIMO', 'SEGURO', 'DESTINO']],
  }
  const inco: Record<string, number> = {}
  for (const [codigo, [descripcion, costos]] of Object.entries(matriz)) {
    const i = await prisma.incoterm.create({
      data: { codigo, descripcion, eventoReconocimiento: codigo === 'EXW' || codigo === 'FCA' ? 'PRODUCCION' : 'BL' },
    })
    inco[codigo] = i.id
    for (const c of costos) await prisma.incotermCosto.create({ data: { incotermId: i.id, tipoCostoId: tipos[c] } })
  }

  // ── Proveedores ──
  const prov: Record<string, number> = {}
  const proveedores: [string, string, string, string | null][] = [
    ['Albemarle', 'MP', 'USD', '5100'],
    ['SQM', 'MP', 'USD', '5100'],
    ['Servitral', 'GENERAL', 'CLP', null],
    ['Rossi', 'GENERAL', 'CLP', null],
    ['Transportes Mendoza', 'TRANSPORTE', 'CLP', '5210'],
    ['Versalles', 'GENERAL', 'CLP', '5120'],
    ['Grúas SPV', 'GENERAL', 'CLP', '5130'],
    ['Rosa Durán', 'GENERAL', 'CLP', '6130'],
    ['Fenway', 'GENERAL', 'CLP', '5110'],
    ['VSS Consultores', 'GENERAL', 'CLP', '6150'],
    ['Manuel Errázuriz (arriendo bodega)', 'GENERAL', 'CLP', '6110'],
    ['Bancoestado', 'GENERAL', 'CLP', '2100'],
    ['Banco Bice', 'GENERAL', 'CLP', '7100'],
    ['Previred', 'GENERAL', 'CLP', '6100'],
    ['DHL', 'GENERAL', 'CLP', '6170'],
  ]
  for (const [nombre, tipo, moneda, cuenta] of proveedores) {
    prov[nombre] = (
      await prisma.proveedor.create({ data: { nombre, tipo, moneda, cuentaId: cuenta ? cta[cuenta] : null } })
    ).id
  }

  // ── Materia prima, destinos y fletes ──
  const albemarle = await prisma.origenMP.create({
    data: { nombre: 'Albemarle', proveedorId: prov['Albemarle'], usdPorTon: 150, fleteUsdPorTon: 70.5263 },
  })
  const sqm = await prisma.origenMP.create({
    data: { nombre: 'SQM', proveedorId: prov['SQM'], usdPorTon: 367, nota: 'Obligatorio para Europa por el límite de arsénico' },
  })
  const dest: Record<string, number> = {}
  for (const [puerto, pais, usd] of [
    ['New York', 'USA', 6200],
    ['Manzanillo', 'México', 2050],
    ['Hamburgo', 'Alemania', 2700],
    ['India (puerto por definir)', 'India', 2700],
  ] as [string, string, number][]) {
    const d = await prisma.destino.create({ data: { puerto, pais } })
    dest[puerto] = d.id
    await prisma.tarifaFlete.create({ data: { destinoId: d.id, usdPorCont: usd, desde: f('2026-10-01') } })
  }
  // Saldo inicial de MP, cargado como un lote. Verificar las 5 t.
  await prisma.camionMP.create({
    data: { origenId: albemarle.id, fecha: f('2026-09-30'), guia: 'Saldo inicial', toneladasFacturadas: 5, toneladasRecibidas: 5, nota: 'Stock inicial del Excel (5 t). Verificar.' },
  })

  // ── Productos e insumos (formulación) ──
  const sinYodo = await prisma.producto.create({ data: { nombre: 'Sal sin yodo', yodada: false, antiaglomerante: 'por definir' } })
  await prisma.producto.create({ data: { nombre: 'Sal yodada', yodada: true, antiaglomerante: 'por definir' } })
  await prisma.insumo.createMany({
    data: [
      { nombre: 'Yodo (yodato de potasio)', unidad: 'kg' },
      { nombre: 'Dióxido de silicio (antiaglomerante)', unidad: 'kg' },
      { nombre: 'Sacos', unidad: 'un' },
      { nombre: 'Etiquetas autoadhesivas', unidad: 'un', proveedorId: prov['Fenway'] },
      { nombre: 'Pallets', unidad: 'un', proveedorId: prov['Versalles'] },
    ],
  })

  // ── Clientes ──
  const desde = f('2026-10-01')
  const clientes = [
    {
      nombre: 'DBC Ingredients', contacto: 'Paul', pais: 'USA', destino: 'New York', kg: 16500, incoterm: null,
      origen: albemarle.id, precio: 1.4, escalas: [] as [number, number][],
      hitos: [[100, 'ETD', 0]] as [number, string, number][],
      nota: 'Incoterm (FOB o CIF) y forma de pago por confirmar.',
    },
    {
      nombre: 'WHS Process / Global Supply Mexico', contacto: 'William De Haene', pais: 'México', destino: 'Manzanillo', kg: 20000, incoterm: 'CFR',
      origen: albemarle.id, precio: 1.127, escalas: [],
      hitos: [[30, 'OC', 0], [50, 'BL', 0], [20, 'ETA', 0]] as [number, string, number][],
      nota: null,
    },
    {
      nombre: 'NADARRA', contacto: 'Kathi Gewecke', pais: 'Alemania', destino: 'Hamburgo', kg: 20000, incoterm: 'CIF',
      origen: sqm.id, precio: 1.49, escalas: [[2, 5], [3, 10]] as [number, number][],
      hitos: [[30, 'OC', 0], [70, 'BL', 0]] as [number, string, number][],
      nota: 'El Excel usa 1,453 US$/kg parejo (promedio de los 2 contenedores de oct-2026).',
    },
    {
      nombre: 'Supreme Enterprises', contacto: null, pais: 'India', destino: 'India (puerto por definir)', kg: 20000, incoterm: 'CIF',
      origen: albemarle.id, precio: 1.122, escalas: [],
      hitos: [] as [number, string, number][],
      nota: 'Cliente eventual. Forma de pago por definir.',
    },
  ]
  const cli: Record<string, number> = {}
  for (const c of clientes) {
    const creado = await prisma.cliente.create({
      data: {
        nombre: c.nombre, contacto: c.contacto, pais: c.pais, kgPorContenedor: c.kg, nota: c.nota,
        destinoId: dest[c.destino], incotermId: c.incoterm ? inco[c.incoterm] : null,
        origenId: c.origen, productoId: sinYodo.id,
        precios: { create: [{ usdPorKg: c.precio, desde }] },
        escalas: { create: c.escalas.map(([nContenedor, pctDescuento]) => ({ nContenedor, pctDescuento })) },
        hitos: { create: c.hitos.map(([pct, evento, diasDesfase], i) => ({ orden: i + 1, pct, evento, diasDesfase })) },
      },
    })
    cli[c.nombre] = creado.id
  }

  // ── Versión de presupuesto, reglas de frecuencia y gastos ──
  const version = await prisma.versionPresupuesto.create({
    data: { nombre: 'PPTO oct-2026', tcPresupuesto: 950, ufPresupuesto: 41050, mesInicio: f('2026-10-01'), mesFin: f('2030-12-01') },
  })
  await prisma.reglaFrecuencia.createMany({
    data: [
      { versionId: version.id, clienteId: cli['DBC Ingredients'], contenedores: 1, cadaNMeses: 1, desde: f('2026-10-01') },
      { versionId: version.id, clienteId: cli['WHS Process / Global Supply Mexico'], contenedores: 1, cadaNMeses: 2, desde: f('2026-10-01') },
      // Octubre 2026 son 2 contenedores (embarque real en curso); desde 2027, 1 por año en octubre.
      { versionId: version.id, clienteId: cli['NADARRA'], contenedores: 1, cadaNMeses: 12, desde: f('2027-10-01') },
    ],
  })

  type G = {
    nombre: string; driver: string; cuenta: string; moneda?: string; fijo?: number; variable?: number
    mes?: number; tipoCosto?: string; proveedor?: string; soloFlujo?: boolean; afectoIVA?: boolean; nota?: string
  }
  const gastos: G[] = [
    { nombre: 'Otros costos MP (sal, etiquetas, dióxido, yodo)', driver: 'POR_KG', variable: 35, cuenta: '5110', nota: 'Valor global del Excel. Se reemplaza por la receta de cada producto cuando esté cargada.' },
    { nombre: 'Grúa horquilla', driver: 'POR_CONTENEDOR', variable: 80000, cuenta: '5130', proveedor: 'Grúas SPV', nota: '4 × $20.000 por contenedor' },
    { nombre: 'Pallets', driver: 'POR_TONELADA', variable: 20766, cuenta: '5120', proveedor: 'Versalles', nota: 'Por tonelada vendida' },
    { nombre: 'Agencia de aduanas', driver: 'POR_CONTENEDOR', variable: 450000, cuenta: '5200', tipoCosto: 'ADUANA' },
    { nombre: 'Transporte SAI/VAP', driver: 'POR_CONTENEDOR', variable: 450000, cuenta: '5210', tipoCosto: 'TRANSPORTE_INTERNO', proveedor: 'Transportes Mendoza' },
    { nombre: 'Petróleo', driver: 'POR_KG', variable: 15, cuenta: '5140' },
    { nombre: 'Laboratorio y análisis', driver: 'FIJO_MAS_CONTENEDOR', fijo: 50000, variable: 50000, cuenta: '6120' },
    { nombre: 'Mantención', driver: 'FIJO_MAS_CONTENEDOR', fijo: 200000, variable: 50000, cuenta: '6130' },
    { nombre: 'Varios', driver: 'FIJO_MAS_CONTENEDOR', fijo: 100000, variable: 50000, cuenta: '6900' },
    { nombre: 'Arriendo bodega', driver: 'FIJO_MENSUAL', moneda: 'UF', fijo: 55, cuenta: '6110', proveedor: 'Manuel Errázuriz (arriendo bodega)', afectoIVA: false },
    { nombre: 'Gastos comunes bodega', driver: 'FIJO_MENSUAL', fijo: 400000, cuenta: '6110', proveedor: 'Manuel Errázuriz (arriendo bodega)', afectoIVA: false },
    { nombre: 'Fumigaciones', driver: 'FIJO_MENSUAL', fijo: 110000, cuenta: '6140' },
    { nombre: 'Contabilidad', driver: 'FIJO_MENSUAL', moneda: 'UF', fijo: 6, cuenta: '6150' },
    { nombre: 'Comisiones Bice', driver: 'FIJO_MENSUAL', fijo: 50000, cuenta: '7100', proveedor: 'Banco Bice', afectoIVA: false },
    { nombre: 'Retiro de escombros', driver: 'ANUAL_PRORRATEADO', fijo: 1000000, cuenta: '6190' },
    { nombre: 'Muestras DHL', driver: 'FIJO_MENSUAL', fijo: 240000, cuenta: '6170', proveedor: 'DHL', nota: '2 × $120.000' },
    { nombre: 'LinkedIn A. Falcone', driver: 'FIJO_MENSUAL', fijo: 75000, cuenta: '6170', afectoIVA: false },
    { nombre: 'Seguro complementario de salud', driver: 'FIJO_MENSUAL', fijo: 129000, cuenta: '6180', afectoIVA: false },
    { nombre: 'IFS Food', driver: 'ANUAL_MES', fijo: 4000000, cuenta: '6160', nota: 'Falta definir el mes de la auditoría.' },
    { nombre: 'Kosher', driver: 'ANUAL_MES', fijo: 1000000, mes: 10, cuenta: '6160' },
    { nombre: 'Cuota Bancoestado', driver: 'FIJO_MENSUAL', fijo: 1200000, cuenta: '2100', proveedor: 'Bancoestado', soloFlujo: true, afectoIVA: false },
    { nombre: 'Inversiones en equipos', driver: 'FIJO_MENSUAL', fijo: 1000000, cuenta: '1900', soloFlujo: true },
    { nombre: 'Pintura y mantención de techos', driver: 'FIJO_MENSUAL', fijo: 500000, cuenta: '1900', soloFlujo: true },
  ]
  for (const g of gastos) {
    await prisma.gastoDriver.create({
      data: {
        versionId: version.id, nombre: g.nombre, driver: g.driver, moneda: g.moneda ?? 'CLP',
        valorFijo: g.fijo ?? 0, valorVariable: g.variable ?? 0, mesEspecifico: g.mes ?? null,
        tipoCostoId: g.tipoCosto ? tipos[g.tipoCosto] : null, cuentaId: cta[g.cuenta],
        proveedorId: g.proveedor ? prov[g.proveedor] : null,
        soloFlujo: g.soloFlujo ?? false, afectoIVA: g.afectoIVA ?? true, nota: g.nota ?? null,
      },
    })
  }

  // ── Remuneraciones ──
  await prisma.empleado.createMany({
    data: [
      { nombre: 'Manuel Errázuriz L.', cargo: 'Gerente general', bruto: 5628399, liquido: 5035027 },
      { nombre: 'Manuel Errázuriz S.', cargo: 'Director comercial', bruto: 1179941, liquido: 1000000 },
      { nombre: 'Daniela Ramírez', cargo: 'Jefa de calidad', bruto: 1526754, liquido: 1228147 },
      { nombre: 'Elías Gamardo', cargo: 'Jefe de producción', bruto: 1685113, liquido: 1382260 },
      { nombre: 'Gabriel Torres', cargo: 'Jefe de turno', bruto: 1083239, liquido: 724920 },
      { nombre: 'Miguel Ángel Gamardo', cargo: 'Operario' },
    ],
  })

  // ── Bancos ──
  await prisma.cuentaBancaria.createMany({
    data: [
      { nombre: 'Bice CLP', banco: 'Bice', moneda: 'CLP', saldoInicial: 2538855, fechaSaldoInicial: f('2026-10-01') },
      { nombre: 'Bice USD', banco: 'Bice', moneda: 'USD' },
      { nombre: 'Bancoestado', banco: 'Bancoestado', moneda: 'CLP' },
    ],
  })
  await prisma.reglaCartola.createMany({
    data: [
      { patron: 'PREVIRED', cuentaId: cta['6100'], proveedorId: prov['Previred'] },
      { patron: 'COMISION', cuentaId: cta['7100'], proveedorId: prov['Banco Bice'] },
      { patron: 'BANCOESTADO CUOTA', cuentaId: cta['2100'], proveedorId: prov['Bancoestado'] },
    ],
  })

  // ── Deudas (saldos por completar) ──
  const deudas: [string, number | null, string | null][] = [
    ['Servitral', 1339322, 'Servitral'],
    ['Rossi', 1584870, 'Rossi'],
    ['Albemarle (deuda atrasada)', null, 'Albemarle'],
    ['Transportes Mendoza', null, 'Transportes Mendoza'],
    ['Bancoestado', 1200000, 'Bancoestado'],
    ['Retiro de escombros', null, null],
    ['Préstamo Manuel / Nicolás Errázuriz', null, null],
    ['CMR Manuel (BH Carlos)', null, null],
    ['Versalles (pallets)', null, 'Versalles'],
    ['Grúas SPV', null, 'Grúas SPV'],
    ['Rosa Durán (balanza)', null, 'Rosa Durán'],
    ['Fenway (etiquetas)', null, 'Fenway'],
    ['VSS Consultores (factura 1190)', null, 'VSS Consultores'],
    ['Registro FDA', null, null],
  ]
  for (const [acreedor, cuota, proveedor] of deudas) {
    await prisma.deuda.create({ data: { acreedor, cuota, proveedorId: proveedor ? prov[proveedor] : null } })
  }

  // ── Embarques en curso al 30-09-2026 ──
  const escalasNadarra = [{ nContenedor: 2, pctDescuento: 5 }, { nContenedor: 3, pctDescuento: 10 }]
  await prisma.embarque.create({
    data: {
      clienteId: cli['WHS Process / Global Supply Mexico'], productoId: sinYodo.id, contenedores: 1, kgTotal: 20000, usdPorKg: 1.127,
      totalUsdCent: totalPedidoUsdCent(1.127, 20000, 1), incotermId: inco['CFR'], estado: 'CONFIRMADO',
      nota: 'Factura US$22.540. 30% cobrado en septiembre; 50% en octubre; 20% en noviembre. Fechas por completar.',
    },
  })
  await prisma.embarque.create({
    data: {
      clienteId: cli['NADARRA'], productoId: sinYodo.id, contenedores: 2, kgTotal: 40000, usdPorKg: 1.49,
      totalUsdCent: totalPedidoUsdCent(1.49, 20000, 2, escalasNadarra), incotermId: inco['CIF'], estado: 'CONFIRMADO',
      nota: 'US$58.110. Anticipo de US$17.433 ya cobrado; saldo contra BL en octubre. Fechas por completar.',
    },
  })
  await prisma.embarque.create({
    data: {
      clienteId: cli['DBC Ingredients'], productoId: sinYodo.id, contenedores: 1, kgTotal: 16500, usdPorKg: 1.4,
      totalUsdCent: totalPedidoUsdCent(1.4, 16500, 1), estado: 'CONFIRMADO',
      nota: 'Embarque de octubre 2026. Incoterm por confirmar.',
    },
  })

  await completarFase2(prisma)
  await completarAntiaglomerantes(prisma)
  await completarInsumosConsumo(prisma)
  await completarFacturasSep2026(prisma)
  await aplicarValoresDeFacturas(prisma)
  await fijarIFSEnAgosto(prisma)
  await completarSemanalYDBC(prisma)
  await ajustarCobrosMexicoNadarra(prisma)
  await marcarMPPagada(prisma)
  await repartirMPPorOrigen(prisma)
  await marcarSoloOrigen(prisma)
  await cargarCuentaBice(prisma)
  await cargarDevolucionesDePrestamos(prisma)
  await cargarFacturasComoDocumentos(prisma)
  await marcarArriendoPagadoPorMEL(prisma)
  await cargarCobrosDeSeptiembre(prisma)
  await cargarCobrosReales(prisma)
  await cargarDiaArriendo(prisma)
  await cargarParametrosF29(prisma)
  await cargarDiaIVA25(prisma)
  await cargarIVACalculado(prisma)
  await cargarSaldoCajaOctubre(prisma)
  await cargarMPDeSeptiembre(prisma)
  await quitarCuotasRossiServitral(prisma)
  await cargarBonoDescarga(prisma)
  await cargarMPDeOctubre(prisma)
  await ajustarCamionesMinimos(prisma)
  console.log('Seed cargado. Usuario inicial:', usuario)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
