import { useState, type FormEvent } from 'react'
import { api, sesion } from './api'

export default function Login({ alEntrar }: { alEntrar: () => void }) {
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')

  async function entrar(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const r = await api('/login', 'POST', { usuario, clave })
      sesion.guardar(r.token)
      alEntrar()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form onSubmit={entrar} className="w-full max-w-xs space-y-3 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold">Atacama Sea Salt</h1>
        <p className="text-sm text-slate-500">Gestión financiera</p>
        <label className="block text-sm">
          Usuario
          <input className="campo mt-1" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoFocus />
        </label>
        <label className="block text-sm">
          Clave
          <input className="campo mt-1" type="password" value={clave} onChange={(e) => setClave(e.target.value)} />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primario w-full">Entrar</button>
      </form>
    </div>
  )
}
