// Plan de materia prima por origen: stock, camiones, consumo, excedente y cuándo se vende sin comprar.
import { formatoNumero, type PlanMPOrigen } from '@atacama/core'
import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { nombreMes } from './fechas'

interface ClienteMezcla {
  clienteId: number
  nombre: string
  origenId: number
  soloOrigen: boolean
  tonPorCont: number
  contenedores: number[]
  desviados: Record<number, number[]>
}

interface Respuesta {
  origenes: { id: number; nombre: string }[]
  clientesMezcla: ClienteMezcla[]
  version: { id: number; nombre: string }
  tonPorCamion: number
  mermaPct: number
  stockMinimoT: number
  planes: (PlanMPOrigen & { consumoPorCliente: { clienteId: number; nombre: string; valores: number[] }[]; previo: { mes: string; camiones: number; compradasT: number; stockInicioT: number; stockFinalT: number; valorStockFinalCLP: number } })[]
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

  async function cambiarPrevio(origenId: number, valor: string) {
    const n = Number(valor)
    if (!Number.isInteger(n) || n < 0) return cargar()
    try {
      await api(`/materia-prima/${versionId}/previo`, 'PUT', { origenId, camiones: n })
    } catch (e) {
      setError((e as Error).message)
    }
    cargar()
  }

  async function cambiarMezcla(clienteId: number, origenId: number, mes: string, valor: string, tonPorCont: number) {
    const ton = Number(valor.replace(',', '.'))
    if (!Number.isFinite(ton) || ton < 0) return cargar()
    try {
      await api(`/presupuesto/${versionId}/mezcla`, 'PUT', { clienteId, origenId, mes, contenedores: Math.round((ton / tonPorCont) * 10000) / 10000 })
      cargar()
    } catch (e) {
      setError((e as Error).message)
      cargar()
    }
  }

  const mesesMezcla = datos?.planes[0]?.meses ?? []
  const nombreOrigen = (id: number) => datos?.origenes.find((o) => o.id === id)?.nombre ?? ''
  const mezclables = (datos?.clientesMezcla ?? []).filter((c) => !c.soloOrigen)
  const bloqueados = (datos?.clientesMezcla ?? []).filter((c) => c.soloOrigen)

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

