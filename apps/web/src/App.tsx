import { formatoFecha } from '@atacama/core'
import { useEffect, useState } from 'react'
import { api, sesion } from './api'
import Login from './Login'
import Cartolas from './Cartolas'
import Facturas from './Facturas'
import FlujoPagina from './FlujoPagina'
import Maestro from './Maestro'
import PlanMP from './PlanMP'
import Respaldos from './Respaldos'
import Presupuesto from './Presupuesto'
import { PAGINAS, type Pagina } from './paginas'

function PaginaMaestro({ pagina }: { pagina: Pagina }) {
  const [padre, setPadre] = useState<any | null>(null)
  return (
    <>
      <Maestro {...pagina.principal} alSeleccionar={pagina.detalles ? setPadre : undefined} />
      {pagina.detalles &&
        (padre ? (
          <div className="mb-4 border-l-4 border-sky-200 pl-3">
            <p className="mb-1.5 text-sm font-medium text-sky-800">
              {padre.nombre ?? padre.puerto ?? padre.acreedor}
            </p>
            {pagina.detalles.map(({ campoPadre, ...d }) => (
              <Maestro key={d.recurso} {...d} fijo={{ [campoPadre]: padre.id }} />
            ))}
          </div>
        ) : (
          <p className="mb-4 text-sm text-slate-500">Selecciona una fila para ver su detalle.</p>
        ))}
      {pagina.extras?.map((e) => <Maestro key={e.titulo} {...e} />)}
    </>
  )
}

