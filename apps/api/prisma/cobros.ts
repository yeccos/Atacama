// Cobros de los embarques en curso: WHS (México) y NADARRA. Se carga una sola vez (marca `cobrosMexicoNadarraCargado`).
//  - "WHSP" y "WHS" son el mismo cliente (México).
//  - NADARRA compró 2 contenedores que se envían por separado: cada uno es un embarque con su 30% ya cobrado
//    y su 70% contra BL en la fecha de su propio BL.
//  - Las fechas de los cobros salen de las fechas del embarque (ETD/BL) y de los días de tránsito del destino.
import type { PrismaClient } from '@prisma/client'

const f = (iso: string) => new Date(iso + 'T00:00:00.000Z')

export async function ajustarCobrosMexicoNadarra(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'cobrosMexicoNadarraCargado' } })) return

  await prisma.partidaFlujo.updateMany({ where: { concepto: 'WHSP 30% (cobrado en septiembre)' }, data: { concepto: 'WHS 30% (cobrado en septiembre)' } })

  // WHS: el contenedor está en producción; el 30% ya se cobró, falta el 50% contra BL y el 20% a la llegada.
  const whs = await prisma.cliente.findFirst({ where: { nombre: { startsWith: 'WHS' } } })
  if (whs) {
    await prisma.embarque.updateMany({
      where: { clienteId: whs.id, versionId: null, nota: { contains: 'Factura US$22.540' } },
      data: { nota: 'Contenedor en producción. Factura US$22.540: 30% cobrado en septiembre, 50% contra BL y 20% a la llegada. Falta la fecha de embarque real.', estado: 'CONFIRMADO' },
    })
  }

  // NADARRA: un embarque por contenedor.
  const nadarra = await prisma.cliente.findFirst({ where: { nombre: 'NADARRA' } })
  const doble = nadarra && (await prisma.embarque.findFirst({ where: { clienteId: nadarra.id, versionId: null, contenedores: 2 }, include: { hitos: true } }))
  if (nadarra && doble) {
    await prisma.hitoCobro.deleteMany({ where: { embarqueId: doble.id } })
    // [US$/kg, total en centavos, 30% ya cobrado, 70% pendiente, ETD estimado]
    const contenedores: [number, number, number, number, string][] = [
      [1.49, 2980000, 894000, 2086000, '2026-10-05'],
      [1.4155, 2831000, 849300, 1981700, '2026-10-15'],
    ]
    for (const [i, [usdPorKg, total, cobrado, pendiente, etd]] of contenedores.entries()) {
      const datos = {
        clienteId: nadarra.id, productoId: doble.productoId, contenedores: 1, kgTotal: 20000, usdPorKg, totalUsdCent: total,
        incotermId: doble.incotermId, estado: 'CONFIRMADO', fETDEst: f(etd), fBLEst: f(etd),
        nota: `Contenedor ${i + 1} de 2 del pedido (US$${total / 100}). 30% cobrado; 70% contra BL. Fecha de embarque estimada: editar con la real.`,
      }
      const emb = i === 0 ? await prisma.embarque.update({ where: { id: doble.id }, data: datos }) : await prisma.embarque.create({ data: datos })
      await prisma.hitoCobro.create({ data: { embarqueId: emb.id, pct: 30, evento: 'OC', montoUsdCent: cobrado, fechaEsperada: f('2026-09-15'), estado: 'COBRADO' } })
      await prisma.hitoCobro.create({ data: { embarqueId: emb.id, pct: 70, evento: 'BL', montoUsdCent: pendiente, fechaEsperada: f(etd), estado: 'PENDIENTE' } })
    }
  }

  await prisma.parametro.create({
    data: { clave: 'cobrosMexicoNadarraCargado', valor: '1', descripcion: 'Marca interna: cobros de WHS y de los 2 contenedores de NADARRA ya cargados' },
  })
}
