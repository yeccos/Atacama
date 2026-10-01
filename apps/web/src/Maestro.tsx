// Grilla editable genérica para los maestros: editar en la celda, agregar, eliminar,
// exportar e importar Excel. Cada página solo declara sus columnas.
import { formatoFecha, formatoNumero, parseFechaCL, parseNumeroCL } from '@atacama/core'
import type { CellValueChangedEvent, ColDef } from 'ag-grid-community'
import { AgGridReact } from 'ag-grid-react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import * as XLSX from 'xlsx'
import { api } from './api'

export type TipoCol = 'texto' | 'entero' | 'decimal' | 'clp' | 'usd' | 'monto' | 'fecha' | 'bool' | 'opcion' | 'ref'

export interface Col {
  campo: string
  titulo: string
  tipo?: TipoCol
  decimales?: number
  /** Para tipo "decimal": pesos sin decimales y USD/UF con dos, según la moneda de la fila. */
  porMoneda?: boolean
  /** Valores posibles para tipo "opcion". */
  opciones?: string[]
  /** Recurso referenciado para tipo "ref", y el campo que se muestra. */
  ref?: string
  refCampo?: string
  ancho?: number
  defecto?: unknown
}

export interface ConfigMaestro {
  recurso: string
  titulo: string
  ayuda?: string
  columnas: Col[]
}

interface Props extends ConfigMaestro {
  /** Valores fijos: filtran la lista y se aplican a los registros nuevos (p. ej. clienteId). */
  fijo?: Record<string, unknown>
  alSeleccionar?: (fila: any | null) => void
}

type Opciones = Record<string, { id: number; texto: string }[]>

const esNumero = (t?: TipoCol) => t === 'entero' || t === 'decimal' || t === 'clp' || t === 'usd' || t === 'monto'

/** Pesos sin decimales; USD y UF con dos. */
const decimalesDe = (fila: any) => (!fila?.moneda || fila.moneda === 'CLP' ? 0 : 2)

/**
 * Valor guardado → texto en formato chileno. Los USD se guardan en centavos.
 * El tipo "monto" es un entero en la moneda de la fila: pesos, o centavos si la fila es en USD.
 */
function mostrar(col: Col, valor: unknown, opciones: Opciones, fila?: any): string {
  if (valor === null || valor === undefined || valor === '') return ''
  switch (col.tipo) {
    case 'entero':
    case 'clp':
      return formatoNumero(Number(valor), 0)
    case 'usd':
      return formatoNumero(Number(valor) / 100, 2)
    case 'monto':
      return fila?.moneda === 'USD' ? formatoNumero(Number(valor) / 100, 2) : formatoNumero(Number(valor), 0)
    case 'decimal':
      return formatoNumero(Number(valor), col.porMoneda ? decimalesDe(fila) : (col.decimales ?? 2))
    case 'fecha':
      return formatoFecha(String(valor))
    case 'bool':
      return valor ? 'Sí' : 'No'
    case 'ref':
      return opciones[col.ref!]?.find((o) => o.id === Number(valor))?.texto ?? String(valor)
    default:
      return String(valor)
  }
}

/** Texto escrito por el usuario → valor a guardar. `undefined` = texto no válido. */
function leer(col: Col, texto: unknown, opciones: Opciones, fila?: any): unknown {
  if (texto === null || texto === undefined || texto === '') return null
  if (col.tipo === 'bool') return texto === true || texto === 'Sí' || texto === 'true'
  if (esNumero(col.tipo)) {
    const n = parseNumeroCL(texto as string | number)
    if (n === null) return undefined
    if (col.tipo === 'usd' || (col.tipo === 'monto' && fila?.moneda === 'USD')) return Math.round(n * 100)
    if (col.tipo === 'decimal') return col.porMoneda && decimalesDe(fila) === 0 ? Math.round(n) : n
    return Math.round(n)
  }
  if (col.tipo === 'fecha') return parseFechaCL(String(texto)) ?? undefined
  if (col.tipo === 'ref') {
    if (typeof texto === 'number') return texto
    return opciones[col.ref!]?.find((o) => o.texto === texto)?.id ?? undefined
  }
  return String(texto)
}

