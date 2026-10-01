// Datos de la Fase 2 (presupuesto y flujo). Se carga una sola vez, tanto en una base nueva como en una
// que ya existía: la marca `fase2Cargada` evita pisar lo que el usuario haya editado después.
import { listaMeses } from '@atacama/core'
import type { PrismaClient } from '@prisma/client'

const f = (iso: string) => new Date(iso + 'T00:00:00.000Z')

export async function completarFase2(prisma: PrismaClient) {
  if (await prisma.parametro.findUnique({ where: { clave: 'fase2Cargada' } })) return

  // ── Parámetros del flujo ──
  const parametros: [string, string, string][] = [
    ['previredMensual', '2000000', 'Imposiciones (Previred) que se pagan cada mes (CLP). Del flujo al 30-09-2026'],
    ['mesesCuotaSinFin', '12', 'Meses que se proyecta una cuota de deuda que no tiene fecha de término'],
    ['devolucionIVAModo', 'fijo', 'fijo = devolución mensual fija (parámetro devolucionIVAMensual); calculado = IVA crédito del mes anterior'],
    ['rezagoIVAMeses', '1', 'Meses entre la compra y la devolución de IVA, en modo calculado'],
    ['diaETD', '15', 'Día del mes en que se supone el embarque (ETD) de los contenedores proyectados'],
    ['diasOCAntesETD', '30', 'Días entre la orden de compra y el embarque, en embarques proyectados'],
    ['diasProduccionAntesETD', '7', 'Días entre la producción y el embarque, en embarques proyectados'],
  ]
  for (const [clave, valor, descripcion] of parametros) {
    if (!(await prisma.parametro.findUnique({ where: { clave } }))) {
      await prisma.parametro.create({ data: { clave, valor, descripcion } })
    }
  }

  // ── Días de tránsito por destino ──
  for (const [puerto, dias] of [['New York', 15], ['Manzanillo', 20], ['Hamburgo', 30], ['India (puerto por definir)', 35]] as const) {
    await prisma.destino.updateMany({ where: { puerto }, data: { diasTransito: dias } })
  }

  const version = await prisma.versionPresupuesto.findFirst({ where: { nombre: 'PPTO oct-2026' } })
  if (version) {
    // ── Cómo se comportaba cada línea en el Excel original ──
    await prisma.gastoDriver.updateMany({ where: { versionId: version.id, nombre: 'Seguro complementario de salud' }, data: { modoExcel: 'NO_EXISTE' } })
    for (const nombre of ['Inversiones en equipos', 'Pintura y mantención de techos']) {
      await prisma.gastoDriver.updateMany({ where: { versionId: version.id, nombre }, data: { modoExcel: 'FUERA_DE_TOTAL' } })
    }
    const bancoestado = await prisma.deuda.findFirst({ where: { acreedor: 'Bancoestado' } })
    if (bancoestado) {
      await prisma.gastoDriver.updateMany({ where: { versionId: version.id, nombre: 'Cuota Bancoestado' }, data: { deudaId: bancoestado.id } })
    }

    // ── NADARRA: octubre 2026 son 2 contenedores (pedido en curso); desde 2027, 1 por año ──
    const nadarra = await prisma.cliente.findFirst({ where: { nombre: 'NADARRA' } })
    if (nadarra) {
      const regla = await prisma.reglaFrecuencia.findFirst({ where: { versionId: version.id, clienteId: nadarra.id } })
      if (regla) {
        await prisma.reglaFrecuencia.update({ where: { id: regla.id }, data: { desde: f('2027-10-01') } })
      }
      await prisma.reglaFrecuencia.create({
        data: { versionId: version.id, clienteId: nadarra.id, contenedores: 2, cadaNMeses: 12, desde: f('2026-10-01'), hasta: f('2026-10-01') },
      })
    }

    // ── Camiones de MP del Excel: 3 en oct-2026, 1 por mes, 2 en cada octubre con NADARRA ──
    const albemarle = await prisma.origenMP.findFirst({ where: { nombre: 'Albemarle' } })
    if (albemarle) {
      for (const mes of listaMeses('2026-10', '2030-12')) {
        const camiones = mes === '2026-10' ? 3 : mes.endsWith('-10') ? 2 : 1
        await prisma.compraMPPlan.create({ data: { versionId: version.id, origenId: albemarle.id, mes: f(mes + '-01'), camiones } })
      }
    }
  }

  // ── Embarques en curso: fechas e hitos de cobro (flujo al 30-09-2026) ──
  type H = [number, string, string, number, string]
  const embarques: [string, number, H[]][] = [
    ['WHS Process / Global Supply Mexico', 2254000, [
      [30, 'OC', '2026-09-30', 676200, 'COBRADO'],
      [50, 'BL', '2026-10-15', 1127000, 'PENDIENTE'],
      [20, 'ETA', '2026-11-15', 450800, 'PENDIENTE'],
    ]],
    ['NADARRA', 5811000, [
      [30, 'OC', '2026-09-15', 1743300, 'COBRADO'],
      [70, 'BL', '2026-10-15', 4067700, 'PENDIENTE'],
    ]],
    ['DBC Ingredients', 2310000, [[100, 'ETD', '2026-10-15', 2310000, 'PENDIENTE']]],
  ]
  for (const [cliente, , hitos] of embarques) {
    const c = await prisma.cliente.findFirst({ where: { nombre: cliente } })
    const emb = c && (await prisma.embarque.findFirst({ where: { clienteId: c.id, versionId: null }, include: { hitos: true } }))
    if (!emb || emb.hitos.length) continue
    await prisma.embarque.update({ where: { id: emb.id }, data: { fETDEst: f('2026-10-15') } })
    for (const [pct, evento, fecha, monto, estado] of hitos) {
      await prisma.hitoCobro.create({ data: { embarqueId: emb.id, pct, evento, montoUsdCent: monto, fechaEsperada: f(fecha), estado } })
    }
  }

  // ── Partidas manuales: última semana de septiembre y un pago único de octubre ──
  const partidas: [string, string, number, string?][] = [
    ['2026-09-30', 'Rossi', -1584870],
    ['2026-09-30', 'Servitral', -1339322],
    ['2026-09-30', 'Sueldos de septiembre', -9400000],
    ['2026-09-30', 'Arriendo a Manuel', -2600000],
    ['2026-09-30', 'Contabilidad', -243000],
    ['2026-09-30', 'Seguro complementario de salud', -129000],
    ['2026-09-30', 'LinkedIn', -73000],
    ['2026-09-30', 'WHSP 30% (cobrado en septiembre)', 6423900],
    ['2026-10-31', 'C. Concha / C. Rojas', -5000000, 'Aparece en el flujo del 30-09-2026 sin detalle: por confirmar'],
  ]
  for (const [fecha, concepto, monto, nota] of partidas) {
    await prisma.partidaFlujo.create({ data: { fecha: f(fecha), concepto, monto, nota: nota ?? 'Del flujo al 30-09-2026' } })
  }

  await prisma.parametro.create({ data: { clave: 'fase2Cargada', valor: '1', descripcion: 'Marca interna: datos de la Fase 2 ya cargados' } })
}
