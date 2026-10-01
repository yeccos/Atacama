// Motor del presupuesto mensual. Todo se calcula desde kg y contenedores, nunca desde montos de venta.
//
// Dos modos:
//  - "corregido": las reglas del negocio, sin los errores del Excel.
//  - "excel": réplica del Excel original, con sus errores, para validar que las cifras calzan.
import { asumeCosto, totalPedidoUsdCent, type Escala } from './comercial'
import { formatoNumero } from './formato'

export type ModoPpto = 'corregido' | 'excel'

export interface OrigenIn {
  id: number
  nombre: string
  usdPorTon: number
  fleteUsdPorTon: number
  /** Días de pago del proveedor de esta materia prima. */
  diasPago?: number
}

export interface ClienteIn {
  id: number
  nombre: string
  kgPorCont: number
  usdPorKg: number
  escalas: Escala[]
  origenId: number | null
  incoterm: string | null
  /** US$ por contenedor del flete marítimo al destino del cliente. */
  fleteUsdPorCont: number | null
  /** Producto que compra: define qué antiaglomerante usa y si lleva yodo. */
  yodada?: boolean
  antiaglomeranteId?: number | null
  /** Solo puede llevar MP de su origen (Europa: SQM). */
  soloOrigen?: boolean
}

/**
 * Insumo con consumo: el costo del mes es costo unitario × cantidad por unidad de la base × volumen del mes.
 * Un insumo ANTIAGLOMERANTE solo cuenta para las toneladas de los productos que lo usan, y uno YODO
 * solo para las de los productos yodados.
 */
export interface InsumoIn {
  id: number
  nombre: string
  tipo: string
  costoUnitario: number | null
  base: string
  cantidadPorBase: number | null
  afectoIVA: boolean
  diasPago?: number
}

export interface GastoIn {
  id: number
  nombre: string
  driver: string
  moneda: string
  valorFijo: number
  valorVariable: number
  mesEspecifico: number | null
  /** Código del tipo de costo de exportación del que depende (ADUANA, TRANSPORTE_INTERNO...). */
  tipoCosto: string | null
  afectoIVA: boolean
  soloFlujo: boolean
  modoExcel: 'NORMAL' | 'FUERA_DE_TOTAL' | 'NO_EXISTE'
  deudaId: number | null
  diasPago?: number
}

export interface EmpleadoIn {
  cargo: string
  bruto: number | null
}

export interface EntradaPpto {
  /** 'aaaa-mm' */
  meses: string[]
  tc: number
  uf: number
  mermaPct: number
  tonPorCamion: number
  stockInicialTon: number
  clientes: ClienteIn[]
  origenes: OrigenIn[]
  gastos: GastoIn[]
  insumos?: InsumoIn[]
  empleados: EmpleadoIn[]
  /** incoterm → tipos de costo que asume la empresa (tabla IncotermCosto). */
  incotermCostos: Record<string, string[]>
  /** Contenedores por cliente y mes, ya resueltos (reglas + ediciones). */
  contenedores: Record<number, number[]>
  camiones: number[]
  bonoDescargaPorCamion: number
  /** Contenedores que se producen con MP de otro origen: cliente → origen → contenedores por mes. */
  mezcla?: Record<number, Record<number, number[]>>
  /** Solo modo excel: precio plano por cliente (el Excel usaba un promedio para NADARRA). */
  precioPlano?: Record<number, number>
}

/** Grandes grupos de egresos del flujo: cada línea del presupuesto cae en uno. */
export const GRUPO_MP = 'Materia prima'
export const GRUPO_INSUMOS = 'Insumos de producción'
export const GRUPO_EXPORTACION = 'Exportación: flete, aduana y puerto'
export const GRUPO_VARIABLES = 'Costos variables de planta'
export const GRUPO_FIJOS = 'Gastos fijos y administración'
export const GRUPO_REMUNERACIONES = 'Remuneraciones y Previred'
export const GRUPO_DEUDAS = 'Deudas y créditos'
export const GRUPO_OTROS = 'Otros'

