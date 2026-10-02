// Facturas recibidas: qué se debe a cada proveedor, cuáles están verificadas con la cartola y cuáles se suponen pagadas.
import { formatoFecha, formatoNumero } from '@atacama/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, sesion } from './api'
import { aBase64, leerFacturaPdf, rutDigitos } from './facturaPdf'

type Estado = 'PAGADA' | 'SUPUESTA' | 'PARCIAL' | 'PENDIENTE'
interface Doc { id: number; proveedorId: number; proveedor: string; tipo: string; folio: string; emision: string; vencimiento: string | null; total: number; pagado: number; saldo: number; proveedorRut?: string | null; tienePdf?: boolean; estado: Estado; motivo?: string | null; aviso?: string | null; enPresupuesto: boolean; grupo: string | null }
interface Detalle {
  proveedor: string; rut: string | null; tipo: string; folio: string; emision: string; vencimiento: string | null
  neto: number; exento: number; iva: number; total: number; nota: string | null; estado: Estado; saldo: number; motivo: string | null; aviso: string | null; grupo: string | null; pdf: string | null
  pagos: { fecha: string; monto: number; nota: string | null; movimientos: { fecha: string; cargo: number; cuenta: string; contraparte: string | null; glosa: string; detalle: string | null }[] }[]
}
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
  const [abierta, setAbierta] = useState<{ doc: Doc; det: Detalle | null } | null>(null)
  const entradaPdf = useRef<HTMLInputElement>(null)

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
      const r = await api<{ verificadas: number; nuevas: number; porDetalle: number; aproximadas: number; avisos: string[]; dudosas: string[] }>('/documentos/conciliar', 'POST', {})
      setMensaje(`${r.porDetalle} facturas cuadradas por el detalle de la transferencia (N° de factura), ${r.verificadas} supuestas verificadas y ${r.nuevas} pendientes marcadas como pagadas por monto. ${r.aproximadas} marcadas como pagadas con aviso (el monto no calza exacto).${r.avisos.length || r.dudosas.length ? ' Revisa: ' + [...r.avisos, ...r.dudosas].join('; ') : ''}`)
      await cargar()
      alCambiar?.()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  async function abrir(doc: Doc) {
    setAbierta({ doc, det: null })
    try {
      setAbierta({ doc, det: await api<Detalle>(`/documentos/${doc.id}/detalle`) })
    } catch (e) {
      setError((e as Error).message)
      setAbierta(null)
    }
  }

  async function verPdf(id: number) {
    const res = await fetch(`/api/documentos/${id}/pdf`, { headers: { Authorization: 'Bearer ' + (sesion.token ?? '') } })
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? 'No se pudo abrir el PDF')
    window.open(URL.createObjectURL(await res.blob()), '_blank')
  }

  async function adjuntar(archivos: FileList | null) {
    if (!archivos?.length) return
    setOcupado(true)
    setError('')
    const sin: string[] = []
    let ok = 0
    try {
      for (const a of Array.from(archivos)) {
        const { folio, ruts } = await leerFacturaPdf(a)
        const sinCeros = (x: string) => x.replace(/^0+/, '')
        const cand = folio ? docs.filter((d) => sinCeros(d.folio) === sinCeros(folio)) : []
        const doc = cand.find((d) => d.proveedorRut && ruts.some((r) => r.slice(0, 7) === rutDigitos(d.proveedorRut!).slice(0, 7))) ?? (cand.length === 1 ? cand[0] : undefined)
        if (!doc) {
          sin.push(`${a.name} (${folio ? 'N° ' + folio : 'sin N° legible'})`)
          continue
        }
        await api(`/documentos/${doc.id}/pdf`, 'POST', { nombre: a.name, base64: await aBase64(a) })
        ok++
      }
      setMensaje(`${ok} PDF adjuntados a su factura.${sin.length ? ' No encontré la factura de: ' + sin.join(', ') : ''}`)
      await cargar()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupado(false)
      if (entradaPdf.current) entradaPdf.current.value = ''
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
  const adicional = pendientes.filter((d) => !d.enPresupuesto).reduce((s, d) => s + d.saldo, 0)
  const vencidas = pendientes.filter((d) => d.vencimiento && d.vencimiento < hoy)
  const mostradas = filtro === 'TODAS' ? docs : docs.filter((d) => d.estado === filtro)

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <h2 className="mr-auto text-base font-semibold">Facturas recibidas</h2>
        <input ref={entradaPdf} type="file" multiple accept=".pdf" className="hidden" onChange={(e) => adjuntar(e.target.files)} />
        <button className="btn" disabled={ocupado} onClick={() => entradaPdf.current?.click()} title="Elige los PDF de las facturas: cada uno se asocia solo a su factura por el N° y el RUT del emisor">Adjuntar PDFs de facturas</button>
        <button className="btn" disabled={ocupado} onClick={conciliar}>Conciliar con cartolas</button>
      </div>
      <p className="mb-3 text-sm text-slate-500">
        Las facturas de agosto o antes se suponen pagadas; las de septiembre quedan pendientes hasta que una cartola muestre el pago (mismo monto y mismo proveedor). Lo pendiente de proveedores que el presupuesto ya proyecta (telefonía, sacos, aduana, etc.) no se suma otra vez al flujo; solo se agrega lo que el presupuesto no cubre.
      </p>
      {error && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {mensaje && <p className="mb-3 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{mensaje}</p>}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tarjeta titulo="Por pagar a proveedores" valor={clp(totalPendiente)} nota={`${pendientes.length} facturas; ${clp(totalPendiente - adicional)} ya están en las líneas del presupuesto`} />
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
              <tr key={d.id} className="cursor-pointer border-b border-slate-100 hover:bg-sky-50" onClick={() => abrir(d)}>
                <td className="px-3 py-1.5">{d.tienePdf && <span title="Tiene PDF adjunto">📄 </span>}{d.proveedor}{d.tipo === 'NOTA_CREDITO' && <span className="ml-1 text-xs text-slate-400">(nota de crédito)</span>}</td>
                <td className="px-3 py-1.5">{d.folio}</td>
                <td className="px-3 py-1.5">{formatoFecha(d.emision)}</td>
                <td className="px-3 py-1.5">{d.vencimiento ? formatoFecha(d.vencimiento) : ''}</td>
                <td className="px-3 py-1.5 text-right">{clp(d.total)}</td>
                <td className="px-3 py-1.5 text-right">{d.saldo ? clp(d.saldo) : ''}</td>
                <td className="px-3 py-1.5"><span className={`rounded px-1.5 py-0.5 text-xs ${ETIQUETA[d.estado].clase}`}>{ETIQUETA[d.estado].texto}</span>{d.motivo && <div className="max-w-md truncate text-xs text-amber-700" title={d.motivo}>⚠ {d.motivo}</div>}{d.aviso && <span className="ml-1 cursor-help text-xs text-amber-600" title={d.aviso}>⚠ revisar monto</span>}{d.enPresupuesto && (d.estado === 'PENDIENTE' || d.estado === 'PARCIAL') && <span className="ml-1 text-xs text-slate-400">incluida en «{d.grupo}»</span>}</td>
                <td className="px-3 py-1.5 text-right">
                  {(d.estado === 'PENDIENTE' || d.estado === 'PARCIAL') && <button className="text-xs text-sky-700 hover:underline" onClick={(e) => { e.stopPropagation(); marcar(d, true) }}>Marcar pagada</button>}
                  {d.estado === 'SUPUESTA' && <button className="text-xs text-sky-700 hover:underline" onClick={(e) => { e.stopPropagation(); marcar(d, false) }}>Dejar pendiente</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {abierta && <PanelFactura doc={abierta.doc} det={abierta.det} cerrar={() => setAbierta(null)} verPdf={() => verPdf(abierta.doc.id)} />}
    </div>
  )
}

function PanelFactura({ doc, det, cerrar, verPdf }: { doc: Doc; det: Detalle | null; cerrar: () => void; verPdf: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/30 p-4" onClick={cerrar}>
      <div className="mt-8 w-full max-w-2xl rounded-lg bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start gap-3">
          <div className="mr-auto">
            <p className="text-base font-semibold">{doc.proveedor} · {doc.tipo === 'NOTA_CREDITO' ? 'Nota de crédito' : 'Factura'} N° {doc.folio}</p>
            <p className="text-xs text-slate-500">{det?.rut ? 'RUT ' + det.rut + ' · ' : ''}emitida el {formatoFecha(doc.emision)}{doc.vencimiento ? ', vence el ' + formatoFecha(doc.vencimiento) : ''}</p>
          </div>
          {doc.tienePdf && <button className="btn" onClick={verPdf}>Abrir PDF</button>}
          <button className="btn" onClick={cerrar}>Cerrar</button>
        </div>
        {!det ? <p className="text-sm text-slate-500">Cargando…</p> : (
          <>
            <table className="mb-3 w-full max-w-xs text-sm">
              <tbody>
                {det.neto > 0 && <tr><td className="text-slate-500">Neto</td><td className="text-right">{clp(det.neto)}</td></tr>}
                {det.exento > 0 && <tr><td className="text-slate-500">Exento</td><td className="text-right">{clp(det.exento)}</td></tr>}
                {det.iva > 0 && <tr><td className="text-slate-500">IVA</td><td className="text-right">{clp(det.iva)}</td></tr>}
                <tr className="border-t border-slate-200 font-semibold"><td>Total</td><td className="text-right">{clp(det.total)}</td></tr>
              </tbody>
            </table>
            <p className="mb-2 text-sm"><span className={`rounded px-1.5 py-0.5 text-xs ${ETIQUETA[det.estado].clase}`}>{ETIQUETA[det.estado].texto}</span>{det.saldo ? <span className="ml-2">Saldo por pagar: <b>{clp(det.saldo)}</b></span> : null}{det.grupo && det.saldo ? <span className="ml-2 text-xs text-slate-400">incluida en «{det.grupo}» del flujo</span> : null}</p>
            {det.motivo && <p className="mb-2 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">⚠ {det.motivo}</p>}
            {det.aviso && <p className="mb-2 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">⚠ {det.aviso}</p>}
            {det.nota && <p className="mb-2 text-sm text-slate-600">Nota: {det.nota}</p>}
            <p className="mb-1 text-sm font-semibold">Pagos</p>
            {det.pagos.length === 0 ? <p className="text-sm text-slate-500">Sin pagos registrados.</p> : det.pagos.map((p, i) => (
              <div key={i} className="mb-2 rounded border border-slate-200 p-2 text-sm">
                <p>{formatoFecha(p.fecha)} · <b>{clp(p.monto)}</b>{p.nota ? <span className="text-slate-500"> — {p.nota}</span> : null}</p>
                {p.movimientos.map((x, j) => (
                  <p key={j} className="mt-1 text-xs text-slate-600">Cartola {x.cuenta}, {formatoFecha(x.fecha)}: {clp(x.cargo)} a {x.contraparte ?? x.glosa}{x.detalle ? ` — «${x.detalle}»` : ''}</p>
                ))}
              </div>
            ))}
            {!doc.tienePdf && <p className="mt-2 text-xs text-slate-400">Esta factura no tiene PDF adjunto. Usa «Adjuntar PDFs de facturas» arriba para subirlo.</p>}
          </>
        )}
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
