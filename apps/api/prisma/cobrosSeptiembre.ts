// Los cobros de septiembre ya hechos aparecen en su recuadro del flujo (en lugar de una partida suelta):
//  - WHS, 30% a la OC: US$6.762 el 30-09 (cartola en dólares).
//  - NADARRA, 30% a la OC de sus 2 contenedores: US$17.433 el 11-09, vendidos ese día por $16.247.556 (cartola en pesos).
// Se carga una sola vez (marca `cobrosSeptiembreCargados`).
import type { PrismaClient } from '@prisma/client'

const f = (iso: string) => new Date(iso + 'T00:00:00.000Z')

export async function cargarCobrosDeSeptiembre(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'cobrosSeptiembreCargados' } })) return
  await prisma.partidaFlujo.deleteMany({ where: { concepto: 'WHS 30% (cobrado en septiembre)' } })

  const hitos = await prisma.hitoCobro.findMany({ where: { evento: 'OC', estado: 'COBRADO' }, include: { embarque: { include: { cliente: true } } }, orderBy: { id: 'asc' } })
  const whs = hitos.filter((h) => h.embarque.cliente.nombre.startsWith('WHS'))
  for (const h of whs) await prisma.hitoCobro.update({ where: { id: h.id }, data: { fechaCobro: f('2026-09-30') } })

  const nad = hitos.filter((h) => h.embarque.cliente.nombre === 'NADARRA')
  const totalUsd = nad.reduce((s, h) => s + h.montoUsdCent, 0)
  const clpTotal = 16247556
  let asignado = 0
  for (let i = 0; i < nad.length; i++) {
    const clp = i === nad.length - 1 ? clpTotal - asignado : Math.round((clpTotal * nad[i].montoUsdCent) / totalUsd)
    asignado += clp
    await prisma.hitoCobro.update({ where: { id: nad[i].id }, data: { fechaCobro: f('2026-09-11'), clpRecibido: clp } })
  }
  await prisma.parametro.create({ data: { clave: 'cobrosSeptiembreCargados', valor: '1', descripcion: 'Marca interna: cobros del 30% de WHS y NADARRA en septiembre' } })
}
