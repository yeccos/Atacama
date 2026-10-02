// Presupuesto mensual en grilla tipo Excel: meses oct-2026 a dic-2030 con subtotales anuales.
// Solo se editan los contenedores y los camiones; todo lo demás se calcula en el motor.
import { formatoNumero, parseNumeroCL, type EconomiaCliente, type ResultadoPpto } from '@atacama/core'
import type { CellValueChangedEvent, ColDef, ColGroupDef, RowClassParams } from 'ag-grid-community'
import { AgGridReact } from 'ag-grid-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from './api'
import { nombreMes } from './fechas'

type Tipo = 'titulo' | 'cont' | 'camiones' | 'linea' | 'total' | 'dato'
interface Fila {
  id: string
  concepto: string
  tipo: Tipo
  clienteId?: number
  /** Cómo se resume el año: suma, último valor o nada. */
  resumen: 'suma' | 'ultimo' | 'ninguno'
  decimales: number
  valores: number[]
  formula?: string
  editarEn?: string
}

interface Respuesta {
  version: { id: number; nombre: string; tc: number }
  resultado: ResultadoPpto
}

const mm = (n: number) => formatoNumero(Math.round(n))

/** Pantalla donde se editan los datos de una línea, según el motor. */
const PANTALLAS: Record<string, string> = {
  productos: 'Productos e insumos',
  versiones: 'Versiones y frecuencias',
  mp: 'Materia prima',
  destinos: 'Destinos y fletes',
  remuneraciones: 'Remuneraciones',
  indicadores: 'Indicadores y parámetros',
  clientes: 'Clientes',
}

function construirFilas(r: ResultadoPpto): Fila[] {
  const f: Fila[] = []
  const titulo = (id: string, concepto: string) => f.push({ id, concepto, tipo: 'titulo', resumen: 'ninguno', decimales: 0, valores: [] })
  titulo('t-cont', 'CONTENEDORES')
  for (const c of r.contenedores) f.push({ id: 'cont-' + c.clienteId, concepto: c.nombre, tipo: 'cont', clienteId: c.clienteId, resumen: 'suma', decimales: 0, valores: c.valores, editarEn: 'versiones', formula: 'Contenedores del mes: vienen de las reglas de frecuencia del cliente (Versiones y frecuencias). Si escribes un número en la celda, ese mes queda fijo.' })
  titulo('t-ventas', 'VENTAS')
  for (const v of r.ventas) f.push({ id: 'vta-' + v.clienteId, concepto: 'Venta ' + v.nombre, tipo: 'linea', resumen: 'suma', decimales: 0, valores: v.valores, editarEn: 'clientes', formula: 'Contenedores × kg por contenedor × US$ por kg × dólar. Con las escalas de descuento si hay más de un contenedor en el pedido.' })
  f.push({ id: 'total-ventas', concepto: 'TOTAL VENTAS', tipo: 'total', resumen: 'suma', decimales: 0, valores: r.totalVentas, formula: 'Suma de las ventas de todos los clientes.' })
  titulo('t-egresos', 'EGRESOS')
  for (const l of r.egresos) f.push({ id: l.clave, concepto: l.nombre, tipo: 'linea', resumen: 'suma', decimales: 0, valores: l.valores, formula: l.formula, editarEn: l.editarEn })
  f.push({ id: 'total-egresos', concepto: 'TOTAL EGRESOS', tipo: 'total', resumen: 'suma', decimales: 0, valores: r.totalEgresos, formula: 'Suma de todas las líneas de egresos de arriba (ninguna queda fuera).' })
  f.push({ id: 'margen', concepto: 'MARGEN NETO', tipo: 'total', resumen: 'suma', decimales: 0, valores: r.margen, formula: 'Total ventas − total egresos.' })
  f.push({ id: 'margen-acum', concepto: 'Margen acumulado', tipo: 'dato', resumen: 'ultimo', decimales: 0, valores: r.margenAcum })
  titulo('t-prod', 'PRODUCCIÓN Y MATERIA PRIMA')
  f.push({ id: 'camiones', concepto: 'Camiones MP (28 t)', tipo: 'camiones', resumen: 'suma', editarEn: 'mp', decimales: 0, valores: r.camiones, formula: 'Camiones de materia prima que se compran cada mes. Suma de los camiones de cada origen (Albemarle y SQM). Se editan por origen en Materia prima.' })
  f.push({ id: 'cont-prod', concepto: 'Contenedores producidos', tipo: 'dato', resumen: 'suma', decimales: 0, valores: r.contProducidos })
  f.push({ id: 'consumo', concepto: 'Consumo de MP (t)', tipo: 'dato', resumen: 'suma', decimales: 1, valores: r.consumoMPTon, formula: 'Kg vendidos ÷ (1 − merma) ÷ 1.000. La merma está en Indicadores y parámetros (mermaDefectoPct) y se puede registrar real por camión.', editarEn: 'indicadores' })
  f.push({ id: 'stock', concepto: 'Stock final MP (t)', tipo: 'dato', resumen: 'ultimo', decimales: 1, valores: r.stockMPTon, formula: 'Stock del mes anterior + camiones × 28 t − consumo de MP del mes.', editarEn: 'mp' })
  return f
}

