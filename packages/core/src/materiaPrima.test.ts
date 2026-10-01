import { describe, expect, it } from 'vitest'
import { planificarMP, type EntradaPpto } from './index'

const MESES = ['2026-10', '2026-11', '2026-12']

const base = (): EntradaPpto => ({
  meses: MESES, tc: 950, uf: 41050, mermaPct: 5, tonPorCamion: 28, stockInicialTon: 0,
  clientes: [
    { id: 1, nombre: 'DBC', kgPorCont: 20000, usdPorKg: 1.4, escalas: [], origenId: 1, incoterm: 'FOB', fleteUsdPorCont: null },
    { id: 2, nombre: 'NADARRA', kgPorCont: 20000, usdPorKg: 1.49, escalas: [], origenId: 2, incoterm: 'CIF', fleteUsdPorCont: null },
  ],
  origenes: [
    { id: 1, nombre: 'Albemarle', usdPorTon: 150, fleteUsdPorTon: 70.5263 },
    { id: 2, nombre: 'SQM', usdPorTon: 367, fleteUsdPorTon: 0 },
  ],
  gastos: [], empleados: [], incotermCostos: {},
  contenedores: { 1: [1, 1, 1], 2: [0, 0, 0] },
  camiones: [0, 0, 0], bonoDescargaPorCamion: 0,
})

describe('plan de materia prima por origen', () => {
  it('el consumo es kg ÷ (1 − merma) y cada origen usa solo lo de sus clientes', () => {
    const e = base()
    e.contenedores = { 1: [1, 1, 1], 2: [2, 0, 0] }
    const [alb, sqm] = planificarMP(e, {}, { 1: 100, 2: 100 })
    expect(alb.consumoT).toEqual([21.053, 21.053, 21.053])
    expect(sqm.consumoT).toEqual([42.105, 0, 0])
  })
  it('un camión de 28 t deja saldo: se vende sin comprar mientras el stock alcance', () => {
    const [alb] = planificarMP(base(), { 1: [1, 0, 0] }, { 1: 5 })
    // Oct: 5 + 28 − 21,053 = 11,947. Nov: parte con 11,947 < 21,053 → hay que comprar.
    expect(alb.stockFinalT[0]).toBe(11.947)
    expect(alb.ventaSinComprar).toEqual([false, false, false])
    // Con 30 t de stock inicial, octubre se vende sin comprar.
    const [holgado] = planificarMP(base(), {}, { 1: 30 })
    expect(holgado.ventaSinComprar).toEqual([true, false, false])
    expect(holgado.stockFinalT[0]).toBe(8.947)
  })
  it('sugiere los camiones mínimos para no quedar sin stock', () => {
    const [alb] = planificarMP(base(), {}, { 1: 30 })
    // Oct: alcanza (30 ≥ 21,05). Nov: quedan 8,95 → falta → 1 camión. Dic: 8,95+28−21,05 = 15,9 → 1 camión.
    expect(alb.camionesSugeridos).toEqual([0, 1, 1])
  })
  it('respeta un stock mínimo de seguridad', () => {
    const [alb] = planificarMP(base(), {}, { 1: 30 }, 15)
    // Oct: 30 − 21,05 = 8,95 < 15 → 1 camión ya en octubre.
    expect(alb.camionesSugeridos[0]).toBe(1)
  })
  it('valora el excedente al costo por tonelada del origen', () => {
    const [alb] = planificarMP(base(), { 1: [1, 0, 0] }, { 1: 5 })
    expect(alb.costoPorTonCLP).toBeCloseTo(220.5263 * 950, 4)
    expect(alb.valorStockFinalCLP[0]).toBeCloseTo(11.947 * 220.5263 * 950, 2)
  })
  it('un origen sin uso, sin stock y sin compras no aparece', () => {
    const planes = planificarMP(base(), {}, { 1: 10 })
    expect(planes.map((p) => p.nombre)).toEqual(['Albemarle'])
  })
})
