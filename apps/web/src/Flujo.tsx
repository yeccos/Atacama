// Flujo de caja mensual proyectado: cobros por hitos, costos con IVA, remuneraciones, deudas y partidas manuales.
import { formatoNumero, parseNumeroCL, type ResultadoFlujo } from '@atacama/core'
import { useCallback, useEffect, useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from './api'
import FilasEgresos, { ordenHito, type FacturaIncluida } from './FilasEgresos'
import { nombreMes } from './fechas'
import Maestro from './Maestro'

interface Respuesta {
  version: { id: number; nombre: string; tc: number }
  flujo: ResultadoFlujo
  advertencias: string[]
  modoIVA: string
  facturas: FacturaIncluida[]
}

const num = (v: number) => (Math.abs(v) < 0.5 ? '' : formatoNumero(Math.round(v)))

export default function Flujo() {
  const [versiones, setVersiones] = useState<{ id: number; nombre: string }[]>([])
  const [versionId, setVersionId] = useState<number | null>(null)
  const [tc, setTc] = useState('')
  const [nMeses, setNMeses] = useState(24)
  const [datos, setDatos] = useState<Respuesta | null>(null)
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
      const q = new URLSearchParams({ meses: String(nMeses) })
      const t = parseNumeroCL(tc)
      if (t) q.set('tc', String(t))
      setDatos(await api(`/flujo/${versionId}?${q}`))
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }, [versionId, tc, nMeses])

  useEffect(() => {
    cargar()
  }, [cargar])

  const f = datos?.flujo
  const grafico = f?.meses.map((m, i) => ({ mes: nombreMes(m), saldo: Math.round(f.saldoFinal[i]) })) ?? []
  const fila = (clave: string, nombre: string, valores: number[], clases = '') => (
    <tr key={clave} className={`border-b border-slate-100 ${clases}`}>
      <td className="sticky left-0 z-10 bg-inherit px-3 py-1.5 whitespace-nowrap">{nombre}</td>
      {valores.map((v, i) => <td key={i} className={`px-3 py-1.5 text-right whitespace-nowrap ${v < 0 && clases.includes('saldo') ? 'text-red-700' : ''}`}>{num(v)}</td>)}
    </tr>
  )

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <h2 className="mr-auto text-base font-semibold">Flujo de caja mensual</h2>
        <label className="text-xs text-slate-600">
          Versión
          <select className="campo mt-1" value={versionId ?? ''} onChange={(e) => setVersionId(Number(e.target.value))}>
            {versiones.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-600">
          Meses
          <select className="campo mt-1" value={nMeses} onChange={(e) => setNMeses(Number(e.target.value))}>
            {[12, 24, 36].map((n) => <option key={n}>{n}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-600">
          Dólar (TC)
          <input className="campo mt-1 w-28" placeholder={datos ? formatoNumero(datos.version.tc, 0) : ''} value={tc} onChange={(e) => setTc(e.target.value)} />
        </label>
      </div>

      {error && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {f && f.alertas.length > 0 && (
        <div className="mb-3 rounded border border-red-200 bg-red-50 p-3">
          <p className="mb-1 text-sm font-semibold text-red-800">Alertas de caja</p>
          <ul className="list-disc pl-5 text-sm text-red-800">
            {f.alertas.map((a, i) => <li key={i}>{a.tipo === 'SALDO_NEGATIVO' ? 'Saldo negativo' : 'Saldo bajo el mínimo'} a fin de {nombreMes(a.mes)}</li>)}
          </ul>
        </div>
      )}
      {datos && datos.advertencias.length > 0 && (
        <div className="mb-3 rounded border border-amber-200 bg-amber-50 p-3">
          <p className="mb-1 text-sm font-semibold text-amber-900">Supuestos y datos por completar</p>
          <ul className="list-disc pl-5 text-sm text-amber-900">{datos.advertencias.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </div>
      )}

      {f && (
        <>
          <div className="mb-4 h-56 rounded border border-slate-200 bg-white p-2">
            <ResponsiveContainer>
              <LineChart data={grafico} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="mes" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => formatoNumero(Math.round(v / 1_000_000)) + ' MM'} width={64} />
                <Tooltip formatter={(v) => '$' + formatoNumero(Number(v))} />
                <ReferenceLine y={0} stroke="#b91c1c" />
                <Line type="monotone" dataKey="saldo" name="Saldo final" stroke="#0369a1" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-x-auto rounded border border-slate-200 bg-white">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="sticky left-0 z-10 bg-white px-3 py-2">Concepto (montos con IVA, en pesos)</th>
                  {f.meses.map((m) => <th key={m} className="px-3 py-2 text-right font-medium">{nombreMes(m)}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr className="bg-slate-100"><td colSpan={f.meses.length + 1} className="px-3 py-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Ingresos</td></tr>
                <FilasEgresos
                  egresos={f.ingresos}
                  facturas={[]}
                  columnas={f.meses.length}
                  columnaDe={() => -1}
                  ordenGrupos={[]}
                  abiertoInicial
                  ordenLinea={ordenHito}
                />
                {fila('ti', 'Total ingresos', f.totalIngresos, 'bg-slate-50 font-semibold')}
                <tr className="bg-slate-100"><td colSpan={f.meses.length + 1} className="px-3 py-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Egresos</td></tr>
                <FilasEgresos
                  egresos={f.egresos}
                  facturas={datos?.facturas ?? []}
                  columnas={f.meses.length}
                  columnaDe={(fecha) => f.meses.indexOf(fecha.slice(0, 7))}
                />
                {fila('te', 'Total egresos', f.totalEgresos, 'bg-slate-50 font-semibold')}
                {fila('fn', 'Flujo neto del mes', f.flujoNeto, 'saldo font-semibold')}
                {fila('sf', 'Saldo final de caja', f.saldoFinal, 'saldo bg-sky-50 font-bold')}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            La columna de septiembre es informativa: lo que muestra ya está incluido en el saldo del banco con que parte el flujo. Cobros al tipo de cambio del presupuesto; devolución de IVA:{' '}
            {datos?.modoIVA === 'fijo' ? 'monto fijo mensual (parámetro)' : 'calculada sobre el IVA crédito'}. Las compras de materia prima se pagan cuando se consumen
            (la fecha real de pago llega con las facturas, Fase 4).
          </p>
        </>
      )}

      <div className="mt-8">
        <Maestro
          recurso="hitosCobro"
          titulo="Cobros de embarques reales (marca los días de atraso)"
          ayuda="La fecha de cada cobro sale de las fechas del embarque (pantalla Embarques en curso) y los días de su forma de pago. Aquí solo ajustas los días de atraso, y el flujo se recalcula al instante. Los cobros en estado COBRADO ya no entran al flujo."
          alCambiar={cargar}
          columnas={[
            { campo: 'embarqueId', titulo: 'Embarque N°', tipo: 'entero', ancho: 130 },
            { campo: 'evento', titulo: 'Hito' },
            { campo: 'pct', titulo: '%', tipo: 'decimal', ancho: 90 },
            { campo: 'montoUsdCent', titulo: 'Monto US$', tipo: 'usd' },
            { campo: 'fechaEsperada', titulo: 'Fecha base', tipo: 'fecha' },
            { campo: 'diasAtraso', titulo: 'Días de atraso', tipo: 'entero', defecto: '0' },
            { campo: 'estado', titulo: 'Estado', tipo: 'opcion', opciones: ['PENDIENTE', 'PARCIAL', 'COBRADO'], defecto: 'PENDIENTE' },
          ]}
        />
        <Maestro
          recurso="partidasFlujo"
          titulo="Partidas manuales del flujo"
          ayuda="Ingresos (+) y egresos (−) puntuales, en pesos. Ejemplo: el pago único de octubre o los movimientos de la última semana de septiembre."
          alCambiar={cargar}
          columnas={[
            { campo: 'fecha', titulo: 'Fecha', tipo: 'fecha', ancho: 140 },
            { campo: 'concepto', titulo: 'Concepto', ancho: 320 },
            { campo: 'monto', titulo: 'Monto ($, egreso con signo −)', tipo: 'clp' },
            { campo: 'nota', titulo: 'Nota', ancho: 380 },
          ]}
        />
      </div>
    </div>
  )
}
