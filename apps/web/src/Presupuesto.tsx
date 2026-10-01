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
}

interface Respuesta {
  version: { id: number; nombre: string; tc: number }
  modo: 'excel' | 'corregido'
  resultado: ResultadoPpto
  validacion: {
    referenciaExcel: { ventas2027: number; margen2027: number; margenMesInicial: number }
    excel: { anio: string; ventasAnio: number; margenAnio: number; margenMesInicial: number; mesInicial: string }
    corregido: { anio: string; ventasAnio: number; margenAnio: number; margenMesInicial: number; mesInicial: string }
  }
}

const mm = (n: number) => formatoNumero(Math.round(n))

function construirFilas(r: ResultadoPpto): Fila[] {
  const f: Fila[] = []
  const titulo = (id: string, concepto: string) => f.push({ id, concepto, tipo: 'titulo', resumen: 'ninguno', decimales: 0, valores: [] })
  titulo('t-cont', 'CONTENEDORES')
  for (const c of r.contenedores) f.push({ id: 'cont-' + c.clienteId, concepto: c.nombre, tipo: 'cont', clienteId: c.clienteId, resumen: 'suma', decimales: 0, valores: c.valores })
  titulo('t-ventas', 'VENTAS')
  for (const v of r.ventas) f.push({ id: 'vta-' + v.clienteId, concepto: 'Venta ' + v.nombre, tipo: 'linea', resumen: 'suma', decimales: 0, valores: v.valores })
  f.push({ id: 'total-ventas', concepto: 'TOTAL VENTAS', tipo: 'total', resumen: 'suma', decimales: 0, valores: r.totalVentas })
  titulo('t-egresos', 'EGRESOS')
  for (const l of r.egresos) f.push({ id: l.clave, concepto: l.nombre, tipo: 'linea', resumen: 'suma', decimales: 0, valores: l.valores })
  f.push({ id: 'total-egresos', concepto: 'TOTAL EGRESOS', tipo: 'total', resumen: 'suma', decimales: 0, valores: r.totalEgresos })
  f.push({ id: 'margen', concepto: 'MARGEN NETO', tipo: 'total', resumen: 'suma', decimales: 0, valores: r.margen })
  f.push({ id: 'margen-acum', concepto: 'Margen acumulado', tipo: 'dato', resumen: 'ultimo', decimales: 0, valores: r.margenAcum })
  titulo('t-prod', 'PRODUCCIÓN Y MATERIA PRIMA')
  f.push({ id: 'camiones', concepto: 'Camiones MP (28 t)', tipo: 'camiones', resumen: 'suma', decimales: 0, valores: r.camiones })
  f.push({ id: 'cont-prod', concepto: 'Contenedores producidos', tipo: 'dato', resumen: 'suma', decimales: 0, valores: r.contProducidos })
  f.push({ id: 'consumo', concepto: 'Consumo de MP (t)', tipo: 'dato', resumen: 'suma', decimales: 1, valores: r.consumoMPTon })
  f.push({ id: 'stock', concepto: 'Stock final MP (t)', tipo: 'dato', resumen: 'ultimo', decimales: 1, valores: r.stockMPTon })
  return f
}

const campo = (ym: string) => 'm_' + ym.replace('-', '_')

