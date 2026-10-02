// Para la venta de octubre ya está comprada la materia prima: 2 camiones de SQM (pagados el 11 y el 25 de septiembre) y 1 de
// Albemarle (pagado el 29-09). Según el dueño, no se compra más para octubre. SQM queda con 1 camión de compra además del que
// ya está en planta; Albemarle pasa de 2 a 1 en octubre y se recalcula el mínimo de los meses siguientes.
// Se carga una sola vez (marca `mpOctubreCargada`).
import { planificarMP } from '@atacama/core'
import type { PrismaClient } from '@prisma/client'
import { cargarEntrada } from '../src/presupuesto'

export async function cargarMPDeOctubre(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'mpOctubreCargada' } })) return
  const version = await prisma.versionPresupuesto.findFirst({ orderBy: { id: 'asc' } })
  const albemarle = await prisma.origenMP.findFirst({ where: { nombre: 'Albemarle' } })
  const c = version && albemarle ? await cargarEntrada(version.id) : null
  if (version && albemarle && c) {
    const stock = (await prisma.camionMP.findMany({ where: { origenId: albemarle.id }, include: { consumos: true } }))
      .reduce((s, l) => s + Number(l.toneladasRecibidas) - l.consumos.reduce((x, k) => x + Number(k.toneladasMP), 0), 0)
    const stockMin = Number((await prisma.parametro.findUnique({ where: { clave: 'stockMinimoMPTon' } }))?.valor ?? 0)
    const plan = planificarMP(c.entrada, {}, { [albemarle.id]: stock }, stockMin).find((p) => p.origenId === albemarle.id)
    if (plan) {
      let s = stock
      for (let i = 0; i < plan.meses.length; i++) {
        let k = 0
        if (i === 0) k = 1 // octubre 2026: lo comprado
        else {
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
  await prisma.parametro.create({ data: { clave: 'mpOctubreCargada', valor: '1', descripcion: 'Marca interna: MP de octubre = 2 SQM + 1 Albemarle, mínimos recalculados' } })
}
