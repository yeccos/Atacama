// Cartolas bancarias: quién es la contraparte de un movimiento y a qué corresponde.
// Todo es texto: las glosas del banco vienen cortadas y con espacios sueltos ("INDUST RIAL"), así que se compara
// siempre sobre una versión compacta (mayúsculas, sin tildes ni espacios).

export interface ProveedorBanco {
  id: number
  nombre: string
}

export interface EmpleadoBanco {
  nombre: string | null
  liquido: number | null
}

/** ¿La contraparte de la glosa es este empleado? Compara nombre, apellido y la inicial del segundo apellido ("Errázuriz L."). */
export function esEmpleado(contraparte: string | null, empleado: EmpleadoBanco): boolean {
  if (!contraparte || !empleado.nombre) return false
  const palabras = contraparte.split(/\s+/).map(compacto).filter(Boolean)
  const nombre = empleado.nombre.replace(/\./g, ' ').split(/\s+/).map(compacto).filter(Boolean)
  if (nombre.length < 2) return false
  const [primero, apellido, inicial] = nombre
  const iApellido = palabras.indexOf(apellido)
  if (!palabras.includes(primero) || iApellido < 0) return false
  if (inicial && inicial.length === 1) return palabras.slice(iApellido + 1).some((p) => p.startsWith(inicial))
  return true
}

export interface Clasificacion {
  contraparte: string | null
  categoria: string | null
  proveedorId: number | null
}

/** Mayúsculas, sin tildes ni espacios ni signos. */
export const compacto = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')

/** Nombre de quien recibe o envía el dinero, tal como viene en la glosa. */
export function contraparteDe(glosa: string): string | null {
  const g = glosa.replace(/\s+/g, ' ')
  const m =
    g.match(/cuenta\s+\d+\s+(?:B\.\s?[A-Za-z]+(?: [a-z]{1,5})?|M\.\s?Pago|Itau\w*)\s*,?\s*(.+?)(?:,\s*Rut|,\s*\d{6,}|,\s*desde|,\s*el\s+\d)/) ??
    g.match(/(?:transferencia|Pago Proveedores|Transferencia)\s+(?:de|via CCA,)\s*(?:originador Rut:\s*[\d-]+\s*Nombre:\s*)?(.+?)(?:\s+Rut|\s+desde|\s*\(N\.Ref|$)/i)
  return m ? m[1].replace(/\s+/g, ' ').trim() : null
}

const REGLAS: { patron: RegExp; solo?: 'abono' | 'cargo'; categoria: string }[] = [
  { patron: /BICEMX|ENMXPOROPERACION|VENTAENMX/, solo: 'abono', categoria: 'Venta de dólares (BiceMX)' },
  { patron: /PAGOPREVISIONAL|PREVISIONALNRO/, solo: 'cargo', categoria: 'Previred' },
  { patron: /PAGOSIINRO|PORPAGOSII|PAGOTGR/, solo: 'cargo', categoria: 'Impuestos (SII / TGR)' },
  { patron: /TESORERIAGENERA|60805000/, solo: 'abono', categoria: 'Devolución de IVA (Tesorería)' },
  { patron: /CARGOPORCOMISION|COMISIONTRANS/, solo: 'cargo', categoria: 'Comisiones bancarias' },
  { patron: /SQMINDUST|ALBEMARLE/, solo: 'cargo', categoria: 'Materia prima' },
]

/** Clasifica un movimiento por reglas fijas y, si no calza ninguna, por nombre de proveedor. */
export function clasificarMovimiento(
  glosa: string,
  cargo: number,
  abono: number,
  proveedores: ProveedorBanco[],
  empleados: EmpleadoBanco[] = [],
): Clasificacion {
  const contraparte = contraparteDe(glosa)
  const c = compacto(glosa)
  const lado = abono > 0 ? 'abono' : 'cargo'
  let proveedorId: number | null = null
  // El proveedor se busca por el nombre de la contraparte (o toda la glosa si no se pudo leer).
  const base = compacto(contraparte ?? glosa)
  const prov = proveedores
    .filter((p) => compacto(p.nombre).length >= 3)
    .sort((a, b) => b.nombre.length - a.nombre.length)
    .find((p) => base.includes(compacto(p.nombre)))
  if (prov && lado === 'cargo') proveedorId = prov.id
  const regla = REGLAS.find((r) => r.patron.test(c) && (!r.solo || r.solo === lado))
  // Pagos a empleados: el sueldo es lo grande (al menos 40% del líquido); lo chico son reembolsos y gastos.
  const emp = lado === 'cargo' && !regla ? empleados.find((e) => esEmpleado(contraparte, e)) : undefined
  const categoriaEmpleado = emp ? (emp.liquido && cargo < emp.liquido * 0.4 ? 'Reembolsos de personal' : 'Remuneraciones') : null
  const categoria = regla ? regla.categoria : categoriaEmpleado ?? (proveedorId ? 'Proveedores' : null)
  return { contraparte, categoria, proveedorId }
}

export interface MovimientoCartola {
  fecha: string
  nDoc: string
  glosa: string
  cargo: number
  abono: number
}

/** Clave estable de un movimiento para no duplicarlo si se vuelve a importar la misma cartola. */
export function claveMovimiento(m: MovimientoCartola, ordinal: number): string {
  return [m.fecha, m.nDoc || compacto(m.glosa).slice(0, 24), m.cargo, m.abono, ordinal].join('|')
}
