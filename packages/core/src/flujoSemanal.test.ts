import { describe, expect, it } from 'vitest'
import {
  armarFlujo,
  armarFlujoSemanal,
  PARAMS_SEMANAL_POR_DEFECTO,
  resumirFlujoSemanal,
  type EntradaFlujoSemanal,
  type ResultadoPpto,
} from './index'

const MESES = ['2026-10', '2026-11']
const ppto = (): ResultadoPpto => ({
  meses: MESES, contenedores: [], ventas: [], totalVentas: [0, 0],
  egresos: [
    { clave: 'mp', nombre: 'MP', valores: [-1000000, -500000], afectoIVA: true, tipo: 'MP' },
    { clave: 'aduana', nombre: 'Aduana', valores: [-200000, -100000], afectoIVA: true, tipo: 'VARIABLE' },
    { clave: 'arriendo', nombre: 'Arriendo', valores: [-2000000, -2000000], afectoIVA: false, tipo: 'FIJO' },
    { clave: 'r', nombre: 'Remuneraciones', valores: [-11000000, -11000000], afectoIVA: false, tipo: 'REMUNERACION' },
  ],
  totalEgresos: [0, 0], margen: [0, 0], margenAcum: [0, 0], camiones: [0, 0], contProducidos: [0, 0],
  consumoMPTon: [0, 0], stockMPTon: [0, 0], advertencias: [],
})

const base = (): EntradaFlujoSemanal => ({
  ppto: ppto(), tc: 950, saldoInicial: 10000000, cobros: [], partidas: [], deudas: [],
  sueldosLiquidos: 9000000, previredMensual: 2000000, ivaPct: 19, devolucionIVAModo: 'fijo',
  devolucionIVAMensual: 1500000, rezagoIVAMeses: 1, mesesSinFin: 2, saldoMinimo: 0,
  inicio: '2026-10-01', nSemanas: 9, params: PARAMS_SEMANAL_POR_DEFECTO,
})

const linea = (r: ReturnType<typeof armarFlujoSemanal>, grupo: 'ingresos' | 'egresos', clave: string) => r[grupo].find((l) => l.clave === clave)!.valores

