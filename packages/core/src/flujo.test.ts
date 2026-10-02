import { describe, expect, it } from 'vitest'
import {
  armarFlujo,
  calendarioEmbarque,
  cobrosProyectados,
  partirMonto,
  sumarDias,
  type EntradaFlujo,
  type ResultadoPpto,
} from './index'

const pptoVacio = (meses: string[], extra: Partial<ResultadoPpto> = {}): ResultadoPpto => ({
  meses, contenedores: [], ventas: [], totalVentas: meses.map(() => 0), egresos: [],
  totalEgresos: meses.map(() => 0), margen: meses.map(() => 0), margenAcum: meses.map(() => 0),
  camiones: meses.map(() => 0), contProducidos: meses.map(() => 0), consumoMPTon: meses.map(() => 0),
  stockMPTon: meses.map(() => 0), advertencias: [], ...extra,
})

describe('fechas e hitos de cobro', () => {
  it('suma días cruzando meses', () => {
    expect(sumarDias('2026-10-15', 20)).toBe('2026-11-04')
    expect(sumarDias('2026-10-15', -30)).toBe('2026-09-15')
  })
  it('calendario del embarque: ETD a mitad de mes, ETA según el tránsito', () => {
    const c = calendarioEmbarque('2026-12', 20)
    expect(c.ETD).toBe('2026-12-15')
    expect(c.ETA).toBe('2027-01-04')
    expect(c.OC).toBe('2026-11-15')
  })
  it('reparte el total sin perder centavos', () => {
    const p = partirMonto(2254000, [30, 50, 20])
    expect(p).toEqual([676200, 1127000, 450800])
    expect(partirMonto(100, [33, 33, 34]).reduce((s, x) => s + x, 0)).toBe(100)
  })
  it('WHS: 30% a la OC, 50% al BL y 20% a la llegada', () => {
    const { cobros } = cobrosProyectados(
      [{ id: 2, nombre: 'WHS', kgPorCont: 20000, usdPorKg: 1.127, escalas: [], diasTransito: 20,
         hitos: [{ pct: 30, evento: 'OC', diasDesfase: 0 }, { pct: 50, evento: 'BL', diasDesfase: 0 }, { pct: 20, evento: 'ETA', diasDesfase: 0 }] }],
      ['2026-12'], { 2: [1] }, new Set(),
    )
    expect(cobros.map((c) => [c.fecha, c.usdCent])).toEqual([
      ['2026-11-15', 676200], ['2026-12-15', 1127000], ['2027-01-04', 450800],
    ])
  })
  it('omite los pares cliente+mes que ya tienen un embarque real', () => {
    const cli = { id: 1, nombre: 'DBC', kgPorCont: 16500, usdPorKg: 1.4, escalas: [], diasTransito: 15, hitos: [] }
    const { cobros, advertencias } = cobrosProyectados([cli], ['2026-10', '2026-11'], { 1: [1, 1] }, new Set(['1|2026-10']))
    expect(cobros.map((c) => c.fecha)).toEqual(['2026-11-15'])
    expect(advertencias[0]).toContain('sin forma de pago')
  })
})

