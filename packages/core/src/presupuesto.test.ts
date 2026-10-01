import { describe, expect, it } from 'vitest'
import {
  calcularPresupuesto,
  economiaPorContenedor,
  listaMeses,
  resolverContenedores,
  type EntradaPpto,
  type GastoIn,
} from './index'

// Datos del Excel "PPTO A OCT 2026" (mismos valores que la semilla).
const MESES = listaMeses('2026-10', '2030-12')
const MATRIZ = {
  EXW: [], FCA: [],
  FOB: ['TRANSPORTE_INTERNO', 'ADUANA'],
  CFR: ['TRANSPORTE_INTERNO', 'ADUANA', 'FLETE_MARITIMO'],
  CIF: ['TRANSPORTE_INTERNO', 'ADUANA', 'FLETE_MARITIMO', 'SEGURO'],
}

const g = (id: number, nombre: string, driver: string, extra: Partial<GastoIn> = {}): GastoIn => ({
  id, nombre, driver, moneda: 'CLP', valorFijo: 0, valorVariable: 0, mesEspecifico: null, tipoCosto: null,
  afectoIVA: true, soloFlujo: false, modoExcel: 'NORMAL', deudaId: null, ...extra,
})

const GASTOS: GastoIn[] = [
  g(1, 'Otros costos MP', 'POR_KG', { valorVariable: 35 }),
  g(2, 'Grúa horquilla', 'POR_CONTENEDOR', { valorVariable: 80000 }),
  g(3, 'Pallets', 'POR_TONELADA', { valorVariable: 20766 }),
  g(4, 'Agencia de aduanas', 'POR_CONTENEDOR', { valorVariable: 450000, tipoCosto: 'ADUANA' }),
  g(5, 'Transporte SAI/VAP', 'POR_CONTENEDOR', { valorVariable: 450000, tipoCosto: 'TRANSPORTE_INTERNO' }),
  g(6, 'Petróleo', 'POR_KG', { valorVariable: 15 }),
  g(7, 'Laboratorio', 'FIJO_MAS_CONTENEDOR', { valorFijo: 50000, valorVariable: 50000 }),
  g(8, 'Mantención', 'FIJO_MAS_CONTENEDOR', { valorFijo: 200000, valorVariable: 50000 }),
  g(9, 'Varios', 'FIJO_MAS_CONTENEDOR', { valorFijo: 100000, valorVariable: 50000 }),
  g(10, 'Arriendo bodega', 'FIJO_MENSUAL', { moneda: 'UF', valorFijo: 55 }),
  g(11, 'Gastos comunes bodega', 'FIJO_MENSUAL', { valorFijo: 400000 }),
  g(12, 'Fumigaciones', 'FIJO_MENSUAL', { valorFijo: 110000 }),
  g(13, 'Contabilidad', 'FIJO_MENSUAL', { moneda: 'UF', valorFijo: 6 }),
  g(14, 'Comisiones Bice', 'FIJO_MENSUAL', { valorFijo: 50000 }),
  g(15, 'Retiro de escombros', 'ANUAL_PRORRATEADO', { valorFijo: 1000000 }),
  g(16, 'Muestras DHL', 'FIJO_MENSUAL', { valorFijo: 240000 }),
  g(17, 'LinkedIn', 'FIJO_MENSUAL', { valorFijo: 75000 }),
  g(18, 'Seguro complementario de salud', 'FIJO_MENSUAL', { valorFijo: 129000, modoExcel: 'NO_EXISTE' }),
  g(19, 'IFS Food', 'ANUAL_MES', { valorFijo: 4000000 }),
  g(20, 'Kosher', 'ANUAL_MES', { valorFijo: 1000000, mesEspecifico: 10 }),
  g(21, 'Cuota Bancoestado', 'FIJO_MENSUAL', { valorFijo: 1200000, soloFlujo: true }),
  g(22, 'Inversiones en equipos', 'FIJO_MENSUAL', { valorFijo: 1000000, soloFlujo: true, modoExcel: 'FUERA_DE_TOTAL' }),
  g(23, 'Pintura y mantención de techos', 'FIJO_MENSUAL', { valorFijo: 500000, soloFlujo: true, modoExcel: 'FUERA_DE_TOTAL' }),
]

const ESC_NADARRA = [{ nContenedor: 2, pctDescuento: 5 }, { nContenedor: 3, pctDescuento: 10 }]
const CLIENTES = [
  { id: 1, nombre: 'DBC', kgPorCont: 16500, usdPorKg: 1.4, escalas: [], origenId: 1, incoterm: null, fleteUsdPorCont: 6200 },
  { id: 2, nombre: 'WHS', kgPorCont: 20000, usdPorKg: 1.127, escalas: [], origenId: 1, incoterm: 'CFR', fleteUsdPorCont: 2050 },
  { id: 3, nombre: 'NADARRA', kgPorCont: 20000, usdPorKg: 1.49, escalas: ESC_NADARRA, origenId: 2, incoterm: 'CIF', fleteUsdPorCont: 2700 },
]
const REGLAS = [
  { clienteId: 1, contenedores: 1, cadaNMeses: 1, desde: '2026-10', hasta: null },
  { clienteId: 2, contenedores: 1, cadaNMeses: 2, desde: '2026-10', hasta: null },
  { clienteId: 3, contenedores: 2, cadaNMeses: 12, desde: '2026-10', hasta: '2026-10' },
  { clienteId: 3, contenedores: 1, cadaNMeses: 12, desde: '2027-10', hasta: null },
]
// Camiones del Excel: 3 en octubre 2026, 1 por mes, 2 en cada octubre con NADARRA.
const CAMIONES = MESES.map((m) => (m === '2026-10' ? 3 : m.endsWith('-10') ? 2 : 1))

