import { describe, expect, it } from 'vitest'
import { devolucionesIVA, ivaCreditoPorMes, type ResultadoPpto } from './index'

const ppto = (): ResultadoPpto => ({
  meses: ['2026-10', '2026-11', '2026-12'], contenedores: [], ventas: [], totalVentas: [0, 0, 0],
  egresos: [
    { clave: 'mp', nombre: 'MP', valores: [-1000000, -1000000, -1000000], afectoIVA: true, tipo: 'MP' },
    { clave: 'g', nombre: 'Gasto', valores: [-500000, -500000, -500000], afectoIVA: true, tipo: 'FIJO' },
    { clave: 'f', nombre: 'Flete', valores: [-300000, -300000, -300000], afectoIVA: false, tipo: 'FLETE' },
  ],
  totalEgresos: [0, 0, 0], margen: [0, 0, 0], margenAcum: [0, 0, 0], camiones: [0, 0, 0], contProducidos: [0, 0, 0],
  consumoMPTon: [0, 0, 0], stockMPTon: [0, 0, 0], advertencias: [],
})
const base = { ppto: ppto(), ivaPct: 19, modo: 'calculado' as const, mensual: 1500000, rezago: 1, pct: 100, periodos: [] }

describe('IVA exportador', () => {
  it('el IVA de la materia prima ya pagada nace el mes anterior', () => {
    const c = ivaCreditoPorMes(ppto(), 19, '2026-10')
    expect(c['2026-09']).toBeCloseTo(190000) // MP de octubre, comprada en septiembre
    expect(c['2026-10']).toBeCloseTo(95000) // solo el gasto fijo
    expect(c['2026-11']).toBeCloseTo(285000) // MP + gasto
  })
  it('la devolución llega el mes siguiente y por el % recuperable', () => {
    const d = devolucionesIVA({ ...base, mpPagadoHasta: '2026-10', pct: 50 })
    expect(d.find((x) => x.mes === '2026-10')!.monto).toBeCloseTo(95000)
    expect(d.find((x) => x.mes === '2026-11')!.monto).toBeCloseTo(47500)
  })
  it('un ajuste manda: crédito real o devolución esperada con su fecha', () => {
    const d = devolucionesIVA({
      ...base, mpPagadoHasta: '2026-10',
      periodos: [{ mes: '2026-09', devolucionEsperada: 4000000, fechaDevolucion: '2026-10-24' }, { mes: '2026-10', ivaCredito: 1000000 }],
    })
    expect(d.find((x) => x.fecha === '2026-10-24')!.monto).toBe(4000000)
    expect(d.find((x) => x.mes === '2026-11')!.monto).toBe(1000000)
  })
  it('modo fijo: el mismo monto todos los meses', () => {
    expect(devolucionesIVA({ ...base, modo: 'fijo' }).map((d) => d.monto)).toEqual([1500000, 1500000, 1500000])
  })
})

import { impuestosF29 } from './index'

describe('impuestos del F29', () => {
  it('PPM de las ventas del mes anterior más la retención de trabajadores', () => {
    const p = ppto()
    p.totalVentas = [10000000, 20000000, 30000000]
    // El primer mes usa sus propias ventas como aproximación de las de septiembre.
    expect(impuestosF29(p, 1, 357819)).toEqual([457819, 457819, 557819])
  })
})
