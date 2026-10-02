import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import fastifyStatic from '@fastify/static'
import Fastify from 'fastify'
import { registrarAdvertencias } from './advertencias'
import { registrarAuth } from './auth'
import { registrarBancos } from './bancos'
import { registrarDocumentos } from './documentos'
import { registrarRespaldos } from './respaldos'
import { registrarCrud } from './crud'
import { registrarPresupuesto } from './presupuesto'

const produccion = process.env.NODE_ENV === 'production'

// trustProxy: en producción la app queda detrás del proxy del hosting, y el límite de
// intentos de login necesita la IP real del visitante.
const app = Fastify({ logger: { level: 'warn' }, trustProxy: produccion })

registrarAuth(app)
registrarCrud(app)
registrarAdvertencias(app)
registrarPresupuesto(app)
registrarBancos(app)
registrarDocumentos(app)
registrarRespaldos(app)

// En producción el mismo servidor entrega la web ya compilada (apps/web/dist).
const web = fileURLToPath(new URL('../../web/dist', import.meta.url))
if (existsSync(web)) {
  app.register(fastifyStatic, { root: web })
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'No existe' })
    return reply.sendFile('index.html')
  })
}

// En desarrollo se usa API_PORT (PORT lo ocupa la vista previa de la web); el hosting define PORT.
const puerto = Number(process.env.API_PORT ?? (produccion ? process.env.PORT : undefined) ?? 4000)
app.listen({ port: puerto, host: produccion ? '0.0.0.0' : '127.0.0.1' }).then(() => {
  console.log(`API Atacama escuchando en el puerto ${puerto}`)
})

// Railway solo redespliega si cambian archivos de apps/api: los cambios solo de la web necesitan tocar un archivo de la API.
// (redespliegue: plan de MP sin la tabla de mezcla)
// (redespliegue: ventas alineadas con el plan de MP)
// redeploy: sitio responsive
