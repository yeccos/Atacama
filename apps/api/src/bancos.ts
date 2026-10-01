// Cartolas: importar movimientos, clasificarlos y resumirlos. El saldo de la última cartola importada pasa a ser
// el saldo con que parte el flujo de caja.
import { claveMovimiento, clasificarMovimiento, type MovimientoCartola } from '@atacama/core'
import type { FastifyInstance } from 'fastify'
import { auditar } from './crud'
import { prisma } from './db'

const iso = (d: Date) => d.toISOString().slice(0, 10)

/** Lo que la clasificación necesita saber de la empresa: proveedores, personal y las reglas que el usuario fue dejando. */
async function contextoClasificacion() {
  const proveedores = await prisma.proveedor.findMany({ select: { id: true, nombre: true } })
  const empleados = (await prisma.empleado.findMany({ where: { activo: true } })).map((e) => ({ nombre: e.nombre, liquido: e.liquido, desde: e.fechaIngreso ? iso(e.fechaIngreso) : null }))
  const reglas = (await prisma.reglaCartola.findMany({ where: { activa: true, categoria: { not: null } } })).map((r) => ({ patron: r.patron, categoria: r.categoria!, proveedorId: r.proveedorId }))
  return { proveedores, empleados, reglas }
}

interface MovimientoEntrada extends MovimientoCartola {
  saldo?: number | null
}

