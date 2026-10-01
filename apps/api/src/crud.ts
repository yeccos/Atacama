// CRUD genérico para los maestros. Los campos y sus tipos se leen del esquema de Prisma,
// así cada tabla nueva queda disponible con solo agregarla a RECURSOS.
import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { prisma } from './db'

// nombre en la URL → modelo de Prisma
export const RECURSOS: Record<string, string> = {
  parametros: 'Parametro',
  indicadores: 'Indicador',
  cuentasContables: 'CuentaContable',
  incoterms: 'Incoterm',
  tiposCosto: 'TipoCosto',
  incotermCostos: 'IncotermCosto',
  origenesMP: 'OrigenMP',
  destinos: 'Destino',
  tarifasFlete: 'TarifaFlete',
  productos: 'Producto',
  insumos: 'Insumo',
  recetas: 'RecetaInsumo',
  clientes: 'Cliente',
  precios: 'PrecioCliente',
  escalas: 'EscalaDescuento',
  hitosPago: 'HitoPagoCliente',
  versiones: 'VersionPresupuesto',
  reglasFrecuencia: 'ReglaFrecuencia',
  gastos: 'GastoDriver',
  empleados: 'Empleado',
  comprasMP: 'CompraMPPlan',
  embarques: 'Embarque',
  camionesMP: 'CamionMP',
  proveedores: 'Proveedor',
  deudas: 'Deuda',
  cuotasDeuda: 'CuotaDeuda',
  cuentasBancarias: 'CuentaBancaria',
  reglasCartola: 'ReglaCartola',
}

type Campo = Prisma.DMMF.Field

function camposDe(modelo: string): Campo[] {
  const m = Prisma.dmmf.datamodel.models.find((x) => x.name === modelo)
  if (!m) throw new Error('Modelo desconocido: ' + modelo)
  return m.fields.filter((f) => f.kind === 'scalar')
}

class ErrorValidacion extends Error {}

function convertir(campo: Campo, valor: unknown): unknown {
  if (valor === '' || valor === undefined) valor = null
  if (valor === null) {
    if (campo.isRequired) throw new ErrorValidacion(`El campo "${campo.name}" es obligatorio`)
    return null
  }
  switch (campo.type) {
    case 'Int': {
      const n = Number(valor)
      if (!Number.isInteger(n)) throw new ErrorValidacion(`"${campo.name}" debe ser un número entero`)
      return n
    }
    case 'Decimal': {
      const n = Number(valor)
      if (!Number.isFinite(n)) throw new ErrorValidacion(`"${campo.name}" debe ser un número`)
      return new Prisma.Decimal(String(valor))
    }
    case 'Boolean':
      return valor === true || valor === 'true' || valor === 1
    case 'DateTime': {
      const f = new Date(String(valor).slice(0, 10) + 'T00:00:00.000Z')
      if (Number.isNaN(f.getTime())) throw new ErrorValidacion(`"${campo.name}" no es una fecha válida`)
      return f
    }
    default:
      return String(valor)
  }
}

/** Toma solo los campos editables del cuerpo y los convierte al tipo del esquema. */
function datos(modelo: string, cuerpo: Record<string, unknown>, parcial: boolean) {
  const out: Record<string, unknown> = {}
  for (const c of camposDe(modelo)) {
    if (c.isId) continue
    if (!(c.name in cuerpo)) {
      if (!parcial && c.isRequired && !c.hasDefaultValue) {
        throw new ErrorValidacion(`El campo "${c.name}" es obligatorio`)
      }
      continue
    }
    out[c.name] = convertir(c, cuerpo[c.name])
  }
  return out
}

function filtro(modelo: string, query: Record<string, unknown>) {
  const where: Record<string, unknown> = {}
  for (const c of camposDe(modelo)) {
    if (c.name in query) where[c.name] = convertir({ ...c, isRequired: false }, query[c.name])
  }
  return where
}

