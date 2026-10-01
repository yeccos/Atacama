# Atacama Sea Salt: dudas y errores en el presupuesto y el flujo de caja

Estoy pasando el presupuesto ("PPTO A OCT 2026") y el flujo ("Flujo resumen 30 sep 2026") a una aplicación que calcula todo desde los mismos datos. Al revisar las planillas aparecieron las dudas de abajo. Puedes responder con el número de cada pregunta; si no sabes algo, dímelo y queda marcado como "por completar".

Las preguntas con ★ son las que más cambian los números.

---

## A. Clientes y ventas

1. ★ **DBC Ingredients: ¿el incoterm es FOB o CIF?** El presupuesto tiene cargado el flete a Nueva York (US$6.200 por contenedor) pero nunca lo aplica. Si es CIF, el flete lo paga Atacama y son unos $5,9 MM más de costo por contenedor.
2. **DBC: ¿cuándo y cómo paga?** El flujo supone el 100% el mismo mes del embarque (octubre y noviembre). ¿Es así, o hay anticipo o días de crédito?
3. ★ **WHS (México): ¿es CFR o CIF Manzanillo?** CIF incluye seguro de carga, que el presupuesto no considera en ningún lado.
4. **WHS: ¿cuándo llega el 20% final?** Mencionaste que a veces la aduana retiene parte. ¿Cuántos días suele demorar?
5. **Embarques de octubre:** ¿qué fechas esperamos de producción, embarque (ETD) y BL para WHS, NADARRA y DBC? El flujo supone cobro del saldo de NADARRA y del 50% de WHS en octubre, y el 20% de WHS en noviembre.
6. **Supreme Enterprises (India):** ¿a qué puerto, con qué forma de pago y con qué frecuencia esperamos venderle? ¿Se mantiene CIF?
7. Las filas "Otros Alb. Mex" y "Otros SQM Europa" están vacías: ¿son clientes futuros o las eliminamos?
8. El presupuesto mantiene precios, volúmenes y dólar (950) iguales hasta diciembre de 2030, sin inflación ni crecimiento: ¿lo dejamos así o armamos escenarios?
9. **Venta de dólares:** ¿con qué frecuencia se venden, en qué banco o casa de cambio, y con qué comisión?

## B. Materia prima

10. ★ **Albemarle, los $4,8 MM mensuales del flujo: ¿son deuda atrasada o compra corriente?** Una pista: 28 t × US$150 × 950 × 1,19 (IVA) = $4,75 MM, que calza con la compra de un camión al mes. Si es compra corriente, ¿en cuántos días se paga y es en dólares o pesos?
11. ★ **Flete de silvinita:** el flujo calcula 67 × 28.000 × 1,19. ¿Son 67 toneladas a $28.000, o un camión de 28 t a $67.000 la tonelada (el flete de US$70,5/t equivale a ≈ $67.000)? ¿Cuántos camiones se compran de verdad al mes? El presupuesto pone 3 en octubre y 1 por mes; el flujo, 1.
12. ★ **SQM para NADARRA:** el flujo no incluye la materia prima de los 2 contenedores de octubre (≈ 42 t × US$367 ≈ $14,7 MM). ¿Cómo se compra: camiones de 28 t? ¿Quién hace el flete y cuándo se paga?
13. **Stock inicial:** el presupuesto parte con 5 toneladas. ¿Es correcto, y de qué origen son?
14. **Merma:** usamos 5% por defecto, pero la app permite registrarla por camión. ¿Cómo se mide hoy (pesaje de entrada y de producto terminado)? ¿Es distinta entre Albemarle y SQM?
15. Los camiones son de 28 t y los contenedores de 16,5 t (USA) o 20 t: ¿el saldo que sobra de un camión se usa en el siguiente embarque? ¿Hay un tope de días que se puede guardar?

## C. Producción e insumos