export default function Maestro({ recurso, titulo, ayuda, columnas, fijo, alSeleccionar }: Props) {
  const [filas, setFilas] = useState<any[]>([])
  const [opciones, setOpciones] = useState<Opciones>({})
  const [error, setError] = useState('')
  const [nuevo, setNuevo] = useState<Record<string, unknown> | null>(null)
  const [seleccion, setSeleccion] = useState<any | null>(null)
  const archivo = useRef<HTMLInputElement>(null)
  const grilla = useRef<AgGridReact>(null)
  const claveFijo = JSON.stringify(fijo ?? {})

  const cargar = useCallback(async () => {
    try {
      const q = new URLSearchParams(JSON.parse(claveFijo)).toString()
      setFilas(await api(`/r/${recurso}${q ? '?' + q : ''}`))
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }, [recurso, claveFijo])

  useEffect(() => {
    setSeleccion(null)
    cargar()
  }, [cargar])

  useEffect(() => {
    const refs = columnas.filter((c) => c.tipo === 'ref')
    Promise.all(
      refs.map(async (c) => {
        const lista = await api<any[]>(`/r/${c.ref}`)
        return [c.ref!, lista.map((x) => ({ id: x.id, texto: String(x[c.refCampo ?? 'nombre']) }))] as const
      }),
    ).then((pares) => setOpciones(Object.fromEntries(pares)))
  }, [columnas])

  // Al llegar las opciones de las referencias hay que repintar: el formateador cambia pero los datos no.
  useEffect(() => {
    grilla.current?.api?.refreshCells({ force: true })
  }, [opciones])

  const columnDefs = useMemo<ColDef[]>(
    () =>
      columnas.map((c) => {
        const def: ColDef = {
          field: c.campo,
          headerName: c.titulo,
          editable: true,
          width: c.ancho,
          flex: c.ancho ? undefined : 1,
          minWidth: 90,
          cellDataType: c.tipo === 'bool' ? 'boolean' : false,
        }
        if (c.tipo === 'bool') return def
        def.valueFormatter = (p) => mostrar(c, p.value, opciones, p.data)
        if (c.tipo === 'opcion') {
          def.cellEditor = 'agSelectCellEditor'
          def.cellEditorParams = { values: c.opciones }
        } else if (c.tipo === 'ref') {
          def.cellEditor = 'agSelectCellEditor'
          def.cellEditorParams = { values: [null, ...(opciones[c.ref!] ?? []).map((o) => o.id)] }
        } else {
          // El editor muestra el valor ya formateado, así "1,127" se edita como se ve.
          def.cellEditorParams = { useFormatter: true }
          def.valueParser = (p) => {
            const v = leer(c, p.newValue, opciones, p.data)
            return v === undefined ? p.oldValue : v
          }
          if (esNumero(c.tipo)) def.type = 'rightAligned'
        }
        return def
      }),
    [columnas, opciones],
  )

  async function alEditar(e: CellValueChangedEvent) {
    try {
      await api(`/r/${recurso}/${e.data.id}`, 'PUT', { [e.colDef.field!]: e.newValue })
      setError('')
    } catch (err) {
      setError((err as Error).message)
      cargar()
    }
  }

  async function crear(e: FormEvent) {
    e.preventDefault()
    const cuerpo: Record<string, unknown> = { ...fijo }
    for (const c of columnas) {
      const v = leer(c, nuevo![c.campo], opciones, nuevo)
      if (v === undefined) return setError(`"${c.titulo}": valor no válido`)
      if (v !== null) cuerpo[c.campo] = v
    }
    try {
      await api(`/r/${recurso}`, 'POST', cuerpo)
      setNuevo(null)
      cargar()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function eliminar() {
    if (!seleccion || !confirm('¿Eliminar el registro seleccionado?')) return
    try {
      await api(`/r/${recurso}/${seleccion.id}`, 'DELETE')
      setSeleccion(null)
      alSeleccionar?.(null)
      cargar()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  function exportar() {
    const datos = filas.map((f) =>
      Object.fromEntries(
        columnas.map((c) => {
          const v = f[c.campo]
          if (v === null || v === undefined) return [c.titulo, '']
          if (c.tipo === 'usd' || (c.tipo === 'monto' && f.moneda === 'USD')) return [c.titulo, Number(v) / 100]
          if (esNumero(c.tipo)) return [c.titulo, Number(v)]
          return [c.titulo, mostrar(c, v, opciones)]
        }),
      ),
    )
    const libro = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(datos), titulo.slice(0, 31))
    XLSX.writeFile(libro, `${titulo}.xlsx`)
  }

  async function importar(file: File) {
    const libro = XLSX.read(await file.arrayBuffer())
    const hojas = XLSX.utils.sheet_to_json<Record<string, unknown>>(libro.Sheets[libro.SheetNames[0]], { defval: '' })
    let ok = 0
    const errores: string[] = []
    for (const [i, fila] of hojas.entries()) {
      const cuerpo: Record<string, unknown> = { ...fijo }
      let invalida = ''
      for (const c of columnas) {
        const crudo = fila[c.titulo]
        const v = leer(c, crudo, opciones, { moneda: fila['Moneda'] })
        if (v === undefined) invalida = c.titulo
        else if (v !== null) cuerpo[c.campo] = v
      }
      try {
        if (invalida) throw new Error(`"${invalida}" no válido`)
        await api(`/r/${recurso}`, 'POST', cuerpo)
        ok++
      } catch (err) {
        errores.push(`Fila ${i + 2}: ${(err as Error).message}`)
      }
    }
    setError(errores.length ? `Importadas ${ok} filas. ${errores.slice(0, 5).join(' · ')}` : '')
    cargar()
  }

  return (
    <section className="mb-6">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-base font-semibold">{titulo}</h2>
        <button className="btn-primario" onClick={() => setNuevo(Object.fromEntries(columnas.map((c) => [c.campo, c.defecto ?? ''])))}>
          Agregar
        </button>
        <button className="btn" onClick={eliminar} disabled={!seleccion}>Eliminar</button>
        <button className="btn" onClick={exportar}>Exportar Excel</button>
        <button className="btn" onClick={() => archivo.current?.click()}>Importar Excel</button>
        <input
          ref={archivo}
          type="file"
          accept=".xlsx,.xls,.csv"
          hidden
          onChange={(e) => {
            if (e.target.files?.[0]) importar(e.target.files[0])
            e.target.value = ''
          }}
        />
      </div>
      {ayuda && <p className="mb-2 text-sm text-slate-500">{ayuda}</p>}
      {error && <p className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {nuevo && (
        <form onSubmit={crear} className="mb-3 grid grid-cols-2 gap-3 rounded border border-slate-200 bg-white p-3 md:grid-cols-4">
          {columnas.map((c) => (
            <label key={c.campo} className="text-xs text-slate-600">
              {c.titulo}
              {c.tipo === 'bool' ? (
                <input type="checkbox" className="ml-2" checked={!!nuevo[c.campo]} onChange={(e) => setNuevo({ ...nuevo, [c.campo]: e.target.checked })} />
              ) : c.tipo === 'opcion' || c.tipo === 'ref' ? (
                <select
                  className="campo mt-1"
                  value={String(nuevo[c.campo] ?? '')}
                  onChange={(e) => setNuevo({ ...nuevo, [c.campo]: c.tipo === 'ref' && e.target.value ? Number(e.target.value) : e.target.value })}
                >
                  <option value="">—</option>
                  {c.tipo === 'opcion'
                    ? c.opciones!.map((o) => <option key={o}>{o}</option>)
                    : (opciones[c.ref!] ?? []).map((o) => <option key={o.id} value={o.id}>{o.texto}</option>)}
                </select>
              ) : (
                <input
                  className="campo mt-1"
                  placeholder={c.tipo === 'fecha' ? 'dd-mm-aaaa' : ''}
                  value={String(nuevo[c.campo] ?? '')}
                  onChange={(e) => setNuevo({ ...nuevo, [c.campo]: e.target.value })}
                />
              )}
            </label>
          ))}
          <div className="col-span-full flex gap-2">
            <button className="btn-primario">Guardar</button>
            <button type="button" className="btn" onClick={() => setNuevo(null)}>Cancelar</button>
          </div>
        </form>
      )}

      <AgGridReact
        ref={grilla}
        rowData={filas}
        columnDefs={columnDefs}
        domLayout="autoHeight"
        getRowId={(p) => String(p.data.id)}
        rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
        onSelectionChanged={(e) => {
          const fila = e.api.getSelectedRows()[0] ?? null
          setSeleccion(fila)
          alSeleccionar?.(fila)
        }}
        onCellValueChanged={alEditar}
        stopEditingWhenCellsLoseFocus
        overlayNoRowsTemplate="Sin registros"
      />
    </section>
  )
}
