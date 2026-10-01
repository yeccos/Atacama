// Datos incompletos o inconsistentes que la app debe avisar en vez de asumir.
import { validarHitos, validarRut } from '@atacama/core'
import type { FastifyInstance } from 'fastify'
import { prisma } from './db'

export interface Advertencia {
  modulo: string
  mensaje: string
}

export async function calcularAdvertencias(): Promise<Advertencia[]> {
  const out: Advertencia[] = []

  const clientes = await prisma.cliente.findMany({
    where: { activo: true },
    include: { hitos: true, precios: true },
  })
  for (const c of clientes) {
    if (!c.incotermId) {
      out.push({ modulo: 'Clientes', mensaje: `${c.nombre}: sin incoterm definido; no se le calculan costos de exportación.` })
    }
    if (c.hitos.length === 0) {
      out.push({ modulo: 'Clientes', mensaje: `${c.nombre}: sin forma de pago definida.` })
    } else {
      const v = validarHitos(c.hitos.map((h) => ({ pct: Number(h.pct) })))
      if (!v.ok) out.push({ modulo: 'Clientes', mensaje: `${c.nombre}: la forma de pago suma ${v.suma}% y debe sumar 100%.` })
    }
    if (c.precios.length === 0) out.push({ modulo: 'Clientes', mensaje: `${c.nombre}: sin precio vigente.` })
    if (!c.productoId) out.push({ modulo: 'Clientes', mensaje: `${c.nombre}: sin producto (formulación) asignado.` })
  }

  const gastos = await prisma.gastoDriver.findMany({ where: { activo: true }, include: { version: true } })
  for (const g of gastos) {
    if (g.driver === 'ANUAL_MES' && !g.mesEspecifico) {
      out.push({ modulo: 'Gastos', mensaje: `${g.nombre} (${g.version.nombre}): gasto anual activo sin mes asignado; no se carga en ningún mes.` })
    }
    if (!g.cuentaId) out.push({ modulo: 'Gastos', mensaje: `${g.nombre}: sin cuenta contable.` })
  }

  for (const d of await prisma.deuda.findMany()) {
    if (d.saldo === null) out.push({ modulo: 'Deudas', mensaje: `${d.acreedor}: saldo por completar.` })
  }

  for (const e of await prisma.empleado.findMany({ where: { activo: true } })) {
    if (e.bruto === null || e.liquido === null) {
      out.push({ modulo: 'Remuneraciones', mensaje: `${e.cargo} (${e.nombre}): sueldo por completar.` })
    }
  }

  for (const i of await prisma.insumo.findMany()) {
    if (i.costoUnitario === null) out.push({ modulo: 'Productos', mensaje: `Insumo ${i.nombre}: costo unitario por completar.` })
  }
  for (const p of await prisma.producto.findMany({ where: { activo: true }, include: { receta: true } })) {
    if (!p.antiaglomeranteId) out.push({ modulo: 'Productos', mensaje: `${p.nombre}: sin antiaglomerante definido.` })
    if (p.receta.length === 0) out.push({ modulo: 'Productos', mensaje: `${p.nombre}: sin receta de insumos.` })
  }

  for (const p of await prisma.proveedor.findMany({ where: { activo: true } })) {
    if (p.rut && p.moneda === 'CLP' && !validarRut(p.rut)) {
      out.push({ modulo: 'Proveedores', mensaje: `${p.nombre}: el RUT ${p.rut} no es válido.` })
    }
  }

  return out
}

export function registrarAdvertencias(app: FastifyInstance) {
  app.get('/api/advertencias', async () => calcularAdvertencias())
}
