// Guarda en cada factura recibida sus líneas de detalle (leídas de los PDF), para mostrar la factura en pantalla sin depender
// de subir los archivos. Se carga una sola vez (marca `lineasFacturasCargado`); calza por RUT del emisor y N° de factura.
import type { PrismaClient } from '@prisma/client'
import { LINEAS_FACTURAS } from './facturasLineas'

const digitos = (r: string | null) => (r ?? '').replace(/[^0-9kK]/g, '').toUpperCase()

export async function cargarLineasFacturas(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'lineasFacturasCargado' } })) return
  const docs = await prisma.documento.findMany({ include: { proveedor: true } })
  for (const d of docs) {
    const folio = d.folio.replace(/^0+/, '')
    const clave = Object.keys(LINEAS_FACTURAS).find((k) => {
      const [rut, f] = k.split('|')
      return f === folio && (!d.proveedor.rut || digitos(d.proveedor.rut).slice(0, 7) === rut.slice(0, 7))
    })
    if (clave) await prisma.documento.update({ where: { id: d.id }, data: { lineas: JSON.stringify(LINEAS_FACTURAS[clave].slice(0, 40)) } })
  }
  await prisma.parametro.create({ data: { clave: 'lineasFacturasCargado', valor: '1', descripcion: 'Marca interna: líneas de detalle de las facturas cargadas' } })
}
