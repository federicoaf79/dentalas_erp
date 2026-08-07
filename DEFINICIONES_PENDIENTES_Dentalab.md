# Definiciones pendientes — Dentalab-Compras
**31 de julio de 2026**

Este documento tiene dos partes: lo que necesitamos **de Aris** (decisiones y datos comerciales) y lo que necesitamos **de Ivana** (detalle de la operación diaria). Al final, una nota sobre qué queda pendiente por nuestro lado, que no depende de estas respuestas.

---

# PARTE 1 — PARA ARIS

## 🔴 A. Condiciones comerciales por proveedor (lo más bloqueante)

YiQi no tiene cargadas las condiciones comerciales (verificamos: el campo de plazo de pago viene vacío casi siempre y la entidad de información de proveedor no responde). Necesitamos cargarlas en nuestro sistema.

Sin el **mínimo de compra** no podemos avisar cuando un pedido no llega al mínimo del proveedor, que era una de las dos condiciones que definimos para las órdenes provisorias.

Para cada proveedor con el que trabajan habitualmente:

| Dato | Ejemplo |
|---|---|
| Mínimo de compra | $150.000 o 20 unidades |
| Plazo de pago | 30 días / contado / 60 días |
| Descuento por volumen | 5% a partir de $500.000 |
| Días de entrega habituales | 3 a 5 días |
| Mail de pedidos | pedidos@proveedor.com |
| WhatsApp de pedidos | +54 9 11 ... |
| Contacto (nombre) | Juan, el vendedor |

**No hace falta que estén todos de una.** Con los 15 o 20 principales alcanza para arrancar; el resto se completa después.

## B. Límite de aprobación

Hoy quedó configurado un límite **global de $1.000.000**: por debajo, Ivana confirma la orden directo; por encima, pasa a tu aprobación.

1. ¿Ese monto está bien como criterio general?
2. ¿Querés límites **distintos por proveedor**? (Ej.: a un proveedor de confianza permitirle más, a uno nuevo menos.) Está previsto en el diseño, es agregar el dato.
3. ¿Hay proveedores donde **todo** deba pasar por vos, sin importar el monto?

## C. Combos de Mercado Libre y artículos fraccionados

Este es el punto más complejo que quedó abierto.

**El problema:** cuando se vende un combo de ML (por ejemplo `6530-2`, que son 2 unidades de Opalescence 20%), el reporte de ventas registra la venta del **combo**, no de las 2 unidades del artículo base. Lo mismo con los fraccionados: si se venden 10 de la cera `-F` de 200g, en realidad son 2 kg del artículo de 5 kg.

**La consecuencia:** el cálculo de consumo promedio queda por debajo del real, y el sistema sugiere comprar de menos.

Buscamos la solución dentro de YiQi (el campo "Artículo Base") pero **está vacío en todos los artículos**. Así que necesitamos armar la relación a mano.

**Lo que necesitamos:** una lista de qué contiene cada combo y cada fraccionado. Por ejemplo:

```
6530-2   → 2 unidades de 6530-F
6530     → 4 unidades de 6530-F
6552     → 4 unidades de 6530-F + 2 cubetas simples
51006    → 1 kg del Nylon Flexi de 5 kg
```

Son **49 artículos de Mercado Libre** y **234 con sufijo `-F`**. ¿Existe esa lista en algún lado, aunque sea en un Excel? Si no, ¿nos podés dar los criterios y la armamos nosotros para que la revisen?

## D. Las smarties del sistema en YiQi (importante)

Creamos 4 reportes en YiQi que alimentan el sistema. Están marcados **"NO BORRAR"** en el nombre:

- `API_Articulos_Stock NO BORRAR`
- `API_OC_Recientes NO BORRAR`
- `API_Proveedores_Activos NO BORRAR`
- `API_Ventas_Mensual NO BORRAR`

**Hoy alguien editó uno de ellos** (probablemente confundiéndolo con la pestaña "Articulos Ivana", que está justo al lado y quedó parecida). Le quitó columnas, y el sistema empezó a perder datos en la siguiente sincronización. Lo detectamos y restauramos, pero conviene evitar que se repita.

Dos opciones:

1. **Avisarle al equipo** que esas 4 pestañas no se tocan
2. **Mejor:** crear un usuario propio de YiQi para el sistema (por ejemplo `sistema@dentalab.com.ar`) con el permiso de Integrador. Así las pestañas quedan en una cuenta que nadie usa a diario. Nosotros movemos las smarties ahí.

