// Flujo de caja semanal. El presupuesto da montos por mes; aquí cada monto se lleva a la fecha en que
// se paga o se cobra (sueldos a fin de mes, Previred el 10, costos de un embarque en su ETD...) y
// luego se reparte en semanas de 7 días desde la fecha de inicio.
import { devolucionesIVA } from './iva'
import { claveCobro, nombreCobro, sumarDias, type AlertaFlujo, type EntradaFlujo, type LineaFlujo, type ResultadoFlujo } from './flujo'
import { GRUPO_DEUDAS, GRUPO_OTROS, GRUPO_OTROS_INGRESOS, GRUPO_REMUNERACIONES } from './presupuesto'

export interface ParamsSemanal {
  /** Día del mes en que se pagan los gastos fijos. */
  diaPagoFijos: number
  diaPagoPrevired: number
  diaPagoCuotas: number
  diaDevolucionIVA: number
  /** Día del mes del embarque proyectado (ETD); los costos por contenedor se pagan ese día. */
  diaETD: number
  /** La materia prima y los insumos se pagan estos días antes del ETD (producción). */
  diasProduccionAntesETD: number
}

export const PARAMS_SEMANAL_POR_DEFECTO: ParamsSemanal = {
  diaPagoFijos: 10,
  diaPagoPrevired: 10,
  diaPagoCuotas: 10,
  diaDevolucionIVA: 20,
  diaETD: 15,
  diasProduccionAntesETD: 7,
}

export interface EntradaFlujoSemanal extends Omit<EntradaFlujo, 'meses'> {
  /** Primer día de la semana 1. El saldo inicial es el del día anterior. */
  inicio: string
  nSemanas: number
  params: ParamsSemanal
}

export interface PeriodoFlujo {
  /** Null en el primer período, que reúne todo lo anterior al inicio (el "cierre"). */
  desde: string | null
  hasta: string
}