/** Grupo de un gasto: lo que depende del incoterm es exportación; el resto, variable de planta o fijo. */
export function grupoGasto(tipoCosto: string | null, driver: string): string {
  if (tipoCosto) return GRUPO_EXPORTACION
  return driver === 'POR_CONTENEDOR' || driver === 'POR_KG' || driver === 'POR_TONELADA' || driver === 'POR_TON_MP' || driver === 'POR_CAMION' ? GRUPO_VARIABLES : GRUPO_FIJOS
}

export interface LineaPpto {
  clave: string
  /** Gran grupo de egresos al que pertenece. */
  grupo?: string
  nombre: string
  /** Egresos en negativo, como en el Excel. */
  valores: number[]
  afectoIVA: boolean
  /** Línea que el Excel original dejó fuera de la suma de egresos (solo modo excel). */
  fueraDeTotal?: boolean
  /** Egreso de caja que no va al EERR (inversiones, cuotas de deuda). */
  soloFlujo?: boolean
  deudaId?: number | null
  /** Cómo se calcula la línea, en palabras, y la pantalla donde se editan sus datos. */
  formula?: string
  editarEn?: string
  /** Días entre la compra y el pago (plazo del proveedor). */
  diasPago?: number
  tipo: 'MP' | 'VARIABLE' | 'FLETE' | 'REMUNERACION' | 'FIJO'
}

export interface ResultadoPpto {
  meses: string[]
  contenedores: { clienteId: number; nombre: string; valores: number[] }[]
  ventas: { clienteId: number; nombre: string; valores: number[] }[]
  totalVentas: number[]
  egresos: LineaPpto[]
  totalEgresos: number[]
  margen: number[]
  margenAcum: number[]
  camiones: number[]
  contProducidos: number[]
  /** Toneladas de MP consumidas en el mes (kg vendidos / (1 − merma)). */
  consumoMPTon: number[]
  stockMPTon: number[]
  advertencias: string[]
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)

/** Contenedores del cliente en el mes i que salen de la MP de ese origen (los desviados a otro origen van por mezcla). */
export function contenedoresDeOrigen(e: EntradaPpto, c: ClienteIn, origenId: number, i: number): number {
  const total = e.contenedores[c.id]?.[i] ?? 0
  if (c.soloOrigen) return origenId === c.origenId ? total : 0
  const desviados = Object.entries(e.mezcla?.[c.id] ?? {})
    .filter(([o]) => Number(o) !== c.origenId)
    .map(([o, v]) => [Number(o), Math.max(0, v[i] ?? 0)] as const)
    .sort((a, b) => a[0] - b[0])
  let resto = total
  const asignado: Record<number, number> = {}
  for (const [o, k] of desviados) {
    asignado[o] = Math.min(k, resto)
    resto -= asignado[o]
  }
  return origenId === c.origenId ? resto : asignado[origenId] ?? 0
}

const n0 = (x: number) => formatoNumero(x, Number.isInteger(x) ? 0 : 2)
const unidadMoneda = (moneda: string, x: number) => (moneda === 'UF' ? n0(x) + ' UF' : moneda === 'USD' ? 'US$' + n0(x) : '$' + n0(x))

/** Explica en palabras cómo se calcula un gasto según su driver. */
function formulaGasto(g: GastoIn): string {
  const f = unidadMoneda(g.moneda, g.valorFijo)
  const v = unidadMoneda(g.moneda, g.valorVariable)
  const dependeDelIncoterm = g.tipoCosto ? ' (solo los clientes cuyo incoterm incluye este costo)' : ''
  switch (g.driver) {
    case 'FIJO_MENSUAL': return `${f} fijos cada mes`
    case 'ANUAL_PRORRATEADO': return `${f} al año ÷ 12`
    case 'ANUAL_MES': return g.mesEspecifico ? `${f} una vez al año, en el mes ${g.mesEspecifico}` : `${f} una vez al año; falta definir el mes`
    case 'POR_CONTENEDOR': return `${v} × contenedores del mes${dependeDelIncoterm}`
    case 'POR_KG': return `${v} × kg vendidos en el mes`
    case 'POR_TONELADA': return `${v} × toneladas vendidas en el mes`
    case 'POR_TON_MP': return `${v} × toneladas de materia prima consumidas`
    case 'POR_CAMION': return `${v} × camiones de materia prima del mes`
    case 'FIJO_MAS_CONTENEDOR': return `${f} fijos + ${v} × contenedores del mes`
    default: return g.driver
  }
}