¿Cuál preferís?

## E. Producción propia

Los artículos que tienen a "Dentalab" como proveedor son los que fabrican, producen o importan. Los sacamos de las sugerencias de compra, porque no se le compran a nadie.

1. ¿Es correcto?
2. Esos artículos, ¿necesitan **orden de producción** en algún momento? Sería otro circuito distinto al de compras.

## F. Dato con error en YiQi

En el artículo **1002** (Alginato IQ Chrom Cromatico LASCOD x 450g), la ubicación "En tránsito" muestra **−58 unidades**. Un tránsito negativo no tiene lectura posible. Ya nos dijiste que es un error arrastrado — ¿conviene corregirlo en YiQi o lo dejamos así y el sistema lo ignora?

---

# PARTE 2 — PARA IVANA

## G. El campo "Asunto" de las órdenes de compra

En las OC de YiQi aparecen textos como:

- "Listo- dsps borrar contenido" (en 29 de 55 órdenes)
- "Revisión" / "Revisión-enviado"
- "ENVIAR LUNES"
- "consultar Aris"
- "cubelimp"

¿Qué significan? ¿Es una forma de marcar en qué etapa está cada orden?

Lo preguntamos porque si eso representa un **estado del pedido**, tiene sentido convertirlo en algo que el sistema entienda y muestre bien, en vez de texto suelto.

## H. Las notas sobre punto de pedido

En los artículos hay notas escritas a mano, del estilo:

- "NO TIENEN STOCK"
- "solo por pedido"
- "Pide Aris"
- "Se piden de a 100 und"
- "REVISAR EL 9 DE MAYO"
- "Escribir 'GR Termo' en el pedido"

A partir de esas notas armamos un **catálogo de causas** con estas categorías:

| Ámbito | Causas |
|---|---|
| Stock | Sin stock en el proveedor · Solo por pedido |
| Compras | Lo pide Aris · Cantidad o presentación fija · Revisar antes de pedir · Se compra a otro proveedor |
| Entregas | Demora del proveedor · Entrega parcial · Faltante o error en la entrega |

1. ¿Estas categorías cubren lo que anotás en el día a día?
2. ¿Falta alguna? (Las de "Entregas" las armamos nosotros, porque en las notas no había ejemplos.)
3. Las notas del tipo "Escribir 'GR Termo' en el pedido" no son causas: son **instrucciones para el proveedor**. ¿Te sirve que aparezcan automáticamente en el texto del pedido?

## I. Tu forma de trabajar hoy

Para que el sistema se adapte a cómo trabajás y no al revés:

1. Cuando armás un pedido, **¿mirás proveedor por proveedor o arrancás por lo que falta?** El sistema hoy te muestra los proveedores ordenados por cuánta venta está en riesgo por falta de stock.
2. **¿Cada cuánto** armás pedidos? ¿Todos los días, una vez por semana?
3. Cuando le mandás el pedido al proveedor, **¿por mail o por WhatsApp?** ¿Depende del proveedor?
4. ¿Hay proveedores que te piden el pedido en **algún formato particular**?

---

# PARTE 3 — QUÉ FALTA POR NUESTRO LADO

Esto **no depende de las respuestas** de arriba. Lo aclaramos para que quede claro el estado real:

| Pendiente | Estado |
|---|---|
| **Envío automático de la OC al proveedor** (mail o WhatsApp) | Los textos y el PDF están listos. Falta conectar el envío. Hoy la orden se descarga en PDF y se manda a mano. |
| **Escritura de la OC aprobada en YiQi** | Nunca se probó ese endpoint. Es el punto de mayor incertidumbre técnica del proyecto, ya identificado desde el inicio. |
| **Comparación de precios entre proveedores** | Identificamos dónde están los datos, falta explorarlos. |
| **Capacitación de Ivana** | Una hora, cuando el sistema esté en uso. |

**Lo que sí funciona hoy, de punta a punta:** Ivana entra, ve qué falta priorizado por impacto en ventas, arma la orden con cantidades sugeridas según el consumo real de los últimos 12 meses, el sistema la valoriza con los costos de YiQi y decide si necesita aprobación; Aris la aprueba o rechaza, y la orden se puede descargar en PDF para enviarla.
