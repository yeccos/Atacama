// Cartolas del banco: importar PDF/Excel, ver el saldo con que parte el flujo y a quién se le ha pagado.
import { formatoFecha, formatoNumero } from '@atacama/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import { leerCartola, mismaCuenta, soloDigitos, type CartolaLeida } from './cartolaLector'
import { nombreMes } from './fechas'

interface Cuenta { id: number; nombre: string; banco: string; moneda: string; numero: string | null }
interface Resumen {
  cuenta: Cuenta
  saldoActual: number
  fechaSaldo: string | null
  desde: string | null
  hasta: string | null
  nMovimientos: number
  sinClasificar: number
  meses: { mes: string; ingresos: number; egresos: number }[]
  categorias: { categoria: string; n: number; ingresos: number; egresos: number }[]
  pagos: { clave: string; nombre: string; proveedorId: number | null; contraparte: string | null; categoria: string | null; n: number; total: number; primero: string; ultimo: string; ultimoMonto: number }[]
}

const CATEGORIAS = ['Materia prima', 'Proveedores', 'Remuneraciones', 'Retiros de socios', 'Honorarios', 'Transporte y fletes', 'Aduana y exportación', 'Arriendo y servicios', 'Créditos y cuotas', 'Otros']
const fmt = (x: number, moneda = 'CLP') => (moneda === 'USD' ? 'US$' + formatoNumero(x / 100, 2) : '$' + formatoNumero(Math.round(x)))
type Vista = 'pagos' | 'categorias' | 'meses'

