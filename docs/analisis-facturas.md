# Análisis de 61 facturas recibidas (agosto y septiembre 2026)

Facturas de proveedores emitidas a Atacama Sea Salt SpA (RUT 76.927.694-7). De los 61 documentos, 59 son facturas (una es nota de crédito) y 2 son guías de despacho:

- La guía de Comercial Teca N° 80 repite la factura N° 243 (mismo monto, mismo día); se cuenta una sola vez.
- La guía de SQM N° 1395822 (27-09-2026) es una venta de **27,96 t de sal a $352.096 la tonelada**: $9.844.604 neto, $11.715.079 con IVA. Todavía no tiene factura; es un pago pendiente.

Los montos de abajo son netos (sin IVA) salvo que se diga lo contrario.

## 1. Proveedores creados

Se crearon o completaron **38 proveedores** (RUT validados, giro y cuenta contable). Los 10 que ya existían se completaron; hay 28 nuevos.

| Cuenta contable | Proveedores |
|---|---|
| 5100 Materia prima | SQM, Transportes Mendoza (flete de silvinita Albemarle), Albemarle |
| 5110 Insumos | Coisa (sacos), Rhodia Chile (Tixosil, antiaglomerante), Embalajes y Servicios Industriales (cartón y film), Fenway (etiquetas) |
| 5120 Pallets | Comercial Teca |
| 5130 Grúa | Marcos Zambón |
| 5140 Petróleo | Combustibles San Luis |
| 5200 Aduana | Rossi (agencia de aduanas) |
| 5210 Transporte a puerto | Servitral, Transportes Ríos |
| 5220 Flete marítimo | Italcargo |
| 5240 Gastos portuarios *(cuenta nueva)* | Medlog (gate out), Terminal Pacífico Sur, San Antonio Terminal |
| 6110 Arriendo | Inmobiliaria Covintec |
| 6120 Laboratorio | Eurofins |
| 6130 Mantención | Rosa Durán (balanza), Electricidad Gobantes, Emmanuela Menares, Transcapital (andamios) |
| 6140 Fumigaciones | Kronox |
| 6150 Contabilidad | VSS Consultores |
| 6170 Marketing y muestras | DHL, Comercial Fersas |
| 6180 / 6185 Seguros *(6185 nueva)* | Mapfre Vida, BCI Seguros |
| 6190 Retiro de escombros | Vivianna Rebolledo |
| 6200 Telefonía e internet *(cuenta nueva)* | Entel |
| 6900 Varios | Inversiones J.F., Distribuidora Jaque |
| 7100 Comisiones bancarias | Banco Bice |

**Lo que cambió de lo que yo había supuesto:**

- **Rossi** es la agencia de aduanas y **Servitral** es el transportista de contenedores. No son créditos: son proveedores operacionales, y el flujo del 30-09 les paga "cuotas" mensuales (ver pregunta 2).
- **Transportes Mendoza** es el flete de la silvinita de Albemarle, no el transporte al puerto. Pasó a la cuenta 5100 (materia prima); el transporte al puerto era de Servitral.
- **"Arriendo a Manuel"** se factura a nombre de **Inmobiliaria Covintec Limitada**; cambié el nombre del proveedor.
- El gasto "Grúa horquilla" apunta ahora a **Marcos Zambón** (los 3 arriendos facturados), no a Grúas SPV, que no aparece en ninguna factura.

## 2. Gastos recurrentes (agosto y septiembre)

| Gasto | Proveedor | Monto neto | Frecuencia | En el presupuesto |
|---|---|---|---|---|
| Arriendo bodega | Covintec | $2.246.464 y $2.248.420 | mensual (55 UF) | sí |
| Contabilidad | VSS | 5 UF = $204.415 | mensual | sí (como 6 UF) |
| Control de plagas | Kronox | $92.382 | mensual | sí (como $110.000) |
| Seguro de salud | Mapfre | $108.206 | mensual | sí (como $129.000) |
| Seguros generales | BCI | $54.740 | mensual (cuotas) | **no: agregado** |
| Telefonía móvil | Entel | $12.135 | mensual | **no: agregado** |
| Comisión por transferencias | Bice | $35.569 a $51.464 | mensual | sí ($50.000) |
| Análisis de laboratorio | Eurofins | $165.433 en agosto, $169.045 en septiembre | por embarque | sí |

**Por contenedor embarcado** (en agosto y septiembre salieron 4 contenedores: WHS, 2 de DBC y 1 de NADARRA):

| Costo | Proveedor | Real neto por contenedor | En el presupuesto |
|---|---|---|---|
| Honorarios y gastos de aduana | Rossi | $210.000 a $244.000 | $450.000 con IVA (junto con el gate out) |
| Gate out | Medlog | $154.000 | incluido en los $450.000 |
| Transporte Quilicura → puerto | Servitral | $472.000 a $587.000 | **$450.000 (queda corto)** |
| Pesaje y seguridad en el puerto (exento) | TPS / STI | ≈ $100.000 | **no estaba: agregado** |
| Petróleo | San Luis | $207.893 y $251.082 por entrega | $15 por kg ($300.000 en 20 t) |
| Arriendo de grúa horquilla | Zambón | $62.400 por servicio | $80.000 (4 × $20.000) |

