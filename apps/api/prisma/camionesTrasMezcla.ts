// Con la mezcla de DBC en octubre (13,9 t de SQM) cambia lo que consume Albemarle: se recalculan los camiones mínimos de los meses
// siguientes con el stock real (33 t) para no comprar de más. Octubre queda sin compras. Marca `camionesTrasMezclaCargado`.
import { planificarMP } from '@atacama/core'
import type { PrismaClient } from '@prisma/client'
import { cargarEntrada } from '../src/presupuesto'

export async function recalcularCamionesTrasMezcla(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'camionesTrasMezclaCargado' } })) return
  const version = await prisma.versionPresupuesto.findFirst({ orderBy: { id: 'asc' } })
  const albemarle = await prisma.origenMP.findFirst({ where: { nombre: 'Albemarle' } })
  const c = version && albemarle ? await cargarEntrada(version.id) : null
  if (version && albemarle && c) {
    const stock: Record<number, number> = {}
    for (const l of await prisma.camionMP.findMany({ include: { consumos: true } })) {
      stock[l.origenId] = (stock[l.origenId] ?? 0) + Number(l.toneladasRecibidas) - l.consumos.reduce((s, x) => s + Number(x.toneladasMP), 0)
    }
    const stockMin = Number((await prisma.parametro.findUnique({ where: { clave: 'stockMinimoMPTon' } }))?.valor ?? 0)
    const plan = planificarMP(c.entrada, {}, stock, stockMin).find((p) => p.origenId === albemarle.id)
    if (plan) {
      let s = stock[albemarle.id] ?? 0
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
  await prisma.parametro.create({ data: { clave: 'camionesTrasMezclaCargado', valor: '1', descripcion: 'Marca interna: camiones de Albemarle recalculados tras la mezcla de DBC' } })
}
