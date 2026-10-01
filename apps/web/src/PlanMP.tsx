// Plan de materia prima por origen: stock, camiones, consumo, excedente y cuándo se vende sin comprar.
import { formatoNumero, type PlanMPOrigen } from '@atacama/core'
import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { nombreMes } from './fechas'

interface Respuesta {
  version: { id: number; nombre: string }
  tonPorCamion: number
  mermaPct: number
  stockMinimoT: number
  planes: PlanMPOrigen[]
}

const t = (x: number) => (Math.abs(x) < 0.0005 ? '0' : formatoNumero(x, 1))
const mm = (x: number) => '$' + formatoNumero(Math.round(x))

export default function PlanMP() {
  const [versiones, setVersiones] = useState<{ id: number; nombre: string }[]>([])
  const [versionId, setVersionId] = useState<number | null>(null)
  const [nMeses, setNMeses] = useState(12)
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
      setDatos(await api(`/materia-prima/${versionId}?meses=${nMeses}`))
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }, [versionId, nMeses])
  useEffect(() => {
    cargar()
  }, [cargar])

  async function cambiarCamiones(origenId: number, mes: string, valor: string) {
    const n = Number(valor)
    if (!Number.isInteger(n) || n < 0) return cargar()
    try {
      await api(`/presupuesto/${versionId}/camiones`, 'PUT', { mes, camiones: n, origenId })
      cargar()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <section className="mb-8">
      <div className="mb-2 flex flex-wrap items-end gap-3">
        <h2 className="mr-auto text-base font-semibold">Plan de materia prima por origen</h2>
        <label className="text-xs text-slate-600">
          Versión
          <select className="campo mt-1" value={versionId ?? ''} onChange={(e) => setVersionId(Number(e.target.value))}>
            {versiones.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-600">
          Meses
          <select className="campo mt-1" value={nMeses} onChange={(e) => setNMeses(Number(e.target.value))}>
            {[6, 12, 24, 36].map((n) => <option key={n}>{n}</option>)}
          </select>
        </label>
      </div>
      <p className="mb-3 text-sm text-slate-500">
        Cada camión trae {datos?.tonPorCamion ?? 28} t. Para producir hace falta materia prima = kg vendidos ÷ (1 − {datos?.mermaPct ?? 5}% de merma), así que un camión casi nunca calza justo
        y deja <b>excedente</b> que sirve para el mes siguiente. Donde el stock con que parte el mes alcanza, <b>se vende sin comprar</b>. Cada origen se lleva por separado: el de SQM solo sirve para NADARRA
        (Europa), y no se puede usar el de Albemarle.
      </p>
      {error && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {datos?.planes.map((p) => {
        const sinComprar = p.ventaSinComprar.filter(Boolean).length
        return (
          <div key={p.origenId} className="mb-5 rounded border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-slate-200 px-3 py-2">
              <h3 className="font-semibold">{p.nombre}</h3>
              <span className="text-sm text-slate-600">Stock hoy: <b>{t(p.stockInicialT)} t</b> ({mm(p.stockInicialT * p.costoPorTonCLP)})</span>
              <span className="text-sm text-slate-600">Costo: <b>{mm(p.costoPorTonCLP)}</b> por tonelada</span>
              <span className="text-sm text-slate-600">
                Se vende sin comprar en <b>{sinComprar}</b> de los {p.consumoT.filter((x) => x > 0).length} meses con venta
              </span>
              <span className="text-sm text-slate-600">
                Excedente al cierre de {nombreMes(p.meses[0])}: <b>{t(p.stockFinalT[0])} t</b> ({mm(p.valorStockFinalCLP[0])})
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-max text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className="sticky left-0 z-10 bg-white px-3 py-2">Toneladas</th>
                    {p.meses.map((m) => <th key={m} className="px-3 py-2 text-right font-medium">{nombreMes(m)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-100">
                    <td className="sticky left-0 z-10 bg-white px-3 py-1.5 whitespace-nowrap">Stock al comenzar el mes</td>
                    {p.stockInicioMesT.map((x, i) => <td key={i} className="px-3 py-1.5 text-right">{t(x)}</td>)}
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="sticky left-0 z-10 bg-white px-3 py-1.5 whitespace-nowrap">Camiones comprados <span className="text-xs text-slate-400">(editable)</span></td>
                    {p.camiones.map((k, i) => (
                      <td key={i} className="px-1 py-1 text-right">
                        <input
                          className="w-14 rounded border border-sky-200 bg-sky-50 px-1 py-0.5 text-right text-sky-900"
                          defaultValue={k}
                          key={p.meses[i] + k}
                          onBlur={(e) => e.target.value !== String(k) && cambiarCamiones(p.origenId, p.meses[i], e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="sticky left-0 z-10 bg-white px-3 py-1.5 whitespace-nowrap">Toneladas compradas</td>
                    {p.compradasT.map((x, i) => <td key={i} className="px-3 py-1.5 text-right">{t(x)}</td>)}
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="sticky left-0 z-10 bg-white px-3 py-1.5 whitespace-nowrap">Consumo (kg vendidos ÷ (1 − merma))</td>
                    {p.consumoT.map((x, i) => <td key={i} className="px-3 py-1.5 text-right">{x ? t(x) : ''}</td>)}
                  </tr>
                  <tr className="border-b border-slate-100 bg-sky-50 font-semibold">
                    <td className="sticky left-0 z-10 bg-sky-50 px-3 py-1.5 whitespace-nowrap">Stock al cierre (excedente)</td>
                    {p.stockFinalT.map((x, i) => (
                      <td key={i} className={`px-3 py-1.5 text-right ${x < -0.0005 ? 'text-red-700' : x > datos.tonPorCamion ? 'text-amber-700' : ''}`}>{t(x)}</td>
                    ))}
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="sticky left-0 z-10 bg-white px-3 py-1.5 whitespace-nowrap">Valor del excedente</td>
                    {p.valorStockFinalCLP.map((x, i) => <td key={i} className="px-3 py-1.5 text-right text-slate-500">{x ? mm(x) : ''}</td>)}
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="sticky left-0 z-10 bg-white px-3 py-1.5 whitespace-nowrap">¿Se vende sin comprar?</td>
                    {p.ventaSinComprar.map((x, i) => (
                      <td key={i} className={`px-3 py-1.5 text-right ${x ? 'font-semibold text-emerald-700' : 'text-slate-300'}`}>{p.consumoT[i] > 0 ? (x ? 'Sí' : 'No') : ''}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="sticky left-0 z-10 bg-white px-3 py-1.5 whitespace-nowrap">Camiones sugeridos (mínimo)</td>
                    {p.camionesSugeridos.map((k, i) => (
                      <td key={i} className={`px-3 py-1.5 text-right ${k !== p.camiones[i] ? 'font-semibold text-amber-700' : 'text-slate-500'}`}>{k || ''}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
      <p className="text-xs text-slate-500">
        En amarillo: excedente mayor a un camión, o un mes en que el plan compra distinto de lo mínimo sugerido (partiendo del stock de hoy). Los camiones sugeridos mantienen el stock sobre el mínimo de
        seguridad (parámetro stockMinimoMPTon, hoy {datos?.stockMinimoT ?? 0} t). Si hay un camión recibido, regístralo abajo con su merma real.
      </p>
    </section>
  )
}