**Fletes marítimos:** Italcargo cobró US$1.950 de flete y US$81 de seguro por un contenedor a México. El "+100" del presupuesto es el seguro, así que **WHS es CIF**.

**Compras sueltas** (no recurrentes; suman ≈ $0,7 MM en 2 meses y caben en "Mantención" y "Varios"): balanza, repuestos eléctricos, mantención del split, andamios, herramientas, agua, traslado de sal a Macul, retiro de excedentes ($150.000 por viaje) y 3 cuchillos grabados de regalo.

## 3. Insumos: valores unitarios netos

| Insumo | Valor | Proveedor | Falta |
|---|---|---|---|
| Sacos de tela laminada impresa 50×71 | **$248 por saco** | Coisa | cuántos por tonelada |
| Tixosil 38A (dióxido de silicio) | **$3.569,9 por kg** | Rhodia | kg por tonelada de sal |
| Pallet 100×120 | **$14.450 por pallet**, más $60.000 de despacho por pedido | Teca | ver sección 4 |
| Rollo de cartón 1,2 m | $36.400 | Embalajes y Servicios Industriales | rollos por contenedor |
| Rollo de film | $3.680 | Embalajes y Servicios Industriales | rollos por contenedor |
| Etiqueta 150×100 | $6.100 | Fenway | etiquetas por contenedor |
| Cera 74 (cinta de la etiquetadora) | $1.900 | Fenway | por contenedor |

**Corrección mía:** el insumo Sacos estaba cargado a $3.000. La planilla decía "248 × 3000", que son **3.000 sacos a $248**, no el revés. Ya quedó en $248.

El costo de estos insumos aún no entra al presupuesto, porque falta la cantidad por tonelada o por contenedor (el sistema avisa cuáles).

## 4. Hallazgo: varios valores del Excel incluyen IVA

El presupuesto debe estar en neto, pero estos valores del Excel coinciden con el total **con IVA** de las facturas:

| Línea | Excel | Factura neto | Factura con IVA |
|---|---|---|---|
| Fumigaciones | $110.000 | $92.382 | $109.935 |
| Contabilidad | 6 UF | 5 UF | 5,95 UF |
| Seguro de salud | $129.000 | $108.206 | $128.765 |
| Aduana + gate out | $450.000 | ≈ $376.000 | ≈ $447.000 |
| Pallet | $20.766 | $14.450 + despacho | ($14.450 + $3.000) × 1,19 = $20.766 |

Mientras el valor lleve IVA y la línea esté marcada como afecta, el presupuesto sobreestima el costo en 19% y el flujo cobra el IVA dos veces. **No lo cambié:** necesito tu OK para pasar estas líneas a neto (es lo que propongo).

## 5. Otros datos que salen de las facturas

- **UF:** $40.845 en agosto y $40.883 en septiembre; el presupuesto usa $41.050.
- **Dólar de aduana:** $935,57 en agosto y $925,25 en septiembre; el presupuesto usa $950.
- **Flete de silvinita:** $67 por kg por 27.520 kg (un camión): $1.843.840 neto. Confirma que el "67 × 28.000" del flujo es $67 por kg × 28.000 kg, no 67 toneladas.
- **DBC:** en agosto y septiembre no hay ninguna factura de flete a Nueva York. Es muy probable que DBC sea **FOB**.
- **Retiro de escombros:** $150.000 por viaje; el presupuesto tiene $1.000.000 al año (unos 6 viajes).
- **Embarques reales:** WHS el 11-08 (US$22.540), DBC el 14-08 (US$23.100), DBC y 1 contenedor de NADARRA el 30-09 (US$29.800, el primero con precio completo de 1,49).

## 6. Preguntas nuevas

1. ¿Cuáles de estas 61 facturas ya están pagadas? Con eso armo el saldo real por proveedor y las deudas actuales.
2. **Rossi y Servitral:** las "cuotas" del flujo ($1.584.870 y $1.339.322 al mes), ¿son pago de facturas atrasadas o el pago normal de cada embarque? Si es lo segundo, el flujo las cuenta dos veces (también están en el costo por contenedor).
3. ¿Cuántos sacos lleva una tonelada (¿25 kg?) y cuántos kilos de Tixosil, rollos de cartón, rollos de film y etiquetas se usan por contenedor?
4. ¿Confirmas pasar a neto las líneas de la sección 4 y usar los valores reales de las facturas (transporte $530.000 neto por contenedor, pallet $14.450 más despacho)?
5. **Gastos comunes de la bodega** ($400.000 al mes): no aparecen en las facturas de Covintec. ¿Se pagan aparte?
6. **DHL:** en septiembre hay $429.000 (casi todo exento) y el presupuesto tiene $240.000. ¿Cuántos envíos al mes?
7. ¿Qué son el traslado de sal a Macul (Saporiti) y los cuchillos grabados? ¿Marketing o venta?
8. Confirmar que **DBC es FOB** y **WHS es CIF**.
9. ¿A cuántos días se paga a cada proveedor? Las facturas no traen vencimiento.