const base = (): EntradaPpto => ({
  meses: MESES, tc: 950, uf: 41050, mermaPct: 5, tonPorCamion: 28, stockInicialTon: 5,
  clientes: CLIENTES,
  origenes: [
    { id: 1, nombre: 'Albemarle', usdPorTon: 150, fleteUsdPorTon: 70.5263 },
    { id: 2, nombre: 'SQM', usdPorTon: 367, fleteUsdPorTon: 0 },
  ],
  gastos: GASTOS,
  empleados: [
    { cargo: 'Gerente general', bruto: 5628399 },
    { cargo: 'Director comercial', bruto: 1179941 },
    { cargo: 'Jefa de calidad', bruto: 1526754 },
    { cargo: 'Jefe de producción', bruto: 1685113 },
    { cargo: 'Jefe de turno', bruto: 1083239 },
    { cargo: 'Operario', bruto: null },
  ],
  incotermCostos: MATRIZ,
  contenedores: resolverContenedores(MESES, REGLAS),
  camiones: CAMIONES,
  bonoDescargaPorCamion: 35000,
  precioPlano: { 3: 1.453 },
})

const delAnio = (r: { meses: string[] }, valores: number[], anio: string) =>
  valores.filter((_, i) => r.meses[i].startsWith(anio)).reduce((s, x) => s + x, 0)

describe('reglas de frecuencia', () => {
  it('DBC 1/mes, WHS cada 2 meses, NADARRA 2 en oct-2026 y 1 por año después', () => {
    const c = resolverContenedores(MESES, REGLAS)
    expect(c[1].slice(0, 3)).toEqual([1, 1, 1])
    expect(c[2].slice(0, 5)).toEqual([1, 0, 1, 0, 1])
    expect(c[3][0]).toBe(2)
    expect(c[3][MESES.indexOf('2027-10')]).toBe(1)
    expect(c[3].filter((x) => x > 0).length).toBe(5)
  })
  it('una edición en la grilla gana sobre la regla', () => {
    const c = resolverContenedores(MESES, REGLAS, { 1: { '2026-11': 3 } })
    expect(c[1].slice(0, 3)).toEqual([1, 3, 1])
  })
})

describe('réplica del Excel (con sus errores): las cifras deben calzar', () => {
  const r = calcularPresupuesto(base(), 'excel')
  it('ventas 2027 ≈ $419,4 MM', () => {
    expect(delAnio(r, r.totalVentas, '2027')).toBeCloseTo(419425000, 0)
  })
  it('margen 2027 ≈ $88,9 MM', () => {
    expect(Math.round(delAnio(r, r.margen, '2027'))).toBe(88928777)
  })
  it('margen octubre 2026 ≈ $42,7 MM', () => {
    expect(Math.round(r.margen[0])).toBe(42715862)
    expect(Math.round(r.totalEgresos[0])).toBe(-55856138)
  })
  it('margen acumulado a dic-2030 y stock de MP del Excel', () => {
    // El Excel guarda el bruto del director como 1.000.000/0,8475: difiere en centésimas de peso.
    expect(Math.abs(r.margenAcum[r.margenAcum.length - 1] - 410726317)).toBeLessThan(1.5)
    expect(r.stockMPTon.slice(0, 6)).toEqual([9, 18, 8, 17, 7, 16])
  })
  it('reproduce los errores: inversiones y pintura positivas y fuera del total', () => {
    const inv = r.egresos.find((l) => l.nombre === 'Inversiones en equipos')!
    expect(inv.valores[0]).toBe(1000000)
    expect(inv.fueraDeTotal).toBe(true)
  })
})

