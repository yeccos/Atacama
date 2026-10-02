// La materia prima de la venta de octubre se compró en septiembre: 2 camiones de SQM (pagos del 11-09 y 25-09; facturas 92866 y
// 92867) y 1 de Albemarle (pago del 29-09, factura 8749), además de las 5 t que ya había. En octubre no se compra más.
// Se registran los camiones comprados como stock, el plan de octubre queda en 0 camiones y los meses siguientes se recalculan.
// El IVA crédito de esas compras queda en septiembre (se devuelve en octubre). Marca `mpSeptiembreRegistrada`.
import { planificarMP } from '@atacama/core'
import type { PrismaClient } from '@prisma/client'
import { cargarEntrada } from '../src/presupuesto'

const f = (iso: string) => new Date(iso + 'T00:00:00.000Z')

export async function registrarMPDeSeptiembre(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'mpSeptiembreRegistrada' } })) return
  const version = await prisma.versionPresupuesto.findFirst({ orderBy: { id: 'asc' } })
  const sqm = await prisma.origenMP.findFirst({ where: { nombre: 'SQM' } })
  const albemarle = await prisma.origenMP.findFirst({ where: { nombre: 'Albemarle' } })
  if (!version || !sqm || !albemarle) return

  const docSqm = async (folio: string) => (await prisma.documento.findFirst({ where: { folio, proveedorId: sqm.proveedorId ?? -1 } }))?.id ?? null
  // El camión que ya está en planta corresponde a la factura 92867 (pago del 25-09).
  await prisma.camionMP.updateMany({ where: { origenId: sqm.id, guia: { contains: '1395822' } }, data: { documentoId: await docSqm('92867'), nota: 'Sal 27/15, 27,96 t. Factura 92867, pagada el 25-09 (US$ ≈ $11,8 MM).' } })
  await prisma.camionMP.create({
    data: {
      origenId: sqm.id, fecha: f('2026-09-30'), guia: 'Factura 92866', toneladasFacturadas: 28, toneladasRecibidas: 28, documentoId: await docSqm('92866'),
      nota: 'Comprado y pagado en septiembre (OC 47, pago del 11-09 por $11.460.127). Toneladas nominales: verificar con la guía.',
    },
  })
  await prisma.camionMP.create({
    data: {
      origenId: albemarle.id, fecha: f('2026-09-29'), guia: 'Fac 8749', toneladasFacturadas: 28, toneladasRecibidas: 28,
      nota: 'Comprado y pagado en septiembre (pago del 29-09 por $4.595.631). Toneladas nominales: verificar con la guía.',
    },
  })

  // Plan: octubre sin compras; Albemarle se recalcula para los meses siguientes con el stock nuevo (5 t + 28 t).
  const octubre = f('2026-10-01')
  await prisma.compraMPPlan.updateMany({ where: { versionId: version.id, origenId: sqm.id, mes: octubre }, data: { camiones: 0 } })
  const c = await cargarEntrada(version.id)
  if (c) {
    const stockDe = async (origenId: number) =>
      (await prisma.camionMP.findMany({ where: { origenId }, include: { consumos: true } })).reduce((s, l) => s + Number(l.toneladasRecibidas) - l.consumos.reduce((x, k) => x + Number(k.toneladasMP), 0), 0)
    const stock = await stockDe(albemarle.id)
    const stockMin = Number((await prisma.parametro.findUnique({ where: { clave: 'stockMinimoMPTon' } }))?.valor ?? 0)
    const plan = planificarMP(c.entrada, {}, { [albemarle.id]: stock, [sqm.id]: await stockDe(sqm.id) }, stockMin).find((p) => p.origenId === albemarle.id)
    if (plan) {
      let s = stock
      for (let i = 0; i < plan.meses.length; i++) {
        let k = 0
        if (i > 0) {
          const falta = stockMin + plan.consumoT[i] - s
          k = plan.consumoT[i] > 0 && falta > 1e-9 ? Math.ceil(falta / c.entrada.tonPorCamion - 1e-9) : 0
        }
        s = s + c.entrada.tonPorCamion * k - plan.consumoT[i]
        const mes = new Date(plan.meses[i] + '-01T00:00:00.000Z')
        await prisma.compraMPPlan.upsert({
          where: { versionId_origenId_mes: { versionId: version.id, origenId: albemarle.id, mes } },
          update: { camiones: k },
          create: { versionId: version.id, origenId: albemarle.id, mes, camiones: k },
        })
      }
    }
  }

  // IVA crédito de lo comprado en septiembre (el IVA va incluido en lo pagado): se devuelve en octubre.
  const iva = (total: number) => total - Math.round(total / 1.19)
  const ivaSept = iva(11456022) + iva(11792270) + iva(4595631)
  await prisma.periodoIVA.upsert({ where: { mes: f('2026-09-01') }, update: { ivaCredito: ivaSept }, create: { mes: f('2026-09-01'), ivaCredito: ivaSept } })
  await prisma.parametro.create({ data: { clave: 'mpSeptiembreRegistrada', valor: '1', descripcion: 'Marca interna: MP comprada en septiembre registrada como stock; octubre sin compras' } })
}