function Incoterms() {
  const [incoterms, setIncoterms] = useState<any[]>([])
  const [tipos, setTipos] = useState<any[]>([])
  const [marcas, setMarcas] = useState<any[]>([])
  const cargar = () =>
    Promise.all([api('/r/incoterms'), api('/r/tiposCosto'), api('/r/incotermCostos')]).then(([i, t, m]) => {
      setIncoterms(i)
      setTipos(t)
      setMarcas(m)
    })
  useEffect(() => {
    cargar()
  }, [])

  async function alternar(incotermId: number, tipoCostoId: number) {
    const marca = marcas.find((m) => m.incotermId === incotermId && m.tipoCostoId === tipoCostoId)
    if (marca) await api(`/r/incotermCostos/${marca.id}`, 'DELETE')
    else await api('/r/incotermCostos', 'POST', { incotermId, tipoCostoId })
    cargar()
  }

  return (
    <>
      <section className="mb-6">
        <h2 className="mb-2 text-base font-semibold">Costos que asume la empresa según el incoterm</h2>
        <p className="mb-2 text-sm text-slate-500">
          Esta tabla decide qué costos de exportación se cargan a cada embarque. Un cliente sin incoterm no asume ninguno y genera una advertencia.
        </p>
        <table className="rounded border border-slate-200 bg-white text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <th className="px-3 py-2">Incoterm</th>
              {tipos.map((t) => <th key={t.id} className="px-3 py-2 font-medium">{t.nombre}</th>)}
            </tr>
          </thead>
          <tbody>
            {incoterms.map((i) => (
              <tr key={i.id} className="border-b border-slate-100">
                <td className="px-3 py-2 font-medium">{i.codigo} <span className="font-normal text-slate-500">{i.descripcion}</span></td>
                {tipos.map((t) => (
                  <td key={t.id} className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={marcas.some((m) => m.incotermId === i.id && m.tipoCostoId === t.id)}
                      onChange={() => alternar(i.id, t.id)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <Maestro
        recurso="incoterms"
        titulo="Incoterms"
        columnas={[
          { campo: 'codigo', titulo: 'Código', ancho: 120 },
          { campo: 'descripcion', titulo: 'Descripción' },
          { campo: 'eventoReconocimiento', titulo: 'La venta se reconoce en', tipo: 'opcion', opciones: ['PRODUCCION', 'ETD', 'BL', 'ETA'], defecto: 'BL' },
        ]}
        alSeleccionar={() => cargar()}
      />
      <Maestro
        recurso="tiposCosto"
        titulo="Tipos de costo de exportación"
        columnas={[
          { campo: 'codigo', titulo: 'Código' },
          { campo: 'nombre', titulo: 'Nombre' },
        ]}
      />
    </>
  )
}

function Inicio() {
  const [adv, setAdv] = useState<{ modulo: string; mensaje: string }[] | null>(null)
  useEffect(() => {
    api('/advertencias').then(setAdv)
  }, [])
  const modulos = [...new Set((adv ?? []).map((a) => a.modulo))]

  async function respaldo() {
    const datos = await api('/respaldo')
    const url = URL.createObjectURL(new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `respaldo-atacama-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="mb-4 flex items-center">
        <h2 className="mr-auto text-base font-semibold">Datos por completar</h2>
        <button className="btn" onClick={respaldo}>Descargar respaldo (JSON)</button>
      </div>
      {adv === null ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : adv.length === 0 ? (
        <p className="text-sm text-slate-500">No hay advertencias.</p>
      ) : (
        modulos.map((m) => (
          <div key={m} className="mb-4 rounded border border-amber-200 bg-amber-50 p-3">
            <h3 className="mb-1 text-sm font-semibold text-amber-900">{m}</h3>
            <ul className="list-disc pl-5 text-sm text-amber-900">
              {adv.filter((a) => a.modulo === m).map((a, i) => <li key={i}>{a.mensaje}</li>)}
            </ul>
          </div>
        ))
      )}
    </>
  )
}

function Auditoria() {
  const [filas, setFilas] = useState<any[]>([])
  useEffect(() => {
    api('/auditoria').then(setFilas)
  }, [])
  return (
    <>
      <h2 className="mb-2 text-base font-semibold">Auditoría (últimos 500 cambios)</h2>
      <table className="w-full rounded border border-slate-200 bg-white text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left">
            {['Fecha', 'Usuario', 'Acción', 'Entidad', 'ID', 'Detalle'].map((t) => <th key={t} className="px-3 py-2">{t}</th>)}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id} className="border-b border-slate-100 align-top">
              <td className="px-3 py-1.5 whitespace-nowrap">{formatoFecha(f.fecha)} {f.fecha.slice(11, 16)}</td>
              <td className="px-3 py-1.5">{f.usuario}</td>
              <td className="px-3 py-1.5">{f.accion}</td>
              <td className="px-3 py-1.5">{f.entidad}</td>
              <td className="px-3 py-1.5">{f.entidadId}</td>
              <td className="max-w-xl truncate px-3 py-1.5 text-slate-500" title={`Antes: ${f.antes ?? ''}\nDespués: ${f.despues ?? ''}`}>
                {f.despues ?? f.antes}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

const ESPECIALES = [
  { id: 'inicio', menu: 'Inicio', grupo: '' },
  { id: 'presupuesto', menu: 'Presupuesto', grupo: 'Reportes' },
  { id: 'flujo', menu: 'Flujo de caja', grupo: 'Reportes' },
  { id: 'incoterms', menu: 'Incoterms', grupo: 'Comercial' },
  { id: 'facturas', menu: 'Facturas recibidas', grupo: 'Proveedores' },
  { id: 'auditoria', menu: 'Auditoría', grupo: 'Configuración' },
  { id: 'respaldos', menu: 'Respaldos', grupo: 'Configuración' },
]

export default function App() {
  const [conSesion, setConSesion] = useState(!!sesion.token)
  const [actual, setActual] = useState('inicio')

  useEffect(() => {
    const cerrar = () => setConSesion(false)
    window.addEventListener('sesion-expirada', cerrar)
    return () => window.removeEventListener('sesion-expirada', cerrar)
  }, [])

  if (!conSesion) return <Login alEntrar={() => setConSesion(true)} />

  const menu = [...ESPECIALES, ...PAGINAS]
  const grupos = ['', 'Reportes', 'Comercial', 'Producción', 'Presupuesto', 'Proveedores', 'Bancos', 'Configuración']
  const pagina = PAGINAS.find((p) => p.id === actual)

  async function salir() {
    await api('/logout', 'POST').catch(() => {})
    sesion.cerrar()
    setConSesion(false)
  }

  return (
    <div className="flex min-h-screen">
      <nav className="w-56 shrink-0 border-r border-slate-200 bg-white p-4">
        <p className="mb-4 font-semibold">Atacama Sea Salt</p>
        {grupos.map((g) => (
          <div key={g} className="mb-3">
            {g && <p className="mb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">{g}</p>}
            {menu.filter((m) => m.grupo === g).map((m) => (
              <button
                key={m.id}
                onClick={() => setActual(m.id)}
                className={`block w-full rounded px-2 py-1 text-left text-sm ${actual === m.id ? 'bg-sky-100 font-medium text-sky-900' : 'hover:bg-slate-100'}`}
              >
                {m.menu}
              </button>
            ))}
          </div>
        ))}
        <button className="btn mt-4 w-full" onClick={salir}>Cerrar sesión</button>
      </nav>
      <main className="min-w-0 flex-1 p-4">
        {actual === 'inicio' && <Inicio />}
        {actual === 'presupuesto' && <Presupuesto irA={setActual} />}
        {actual === 'flujo' && <FlujoPagina />}
        {actual === 'incoterms' && <Incoterms />}
        {actual === 'facturas' && <Facturas />}
        {actual === 'auditoria' && <Auditoria />}
        {actual === 'respaldos' && <Respaldos />}
        {pagina?.id === 'mp' && <PlanMP />}
        {pagina?.id === 'cartolas' && <Cartolas />}
        {pagina && <PaginaMaestro key={pagina.id} pagina={pagina} />}
      </main>
    </div>
  )
}
