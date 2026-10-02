// Carga las facturas recibidas desde el 2-01-2026 según el SII (sin guías de despacho) que aún no estaban como documentos.
// Igual que las de agosto: las de agosto o antes se suponen pagadas hasta que una cartola muestre el pago (Facturas recibidas →
// Conciliar con cartolas); las de septiembre en adelante quedan pendientes. Marca `facturasSIICargadas`.
import type { PrismaClient } from '@prisma/client'
import { FACTURAS_SII } from './facturasSIIData'

const f = (iso: string) => new Date(iso + 'T00:00:00.000Z')
const sumarDias = (iso: string, dias: number) => new Date(f(iso).getTime() + dias * 86400000)
const digitos = (r: string | null) => (r ?? '').replace(/[^0-9kK]/g, '').toUpperCase()
const formatoRut = (d: string) => {
  const cuerpo = d.slice(0, -1)
  return cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + d.slice(-1)
}

export async function cargarFacturasSII(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'facturasSIICargadas' } })) return
  const proveedores = await prisma.proveedor.findMany()
  const porRut = new Map(proveedores.filter((p) => p.rut).map((p) => [digitos(p.rut), p]))
  const existentes = await prisma.documento.findMany({ select: { proveedorId: true, tipo: true, folio: true } })
  const claveDoc = (p: number, t: string, fo: string) => `${p}|${t}|${fo.replace(/^0+/, '')}`
  const hay = new Set(existentes.map((d) => claveDoc(d.proveedorId, d.tipo, d.folio)))
  for (const [rut, t, folio, emision, total, razon] of FACTURAS_SII) {
    let prov = porRut.get(rut.toUpperCase())
    if (!prov) {
      prov = await prisma.proveedor.create({ data: { rut: formatoRut(rut.toUpperCase()), nombre: razon.slice(0, 60) } }).catch(async () => (await prisma.proveedor.findFirst({ where: { nombre: razon.slice(0, 60) } }))!)
      porRut.set(rut.toUpperCase(), prov)
    }
    const tipo = t === 'NC' ? 'NOTA_CREDITO' : 'FACTURA'
    if (hay.has(claveDoc(prov.id, tipo, folio))) continue
    hay.add(claveDoc(prov.id, tipo, folio))
    const exento = t === 'FE' ? total : 0
    const neto = t === 'FE' ? 0 : Math.round(total / 1.19)
    const iva = t === 'FE' ? 0 : total - neto
    const doc = await prisma.documento.create({
      data: { proveedorId: prov.id, tipo, folio, emision: f(emision), vencimiento: sumarDias(emision, prov.diasPago), neto, exento, iva, total },
    })
    if (tipo === 'FACTURA' && emision <= '2026-08-31') {
      const pago = await prisma.pago.create({
        data: { proveedorId: prov.id, fecha: sumarDias(emision, prov.diasPago), monto: total, nota: 'Supuesto pagado (factura de agosto o antes); se verifica con la cartola' },
      })
      await prisma.aplicacionPago.create({ data: { pagoId: pago.id, documentoId: doc.id, monto: total } })
    }
  }
  await prisma.parametro.create({ data: { clave: 'facturasSIICargadas', valor: '1', descripcion: 'Marca interna: facturas recibidas del SII desde enero 2026 cargadas' } })
}

/** La factura de TPS del 21-09 (N° 774874) estaba cargada con folio "1" (el PDF no se leía bien): se retira la copia. Marca `duplicadoTPSRetirado`. */
export async function retirarDuplicadoTPS(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'duplicadoTPSRetirado' } })) return
  const buena = await prisma.documento.findFirst({ where: { folio: '774874' } })
  if (buena) {
    const mala = await prisma.documento.findFirst({ where: { proveedorId: buena.proveedorId, folio: '1', total: buena.total }, include: { aplicaciones: true } })
    if (mala) {
      for (const a of mala.aplicaciones) {
        await prisma.aplicacionPago.delete({ where: { id: a.id } })
        if ((await prisma.aplicacionPago.count({ where: { pagoId: a.pagoId } })) === 0) {
          await prisma.conciliacion.deleteMany({ where: { tipoDestino: 'PAGO', destinoId: a.pagoId } })
          await prisma.pago.delete({ where: { id: a.pagoId } })
        }
      }
      await prisma.documento.delete({ where: { id: mala.id } })
    }
  }
  await prisma.parametro.create({ data: { clave: 'duplicadoTPSRetirado', valor: '1', descripcion: 'Marca interna: factura duplicada de TPS retirada' } })
}