16. ★ **¿Qué producto compra cada cliente?** ¿Yodada o no, y qué antiaglomerante lleva (dióxido de silicio u otro)? El costo cambia según la formulación.
17. ★ **Costo de insumos:** hoy hay un valor global de $35 por kg ("sal, etiquetas, dióxido, yodo"). ¿Cuánto es cada uno por tonelada de producto? Necesito: yodo, antiaglomerante, sacos, etiquetas.
18. **Sacos:** el flujo tiene 248 sacos × $3.000 = $744.000 aparte. ¿Están incluidos en los $35/kg o se suman?
19. **Pallets:** el presupuesto usa $20.766 y lo trata como "por tonelada", pero la celda dice "$/un". El flujo usa $14.450 por pallet × 40 + $60.000. ¿Cuánto cuesta cada pallet y cuántos lleva un contenedor?
20. **Grúa horquilla:** "4 × $20.000" por contenedor. ¿Qué es el 4 (horas, movimientos)?
21. **Petróleo:** el presupuesto usa $15/kg (≈ $300.000 por contenedor de 20 t); el flujo $240.000 × 4 = $960.000 al mes. ¿Cuál es el consumo real?
22. **Laboratorio, Mantención y Varios** (cada uno con $50.000 por contenedor más un fijo): ¿de dónde salen? "Varios" es $100.000 + $50.000 por contenedor en el presupuesto, pero $1.000.000 en el flujo. ¿Cuál es el real?
23. **Aduana y transporte a San Antonio/Valparaíso** ($450.000 cada uno por contenedor): ¿son iguales para todos los destinos y clientes? ¿Incluyen IVA? ¿Qué agencia y qué transportista usamos, y a cuántos días se les paga?
24. **Fletes marítimos:** ¿qué es el "+100" que se suma a cada flete (1.950+100, 2.600+100)? ¿Incluye el seguro? ¿Hay costos en destino? Para India, ¿puerto y tarifa?

## D. Remuneraciones

25. ★ El presupuesto suma 5 sueldos **brutos** ($11,1 MM) y el flujo paga **líquidos** ($9,4 MM) más imposiciones (≈ $2,0 MM). ¿Cuál es el **costo empresa** real de cada persona (con mutual, seguro de cesantía, etc.)?
26. El bruto del Director comercial es $1.000.000 / 0,8475, lo que parece boleta de honorarios (retención 15,25%), y el del Gerente general rinde un 89,5%. ¿Quién está con contrato y quién con honorarios? ¿A quién se le paga Previred?
27. **Operario(s):** la fila está vacía. ¿Cuántos son y cuánto ganan? ¿Hay turnos?
28. **Bono de descarga** de $35.000 por camión: ¿es líquido o bruto? (La planilla lo calcula como $43.750.) No estaba incluido en el presupuesto.
29. **Aguinaldos** de septiembre y diciembre: ¿monto por persona? El flujo tiene una línea "Imposiciones / aguinaldo / giftcard" de $2 MM por mes: ¿qué incluye exactamente?
30. **Seguro complementario de salud** ($129.000 al mes): está en el flujo pero no en el presupuesto. ¿Lo incluimos?
31. Confirmar nombre y cargo de cada persona: Manuel Errázuriz L. (gerente general), Manuel Errázuriz S. (director comercial), Daniela Ramírez (jefa de calidad), Elías Gamardo (jefe de producción), Gabriel Torres (jefe de turno), Miguel Ángel Gamardo (operario).

## E. Gastos fijos

32. ★ **IFS Food** ($4.000.000 al año): ¿en qué mes es la auditoría? Hoy no se carga en ningún mes. **Kosher** ($1.000.000): ¿se paga cada octubre?
33. ★ **Inversiones en equipos** ($1.000.000 al mes) y **pintura y techos** ($500.000 al mes): ¿se mantienen hasta 2030 o tienen un monto total o fecha de término? En el presupuesto no se sumaban al total.
34. **Arriendo de la bodega:** 55 UF + $400.000 en el presupuesto ($2.657.750) y $2.600.000 en el flujo. ¿Lleva IVA? ¿Se paga a principio o fin de mes? ¿Cuál es el valor de UF correcto?
35. **Contabilidad** (6 UF): el presupuesto da $246.300 (UF 41.050) y el flujo $243.000 (UF 40.500). ¿Con cuál nos quedamos?
36. **Muestras DHL:** $240.000 en el presupuesto, $150.000 en el flujo. **LinkedIn:** $75.000 vs $73.000.
37. **Retiro de escombros:** está como gasto anual ($1.000.000 prorrateado) y también en la lista de deudas. ¿Es lo mismo? Si no, ¿qué corresponde a cada uno?
38. **"C. Concha / C. Rojas"** ($5.000.000 en octubre) y **"Nuflow / F. Bambú / Imp. DAHAN"** (sin monto) aparecen en el flujo: ¿qué son y cuándo se pagan?

