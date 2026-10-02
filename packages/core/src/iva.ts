// IVA exportador: la empresa vende con IVA 0 (exportación) y compra con IVA, así que acumula IVA crédito que el SII
// devuelve unos 30 a 60 días después de la compra (se pide en el F29 del mes siguiente).
//
// Cálculo: el IVA crédito de cada mes es el IVA de las compras de ese mes (costos afectos del presupuesto); la materia prima ya
// pagada se compró el mes anterior a su consumo, así que su IVA nace antes. La devolución llega `rezago` meses después y es
// ese crédito por el % recuperable. Se puede ajustar cualquier mes con el crédito real o con la devolución esperada y su fecha.
import type { ResultadoPpto } from './presupuesto'

/** Ajuste del usuario para un mes de compra: crédito real, devolución esperada y/o fecha en que se espera. */
export interface PeriodoIVAIn {
  /** Mes de las compras ('aaaa-mm'). */
  mes: string
  ivaCredito?: number | null
  devolucionEsperada?: number | null
  /** Fecha esperada de la devolución (aaaa-mm-dd). */
  fechaDevolucion?: string | null
}

export interface DevolucionIVA {
  /** Mes en que llega la plata. */
  mes: string
  /** Día exacto si el usuario lo conoce. */
  fecha: string | null
  monto: number
}

const idx = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1
const mesDe = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`

/** IVA crédito por mes de compra (incluye el mes anterior al primero del presupuesto, por la materia prima ya pagada). */
export function ivaCreditoPorMes(ppto: ResultadoPpto, ivaPct: number, mpPagadoHasta?: string): Record<string, number> {
  const credito: Record<string, number> = {}
  for (const l of ppto.egresos) {
    if (!l.afectoIVA || l.tipo === 'REMUNERACION') continue
    ppto.meses.forEach((ym, i) => {
      const neto = -l.valores[i]
      if (neto === 0) return
      const compra = l.tipo === 'MP' && mpPagadoHasta && ym <= mpPagadoHasta ? mesDe(idx(ym) - 1) : ym
      credito[compra] = (credito[compra] ?? 0) + neto * (ivaPct / 100)
    })
  }
  return credito
}

export function devolucionesIVA(o: {
  ppto: ResultadoPpto
  ivaPct: number
  mpPagadoHasta?: string
  modo: 'fijo' | 'calculado'
  mensual: number
  rezago: number
  pct: number
  periodos: PeriodoIVAIn[]
}): DevolucionIVA[] {
  if (o.modo === 'fijo') return o.ppto.meses.map((mes) => ({ mes, fecha: null, monto: o.mensual })).filter((d) => d.monto !== 0)
  const credito = ivaCreditoPorMes(o.ppto, o.ivaPct, o.mpPagadoHasta)
  const meses = new Set([...Object.keys(credito), ...o.periodos.map((p) => p.mes)])
  const out: DevolucionIVA[] = []
  for (const cm of meses) {
    const aj = o.periodos.find((p) => p.mes === cm)
    const base = aj?.ivaCredito ?? credito[cm] ?? 0
    const monto = aj?.devolucionEsperada ?? (base * o.pct) / 100
    if (!monto) continue
    const fecha = aj?.fechaDevolucion ?? null
    out.push({ mes: fecha ? fecha.slice(0, 7) : mesDe(idx(cm) + o.rezago), fecha, monto })
  }
  return out.sort((a, b) => a.mes.localeCompare(b.mes))
}
