// Definición de cada pantalla de maestros: qué tablas muestra y con qué columnas.
import { EVENTOS_HITO } from '@atacama/core'
import type { ConfigMaestro } from './Maestro'

export interface Pagina {
  id: string
  menu: string
  grupo: string
  principal: ConfigMaestro
  /** Tablas hijas, filtradas por la fila seleccionada en la principal. */
  detalles?: (ConfigMaestro & { campoPadre: string })[]
  /** Otras tablas independientes en la misma pantalla. */
  extras?: ConfigMaestro[]
}

const MONEDAS = ['CLP', 'USD', 'UF']
const DRIVERS = [
  'FIJO_MENSUAL', 'ANUAL_PRORRATEADO', 'ANUAL_MES', 'POR_CONTENEDOR', 'POR_KG', 'POR_TONELADA', 'POR_TON_MP', 'POR_CAMION', 'FIJO_MAS_CONTENEDOR',
]
const ESTADOS_EMBARQUE = ['PROYECTADO', 'CONFIRMADO', 'PRODUCIDO', 'EMBARCADO', 'LLEGADO', 'COBRADO']

export const PAGINAS: Pagina[] = [
  {
    id: 'clientes', menu: 'Clientes', grupo: 'Comercial',
    principal: {
      recurso: 'clientes', titulo: 'Clientes',
      ayuda: 'Selecciona un cliente para ver sus precios, escalas de descuento y forma de pago.',
      columnas: [
        { campo: 'nombre', titulo: 'Cliente', ancho: 240 },
        { campo: 'contacto', titulo: 'Contacto' },
        { campo: 'taxId', titulo: 'RUT / Tax ID' },
        { campo: 'pais', titulo: 'País' },
        { campo: 'destinoId', titulo: 'Puerto destino', tipo: 'ref', ref: 'destinos', refCampo: 'puerto' },
        { campo: 'moneda', titulo: 'Moneda', tipo: 'opcion', opciones: ['USD', 'CLP'], defecto: 'USD', ancho: 100 },
        { campo: 'kgPorContenedor', titulo: 'Kg/cont', tipo: 'entero', defecto: '20.000', ancho: 110 },
        { campo: 'incotermId', titulo: 'Incoterm', tipo: 'ref', ref: 'incoterms', refCampo: 'codigo', ancho: 110 },
        { campo: 'origenId', titulo: 'Origen MP', tipo: 'ref', ref: 'origenesMP', ancho: 120 },
        { campo: 'productoId', titulo: 'Producto', tipo: 'ref', ref: 'productos' },
        { campo: 'activo', titulo: 'Activo', tipo: 'bool', defecto: true, ancho: 90 },
        { campo: 'nota', titulo: 'Nota', ancho: 260 },
      ],
    },
    detalles: [
      {
        campoPadre: 'clienteId', recurso: 'precios', titulo: 'Precios (historial de vigencias)',
        columnas: [
          { campo: 'usdPorKg', titulo: 'US$/kg', tipo: 'decimal', decimales: 4 },
          { campo: 'desde', titulo: 'Desde', tipo: 'fecha' },
          { campo: 'hasta', titulo: 'Hasta', tipo: 'fecha' },
        ],
      },
      {
        campoPadre: 'clienteId', recurso: 'escalas', titulo: 'Escalas de descuento dentro de un pedido',
        columnas: [
          { campo: 'nContenedor', titulo: 'Desde el contenedor N°', tipo: 'entero' },
          { campo: 'pctDescuento', titulo: '% descuento', tipo: 'decimal' },
        ],
      },
      {
        campoPadre: 'clienteId', recurso: 'hitosPago', titulo: 'Forma de pago por hitos',
        ayuda: 'Los porcentajes deben sumar 100%.',
        columnas: [
          { campo: 'orden', titulo: 'Orden', tipo: 'entero', defecto: '1' },
          { campo: 'pct', titulo: '%', tipo: 'decimal' },
          { campo: 'evento', titulo: 'Evento gatillo', tipo: 'opcion', opciones: [...EVENTOS_HITO] },
          { campo: 'diasDesfase', titulo: 'Días de desfase', tipo: 'entero', defecto: '0' },
        ],
      },
    ],
  },
  {
    id: 'destinos', menu: 'Destinos y fletes', grupo: 'Comercial',
    principal: {
      recurso: 'destinos', titulo: 'Destinos',
      columnas: [
        { campo: 'puerto', titulo: 'Puerto' },
        { campo: 'pais', titulo: 'País' },
      ],
    },
    detalles: [
      {
        campoPadre: 'destinoId', recurso: 'tarifasFlete', titulo: 'Tarifas de flete marítimo',
        columnas: [
          { campo: 'usdPorCont', titulo: 'US$/contenedor', tipo: 'decimal' },
          { campo: 'navieraId', titulo: 'Naviera', tipo: 'ref', ref: 'proveedores' },
          { campo: 'desde', titulo: 'Desde', tipo: 'fecha' },
          { campo: 'hasta', titulo: 'Hasta', tipo: 'fecha' },
        ],
      },
    ],
  },
  {
    id: 'productos', menu: 'Productos e insumos', grupo: 'Producción',
    principal: {
      recurso: 'productos', titulo: 'Productos',
      ayuda: 'Crea un producto por cada combinación que vendas (por ejemplo "Sal sin yodo · Nuflow" y "Sal sin yodo · Dióxido de silicio") con Agregar. El antiaglomerante se elige del catálogo de más abajo, donde puedes agregar nuevos.',
      columnas: [
        { campo: 'nombre', titulo: 'Producto' },
        { campo: 'yodada', titulo: 'Yodada', tipo: 'bool', ancho: 100 },
        { campo: 'antiaglomeranteId', titulo: 'Antiaglomerante', tipo: 'ref', ref: 'insumos', refFiltro: { tipo: 'ANTIAGLOMERANTE' } },
        { campo: 'activo', titulo: 'Activo', tipo: 'bool', defecto: true, ancho: 100 },
      ],
    },
    extras: [
      {
        recurso: 'insumos', titulo: 'Antiaglomerantes', fijo: { tipo: 'ANTIAGLOMERANTE' },
        ayuda: 'Catálogo de antiaglomerantes. El costo del mes se calcula solo: valor unitario × unidades por tonelada (o kg, contenedor) × lo que se venda con ese antiaglomerante. Agrega los que uses (dióxido de silicio, Nuflow, harina de arroz...) y asígnalos a cada producto.',
        columnas: [
          { campo: 'nombre', titulo: 'Antiaglomerante', ancho: 280 },
          { campo: 'unidad', titulo: 'Unidad', defecto: 'kg', ancho: 100 },
          { campo: 'costoUnitario', titulo: 'Valor unitario neto ($)', tipo: 'decimal', decimales: 0 },
          { campo: 'base', titulo: 'Se consume por', tipo: 'opcion', opciones: ['POR_TONELADA', 'POR_KG', 'POR_CONTENEDOR', 'POR_CAMION'], defecto: 'POR_TONELADA', ancho: 170 },
          { campo: 'cantidadPorBase', titulo: 'Unidades por cada una', tipo: 'decimal', decimales: 4, ancho: 170 },
          { campo: 'afectoIVA', titulo: 'Afecto IVA', tipo: 'bool', defecto: true, ancho: 110 },
          { campo: 'proveedorId', titulo: 'Proveedor', tipo: 'ref', ref: 'proveedores' },
        ],
      },
      {
        recurso: 'insumos', titulo: 'Todos los insumos',
        ayuda: 'Cada insumo se calcula solo en el presupuesto y el flujo: valor unitario × unidades por cada tonelada (o kg, contenedor, camión) × lo que se venda ese mes. Ej.: Pallets, $20.766 por unidad, 1 por tonelada. El yodo solo cuenta en los productos yodados, y cada antiaglomerante solo en los productos que lo usan.',
        columnas: [
          { campo: 'nombre', titulo: 'Insumo' },
          { campo: 'tipo', titulo: 'Tipo', tipo: 'opcion', opciones: ['GENERAL', 'ANTIAGLOMERANTE', 'YODO'], defecto: 'GENERAL', ancho: 170 },
          { campo: 'unidad', titulo: 'Unidad', defecto: 'kg', ancho: 100 },
          { campo: 'costoUnitario', titulo: 'Valor unitario neto ($)', tipo: 'decimal', decimales: 0 },
          { campo: 'base', titulo: 'Se consume por', tipo: 'opcion', opciones: ['POR_TONELADA', 'POR_KG', 'POR_CONTENEDOR', 'POR_CAMION'], defecto: 'POR_TONELADA', ancho: 170 },
          { campo: 'cantidadPorBase', titulo: 'Unidades por cada una', tipo: 'decimal', decimales: 4, ancho: 170 },
          { campo: 'afectoIVA', titulo: 'Afecto IVA', tipo: 'bool', defecto: true, ancho: 110 },
          { campo: 'proveedorId', titulo: 'Proveedor', tipo: 'ref', ref: 'proveedores' },
        ],
      },
    ],
  },
  {
    id: 'mp', menu: 'Materia prima', grupo: 'Producción',
    principal: {
      recurso: 'origenesMP', titulo: 'Orígenes de materia prima',
      columnas: [
        { campo: 'nombre', titulo: 'Origen' },
        { campo: 'proveedorId', titulo: 'Proveedor', tipo: 'ref', ref: 'proveedores' },
        { campo: 'usdPorTon', titulo: 'US$/t', tipo: 'decimal' },
        { campo: 'fleteUsdPorTon', titulo: 'Flete US$/t', tipo: 'decimal', decimales: 4, defecto: '0' },
        { campo: 'nota', titulo: 'Nota', ancho: 320 },
      ],
    },
    extras: [
      {
        recurso: 'camionesMP', titulo: 'Camiones recibidos',
        ayuda: 'Cada camión es un lote con su propia merma. Si la merma queda vacía se usa la merma por defecto (parámetros).',
        columnas: [
          { campo: 'origenId', titulo: 'Origen', tipo: 'ref', ref: 'origenesMP' },
          { campo: 'fecha', titulo: 'Fecha', tipo: 'fecha' },
          { campo: 'guia', titulo: 'Guía / referencia' },
          { campo: 'toneladasFacturadas', titulo: 'T facturadas', tipo: 'decimal', decimales: 3, defecto: '28' },
          { campo: 'toneladasRecibidas', titulo: 'T recibidas', tipo: 'decimal', decimales: 3, defecto: '28' },
          { campo: 'mermaPct', titulo: 'Merma real %', tipo: 'decimal' },
          { campo: 'nota', titulo: 'Nota', ancho: 280 },
        ],
      },
    ],
  },
  {
    id: 'embarques', menu: 'Embarques en curso', grupo: 'Comercial',
    principal: {
      recurso: 'embarques', titulo: 'Embarques',
      ayuda: 'Un embarque por contenedor o pedido. Las fechas de los cobros salen de aquí: cada cobro se calcula con la fecha de su hito (OC, embarque, BL o llegada) más los días de la forma de pago del cliente. Si la llegada está vacía, se calcula con los días de tránsito del destino. Cuando tengas la fecha real, escríbela en la columna "real": manda sobre la estimada. Selecciona un embarque para ver sus cobros.',
      columnas: [
        { campo: 'clienteId', titulo: 'Cliente', tipo: 'ref', ref: 'clientes', ancho: 220 },
        { campo: 'nOC', titulo: 'N° OC', ancho: 100 },
        { campo: 'contenedores', titulo: 'Cont.', tipo: 'entero', defecto: '1', ancho: 80 },
        { campo: 'kgTotal', titulo: 'Kg', tipo: 'entero', ancho: 100 },
        { campo: 'usdPorKg', titulo: 'US$/kg', tipo: 'decimal', decimales: 4, ancho: 100 },
        { campo: 'totalUsdCent', titulo: 'Total US$', tipo: 'usd', ancho: 120 },
        { campo: 'incotermId', titulo: 'Incoterm', tipo: 'ref', ref: 'incoterms', refCampo: 'codigo', ancho: 100 },
        { campo: 'estado', titulo: 'Estado', tipo: 'opcion', opciones: ESTADOS_EMBARQUE, defecto: 'CONFIRMADO', ancho: 130 },
        { campo: 'fOCEst', titulo: 'OC (est.)', tipo: 'fecha', ancho: 115 },
        { campo: 'fETDEst', titulo: 'Embarque ETD (est.)', tipo: 'fecha', ancho: 150 },
        { campo: 'fETDReal', titulo: 'ETD real', tipo: 'fecha', ancho: 115 },
        { campo: 'fBLEst', titulo: 'BL (est.)', tipo: 'fecha', ancho: 115 },
        { campo: 'fBLReal', titulo: 'BL real', tipo: 'fecha', ancho: 115 },
        { campo: 'fETAEst', titulo: 'Llegada ETA (est.)', tipo: 'fecha', ancho: 150 },
        { campo: 'fETAReal', titulo: 'ETA real', tipo: 'fecha', ancho: 115 },
        { campo: 'nBL', titulo: 'N° BL', ancho: 120 },
        { campo: 'naviera', titulo: 'Naviera', ancho: 120 },
        { campo: 'nota', titulo: 'Nota', ancho: 420 },
      ],
    },
    detalles: [
      {
        campoPadre: 'embarqueId', recurso: 'hitosCobro', titulo: 'Cobros de este embarque',
        ayuda: 'Los días de atraso se suman a la fecha calculada. Un cobro en estado COBRADO ya no entra al flujo. La "fecha base" solo se usa si el embarque no tiene la fecha de ese hito.',
        columnas: [
          { campo: 'evento', titulo: 'Hito', tipo: 'opcion', opciones: [...EVENTOS_HITO] },
          { campo: 'pct', titulo: '%', tipo: 'decimal', ancho: 90 },
          { campo: 'montoUsdCent', titulo: 'Monto US$', tipo: 'usd' },
          { campo: 'fechaEsperada', titulo: 'Fecha base', tipo: 'fecha' },
          { campo: 'diasAtraso', titulo: 'Días de atraso', tipo: 'entero', defecto: '0' },
          { campo: 'estado', titulo: 'Estado', tipo: 'opcion', opciones: ['PENDIENTE', 'PARCIAL', 'COBRADO'], defecto: 'PENDIENTE' },
        ],
      },
    ],
  },
  {
    id: 'versiones', menu: 'Versiones y frecuencias', grupo: 'Presupuesto',
    principal: {
      recurso: 'versiones', titulo: 'Versiones de presupuesto',
      columnas: [
        { campo: 'nombre', titulo: 'Versión' },
        { campo: 'tcPresupuesto', titulo: 'TC presupuesto', tipo: 'decimal' },
        { campo: 'ufPresupuesto', titulo: 'UF', tipo: 'decimal' },
        { campo: 'mesInicio', titulo: 'Mes inicio', tipo: 'fecha' },
        { campo: 'mesFin', titulo: 'Mes fin', tipo: 'fecha' },
        { campo: 'nota', titulo: 'Nota' },
      ],
    },
    detalles: [
      {
        campoPadre: 'versionId', recurso: 'reglasFrecuencia', titulo: 'Reglas de frecuencia por cliente',
        columnas: [
          { campo: 'clienteId', titulo: 'Cliente', tipo: 'ref', ref: 'clientes' },
          { campo: 'contenedores', titulo: 'Contenedores', tipo: 'entero', defecto: '1' },
          { campo: 'cadaNMeses', titulo: 'Cada N meses', tipo: 'entero', defecto: '1' },
          { campo: 'desde', titulo: 'Desde', tipo: 'fecha' },
          { campo: 'hasta', titulo: 'Hasta', tipo: 'fecha' },
        ],
      },
      {
        campoPadre: 'versionId', recurso: 'gastos', titulo: 'Gastos presupuestados (drivers)',
        columnas: [
          { campo: 'nombre', titulo: 'Gasto', ancho: 280 },
          { campo: 'driver', titulo: 'Driver', tipo: 'opcion', opciones: DRIVERS, ancho: 190 },
          { campo: 'moneda', titulo: 'Moneda', tipo: 'opcion', opciones: MONEDAS, defecto: 'CLP', ancho: 100 },
          { campo: 'valorFijo', titulo: 'Valor fijo', tipo: 'decimal', porMoneda: true, defecto: '0', ancho: 130 },
          { campo: 'valorVariable', titulo: 'Valor variable', tipo: 'decimal', porMoneda: true, defecto: '0', ancho: 130 },
          { campo: 'mesEspecifico', titulo: 'Mes (1-12)', tipo: 'entero', ancho: 110 },
          { campo: 'tipoCostoId', titulo: 'Depende del incoterm', tipo: 'ref', ref: 'tiposCosto', ancho: 200 },
          { campo: 'cuentaId', titulo: 'Cuenta contable', tipo: 'ref', ref: 'cuentasContables', ancho: 200 },
          { campo: 'proveedorId', titulo: 'Proveedor', tipo: 'ref', ref: 'proveedores', ancho: 180 },
          { campo: 'afectoIVA', titulo: 'Afecto IVA', tipo: 'bool', defecto: true, ancho: 110 },
          { campo: 'soloFlujo', titulo: 'Solo flujo', tipo: 'bool', ancho: 110 },
          { campo: 'activo', titulo: 'Activo', tipo: 'bool', defecto: true, ancho: 100 },
          { campo: 'nota', titulo: 'Nota', ancho: 300 },
        ],
      },
    ],
  },
  {
    id: 'remuneraciones', menu: 'Remuneraciones', grupo: 'Presupuesto',
    principal: {
      recurso: 'empleados', titulo: 'Personal',
      columnas: [
        { campo: 'nombre', titulo: 'Nombre' },
        { campo: 'cargo', titulo: 'Cargo' },
        { campo: 'bruto', titulo: 'Bruto ($)', tipo: 'clp' },
        { campo: 'liquido', titulo: 'Líquido ($)', tipo: 'clp' },
        { campo: 'costoEmpresa', titulo: 'Costo empresa ($)', tipo: 'clp' },
        { campo: 'activo', titulo: 'Activo', tipo: 'bool', defecto: true, ancho: 100 },
      ],
    },
  },
  {
    id: 'proveedores', menu: 'Proveedores', grupo: 'Proveedores',
    principal: {
      recurso: 'proveedores', titulo: 'Proveedores',
      columnas: [
        { campo: 'nombre', titulo: 'Proveedor', ancho: 260 },
        { campo: 'rut', titulo: 'RUT' },
        { campo: 'giro', titulo: 'Giro' },
        { campo: 'tipo', titulo: 'Tipo', tipo: 'opcion', opciones: ['GENERAL', 'MP', 'ADUANA', 'NAVIERA', 'TRANSPORTE'], defecto: 'GENERAL', ancho: 130 },
        { campo: 'moneda', titulo: 'Moneda', tipo: 'opcion', opciones: ['CLP', 'USD'], defecto: 'CLP', ancho: 100 },
        { campo: 'diasPago', titulo: 'Días de pago', tipo: 'entero', defecto: '0', ancho: 120 },
        { campo: 'cuentaId', titulo: 'Cuenta contable', tipo: 'ref', ref: 'cuentasContables', ancho: 200 },
        { campo: 'banco', titulo: 'Banco' },
        { campo: 'cuentaBanco', titulo: 'N° cuenta' },
        { campo: 'activo', titulo: 'Activo', tipo: 'bool', defecto: true, ancho: 100 },
      ],
    },
  },
  {
    id: 'deudas', menu: 'Deudas y créditos', grupo: 'Proveedores',
    principal: {
      recurso: 'deudas', titulo: 'Deudas y créditos',
      ayuda: 'Los saldos están por completar. La tabla de cuotas se genera en la Fase 4.',
      columnas: [
        { campo: 'acreedor', titulo: 'Acreedor', ancho: 280 },
        { campo: 'proveedorId', titulo: 'Proveedor', tipo: 'ref', ref: 'proveedores' },
        { campo: 'moneda', titulo: 'Moneda', tipo: 'opcion', opciones: ['CLP', 'USD'], defecto: 'CLP', ancho: 100 },
        { campo: 'montoOriginal', titulo: 'Monto original', tipo: 'monto' },
        { campo: 'saldo', titulo: 'Saldo', tipo: 'monto' },
        { campo: 'cuota', titulo: 'Cuota mensual', tipo: 'monto' },
        { campo: 'tasa', titulo: 'Tasa %', tipo: 'decimal' },
        { campo: 'inicio', titulo: 'Inicio', tipo: 'fecha' },
        { campo: 'fin', titulo: 'Término', tipo: 'fecha' },
        { campo: 'nota', titulo: 'Nota' },
      ],
    },
  },
  {
    id: 'bancos', menu: 'Cuentas bancarias', grupo: 'Bancos',
    principal: {
      recurso: 'cuentasBancarias', titulo: 'Cuentas bancarias',
      ayuda: 'El saldo inicial va en la moneda de la cuenta: pesos sin decimales, dólares con decimales.',
      columnas: [
        { campo: 'nombre', titulo: 'Cuenta' },
        { campo: 'banco', titulo: 'Banco' },
        { campo: 'moneda', titulo: 'Moneda', tipo: 'opcion', opciones: ['CLP', 'USD'], ancho: 100 },
        { campo: 'numero', titulo: 'N° cuenta' },
        { campo: 'saldoInicial', titulo: 'Saldo inicial', tipo: 'monto', defecto: '0' },
        { campo: 'fechaSaldoInicial', titulo: 'Fecha saldo', tipo: 'fecha' },
      ],
    },
    extras: [
      {
        recurso: 'reglasCartola', titulo: 'Reglas automáticas de cartola',
        columnas: [
          { campo: 'patron', titulo: 'Texto en la glosa' },
          { campo: 'cuentaId', titulo: 'Cuenta contable', tipo: 'ref', ref: 'cuentasContables' },
          { campo: 'proveedorId', titulo: 'Proveedor', tipo: 'ref', ref: 'proveedores' },
          { campo: 'activa', titulo: 'Activa', tipo: 'bool', defecto: true, ancho: 100 },
        ],
      },
    ],
  },
  {
    id: 'cuentas', menu: 'Plan de cuentas', grupo: 'Configuración',
    principal: {
      recurso: 'cuentasContables', titulo: 'Plan de cuentas',
      columnas: [
        { campo: 'codigo', titulo: 'Código', ancho: 120 },
        { campo: 'nombre', titulo: 'Cuenta' },
        { campo: 'seccion', titulo: 'Sección del EERR', tipo: 'opcion', opciones: ['VENTAS', 'COSTO_VENTAS', 'GAV', 'NO_OPERACIONAL', 'SOLO_FLUJO'] },
        { campo: 'activa', titulo: 'Activa', tipo: 'bool', defecto: true, ancho: 100 },
      ],
    },
  },
  {
    id: 'indicadores', menu: 'Indicadores y parámetros', grupo: 'Configuración',
    principal: {
      recurso: 'indicadores', titulo: 'Indicadores (dólar observado y UF)',
      columnas: [
        { campo: 'tipo', titulo: 'Indicador', tipo: 'opcion', opciones: ['USD_OBS', 'UF'] },
        { campo: 'fecha', titulo: 'Fecha', tipo: 'fecha' },
        { campo: 'valor', titulo: 'Valor', tipo: 'decimal' },
      ],
    },
    extras: [
      {
        recurso: 'parametros', titulo: 'Parámetros',
        columnas: [
          { campo: 'clave', titulo: 'Parámetro', ancho: 220 },
          { campo: 'valor', titulo: 'Valor', ancho: 140 },
          { campo: 'descripcion', titulo: 'Descripción' },
        ],
      },
    ],
  },
]
