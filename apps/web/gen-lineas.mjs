// Genera apps/api/prisma/facturasLineas.ts con las líneas de detalle de cada factura (leídas de los PDF de /facturas).
import fs from 'fs'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

const dir = '../../facturas/'
const lineasDe = async (f) => {
  const d = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(dir + f)), useSystemFonts: true }).promise
  const out = []
  for (let n = 1; n <= d.numPages; n++) {
    const p = await d.getPage(n)
    const it = (await p.getTextContent()).items.filter((i) => i.str.trim())
    const rows = []
    for (const i of it) {
      let r = rows.find((r) => Math.abs(r.y - i.transform[5]) < 3)
      if (!r) rows.push((r = { y: i.transform[5], it: [] }))
      r.it.push(i)
    }
    rows.sort((a, b) => b.y - a.y)
    for (const r of rows) {
      r.it.sort((a, b) => a.transform[4] - b.transform[4])
      out.push(r.it.map((i) => i.str.trim()))
    }
  }
  return out
}

const resultado = {}
const sin = []
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.pdf'))) {
  const filas = await lineasDe(f)
  const texto = filas.map((c) => c.join(' ')).join(' ').replace(/\s+/g, ' ')
  const folio = texto.match(/(?:FACTURA|NOTA DE (?:CR[EÉ]DITO|D[EÉ]BITO))[^N0-9]{0,40}N[º°o.]*\s*(\d{2,10})/i)?.[1] ?? texto.match(/\bN[º°]\s*(\d{3,10})\b/)?.[1]
  const rut = [...texto.matchAll(/\b\d{1,2}\.\d{3}\.\d{3}-[\dkK]\b/g)].map((m) => m[0]).find((r) => r !== '76.927.694-7')
  if (!folio || !rut) { sin.push(f); continue }
  const ini = filas.findIndex((c) => /^c[oó]digo$/i.test(c[0]) || c.join(' ').toLowerCase().startsWith('codigo') || c.join(' ').toLowerCase().includes('descripcion'))
  const fin = filas.findIndex((c, i) => i > ini && /^(MONTO (NETO|EXENTO)|Timbre|TOTAL|SUBTOTAL|NETO)/i.test(c.join(' ').trim()))
  let items = ini >= 0 ? filas.slice(ini + 1, fin > 0 ? fin : undefined) : []
  items = items.filter((c) => !/^(Adic\.?\*?|%Impto|%Desc\.?)$/i.test(c.join(' ').trim()) && !/^%?Impto$/i.test(c[0]))
  resultado[`${rut.replace(/[.\-]/g, '')}|${folio.replace(/^0+/, '')}`] = items.map((c) => c.join(' | '))
  if (!items.length) sin.push(f + ' (sin líneas)')
}
const cuerpo = Object.entries(resultado).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n')
fs.writeFileSync(
  '../api/prisma/facturasLineas.ts',
  `// Líneas de detalle de las facturas recibidas (leídas de los PDF), por "RUT del emisor sin puntos|N° de factura".\n// Cada línea trae sus celdas separadas por " | " (código, descripción, cantidad, precio, valor...).\nexport const LINEAS_FACTURAS: Record<string, string[]> = {\n${cuerpo}\n}\n`,
)
console.log(Object.keys(resultado).length, 'facturas con líneas;', 'sin leer:', sin)
