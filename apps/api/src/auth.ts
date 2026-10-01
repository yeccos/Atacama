import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { prisma } from './db'

const HORAS_SESION = 12
const MAX_INTENTOS = 8
const MINUTOS_BLOQUEO = 15

export function hashClave(clave: string): string {
  const sal = randomBytes(16).toString('hex')
  return sal + ':' + scryptSync(clave, sal, 64).toString('hex')
}

export function verificarClave(clave: string, guardado: string): boolean {
  const [sal, hash] = guardado.split(':')
  if (!sal || !hash) return false
  const calculado = scryptSync(clave, sal, 64)
  const esperado = Buffer.from(hash, 'hex')
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado)
}

declare module 'fastify' {
  interface FastifyRequest {
    usuario: string
  }
}

function tokenDe(req: FastifyRequest): string | null {
  const h = req.headers.authorization
  return h?.startsWith('Bearer ') ? h.slice(7) : null
}

export function registrarAuth(app: FastifyInstance) {
  app.decorateRequest('usuario', '')

  // Freno a quien pruebe claves: tras 8 intentos fallidos, esa IP espera 15 minutos.
  const fallos = new Map<string, { n: number; hasta: number }>()

  app.post('/api/login', async (req, reply) => {
    const f = fallos.get(req.ip)
    if (f && f.hasta < Date.now()) fallos.delete(req.ip)
    else if (f && f.n >= MAX_INTENTOS) {
      return reply.code(429).send({ error: 'Demasiados intentos. Espera 15 minutos.' })
    }
    const { usuario, clave } = (req.body ?? {}) as { usuario?: string; clave?: string }
    const u = usuario ? await prisma.usuario.findUnique({ where: { usuario } }) : null
    if (!u || !u.activo || !clave || !verificarClave(clave, u.claveHash)) {
      const previo = fallos.get(req.ip)
      fallos.set(req.ip, { n: (previo?.n ?? 0) + 1, hasta: Date.now() + MINUTOS_BLOQUEO * 60_000 })
      return reply.code(401).send({ error: 'Usuario o clave incorrectos' })
    }
    fallos.delete(req.ip)
    const token = randomBytes(32).toString('hex')
    const expira = new Date(Date.now() + HORAS_SESION * 3600_000)
    await prisma.sesion.create({ data: { token, usuarioId: u.id, expira } })
    return { token, usuario: u.usuario, nombre: u.nombre }
  })

  app.post('/api/logout', async (req) => {
    const token = tokenDe(req)
    if (token) await prisma.sesion.deleteMany({ where: { token } })
    return { ok: true }
  })

  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/') || req.url === '/api/login') return
    const token = tokenDe(req)
    const sesion = token
      ? await prisma.sesion.findUnique({ where: { token }, include: { usuario: true } })
      : null
    if (!sesion || sesion.expira < new Date() || !sesion.usuario.activo) {
      return reply.code(401).send({ error: 'Sesión no válida o expirada' })
    }
    req.usuario = sesion.usuario.usuario
  })
}
