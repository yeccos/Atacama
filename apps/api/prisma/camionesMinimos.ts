// Ajusta los camiones de Albemarle al mínimo que evita quedar sin stock (antes era 1 por mes, como en el Excel).
// SQM no se toca. Se carga una sola vez (marca `camionesMinimosCargado`).
import { planificarMP } from '@atacama/core'
import type { PrismaClient } from '@prisma/client'
import { cargarEntrada } from '../src/presupuesto'

export async function ajustarCamionesMinimos(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'camionesMinimosCargado' } })) return
  const version = await prisma.versionPresupuesto.findFirst({ orderBy: { id: 'asc' } })
  const albemarle = await prisma.origenMP.findFirst({ where: { nombre: 'Albemarle' } })
  const c = version && albemarle ? await cargarEntrada(version.id) : null
  if (version && albemarle && c) {
    const stock: Record<number, number> = {}
    for (const l of await prisma.camionMP.findMany({ include: { consumos: true } })) {
      stock[l.origenId] = (stock[l.origenId] ?? 0) + Number(l.toneladasRecibidas) - l.consumos.reduce((s, x) => s + Number(x.toneladasMP), 0)
    }
    const stockMin = await prisma.parametro.findUnique({ where: { clave: 'stockMinimoMPTon' } })
    const plan = planificarMP(c.entrada, {}, stock, Number(stockMin?.valor ?? 0)).find((p) => p.origenId === albemarle.id)
    if (plan) {
      for (let i = 0; i < plan.meses.length; i++) {
        const mes = new Date(plan.meses[i] + '-01T00:00:00.000Z')
        await prisma.compraMPPlan.upsert({
          where: { versionId_origenId_mes: { versionId: version.id, origenId: albemarle.id, mes } },
          update: { camiones: plan.camionesSugeridos[i] },
          create: { versionId: version.id, origenId: albemarle.id, mes, camiones: plan.camionesSugeridos[i] },
        })
      }
    }
  }
  await prisma.parametro.create({ data: { clave: 'camionesMinimosCargado', valor: '1', descripcion: 'Marca interna: camiones de Albemarle ajustados al mínimo sugerido' } })
}
