// Lee cartolas del Bice en el navegador: PDF (por posición del texto, porque las columnas vienen desalineadas)
// y Excel de la cartola provisoria. Cada archivo devuelve sus movimientos en orden cronológico con el saldo corrido,
// y el saldo inicial para poder comprobar que una cartola empalma con la anterior.
import type { MovimientoCartola } from '@atacama/core'
import * as XLSX from 'xlsx'

export interface CartolaLeida {
  archivo: string
  cuenta: string | null
  desde: string
  hasta: string
  saldoInicial: number
  saldoFinal: number
  movimientos: (MovimientoCartola & { saldo: number })[]
}

interface Item { s: string; x: number; y: number; r: number }

const montoPesos = (s: string): number | null =>
  /^\d{1,3}(\.\d{3})*(,\d{2})?$/.test(s) ? Math.round(Number(s.replace(/\./g, '').replace(',', '.'))) : null
const aIso = (d: string) => d.split('/').reverse().join('-')

export async function leerPdf(archivo: File): Promise<CartolaLeida> {
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await archivo.arrayBuffer()) }).promise

  let desde = '', hasta = '', cuenta: string | null = null
  let saldoInicial: number | null = null
  let cab: { hC: Item; hA: Item; hD: Item } | null = null
  let ultimaFecha: string | null = null
  const crudos: { fecha: string; nDoc: string; glosa: string; cargo: number; abono: number }[] = []

  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent()
    const it: Item[] = tc.items
      .filter((x: any) => 'str' in x && x.str.trim())
      .map((x: any) => ({ s: x.str.trim(), x: x.transform[4], y: x.transform[5], r: x.transform[4] + x.width }))

    if (!desde) {
      const fechas = it.filter((i) => /^\d\d\/\d\d\/\d{4}$/.test(i.s)).map((i) => i.s)
      if (fechas.length >= 2) [desde, hasta] = fechas.sort((a, b) => aIso(a).localeCompare(aIso(b))).filter((_, i, a) => i === 0 || i === a.length - 1)
      cuenta = it.find((i) => /^\d\d-\d{5}-\d$/.test(i.s))?.s ?? cuenta
    }

    const hC = it.find((i) => i.s === 'CARGOS' && it.some((j) => j.s === 'ABONOS' && Math.abs(j.y - i.y) < 3))
    if (hC) {
      const hA = it.find((i) => i.s === 'ABONOS' && Math.abs(i.y - hC.y) < 3)!
      const hD = it.find((i) => i.s === 'DESCRIPCION' && Math.abs(i.y - hC.y) < 3)!
      cab = { hC, hA, hD }
    }
    if (!cab) continue
    const { hC: c, hA: a, hD: d } = cab
    const res = it.find((i) => i.s === 'RESUMEN')
    const yTope = hC ? hC.y - 2 : 10000
    const yBase = res ? res.y : -1
    const cuerpo = it.filter((i) => i.y < yTope && i.y > yBase)

    const fechasCol = cuerpo.filter((i) => /^\d\d\/\d\d$/.test(i.s) && i.x < 50).sort((q, w) => w.y - q.y)
    const saldoI = cuerpo.find((i) => i.s === 'Saldo' && cuerpo.some((j) => j.s === 'Inicial' && Math.abs(j.y - i.y) < 2))
    if (saldoI) {
      const v = cuerpo.find((j) => montoPesos(j.s) !== null && Math.abs(j.y - saldoI.y) < 2 && j.x > a.r - 40)
      if (v) saldoInicial = montoPesos(v.s)
    }
    const lado = (i: Item) => (i.r >= c.x - 12 && i.r <= c.r + 12 ? 'C' : i.r >= a.x - 12 && i.r <= a.r + 12 ? 'A' : null)
    const esMonto = (i: Item) => montoPesos(i.s) !== null && i.x > d.x + 120

    // Cada movimiento empieza con una palabra en la columna de descripción; su monto cae dentro de su bloque vertical.
    const KW = /^(Transf\.?|Pago|Abono|Cargo|Venta|Compra|Traspaso|Dep|Giro|Comis|Cheque|Impuesto|Intereses)/i
    const inicios = cuerpo.filter((i) => Math.abs(i.x - d.x) <= 4 && KW.test(i.s)).sort((q, w) => w.y - q.y)
    inicios.forEach((st, k) => {
      const ySup = st.y + 4
      const yInf = k + 1 < inicios.length ? inicios[k + 1].y + 4 : yBase
      const bloque = cuerpo.filter((i) => i.y < ySup && i.y >= yInf)
      const monto = bloque.find((i) => esMonto(i) && lado(i))
      if (!monto) return
      const glosa = bloque
        .filter((i) => i.x >= d.x - 8 && i.x < c.x - 20 && i !== monto && !esMonto(i))
        .sort((q, w) => w.y - q.y || q.x - w.x)
        .map((i) => i.s)
        .join(' ')
        .replace(/\s*(TOTAL CARGOS|Ahora sus|sus transferencias).*$/, '')
      const nDoc = bloque.find((i) => /^\d{7,9}$/.test(i.s) && i.x > 40 && i.x < d.x - 5)?.s ?? ''
      const arriba = fechasCol.filter((f) => f.y >= st.y - 3)
      const dm = arriba.length ? arriba[arriba.length - 1].s : ultimaFecha
      if (!dm) return
      ultimaFecha = dm
      const v = montoPesos(monto.s)!
      crudos.push({ fecha: dm, nDoc, glosa, cargo: lado(monto) === 'C' ? v : 0, abono: lado(monto) === 'A' ? v : 0 })
    })
  }
  if (!desde || saldoInicial === null) throw new Error(`${archivo.name}: no se reconoce como cartola del Bice en pesos`)

  const [anioDesde, anioHasta] = [Number(desde.slice(6)), Number(hasta.slice(6))]
  const mesHasta = Number(hasta.slice(3, 5))
  let saldo = saldoInicial
  const movimientos = crudos.map((m) => {
    const mes = Number(m.fecha.slice(3, 5))
    const anio = anioDesde !== anioHasta && mes > mesHasta ? anioDesde : anioHasta
    saldo += m.abono - m.cargo
    return { ...m, fecha: `${anio}-${m.fecha.slice(3, 5)}-${m.fecha.slice(0, 2)}`, saldo }
  })
  return { archivo: archivo.name, cuenta, desde: aIso(desde), hasta: aIso(hasta), saldoInicial, saldoFinal: saldo, movimientos }
}

