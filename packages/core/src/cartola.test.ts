import { describe, expect, it } from 'vitest'
import { clasificarMovimiento, contraparteDe, esEmpleado } from './index'

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

describe('pagos a empleados', () => {
  const EMP = [
    { nombre: 'Manuel Errázuriz L.', liquido: 5035027 },
    { nombre: 'Manuel Errázuriz S.', liquido: 1000000 },
    { nombre: 'Daniela Ramírez', liquido: 1228147 },
  ]
  it('distingue a padre e hijo por la inicial del segundo apellido', () => {
    expect(clasificarMovimiento('cuenta 1 B.Falabell, MANUEL JOSE ERRAZURIZ LAGOS, Rut 7.160.740-2, el 01-09', 5052486, 0, [], EMP).categoria).toBe('Remuneraciones')
    expect(clasificarMovimiento('cuenta 1 B.Falabell, MANUEL JOSE ERRAZURIZ SAAVEDRA, Rut 16.942.086-6, el 30-09', 1000000, 0, [], EMP).categoria).toBe('Remuneraciones')
    expect(esEmpleado('MANUEL JOSE ERRAZURIZ SAAVEDRA', EMP[0])).toBe(false)
    expect(esEmpleado('MANUEL JOSE ERRAZURIZ LAGOS', EMP[1])).toBe(false)
  })
  it('lo chico es reembolso, lo grande es sueldo', () => {
    expect(clasificarMovimiento('cuenta 1 B.Santande, DANIELA RAMIREZ Z, Rut 15.566.009-0, el 15-09', 29300, 0, [], EMP).categoria).toBe('Reembolsos de personal')
    expect(clasificarMovimiento('cuenta 1 B.Santande, DANIELA RAMIREZ Z, Rut 15.566.009-0, el 30-09', 1244714, 0, [], EMP).categoria).toBe('Remuneraciones')
  })
})

describe('criterios del dueño', () => {
  const EMP = [
    { nombre: 'Manuel Errázuriz L.', liquido: 5035027 },
    { nombre: 'Manuel Errázuriz S.', liquido: 1000000, desde: '2026-09-01' },
  ]
  const glosaL = 'cuenta 1 B.Falabell, MANUEL JOSE ERRAZURIZ LAGOS, Rut 7.160.740-2, el 01-09'
  const glosaS = 'cuenta 1 B.Falabell, MANUEL JOSE ERRAZURIZ SAAVEDRA, Rut 16.942.086-6, el 01-04'
  it('desde $3 millones es sueldo, bajo eso reembolso', () => {
    expect(clasificarMovimiento(glosaL, 3000000, 0, [], EMP).categoria).toBe('Remuneraciones')
    expect(clasificarMovimiento(glosaL, 2707980, 0, [], EMP).categoria).toBe('Reembolsos de personal')
  })
  it('antes de su fecha de ingreso, lo pagado a un empleado es devolución de préstamo', () => {
    expect(clasificarMovimiento(glosaS, 2000000, 0, [], EMP, [], '2026-04-01').categoria).toBe('Devolución de préstamos')
    expect(clasificarMovimiento(glosaS, 1000000, 0, [], EMP, [], '2026-09-30').categoria).toBe('Remuneraciones')
  })
  it('las reglas del usuario ganan y toleran espacios sueltos en la glosa', () => {
    const reglas = [{ patron: 'MARIA EUGENIA ERRAZURIZ', categoria: 'Devolución de préstamos' }]
    expect(clasificarMovimiento('cuenta 9 B.Estado, MARIA EUGENIA ERRAZURIZ LAGOS, Rut 3-1', 1000000, 0, [], [], reglas).categoria).toBe('Devolución de préstamos')
    expect(clasificarMovimiento('cuenta 9 B.Estado, MARIA EU GENIA ERRAZURIZ LAGOS, Rut 3-1', 1000000, 0, [], [], reglas).categoria).toBe('Devolución de préstamos')
  })
})
