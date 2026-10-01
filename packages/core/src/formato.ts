// Formatos chilenos: miles con punto, decimales con coma, fechas dd-mm-aaaa, RUT con dígito verificador.

export function formatoNumero(valor: number | null | undefined, decimales = 0): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return ''
  const signo = valor < 0 ? '-' : ''
  const [entero, dec] = Math.abs(valor).toFixed(decimales).split('.')
  const miles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return signo + miles + (dec ? ',' + dec : '')
}

export const formatoCLP = (valor: number | null | undefined) =>
  valor === null || valor === undefined ? '' : '$' + formatoNumero(valor, 0)

/** Recibe centavos de dólar. */
export const formatoUSD = (centavos: number | null | undefined) =>
  centavos === null || centavos === undefined ? '' : 'US$' + formatoNumero(centavos / 100, 2)

/** "1.234.567,89" → 1234567.89. Devuelve null si no es un número. */
export function parseNumeroCL(texto: string | number | null | undefined): number | null {
  if (texto === null || texto === undefined) return null
  if (typeof texto === 'number') return Number.isFinite(texto) ? texto : null
  const limpio = texto.replace(/[$\s]|US\$/gi, '').trim()
  if (limpio === '') return null
  // Solo se acepta la notación chilena; "1.5" se lee como 15, igual que en una planilla en español.
  const normalizado = limpio.replace(/\./g, '').replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(normalizado)) return null
  return Number(normalizado)
}

/** Acepta Date o ISO (aaaa-mm-dd...). Devuelve dd-mm-aaaa. */
export function formatoFecha(fecha: Date | string | null | undefined): string {
  if (!fecha) return ''
  const iso = typeof fecha === 'string' ? fecha : fecha.toISOString()
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}-${m}-${a}`
}

/** "dd-mm-aaaa" (o con / o .) → "aaaa-mm-dd". Devuelve null si la fecha no existe. */
export function parseFechaCL(texto: string | null | undefined): string | null {
  if (!texto) return null
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto.trim())
  const cl = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(texto.trim())
  let a: number, m: number, d: number
  if (iso) [a, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  else if (cl) [d, m, a] = [Number(cl[1]), Number(cl[2]), Number(cl[3])]
  else return null
  const f = new Date(Date.UTC(a, m - 1, d))
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null
  return f.toISOString().slice(0, 10)
}

function dvRut(cuerpo: string): string {
  let suma = 0
  let factor = 2
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor
    factor = factor === 7 ? 2 : factor + 1
  }
  const resto = 11 - (suma % 11)
  return resto === 11 ? '0' : resto === 10 ? 'K' : String(resto)
}

export function validarRut(rut: string | null | undefined): boolean {
  if (!rut) return false
  const limpio = rut.replace(/[.\-\s]/g, '').toUpperCase()
  if (!/^\d{7,8}[0-9K]$/.test(limpio)) return false
  return dvRut(limpio.slice(0, -1)) === limpio.slice(-1)
}

/** "76123456K" → "76.123.456-K". Si no parece un RUT, lo devuelve tal cual. */
export function formatearRut(rut: string | null | undefined): string {
  if (!rut) return ''
  const limpio = rut.replace(/[.\-\s]/g, '').toUpperCase()
  if (!/^\d{7,8}[0-9K]$/.test(limpio)) return rut
  return formatoNumero(Number(limpio.slice(0, -1))) + '-' + limpio.slice(-1)
}
