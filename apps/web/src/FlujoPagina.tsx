// Flujo de caja: vista mensual, semanal (13 semanas) y comparación de escenarios.
import { formatoNumero, parseNumeroCL, type PeriodoFlujo, type ResultadoFlujoSemanal, type ResumenSemanal } from '@atacama/core'
import { useCallback, useEffect, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from './api'
import { diaMes } from './fechas'
import Flujo from './Flujo'

type Vista = 'mensual' | 'semanal' | 'escenarios'

const num = (v: number) => (Math.abs(v) < 0.5 ? '' : formatoNumero(Math.round(v)))
const mm = (v: number) => (v < 0 ? '-$' : '$') + formatoNumero(Math.abs(Math.round(v)))
const etiqueta = (p: PeriodoFlujo, i: number) => (i === 0 ? 'Cierre' : `S${i}`)
const subetiqueta = (p: PeriodoFlujo, i: number) => (i === 0 ? `hasta ${diaMes(p.hasta)}` : diaMes(p.desde!))

function useVersiones() {
  const [versiones, setVersiones] = useState<{ id: number; nombre: string; tcPresupuesto: string }[]>([])
  const [versionId, setVersionId] = useState<number | null>(null)
  useEffect(() => {
    api<any[]>('/r/versiones').then((v) => {
      setVersiones(v)
      if (v.length) setVersionId(v[0].id)
    })
  }, [])
  return { versiones, versionId, setVersionId }
}

function Semanal() {
  const { versiones, versionId, setVersionId } = useVersiones()
  const [semanas, setSemanas] = useState(13)
  const [tc, setTc] = useState('')
  const [datos, setDatos] = useState<{ flujo: ResultadoFlujoSemanal; resumen: ResumenSemanal; advertencias: string[]; version: { tc: number } } | null>(null)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    if (!versionId) return
    try {
      const q = new URLSearchParams({ semanas: String(semanas) })
      const t = parseNumeroCL(tc)
      if (t) q.set('tc', String(t))
      setDatos(await api(`/flujo/${versionId}/semanal?${q}`))
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }, [versionId, semanas, tc])
  useEffect(() => {
    cargar()
  }, [cargar])

  const f = datos?.flujo
  const r = datos?.resumen
  const grafico = f?.periodos.map((p, i) => ({ semana: i === 0 ? 'Cierre' : `S${i} ${diaMes(p.desde!)}`, saldo: Math.round(f.saldoFinal[i]) })) ?? []
  const fila = (clave: string, nombre: string, valores: number[], clases = '') => (
    <tr key={clave} className={`border-b border-slate-100 ${clases}`}>
      <td className="sticky left-0 z-10 bg-inherit px-3 py-1.5 whitespace-nowrap">{nombre}</td>
      {valores.map((v, i) => (
        <td key={i} className={`px-3 py-1.5 text-right whitespace-nowrap ${v < 0 && clases.includes('saldo') ? 'text-red-700' : ''} ${clases.includes('saldo') && r && i === r.semanaSaldoMinimo ? 'outline outline-2 -outline-offset-2 outline-amber-500' : ''}`}>
          {num(v)}
        </td>
      ))}
    </tr>
  )

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-600">
          Versión
          <select className="campo mt-1" value={versionId ?? ''} onChange={(e) => setVersionId(Number(e.target.value))}>
            {versiones.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-600">
          Semanas
          <select className="campo mt-1" value={semanas} onChange={(e) => setSemanas(Number(e.target.value))}>
            {[8, 13, 26].map((n) => <option key={n}>{n}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-600">
          Dólar (TC)
          <input className="campo mt-1 w-28" placeholder={datos ? formatoNumero(datos.version.tc, 0) : ''} value={tc} onChange={(e) => setTc(e.target.value)} />
        </label>
      </div>
      {error && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {r && f && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ['Saldo más bajo', mm(r.saldoMinimo), `semana ${r.semanaSaldoMinimo} (${diaMes(f.periodos[r.semanaSaldoMinimo].desde!)})`, r.saldoMinimo < 0],
              ['Primera semana en negativo', r.primeraSemanaNegativa ? `Semana ${r.primeraSemanaNegativa}` : 'Ninguna', r.primeraSemanaNegativa ? diaMes(f.periodos[r.primeraSemanaNegativa].desde!) : 'caja positiva todo el período', r.primeraSemanaNegativa !== null],
              ['Caja que faltaría', mm(r.cajaNecesaria), 'para no bajar del mínimo', r.cajaNecesaria > 0],
              [`Saldo semana ${semanas}`, mm(r.saldoFinal), `cobros del período ${mm(r.totalCobros)}`, r.saldoFinal < 0],
            ].map(([t, v, s, malo]) => (
              <div key={t as string} className={`rounded border p-3 ${malo ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
                <p className="text-xs text-slate-500">{t}</p>
                <p className={`text-lg font-semibold ${malo ? 'text-red-700' : ''}`}>{v}</p>
                <p className="text-xs text-slate-500">{s}</p>
              </div>
            ))}
          </div>

          <div className="mb-4 h-56 rounded border border-slate-200 bg-white p-2">
            <ResponsiveContainer>
              <LineChart data={grafico} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="semana" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => formatoNumero(Math.round(v / 1_000_000)) + ' MM'} width={64} />
                <Tooltip formatter={(v) => '$' + formatoNumero(Number(v))} />
                <ReferenceLine y={0} stroke="#b91c1c" />
                <Line type="monotone" dataKey="saldo" name="Saldo final" stroke="#0369a1" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-x-auto rounded border border-slate-200 bg-white">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="sticky left-0 z-10 bg-white px-3 py-2">Concepto (con IVA, en pesos)</th>
                  {f.periodos.map((p, i) => (
                    <th key={i} className="px-3 py-1 text-right font-medium">
                      {etiqueta(p, i)}
                      <span className="block text-xs font-normal text-slate-500">{subetiqueta(p, i)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="bg-slate-100"><td colSpan={f.periodos.length + 1} className="px-3 py-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Ingresos</td></tr>
                {f.ingresos.map((l) => fila(l.clave, l.nombre, l.valores))}
                {fila('ti', 'Total ingresos', f.totalIngresos, 'bg-slate-50 font-semibold')}
                <tr className="bg-slate-100"><td colSpan={f.periodos.length + 1} className="px-3 py-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Egresos</td></tr>
                {f.egresos.map((l) => fila(l.clave, l.nombre, l.valores))}
                {fila('te', 'Total egresos', f.totalEgresos, 'bg-slate-50 font-semibold')}
                {fila('fn', 'Flujo neto de la semana', f.flujoNeto, 'saldo font-semibold')}
                {fila('sf', 'Saldo final de caja', f.saldoFinal, 'saldo bg-sky-50 font-bold')}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Cada monto cae en la fecha en que se paga o se cobra: sueldos a fin de mes, Previred y gastos fijos el 10, costos de cada embarque en su ETD (la materia prima 7 días antes),
            devolución de IVA el 20, cobros en la fecha de cada hito. Esos días se cambian en Indicadores y parámetros. El cuadro naranja marca la semana de menor saldo.
          </p>
        </>
      )}
      {datos && datos.advertencias.length > 0 && (
        <details className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-amber-900">{datos.advertencias.length} supuestos y datos por completar</summary>
          <ul className="mt-1 list-disc pl-5 text-sm text-amber-900">{datos.advertencias.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </details>
      )}
    </div>
  )
}

interface Escenario {
  nombre: string
  tc: string
  atraso: string
  costos: string
  sin: string
}

interface ResultadoEscenario {
  nombre: string
  tc: number
  resumen: ResumenSemanal
  saldos: number[]
  margen12m: number
}

const COLORES = ['#0369a1', '#b91c1c', '#15803d', '#a16207', '#7e22ce']

function Escenarios() {
  const { versiones, versionId, setVersionId } = useVersiones()
  const tcBase = Number(versiones.find((v) => v.id === versionId)?.tcPresupuesto ?? 0)
  const [lista, setLista] = useState<Escenario[]>([
    { nombre: 'Base', tc: '', atraso: '', costos: '', sin: '' },
    { nombre: 'Pesimista', tc: '', atraso: '30', costos: '5', sin: '' },
    { nombre: 'Optimista', tc: '', atraso: '', costos: '', sin: '' },
  ])
  const [clientes, setClientes] = useState<{ id: number; nombre: string }[]>([])
  const [res, setRes] = useState<{ periodos: PeriodoFlujo[]; escenarios: ResultadoEscenario[] } | null>(null)
  const [error, setError] = useState('')
  const [calculando, setCalculando] = useState(false)

  useEffect(() => {
    api<any[]>('/r/clientes').then(setClientes)
  }, [])

  const cambiar = (i: number, campo: keyof Escenario, valor: string) => setLista((l) => l.map((e, j) => (j === i ? { ...e, [campo]: valor } : e)))

  async function calcular(usar: Escenario[] = lista) {
    if (!versionId) return
    setCalculando(true)
    try {
      const escenarios = usar.map((e) => ({
        nombre: e.nombre,
        tc: parseNumeroCL(e.tc),
        atrasoCobros: parseNumeroCL(e.atraso),
        costosPct: parseNumeroCL(e.costos),
        sinCliente: e.sin ? Number(e.sin) : null,
      }))
      setRes(await api(`/escenarios/${versionId}`, 'POST', { escenarios, semanas: 13 }))
      setError('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCalculando(false)
    }
  }
  // Al abrir: el pesimista parte con el dólar 25 pesos más bajo y el optimista 25 más alto que el del presupuesto.
  // Después se calcula con el botón.
  useEffect(() => {
    if (!versionId || !tcBase) return
    const inicial = lista.map((e) =>
      e.tc !== '' ? e : e.nombre === 'Pesimista' ? { ...e, tc: formatoNumero(tcBase - 25) } : e.nombre === 'Optimista' ? { ...e, tc: formatoNumero(tcBase + 25) } : e,
    )
    setLista(inicial)
    calcular(inicial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionId, tcBase])

  const grafico = res?.periodos.map((p, i) => {
    const fila: Record<string, number | string> = { semana: i === 0 ? 'Cierre' : `S${i} ${diaMes(p.desde!)}` }
    res.escenarios.forEach((e) => (fila[e.nombre] = Math.round(e.saldos[i])))
    return fila
  })

  const filas: [string, (e: ResultadoEscenario) => string, (e: ResultadoEscenario) => boolean][] = [
    ['Dólar usado', (e) => '$' + formatoNumero(e.tc, 0), () => false],
    ['Saldo más bajo de caja', (e) => mm(e.resumen.saldoMinimo), (e) => e.resumen.saldoMinimo < 0],
    ['Semana del saldo más bajo', (e) => `S${e.resumen.semanaSaldoMinimo}`, () => false],
    ['Primera semana en negativo', (e) => (e.resumen.primeraSemanaNegativa ? `S${e.resumen.primeraSemanaNegativa}` : 'Ninguna'), (e) => e.resumen.primeraSemanaNegativa !== null],
    ['Caja que faltaría', (e) => mm(e.resumen.cajaNecesaria), (e) => e.resumen.cajaNecesaria > 0],
    ['Saldo a la semana 13', (e) => mm(e.resumen.saldoFinal), (e) => e.resumen.saldoFinal < 0],
    ['Cobros de las 13 semanas', (e) => mm(e.resumen.totalCobros), () => false],
    ['Margen de los próximos 12 meses', (e) => mm(e.margen12m), (e) => e.margen12m < 0],
  ]

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-600">
          Versión
          <select className="campo mt-1" value={versionId ?? ''} onChange={(e) => setVersionId(Number(e.target.value))}>
            {versiones.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </select>
        </label>
        <button className="btn-primario" onClick={() => calcular()} disabled={calculando}>{calculando ? 'Calculando…' : 'Calcular escenarios'}</button>
      </div>
      <p className="mb-3 text-sm text-slate-500">
        Cada columna cambia solo lo que escribas: el dólar, los días que se atrasan <b>todos</b> los cobros, el aumento de <b>todos</b> los costos de operación, o un cliente que se pierde
        (sus embarques ya confirmados se siguen cobrando). Lo que dejes vacío queda como en el presupuesto.
      </p>
      {error && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        {lista.map((e, i) => (
          <div key={i} className="rounded border border-slate-200 bg-white p-3" style={{ borderTop: `3px solid ${COLORES[i]}` }}>
            <input className="campo mb-2 font-semibold" value={e.nombre} onChange={(ev) => cambiar(i, 'nombre', ev.target.value)} />
            <label className="mb-2 block text-xs text-slate-600">
              Dólar ($)
              <input className="campo mt-1" placeholder={formatoNumero(tcBase, 0)} value={e.tc} onChange={(ev) => cambiar(i, 'tc', ev.target.value)} />
            </label>
            <label className="mb-2 block text-xs text-slate-600">
              Atraso de los cobros (días)
              <input className="campo mt-1" placeholder="0" value={e.atraso} onChange={(ev) => cambiar(i, 'atraso', ev.target.value)} />
            </label>
            <label className="mb-2 block text-xs text-slate-600">
              Aumento de costos (%)
              <input className="campo mt-1" placeholder="0" value={e.costos} onChange={(ev) => cambiar(i, 'costos', ev.target.value)} />
            </label>
            <label className="block text-xs text-slate-600">
              Se pierde el cliente…
              <select className="campo mt-1" value={e.sin} onChange={(ev) => cambiar(i, 'sin', ev.target.value)}>
                <option value="">(ninguno)</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </label>
          </div>
        ))}
      </div>

      {res && grafico && (
        <>
          <div className="mb-4 overflow-x-auto rounded border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="px-3 py-2"></th>
                  {res.escenarios.map((e, i) => <th key={i} className="px-3 py-2 text-right" style={{ color: COLORES[i] }}>{e.nombre}</th>)}
                </tr>
              </thead>
              <tbody>
                {filas.map(([t, f, malo]) => (
                  <tr key={t} className="border-b border-slate-100">
                    <td className="px-3 py-1.5">{t}</td>
                    {res.escenarios.map((e, i) => <td key={i} className={`px-3 py-1.5 text-right ${malo(e) ? 'font-semibold text-red-700' : ''}`}>{f(e)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="h-72 rounded border border-slate-200 bg-white p-2">
            <ResponsiveContainer>
              <LineChart data={grafico} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="semana" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => formatoNumero(Math.round(v / 1_000_000)) + ' MM'} width={64} />
                <Tooltip formatter={(v) => '$' + formatoNumero(Number(v))} />
                <Legend />
                <ReferenceLine y={0} stroke="#b91c1c" />
                {res.escenarios.map((e, i) => <Line key={e.nombre + i} type="monotone" dataKey={e.nombre} stroke={COLORES[i]} strokeWidth={2} dot={false} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}

export default function FlujoPagina() {
  const [vista, setVista] = useState<Vista>('semanal')
  const pestana = (id: Vista, texto: string) => (
    <button
      key={id}
      onClick={() => setVista(id)}
      className={`rounded-t px-4 py-2 text-sm ${vista === id ? 'border-x border-t border-slate-200 bg-white font-semibold text-sky-800' : 'text-slate-600 hover:bg-slate-100'}`}
    >
      {texto}
    </button>
  )
  return (
    <div>
      <h2 className="mb-2 text-base font-semibold">Flujo de caja</h2>
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {pestana('semanal', 'Semanal (13 semanas)')}
        {pestana('mensual', 'Mensual')}
        {pestana('escenarios', 'Escenarios')}
      </div>
      {vista === 'semanal' && <Semanal />}
      {vista === 'mensual' && <Flujo />}
      {vista === 'escenarios' && <Escenarios />}
    </div>
  )
}