export function registrarBancos(app: FastifyInstance) {
  app.post('/api/bancos/:cuentaId/importar', async (req, reply) => {
    const cuentaId = Number((req.params as any).cuentaId)
    const { movimientos, saldoFinal, fechaFinal } = (req.body ?? {}) as { movimientos?: MovimientoEntrada[]; saldoFinal?: number; fechaFinal?: string }
    const cuenta = await prisma.cuentaBancaria.findUnique({ where: { id: cuentaId } })
    if (!cuenta) return reply.code(404).send({ error: 'La cuenta no existe' })
    if (!Array.isArray(movimientos) || movimientos.length === 0) return reply.code(400).send({ error: 'No hay movimientos para importar' })
    for (const m of movimientos) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(m.fecha) || !Number.isInteger(m.cargo) || !Number.isInteger(m.abono) || m.cargo < 0 || m.abono < 0) {
        return reply.code(400).send({ error: `Movimiento no válido: ${JSON.stringify(m).slice(0, 120)}` })
      }
    }
    const { proveedores, empleados, reglas } = await contextoClasificacion()
    const existentes = new Set((await prisma.movimientoBanco.findMany({ where: { cuentaId }, select: { hash: true } })).map((x) => x.hash))
    const ordinales = new Map<string, number>()
    let nuevos = 0
    let duplicados = 0
    for (const m of movimientos) {
      const base = claveMovimiento(m, 0)
      const k = (ordinales.get(base) ?? 0) + 1
      ordinales.set(base, k)
      const hash = claveMovimiento(m, k)
      if (existentes.has(hash)) {
        duplicados++
        continue
      }
      const c = clasificarMovimiento(m.glosa, m.cargo, m.abono, proveedores, empleados, reglas, m.fecha)
      await prisma.movimientoBanco.create({
        data: {
          cuentaId, fecha: new Date(m.fecha + 'T00:00:00.000Z'), glosa: m.glosa, nDoc: m.nDoc || null, cargo: m.cargo, abono: m.abono,
          saldo: m.saldo ?? null, hash, contraparte: c.contraparte, categoria: c.categoria, proveedorId: c.proveedorId,
        },
      })
      nuevos++
    }
    // El saldo de la cartola más reciente es el saldo con que parte el flujo.
    if (Number.isInteger(saldoFinal) && fechaFinal && /^\d{4}-\d{2}-\d{2}$/.test(fechaFinal)) {
      const fecha = new Date(fechaFinal + 'T00:00:00.000Z')
      if (!cuenta.fechaSaldoInicial || fecha >= cuenta.fechaSaldoInicial) {
        const despues = await prisma.cuentaBancaria.update({ where: { id: cuentaId }, data: { saldoInicial: saldoFinal!, fechaSaldoInicial: fecha } })
        await auditar(req.usuario, 'CuentaBancaria', cuentaId, 'MODIFICAR', cuenta, despues)
      }
    }
    return { nuevos, duplicados }
  })

  // Volver a clasificar con las reglas de hoy: solo lo que no tiene categoría o la tiene puesta por la propia app.
  app.post('/api/bancos/reclasificar', async (req) => {
    const { proveedores, empleados, reglas } = await contextoClasificacion()
    const AUTOMATICAS = ['Remuneraciones', 'Reembolsos de personal', 'Devolución de préstamos']
    const movs = await prisma.movimientoBanco.findMany({ where: { OR: [{ categoria: null }, { categoria: { in: AUTOMATICAS } }] } })
    let cambiados = 0
    for (const m of movs) {
      const c = clasificarMovimiento(m.glosa, m.cargo, m.abono, proveedores, empleados, reglas, iso(m.fecha))
      if (c.categoria !== m.categoria || (c.proveedorId && c.proveedorId !== m.proveedorId)) {
        await prisma.movimientoBanco.update({ where: { id: m.id }, data: { categoria: c.categoria, proveedorId: c.proveedorId ?? m.proveedorId } })
        cambiados++
      }
    }
    await auditar(req.usuario, 'MovimientoBanco', null, 'MODIFICAR', null, { reclasificados: cambiados })
    return { cambiados }
  })

  // Clasificar de una vez todos los movimientos de una contraparte (la que viene en la glosa, o el proveedor ya reconocido).
  app.post('/api/bancos/:cuentaId/clasificar', async (req, reply) => {
    const cuentaId = Number((req.params as any).cuentaId)
    const { contraparte, proveedorActualId, categoria, proveedorId } = (req.body ?? {}) as { contraparte?: string; proveedorActualId?: number | null; categoria?: string | null; proveedorId?: number | null }
    if (!contraparte && !proveedorActualId) return reply.code(400).send({ error: 'Falta la contraparte' })
    const where = proveedorActualId ? { cuentaId, proveedorId: proveedorActualId } : { cuentaId, contraparte: contraparte === 'Sin contraparte' ? null : contraparte, cargo: { gt: 0 } }
    const data: Record<string, unknown> = {}
    if (categoria !== undefined) data.categoria = categoria || null
    if (proveedorId !== undefined) {
      data.proveedorId = proveedorId || null
    }
    const r = await prisma.movimientoBanco.updateMany({ where, data })
    if (proveedorId && categoria === undefined) {
      await prisma.movimientoBanco.updateMany({ where: { cuentaId, proveedorId, categoria: null }, data: { categoria: 'Proveedores' } })
    }
    await auditar(req.usuario, 'MovimientoBanco', null, 'MODIFICAR', null, { where, data, n: r.count })
    return { actualizados: r.count }
  })

  // Aplicar la clasificación de un movimiento a todos los de la misma contraparte que aún no tienen una.
  app.post('/api/bancos/movimientos/:id/aplicar-similares', async (req, reply) => {
    const m = await prisma.movimientoBanco.findUnique({ where: { id: Number((req.params as any).id) } })
    if (!m || !m.contraparte) return reply.code(400).send({ error: 'El movimiento no tiene contraparte' })
    const r = await prisma.movimientoBanco.updateMany({
      where: { cuentaId: m.cuentaId, contraparte: m.contraparte, categoria: null, id: { not: m.id } },
      data: { categoria: m.categoria, proveedorId: m.proveedorId },
    })
    return { actualizados: r.count }
  })

  app.get('/api/bancos/:cuentaId/resumen', async (req, reply) => {
    const cuentaId = Number((req.params as any).cuentaId)
    const cuenta = await prisma.cuentaBancaria.findUnique({ where: { id: cuentaId } })
    if (!cuenta) return reply.code(404).send({ error: 'La cuenta no existe' })
    const movs = await prisma.movimientoBanco.findMany({ where: { cuentaId }, orderBy: [{ fecha: 'asc' }, { id: 'asc' }] })
    const proveedores = new Map((await prisma.proveedor.findMany({ select: { id: true, nombre: true } })).map((p) => [p.id, p.nombre]))

    const meses: Record<string, { mes: string; ingresos: number; egresos: number }> = {}
    const categorias: Record<string, { categoria: string; n: number; ingresos: number; egresos: number }> = {}
    const pagos: Record<string, { clave: string; nombre: string; proveedorId: number | null; contraparte: string | null; categoria: string | null; n: number; total: number; primero: string; ultimo: string; ultimoMonto: number }> = {}
    for (const m of movs) {
      const mes = iso(m.fecha).slice(0, 7)
      const a = (meses[mes] ??= { mes, ingresos: 0, egresos: 0 })
      a.ingresos += m.abono
      a.egresos += m.cargo
      const cat = m.categoria ?? 'Sin clasificar'
      const c = (categorias[cat] ??= { categoria: cat, n: 0, ingresos: 0, egresos: 0 })
      c.n++
      c.ingresos += m.abono
      c.egresos += m.cargo
      if (m.cargo > 0) {
        const nombre = (m.proveedorId ? proveedores.get(m.proveedorId) : null) ?? m.contraparte ?? 'Sin contraparte'
        const clave = m.proveedorId ? 'p' + m.proveedorId : 'c' + nombre
        const p = (pagos[clave] ??= { clave, nombre, proveedorId: m.proveedorId, contraparte: m.contraparte, categoria: m.categoria, n: 0, total: 0, primero: iso(m.fecha), ultimo: iso(m.fecha), ultimoMonto: 0 })
        p.n++
        p.total += m.cargo
        p.ultimo = iso(m.fecha)
        p.ultimoMonto = m.cargo
        p.categoria = m.categoria
      }
    }
    const ultima = movs.at(-1)
    return {
      cuenta: { id: cuenta.id, nombre: cuenta.nombre, banco: cuenta.banco, numero: cuenta.numero, moneda: cuenta.moneda },
      saldoActual: cuenta.saldoInicial,
      fechaSaldo: cuenta.fechaSaldoInicial ? iso(cuenta.fechaSaldoInicial) : null,
      desde: movs[0] ? iso(movs[0].fecha) : null,
      hasta: ultima ? iso(ultima.fecha) : null,
      nMovimientos: movs.length,
      sinClasificar: movs.filter((m) => !m.categoria).length,
      meses: Object.values(meses),
      categorias: Object.values(categorias).sort((a, b) => b.egresos + b.ingresos - (a.egresos + a.ingresos)),
      pagos: Object.values(pagos).sort((a, b) => b.total - a.total),
    }
  })
}
