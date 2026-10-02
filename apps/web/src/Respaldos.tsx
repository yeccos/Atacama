// Respaldos de la base: lista de copias automáticas (una por día), crear una ahora y descargarlas.
import { formatoNumero } from '@atacama/core'
import { useCallback, useEffect, useState } from 'react'
import { api, sesion } from './api'

interface Respaldo { nombre: string; bytes: number; fecha: string }

const kb = (b: number) => formatoNumero(Math.round(b / 1024)) + ' KB'
const fechaHora = (iso: string) => {
  const d = new Date(iso)
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${dos(d.getDate())}-${dos(d.getMonth() + 1)}-${d.getFullYear()} ${dos(d.getHours())}:${dos(d.getMinutes())}`
}

export default function Respaldos() {
  const [lista, setLista] = useState<Respaldo[]>([])
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(async () => {
    try {
      setLista((await api<{ respaldos: Respaldo[] }>('/respaldos')).respaldos)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])
  useEffect(() => {
    cargar()
  }, [cargar])

  async function crear() {
    setOcupado(true)
    setError('')
    try {
      const r = await api<{ archivo: string }>('/respaldos', 'POST', {})
      setMensaje(`Respaldo creado: ${r.archivo}`)
      await cargar()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  async function descargar(nombre: string) {
    const res = await fetch('/api/respaldos/' + nombre, { headers: { Authorization: 'Bearer ' + sesion.token } })
    if (!res.ok) return setError('No se pudo descargar el respaldo')
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = nombre
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <h2 className="mr-auto text-base font-semibold">Respaldos de la base de datos</h2>
        <button className="btn" disabled={ocupado} onClick={crear}>Crear respaldo ahora</button>
      </div>
      <p className="mb-3 text-sm text-slate-500">
        La app guarda sola una copia completa cada día (se conservan las últimas 14 y una por mes durante un año). Quedan en el mismo disco que la base, así que descarga una de vez en cuando
        y guárdala en otro lugar (tu computador o la nube): es lo que te protege si se pierde el disco.
      </p>
      {error && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {mensaje && <p className="mb-3 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{mensaje}</p>}
      <div className="max-w-2xl rounded border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left"><th className="px-3 py-2">Respaldo</th><th className="px-3 py-2">Creado</th><th className="px-3 py-2 text-right">Tamaño</th><th className="px-3 py-2"></th></tr></thead>
          <tbody>
            {lista.map((r) => (
              <tr key={r.nombre} className="border-b border-slate-100">
                <td className="px-3 py-1.5">{r.nombre}</td>
                <td className="px-3 py-1.5">{fechaHora(r.fecha)}</td>
                <td className="px-3 py-1.5 text-right">{kb(r.bytes)}</td>
                <td className="px-3 py-1.5 text-right"><button className="text-xs text-sky-700 hover:underline" onClick={() => descargar(r.nombre)}>Descargar</button></td>
              </tr>
            ))}
            {lista.length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-400">Todavía no hay respaldos (el primero se crea unos segundos después de arrancar).</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