## F. Deudas y créditos

39. ★ **Bancoestado** (cuota de $1.200.000): ¿saldo, tasa y cuántas cuotas faltan? En el presupuesto la cuota corre hasta 2030, y en la lista de deudas dice "nov-dic".
40. ★ **Rossi** ($1.584.870 al mes) y **Servitral** ($1.339.322 al mes): ¿qué son y cuántas cuotas quedan? Hoy el flujo no tiene fecha de término.
41. **Saldos y condiciones** de: Transportes Mendoza, Albemarle (deuda atrasada), retiro de escombros, Nicolás Errázuriz, Versalles (pallets), Grúas SPV, Rosa Durán (balanza), Fenway (etiquetas), VSS Consultores (factura 1190), Registro FDA, CMR Manuel (BH Carlos), devolución préstamo Manuel. La planilla dice "valores con IVA": ¿es así para todos?
42. ¿"Nicolás Errázuriz", "CMR Manuel" y "Dev. préstamo Manuel" son tres deudas distintas o la misma? ¿Se pagan de una vez o en cuotas?

## G. Caja, IVA e impuestos

43. **Saldo inicial:** $10.102.270 en Bice "antes de los movimientos de la última semana". Con los pagos de esa semana ($15,4 MM) y el cobro del 30% de WHS ($6,4 MM), el flujo termina septiembre en $1.156.978. ¿Es correcto? ¿Hay saldo en la cuenta en dólares o en Bancoestado?
44. **Fechas del flujo:** las columnas son 30-sep, 31-oct y 1-nov. La tercera parece ser el 30 de noviembre; ¿confirmas?
45. ★ **IVA:** el flujo tiene "IVA el 19" (+$1,5 MM) y "Devolución IVA" (−$1,5 MM) que se anulan entre sí. ¿Qué es cada uno? ¿Cuánto IVA crédito se acumula de verdad al mes y cuántos días demora la devolución del exportador?
46. ★ **Impuesto a la renta:** ¿qué régimen tenemos (Pro Pyme general, transparente) y qué tasa debo usar en la provisión? ¿Se paga PPM mensual?
47. **Bancos y cartolas:** ¿qué cuentas usamos (Bice pesos, Bice dólares, Bancoestado, ¿otras?) y en qué formato se descargan las cartolas? Necesito un ejemplo de cada una.
48. **Usuarios:** ¿quiénes usarán la aplicación (gerente general, contabilidad) y qué debe poder hacer cada uno?

---

## Errores de las planillas que la aplicación ya corrige

1. "Inversiones en equipos" y "Pintura y mantención de techos" tenían signo positivo y quedaban fuera de la suma de egresos.
2. IFS Food y Kosher tenían un valor anual que nunca se cargaba en ningún mes.
3. El flete a Nueva York existía pero no se aplicaba a ninguna venta.
4. La fórmula de materia prima tomaba una celda de venta en vez de los kilos (`D8*D11`). Hoy da cero porque esa fila no tiene contenedores, pero fallaría al usarla.
5. El stock de MP restaba 20 t de consumo por contenedor el primer mes y 19 t los siguientes; el consumo correcto es kilos / (1 − merma), igual todos los meses.
6. El flujo no incluía los costos de exportación ni la materia prima de SQM de los contenedores de octubre.
7. Presupuesto y flujo usan cifras distintas para lo mismo ("Varios", petróleo, toneladas de silvinita, pallets, DHL, LinkedIn, contabilidad, arriendo).
8. La fórmula de "Varios" no incluye la fila "Otros Alb. Mex".
9. Los $50.000 por contenedor de Laboratorio, Mantención y Varios están escritos dentro de la fórmula, no en una celda editable.
10. NADARRA usa un precio promedio (1,453) todos los años, incluso cuando se embarca un solo contenedor (que debería ir a 1,49).
11. Las remuneraciones del presupuesto son sueldos brutos: sin costo empresa, sin operario, sin bono de descarga y sin aguinaldos.
12. El "Margen neto" mezcla caja y resultado (incluye la cuota del crédito y las inversiones) y no descuenta impuestos, seguro de carga ni comisiones de la venta de dólares.
13. La celda de pallets dice "$/un" pero la fórmula la usa por tonelada.
14. El flujo usa una UF de 40.500 y el presupuesto 41.050.
15. El seguro complementario de salud está en el flujo pero no en el presupuesto.