      {mezclables.length > 0 && (
        <div className="mb-5 rounded border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-3 py-2">
            <h3 className="font-semibold">Mezcla de origen por contenedor</h3>
            <p className="text-sm text-slate-500">
              Tú decides qué contenedores se producen con la sal de otro origen para aprovechar los saldos. Anota cuántas toneladas de materia prima del mes salen del otro origen (puede ser parte de un contenedor); el resto sale del origen habitual.
              {bloqueados.length > 0 && <> {bloqueados.map((c) => c.nombre).join(', ')} no se puede mezclar (solo {nombreOrigen(bloqueados[0].origenId)}, límite de arsénico).</>}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="sticky left-0 z-10 bg-white px-3 py-2">Toneladas de MP desde otro origen</th>
                  {mesesMezcla.map((m) => <th key={m} className="px-3 py-2 text-right font-medium">{nombreMes(m)}</th>)}
                </tr>
              </thead>
              <tbody>
                {mezclables.flatMap((c) =>
                  datos!.origenes.filter((o) => o.id !== c.origenId).map((o) => (
                    <tr key={c.clienteId + '-' + o.id} className="border-b border-slate-100">
                      <td className="sticky left-0 z-10 bg-white px-3 py-1.5 whitespace-nowrap">{c.nombre} con {o.nombre} <span className="text-xs text-slate-400">(habitual: {nombreOrigen(c.origenId)})</span></td>
                      {mesesMezcla.map((m, i) => {
                        const k = c.desviados[o.id]?.[i] ?? 0
                        const ton = Math.round(k * c.tonPorCont * 10) / 10
                        return (
                          <td key={m} className="px-1 py-1 text-right">
                            {c.contenedores[i] > 0 ? (
                              <input
                                className="w-12 rounded border border-sky-200 bg-sky-50 px-1 py-0.5 text-right text-sky-900"
                                defaultValue={ton}
                                key={m + ton}
                                title={`${c.contenedores[i]} contenedores en el mes; cada uno necesita ${formatoNumero(c.tonPorCont, 1)} t de materia prima. Anota las toneladas que salen de ${o.nombre} (equivale a ${formatoNumero(k, 2)} contenedor).`}
                                onBlur={(e) => e.target.value !== String(ton) && cambiarMezcla(c.clienteId, o.id, m, e.target.value, c.tonPorCont)}
                                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                              />
                            ) : <span className="text-slate-300">–</span>}
                          </td>
                        )
                      })}
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
                    <th className="px-3 py-2 text-right font-medium text-slate-500" title="Ya ocurrió: camiones comprados y pagados">{nombreMes(p.previo.mes)} (real, editable)</th>
                    {p.meses.map((m) => <th key={m} className="px-3 py-2 text-right font-medium">{nombreMes(m)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-100">
                    <td className="sticky left-0 z-10 bg-white px-3 py-1.5 whitespace-nowrap">Stock al comenzar el mes</td>
                    <td className="bg-slate-50 px-3 py-1.5 text-right text-slate-600">{t(p.previo.stockInicioT)}</td>
                    {p.stockInicioMesT.map((x, i) => <td key={i} className="px-3 py-1.5 text-right">{t(x)}</td>)}
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="sticky left-0 z-10 bg-white px-3 py-1.5 whitespace-nowrap">Camiones comprados <span className="text-xs text-slate-400">(editable)</span></td>
                    <td className="bg-slate-50 px-1 py-1 text-right">
                      <input
                        className="w-14 rounded border border-sky-200 bg-sky-50 px-1 py-0.5 text-right text-sky-900"
                        defaultValue={p.previo.camiones}
                        key={'previo' + p.previo.camiones}
                        title="Camiones ya comprados en septiembre (28 t cada uno). Al subir el número se agregan camiones; al bajarlo se quitan."
                        onBlur={(e) => e.target.value !== String(p.previo.camiones) && cambiarPrevio(p.origenId, e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                      />
                    </td>
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
                    <td className="bg-slate-50 px-3 py-1.5 text-right text-slate-600">{t(p.previo.compradasT)}</td>
                    {p.compradasT.map((x, i) => <td key={i} className="px-3 py-1.5 text-right">{t(x)}</td>)}
                  </tr>
                  {p.consumoPorCliente.map((cl) => (
                    <tr key={cl.clienteId} className="border-b border-slate-50 text-xs text-slate-500">
                      <td className="sticky left-0 z-10 bg-white px-3 py-0.5 pl-6 whitespace-nowrap">Consumo de {cl.nombre}</td>
                      <td className="bg-slate-50"></td>
                      {cl.valores.map((x, i) => <td key={i} className="px-3 py-0.5 text-right">{x ? t(x) : ''}</td>)}
                    </tr>
                  ))}
                  <tr className="border-b border-slate-100">
                    <td className="sticky left-0 z-10 bg-white px-3 py-1.5 whitespace-nowrap">Consumo total (kg vendidos ÷ (1 − merma))</td>
                    <td className="bg-slate-50 px-3 py-1.5 text-right text-xs text-slate-400" title="El consumo de septiembre no se lleva en el plan">n/d</td>
                    {p.consumoT.map((x, i) => <td key={i} className="px-3 py-1.5 text-right">{x ? t(x) : ''}</td>)}
                  </tr>
                  <tr className="border-b border-slate-100 bg-sky-50 font-semibold">
                    <td className="sticky left-0 z-10 bg-sky-50 px-3 py-1.5 whitespace-nowrap">Stock al cierre (excedente)</td>
                    <td className="bg-slate-100 px-3 py-1.5 text-right">{t(p.previo.stockFinalT)}</td>
                    {p.stockFinalT.map((x, i) => (
                      <td key={i} className={`px-3 py-1.5 text-right ${x < -0.0005 ? 'text-red-700' : x > datos.tonPorCamion ? 'text-amber-700' : ''}`}>{t(x)}</td>
                    ))}
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="sticky left-0 z-10 bg-white px-3 py-1.5 whitespace-nowrap">Valor del excedente</td>
                    <td className="bg-slate-50 px-3 py-1.5 text-right text-slate-500">{p.previo.valorStockFinalCLP ? mm(p.previo.valorStockFinalCLP) : ''}</td>
                    {p.valorStockFinalCLP.map((x, i) => <td key={i} className="px-3 py-1.5 text-right text-slate-500">{x ? mm(x) : ''}</td>)}
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="sticky left-0 z-10 bg-white px-3 py-1.5 whitespace-nowrap">¿Se vende sin comprar?</td>
                    <td className="bg-slate-50"></td>
                    {p.ventaSinComprar.map((x, i) => (
                      <td key={i} className={`px-3 py-1.5 text-right ${x ? 'font-semibold text-emerald-700' : 'text-slate-300'}`}>{p.consumoT[i] > 0 ? (x ? 'Sí' : 'No') : ''}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="sticky left-0 z-10 bg-white px-3 py-1.5 whitespace-nowrap">Camiones sugeridos (mínimo)</td>
                    <td className="bg-slate-50"></td>
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
