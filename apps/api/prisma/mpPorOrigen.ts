// Materia prima por origen. Se carga una sola vez (marca `mpPorOrigenCargado`).
//  - El camión de SQM de la guía N° 1395822 (27-09-2026, 27,96 t) ya está en la planta: es stock inicial de SQM.
//  - Los camiones del Excel (3 en octubre 2026, 1 por mes, 2 en cada octubre con NADARRA) mezclaban los dos orígenes:
//    se reparten en Albemarle (2 en octubre 2026 y 1 por mes) y SQM (1 por octubre para NADARRA).
import { listaMeses } from '@atacama/core'
import type { PrismaClient } from '@prisma/client'

const f = (iso: string) => new Date(iso + 'T00:00:00.000Z')

export async function repartirMPPorOrigen(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'mpPorOrigenCargado' } })) return

  const sqm = await prisma.origenMP.findFirst({ where: { nombre: 'SQM' } })
  const albemarle = await prisma.origenMP.findFirst({ where: { nombre: 'Albemarle' } })
  const version = await prisma.versionPresupuesto.findFirst({ orderBy: { id: 'asc' } })

  if (sqm && !(await prisma.camionMP.findFirst({ where: { origenId: sqm.id, guia: { contains: '1395822' } } }))) {
    await prisma.camionMP.create({
      data: {
        origenId: sqm.id, fecha: f('2026-09-27'), guia: 'Guía de despacho 1395822', toneladasFacturadas: 27.96, toneladasRecibidas: 27.96,
        nota: 'Sal 27/15 a $352.096 por tonelada. Pagada. Falta la factura.',
      },
    })
  }

  // Solo se reparte si el plan todavía es el del Excel (3 camiones en octubre 2026).
  if (sqm && albemarle && version) {
    const oct26 = await prisma.compraMPPlan.findFirst({ where: { versionId: version.id, origenId: albemarle.id, mes: f('2026-10-01') } })
    if (oct26?.camiones === 3) {
      for (const mes of listaMeses('2026-10', '2030-12')) {
        const fecha = f(mes + '-01')
        const camionesAlbemarle = mes === '2026-10' ? 2 : 1
        await prisma.compraMPPlan.updateMany({ where: { versionId: version.id, origenId: albemarle.id, mes: fecha }, data: { camiones: camionesAlbemarle } })
        if (mes.endsWith('-10')) {
          const existe = await prisma.compraMPPlan.findFirst({ where: { versionId: version.id, origenId: sqm.id, mes: fecha } })
          if (!existe) await prisma.compraMPPlan.create({ data: { versionId: version.id, origenId: sqm.id, mes: fecha, camiones: 1 } })
        }
      }
    }
  }

  await prisma.parametro.create({ data: { clave: 'mpPorOrigenCargado', valor: '1', descripcion: 'Marca interna: camiones y stock de MP repartidos por origen' } })
  if (!(await prisma.parametro.findUnique({ where: { clave: 'stockMinimoMPTon' } }))) {
    await prisma.parametro.create({ data: { clave: 'stockMinimoMPTon', valor: '0', descripcion: 'Stock mínimo de seguridad de materia prima (t) para sugerir camiones' } })
  }
}