function convertir(valor: number, moneda: string, tc: number, uf: number): number {
  return moneda === 'USD' ? valor * tc : moneda === 'UF' ? valor * uf : valor
}

export function calcularPresupuesto(e: EntradaPpto, modo: ModoPpto): ResultadoPpto {
  const excel = modo === 'excel'
  const n = e.meses.length
  const advertencias: string[] = []
  const cont = (c: ClienteIn, i: number) => e.contenedores[c.id]?.[i] ?? 0

  const tipoCostoAsumido = (c: ClienteIn, tipo: string) =>
    excel ? true : asumeCosto(e.incotermCostos, c.incoterm ?? 'FOB', tipo)

  if (!excel) {
    for (const c of e.clientes) {
      if (!c.incoterm && (e.contenedores[c.id] ?? []).some((x) => x > 0)) {
        advertencias.push(`${c.nombre}: sin incoterm definido. Se asumen solo los costos internos (como FOB); falta el flete marítimo si fuera CFR/CIF.`)
      }
    }
  }

  // ── Ventas y volúmenes ──
  const ventas = e.clientes.map((c) => ({
    clienteId: c.id,
    nombre: c.nombre,
    valores: e.meses.map((_, i) => {
      const k = cont(c, i)
      if (k === 0) return 0
      if (excel) return k * (e.precioPlano?.[c.id] ?? c.usdPorKg) * c.kgPorCont * e.tc
      return (totalPedidoUsdCent(c.usdPorKg, c.kgPorCont, k, c.escalas) / 100) * e.tc
    }),
  }))
  const totalVentas = e.meses.map((_, i) => sum(ventas.map((v) => v.valores[i])))
  const kgMes = e.meses.map((_, i) => sum(e.clientes.map((c) => cont(c, i) * c.kgPorCont)))
  const contMes = e.meses.map((_, i) => sum(e.clientes.map((c) => cont(c, i))))
  const consumoMPTon = kgMes.map((kg) => kg / 1000 / (1 - e.mermaPct / 100))

  const egresos: LineaPpto[] = []

  // ── Materia prima por origen ──
  for (const o of e.origenes) {
    const valores = e.meses.map((_, i) => {
      const kg = sum(e.clientes.map((c) => contenedoresDeOrigen(e, c, o.id, i) * c.kgPorCont))
      const ton = kg / 1000 / (1 - e.mermaPct / 100)
      return -ton * (o.usdPorTon + o.fleteUsdPorTon) * e.tc
    })
    if (valores.some((v) => v !== 0)) {
      egresos.push({
        clave: 'mp-' + o.id, grupo: GRUPO_MP, nombre: `MP ${o.nombre}`, valores, afectoIVA: true, tipo: 'MP', editarEn: 'mp', diasPago: o.diasPago,
        formula: `Toneladas de materia prima del mes (kg vendidos ÷ (1 − ${n0(e.mermaPct)}% de merma)) × (US$${n0(o.usdPorTon)} + US$${n0(o.fleteUsdPorTon)} de flete) × dólar`,
      })
    }
  }

  // ── Insumos con consumo (pallets, etiquetas, antiaglomerante, yodo...) ──
  if (!excel) {
    for (const ins of e.insumos ?? []) {
      const aplican = e.clientes.filter((c) =>
        ins.tipo === 'ANTIAGLOMERANTE' ? c.antiaglomeranteId === ins.id : ins.tipo === 'YODO' ? !!c.yodada : true,
      )
      const kgIns = e.meses.map((_, i) => sum(aplican.map((c) => cont(c, i) * c.kgPorCont)))
      const contIns = e.meses.map((_, i) => sum(aplican.map((c) => cont(c, i))))
      const volumen = (i: number) =>
        ins.base === 'POR_KG' ? kgIns[i]
        : ins.base === 'POR_CONTENEDOR' ? contIns[i]
        : ins.base === 'POR_CAMION' ? (e.camiones[i] ?? 0)
        : kgIns[i] / 1000
      if (ins.costoUnitario === null || ins.cantidadPorBase === null) {
        if (e.meses.some((_, i) => volumen(i) > 0)) {
          const falta = ins.costoUnitario === null ? 'el costo unitario' : 'la cantidad por unidad'
          advertencias.push(`Insumo ${ins.nombre}: falta ${falta}; no se está contando en el costo.`)
        }
        continue
      }
      const valores = e.meses.map((_, i) => {
        const monto = ins.costoUnitario! * ins.cantidadPorBase! * volumen(i)
        return monto === 0 ? 0 : -monto
      })
      const alcance = ins.tipo === 'ANTIAGLOMERANTE' ? ', solo de los productos que usan este antiaglomerante' : ins.tipo === 'YODO' ? ', solo de los productos yodados' : ''
      const por = ins.base === 'POR_KG' ? 'kg vendidos' : ins.base === 'POR_CONTENEDOR' ? 'contenedores' : ins.base === 'POR_CAMION' ? 'camiones' : 'toneladas vendidas'
      egresos.push({
        clave: 'insumo-' + ins.id, grupo: GRUPO_INSUMOS, nombre: ins.nombre, valores, afectoIVA: ins.afectoIVA, tipo: 'VARIABLE', editarEn: 'productos', diasPago: ins.diasPago,
        formula: `Insumo: $${n0(ins.costoUnitario)} por unidad × ${n0(ins.cantidadPorBase)} unidades por cada ${ins.base === 'POR_TONELADA' ? 'tonelada' : ins.base === 'POR_KG' ? 'kg' : ins.base === 'POR_CONTENEDOR' ? 'contenedor' : 'camión'} × ${por} del mes${alcance}`,
      })
    }
  }

  // ── Fletes marítimos: dependen del incoterm de cada cliente ──
  for (const c of e.clientes) {
    if (!c.fleteUsdPorCont) continue
    if (!asumeCosto(e.incotermCostos, c.incoterm, 'FLETE_MARITIMO')) continue
    egresos.push({
      clave: 'flete-' + c.id,
      grupo: GRUPO_EXPORTACION,
      nombre: `Flete marítimo ${c.nombre}`,
      valores: e.meses.map((_, i) => -c.fleteUsdPorCont! * cont(c, i) * e.tc),
      afectoIVA: false,
      tipo: 'FLETE',
      editarEn: 'destinos',
      formula: `Contenedores del mes × US$${n0(c.fleteUsdPorCont)} de flete × dólar. Solo porque el incoterm de ${c.nombre} (${c.incoterm}) incluye el flete marítimo`,
    })
  }

  // ── Remuneraciones ──
  const bruto = sum(e.empleados.map((x) => x.bruto ?? 0))
  for (const x of e.empleados) {
    if (x.bruto === null) advertencias.push(`Remuneraciones: falta el sueldo de ${x.cargo}.`)
  }
  egresos.push({
    clave: 'remuneraciones',
    grupo: GRUPO_REMUNERACIONES,
    nombre: 'Remuneraciones',
    valores: e.meses.map(() => -bruto),
    afectoIVA: false,
    tipo: 'REMUNERACION',
    editarEn: 'remuneraciones',
    formula: `Suma de los sueldos brutos del personal ($${n0(bruto)}), igual todos los meses`,
  })
  if (!excel && e.bonoDescargaPorCamion > 0) {
    egresos.push({
      clave: 'bono-descarga',
      grupo: GRUPO_REMUNERACIONES,
      nombre: 'Bono descarga de camiones',
      valores: e.meses.map((_, i) => -e.bonoDescargaPorCamion * (e.camiones[i] ?? 0)),
      afectoIVA: false,
      tipo: 'REMUNERACION',
      editarEn: 'indicadores',
      formula: `$${n0(e.bonoDescargaPorCamion)} por cada camión de materia prima del mes (parámetro bonoDescargaPorCamion)`,
    })
  }

  // ── Gastos con driver ──
  for (const g of e.gastos) {
    if (excel && g.modoExcel === 'NO_EXISTE') continue
    const fueraDeTotal = excel && g.modoExcel === 'FUERA_DE_TOTAL'
    if (!excel && g.driver === 'ANUAL_MES' && !g.mesEspecifico) {
      advertencias.push(`${g.nombre}: gasto anual sin mes asignado; no se carga en ningún mes.`)
    }
    const valores = e.meses.map((mes, i) => {
      const f = convertir(g.valorFijo, g.moneda, e.tc, e.uf)
      const v = convertir(g.valorVariable, g.moneda, e.tc, e.uf)
      // Contenedores que realmente generan este costo según el incoterm de cada cliente.
      const contBase = g.tipoCosto
        ? sum(e.clientes.filter((c) => tipoCostoAsumido(c, g.tipoCosto!)).map((c) => cont(c, i)))
        : contMes[i]
      let monto = 0
      switch (g.driver) {
        case 'FIJO_MENSUAL': monto = f; break
        case 'ANUAL_PRORRATEADO': monto = f / 12; break
        case 'ANUAL_MES':
          // El Excel nunca cargaba estos gastos en ningún mes.
          monto = !excel && g.mesEspecifico === Number(mes.slice(5)) ? f : 0
          break
        case 'POR_CONTENEDOR': monto = v * contBase; break
        case 'POR_KG': monto = v * kgMes[i]; break
        case 'POR_TONELADA': monto = (v * kgMes[i]) / 1000; break
        case 'POR_TON_MP': monto = v * consumoMPTon[i]; break
        case 'POR_CAMION': monto = v * (e.camiones[i] ?? 0); break
        case 'FIJO_MAS_CONTENEDOR': monto = f + v * contBase; break
        default: throw new Error(`Driver desconocido: ${g.driver}`)
      }
      // En el Excel, "Inversiones" y "Pintura" tenían signo positivo.
      return fueraDeTotal || monto === 0 ? monto : -monto
    })
    egresos.push({
      clave: 'gasto-' + g.id,
      grupo: grupoGasto(g.tipoCosto, g.driver),
      nombre: g.nombre,
      valores,
      afectoIVA: g.afectoIVA,
      fueraDeTotal,
      soloFlujo: g.soloFlujo,
      deudaId: g.deudaId,
      editarEn: 'versiones',
      diasPago: g.diasPago,
      formula: formulaGasto(g),
      tipo: g.driver === 'POR_CONTENEDOR' || g.driver === 'POR_KG' || g.driver === 'POR_TONELADA' ? 'VARIABLE' : 'FIJO',
    })
  }

  const totalEgresos = e.meses.map((_, i) => sum(egresos.filter((l) => !l.fueraDeTotal).map((l) => l.valores[i])))
  const margen = e.meses.map((_, i) => totalVentas[i] + totalEgresos[i])
  let acum = 0
  const margenAcum = margen.map((m) => (acum += m))

  // ── Stock de MP ──
  const camiones = e.meses.map((_, i) => e.camiones[i] ?? 0)
  const stockMPTon: number[] = []
  let stock = e.stockInicialTon
  for (let i = 0; i < n; i++) {
    // El Excel usaba 20 t de consumo por contenedor el primer mes y 19 t los demás.
    const consumo = excel ? (i === 0 ? 20 : 19) * contMes[i] : consumoMPTon[i]
    stock = stock + e.tonPorCamion * camiones[i] - consumo
    stockMPTon.push(stock)
  }
  if (!excel && stockMPTon.some((s) => s < 0)) {
    const primero = e.meses[stockMPTon.findIndex((s) => s < 0)]
    advertencias.push(`El stock de materia prima queda negativo desde ${primero}: faltan camiones.`)
  }

  return {
    meses: e.meses,
    contenedores: e.clientes.map((c) => ({ clienteId: c.id, nombre: c.nombre, valores: e.meses.map((_, i) => cont(c, i)) })),
    ventas,
    totalVentas,
    egresos,
    totalEgresos,
    margen,
    margenAcum,
    camiones,
    contProducidos: contMes,
    consumoMPTon,
    stockMPTon,
    advertencias,
  }
}

