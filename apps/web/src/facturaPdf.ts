// Lee un PDF de factura en el navegador para saber a qué factura recibida corresponde (N° de folio y RUT del emisor).
export const RUT_ATACAMA = '769276947'

const soloRut = (r: string) => r.replace(/[^0-9kK]/g, '').toUpperCase()

export function datosDeTexto(texto: string): { folio: string | null; ruts: string[] } {
  const t = texto.replace(/\s+/g, ' ')
  const folio =
    t.match(/(?:FACTURA|NOTA DE (?:CR[EÉ]DITO|D[EÉ]BITO)|BOLETA)[^N0-9]{0,40}N[º°o.]*\s*(\d{2,10})/i)?.[1] ??
    t.match(/\bN[º°]\s*(\d{3,10})\b/)?.[1] ??
    null
  const ruts = [...new Set([...t.matchAll(/\b\d{1,2}\.\d{3}\.\d{3}-[\dkK]\b/g)].map((m) => soloRut(m[0])).filter((r) => r !== RUT_ATACAMA))]
  return { folio, ruts }
}

export async function leerFacturaPdf(archivo: File): Promise<{ folio: string | null; ruts: string[] }> {
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await archivo.arrayBuffer()) }).promise
  const pagina = await doc.getPage(1)
  const texto = (await pagina.getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join(' ')
  return datosDeTexto(texto)
}

export const rutDigitos = soloRut

export async function aBase64(archivo: File): Promise<string> {
  const bytes = new Uint8Array(await archivo.arrayBuffer())
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
