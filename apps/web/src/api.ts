const CLAVE_TOKEN = 'atacama.token'

export const sesion = {
  get token() {
    return localStorage.getItem(CLAVE_TOKEN)
  },
  guardar(token: string) {
    localStorage.setItem(CLAVE_TOKEN, token)
  },
  cerrar() {
    localStorage.removeItem(CLAVE_TOKEN)
  },
}

export class ErrorApi extends Error {
  constructor(
    mensaje: string,
    public codigo: number,
  ) {
    super(mensaje)
  }
}

export async function api<T = any>(ruta: string, metodo = 'GET', cuerpo?: unknown): Promise<T> {
  const res = await fetch('/api' + ruta, {
    method: metodo,
    headers: {
      ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(sesion.token ? { Authorization: 'Bearer ' + sesion.token } : {}),
    },
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
  })
  const datos = await res.json().catch(() => ({}))
  if (res.status === 401 && ruta !== '/login') {
    sesion.cerrar()
    window.dispatchEvent(new Event('sesion-expirada'))
  }
  if (!res.ok) throw new ErrorApi(datos.error ?? 'Error ' + res.status, res.status)
  return datos
}
