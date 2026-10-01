// Reglas comerciales: forma de pago por hitos, escalas de descuento e incoterms.

export const EVENTOS_HITO = ['OC', 'PRODUCCION', 'ETD', 'BL', 'ETA', 'FACTURA', 'FECHA_FIJA'] as const
export type EventoHito = (typeof EVENTOS_HITO)[number]

export interface HitoPago {
  pct: number
  evento: string
  diasDesfase: number
}

/** Los porcentajes de la forma de pago deben sumar 100. */
export function validarHitos(hitos: Pick<HitoPago, 'pct'>[]): { ok: boolean; suma: number } {
  const suma = Math.round(hitos.reduce((s, h) => s + Number(h.pct), 0) * 100) / 100
  return { ok: hitos.length > 0 && suma === 100, suma }
}

export interface Escala {
  nContenedor: number
  pctDescuento: number
}

/**
 * Descuento que corresponde al contenedor n (1 = primero) dentro de un pedido.
 * Los contenedores posteriores a la última escala mantienen el descuento de esa escala.
 */
export function descuentoContenedor(escalas: Escala[], n: number): number {
  let pct = 0
  for (const e of [...escalas].sort((a, b) => a.nContenedor - b.nContenedor)) {
    if (e.nContenedor <= n) pct = Number(e.pctDescuento)
  }
  return pct
}

/** Total del pedido en centavos de USD, aplicando la escala contenedor por contenedor. */
export function totalPedidoUsdCent(
  usdPorKg: number,
  kgPorContenedor: number,
  contenedores: number,
  escalas: Escala[] = [],
): number {
  let total = 0
  for (let n = 1; n <= contenedores; n++) {
    const pct = descuentoContenedor(escalas, n)
    total += Math.round(usdPorKg * kgPorContenedor * (1 - pct / 100) * 100)
  }
  return total
}

/**
 * ¿La empresa asume este tipo de costo bajo el incoterm dado?
 * `matriz` viene de la tabla IncotermCosto. Sin incoterm definido no se asume ningún costo:
 * la app debe mostrar la advertencia en vez de adivinar.
 */
export function asumeCosto(
  matriz: Record<string, string[]>,
  incoterm: string | null | undefined,
  tipoCosto: string,
): boolean {
  if (!incoterm) return false
  return (matriz[incoterm] ?? []).includes(tipoCosto)
}
