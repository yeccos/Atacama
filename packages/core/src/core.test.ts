import { describe, expect, it } from 'vitest'
import {
  asumeCosto,
  consumirFIFO,
  descuentoContenedor,
  formatearRut,
  formatoCLP,
  formatoFecha,
  formatoNumero,
  formatoUSD,
  mpNecesariaTon,
  parseFechaCL,
  parseNumeroCL,
  totalPedidoUsdCent,
  validarHitos,
  validarRut,
} from './index'

describe('formato chileno', () => {
  it('miles con punto y decimales con coma', () => {
    expect(formatoNumero(1234567.891, 2)).toBe('1.234.567,89')
    expect(formatoCLP(10102270)).toBe('$10.102.270')
    expect(formatoCLP(-107152)).toBe('$-107.152')
    expect(formatoUSD(2254000)).toBe('US$22.540,00')
    expect(formatoNumero(null)).toBe('')
  })
  it('lee números en notación chilena', () => {
    expect(parseNumeroCL('1.234.567,89')).toBe(1234567.89)
    expect(parseNumeroCL('$ 450.000')).toBe(450000)
    expect(parseNumeroCL('1,127')).toBe(1.127)
    expect(parseNumeroCL('abc')).toBeNull()
    expect(parseNumeroCL('')).toBeNull()
  })
  it('fechas dd-mm-aaaa', () => {
    expect(formatoFecha('2026-09-30T00:00:00.000Z')).toBe('30-09-2026')
    expect(parseFechaCL('30-09-2026')).toBe('2026-09-30')
    expect(parseFechaCL('1/10/2026')).toBe('2026-10-01')
    expect(parseFechaCL('31-02-2026')).toBeNull()
  })
  it('RUT con dígito verificador', () => {
    expect(validarRut('76.086.428-5')).toBe(true)
    expect(validarRut('76.086.428-4')).toBe(false)
    expect(validarRut('12.345.678-5')).toBe(true)
    expect(validarRut('11.111.111-1')).toBe(true)
    expect(validarRut('6-K')).toBe(false)
    expect(formatearRut('760864285')).toBe('76.086.428-5')
  })
})

describe('forma de pago por hitos', () => {
  it('acepta 30/50/20 y rechaza lo que no suma 100', () => {
    expect(validarHitos([{ pct: 30 }, { pct: 50 }, { pct: 20 }])).toEqual({ ok: true, suma: 100 })
    expect(validarHitos([{ pct: 30 }, { pct: 60 }])).toEqual({ ok: false, suma: 90 })
    expect(validarHitos([]).ok).toBe(false)
  })
})

describe('escalas de descuento por pedido', () => {
  const nadarra = [
    { nContenedor: 2, pctDescuento: 5 },
    { nContenedor: 3, pctDescuento: 10 },
  ]
  it('1er contenedor sin descuento, 2º −5%, 3º −10%, y se mantiene', () => {
    expect([1, 2, 3, 4].map((n) => descuentoContenedor(nadarra, n))).toEqual([0, 5, 10, 10])
  })
  it('NADARRA oct-2026: 2 contenedores = US$58.110', () => {
    expect(totalPedidoUsdCent(1.49, 20000, 2, nadarra)).toBe(5811000)
  })
  it('WHS: 1 contenedor a 1,127 = US$22.540', () => {
    expect(totalPedidoUsdCent(1.127, 20000, 1)).toBe(2254000)
  })
})

describe('incoterm → costos que asume la empresa', () => {
  const matriz = {
    FOB: ['TRANSPORTE_INTERNO', 'ADUANA'],
    CIF: ['TRANSPORTE_INTERNO', 'ADUANA', 'FLETE_MARITIMO', 'SEGURO'],
  }
  it('FOB no paga flete marítimo, CIF sí', () => {
    expect(asumeCosto(matriz, 'FOB', 'FLETE_MARITIMO')).toBe(false)
    expect(asumeCosto(matriz, 'CIF', 'FLETE_MARITIMO')).toBe(true)
  })
  it('sin incoterm definido no se asume ningún costo', () => {
    expect(asumeCosto(matriz, null, 'ADUANA')).toBe(false)
  })
})

describe('materia prima por camión', () => {
  it('la MP necesaria sale de los kg y la merma, igual para todos los meses', () => {
    expect(mpNecesariaTon(16.5, 5)).toBe(17.368)
    expect(mpNecesariaTon(20, 5)).toBe(21.053)
  })
  it('un contenedor USA deja saldo en el camión de 28 t', () => {
    const { consumos, saldos, faltanteProductoTon } = consumirFIFO(
      [{ id: 1, disponibleTon: 28, mermaPct: null }],
      16.5,
      5,
    )
    expect(consumos).toEqual([{ loteId: 1, toneladasMP: 17.368, toneladasProducto: 16.5 }])
    expect(saldos[0].disponibleTon).toBe(10.632)
    expect(faltanteProductoTon).toBe(0)
  })
  it('usa el saldo del camión anterior y la merma propia de cada camión', () => {
    const { consumos, saldos } = consumirFIFO(
      [
        { id: 1, disponibleTon: 10.632, mermaPct: null },
        { id: 2, disponibleTon: 28, mermaPct: 4 },
      ],
      20,
      5,
    )
    expect(consumos[0]).toEqual({ loteId: 1, toneladasMP: 10.632, toneladasProducto: 10.1 })
    expect(consumos[1]).toEqual({ loteId: 2, toneladasMP: 10.312, toneladasProducto: 9.9 })
    expect(saldos.map((s) => s.disponibleTon)).toEqual([0, 17.688])
  })
  it('informa lo que falta cuando no alcanza el stock', () => {
    const { faltanteProductoTon } = consumirFIFO([{ id: 1, disponibleTon: 5, mermaPct: 5 }], 20, 5)
    expect(faltanteProductoTon).toBe(15.25)
  })
})
