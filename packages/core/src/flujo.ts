// Flujo de caja proyectado: cobros por hitos, costos del presupuesto con IVA, remuneraciones,
// deudas y partidas manuales. Los montos del flujo van con IVA (el presupuesto va en neto).
import { totalPedidoUsdCent, type Escala } from './comercial'
import { impuestosF29 } from './f29'
import { devolucionesIVA, ivaCreditoPorMes, type PeriodoIVAIn } from './iva'
import { GRUPO_DEUDAS, GRUPO_IMPUESTOS, GRUPO_OTROS, GRUPO_OTROS_INGRESOS, GRUPO_REMUNERACIONES, type ResultadoPpto } from './presupuesto'

// ───────────── Fechas de un embarque y de sus hitos de cobro ─────────────

export function sumarDias(iso: string, dias: number): string {
  const d = new Date(iso.slice(0, 10) + 'T00:00:00.000Z')
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export interface OpcionesCalendario {
  diaETD: number
  diasOCAntesETD: number
  diasProduccionAntesETD: number
}

export const CALENDARIO_POR_DEFECTO: OpcionesCalendario = { diaETD: 15, diasOCAntesETD: 30, diasProduccionAntesETD: 7 }

/** Fechas estimadas de un embarque proyectado: el ETD cae a mitad del mes y el resto se calcula desde ahí. */
export function calendarioEmbarque(
  mes: string,
  diasTransito: number,
  op: OpcionesCalendario = CALENDARIO_POR_DEFECTO,
): Record<string, string> {
  const etd = `${mes.slice(0, 7)}-${String(op.diaETD).padStart(2, '0')}`
  return {
    OC: sumarDias(etd, -op.diasOCAntesETD),
    PRODUCCION: sumarDias(etd, -op.diasProduccionAntesETD),
    ETD: etd,
    BL: etd,
    FACTURA: etd,
    ETA: sumarDias(etd, diasTransito),
    FECHA_FIJA: etd,
  }
}

/** Reparte un total en partes según porcentajes; el resto de centavos cae en la última. */
export function partirMonto(total: number, pcts: number[]): number[] {
  const partes = pcts.map((p) => Math.round((total * p) / 100))
  const resto = total - partes.reduce((s, x) => s + x, 0)
  if (partes.length) partes[partes.length - 1] += resto
  return partes
}

export interface HitoPlan {
  pct: number
  evento: string
  diasDesfase: number
}

export interface CobroFlujo {
  clienteId: number
  nombre: string
  fecha: string
  usdCent: number
  origen: 'REAL' | 'PROYECTADO'
  /** Hito del que viene (OC, BL, ETA...) y su porcentaje: el flujo muestra una línea por hito. */
  evento?: string
  pct?: number
  /** Pesos realmente recibidos (cobros ya hechos, según la cartola); si no está, se calcula con el dólar del escenario. */
  clp?: number
  /** Ya se cobró: queda en su fecha real (cierre), no se corre a la primera semana como un cobro atrasado. */
  cobrado?: boolean
}

const ETIQUETA_EVENTO: Record<string, string> = {
  OC: 'a la OC', PRODUCCION: 'en producción', ETD: 'al embarque', BL: 'contra BL', ETA: 'a la llegada', FACTURA: 'contra factura', FECHA_FIJA: 'fecha fija',
}

export const claveCobro = (c: CobroFlujo) => 'cobro-' + c.clienteId + (c.evento ? '-' + c.evento : '')
export const nombreCobro = (c: CobroFlujo) =>
  c.evento ? `Cobros ${c.nombre} · ${c.pct !== undefined ? c.pct + '% ' : ''}${ETIQUETA_EVENTO[c.evento] ?? c.evento}` : `Cobros ${c.nombre}`

export interface ClienteCobro {
  id: number
  nombre: string
  kgPorCont: number
  usdPorKg: number
  escalas: Escala[]
  diasTransito: number
  hitos: HitoPlan[]
}

/**
 * Cobros que generan los contenedores del presupuesto. Los pares cliente+mes que ya tienen un
 * embarque real (`cubiertos`, clave "clienteId|aaaa-mm") se omiten: sus cobros salen de los hitos reales.
 */
export function cobrosProyectados(
  clientes: ClienteCobro[],
  meses: string[],
  contenedores: Record<number, number[]>,
  cubiertos: Set<string>,
  op: OpcionesCalendario = CALENDARIO_POR_DEFECTO,
): { cobros: CobroFlujo[]; advertencias: string[] } {
  const cobros: CobroFlujo[] = []
  const advertencias: string[] = []
  for (const c of clientes) {
    const k = contenedores[c.id] ?? []
    if (k.some((x) => x > 0) && c.hitos.length === 0) {
      advertencias.push(`${c.nombre}: sin forma de pago definida; se asume 100% al embarque.`)
    }
    const hitos = c.hitos.length ? c.hitos : [{ pct: 100, evento: 'ETD', diasDesfase: 0 }]
    meses.forEach((mes, i) => {
      if (!k[i] || cubiertos.has(`${c.id}|${mes}`)) return
      const total = totalPedidoUsdCent(c.usdPorKg, c.kgPorCont, k[i], c.escalas)
      const cal = calendarioEmbarque(mes, c.diasTransito, op)
      const partes = partirMonto(total, hitos.map((h) => h.pct))
      hitos.forEach((h, j) => {
        cobros.push({
          clienteId: c.id,
          nombre: c.nombre,
          fecha: sumarDias(cal[h.evento] ?? cal.ETD, h.diasDesfase),
          usdCent: partes[j],
          origen: 'PROYECTADO',
          evento: h.evento,
          pct: h.pct,
        })
      })
    })
  }
  return { cobros, advertencias }
}

// ───────────── Armado del flujo ─────────────

export interface PartidaIn {
  fecha: string
  concepto: string
  monto: number
}

export interface DeudaFlujo {
  acreedor: string
  cuota: number
  /** Primer mes de pago; null = primer mes del flujo. */
  desde: string | null
  hasta: string | null
}

/** Ajuste del usuario: en ese mes, esa línea vale este monto (positivo, en pesos). */
export interface AjusteFlujoIn {
  clave: string
  mes: string
  monto: number
}

export interface EntradaFlujo {
  ajustes?: AjusteFlujoIn[]
  /** La primera columna (el cierre anterior al saldo inicial) se muestra pero no mueve el saldo: ya está en el saldo del banco. */
  primerPeriodoInformativo?: boolean
  ppto: ResultadoPpto
  tc: number
  /** Meses del flujo ('aaaa-mm'). Puede incluir meses anteriores al presupuesto (p. ej. la última semana de septiembre). */
  meses: string[]
  saldoInicial: number
  cobros: CobroFlujo[]
  partidas: PartidaIn[]
  /** Deudas con cuota que NO tienen una línea de gasto en el presupuesto. */
  deudas: DeudaFlujo[]
  /** Suma de sueldos líquidos, pagados a fin de mes. */
  sueldosLiquidos: number
  /** Imposiciones (Previred): se pagan el mes siguiente al de los sueldos. */
  previredMensual: number
  ivaPct: number
  devolucionIVAModo: 'fijo' | 'calculado'
  devolucionIVAMensual: number
  /** Meses entre la compra y la devolución, en modo calculado. */
  rezagoIVAMeses: number
  /** % del IVA crédito que se recupera (modo calculado). */
  devolucionIVAPct?: number
  /** Ajustes por mes de compra: crédito real, devolución esperada y su fecha. */
  periodosIVA?: PeriodoIVAIn[]
  /** Tasa de PPM (% de las ventas) y retención mensual de impuesto único de trabajadores, que se pagan con el F29. */
  ppmPct?: number
  retencionImpuestoUnico?: number
  /** Exportaciones del mes anterior al presupuesto, para el PPM del primer mes. */
  ppmVentasMesPrevio?: number
  /** Meses que se proyecta una deuda sin fecha de término. */
  mesesSinFin: number
  saldoMinimo: number
  /** Hasta qué mes ('aaaa-mm') la materia prima ya está pagada: sigue siendo costo, pero no una salida de caja futura. */
  mpPagadoHasta?: string
}

export interface LineaFlujo {
  clave: string
  nombre: string
  /** Gran grupo de egresos (se despliega en pantalla). */
  grupo?: string
  /** Positivo; el signo lo da el grupo (ingreso o egreso). */
  valores: number[]
}

export interface AlertaFlujo {
  mes: string
  tipo: 'SALDO_NEGATIVO' | 'SALDO_BAJO'
  mensaje: string
}

export interface ResultadoFlujo {
  meses: string[]
  saldoInicial: number
  ingresos: LineaFlujo[]
  egresos: LineaFlujo[]
  totalIngresos: number[]
  totalEgresos: number[]
  flujoNeto: number[]
  saldoFinal: number[]
  /** IVA crédito de las compras del mes, solo informativo en modo fijo. */
  ivaCredito: number[]
  alertas: AlertaFlujo[]
  /** Celdas que el usuario ajustó, con lo que valía la proyección antes del ajuste. */
  ajustados?: { clave: string; mes: string; original: number }[]
}

const sumar = (xs: number[]) => xs.reduce((s, x) => s + x, 0)
const idxMes = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1

export function armarFlujo(e: EntradaFlujo): ResultadoFlujo {
  const n = e.meses.length
  const col = (fecha: string) => e.meses.indexOf(fecha.slice(0, 7))
  const vacia = () => e.meses.map(() => 0)
  const pp = (mes: string) => e.ppto.meses.indexOf(mes)
  const factorIVA = 1 + e.ivaPct / 100

  const ingresos: LineaFlujo[] = []
  const egresos: LineaFlujo[] = []

  // ── Cobros por cliente (USD → CLP al TC del presupuesto) ──
  const porCliente = new Map<string, LineaFlujo>()
  for (const c of e.cobros) {
    const i = col(c.fecha)
    if (i < 0) continue
    const clave = claveCobro(c)
    if (!porCliente.has(clave)) {
      const l = { clave, nombre: nombreCobro(c), grupo: c.nombre, valores: vacia() }
      porCliente.set(clave, l)
      ingresos.push(l)
    }
    porCliente.get(clave)!.valores[i] += c.clp ?? (c.usdCent / 100) * e.tc
  }

  // ── Costos del presupuesto, con IVA donde corresponde ──
  const ivaCredito = vacia()
  for (const l of e.ppto.egresos) {
    if (l.tipo === 'REMUNERACION') continue // se reemplaza por sueldos líquidos + Previred
    // Plazo del proveedor: el pago llega 'desfase' meses después de la compra. El IVA crédito nace con la factura.
    const desfase = Math.round((l.diasPago ?? 0) / 30)
    const valores = e.meses.map((m) => {
      const i = pp(m) - desfase
      if (l.tipo === 'MP' && e.mpPagadoHasta && i >= 0 && e.ppto.meses[i] <= e.mpPagadoHasta) return 0
      return i < 0 || l.valores[i] === 0 ? 0 : -l.valores[i] * (l.afectoIVA ? factorIVA : 1)
    })
    if (valores.some((v) => v !== 0)) egresos.push({ clave: l.clave, nombre: l.nombre, grupo: l.grupo, valores })
  }

  // ── Remuneraciones: líquidos a fin de mes, Previred al mes siguiente, bono por camión ──
  const primerPpto = e.meses.findIndex((m) => pp(m) >= 0)
  if (e.sueldosLiquidos > 0 && primerPpto >= 0) {
    egresos.push({ clave: 'sueldos', nombre: 'Sueldos líquidos', grupo: GRUPO_REMUNERACIONES, valores: e.meses.map((_, i) => (i >= primerPpto ? e.sueldosLiquidos : 0)) })
  }
  if (e.previredMensual > 0 && primerPpto >= 0) {
    egresos.push({ clave: 'previred', nombre: 'Imposiciones (Previred)', grupo: GRUPO_REMUNERACIONES, valores: e.meses.map((_, i) => (i >= primerPpto ? e.previredMensual : 0)) })
  }
  const bono = e.ppto.egresos.find((l) => l.clave === 'bono-descarga')
  if (bono) {
    egresos.push({ clave: bono.clave, nombre: bono.nombre, grupo: GRUPO_REMUNERACIONES, valores: e.meses.map((m) => (pp(m) < 0 || bono.valores[pp(m)] === 0 ? 0 : -bono.valores[pp(m)])) })
  }

  // ── Impuestos del F29 (PPM y retención de trabajadores), pagados el mes siguiente ──
  if ((e.ppmPct ?? 0) > 0 || (e.retencionImpuestoUnico ?? 0) > 0) {
    const f29 = impuestosF29(e.ppto, e.ppmPct ?? 0, e.retencionImpuestoUnico ?? 0, e.ppmVentasMesPrevio)
    egresos.push({ clave: 'f29', nombre: 'Impuestos F29 (PPM y retención de trabajadores)', grupo: GRUPO_IMPUESTOS, valores: e.meses.map((m) => (pp(m) >= 0 ? f29[pp(m)] : 0)) })
  }

  // ── Deudas con cuota propia ──
  for (const d of e.deudas) {
    const ini = d.desde ? idxMes(d.desde) : idxMes(e.meses[primerPpto >= 0 ? primerPpto : 0])
    const fin = d.hasta ? idxMes(d.hasta) : ini + e.mesesSinFin - 1
    const valores = e.meses.map((m) => (idxMes(m) >= ini && idxMes(m) <= fin ? d.cuota : 0))
    if (valores.some((v) => v !== 0)) egresos.push({ clave: 'deuda-' + d.acreedor, nombre: `Cuota ${d.acreedor}`, grupo: GRUPO_DEUDAS, valores })
  }

  // ── Partidas manuales ──
  for (const p of e.partidas) {
    const i = col(p.fecha)
    if (i < 0) continue
    const lista = p.monto >= 0 ? ingresos : egresos
    // Una partida con el nombre de una línea del presupuesto (ej. "MP SQM") se suma a esa línea, en su grupo.
    const delPpto = p.monto < 0 ? e.ppto.egresos.find((x) => x.nombre === p.concepto) : undefined
    const clave = delPpto?.clave ?? 'partida-' + p.concepto
    let l = lista.find((x) => x.clave === clave)
    if (!l) {
      l = { clave, nombre: p.concepto, grupo: delPpto?.grupo ?? (p.monto >= 0 ? GRUPO_OTROS_INGRESOS : GRUPO_OTROS), valores: vacia() }
      lista.push(l)
    }
    l.valores[i] += Math.abs(p.monto)
  }

  // ── Devolución de IVA exportador ──
  const devoluciones = devolucionesIVA({
    ppto: e.ppto, ivaPct: e.ivaPct, mpPagadoHasta: e.mpPagadoHasta, modo: e.devolucionIVAModo, mensual: e.devolucionIVAMensual,
    rezago: e.rezagoIVAMeses, pct: e.devolucionIVAPct ?? 100, periodos: e.periodosIVA ?? [],
  })
  const credito = ivaCreditoPorMes(e.ppto, e.ivaPct, e.mpPagadoHasta)
  e.meses.forEach((m, i) => (ivaCredito[i] = credito[m] ?? 0))
  const devolucion = e.meses.map((m, i) => (i === 0 && e.primerPeriodoInformativo ? 0 : devoluciones.filter((d) => d.mes === m).reduce((s, d) => s + d.monto, 0)))
  if (devolucion.some((v) => v !== 0)) ingresos.push({ clave: 'devolucion-iva', nombre: 'Devolución de IVA', grupo: GRUPO_OTROS_INGRESOS, valores: devolucion })

  // Ajustes del usuario: reemplazan el valor proyectado de una línea en un mes.
  const ajustados: { clave: string; mes: string; original: number }[] = []
  for (const a of e.ajustes ?? []) {
    const i = e.meses.indexOf(a.mes)
    const linea = i < 0 ? undefined : [...ingresos, ...egresos].find((l) => l.clave === a.clave)
    if (!linea) continue
    ajustados.push({ clave: a.clave, mes: a.mes, original: linea.valores[i] })
    linea.valores[i] = a.monto
  }

  const totalIngresos = e.meses.map((_, i) => sumar(ingresos.map((l) => l.valores[i])))
  const totalEgresos = e.meses.map((_, i) => sumar(egresos.map((l) => l.valores[i])))
  const flujoNeto = totalIngresos.map((v, i) => v - totalEgresos[i])
  const saldoFinal: number[] = []
  let saldo = e.saldoInicial
  for (let i = 0; i < n; i++) saldoFinal.push((saldo += i === 0 && e.primerPeriodoInformativo ? 0 : flujoNeto[i]))

  const alertas: AlertaFlujo[] = []
  saldoFinal.forEach((s, i) => {
    if (i === 0 && e.primerPeriodoInformativo) return
    if (s < 0) alertas.push({ mes: e.meses[i], tipo: 'SALDO_NEGATIVO', mensaje: `Saldo negativo a fin de ${e.meses[i]}` })
    else if (s < e.saldoMinimo) alertas.push({ mes: e.meses[i], tipo: 'SALDO_BAJO', mensaje: `Saldo bajo el mínimo a fin de ${e.meses[i]}` })
  })

  return { meses: e.meses, saldoInicial: e.saldoInicial, ingresos, egresos, totalIngresos, totalEgresos, flujoNeto, saldoFinal, ivaCredito, alertas, ajustados }
}
