// Facturas recibidas: qué se debe a cada proveedor, cuáles están verificadas con la cartola y cuáles se suponen pagadas.
import { formatoFecha, formatoNumero } from '@atacama/core'
import { useCallback, useEffect, useState } from 'react'
import { api } from './api'

type Estado = 'PAGADA' | 'SUPUESTA' | 'PARCIAL' | 'PENDIENTE'
interface Doc { id: number; proveedorId: number; proveedor: string; tipo: string; folio: string; emision: string; vencimiento: string | null; total: number; pagado: number; saldo: number; estado: Estado }
interface Saldo { proveedorId: number; proveedor: string; n: number; saldo: number; masAntiguo: string }

const clp = (x: number) => '$' + formatoNumero(Math.round(x))
const ETIQUETA: Record<Estado, { texto: string; clase: string }> = {
  PAGADA: { texto: 'Pagada (cartola)', clase: 'bg-emerald-100 text-emerald-800' },
  SUPUESTA: { texto: 'Pagada (supuesta)', clase: 'bg-slate-100 text-slate-600' },
  PARCIAL: { texto: 'Pago parcial', clase: 'bg-amber-100 text-amber-800' },
  PENDIENTE: { texto: 'Pendiente', clase: 'bg-red-100 text-red-700' },
}

export default function Facturas({ alCambiar }: { alCambiar?: () => void }) {
  const [docs, setDocs] = useState<Doc[]>([])
  const [saldos, setSaldos] = useState<Saldo[]>([])
  const [filtro, setFiltro] = useState<Estado | 'TODAS'>('TODAS')
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const r = await api<{ documentos: Doc[]; saldosPorProveedor: Saldo[] }>('/documentos/resumen')
      setDocs(r.documentos)
      setSaldos(r.saldosPorProveedor)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])
  useEffect(() => {
    cargar()
  }, [cargar])

  async function conciliar() {
    setOcupado(true)
    setError('')
    try {
      const r = await api<{ verificadas: number; nuevas: number; dudosas: string[] }>('/documentos/conciliar', 'POST', {})
      setMensaje(`Se verificaron ${r.verificadas} facturas supuestas y se marcaron ${r.nuevas} pendientes como pagadas con su pago en la cartola.${r.dudosas.length ? ' Revisa: ' + r.dudosas.join('; ') : ''}`)
      await cargar()
      alCambiar?.()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  async function marcar(d: Doc, pagada: boolean) {
    try {
      await api(`/documentos/${d.id}/estado`, 'POST', { pagada })
      await cargar()
      alCambiar?.()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const pendientes = docs.filter((d) => d.estado === 'PENDIENTE' || d.estado === 'PARCIAL')
  const totalPendiente = pendientes.reduce((s, d) => s + d.saldo, 0)
  const hoy = new Date().toISOString().slice(0, 10)
  const vencidas = pendientes.filter((d) => d.vencimiento && d.vencimiento < hoy)
  const mostradas = filtro === 'TODAS' ? docs : docs.filter((d) => d.estado === filtro)

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <h2 className="mr-auto text-base font-semibold">Facturas recibidas</h2>
        <button className="btn" disabled={ocupado} onClick={conciliar}>Conciliar con cartolas</button>
      </div>
      <p className="mb-3 text-sm text-slate-500">
        Las facturas de agosto o antes se suponen pagadas; las de septiembre quedan pendientes hasta que una cartola muestre el pago (mismo monto y mismo proveedor). Lo pendiente sale en el flujo de caja el día de su vencimiento.
      </p>
      {error && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {mensaje && <p className="mb-3 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{mensaje}</p>}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tarjeta titulo="Por pagar a proveedores" valor={clp(totalPendiente)} nota={`${pendientes.length} facturas pendientes`} />
        <Tarjeta titulo="Ya vencidas" valor={clp(vencidas.reduce((s, d) => s + d.saldo, 0))} nota={`${vencidas.length} facturas`} />
        <Tarjeta titulo="Pagadas verificadas" valor={formatoNumero(docs.filter((d) => d.estado === 'PAGADA').length)} nota="con su pago en la cartola" />
        <Tarjeta titulo="Pagadas supuestas" valor={formatoNumero(docs.filter((d) => d.estado === 'SUPUESTA').length)} nota="sin pago visible en la cartola" />
      </div>

      {saldos.length > 0 && (
        <div className="mb-4 rounded border border-slate-200 bg-white">
          <p className="border-b border-slate-200 px-3 py-2 font-semibold">Saldo por proveedor</p>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th className="px-3 py-1">Proveedor</th><th className="px-3 py-1 text-right">Facturas</th><th className="px-3 py-1 text-right">Saldo</th><th className="px-3 py-1">Más antigua</th></tr></thead>
            <tbody>
              {saldos.map((s) => (
                <tr key={s.proveedorId} className="border-t border-slate-100">
                  <td className="px-3 py-1.5">{s.proveedor}</td>
                  <td className="px-3 py-1.5 text-right">{s.n}</td>
                  <td className="px-3 py-1.5 text-right">{clp(s.saldo)}</td>
                  <td className="px-3 py-1.5">{formatoFecha(s.masAntiguo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mb-2 flex gap-2 text-sm">
        {(['TODAS', 'PENDIENTE', 'SUPUESTA', 'PAGADA'] as const).map((e) => (
          <button key={e} onClick={() => setFiltro(e)} className={`rounded px-3 py-1 ${filtro === e ? 'bg-sky-100 font-medium text-sky-900' : 'hover:bg-slate-100'}`}>
            {e === 'TODAS' ? 'Todas' : ETIQUETA[e].texto}
          </button>
        ))}
      </div>
      <div className="max-h-[32rem] overflow-auto rounded border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-slate-200 text-left">
              <th className="px-3 py-2">Proveedor</th><th className="px-3 py-2">N°</th><th className="px-3 py-2">Emisión</th><th className="px-3 py-2">Vence</th>
              <th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">Saldo</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {mostradas.map((d) => (
              <tr key={d.id} className="border-b border-slate-100">
                <td className="px-3 py-1.5">{d.proveedor}{d.tipo === 'NOTA_CREDITO' && <span className="ml-1 text-xs text-slate-400">(nota de crédito)</span>}</td>
                <td className="px-3 py-1.5">{d.folio}</td>
                <td className="px-3 py-1.5">{formatoFecha(d.emision)}</td>
                <td className="px-3 py-1.5">{d.vencimiento ? formatoFecha(d.vencimiento) : ''}</td>
                <td className="px-3 py-1.5 text-right">{clp(d.total)}</td>
                <td className="px-3 py-1.5 text-right">{d.saldo ? clp(d.saldo) : ''}</td>
                <td className="px-3 py-1.5"><span className={`rounded px-1.5 py-0.5 text-xs ${ETIQUETA[d.estado].clase}`}>{ETIQUETA[d.estado].texto}</span></td>
                <td className="px-3 py-1.5 text-right">
                  {(d.estado === 'PENDIENTE' || d.estado === 'PARCIAL') && <button className="text-xs text-sky-700 hover:underline" onClick={() => marcar(d, true)}>Marcar pagada</button>}
                  {d.estado === 'SUPUESTA' && <button className="text-xs text-sky-700 hover:underline" onClick={() => marcar(d, false)}>Dejar pendiente</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Tarjeta({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-3">
      <p className="text-xs text-slate-500">{titulo}</p>
      <p className="text-xl font-semibold">{valor}</p>
      {nota && <p className="text-xs text-slate-400">{nota}</p>}
    </div>
  )
}
