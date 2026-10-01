// Materia prima por camión (lote). Cada camión tiene su propia merma y va dejando saldo.

export interface LoteMP {
  id: number
  /** MP bruta que queda en el camión, en toneladas. */
  disponibleTon: number
  /** Merma real de este camión en %. Null = se usa la merma por defecto. */
  mermaPct: number | null
}

export interface ConsumoLote {
  loteId: number
  toneladasMP: number
  toneladasProducto: number
}

const r3 = (n: number) => Math.round(n * 1000) / 1000

/** MP bruta necesaria para obtener `tonProducto` con la merma dada. */
export function mpNecesariaTon(tonProducto: number, mermaPct: number): number {
  return r3(tonProducto / (1 - mermaPct / 100))
}

/**
 * Consume los camiones en orden (el más antiguo primero) hasta producir `tonProducto`.
 * No modifica los lotes recibidos: devuelve los consumos, los saldos y lo que faltó producir.
 */
export function consumirFIFO(
  lotes: LoteMP[],
  tonProducto: number,
  mermaDefectoPct: number,
): { consumos: ConsumoLote[]; saldos: LoteMP[]; faltanteProductoTon: number } {
  const consumos: ConsumoLote[] = []
  const saldos = lotes.map((l) => ({ ...l }))
  let pendiente = tonProducto
  for (const lote of saldos) {
    if (pendiente <= 0.0005) break
    if (lote.disponibleTon <= 0) continue
    const rendimiento = 1 - (lote.mermaPct ?? mermaDefectoPct) / 100
    const producto = Math.min(pendiente, lote.disponibleTon * rendimiento)
    const mp = producto / rendimiento
    lote.disponibleTon = r3(lote.disponibleTon - mp)
    pendiente -= producto
    consumos.push({ loteId: lote.id, toneladasMP: r3(mp), toneladasProducto: r3(producto) })
  }
  return { consumos, saldos, faltanteProductoTon: r3(Math.max(pendiente, 0)) }
}
