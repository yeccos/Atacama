import { describe, expect, it } from 'vitest'
import { clasificarMovimiento, contraparteDe } from './index'

const PROV = [{ id: 1, nombre: 'Servitral' }, { id: 2, nombre: 'Albemarle' }, { id: 3, nombre: 'SQM Industrial' }]

describe('cartola bancaria', () => {
  it('lee la contraparte aunque la glosa venga cortada', () => {
    expect(contraparteDe('Transf. a terceros vía Internet a cuenta 68780691 B.Santande, SERVITRAL LTDA, Rut 76.392.448-3, el 30-09-2026 a las 17:41:22')).toBe('SERVITRAL LTDA')
    expect(contraparteDe('Transf. via Internet a cuenta 10562974 B.BCI SQM INDUST RIAL S.A., 0799471000, desde ATACAMA SEA SALT SPA')).toBe('SQM INDUST RIAL S.A.')
  })
  it('clasifica proveedores y movimientos del banco', () => {
    expect(clasificarMovimiento('cuenta 72997620 B.Santande, ALBEMARLE LTDA, Rut 85.066.600-8, el 29-09', 4595631, 0, PROV))
      .toMatchObject({ categoria: 'Materia prima', proveedorId: 2 })
    expect(clasificarMovimiento('cuenta 10562974 B.BCI SQM INDUST RIAL S.A., 0799471000, desde ATACAMA', 11460127, 0, PROV))
      .toMatchObject({ categoria: 'Materia prima', proveedorId: 3 })
    expect(clasificarMovimiento('Venta en MX por operación de compra/venta autorizada vía BiceMX', 0, 16247556, PROV).categoria).toBe('Venta de dólares (BiceMX)')
    expect(clasificarMovimiento('Pago Previsional Nro 247271220, via INTERNET', 1505889, 0, PROV).categoria).toBe('Previred')
    expect(clasificarMovimiento('Abono por Transferencia via CCA, originador Rut: 60805000-0 Nombre: TESORERIA GENERA', 0, 2115144, PROV).categoria).toBe('Devolución de IVA (Tesorería)')
    expect(clasificarMovimiento('cuenta 1 B.Santande, Persona X, Rut 1-9', 100, 0, PROV).categoria).toBeNull()
  })
})