const campo = (ym: string) => 'm_' + ym.replace('-', '_')

export default function Presupuesto({ irA }: { irA: (pagina: string) => void }) {
  const [versiones, setVersiones] = useState<{ id: number; nombre: string }[]>([])
  const [versionId, setVersionId] = useState<number | null>(null)
  const [tc, setTc] = useState('')
  const [sin, setSin] = useState('')
  const [datos, setDatos] = useState<Respuesta | null>(null)
  const [eco, setEco] = useState<{ clientes: EconomiaCliente[]; fijosMensualesCLP: number; puntoEquilibrio: number | null } | null>(null)
  const [error, setError] = useState('')
  const [sel, setSel] = useState<Record<string, any> | null>(null)

  useEffect(() => {
    api<any[]>('/r/versiones').then((v) => {
      setVersiones(v)
      if (v.length) setVersionId(v[0].id)
    })
  }, [])

  const cargar = useCallback(async () => {
    if (!versionId) return
    try {
      const q = new URLSearchParams()
      const tcNum = parseNumeroCL(tc)
      if (tcNum) q.set('tc', String(tcNum))
      if (sin) q.set('sin', sin)
      setDatos(await api(`/presupuesto/${versionId}?${q}`))
      setEco(await api(`/presupuesto/${versionId}/economia`))
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }, [versionId, tc, sin])

  useEffect(() => {
    cargar()
  }, [cargar])

  const filas = useMemo(() => (datos ? construirFilas(datos.resultado) : []), [datos])

  const columnas = useMemo<(ColDef | ColGroupDef)[]>(() => {
    if (!datos) return []
    const meses = datos.resultado.meses
    const anios = [...new Set(meses.map((m) => m.slice(0, 4)))]
    const celda = (decimalesDe: (fila: Fila) => number): Partial<ColDef> => ({
      type: 'rightAligned',
      valueFormatter: (p) => (p.value === undefined || p.value === null ? '' : formatoNumero(p.value, decimalesDe(p.data))),
    })
    const grupos: ColGroupDef[] = anios.map((a) => ({
      headerName: a,
      children: [
        ...meses
          .filter((m) => m.startsWith(a))
          .map<ColDef>((m) => ({
            field: campo(m),
            headerName: nombreMes(m),
            width: 104,
            editable: (p) => p.data.tipo === 'cont',
            cellClassRules: { 'celda-editable': (p) => p.data.tipo === 'cont' },
            valueParser: (p) => {
              const n = parseNumeroCL(p.newValue)
              return n === null || n < 0 || !Number.isInteger(n) ? p.oldValue : n
            },
            ...celda((f) => f.decimales),
          })),
        {
          field: 'T' + a,
          headerName: 'Total ' + a,
          width: 124,
          cellClass: 'columna-total',
          ...celda((f) => f.decimales),
        },
      ],
    }))
    return [{ field: 'concepto', headerName: 'Concepto', pinned: 'left', width: 290, editable: false }, ...grupos]
  }, [datos])

  const rowData = useMemo(() => {
    if (!datos) return []
    const meses = datos.resultado.meses
    return filas.map((fila) => {
      const o: Record<string, any> = { id: fila.id, concepto: fila.concepto, tipo: fila.tipo, clienteId: fila.clienteId, decimales: fila.decimales, formula: fila.formula, editarEn: fila.editarEn }
      if (fila.tipo === 'titulo') return o
      meses.forEach((m, i) => (o[campo(m)] = fila.valores[i]))
      for (const a of new Set(meses.map((m) => m.slice(0, 4)))) {
        const del = fila.valores.filter((_, i) => meses[i].startsWith(a))
        if (fila.resumen === 'suma') o['T' + a] = del.reduce((s, x) => s + x, 0)
        else if (fila.resumen === 'ultimo') o['T' + a] = del[del.length - 1]
      }
      return o
    })
  }, [filas, datos])

  async function alEditar(e: CellValueChangedEvent) {
    const mes = String(e.colDef.field).slice(2).replace('_', '-')
    try {
      if (e.data.tipo === 'cont') await api(`/presupuesto/${versionId}/contenedor`, 'PUT', { clienteId: e.data.clienteId, mes, contenedores: e.newValue })
      else await api(`/presupuesto/${versionId}/camiones`, 'PUT', { mes, camiones: e.newValue })
      cargar()
    } catch (err) {
      setError((err as Error).message)
      cargar()
    }
  }

  const estiloFila = (p: RowClassParams) =>
    p.data?.tipo === 'titulo' ? { background: '#e2e8f0', fontWeight: 600 } : p.data?.tipo === 'total' ? { fontWeight: 700, background: '#f1f5f9' } : undefined

  const infoSel = sel && sel.tipo !== 'titulo' ? sel : null

  return (
    // La página ocupa toda la pantalla: la grilla se desplaza por dentro y su encabezado de meses no se mueve.
    <div className="flex flex-col" style={{ height: 'calc(100vh - 48px)' }}>
      <div className="mb-2 flex flex-none flex-wrap items-end gap-3">
        <h2 className="mr-auto text-base font-semibold">Presupuesto</h2>
        <label className="text-xs text-slate-600">
          Versión
          <select className="campo mt-1" value={versionId ?? ''} onChange={(e) => setVersionId(Number(e.target.value))}>
            {versiones.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-600">
          Sensibilidad: dólar (TC)
          <input className="campo mt-1 w-28" placeholder={datos ? formatoNumero(datos.version.tc, 0) : ''} value={tc} onChange={(e) => setTc(e.target.value)} />
        </label>
        <label className="text-xs text-slate-600">
          Sin el cliente…
          <select className="campo mt-1" value={sin} onChange={(e) => setSin(e.target.value)}>
            <option value="">(todos)</option>
            {datos?.resultado.contenedores.map((c) => <option key={c.clienteId} value={c.clienteId}>{c.nombre}</option>)}
          </select>
        </label>
        {(tc || sin) && <button className="btn" onClick={() => { setTc(''); setSin('') }}>Quitar sensibilidad</button>}
      </div>

      {error && <p className="mb-2 flex-none rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mb-2 flex flex-none flex-wrap items-start gap-2">
        {datos && datos.resultado.advertencias.length > 0 && (
          <details className="rounded border border-amber-200 bg-amber-50 px-3 py-1.5">
            <summary className="cursor-pointer text-sm font-medium text-amber-900">{datos.resultado.advertencias.length} advertencias del cálculo</summary>
            <ul className="mt-1 max-h-48 list-disc overflow-auto pl-5 text-sm text-amber-900">{datos.resultado.advertencias.map((a, i) => <li key={i}>{a}</li>)}</ul>
          </details>
        )}
        {eco && (
          <details className="rounded border border-slate-200 bg-white px-3 py-1.5">
            <summary className="cursor-pointer text-sm font-medium">Economía por contenedor y punto de equilibrio</summary>
            <div className="max-h-64 overflow-auto py-2">
          <table className="block max-w-full overflow-x-auto rounded border border-slate-200 bg-white text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
                {['Cliente', 'Venta', 'Costo variable', 'Contribución', '%'].map((t, i) => <th key={t} className={`px-3 py-2 font-medium ${i ? 'text-right' : ''}`}>{t}</th>)}
              </tr>
            </thead>
            <tbody>
              {eco.clientes.map((c) => (
                <tr key={c.clienteId} className="border-b border-slate-100">
                  <td className="px-3 py-1.5">{c.nombre}</td>
                  <td className="px-3 py-1.5 text-right">${mm(c.ventaCLP)}</td>
                  <td className="px-3 py-1.5 text-right">${mm(c.costoVariableCLP)}</td>
                  <td className="px-3 py-1.5 text-right font-medium">${mm(c.contribucionCLP)}</td>
                  <td className="px-3 py-1.5 text-right">{formatoNumero(c.contribucionPct, 1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
              <p className="mt-2 text-sm text-slate-600">
                Costos fijos mensuales: <b>${mm(eco.fijosMensualesCLP)}</b>.
                {eco.puntoEquilibrio !== null && (
                  <> Punto de equilibrio: <b>{formatoNumero(eco.puntoEquilibrio, 1)} contenedores al mes</b> (con la contribución promedio de los clientes activos).</>
                )}
              </p>
            </div>
          </details>
        )}
        <p className="self-center text-xs text-slate-500">
          Celdas azules = datos que se editan aquí. Haz clic en una fila para ver cómo se calcula. Montos en pesos, sin IVA.
        </p>
      </div>

      <div className="min-h-0 flex-1">
        <AgGridReact
          rowData={rowData}
          columnDefs={columnas}
          getRowId={(p) => p.data.id}
          getRowStyle={estiloFila}
          onCellValueChanged={alEditar}
          onRowClicked={(e) => setSel(e.data ?? null)}
          suppressMovableColumns
          stopEditingWhenCellsLoseFocus
          rowHeight={28}
        />
      </div>

      {infoSel?.formula && (
        <div className="mt-2 flex flex-none flex-wrap items-center gap-3 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-sm">
          <div className="min-w-0 flex-1">
            <b>{infoSel.concepto}:</b> {infoSel.formula}
          </div>
          {infoSel.editarEn && PANTALLAS[infoSel.editarEn] && (
            <button className="btn-primario" onClick={() => irA(infoSel.editarEn)}>Editar en {PANTALLAS[infoSel.editarEn]}</button>
          )}
          <button className="btn" onClick={() => setSel(null)}>Cerrar</button>
        </div>
      )}
    </div>
  )
}