/** Cartola provisoria del Bice (Excel): trae lo último, con el más reciente primero. */
export async function leerExcel(archivo: File): Promise<CartolaLeida> {
  const libro = XLSX.read(await archivo.arrayBuffer(), { type: 'array' })
  const filas = XLSX.utils.sheet_to_json<(string | null)[]>(libro.Sheets[libro.SheetNames[0]], { header: 1, raw: false, defval: null })
  const entero = (s: string | null) => (s ? Math.round(Number(String(s).replace(/,/g, ''))) || 0 : 0)
  const iCab = filas.findIndex((f) => f.includes('FECHA') && f.includes('CARGOS'))
  const iFechas = filas.findIndex((f) => f[0] === 'FECHA DESDE')
  const iSaldos = filas.findIndex((f) => f.includes('SALDO INICIAL'))
  if (iCab < 0 || iSaldos < 0) throw new Error(`${archivo.name}: no se reconoce como cartola provisoria del Bice`)
  const saldoInicial = entero(filas[iSaldos + 1][filas[iSaldos].indexOf('SALDO INICIAL')])
  const cuenta = filas.find((f) => f.includes('CUENTA'))
  const nCuenta = cuenta ? (filas[filas.indexOf(cuenta) + 1].find((x) => x && /^\d\d-\d{5}-\d$/.test(x)) ?? null) : null
  const dmy = (s: string | null) => (s ? s.split('-').reverse().join('-') : '')
  const brutos: { fecha: string; nDoc: string; glosa: string; cargo: number; abono: number }[] = []
  for (let i = iCab + 1; i < filas.length && filas[i][0]; i++) {
    const f = filas[i]
    const e = String(f[0])
    brutos.push({ fecha: `${e.slice(0, 4)}-${e.slice(4, 6)}-${e.slice(6, 8)}`, nDoc: f[1] ? String(f[1]) : '', glosa: String(f[3] ?? ''), cargo: entero(f[4]), abono: entero(f[5]) })
  }
  brutos.reverse()
  let saldo = saldoInicial
  const movimientos = brutos.map((m) => ({ ...m, saldo: (saldo += m.abono - m.cargo) }))
  const [d, h] = filas[iFechas + 1]
  return { archivo: archivo.name, cuenta: nCuenta, desde: dmy(d), hasta: dmy(h), saldoInicial, saldoFinal: saldo, movimientos }
}

export async function leerCartola(archivo: File): Promise<CartolaLeida> {
  return /\.pdf$/i.test(archivo.name) ? leerPdf(archivo) : leerExcel(archivo)
}