export interface ResultadoFlujoSemanal extends ResultadoFlujo {
  periodos: PeriodoFlujo[]
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)
const indiceMes = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1
const mesDeIndice = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`
const diasDelMes = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate()
const fechaDia = (ym: string, dia: number) => `${ym}-${String(Math.min(dia, diasDelMes(ym))).padStart(2, '0')}`
const finDeMes = (ym: string) => fechaDia(ym, 31)
const diffDias = (a: string, b: string) => Math.round((Date.parse(a.slice(0, 10)) - Date.parse(b.slice(0, 10))) / 86_400_000)

interface Evento {
  fecha: string
  grupo: 'INGRESO' | 'EGRESO'
  clave: string
  nombre: string
  grupoEgreso?: string
  monto: number
  /** Un cobro atrasado (anterior al inicio) se espera en la primera semana, no en el cierre. */
  esCobro?: boolean
}

export function armarFlujoSemanal(e: EntradaFlujoSemanal): ResultadoFlujoSemanal {
  const p = e.params
  const factorIVA = 1 + e.ivaPct / 100
  const eventos: Evento[] = []
  const meses = e.ppto.meses
  const egreso = (fecha: string, clave: string, nombre: string, monto: number, grupoEgreso?: string) => {
    if (monto !== 0) eventos.push({ fecha, grupo: 'EGRESO', clave, nombre, monto, grupoEgreso })
  }

  // ── Cobros: fecha exacta del hito ──
  for (const c of e.cobros) {
    eventos.push({
      fecha: c.fecha, grupo: 'INGRESO', clave: claveCobro(c), nombre: nombreCobro(c),
      monto: c.clp ?? (c.usdCent / 100) * e.tc, esCobro: !c.cobrado, grupoEgreso: c.nombre,
    })
  }

  // ── Costos del presupuesto: cada tipo de línea se paga en su fecha ──
  const ivaCredito = meses.map(() => 0)
  for (const l of e.ppto.egresos) {
    if (l.tipo === 'REMUNERACION') continue
    meses.forEach((ym, i) => {
      const neto = -l.valores[i]
      if (neto === 0) return
      const etd = fechaDia(ym, p.diaETD)
      const fecha =
        l.tipo === 'MP' ? sumarDias(etd, -p.diasProduccionAntesETD)
        : l.tipo === 'VARIABLE' || l.tipo === 'FLETE' ? etd
        : fechaDia(ym, l.diaDelMes ?? p.diaPagoFijos)
      // La materia prima ya pagada sigue dando IVA crédito, pero no sale de la caja.
      if (l.tipo === 'MP' && e.mpPagadoHasta && ym <= e.mpPagadoHasta) return
      egreso(sumarDias(fecha, l.diasPago ?? 0), l.clave, l.nombre, neto * (l.afectoIVA ? factorIVA : 1), l.grupo)
    })
  }

  // ── Remuneraciones: líquidos a fin de mes, Previred el día configurado, bono por camión ──
  const bono = e.ppto.egresos.find((l) => l.clave === 'bono-descarga')
  meses.forEach((ym, i) => {
    egreso(finDeMes(ym), 'sueldos', 'Sueldos líquidos', e.sueldosLiquidos, GRUPO_REMUNERACIONES)
    egreso(fechaDia(ym, p.diaPagoPrevired), 'previred', 'Imposiciones (Previred)', e.previredMensual, GRUPO_REMUNERACIONES)
    if (bono) egreso(finDeMes(ym), bono.clave, bono.nombre, -bono.valores[i], GRUPO_REMUNERACIONES)
  })

  // ── Deudas con cuota propia ──
  for (const d of e.deudas) {
    const ini = d.desde ? indiceMes(d.desde) : indiceMes(meses[0])
    const fin = d.hasta ? indiceMes(d.hasta) : ini + e.mesesSinFin - 1
    for (let k = ini; k <= fin; k++) {
      const ym = mesDeIndice(k)
      if (meses.includes(ym)) egreso(fechaDia(ym, p.diaPagoCuotas), 'deuda-' + d.acreedor, `Cuota ${d.acreedor}`, d.cuota, GRUPO_DEUDAS)
    }
  }

  // ── Partidas manuales ──
  for (const x of e.partidas) {
    if (x.monto >= 0) eventos.push({ fecha: x.fecha, grupo: 'INGRESO', clave: 'partida-' + x.concepto, nombre: x.concepto, monto: x.monto, grupoEgreso: GRUPO_OTROS_INGRESOS })
    else {
      const delPpto = e.ppto.egresos.find((l) => l.nombre === x.concepto)
      egreso(x.fecha, delPpto?.clave ?? 'partida-' + x.concepto, x.concepto, -x.monto, delPpto?.grupo ?? GRUPO_OTROS)
    }
  }

  // ── Devolución de IVA exportador ──
  for (const d of devolucionesIVA({
    ppto: e.ppto, ivaPct: e.ivaPct, mpPagadoHasta: e.mpPagadoHasta, modo: e.devolucionIVAModo, mensual: e.devolucionIVAMensual,
    rezago: e.rezagoIVAMeses, pct: e.devolucionIVAPct ?? 100, periodos: e.periodosIVA ?? [],
  })) {
    if (!meses.includes(d.mes)) continue
    eventos.push({ fecha: d.fecha ?? fechaDia(d.mes, p.diaDevolucionIVA), grupo: 'INGRESO', clave: 'devolucion-iva', nombre: 'Devolución de IVA', monto: d.monto, grupoEgreso: GRUPO_OTROS_INGRESOS })
  }

  // ── Ajustes del usuario: el monto del mes de una línea se reparte entre sus pagos en la misma proporción ──
  for (const a of e.ajustes ?? []) {
    const delMes = eventos.filter((ev) => ev.clave === a.clave && ev.fecha.slice(0, 7) === a.mes)
    const total = sum(delMes.map((ev) => ev.monto))
    if (delMes.length > 0 && total !== 0) for (const ev of delMes) ev.monto = (ev.monto * a.monto) / total
    else if (a.monto !== 0) {
      const plantilla = eventos.find((ev) => ev.clave === a.clave)
      eventos.push({ fecha: fechaDia(a.mes, 15), grupo: plantilla?.grupo ?? 'EGRESO', clave: a.clave, nombre: plantilla?.nombre ?? a.clave, grupoEgreso: plantilla?.grupoEgreso, monto: a.monto })
    }
  }

  // ── Períodos: el cierre (todo lo anterior al inicio) y las semanas ──
  const nP = e.nSemanas + 1
  const periodos: PeriodoFlujo[] = [{ desde: null, hasta: sumarDias(e.inicio, -1) }]
  for (let w = 0; w < e.nSemanas; w++) periodos.push({ desde: sumarDias(e.inicio, 7 * w), hasta: sumarDias(e.inicio, 7 * w + 6) })

  const indicePeriodo = (ev: Evento): number => {
    if (diffDias(ev.fecha, e.inicio) < 0) return ev.esCobro ? 1 : 0
    const w = Math.floor(diffDias(ev.fecha, e.inicio) / 7)
    return w >= e.nSemanas ? -1 : 1 + w
  }

  const ingresos: LineaFlujo[] = []
  const egresos: LineaFlujo[] = []
  for (const ev of eventos) {
    const i = indicePeriodo(ev)
    if (i < 0) continue
    const lista = ev.grupo === 'INGRESO' ? ingresos : egresos
    let linea = lista.find((l) => l.clave === ev.clave)
    if (!linea) {
      linea = { clave: ev.clave, nombre: ev.nombre, grupo: ev.grupoEgreso, valores: Array(nP).fill(0) }
      lista.push(linea)
    }
    linea.valores[i] += ev.monto
  }

  const totalIngresos = Array.from({ length: nP }, (_, i) => sum(ingresos.map((l) => l.valores[i])))
  const totalEgresos = Array.from({ length: nP }, (_, i) => sum(egresos.map((l) => l.valores[i])))
  const flujoNeto = totalIngresos.map((v, i) => v - totalEgresos[i])
  const saldoFinal: number[] = []
  let saldo = e.saldoInicial
  for (let i = 0; i < nP; i++) saldoFinal.push((saldo += i === 0 && e.primerPeriodoInformativo ? 0 : flujoNeto[i]))

  const claves = periodos.map((_, i) => 'P' + i)
  const alertas: AlertaFlujo[] = []
  saldoFinal.forEach((s, i) => {
    if (i === 0 && e.primerPeriodoInformativo) return
    if (s < 0) alertas.push({ mes: claves[i], tipo: 'SALDO_NEGATIVO', mensaje: `Saldo negativo en el período ${i}` })
    else if (s < e.saldoMinimo) alertas.push({ mes: claves[i], tipo: 'SALDO_BAJO', mensaje: `Saldo bajo el mínimo en el período ${i}` })
  })

  return {
    meses: claves, saldoInicial: e.saldoInicial, ingresos, egresos, totalIngresos, totalEgresos, flujoNeto, saldoFinal,
    ivaCredito: claves.map(() => 0), alertas, periodos,
  }
}

export interface ResumenSemanal {
  /** Saldo más bajo de las semanas (sin contar el cierre) y en qué semana ocurre (1 = primera). */
  saldoMinimo: number
  semanaSaldoMinimo: number
  /** Primera semana con saldo negativo, o null. */
  primeraSemanaNegativa: number | null
  /** Caja que faltaría para no bajar del mínimo en ninguna semana. */
  cajaNecesaria: number
  saldoFinal: number
  totalCobros: number
  totalEgresos: number
}

export function resumirFlujoSemanal(r: ResultadoFlujoSemanal, saldoMinimoCaja = 0): ResumenSemanal {
  const semanas = r.saldoFinal.slice(1)
  const minimo = Math.min(...semanas)
  const idx = semanas.indexOf(minimo)
  const neg = semanas.findIndex((s) => s < 0)
  return {
    saldoMinimo: minimo,
    semanaSaldoMinimo: idx + 1,
    primeraSemanaNegativa: neg < 0 ? null : neg + 1,
    cajaNecesaria: Math.max(0, saldoMinimoCaja - minimo),
    saldoFinal: r.saldoFinal[r.saldoFinal.length - 1],
    totalCobros: sum(r.ingresos.filter((l) => l.clave.startsWith('cobro-')).map((l) => sum(l.valores.slice(1)))),
    totalEgresos: sum(r.totalEgresos.slice(1)),
  }
}