describe('flujo semanal', () => {
  it('tiene un período de cierre más una columna por semana', () => {
    const r = armarFlujoSemanal(base())
    expect(r.periodos.length).toBe(10)
    expect(r.periodos[0]).toEqual({ desde: null, hasta: '2026-09-30' })
    expect(r.periodos[1]).toEqual({ desde: '2026-10-01', hasta: '2026-10-07' })
    expect(r.periodos[9].hasta).toBe('2026-12-02')
  })
  it('cada costo cae en su fecha: ETD el 15, producción 7 días antes, fijos el 10, sueldos a fin de mes', () => {
    const r = armarFlujoSemanal(base())
    // 15-oct está en la semana 3 (15 al 21); 8-oct en la semana 2 (8 al 14).
    expect(linea(r, 'egresos', 'aduana')[3]).toBeCloseTo(238000, 6)
    expect(linea(r, 'egresos', 'mp')[2]).toBeCloseTo(1190000, 6)
    expect(linea(r, 'egresos', 'arriendo')[2]).toBe(2000000) // 10-oct
    expect(linea(r, 'egresos', 'sueldos')[5]).toBe(9000000) // 31-oct: semana 5 (29-oct al 4-nov)
    expect(linea(r, 'egresos', 'previred')[2]).toBe(2000000)
  })
  it('un cobro cae en la semana de su fecha; uno atrasado (anterior al inicio) se espera en la semana 1', () => {
    const e = base()
    e.cobros = [
      { clienteId: 1, nombre: 'DBC', fecha: '2026-10-15', usdCent: 2310000, origen: 'REAL' },
      { clienteId: 1, nombre: 'DBC', fecha: '2026-09-20', usdCent: 100000, origen: 'REAL' },
      { clienteId: 1, nombre: 'DBC', fecha: '2027-03-01', usdCent: 999999, origen: 'PROYECTADO' },
    ]
    const v = linea(armarFlujoSemanal(e), 'ingresos', 'cobro-1')
    expect(v[3]).toBe(21945000)
    expect(v[1]).toBe(950000)
    expect(v.reduce((s, x) => s + x, 0)).toBe(21945000 + 950000) // el de 2027 queda fuera del horizonte
  })
  it('las partidas anteriores al inicio van al cierre', () => {
    const e = base()
    e.partidas = [{ fecha: '2026-09-30', concepto: 'Rossi', monto: -1584870 }, { fecha: '2026-09-30', concepto: 'WHSP', monto: 6423900 }]
    const r = armarFlujoSemanal(e)
    expect(linea(r, 'egresos', 'partida-Rossi')[0]).toBe(1584870)
    expect(r.saldoFinal[0]).toBe(10000000 - 1584870 + 6423900)
  })
  it('suma lo mismo que el flujo mensual en los meses completos (octubre y noviembre)', () => {
    const e = base()
    const sem = armarFlujoSemanal(e)
    const men = armarFlujo({ ...e, meses: MESES })
    const costosSemanales = sem.totalEgresos.slice(1).reduce((s, x) => s + x, 0)
    const costosMensuales = men.totalEgresos.reduce((s, x) => s + x, 0)
    // Diciembre 2-... no tiene eventos antes del 3-dic: el semanal solo ve octubre y noviembre.
    expect(costosSemanales).toBeCloseTo(costosMensuales, 6)
    const ivaSem = sem.ingresos.find((l) => l.clave === 'devolucion-iva')!.valores.reduce((s, x) => s + x, 0)
    expect(ivaSem).toBe(3000000)
  })
  it('el saldo de cada período es el anterior más el flujo neto', () => {
    const r = armarFlujoSemanal(base())
    r.saldoFinal.forEach((s, i) => expect(s).toBeCloseTo((i === 0 ? r.saldoInicial : r.saldoFinal[i - 1]) + r.flujoNeto[i], 6))
  })
  it('resumen: saldo mínimo, semana crítica y caja que faltaría', () => {
    const e = base()
    e.saldoInicial = 0
    const resumen = resumirFlujoSemanal(armarFlujoSemanal(e), 5000000)
    expect(resumen.saldoMinimo).toBeLessThan(0)
    expect(resumen.primeraSemanaNegativa).not.toBeNull()
    expect(resumen.cajaNecesaria).toBeCloseTo(5000000 - resumen.saldoMinimo, 6)
    const holgado = base()
    holgado.saldoInicial = 1_000_000_000
    const r2 = resumirFlujoSemanal(armarFlujoSemanal(holgado))
    expect(r2.primeraSemanaNegativa).toBeNull()
    expect(r2.cajaNecesaria).toBe(0)
  })
})

describe('plazo de pago del proveedor', () => {
  it('semanal: 30 días de plazo mueven el pago de la materia prima de la semana 2 a la 6', () => {
    const e = base()
    e.ppto.egresos = e.ppto.egresos.map((l) => (l.clave === 'mp' ? { ...l, diasPago: 30 } : l))
    const v = linea(armarFlujoSemanal(e), 'egresos', 'mp')
    // Oct: producción el 8-oct + 30 días = 7-nov (semana 6: 5 al 11 nov).
    expect(v[2]).toBe(0)
    expect(v[6]).toBeCloseTo(1190000, 6)
  })
  it('mensual: 30 días de plazo pasan el pago de octubre a noviembre', () => {
    const e = base()
    e.ppto.egresos = e.ppto.egresos.map((l) => (l.clave === 'mp' ? { ...l, diasPago: 30 } : l))
    const m = armarFlujo({ ...e, meses: ['2026-09', ...MESES] })
    expect(m.egresos.find((l) => l.clave === 'mp')!.valores).toEqual([0, 0, 1190000])
  })
})