// ───────────── Meses y reglas de frecuencia ─────────────

export function listaMeses(desde: string, hasta: string): string[] {
  const out: string[] = []
  let [a, m] = desde.slice(0, 7).split('-').map(Number)
  const [fa, fm] = hasta.slice(0, 7).split('-').map(Number)
  while (a < fa || (a === fa && m <= fm)) {
    out.push(`${a}-${String(m).padStart(2, '0')}`)
    if (++m > 12) {
      m = 1
      a++
    }
  }
  return out
}

const indiceMes = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1

export interface ReglaIn {
  clienteId: number
  contenedores: number
  cadaNMeses: number
  desde: string
  hasta: string | null
}

/**
 * Contenedores por cliente y mes. Una regla "N contenedores cada K meses desde X" pone N en X, X+K, X+2K...
 * Las ediciones puntuales (`ediciones[clienteId][mes]`) ganan sobre las reglas.
 */
export function resolverContenedores(
  meses: string[],
  reglas: ReglaIn[],
  ediciones: Record<number, Record<string, number>> = {},
): Record<number, number[]> {
  const out: Record<number, number[]> = {}
  for (const r of reglas) {
    out[r.clienteId] ??= meses.map(() => 0)
    const ini = indiceMes(r.desde)
    const fin = r.hasta ? indiceMes(r.hasta) : Infinity
    const paso = Math.max(1, r.cadaNMeses)
    meses.forEach((m, i) => {
      const k = indiceMes(m)
      if (k >= ini && k <= fin && (k - ini) % paso === 0) out[r.clienteId][i] += r.contenedores
    })
  }
  for (const [cid, porMes] of Object.entries(ediciones)) {
    const id = Number(cid)
    out[id] ??= meses.map(() => 0)
    meses.forEach((m, i) => {
      if (m in porMes) out[id][i] = porMes[m]
    })
  }
  return out
}

