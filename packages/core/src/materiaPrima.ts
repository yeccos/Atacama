// Plan de materia prima por origen: cuánto se compra, cuánto se consume, cuánto queda y cuándo se puede
// vender sin comprar. Cada camión trae 28 t brutas; producir exige MP = kg vendidos ÷ (1 − merma), así que
// un camión casi nunca calza con los contenedores y va dejando saldo (excedente) que sirve para el siguiente.
import { contenedoresDeOrigen, costoTonOrigenCLP, type EntradaPpto } from './presupuesto'

export interface PlanMPOrigen {
  origenId: number
  nombre: string
  meses: string[]
  /** Stock al comenzar el primer mes. */
  stockInicialT: number
  /** Camiones comprados por mes (el plan, editable). */
  camiones: number[]
  compradasT: number[]
  /** MP bruta que se usa para producir lo que se vende ese mes. */
  consumoT: number[]
  /** Stock al comenzar el mes, antes de comprar. */
  stockInicioMesT: number[]
  stockFinalT: number[]
  /** El stock con que parte el mes alcanza para lo que se vende: se vende sin comprar. */
  ventaSinComprar: boolean[]
  /** Camiones mínimos para no quedar bajo el stock mínimo, partiendo del stock de hoy. */
  camionesSugeridos: number[]
  /** Costo de una tonelada de este origen puesta en planta, en pesos (precio + flete). */
  costoPorTonCLP: number
  /** Valor del stock que queda al cierre del mes (capital inmovilizado). */
  valorStockFinalCLP: number[]
}

const r3 = (x: number) => Math.round(x * 1000) / 1000

export function planificarMP(
  e: EntradaPpto,
  camionesPorOrigen: Record<number, number[]>,
  stockInicialPorOrigen: Record<number, number>,
  stockMinimoT = 0,
): PlanMPOrigen[] {
  const planes: PlanMPOrigen[] = []
  for (const o of e.origenes) {
    const consumo = e.meses.map((_, i) =>
      r3(
        e.clientes
          .reduce((s, c) => s + (contenedoresDeOrigen(e, c, o.id, i) * c.kgPorCont) / 1000 / (1 - e.mermaPct / 100), 0),
      ),
    )
    const camiones = e.meses.map((_, i) => camionesPorOrigen[o.id]?.[i] ?? 0)
    const stock0 = stockInicialPorOrigen[o.id] ?? 0
    // Un origen que nadie usa y sin stock ni compras no aporta nada.
    if (consumo.every((x) => x === 0) && stock0 === 0 && camiones.every((x) => x === 0)) continue

    const costo = costoTonOrigenCLP(o, e.tc, e.tonPorCamion)
    const stockInicioMesT: number[] = []
    const stockFinalT: number[] = []
    const sugeridos: number[] = []
    let s = stock0
    let sugerido = stock0
    e.meses.forEach((_, i) => {
      stockInicioMesT.push(r3(s))
      s = s + e.tonPorCamion * camiones[i] - consumo[i]
      stockFinalT.push(r3(s))
      const faltante = stockMinimoT + consumo[i] - sugerido
      const k = consumo[i] > 0 && faltante > 1e-9 ? Math.ceil(faltante / e.tonPorCamion - 1e-9) : 0
      sugeridos.push(k)
      sugerido = sugerido + e.tonPorCamion * k - consumo[i]
    })

    planes.push({
      origenId: o.id,
      nombre: o.nombre,
      meses: e.meses,
      stockInicialT: r3(stock0),
      camiones,
      compradasT: camiones.map((k) => r3(k * e.tonPorCamion)),
      consumoT: consumo,
      stockInicioMesT,
      stockFinalT,
      ventaSinComprar: consumo.map((c, i) => c > 0 && stockInicioMesT[i] >= c - 1e-9),
      camionesSugeridos: sugeridos,
      costoPorTonCLP: costo,
      valorStockFinalCLP: stockFinalT.map((t) => Math.max(0, t) * costo),
    })
  }
  return planes
}