export default function Cartolas({ alCambiar }: { alCambiar?: () => void }) {
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [cuentaId, setCuentaId] = useState<number | null>(null)
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [saldos, setSaldos] = useState<Resumen[]>([])
  const [vista, setVista] = useState<Vista>('pagos')
  const [leidas, setLeidas] = useState<CartolaLeida[] | null>(null)
  const [avisos, setAvisos] = useState<string[]>([])
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)
  const entradaDetalle = useRef<HTMLInputElement>(null)
  const moneda = resumen?.cuenta.moneda ?? 'CLP'
  const clp = (x: number) => fmt(x, moneda)
  const [proveedores, setProveedores] = useState<{ id: number; nombre: string }[]>([])
  useEffect(() => {
    api('/r/proveedores').then(setProveedores)
  }, [])

  async function clasificar(p: Resumen['pagos'][number], cambio: { categoria?: string; proveedorId?: number | null }) {
    try {
      await api(`/bancos/${cuentaId}/clasificar`, 'POST', { contraparte: p.contraparte, proveedorActualId: p.proveedorId, ...cambio })
      await cargar()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  useEffect(() => {
    api<Cuenta[]>('/r/cuentasBancarias').then((c) => {
      const con = c.filter((x) => x.numero)
      setCuentas(con)
      if (con.length) setCuentaId((con.find((x) => x.numero === '06-01766-5') ?? con[0]).id)
    })
  }, [])

  const cargar = useCallback(async () => {
    if (!cuentaId) return
    try {
      setResumen(await api(`/bancos/${cuentaId}/resumen`))
      setSaldos(await Promise.all(cuentas.map((c) => api<Resumen>(`/bancos/${c.id}/resumen`))))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [cuentaId, cuentas])
  useEffect(() => {
    cargar()
  }, [cargar])

  async function elegirArchivos(archivos: FileList | null) {
    if (!archivos?.length) return
    setError('')
    setMensaje('')
    setOcupado(true)
    try {
      const todas: CartolaLeida[] = []
      for (const f of Array.from(archivos)) todas.push(await leerCartola(f, cuentas))
      todas.sort((a, b) => soloDigitos(a.cuenta).localeCompare(soloDigitos(b.cuenta)) || a.desde.localeCompare(b.desde) || a.hasta.localeCompare(b.hasta))
      // Cada cartola debe partir con el saldo con que terminó la anterior de su misma cuenta.
      const av: string[] = []
      todas.forEach((c, i) => {
        const ant = todas[i - 1]
        if (ant && mismaCuenta(ant.cuenta, c.cuenta) && c.saldoInicial !== ant.saldoFinal) {
          av.push(`${c.archivo}: parte con ${fmt(c.saldoInicial, c.moneda)} pero la anterior terminó en ${fmt(ant.saldoFinal, c.moneda)}. Puede faltar una cartola.`)
        }
        if (!cuentas.some((x) => mismaCuenta(x.numero, c.cuenta))) av.push(`${c.archivo}: la cuenta ${c.cuenta ?? 'sin número'} no está registrada (créala en Cuentas bancarias con ese número).`)
      })
      setAvisos(av)
      setLeidas(todas)
    } catch (e) {
      setError((e as Error).message)
      setLeidas(null)
    } finally {
      setOcupado(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  async function importarDetalles(archivo: File | undefined) {
    if (!archivo) return
    setOcupado(true)
    setError('')
    try {
      const XLSX = await import('xlsx')
      const libro = XLSX.read(await archivo.arrayBuffer(), { type: 'array', raw: true })
      const filas = XLSX.utils.sheet_to_json<Record<string, any>>(libro.Sheets[libro.SheetNames[0]], { defval: '' })
      const detalles = filas
        .map((f) => ({ fecha: String(f.fecha ?? '').slice(0, 10), monto: Math.round(Number(String(f.monto ?? '').replace(/[^\d-]/g, ''))), beneficiario: String(f.beneficiario ?? ''), detalle: String(f.detalle ?? '').trim() }))
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.fecha) && d.monto > 0 && d.detalle)
      if (!detalles.length) throw new Error('El archivo no tiene filas válidas (columnas: fecha, monto, beneficiario, detalle)')
      const r = await api('/bancos/detalles', 'POST', { detalles })
      setMensaje(`Se asoció el detalle a ${r.asociados} movimientos${r.sinMovimiento.length ? `; ${r.sinMovimiento.length} no tienen movimiento en las cartolas importadas todavía` : ''}. Ahora puedes ir a Facturas recibidas y conciliar.`)
      await cargar()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupado(false)
      if (entradaDetalle.current) entradaDetalle.current.value = ''
    }
  }

  async function reclasificar() {
    setOcupado(true)
    setError('')
    try {
      const r = await api('/bancos/reclasificar', 'POST', {})
      setMensaje(`Se reclasificaron ${r.cambiados} movimientos con las reglas actuales.`)
      await cargar()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  async function importar() {
    if (!leidas) return
    setOcupado(true)
    setError('')
    try {
      let nuevos = 0
      let duplicados = 0
      for (let i = 0; i < leidas.length; i++) {
        const c = leidas[i]
        const cuenta = cuentas.find((x) => mismaCuenta(x.numero, c.cuenta))
        if (!cuenta) throw new Error(`${c.archivo}: la cuenta ${c.cuenta ?? 'sin número'} no está registrada`)
        const ultimaDeLaCuenta = !leidas.slice(i + 1).some((o) => mismaCuenta(o.cuenta, c.cuenta))
        const ultimo = c.movimientos.at(-1)
        const r = await api(`/bancos/${cuenta.id}/importar`, 'POST', {
          movimientos: c.movimientos,
          saldoFinal: ultimaDeLaCuenta ? c.saldoFinal : undefined,
          fechaFinal: ultimaDeLaCuenta ? (ultimo?.fecha ?? c.hasta) : undefined,
        })
        nuevos += r.nuevos
        duplicados += r.duplicados
      }
      setMensaje(`Se importaron ${nuevos} movimientos nuevos${duplicados ? ` (${duplicados} ya estaban)` : ''}. El flujo de caja ya parte con el saldo de la última cartola en pesos.`)
      setLeidas(null)
      await cargar()
      alCambiar?.()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  const total = leidas?.reduce((s, c) => s + c.movimientos.length, 0) ?? 0

  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <h2 className="mr-auto text-base font-semibold">Cartolas del banco</h2>
        {cuentas.length > 1 && (
          <select className="campo" value={cuentaId ?? ''} onChange={(e) => setCuentaId(Number(e.target.value))}>
            {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        )}
        <input ref={entrada} type="file" multiple accept=".pdf,.xls,.xlsx" className="hidden" onChange={(e) => elegirArchivos(e.target.files)} />
        <button className="btn" disabled={ocupado} onClick={() => entrada.current?.click()}>
          {ocupado ? 'Leyendo…' : 'Importar cartolas (PDF o Excel)'}
        </button>
        <input ref={entradaDetalle} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => importarDetalles(e.target.files?.[0])} />
        <button className="btn" disabled={ocupado} onClick={() => entradaDetalle.current?.click()} title="CSV con las columnas fecha, monto, beneficiario, detalle (lo que se escribe en el Bice al transferir)">Importar detalle de pagos</button>
        <button className="btn" disabled={ocupado} onClick={reclasificar} title="Vuelve a clasificar lo que no tiene categoría con las reglas de Cuentas bancarias">Reclasificar</button>
      </div>
      <p className="mb-3 text-sm text-slate-500">
        Sube las cartolas mensuales en PDF y la provisoria en Excel, de cualquiera de las cuentas y todas juntas: cada archivo se asigna solo a su cuenta (CLP o USD) por el número de cuenta que trae. Las que ya estaban no se duplican. El saldo de la última cartola es con el que parte el flujo de caja.
      </p>
      {error && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {mensaje && <p className="mb-3 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{mensaje}</p>}

      {leidas && (
        <div className="mb-4 rounded border border-sky-200 bg-sky-50 p-3 text-sm">
          <p className="mb-2 font-semibold">Listo para importar: {leidas.length} archivos, {total} movimientos</p>
          <table className="block overflow-x-auto mb-2 w-full max-w-3xl">
            <thead><tr className="text-left text-xs text-slate-500"><th>Archivo</th><th>Cuenta</th><th>Período</th><th className="text-right">Movimientos</th><th className="text-right">Saldo inicial</th><th className="text-right">Saldo final</th></tr></thead>
            <tbody>
              {leidas.map((c) => (
                <tr key={c.archivo}>
                  <td className="pr-3">{c.archivo.slice(-34)}</td>
                  <td className="pr-3">{cuentas.find((x) => mismaCuenta(x.numero, c.cuenta))?.nombre ?? <span className="text-amber-700">sin cuenta registrada</span>}</td>
                  <td className="pr-3">{formatoFecha(c.desde)} a {formatoFecha(c.hasta)}</td>
                  <td className="text-right">{c.movimientos.length}</td>
                  <td className="text-right">{fmt(c.saldoInicial, c.moneda)}</td>
                  <td className="text-right">{fmt(c.saldoFinal, c.moneda)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {avisos.length > 0 && (
            <ul className="mb-2 list-disc pl-5 text-amber-800">{avisos.map((a) => <li key={a}>{a}</li>)}</ul>
          )}
          {avisos.length === 0 && leidas.length > 1 && <p className="mb-2 text-emerald-800">Las cartolas empalman: cada una parte con el saldo en que terminó la anterior.</p>}
          <div className="flex gap-2">
            <button className="btn" disabled={ocupado} onClick={importar}>Importar {total} movimientos</button>
            <button className="btn" disabled={ocupado} onClick={() => setLeidas(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {saldos.some((x) => x.nMovimientos > 0) && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {saldos.filter((x) => x.nMovimientos > 0).map((x) => (
            <button key={x.cuenta.id} onClick={() => setCuentaId(x.cuenta.id)} className={`rounded border bg-white p-3 text-left ${x.cuenta.id === cuentaId ? 'border-sky-400' : 'border-slate-200 hover:border-sky-200'}`}>
              <p className="text-xs text-slate-500">{x.cuenta.nombre}</p>
              <p className="text-xl font-semibold">{fmt(x.saldoActual, x.cuenta.moneda)}</p>
              <p className="text-xs text-slate-400">{formatoFecha(x.desde!)} a {formatoFecha(x.hasta!)} · {formatoNumero(x.nMovimientos)} mov.</p>
            </button>
          ))}
        </div>
      )}

      {resumen && resumen.nMovimientos > 0 && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tarjeta titulo="Saldo en el banco" valor={clp(resumen.saldoActual)} nota={resumen.fechaSaldo ? `al ${formatoFecha(resumen.fechaSaldo)} (parte el flujo)` : ''} />
            <Tarjeta titulo="Movimientos" valor={formatoNumero(resumen.nMovimientos)} nota={`${formatoFecha(resumen.desde!)} a ${formatoFecha(resumen.hasta!)}`} />
            <Tarjeta titulo="Sin clasificar" valor={formatoNumero(resumen.sinClasificar)} nota="Asígnales categoría en la tabla de abajo" />
            <Tarjeta titulo="Pagado a proveedores" valor={clp(resumen.pagos.filter((p) => p.proveedorId).reduce((s, p) => s + p.total, 0))} nota="Solo los reconocidos como proveedor" />
          </div>
          <div className="mb-2 flex gap-2 text-sm">
            {([['pagos', 'Pagos por destinatario'], ['categorias', 'Por categoría'], ['meses', 'Mes a mes']] as [Vista, string][]).map(([v, t]) => (
              <button key={v} onClick={() => setVista(v)} className={`rounded px-3 py-1 ${vista === v ? 'bg-sky-100 font-medium text-sky-900' : 'hover:bg-slate-100'}`}>{t}</button>
            ))}
          </div>
          <div className="max-h-96 overflow-auto rounded border border-slate-200 bg-white">
            {vista === 'pagos' && (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white"><tr className="border-b border-slate-200 text-left"><th className="px-3 py-2">Destinatario</th><th className="px-3 py-2 text-right">Pagos</th><th className="px-3 py-2 text-right">Total pagado</th><th className="px-3 py-2">Primero</th><th className="px-3 py-2">Último</th><th className="px-3 py-2 text-right">Último monto</th><th className="px-3 py-2">Categoría</th><th className="px-3 py-2">Proveedor</th></tr></thead>
                <tbody>
                  {resumen.pagos.map((p) => (
                    <tr key={p.clave} className="border-b border-slate-100">
                      <td className="px-3 py-1.5">{p.nombre} {p.proveedorId && <span className="ml-1 rounded bg-emerald-100 px-1.5 text-xs text-emerald-800">proveedor</span>}</td>
                      <td className="px-3 py-1.5 text-right">{p.n}</td>
                      <td className="px-3 py-1.5 text-right">{clp(p.total)}</td>
                      <td className="px-3 py-1.5">{formatoFecha(p.primero)}</td>
                      <td className="px-3 py-1.5">{formatoFecha(p.ultimo)}</td>
                      <td className="px-3 py-1.5 text-right">{clp(p.ultimoMonto)}</td>
                      <td className="px-3 py-1.5">
                        <select className="campo" disabled={!p.contraparte && !p.proveedorId} value={p.categoria ?? ''} onChange={(e) => clasificar(p, { categoria: e.target.value })}>
                          <option value="">Sin clasificar</option>
                          {[...new Set([...CATEGORIAS, ...(p.categoria ? [p.categoria] : [])])].map((c) => <option key={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <select className="campo" disabled={!p.contraparte && !p.proveedorId} value={p.proveedorId ?? ''} onChange={(e) => clasificar(p, { proveedorId: e.target.value ? Number(e.target.value) : null })}>
                          <option value="">—</option>
                          {proveedores.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {vista === 'categorias' && (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white"><tr className="border-b border-slate-200 text-left"><th className="px-3 py-2">Categoría</th><th className="px-3 py-2 text-right">Movimientos</th><th className="px-3 py-2 text-right">Ingresos</th><th className="px-3 py-2 text-right">Egresos</th></tr></thead>
                <tbody>
                  {resumen.categorias.map((c) => (
                    <tr key={c.categoria} className="border-b border-slate-100">
                      <td className={`px-3 py-1.5 ${c.categoria === 'Sin clasificar' ? 'text-amber-700' : ''}`}>{c.categoria}</td>
                      <td className="px-3 py-1.5 text-right">{c.n}</td>
                      <td className="px-3 py-1.5 text-right">{c.ingresos ? clp(c.ingresos) : ''}</td>
                      <td className="px-3 py-1.5 text-right">{c.egresos ? clp(c.egresos) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {vista === 'meses' && (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white"><tr className="border-b border-slate-200 text-left"><th className="px-3 py-2">Mes</th><th className="px-3 py-2 text-right">Ingresos</th><th className="px-3 py-2 text-right">Egresos</th><th className="px-3 py-2 text-right">Neto</th></tr></thead>
                <tbody>
                  {resumen.meses.map((m) => (
                    <tr key={m.mes} className="border-b border-slate-100">
                      <td className="px-3 py-1.5">{nombreMes(m.mes)}</td>
                      <td className="px-3 py-1.5 text-right">{clp(m.ingresos)}</td>
                      <td className="px-3 py-1.5 text-right">{clp(m.egresos)}</td>
                      <td className={`px-3 py-1.5 text-right ${m.ingresos - m.egresos < 0 ? 'text-red-700' : ''}`}>{clp(m.ingresos - m.egresos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </section>
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