// ───────────── Economía por contenedor ─────────────

export interface EconomiaCliente {
  clienteId: number
  nombre: string
  ventaCLP: number
  costoVariableCLP: number
  contribucionCLP: number
  contribucionPct: number
}

/**
 * Venta, costo variable y contribución de UN contenedor de cada cliente, y los contenedores
 * al mes necesarios para cubrir los costos fijos. El costo variable es el costo marginal:
 * cuánto sube el egreso del mes al agregar ese contenedor.
 */
export function economiaPorContenedor(base: EntradaPpto): {
  clientes: EconomiaCliente[]
  fijosMensualesCLP: number
  puntoEquilibrio: number | null
} {
  // Un mes sin gastos anuales puntuales (marzo del año que parte el presupuesto).
  const mes = base.meses.find((m) => m.endsWith('-03')) ?? base.meses[0]
  const corrida = (conts: Record<number, number>) => {
    const e: EntradaPpto = {
      ...base,
      meses: [mes],
      contenedores: Object.fromEntries(base.clientes.map((c) => [c.id, [conts[c.id] ?? 0]])),
      camiones: [0],
    }
    return calcularPresupuesto(e, 'corregido')
  }
  const cero = corrida({})
  const fijos = -cero.totalEgresos[0]
  const clientes = base.clientes.map((c) => {
    const uno = corrida({ [c.id]: 1 })
    const venta = uno.totalVentas[0]
    const costo = -(uno.totalEgresos[0] - cero.totalEgresos[0])
    const contribucion = venta - costo
    return {
      clienteId: c.id,
      nombre: c.nombre,
      ventaCLP: venta,
      costoVariableCLP: costo,
      contribucionCLP: contribucion,
      contribucionPct: venta ? (contribucion / venta) * 100 : 0,
    }
  })
  const activos = clientes.filter((c) => base.contenedores[c.clienteId]?.some((x) => x > 0))
  const promedio = activos.length ? sum(activos.map((c) => c.contribucionCLP)) / activos.length : 0
  return { clientes, fijosMensualesCLP: fijos, puntoEquilibrio: promedio > 0 ? fijos / promedio : null }
}
