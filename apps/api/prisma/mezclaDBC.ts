// El saldo de SQM que sobra al cierre de octubre (≈13,9 t) se usa en el contenedor de DBC Ingredients de octubre (que lleva 16,5 t de
// materia prima, normalmente de Albemarle): esas toneladas salen de SQM y el resto de Albemarle. Se puede cambiar o quitar en
// Materia prima → Mezcla de origen. Marca `mezclaDBCOctubreCargada`.
import { planificarMP } from '@atacama/core'
import type { PrismaClient } from '@prisma/client'
import { cargarEntrada } from '../src/presupuesto'

export async function cargarMezclaDBC(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'mezclaDBCOctubreCargada' } })) return
  const version = await prisma.versionPresupuesto.findFirst({ orderBy: { id: 'asc' } })
  const sqm = await prisma.origenMP.findFirst({ where: { nombre: 'SQM' } })
  const c = version && sqm ? await cargarEntrada(version.id) : null
  if (version && sqm && c) {
    const dbc = c.entrada.clientes.find((x) => /DBC/i.test(x.nombre) && !x.soloOrigen && x.origenId !== sqm.id)
    if (dbc) {
      const stock: Record<number, number> = {}
      for (const l of await prisma.camionMP.findMany({ include: { consumos: true } })) {
        stock[l.origenId] = (stock[l.origenId] ?? 0) + Number(l.toneladasRecibidas) - l.consumos.reduce((s, x) => s + Number(x.toneladasMP), 0)
      }
      const compras: Record<number, number[]> = {}
      for (const x of await prisma.compraMPPlan.findMany({ where: { versionId: version.id } })) {
        const i = c.entrada.meses.indexOf(x.mes.toISOString().slice(0, 7))
        if (i >= 0) (compras[x.origenId] ??= c.entrada.meses.map(() => 0))[i] += x.camiones
      }
      const plan = planificarMP(c.entrada, compras, stock, 0).find((p) => p.origenId === sqm.id)
      const excedente = plan ? plan.stockFinalT[0] : 0
      const tonPorCont = (dbc.kgPorCont / 1000) / (1 - c.entrada.mermaPct / 100)
      const contenedoresMes = c.entrada.contenedores[dbc.id]?.[0] ?? 0
      const k = Math.min(Math.max(0, excedente) / tonPorCont, contenedoresMes)
      if (k > 0) {
        const mes = new Date(c.entrada.meses[0] + '-01T00:00:00.000Z')
        await prisma.mezclaOrigen.upsert({
          where: { versionId_clienteId_origenId_mes: { versionId: version.id, clienteId: dbc.id, origenId: sqm.id, mes } },
          update: { contenedores: Math.round(k * 10000) / 10000 },
          create: { versionId: version.id, clienteId: dbc.id, origenId: sqm.id, mes, contenedores: Math.round(k * 10000) / 10000 },
        })
      }
    }
  }
  await prisma.parametro.create({ data: { clave: 'mezclaDBCOctubreCargada', valor: '1', descripcion: 'Marca interna: contenedor de DBC de octubre con el saldo de SQM' } })
}
