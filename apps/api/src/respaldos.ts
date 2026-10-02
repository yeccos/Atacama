// Respaldos automáticos de la base: una copia completa por día (los últimos 14) y una por mes (los últimos 12),
// guardadas en una carpeta "respaldos" junto a la base. Se pueden crear a mano y descargar desde Configuración → Respaldos.
// Ojo: viven en el mismo disco que la base; para estar a salvo de una pérdida del disco hay que descargarlos de vez en cuando.
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, createReadStream } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { prisma } from './db'

const DIARIOS = 14
const MENSUALES = 12

function carpeta() {
  if (process.env.RESPALDOS_DIR) return process.env.RESPALDOS_DIR
  const ruta = (process.env.DATABASE_URL ?? '').replace(/^file:/, '')
  const dir = isAbsolute(ruta) ? join(dirname(ruta), 'respaldos') : resolve(process.cwd(), 'respaldos')
  return dir
}

const nombreDe = (d: Date, hora = false) => `atacama-${d.toISOString().slice(0, hora ? 16 : 10).replace(/[:T]/g, (c) => (c === 'T' ? '_' : '-'))}.db`

export async function crearRespaldo(manual = false) {
  const dir = carpeta()
  mkdirSync(dir, { recursive: true })
  const archivo = join(dir, nombreDe(new Date(), manual))
  if (existsSync(archivo)) {
    if (!manual) return archivo
    unlinkSync(archivo)
  }
  // VACUUM INTO deja una copia consistente aunque la base esté en uso.
  await prisma.$executeRawUnsafe(`VACUUM INTO '${archivo.replace(/'/g, "''")}'`)
  limpiar()
  return archivo
}

/** Deja los últimos 14 respaldos diarios y el primero de cada uno de los últimos 12 meses; los manuales no se borran. */
function limpiar() {
  const dir = carpeta()
  const diarios = readdirSync(dir).filter((f) => /^atacama-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort()
  const aConservar = new Set(diarios.slice(-DIARIOS))
  const porMes = new Map<string, string>()
  for (const f of diarios) if (!porMes.has(f.slice(8, 15))) porMes.set(f.slice(8, 15), f)
  for (const f of [...porMes.values()].slice(-MENSUALES)) aConservar.add(f)
  for (const f of diarios) if (!aConservar.has(f)) unlinkSync(join(dir, f))
}

export function listarRespaldos() {
  const dir = carpeta()
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => /^atacama-.*\.db$/.test(f))
    .map((f) => ({ nombre: f, bytes: statSync(join(dir, f)).size, fecha: statSync(join(dir, f)).mtime.toISOString() }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
}

export function registrarRespaldos(app: FastifyInstance) {
  app.get('/api/respaldos', async () => ({ respaldos: listarRespaldos() }))

  app.post('/api/respaldos', async (req) => {
    const archivo = await crearRespaldo(true)
    return { ok: true, archivo: basename(archivo) }
  })

  app.get('/api/respaldos/:nombre', async (req, reply) => {
    const nombre = (req.params as any).nombre as string
    if (!/^atacama-[\d_-]+\.db$/.test(nombre)) return reply.code(400).send({ error: 'Nombre no válido' })
    const archivo = join(carpeta(), nombre)
    if (!existsSync(archivo)) return reply.code(404).send({ error: 'No existe' })
    reply.header('Content-Type', 'application/octet-stream').header('Content-Disposition', `attachment; filename="${nombre}"`)
    return reply.send(createReadStream(archivo))
  })

  // Una copia al arrancar y luego se revisa cada hora: la primera de cada día queda como respaldo diario.
  const tarea = () => crearRespaldo(false).catch((e) => console.error('No se pudo respaldar la base:', e.message))
  setTimeout(tarea, 15_000)
  setInterval(tarea, 3_600_000).unref()
}