export default function Presupuesto() {
  const [versiones, setVersiones] = useState<{ id: number; nombre: string }[]>([])
  const [versionId, setVersionId] = useState<number | null>(null)
  const [modo, setModo] = useState<'corregido' | 'excel'>('corregido')
  const [tc, setTc] = useState('')
  const [sin, setSin] = useState('')
  const [datos, setDatos] = useState<Respuesta | null>(null)
  const [eco, setEco] = useState<{ clientes: EconomiaCliente[]; fijosMensualesCLP: number; puntoEquilibrio: number | null } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api<any[]>('/r/versiones').then((v) => {
      setVersiones(v)
      if (v.length) setVersionId(v[0].id)
    })
  }, [])

  const cargar = useCallback(async () => {
    if (!versionId) return
    try {
      const q = new URLSearchParams({ modo })
      const tcNum = parseNumeroCL(tc)
      if (tcNum) q.set('tc', String(tcNum))
      if (sin) q.set('sin', sin)
      setDatos(await api(`/presupuesto/${versionId}?${q}`))
      setEco(await api(`/presupuesto/${versionId}/economia`))
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }, [versionId, modo, tc, sin])

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
            editable: (p) => p.data.tipo === 'cont' || p.data.tipo === 'camiones',
            cellClassRules: { 'celda-editable': (p) => p.data.tipo === 'cont' || p.data.tipo === 'camiones' },
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
      const o: Record<string, any> = { id: fila.id, concepto: fila.concepto, tipo: fila.tipo, clienteId: fila.clienteId, decimales: fila.decimales }
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

  const v = datos?.validacion
  const dif = (a: number, b: number) => (Math.abs(a - b) < 1.5 ? 'text-emerald-700' : 'text-red-700')

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <h2 className="mr-auto text-base font-semibold">Presupuesto</h2>
        <label className="text-xs text-slate-600">
          Versión
          <select className="campo mt-1" value={versionId ?? ''} onChange={(e) => setVersionId(Number(e.target.value))}>
            {versiones.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-600">
          Cálculo
          <select className="campo mt-1" value={modo} onChange={(e) => setModo(e.target.value as any)}>
            <option value="corregido">Corregido</option>
            <option value="excel">Réplica del Excel (con sus errores)</option>
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

      {error && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {datos && datos.resultado.advertencias.length > 0 && (
        <div className="mb-3 rounded border border-amber-200 bg-amber-50 p-3">
          <p className="mb-1 text-sm font-semibold text-amber-900">Advertencias del cálculo</p>
          <ul className="list-disc pl-5 text-sm text-amber-900">{datos.resultado.advertencias.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </div>
      )}

      {v && (
        <div className="mb-4 overflow-x-auto rounded border border-slate-200 bg-white">
          <p className="border-b border-slate-200 px-3 py-2 text-sm font-semibold">
            Validación contra el Excel (sin sensibilidad)
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="px-3 py-1.5 font-medium"></th>
                <th className="px-3 py-1.5 text-right font-medium">Excel original</th>
                <th className="px-3 py-1.5 text-right font-medium">Réplica (con errores)</th>
                <th className="px-3 py-1.5 text-right font-medium">Corregido</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Ventas ' + v.excel.anio, v.referenciaExcel.ventas2027, v.excel.ventasAnio, v.corregido.ventasAnio],
                ['Margen ' + v.excel.anio, v.referenciaExcel.margen2027, v.excel.margenAnio, v.corregido.margenAnio],
                ['Margen ' + nombreMes(v.excel.mesInicial), v.referenciaExcel.margenMesInicial, v.excel.margenMesInicial, v.corregido.margenMesInicial],
              ].map(([t, ref, rep, cor]) => (
                <tr key={t as string} className="border-t border-slate-100">
                  <td className="px-3 py-1.5">{t}</td>
                  <td className="px-3 py-1.5 text-right">${mm(ref as number)}</td>
                  <td className={`px-3 py-1.5 text-right ${dif(ref as number, rep as number)}`}>${mm(rep as number)}</td>
                  <td className="px-3 py-1.5 text-right font-medium">${mm(cor as number)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-xs text-slate-500">
            Verde: la réplica calza con el Excel. La diferencia con "Corregido" son los errores del Excel (inversiones y pintura fuera de la suma,
            Kosher no cargado, flete a Nueva York, precio de NADARRA) y lo que el Excel no tenía (seguro de salud, bono de descarga).
          </p>
        </div>
      )}

      <p className="mb-2 text-xs text-slate-500">
        Edita directamente los contenedores y los camiones de cada mes (celdas azules); el resto se recalcula. Montos en pesos, sin IVA.
      </p>
      <div style={{ height: Math.min(80 + filas.length * 28, 760) }}>
        <AgGridReact
          rowData={rowData}
          columnDefs={columnas}
          getRowId={(p) => p.data.id}
          getRowStyle={estiloFila}
          onCellValueChanged={alEditar}
          suppressMovableColumns
          stopEditingWhenCellsLoseFocus
          rowHeight={28}
        />
      </div>

      {eco && (
        <section className="mt-6">
          <h3 className="mb-2 text-base font-semibold">Economía por contenedor</h3>
          <table className="rounded border border-slate-200 bg-white text-sm">
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
        </section>
      )}
    </div>
  )
}