function mensajeError(e: unknown): { codigo: number; error: string } {
  if (e instanceof ErrorValidacion) return { codigo: 400, error: e.message }
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2002') return { codigo: 409, error: 'Ya existe un registro con esos datos' }
    if (e.code === 'P2003') return { codigo: 409, error: 'No se puede: hay registros asociados o la referencia no existe' }
    if (e.code === 'P2025') return { codigo: 404, error: 'El registro no existe' }
  }
  throw e
}

export async function auditar(
  usuario: string,
  entidad: string,
  entidadId: number | null,
  accion: 'CREAR' | 'MODIFICAR' | 'ELIMINAR',
  antes: unknown,
  despues: unknown,
) {
  await prisma.auditoria.create({
    data: {
      usuario,
      entidad,
      entidadId,
      accion,
      antes: antes ? JSON.stringify(antes) : null,
      despues: despues ? JSON.stringify(despues) : null,
    },
  })
}

export function registrarCrud(app: FastifyInstance) {
  const delegado = (recurso: string) => {
    const modelo = RECURSOS[recurso]
    if (!modelo) return null
    const nombre = modelo[0].toLowerCase() + modelo.slice(1)
    return { modelo, tabla: (prisma as any)[nombre] }
  }

  app.get('/api/r/:recurso', async (req, reply) => {
    const d = delegado((req.params as any).recurso)
    if (!d) return reply.code(404).send({ error: 'Recurso desconocido' })
    try {
      return await d.tabla.findMany({ where: filtro(d.modelo, req.query as any), orderBy: { id: 'asc' } })
    } catch (e) {
      const m = mensajeError(e)
      return reply.code(m.codigo).send({ error: m.error })
    }
  })

  app.post('/api/r/:recurso', async (req, reply) => {
    const d = delegado((req.params as any).recurso)
    if (!d) return reply.code(404).send({ error: 'Recurso desconocido' })
    try {
      const creado = await d.tabla.create({ data: datos(d.modelo, (req.body ?? {}) as any, false) })
      await auditar(req.usuario, d.modelo, creado.id, 'CREAR', null, creado)
      return creado
    } catch (e) {
      const m = mensajeError(e)
      return reply.code(m.codigo).send({ error: m.error })
    }
  })

  app.put('/api/r/:recurso/:id', async (req, reply) => {
    const { recurso, id } = req.params as any
    const d = delegado(recurso)
    if (!d) return reply.code(404).send({ error: 'Recurso desconocido' })
    try {
      const antes = await d.tabla.findUnique({ where: { id: Number(id) } })
      if (!antes) return reply.code(404).send({ error: 'El registro no existe' })
      const despues = await d.tabla.update({
        where: { id: Number(id) },
        data: datos(d.modelo, (req.body ?? {}) as any, true),
      })
      await auditar(req.usuario, d.modelo, despues.id, 'MODIFICAR', antes, despues)
      return despues
    } catch (e) {
      const m = mensajeError(e)
      return reply.code(m.codigo).send({ error: m.error })
    }
  })

  app.delete('/api/r/:recurso/:id', async (req, reply) => {
    const { recurso, id } = req.params as any
    const d = delegado(recurso)
    if (!d) return reply.code(404).send({ error: 'Recurso desconocido' })
    try {
      const antes = await d.tabla.delete({ where: { id: Number(id) } })
      await auditar(req.usuario, d.modelo, antes.id, 'ELIMINAR', antes, null)
      return { ok: true }
    } catch (e) {
      const m = mensajeError(e)
      return reply.code(m.codigo).send({ error: m.error })
    }
  })

  app.get('/api/auditoria', async (req) => {
    const { entidad } = req.query as { entidad?: string }
    return prisma.auditoria.findMany({
      where: entidad ? { entidad } : {},
      orderBy: { id: 'desc' },
      take: 500,
    })
  })

  // Respaldo completo en JSON (sin usuarios ni sesiones).
  app.get('/api/respaldo', async () => {
    const respaldo: Record<string, unknown> = { generado: new Date().toISOString() }
    for (const [recurso, modelo] of Object.entries(RECURSOS)) {
      const nombre = modelo[0].toLowerCase() + modelo.slice(1)
      respaldo[recurso] = await (prisma as any)[nombre].findMany({ orderBy: { id: 'asc' } })
    }
    return respaldo
  })
}