describe('presupuesto corregido (sin los errores del Excel)', () => {
  const r = calcularPresupuesto(base(), 'corregido')

  it('la suma de las líneas es el total de egresos, todos los meses', () => {
    r.meses.forEach((_, i) => {
      const suma = r.egresos.reduce((s, l) => s + l.valores[i], 0)
      expect(r.totalEgresos[i]).toBeCloseTo(suma, 6)
      expect(r.margen[i]).toBeCloseTo(r.totalVentas[i] + suma, 6)
    })
  })
  it('todo egreso es negativo y entra al total, incluidas inversiones y pintura', () => {
    for (const l of r.egresos) {
      expect(l.fueraDeTotal).toBeFalsy()
      expect(Math.max(...l.valores)).toBeLessThanOrEqual(0)
    }
    expect(r.egresos.find((l) => l.nombre === 'Inversiones en equipos')!.valores[0]).toBe(-1000000)
  })
  it('Kosher se carga en octubre; IFS Food sin mes dispara advertencia', () => {
    const kosher = r.egresos.find((l) => l.nombre === 'Kosher')!
    expect(kosher.valores[0]).toBe(-1000000)
    expect(kosher.valores.filter((v) => v !== 0).length).toBe(5)
    expect(r.advertencias.some((a) => a.includes('IFS Food') && a.includes('sin mes'))).toBe(true)
  })
  it('el flete a Nueva York depende del incoterm de DBC', () => {
    expect(r.egresos.some((l) => l.nombre.includes('DBC'))).toBe(false)
    expect(r.advertencias.some((a) => a.startsWith('DBC: sin incoterm'))).toBe(true)
    const cif = base()
    cif.clientes = CLIENTES.map((c) => (c.id === 1 ? { ...c, incoterm: 'CIF' } : c))
    const rc = calcularPresupuesto(cif, 'corregido')
    expect(rc.egresos.find((l) => l.nombre.includes('DBC'))!.valores[0]).toBe(-6200 * 950)
    expect(rc.advertencias.some((a) => a.startsWith('DBC: sin incoterm'))).toBe(false)
  })
  it('FOB no paga flete marítimo; aduana y transporte solo donde el incoterm los incluye', () => {
    const e = base()
    e.clientes = CLIENTES.map((c) => ({ ...c, incoterm: 'EXW' }))
    const re = calcularPresupuesto(e, 'corregido')
    expect(re.egresos.some((l) => l.tipo === 'FLETE')).toBe(false)
    expect(re.egresos.find((l) => l.nombre === 'Agencia de aduanas')!.valores[0]).toBe(0)
  })
  it('los costos salen de kg y contenedores, no de los montos de venta', () => {
    const e = base()
    e.clientes = CLIENTES.map((c) => ({ ...c, usdPorKg: c.usdPorKg * 2 }))
    const r2 = calcularPresupuesto(e, 'corregido')
    const mp = (x: typeof r) => x.egresos.filter((l) => l.tipo === 'MP').map((l) => l.valores[0])
    expect(mp(r2)).toEqual(mp(r))
    expect(r2.totalVentas[0]).toBeGreaterThan(r.totalVentas[0])
  })
  it('el consumo de MP es kg / (1 − merma), igual en todos los meses', () => {
    // DBC solo, 16.500 kg: 17,368 t de MP, en cualquier mes.
    const e = base()
    e.contenedores = { 1: MESES.map(() => 1), 2: MESES.map(() => 0), 3: MESES.map(() => 0) }
    const rs = calcularPresupuesto(e, 'corregido')
    for (const t of rs.consumoMPTon) expect(t).toBeCloseTo(16.5 / 0.95, 9)
    expect(rs.stockMPTon[0]).toBeCloseTo(5 + 3 * 28 - 16.5 / 0.95, 9)
    expect(rs.stockMPTon[1]).toBeCloseTo(rs.stockMPTon[0] + 28 - 16.5 / 0.95, 9)
  })
  it('NADARRA usa las escalas: 2 contenedores en oct-2026 = US$58.110', () => {
    const nad = r.ventas.find((v) => v.clienteId === 3)!
    expect(nad.valores[0]).toBeCloseTo(58110 * 950, 6)
    // Con un solo contenedor se cobra el precio completo (1,49), no el promedio del Excel.
    expect(nad.valores[MESES.indexOf('2027-10')]).toBeCloseTo(29800 * 950, 6)
  })
  it('suma el bono de descarga por camión y avisa del sueldo faltante del operario', () => {
    expect(r.egresos.find((l) => l.clave === 'bono-descarga')!.valores[0]).toBe(-35000 * 3)
    expect(r.advertencias.some((a) => a.includes('Operario'))).toBe(true)
  })
  it('avisa si el stock de MP queda negativo', () => {
    const e = base()
    e.camiones = MESES.map(() => 0)
    const rs = calcularPresupuesto(e, 'corregido')
    expect(rs.advertencias.some((a) => a.includes('stock de materia prima queda negativo'))).toBe(true)
  })
})

describe('economía por contenedor', () => {
  it('contribución = venta − costo variable, y punto de equilibrio sobre los fijos', () => {
    const eco = economiaPorContenedor(base())
    const whs = eco.clientes.find((c) => c.clienteId === 2)!
    expect(whs.ventaCLP).toBeCloseTo(22540 * 950, 6)
    expect(whs.contribucionCLP).toBeCloseTo(whs.ventaCLP - whs.costoVariableCLP, 6)
    expect(whs.contribucionPct).toBeGreaterThan(0)
    expect(eco.fijosMensualesCLP).toBeGreaterThan(10_000_000)
    expect(eco.puntoEquilibrio).toBeGreaterThan(0)
  })
})
