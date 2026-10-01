// Egresos del flujo por grandes grupos, desplegables: cada grupo suma sus líneas del presupuesto y, abajo, muestra las
// facturas recibidas por pagar que ya están incluidas en ese monto (informativas: no se suman otra vez).
import { formatoFecha, formatoNumero, type LineaFlujo } from '@atacama/core'
import { useState } from 'react'

export interface FacturaIncluida {
  grupo: string
  proveedor: string
  folio: string
  fecha: string
  saldo: number
}

const ORDEN = [
  'Materia prima',
  'Insumos de producción',
  'Exportación: flete, aduana y puerto',
  'Costos variables de planta',
  'Gastos fijos y administración',
  'Remuneraciones y Previred',
  'Deudas y créditos',
  'Otros',
]

const num = (v: number) => (Math.abs(v) < 0.5 ? '' : formatoNumero(Math.round(v)))

export default function FilasEgresos({
  egresos,
  facturas,
  columnas,
  columnaDe,
}: {
  egresos: LineaFlujo[]
  facturas: FacturaIncluida[]
  columnas: number
  /** Columna de la tabla donde cae una fecha, o -1 si está fuera del período mostrado. */
  columnaDe: (fecha: string) => number
}) {
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({})
  const grupos = new Map<string, LineaFlujo[]>()
  for (const l of egresos) {
    const g = l.grupo ?? 'Otros'
    grupos.set(g, [...(grupos.get(g) ?? []), l])
  }
  const nombres = [...grupos.keys()].sort((a, b) => (ORDEN.indexOf(a) + 1 || 99) - (ORDEN.indexOf(b) + 1 || 99))

  return (
    <>
      {nombres.map((g) => {
        const lineas = grupos.get(g)!
        const total = Array.from({ length: columnas }, (_, i) => lineas.reduce((s, l) => s + (l.valores[i] ?? 0), 0))
        const abierto = !!abiertos[g]
        const delGrupo = facturas.filter((f) => f.grupo === g)
        return (
          <FragmentoGrupo key={g}>
            <tr className="cursor-pointer border-b border-slate-100 bg-slate-50 font-medium hover:bg-slate-100" onClick={() => setAbiertos({ ...abiertos, [g]: !abierto })}>
              <td className="sticky left-0 z-10 bg-inherit px-3 py-1.5 whitespace-nowrap">
                <span className="mr-1 inline-block w-3 text-slate-400">{abierto ? '▾' : '▸'}</span>
                {g}
              </td>
              {total.map((v, i) => <td key={i} className="px-3 py-1.5 text-right whitespace-nowrap">{num(v)}</td>)}
            </tr>
            {abierto && lineas.map((l) => (
              <tr key={l.clave} className="border-b border-slate-100 text-slate-600">
                <td className="sticky left-0 z-10 bg-white px-3 py-1 pl-9 whitespace-nowrap">{l.nombre}</td>
                {Array.from({ length: columnas }, (_, i) => <td key={i} className="px-3 py-1 text-right whitespace-nowrap">{num(l.valores[i] ?? 0)}</td>)}
              </tr>
            ))}
            {abierto && delGrupo.map((f, k) => {
              const col = columnaDe(f.fecha)
              return (
                <tr key={`f${k}`} className="border-b border-slate-100 text-xs text-slate-400 italic">
                  <td className="sticky left-0 z-10 bg-white px-3 py-1 pl-9 whitespace-nowrap">
                    Factura {f.proveedor} N° {f.folio} por pagar ({formatoFecha(f.fecha)}), ya incluida arriba
                  </td>
                  {Array.from({ length: columnas }, (_, i) => <td key={i} className="px-3 py-1 text-right whitespace-nowrap">{i === col ? num(f.saldo) : ''}</td>)}
                </tr>
              )
            })}
          </FragmentoGrupo>
        )
      })}
    </>
  )
}

function FragmentoGrupo({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