describe('flujo de caja', () => {
  const MESES = ['2026-09', '2026-10', '2026-11']
  const base = (): EntradaFlujo => ({
    ppto: pptoVacio(['2026-10', '2026-11'], {
      egresos: [
        { clave: 'a', nombre: 'Gasto con IVA', valores: [-1000000, -1000000], afectoIVA: true, tipo: 'FIJO' },
        { clave: 'b', nombre: 'Flete', valores: [-500000, 0], afectoIVA: false, tipo: 'FLETE' },
        { clave: 'r', nombre: 'Remuneraciones', valores: [-11000000, -11000000], afectoIVA: false, tipo: 'REMUNERACION' },
      ],
    }),
    tc: 950, meses: MESES, saldoInicial: 10102270, cobros: [], partidas: [], deudas: [],
    sueldosLiquidos: 9400000, previredMensual: 2000000, ivaPct: 19, devolucionIVAModo: 'fijo',
    devolucionIVAMensual: 1500000, rezagoIVAMeses: 1, mesesSinFin: 2, saldoMinimo: 0,
  })

  it('con las partidas de la última semana de septiembre, el saldo calza con el Excel ($1.156.978)', () => {
    const e = base()
    e.partidas = [
      { fecha: '2026-09-30', concepto: 'Rossi', monto: -1584870 },
      { fecha: '2026-09-30', concepto: 'Servitral', monto: -1339322 },
      { fecha: '2026-09-30', concepto: 'Sueldos', monto: -9400000 },
      { fecha: '2026-09-30', concepto: 'Arriendo a Manuel', monto: -2600000 },
      { fecha: '2026-09-30', concepto: 'Contabilidad', monto: -243000 },
      { fecha: '2026-09-30', concepto: 'Seguro complementario de salud', monto: -129000 },
      { fecha: '2026-09-30', concepto: 'Linkedin', monto: -73000 },
      { fecha: '2026-09-30', concepto: 'WHSP 30%', monto: 6423900 },
    ]
    const f = armarFlujo(e)
    expect(f.totalEgresos[0]).toBe(15369192)
    expect(f.saldoFinal[0]).toBe(1156978)
  })
  it('los egresos afectos llevan IVA y el flete marítimo no', () => {
    const f = armarFlujo(base())
    expect(f.egresos.find((l) => l.clave === 'a')!.valores).toEqual([0, 1190000, 1190000])
    expect(f.egresos.find((l) => l.clave === 'b')!.valores).toEqual([0, 500000, 0])
  })
  it('un ajuste reemplaza el monto de una línea en un mes, recalcula el saldo y recuerda el original', () => {
    const e = base()
    const sin = armarFlujo(e)
    e.ajustes = [{ clave: 'a', mes: MESES[1], monto: 2000000 }]
    const con = armarFlujo(e)
    expect(con.egresos.find((l) => l.clave === 'a')!.valores).toEqual([0, 2000000, 1190000])
    expect(con.ajustados).toEqual([{ clave: 'a', mes: MESES[1], original: 1190000 }])
    expect(sin.saldoFinal[1] - con.saldoFinal[1]).toBe(810000)
  })
  it('sueldos líquidos y Previred reemplazan a las remuneraciones del presupuesto', () => {
    const f = armarFlujo(base())
    expect(f.egresos.some((l) => l.clave === 'r')).toBe(false)
    expect(f.egresos.find((l) => l.clave === 'sueldos')!.valores).toEqual([0, 9400000, 9400000])
    expect(f.egresos.find((l) => l.clave === 'previred')!.valores).toEqual([0, 2000000, 2000000])
  })
  it('un cobro atrasado se mueve de mes y el saldo lo refleja', () => {
    const e = base()
    const cobro = (fecha: string) => ({ clienteId: 1, nombre: 'DBC', fecha, usdCent: 2310000, origen: 'REAL' as const })
    e.cobros = [cobro('2026-10-15')]
    const puntual = armarFlujo(e)
    e.cobros = [cobro('2026-11-14')]
    const atrasado = armarFlujo(e)
    expect(puntual.ingresos.find((l) => l.clave === 'cobro-1')!.valores).toEqual([0, 21945000, 0])
    expect(atrasado.ingresos.find((l) => l.clave === 'cobro-1')!.valores).toEqual([0, 0, 21945000])
    expect(atrasado.saldoFinal[1]).toBe(puntual.saldoFinal[1] - 21945000)
    expect(atrasado.saldoFinal[2]).toBe(puntual.saldoFinal[2])
  })
  it('cuotas de deuda: respetan la fecha de término o se proyectan unos meses', () => {
    const e = base()
    e.deudas = [
      { acreedor: 'Rossi', cuota: 1584870, desde: null, hasta: null },
      { acreedor: 'Banco', cuota: 100, desde: '2026-10', hasta: '2026-10' },
    ]
    const f = armarFlujo(e)
    expect(f.egresos.find((l) => l.clave === 'deuda-Rossi')!.valores).toEqual([0, 1584870, 1584870])
    expect(f.egresos.find((l) => l.clave === 'deuda-Banco')!.valores).toEqual([0, 100, 0])
  })
  it('devolución de IVA: fija ($1,5 MM) o calculada con rezago sobre el IVA crédito', () => {
    const fijo = armarFlujo(base())
    expect(fijo.ingresos.find((l) => l.clave === 'devolucion-iva')!.valores).toEqual([0, 1500000, 1500000])
    const e = base()
    e.devolucionIVAModo = 'calculado'
    const calc = armarFlujo(e)
    expect(calc.ivaCredito).toEqual([0, 190000, 190000])
    expect(calc.ingresos.find((l) => l.clave === 'devolucion-iva')!.valores).toEqual([0, 0, 190000])
  })
  it('alerta cuando el saldo queda negativo o bajo el mínimo', () => {
    const e = base()
    e.saldoInicial = 0
    e.saldoMinimo = 5000000
    const f = armarFlujo(e)
    expect(f.alertas.some((a) => a.tipo === 'SALDO_NEGATIVO')).toBe(true)
    e.saldoInicial = 100000000
    e.saldoMinimo = 90000000
    expect(armarFlujo(e).alertas.every((a) => a.tipo === 'SALDO_BAJO')).toBe(true)
  })
  it('el saldo de cada mes es el del mes anterior más el flujo neto', () => {
    const f = armarFlujo(base())
    f.saldoFinal.forEach((s, i) => {
      expect(s).toBeCloseTo((i === 0 ? f.saldoInicial : f.saldoFinal[i - 1]) + f.totalIngresos[i] - f.totalEgresos[i], 6)
    })
  })
})

describe('cobros por hito', () => {
  it('muestra una línea por hito: 30% a la OC, 50% contra BL, 20% a la llegada', () => {
    const e: EntradaFlujo = {
      ppto: pptoVacio(['2026-10', '2026-11']), tc: 950, meses: ['2026-10', '2026-11'], saldoInicial: 0,
      cobros: [
        { clienteId: 2, nombre: 'WHS', fecha: '2026-10-15', usdCent: 1127000, origen: 'REAL', evento: 'BL', pct: 50 },
        { clienteId: 2, nombre: 'WHS', fecha: '2026-11-04', usdCent: 450800, origen: 'REAL', evento: 'ETA', pct: 20 },
      ],
      partidas: [], deudas: [], sueldosLiquidos: 0, previredMensual: 0, ivaPct: 19, devolucionIVAModo: 'fijo',
      devolucionIVAMensual: 0, rezagoIVAMeses: 1, mesesSinFin: 1, saldoMinimo: 0,
    }
    const f = armarFlujo(e)
    expect(f.ingresos.map((l) => l.nombre)).toEqual(['Cobros WHS · 50% contra BL', 'Cobros WHS · 20% a la llegada'])
    expect(f.ingresos[0].valores).toEqual([10706500, 0])
    expect(f.ingresos[1].valores).toEqual([0, 4282600])
  })
})
