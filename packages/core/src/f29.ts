// Impuestos que se pagan con el F29 (se declara y paga a mediados del mes siguiente), aparte de la devolución de IVA:
//  - PPM (pago provisional mensual): un % de las ventas del mes (tasa PPM de la 1ª categoría, hoy 1%).
//  - Retención de impuesto único de trabajadores (art. 74 N° 1): un monto mensual según los sueldos.
// Ejemplo, F29 de agosto 2026: 1% × $19.805.956 = $198.060 de PPM + $357.819 de retención = $555.879, pagado el 16-09.
import type { ResultadoPpto } from './presupuesto'

/** Lo que se paga con el F29 en cada mes del presupuesto: el PPM de las ventas del mes anterior más la retención. */
export function impuestosF29(ppto: ResultadoPpto, ppmPct: number, retencionMensual: number, ventasMesPrevio?: number): number[] {
  return ppto.meses.map((_, j) => {
    // El primer mes paga las ventas del mes anterior al presupuesto (septiembre), que no están en él: se entregan aparte o, si no, se usa el mismo mes.
    const ventas = j === 0 ? (ventasMesPrevio ?? ppto.totalVentas[0] ?? 0) : (ppto.totalVentas[j - 1] ?? 0)
    return Math.round((ventas * ppmPct) / 100 + retencionMensual)
  })
}
