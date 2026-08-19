# PROMPT DE CONTINUIDAD — Dentalab-Compras
**Actualizado: 31 de julio de 2026 · Reconciliado contra repo el 5 de agosto de 2026 · Validación en vivo (Chrome) el 7, 10 y 11 de agosto de 2026 · Deploy + validación de limpieza de alertas Etapa 1: 11 de agosto de 2026**
*Pegar este documento completo al inicio de una nueva conversación con Claude.*

> **Estado de la reconciliación del 5/8/2026.** Se verificó el repo local `C:\dentalab-compras` archivo por archivo.
> **Producción NO se pudo verificar**: el entorno de la sesión bloquea la salida a `supabase.co`, `api.yiqi.com.ar` y `vercel.app`.
> Todo lo que depende de prod quedó marcado `[sin verificar]` y hay un script para cerrarlo en `scripts/verificar-prod.ps1`.
> El registro completo está en la sección **RECONCILIACIÓN 5/8/2026** al final.
>
> **Actualización 7/8/2026:** desde entonces se creó el repo remoto, se cerró el hueco de autorización en las 3 Edge Functions, se corrigió el badge del sidebar, y se validó todo en vivo contra producción con Claude in Chrome. Detalle en **VALIDACIÓN EN VIVO 7/8/2026**, al final del todo.
>
> **Actualización 10/8/2026:** se reemplazaron los diálogos nativos del navegador por un modal propio en Órdenes de compra, se creó y pobló la tabla `composicion_articulos` (fraccionados y combos de ML) y se integró al cálculo real de `sugerencias_compra()` e `historial_ventas()` — validado en vivo con precisión matemática, no solo "corrió sin error". Se cerró además un bug de la CLI de Supabase que impedía capturar el baseline. Detalle completo en **SESIÓN 10/8/2026**, al final del todo.
>
> **Más tarde el mismo 10/8:** se cerraron el resto de los pendientes técnicos de la sesión — gate de admin en `UsuariosAccesos.jsx`, limpieza de los 21 `.bak`, y una papelera reversible (archivar/restaurar/eliminar) para Órdenes de compra, con nombre del creador visible y las pendientes de aprobar siempre arriba. Se archivaron las 2 OC de prueba confirmadas (#3, #4); las OC #2/#5/#6/#7 se investigaron a fondo antes de tocar nada y resultaron ser órdenes reales de Ivana y Aris — no se tocaron. Ver sección **7. Papelera reversible...** al final.
>
> **Actualización 11/8/2026:** se identificó en vivo el candidato correcto para el código de la masa del kit Speedex — `21083` ("Silicona Speedex Putty Masa COLTENE 1.48kg"). **Confirmado por Aris** (no para `21087`, el kit chico ya discontinuado, sino como componente del combo grande `21081` que sí se vende: "21081 = 21083+21084+21085") y **cargado en `composicion_articulos`** — validado en vivo con un `SELECT`, 3 filas correctas. Gap de "Composición de combos y fraccionados" cerrado por completo. Ver **SESIÓN 11/8/2026** al final.
>
> **Más tarde el mismo 11/8:** se construyó la **Etapa 1 de la limpieza de alertas** que pidió Federico (el Monitor llegó a mostrar >3000 alertas sin ningún filtro): exclusión permanente por SKU (admin) + pausa de 15 días por SKU (cualquier usuario) con aviso activo en el sidebar al vencer. Dos migraciones aplicadas y validadas en vivo contra `contadores_sidebar()`; `Alertas.jsx` y `Sidebar.jsx` reescritos y entregados.
>
> **✅ Cerrada 11/8/2026 — deployada y validada en vivo.** Federico resolvió dos rondas de locks de git stale (`index.lock`, luego `HEAD.lock` + `objects/maintenance.lock`) y pusheó commit `9146741` a `main`; `vercel --prod` confirmó la URL de producción activa (`https://dentalab-compras.vercel.app`). Validación en vivo con Chrome, logueado como Aris: baseline confirmado en 2603 críticas / 450 preventivas / 3053 total (igual a las capturas previas); ciclo de pausa (SKU 1107: pausar → baja a 2602/450/3052, aparece en pestaña Pausadas con nombre/fecha correctos → reactivar → vuelve a 2603/450/3053) y ciclo de exclusión (mismo SKU: excluir → baja, aparece en pestaña Excluidos → restaurar → vuelve a subir) probados de punta a punta, sin dejar datos de prueba colgando. **Etapa 1 completa y en producción.** Ver sección **8. Limpieza de alertas — Etapa 1** dentro de SESIÓN 11/8/2026.
>
> **Todavía el mismo 11/8:** se armó una guía de testeo en Word para Aris e Ivana (qué está construido, qué probar esta ronda, qué no hace todavía, qué datos cargar). En el camino se auditó `NuevaOC.jsx` contra `git log` y se encontró que el límite de aprobación de Aris ya estaba resuelto desde el 7/8 (commit `41febe8`) sin haber quedado documentado — corregido acá y en el Word. También se descartó una sospecha de bug en el mapeo de `siempre_aprueba` (confirmado con `pg_get_functiondef`, funciona bien). **Federico ya envió la guía a Aris e Ivana — quedamos esperando su feedback.** Ver sección **9. Preparando el envío a testeo** dentro de SESIÓN 11/8/2026.
>
> **Actualización 14/8/2026:** se crearon dos smarties nuevas en YiQi (`Z.API_Stock_Por_Deposito_NO_BORRAR`, id 2360; `Z.API_Movimientos_Stock_NO_BORRAR`, id 2359). Al probarlas se descubrió que **el sync automático de stock llevaba 10 días roto** (última actualización real: 4/8) — el cron parecía sano porque `net.http_post` encola el pedido y "succeeded" no refleja la respuesta real. Causa doble: (1) los 3 cron jobs seguían usando la service_role key legacy, mientras el proyecto de Supabase ya había migrado al sistema de keys nuevo (`sb_secret_...`) — **arreglado**, los 3 jobs actualizados con la key correcta; (2) el token de integración con YiQi en sí también estaba vencido/inválido — **arreglado también**: Federico regeneró el token (`POST /token`, 265 caracteres) y lo cargó en `yiqi_config`. **✅ Sync 100% restablecido y confirmado en vivo**: llamada de prueba trajo 7185 filas de MATERIAL, y el Monitor de Stock mostró "Sincronizado 14/8, 11:37 a.m." Queda como pregunta abierta, sin urgencia, **por qué se venció el token sin que cambiara la contraseña de la cuenta de YiQi** — a investigar más adelante con Aris/soporte YiQi. Detalle completo en **SESIÓN 14/8/2026**, al final del documento.
>
> **Actualización 15/8/2026:** el sync se cortó de nuevo al día siguiente — dos causas distintas encontradas (un `cron.alter_job` que había cargado la key nueva sin el prefijo `Bearer `, corregido; y el token de YiQi que volvió a morir en menos de 24hs, sin regenerar todavía porque hay una hipótesis fuerte y sin confirmar de que la cuenta de integración se comparte con un login web de uso diario — **esperando respuesta de Aris**). Aparte, **✅ pedido nuevo de Aris — "Nueva OC" ahora permite agregar cualquier artículo del proveedor a mano**, no solo los que trae la alerta automática: migration `buscar_articulos_proveedor()` + buscador en `ArmarOrden`, deployado (commit `f1e416f`) y validado en vivo con Chrome sobre dos proveedores reales, sin dejar datos de prueba. Detalle completo en **SESIÓN 15/8/2026**, al final del documento.
>
> **Actualización 17/8/2026 — causa raíz real del vencimiento del token de YiQi, encontrada y resuelta.** Aris confirmó que nadie de Dentalab usó la cuenta compartida recientemente, y Federico confirmó que tampoco inició sesión en la web de YiQi — **la hipótesis del 15/8 (login web comparte y mata el token) queda descartada.** Investigando la documentación oficial de YiQi (`apidoc.yiqi.com.ar`) se confirmó la causa real: el `access_token` es de **vida corta por diseño** (~24hs, confirmado empíricamente: `expires_in = 86399`), no ~4 años como asumía un comentario viejo del código nunca verificado — y el sistema **nunca implementó** la renovación (`grant_type=refresh_token`) que YiQi exige. **✅ Construido, deployado y validado en vivo**: módulo compartido `_shared/yiqiConfig.ts` que renueva el token solo, 2hs antes de vencer, usado ahora por `sync-yiqi` y `yiqi-connector`. Confirmado en base de datos (`token_expira_en` con fecha real), en logs reales (`net._http_response`, sin errores tras el fix) y en vivo en el Monitor de Stock (7186 artículos, "✓ Sincronizado"). Riesgo residual (colisión de renovación entre los 3 cron jobs a las 6:00 UTC) documentado y aceptado a propósito, sin locking — de baja probabilidad y auto-recuperable. Detalle completo en **SESIÓN 17/8/2026**, al final del documento.
>
> **Actualización 19/8/2026 — criterio 5 del MVP cerrado del todo, y arrancó el módulo de Stock.** Sesión 18-19/8: se probó y quedó en producción la escritura real a YiQi (orden #9 creada, `yiqi_id=1689`), se encontró y corrigió un bug de fondo en el sync (YiQi devuelve `ID` mayúscula, no `id`), se agregó red de seguridad por `pg_cron` + UI de error/reintento, y arrancó la **Fase 1 del módulo de Stock**: sync automático de stock por depósito (`stock_yiqi`, 7150 SKUs, cron cada 15 min). Detalle completo en **punto 9** (cierre de escritura YiQi) y **punto 10** (Stock Fase 1), al final del documento. Quedó pendiente una limpieza pedida por Federico (archivo suelto, fila basura, webhook de Vercel) — ver nota al final del punto 10.
>
> **Actualización 18/8/2026 — cerrada la incógnita del criterio 5 del MVP: escribir en YiQi (`POST /ORDEN_DE_COMPRA`) SÍ se puede.** Era el mayor riesgo técnico abierto desde julio ("nunca se probó el endpoint"). En vez de preguntarle a Aris si el módulo Compras estaba licenciado (hubiera tardado, y Federico necesita cerrar el desarrollo rápido), se probó directo y sin riesgo: **lectura real** (`GET /ORDEN_DE_COMPRA/1669`, id interno de la OC #1727) devolvió el registro completo con detalle anidado — confirma acceso de lectura. **Escritura real**, con una prueba diseñada para no crear nada (un `POST` con un proveedor inexistente, `CLIE_ID_CLIE=999999999`): YiQi devolvió `400`, *"hace referencia a una instancia inexistente en Empresa"* — validación de integridad referencial real, no un error de permiso/licencia, y **no se creó ninguna orden**. Confirmado: el módulo está habilitado para escribir. Detalle completo, incluyendo por qué se descartó la prueba con body vacío (una OC real de Dentalab ya tiene líneas vacías y $0, así que un POST vacío podría haber creado algo real) y el hallazgo de que YiQi no tiene `DELETE` para estas entidades (solo cancelación, vía `CANCELACION_DE_COMPR`), en **SESIÓN 18/8/2026**, al final del documento.

---

Soy Federico, de Tulkas LLC. Estoy desarrollando **Dentalab-Compras**, un sistema de gestión de compras para el cliente Dentalab (laboratorio dental, Argentina), integrado con su ERP YiQi. Ya venimos trabajando juntos en muchas sesiones — **tenés memoria guardada del proyecto, revisala antes de responder**. Este documento es el estado consolidado y prevalece sobre la memoria si hay contradicción.

## CÓMO QUIERO QUE TRABAJEMOS

- **Paso a paso.** Un comando o acción por vez. **Esperá mi confirmación antes de seguir.**
- **Explicame el porqué** antes de pedirme que haga algo. Arquitectura primero, código después.
- Trabajo en **Windows con PowerShell**. Nunca bash.
- Si el copy/paste de terminal falla, **pedime captura**, no insistas con texto.
- **Sé honesto sobre limitaciones reales.** Avisos claros de "esto es una limitación conocida".
- Al mover archivos de Descargas al repo: **`Move-Item -Force`**, no `Copy-Item`.
- **Guardá en memoria proactivamente** durante la sesión.
- **Nunca me pidas tokens/keys escritos en el chat.**
- **`Read-Host` falla seguido** (le doy Enter sin pegar y la variable queda vacía). Para la anon key, leerla del archivo:
  ```powershell
  $anon = (Get-Content .env.local | Where-Object { $_ -match '^VITE_SUPABASE_ANON_KEY=' }) -replace '^VITE_SUPABASE_ANON_KEY=',''
  $anon = $anon.Trim().Trim('"').Trim("'")
  ```
- Para invocar Edge Functions desde PowerShell con la **anon key legacy** hacen falta **los dos headers**: `Authorization: Bearer` + `apikey`. `[14/8/2026]` Con la **`sb_secret_...` nueva** (sistema de keys nuevo), mandar **solo** `Authorization` — combinarla con un `apikey` legacy (`eyJ...`) da `401 Conflicting API keys` desde el gateway de Supabase, no es un error de nuestro código.
- **Desde el 5-7/8/2026 trabajamos todo en la sesión de la nube (Claude Code / Cowork)**, no solo en PowerShell local: el repo tiene remoto (`github.com/federicoaf79/dentalas_erp`), y Claude puede leer/editar el repo vía `device_bash`/`device_stage_files`, y validar en vivo contra producción con Claude in Chrome. Metodología fija a partir de ahora: **revisar siempre lo hecho antes de cambiar algo, no romper nada, validar cada construcción (en vivo cuando aplica), y priorizar gaps de seguridad**.

## QUIÉN ES QUIÉN

- Cliente **Dentalab**. Dueño: **Aris Samandjian** (aprueba, ve todo). Operadora: **Ivana** (ve solo sus proveedores).
- **Alex Samandjian** = hermano de Aris, también usuario de YiQi.
- Mails reales: Ivana `comprasdentalab@gmail.com`, Aris `aris@dentalab.com.ar`
- Usuario YiQi del sistema: `ventas@dentalab.com.ar` (con "Integrador" habilitado)
- `[chrome-live 2026-08-07]` Confirmado en vivo: ambas cuentas reales (Ivana y Aris) ya existen en Supabase Auth con su fila resuelta en `usuarios_config`. Pendiente: Aris nunca inició sesión con su cuenta real, sigue usando la demo.

## INFRAESTRUCTURA

- Local: `C:\dentalab-compras\` — `frontend\`, `supabase\functions\`
- **Remoto:** `github.com/federicoaf79/dentalas_erp`, rama `main` — ✅ **creado y sincronizado 6/8/2026** (ver PENDIENTE INMEDIATO #1)
- Supabase: `hsfudsnmooaesrzdwecg` (org UrbanTales), plan Pro
- Deploy: `vercel --prod` desde `frontend\` → **https://dentalab-compras.vercel.app**
- Bearer token de YiQi: tabla `yiqi_config`
- Demo: `aris@dentalab-compras.demo` / `ivana@dentalab-compras.demo`, pass `Dentalab2026!`

---

# ESTADO CONTRA EL MVP CONTRATADO

**MVP: 15 días / USD 1.500 / ~106h.** Siete criterios de éxito definidos al inicio:

| # | Criterio | Estado |
|---|---|---|
| 1 | Login con roles funcional (Ivana / Dueño) | ✅ **COMPLETO** — frontend + RLS real en Postgres |
| 2 | Sync de stock con YiQi sin intervención | ✅ **COMPLETO** — 3 cron jobs activos |
| 3 | Monitor muestra productos bajo punto de reposición | ✅ **COMPLETO** |
| 4 | OC generada, aprobada, **y enviada al proveedor** | ⚠️ **PARCIAL** — se genera y aprueba; el envío no está |
| 5 | **OC escrita en YiQi** vía `POST /ORDEN_DE_COMPRA` | ✅ **COMPLETO** — `[19/8/2026]` construido, deployado y verificado en vivo con una orden real (#9, `yiqi_id=1689`); incluye red de seguridad por `pg_cron` y UI de error/reintento. Ver punto 9 |
| 6 | Historial de OC consultable | ✅ **COMPLETO** |
| 7 | Ivana opera sola tras capacitación | ⏸️ **PENDIENTE** — falta la capacitación |

## Lo que se entregó DE MÁS respecto del MVP

- **Predictor de demanda conectado** con 36.660 filas de historial real de ventas (19 meses). Esto es el **Módulo D**, cotizado aparte en USD 360.
- Semáforo de aprobación con reglas configurables
- Catálogo de causas administrable
- Datos de empresa + templates de mensajes
- PDF de la orden de compra
- RLS real en Postgres (el MVP solo pedía "login con roles")

## Lo que falta y NO se destraba con respuestas del cliente

1. **Envío de la OC al proveedor** (Resend / WhatsApp). Los templates y el PDF están; falta la integración de envío. `[chrome-live 2026-08-07]` Confirmado en vivo: el propio banner de "Órdenes de compra" dice *"Todavía no se envían al ERP ni al proveedor — esa etapa es la siguiente del desarrollo"*. Ninguna OC nueva (creada vía Nueva OC) llega hoy a estado `Enviada`, solo `Aprobada`. Las 51 OC en estado `Enviada` que se ven en el listado son históricas/pre-existentes.
2. **Escritura en YiQi** (`POST /ORDEN_DE_COMPRA`). Marcado como el mayor riesgo técnico desde el roadmap original. `[18/8/2026]` **La incógnita de "¿se puede?" está cerrada** — probado en vivo (lectura y escritura), el módulo está habilitado, sin crear nada real. Ver SESIÓN 18/8/2026. Lo que falta ahora es trabajo de construcción normal: mapear `CLIE_ID_CLIE`/`COVE_ID_COVE`/artículos reales, armar las líneas del pedido, y decidir cómo se dispara desde la app.
3. **Comparación de precios entre proveedores** (`LISTA_DE_PRECIO_COMP` / `PRECIO_ARTICULO_COMP`, identificadas pero no exploradas).

## Lo que falta y SÍ depende de respuestas

4. **Condiciones comerciales por proveedor** (mínimo de compra, descuentos por volumen, plazo de pago). `[6/8/2026]` **Resuelto como decisión de diseño**: son reglas a aplicar en cada perfil de proveedor, con pantalla propia (`CondicionesProveedor.jsx`, gate admin) que lee/escribe la tabla `proveedores` — si hacen falta otras reglas más adelante, se agregan ahí. Lo único que sigue pendiente es que **Aris cargue los datos reales** de los 15-20 proveedores principales (ESPERA A OTRA PERSONA), no el diseño.
   - `[repo 2026-08-05]` Ninguna pantalla vieja consultaba la tabla antes del 6/8 — corregido con `CondicionesProveedor.jsx`.
5. **Composición de combos y conversión de fraccionados.** `[10/8/2026]` **✅ Resuelto en su mayoría** — tabla `composicion_articulos` creada con 41 filas confirmadas por Aris (7 fraccionados + 34 combos) e integrada al cálculo de demanda. Ver SESIÓN 10/8/2026. `[11/8/2026]` **✅ Cerrado del todo** — Aris confirmó la composición del combo Speedex `21081` (= `21083`+`21084`+`21085`); cargada y validada en vivo. Ver SESIÓN 11/8/2026.
6. **Límite de aprobación por proveedor** (hoy es global). `[repo 2026-08-06]` Parcialmente resuelto por `CondicionesProveedor.jsx` (columna `limite_aprobacion` por proveedor). `[chrome-live 2026-08-07]` Gap encontrado en vivo: el límite se aplicaba por igual a cualquier usuario, incluido Aris. **✅ Cerrado el mismo 7/8/2026** — commit `41febe8` ("Fix: las órdenes de Aris se confirman directo, sin control de aprobación"), hecho fuera de una sesión con Claude y detectado recién el 11/8 al revisar `NuevaOC.jsx` para otra cosa (ver corrección en SESIÓN 11/8/2026). Hoy `requiereAprobacion` es siempre `false` cuando `esAdmin` — Aris confirma cualquier orden directo, sin límite ni "siempre aprueba".

---

# LO QUE ESTÁ CONSTRUIDO

## Las 14 pantallas — ninguna en construcción

Monitor de Stock · Alertas · Órdenes de compra · Seguimiento de OC · Historial de OC · **Nueva OC** · **Predictor de demanda** · Proveedores · Usuarios y accesos · **Datos de la empresa** · **Catálogo de causas** · **Reglas y alertas** · **Templates de mensajes** · Conector YiQi · **Condiciones comerciales** (nueva, 6/8/2026)

`[repo 2026-08-05]` **Verificado.** `App.jsx:26-41` define `PAGINAS_CON_DATOS_REALES` con las 14 claves (`stock, seguimiento, proveedores, historial, usuarios, alertas, ocs, yiqi, predictor, nueva-oc, reglas, causas, empresa, templates`) y `App.jsx:138-155` rutea las 14 a componentes reales. `PaginaEnConstruccion` (`App.jsx:43`) quedó inalcanzable salvo con una `currentPage` fuera de la lista. `[repo 2026-08-06]` se sumó `condiciones` como 15ª página (`CondicionesProveedor.jsx`).

## Arquitectura de datos

El frontend **no llama a YiQi en vivo**. Dos capas:

1. **Sync:** Edge Function `sync-yiqi` disparada por 3 cron jobs de `pg_cron`:
   - jobid 3 — `sync-material-cada-15-min` (`*/15 * * * *`) → MATERIAL
   - jobid 4 — `sync-oc-y-clientes-diario` (`0 6 * * *`) → REPORTE_DE_OC + CLIENTE
   - jobid 5 — `sync-ventas-diario` (`30 6 * * *`) → REPORTE_DE_VENTAS
2. **Lectura:** las pantallas leen de las tablas propias con fetch paralelo. ~1 segundo.

⚠️ **`update cron.job set active=...` da "permission denied" desde el SQL Editor.** Usar `select cron.alter_job(3, active := false);`

`[chrome-live 2026-08-07]` **Validado que el cron sigue autenticando correctamente tras el fix de autorización**: se comparó el token que usa `cron.job` contra el `service_role` actual del dashboard (sin que ninguno de los dos valores pasara por Claude) — Federico confirmó "Coinciden." antes de deployar. Falta confirmar el próximo tick automático o revisar logs de la función para el 100% de certeza operativa.

## Las 4 smarties core en YiQi

⚠️ **Renombrar CAMBIA el smartieId. Editar columnas NO.**

| Nombre | smartieId | Entidad | Registros |
|---|---|---|---|
| API_Articulos_Stock NO BORRAR | **2344** | MATERIAL | ~7.173 |
| API_OC_Recientes NO BORRAR | **2345** | REPORTE_DE_OC | ~291 líneas / ~55 OC |
| API_Proveedores_Activos NO BORRAR | **2346** | CLIENTE | ~1.151 |
| API_Ventas_Mensual NO BORRAR | **2353** | REPORTE_DE_VENTAS | 4.088 (pivoteado) |

**Máximo de registros por página en YiQi: 100.** El sync detecta el tamaño real de la primera respuesta, nunca lo asume.

### 🔴 INCIDENTE — la 2344 fue editada por alguien de Dentalab (31/7)

Perdió 8 columnas, probablemente porque alguien la confundió con la pestaña "Articulos Ivana" que está al lado. Como el sync mapea con `?? null`, escribió NULL en punto de pedido, cantidad de unidades, código de proveedor y lead time de los 7.173 artículos. Se restauró.

**El sufijo "NO BORRAR" no protege de ediciones.** Pendiente pedirle a Aris que nadie las toque, o crear un usuario YiQi propio del sistema.

**Los 16 campos que la 2344 debe tener:**
`MATE_CODIGO`, `MATE_NOMBRE`, `CLIE_CODIGO`, `CLIE_NOMBRE`, `MATE_STOCK_DISPONIBLE`, `MATE_STOCK_SEGURIDAD`, `MATE_PUNTO_DE_PEDIDO`, `MATE_PUNTO_PEDIDO_MAX`, `MATE_LEAD_TIME_MAXIMO`, `MATE_CODIGO_EN_EL_PROVEED`, `MATE_NOTAS_SOBRE_PUNTO_DE`, `UNIT_CANTIDAD_DE_UNIDADES`, `MATE_CANTIDAD_DE_UNIDADES`, `MATE_CAJA`, `MATE_CRM`, `MATE_CRM_FINAL`

Script de auditoría: comparar `$r.columns.field` contra esa lista.

`[repo 2026-08-06]` **Cosmético, no urgente:** `yiqi-connector/index.ts:45-47,385,390` sigue documentando los smartieId viejos (2340/2341/2343) en comentarios y ejemplos; el sync real usa 2344/2345/2346 correctamente (N-2, sigue abierto).

## Tablas en Supabase

**Espejo de YiQi** (nunca mezclar con lógica propia):
- `material_yiqi` — incluye `mate_crm` (costo neto) y `mate_crm_final` (con impuestos)
- `ordenes_yiqi` — nivel de línea, **sin columna de código de proveedor**
- `clientes_yiqi` — contacto/fiscal
- `ventas_mensual_yiqi` — 36.660 filas, `periodo` como date

**Lógica propia:**
- `usuarios_config` (rol admin/operador) · `usuario_proveedor` (permisos) · `yiqi_config`
- `ordenes_propias` + `ordenes_propias_items` — circuito de OC. `[10/8/2026]` Ahora tiene columnas `archivada_en`/`archivada_por` (papelera reversible) — ver sección 7 de SESIÓN 10/8/2026. Las OC #3 y #4 (pruebas confirmadas del 7/8) quedaron archivadas; #2, #5, #6, #7 son órdenes reales de Ivana/Aris, no tocar.
- `reglas_compra` — límite $1.000.000, máx 2 bultos, 2 meses de cobertura
- `empresa_config` — membrete del PDF
- `catalogo_causas` + `declaraciones_causa`
- `templates_mensaje`
- `proveedores` — condiciones comerciales, decididas como reglas por perfil de proveedor (ver "Lo que falta y SÍ depende de respuestas" ítem 4). `[repo 2026-08-06]` ya tiene UI (`CondicionesProveedor.jsx`); sigue vacía de datos reales — ver ESPERA A OTRA PERSONA.
- `composicion_articulos` — fraccionados y combos (**44 filas** desde el 11/8/2026: las 41 originales + 3 del combo Speedex `21081`). La fila de `21087` (kit chico discontinuado, componente masa inválido `21082`) quedó sin tocar a propósito — SKU muerto, no afecta ningún cálculo. Ver SESIÓN 11/8/2026.
- `articulos_excluidos_alertas` — `[11/8/2026, NUEVA]` exclusión permanente por SKU del conteo de alertas (admin-only). Ver SESIÓN 11/8/2026, sección 8.
- `alertas_pausadas` — `[11/8/2026, NUEVA]` pausa temporal de 15 días por SKU (cualquier usuario logueado). `reactivar_en` la fija siempre un trigger a partir de `pausada_en`, no el frontend. Ver SESIÓN 11/8/2026, sección 8.

## Permisos — frontend + RLS

**Fase A:** `src/hooks/usePermisos.js` exporta `usePermisos()`, `filtrarMaterial()`, `filtrarOrdenes()`. **Falla cerrado.**

**4 cuidados del patrón:**
1. El filtro va en **las dos queries** — la del `count: 'exact'` y las páginas paralelas
2. No consultar hasta que `permisos.cargando` sea `false`
3. Dependencia del `useEffect` por **clave derivada string**, no por el objeto
4. `onAuthStateChange` **también dispara al refrescar el token** (al volver a la pestaña). Hay un `useRef` con el user.id que evita recargar si no cambió realmente.

**Fase B:** funciones `SECURITY DEFINER` + `STABLE`: `es_admin()`, `mis_codigos_proveedor()`, `mis_nombres_proveedor()`. Políticas en `material_yiqi`, `ordenes_yiqi`, `ventas_mensual_yiqi`. `[10/8/2026]` Se sumó `nombres_usuarios(uuid[])`, mismo patrón, para exponer el nombre de cualquier usuario (nada sensible) sin saltarse el resto de RLS de `usuarios_config`.

`[repo 2026-08-05]` **Fase A verificada y en uso.** `usePermisos.js:182` exporta `filtrarMaterial()`, `:203` `filtrarOrdenes()`. `MonitorStock.jsx:31` y `:48` lo aplican en la query de `count` y en las páginas paralelas (el cuidado #1 se cumple); `:96` corta si `permisos.cargando`; `:113-115` usa clave derivada string; `usePermisos.js` tiene el `useRef` del `user.id`. Los 4 cuidados están implementados. 13 pantallas + `App.jsx` importan `usePermisos`.

`[sin verificar]` **Fase B (RLS en Postgres) no se pudo confirmar** — requiere prod. Es lo único que separa "el frontend filtra" de "los datos están protegidos": sin las políticas, cualquiera con la anon key lee las tablas espejo por PostgREST salteando el frontend.

✅ `[10/8/2026]` **`UsuariosAccesos.jsx:259` ya no miente.** El cartel falso ("Esta asignación todavía no se aplica como filtro") se borró y se agregó gate `esAdmin` real (bloqueo total de contenido para no-admin, no solo deshabilitar botones) — commit `edce81b`. El backend (`admin-usuarios` Edge Function) ya rechazaba a no-admins desde el 7/8 (`verificarLlamador({soloAdmin:true})`), así que esto era un cierre de UX/defensa en profundidad, no un agujero activo. Ver N-3/N-4 (cerrados) y PENDIENTE INMEDIATO #7.

⚠️ **En el SQL Editor `auth.uid()` es NULL.** Verificar siempre en el navegador logueado.

**Por qué el filtro de material es (código OR nombre):** de las 19 asignaciones, 9 tienen el NOMBRE metido en `proveedor_codigo` porque esos proveedores no tienen `CLIE_CODIGO` en YiQi.

**Detalle técnico:** el `.or()` de PostgREST es un string plano y los nombres tienen comas y paréntesis. Hay que **encomillar** cada valor. Resuelto en `comillar()`.

## Funciones de negocio en Postgres

| Función | Qué hace |
|---|---|
| `contadores_sidebar()` | Badges reales. **Sin** `SECURITY DEFINER` a propósito. `[11/8/2026]` Ahora también excluye de `alertasCriticas`/`alertasPreventivas` los SKU de `articulos_excluidos_alertas` y los que tienen una pausa vigente en `alertas_pausadas`, y suma `alertasPausadasVencidas` — ver SESIÓN 11/8/2026, sección 8. Cuerpo completo capturado con `pg_get_functiondef` antes de tocarla, no se asumió nada |
| `historial_ventas(p_meses)` | Historial por SKU |
| `historial_ventas_json(p_meses)` | Igual pero en un jsonb — **esquiva el tope de 1.000 filas de PostgREST** |
| `sugerencias_compra(p_proveedor)` | Qué y cuánto comprar. Lee `reglas_compra` |
| `proveedores_con_alertas()` | Ordenado por **demanda en riesgo**, no por cantidad |
| `es_comprable(nombre, proveedor)` | Excluye `###` de ML, discontinuados (por patrón de nombre) y producción propia (proveedor = Dentalab). `[11/8/2026]` **No se tocó** en la limpieza de alertas: recibe nombre/proveedor, no el código del SKU, así que no puede consultar `articulos_excluidos_alertas`/`alertas_pausadas` sin cambiarle la firma y tocar `sugerencias_compra()` (otra pantalla, ya funciona bien). El filtro de alertas quedó en `contadores_sidebar()` y `Alertas.jsx` en cambio |
| `nombres_usuarios(uuid[])` | `[10/8/2026]` Nombre de un usuario por su `user_id`, sin saltarse RLS de `usuarios_config` — usado por la columna "Creada por" de Órdenes de compra y, desde el 11/8, por las columnas "Excluido por"/"Pausada por" de Alertas |

⚠️ **PostgREST corta las respuestas de tipo TABLA en 1.000 filas y el tope es del servidor** — `.range()` desde el frontend no lo levanta. Solución: devolver todo en un jsonb.

⚠️ **`AVG()` miente** en `ventas_mensual_yiqi`: las celdas vacías no generan fila. Usar `SUM() / N_meses`.

`[chrome-live 2026-08-07]` **`contadores_sidebar()` devuelve:** `alertasCriticas`, `alertasPreventivas`, `alertasStock`, `aprobacionPendiente`, `ocsActivas`, `seguimientoPendiente`, `ultimaSync`. `[11/8/2026]` Ahora también `alertasPausadasVencidas`. **Corrección sobre lo que decía este documento hasta el 10/8:** el sidebar SÍ tiene el badge de `aprobacionPendiente` cableado (`Sidebar.jsx`, azul, dentro del NavItem de Alertas, con comentario en el código "El flujo es Sprint 2, hoy siempre 0 -> no se dibuja") — no es que falte conectarlo en la UI (como decía N-12), sino que la función de Postgres nunca devuelve un valor distinto de 0 hoy porque el flujo de aprobación en dos pasos (Sprint 2) no está construido. N-12 queda corregido con esta aclaración.

---

# DECISIONES DE NEGOCIO CONFIRMADAS POR ARIS

1. **Punto de pedido:** el sistema debe calcularlo automáticamente. Hoy usa `mate_stock_seguridad` como respaldo cuando `mate_punto_de_pedido` viene 0/null.
2. **Unidad de compra:** `mate_cantidad_de_unidades` es EL campo autoritativo. `unit_cantidad_de_unidades` y `mate_caja` no son confiables.
3. **Depósitos:** los 3 con movimiento son Local, Depósito Central y Vendedor Jorge. `MATE_STOCK_DISPONIBLE` = Local + Central (verificado en 6 SKUs).
4. **"En tránsito"** es una ubicación más en YiQi, no un campo. El −58 del SKU 1002 es **un error arrastrado**.
5. **ML Full:** se compra → llega a Central → se envía a ML. **La mercadería no vuelve, se vende toda**, así que excluirla del disponible es correcto.
6. **Combos de ML:** YiQi **descuenta automáticamente** del artículo unitario. `mate_stock_disponible` ya viene neto. Los combos que mezclan productos descuentan de ambos.
7. **Nomenclatura:** `###` = publicación de Mercado Libre (49 artículos). `-F` y `-U` = **artículos fraccionados de una presentación mayor** (cera rosa se compra x 5kg → se arma x kg, `-F` 200g, `-U` lámina suelta).
8. **Decimales en stock** = artículos de fraccionamiento/producción. Dato legítimo.
9. **Proveedores raros en OC:** "Dentalab" = producción propia (**no se compra, se fabrica**). "PROVEEDURIA" = proveedor real. "VARIOS" = casos raros.
10. **Costos:** el campo es **`MATE_CRM`** ("CRM Neto", sin impuestos) y `MATE_CRM_FINAL` (con impuestos). **6.243 de 7.173 artículos (87%)** tienen costo.
11. `[chrome-live 2026-08-07]` **El límite de aprobación automática es sobre Ivana, no sobre Aris.** Aris, como dueño, puede pedir lo que quiera sin pasar por aprobación. **✅ Implementado** — commit `41febe8` (7/8/2026): `NuevaOC.jsx` hace `requiereAprobacion = !esAdmin && (...)`, así que para Aris (`esAdmin`) la orden se confirma directo, sin límite, sin "siempre aprueba", sin excepción. Detectado recién el 11/8 que este fix ya estaba en producción sin quedar documentado — ver SESIÓN 11/8/2026.
12. `[11/8/2026]` **La masa del kit Speedex ya no se vende en la presentación chica** (kit trial de MercadoLibre, `21087`, 362g). Se vende la presentación grande (`21081`), cuya composición confirmó Aris: `21081 = 21083 (masa) + 21084 (light) + 21085 (activador)` — cargado en `composicion_articulos`. Ver SESIÓN 11/8/2026.
13. `[11/8/2026]` **Condiciones comerciales = reglas a aplicar en cada perfil de proveedor**, decisión ya cerrada (no es un punto de diseño abierto): si hacen falta reglas nuevas más adelante, se agregan a `CondicionesProveedor.jsx`/tabla `proveedores`, sin rediscutir el enfoque.
14. `[11/8/2026]` **Limpieza de alertas** (más de 3000 alertas activas hoy): Federico pidió dos reglas — (a) dejar de contar alertas de artículos que hace 3 años no se compran o no tienen ingresos de mercadería (discontinuados, cambio de SKU, saldos — sin borrar nada), y (b) poder pausar la alerta de faltante de un proveedor puntual, con un aviso a los 15 días para revisar si sigue igual. Ver SESIÓN 11/8/2026, sección 8, para el diseño en dos etapas acordado y lo que se construyó hoy.

---

# HECHOS TÉCNICOS DE YIQI (no re-descubrir)

- Auth: POST `/token` (form-urlencoded) → GET `/api/accountapi/GetLoginInformation` → `schemaId=328`
- Smarties: `GET /api/public/{ENTIDAD}/smartie?smartieId={id}&schemaId=328&page={n}` → `{data, total, columns}`
- **`/query`: siempre 500.** **`/search`: topeado en 50 registros.**
- **Los códigos de error son inútiles:** un smartieId inventado da el mismo 500 que uno sin acceso. Sin token sí distingue: `{"Message":"Authorization has been denied for this request."}`
- **Las vistas guardadas son POR USUARIO.** La smartie de Aris (2549) no es accesible con nuestro token.
- **Con Pivot activado, YiQi OBLIGA** a tener un campo en COLUMNA y otro en DATOS.
- **En smarties pivoteadas las claves son genéricas** (`C2`..`C21`) y **vienen desordenadas**. El mapeo está en `columns` (`field` → `title`). Hay que leerlo en cada sync.
- El campo de lead time es **`MATE_LEAD_TIME_MAXIMO`**, no `MATE_LEAD_TIME`.
- **Artículo Base viene VACÍO** en toda la base — el campo existe pero Dentalab no lo carga. Camino descartado para resolver combos.
- Hay un campo basura **`ckeck`** (así, mal escrito) que hay que ignorar.

## Calidad de datos

- `CLIE_ACTIVO_P` es "S" en el 100% — inútil como filtro
- `MATE_USO_MENSUAL_CALCULAD` casi siempre null
- `REPORTE_DE_PROVEEDOR` está vacía
- El `id` de REPORTE_DE_OC es de la **cabecera**, se repite por línea
- **Cuidado al agrupar por prefijo de código:** `33510-A1/A2` son colores, `60196-3006` son medidas, `761-FCC` son talles. Son productos distintos, no packs.
- En `ventas_mensual_yiqi`: **2024/12 y el mes en curso están incompletos**. Excluirlos de promedios.
- Las cantidades **negativas y cero son válidas** (notas de crédito). La suma da la venta neta.
- El campo **Asunto** de las OC es texto libre que carga quien la arma ("Listo- dsps borrar contenido" en 29 de 55). No es un vocabulario controlado.

---

# LO QUE SIGUE, EN ORDEN

1. **🔴 Crear los usuarios reales** en Supabase Auth + su fila en `usuarios_config` (sin la fila, el sistema falla cerrado y no ven nada). Copiar las asignaciones de proveedores de la Ivana demo. `[chrome-live 2026-08-07]` **Parcialmente hecho**: ambas cuentas reales ya existen con `usuarios_config` resuelto. Falta que Aris inicie sesión con la suya al menos una vez.
2. **🔴 Envío de la OC al proveedor** — Resend para email. Los templates y el PDF ya están.
3. **🔴 Escritura en YiQi** (`POST /ORDEN_DE_COMPRA`) — `[18/8/2026]` confirmado que el módulo está habilitado (ver SESIÓN 18/8/2026); falta el mapeo de campos reales y la integración en el flujo de la app. Ya no es una incógnita de "¿se puede?", es trabajo de construcción.
4. **Condiciones comerciales por proveedor** — depende de que Aris complete los datos. `[repo 2026-08-06]` La pantalla (`CondicionesProveedor.jsx`) ya existe. `[11/8/2026]` Diseño confirmado como cerrado (decisión de negocio #13).
5. **Comparación de precios** (`LISTA_DE_PRECIO_COMP` / `PRECIO_ARTICULO_COMP`).
6. ~~Composición de combos y fraccionados — tabla de mapeo a mano + definición de Aris.~~ **✅ HECHO 10/8/2026, cerrado del todo 11/8/2026** — tabla `composicion_articulos` (44 filas) creada, con RLS, e integrada en `sugerencias_compra()` e `historial_ventas()` (migration `20260810120000`), validada en vivo. El único punto pendiente (código de la masa del kit Speedex) se cerró el 11/8 con la confirmación de Aris sobre el combo `21081` — ver SESIÓN 11/8/2026.
7. **Declarar causas desde las pantallas** — el catálogo existe, falta el modal donde se usa.
8. **Límite de aprobación por proveedor** — `[repo 2026-08-06]` ya no es puramente global: `CondicionesProveedor.jsx` permite cargar un límite por proveedor. Falta que Aris cargue los datos y falta el ítem 12 (Aris no debería tener límite).
9. **Capacitación de Ivana** — criterio 7 del MVP.
10. ~~Badge del sidebar no se refresca tras aprobar (se corrige recargando).~~ **✅ HECHO 7/8/2026** — `App.jsx` ahora usa `useCallback`/`useRef` y pasa `onCambioOrdenes` a `OrdenesCompra`/`NuevaOC` (commit `c0ea403`, desplegado a Vercel). Validado en vivo con Claude in Chrome, con un matiz importante: ver **VALIDACIÓN EN VIVO 7/8/2026**.
11. **Módulo de stock por depósito** — entidades confirmadas contra la API real: `STOCK` (no `CONSULTA_DE_STOCK`), `MOVIMIENTO_STOCK` (1.373.423 registros — mucho más que los 25.302 que se había estimado antes), `ACTUALIZACION_DE_STO` (60.616, sin confirmar todavía), `PUNTO_DE_PEDIDO_POR` (punto de pedido por ubicación, solo 5 cargados). `[14/8/2026]` `yiqi-connector` ya tiene el whitelist corregido y las 2 smarties (`STOCK`/2360, `MOVIMIENTO_STOCK`/2359) responden en vivo — falta diseñar las tablas propias y el sync para que esto se automatice, hoy solo se puede consultar a demanda. `[11/8/2026]` Este es el dato que falta para automatizar la regla (a) de la limpieza de alertas (3 años sin compra/ingreso) — ver SESIÓN 11/8/2026, sección 8, Etapa 2.
12. ~~El límite de aprobación no distingue quién crea la orden.~~ **✅ HECHO 7/8/2026, detectado recién el 11/8** — commit `41febe8`, la misma tarde del hallazgo en vivo: `NuevaOC.jsx` exime a Aris (`esAdmin`) de cualquier control de aprobación. El commit está en producción desde entonces, pero nunca quedó registrado en este documento — se encontró al revisar el archivo el 11/8 por otro motivo (ver SESIÓN 11/8/2026).
13. `[10/8/2026]` **NUEVO — Parte B de la papelera de Órdenes de compra**: poder editar una orden ya aprobada (ítems, cantidades, recalcular total), y desde ahí regenerar y reenviar por WhatsApp, dejando registro de "modificado por Aris". Decisión explícita de Federico: se construyó solo la Parte A (unificar pantalla, nombre del creador, orden con pendientes arriba, archivar/restaurar/eliminar) el 10/8; esto queda para diseñar con más tiempo porque toca montos e inventario y hoy no existe ninguna forma de editar una orden ya creada.
14. ~~Cargar el código correcto de la masa Speedex en `composicion_articulos`.~~ **✅ HECHO 11/8/2026** — Aris confirmó la composición del combo `21081` (masa+light+activador); cargada con `INSERT ... WHERE NOT EXISTS` (migration `20260811000200`) y validada en vivo con `SELECT`. Ver SESIÓN 11/8/2026.
15. ~~Deploy y validación en vivo de la limpieza de alertas (Etapa 1).~~ **✅ HECHO 11/8/2026** — `Alertas.jsx`, `Sidebar.jsx` y las 2 migraciones (`20260811000000`, `20260811000100`) en producción (commit `9146741`); validado en vivo con Chrome de punta a punta (badges, tabs Excluidos/Pausadas, modal de Excluir/Pausar). Ver SESIÓN 11/8/2026, sección 8.
16. `[11/8/2026]` **NUEVO, Etapa 2 (futura, no urgente) — sincronizar `MOVIMIENTO_STOCK` desde YiQi** para automatizar la regla de "3 años sin compra/ingreso" de la limpieza de alertas, hoy resuelta con exclusión manual (ítem 14 de decisiones de negocio). Ligado al ítem 11 de esta lista.
17. ~~Pedido de Aris — en "Nueva OC", poder agregar cualquier artículo del proveedor a mano.~~ **✅ HECHO 15/8/2026, deployado y validado en vivo** — commit `f1e416f`, migration `20260815160000_buscar_articulos_proveedor.sql` aplicada por Federico vía SQL Editor. Ver SESIÓN 15/8/2026, sección 6.

---

# ALCANCE CONTRATADO

- **MVP:** 15 días / USD 1.500 / ~106h a USD 14,15/h
- **Módulos extra** (USD 10/h mín): A — alertas avanzadas (32h/USD 320); B — pipeline (28h/USD 280); C — import Excel (24h/USD 240); **D — predictor de demanda (36h/USD 360) ⚠️ parcialmente entregado**; E — Gmail/Workspace (46h/USD 460); F — extracción de facturas con Claude API (28h/USD 280)
- **Total si se hace todo:** ~300h / USD 3.440

**Visión de largo plazo:** la base propia que se está poblando desde YiQi es el cimiento de un futuro ERP completo para Dentalab.

---

# RECONCILIACIÓN 5/8/2026

**Fuentes cruzadas:** repo local `C:\dentalab-compras` · este MD (fechado 31/7) · Tulkas (98 riesgos abiertos, 0 tareas) · producción **no accesible**.

**Cobertura honesta:** el repo se verificó archivo por archivo. Producción **no se verificó**: el entorno de la sesión bloquea la salida a `supabase.co`, `api.yiqi.com.ar` y `vercel.app`. Todo ítem que dependa de la base o de la app desplegada está marcado `[sin verificar]`.

## HECHO — cerrado con evidencia

| # | Qué se cerró | Evidencia | Qué decía Tulkas |
|---|---|---|---|
| H-1 | **El filtro usuario↔proveedor SÍ se aplica** (Fase A) | `[repo 2026-08-05]` `usePermisos.js:182` `filtrarMaterial()`, `:203` `filtrarOrdenes()`; `MonitorStock.jsx:31` y `:48` lo aplican en la query de `count` y en las páginas paralelas; `:96` corta si `cargando`; `:225` muestra el aviso de vista filtrada | 4 riesgos abiertos (2 CRITICAL) diciendo que no filtra nada |
| H-2 | **Los badges del sidebar traen datos reales** | `[repo 2026-08-05]` `App.jsx:110` `supabase.rpc('contadores_sidebar')`, `App.jsx:132` `contadores={contadores}`; `Sidebar.jsx` recibe `badges` por prop | 3 riesgos (1 CRITICAL: "App.jsx nunca pasa la prop contadores") |
| H-3 | **`.env` está gitignoreado** | `[repo 2026-08-05]` `.gitignore:1` = `.env`; `git check-ignore .env` → ignorado; no figura en `git status` | 2 CRITICAL: ".env raíz sin gitignorear" |
| H-4 | **Los artefactos con datos de clientes están gitignoreados** | `[repo 2026-08-05]` `.gitignore:8-9` cubre `script-Exploracion/` y `yiqi-responses/`; `check-ignore` confirma ambos | 1 MEDIUM |
| H-5 | **Las 14 pantallas están ruteadas, ninguna en construcción** | `[repo 2026-08-05]` `App.jsx:26-41` + `:138-155` | 1 MEDIUM: "secciones sin desarrollo" |
| H-6 | **La columna Artículo ya no mapea un campo inexistente** | `[repo 2026-08-05]` `grep NOMBRE_ART frontend/src` → 0 resultados | 1 MEDIUM |
| H-7 | **No hay Fragment sin key en SeguimientoOC** | `[repo 2026-08-05]` `grep "Fragment\|<>" SeguimientoOC.jsx` → 0 resultados | 1 MEDIUM |
| H-8 | **El bearer token de YiQi está y funciona** | `[repo 2026-08-05]` `.env` tiene `YIQI_BEARER_TOKEN` (512 chars); `sync-yiqi/index.ts:379-381` usa smarties 2344/2345/2346 | 1 CRITICAL: "token no recibido — bloquea Sprint 1" |
| H-9 | **El formato de la API de YiQi está resuelto y documentado** | `[repo 2026-08-05]` `sync-yiqi/index.ts:237` parsea el pivot; este MD §"HECHOS TÉCNICOS DE YIQI" lo documenta | 1 HIGH: "nunca se hizo una llamada real" |
| H-10 | **La era prototipo quedó atrás** | `[repo 2026-08-05]` 24 archivos `.jsx/.js` en `frontend/src`, 3 Edge Functions en `supabase/functions` | 3 CRITICAL + 1 HIGH (`proyecto-solo-prototipo-html`, `integracion-yiqi-inexistente`, `desalineacion-stack-tecnologico`, "prototipo v7") |

## DESMENTIDO — el doc lo daba resuelto y no lo está

| # | Qué decía | Qué encontré | Cómo lo verifiqué |
|---|---|---|---|
| D-1 | Tulkas registra el proyecto con repo `federicoaf79/dentalab-compras`, como si el código estuviera publicado | **No había remoto configurado.** Un único commit (`db2b8f8`, instalación de skills). `frontend/` y `supabase/` untracked. Todo el proyecto vivía en un solo disco sin backup | `[repo 2026-08-05]` `git remote -v` → vacío; `git log --oneline` → 1 línea; `git status --porcelain` → `?? frontend/`, `?? supabase/`. **✅ Resuelto 6/8/2026** — ver INFRAESTRUCTURA |
| D-2 | Este MD presenta la seguridad como resuelta ("Fase B: RLS real en Postgres", criterio 1 ✅ COMPLETO) | **La RLS estaba salteada por diseño.** Las 3 Edge Functions corrían con `service_role` y ninguna validaba al llamante. Lo que pasaba por ellas ignoraba las políticas | `[repo 2026-08-05]` `grep "getUser\|rol\|esAdmin"` en las 3 → ninguna validación; `yiqi-connector:234`, `admin-usuarios:121`, `sync-yiqi:422` creaban el client con `SUPABASE_SERVICE_ROLE_KEY`. **✅ Resuelto y validado en vivo 7/8/2026** — ver VALIDACIÓN EN VIVO |
| D-3 | Este MD no menciona en ningún lugar que falten migrations | **`supabase/migrations/` no existe, y no hay ni un `.sql` en todo el repo.** El repo no describe la base | `[repo 2026-08-05]` `ls supabase/migrations` → No such file; `find . -name "*.sql"` → 0 resultados |
| D-4 | `dentalabs_Sup_KW.txt` figuraba en Tulkas 8 veces como riesgo abierto — pero sin confirmar si seguía vivo | **Sigue sin gitignorear y con la password de Postgres en claro.** Corregido en esta sesión (`.gitignore`), pero **la credencial ya estuvo expuesta y hay que rotarla** | `[repo 2026-08-05]` `git check-ignore dentalabs_Sup_KW.txt` → no ignorado; aparecía en `git status ??`. Rotación de credenciales sigue pendiente — Federico la hace directamente, Claude no maneja esas claves |
| D-5 | Este MD (31/7) describe el estado del proyecto | **Hay trabajo del 2/8 que el MD no refleja**: `App.jsx`, `Sidebar.jsx`, `OrdenesPropias.jsx`, `pdfOrden.js`, `Empresa.jsx`, `TemplatesMensajes.jsx`, `CatalogoCausas.jsx`, `ReglasAlertas.jsx`. De ahí salen H-1 y H-2 | `[repo 2026-08-05]` `find -newermt "2026-07-31"` sobre `frontend/src` |

## NUEVO — apareció y no estaba documentado en ningún lado

| # | Hallazgo | Evidencia |
|---|---|---|
| N-1 | **Copias `.bak` dentro de `supabase/functions/sync-yiqi/`** (`index.ts.bak`, `.bak2`). `supabase functions deploy` empaqueta el directorio entero: van al bundle de Deno en producción | `[repo 2026-08-05]` `find supabase/functions -name "*.bak*"`. **✅ Cerrado 10/8/2026** — ver PENDIENTE INMEDIATO #8 |
| N-2 | **Los smartieId documentados en `yiqi-connector` son los viejos.** El comentario dice 2340/2341/2343 y los ejemplos usan 2341; el sync real usa 2344/2345/2346 | `[repo 2026-08-05]` `yiqi-connector/index.ts:45-47,385,390` vs `sync-yiqi/index.ts:379-381` — **sigue abierto, cosmético** |
| N-3 | **`UsuariosAccesos.jsx:259` muestra un cartel falso al usuario**: "Esta asignación todavía no se aplica como filtro". El archivo es del 23/7, `usePermisos.js` del 31/7. Es el origen de los 4 riesgos falsos de H-1 | `[repo 2026-08-05]` `UsuariosAccesos.jsx:259` + fechas de mtime. `[chrome-live 2026-08-07]` confirmado que el cartel seguía en producción. **✅ Cerrado 10/8/2026** — commit `edce81b` |
| N-4 | **`UsuariosAccesos.jsx` no importa `usePermisos`** — es la única pantalla operativa sin gate de rol. Cualquier usuario logueado puede reasignar proveedores | `[repo 2026-08-05]` `grep esAdmin UsuariosAccesos.jsx` → 0 resultados; no figura en la lista de importadores de `usePermisos`. **✅ Cerrado 10/8/2026** — gate `esAdmin` real agregado, commit `edce81b`. El backend ya rechazaba a no-admins desde el 7/8, así que esto era UX/defensa en profundidad, no una vulnerabilidad activa |
| N-5 | **Son 21 archivos `.bak`**, no 18 ni 19: 19 en `frontend/src` + 2 en `supabase/functions` | `[repo 2026-08-05]` `find -name "*.bak*"`. **✅ Cerrado 10/8/2026** |
| N-6 | **La integración de Tulkas con GitHub está rota.** `get_commits(dentalab)` devuelve `Bad credentials`. Las auditorías de Tulkas **no están leyendo commits** — coherente con D-1 (no había nada que leer) | `[tulkas 2026-08-05]` respuesta de la herramienta. Con el remoto ya creado (6/8), revisar si esto se resuelve solo o si falta configurar credenciales de Tulkas contra el nuevo repo |
| N-7 | **Tulkas tiene 98 riesgos abiertos que son ~41 problemas reales.** 74 entradas son duplicados de 17 issues. El mismo problema entra con severidad distinta según la auditoría (los badges del sidebar están como CRITICAL y como LOW a la vez) | `[tulkas 2026-08-05]` agrupación de los 98 |
| N-8 | **El Project de Claude "Módulo Compras Dentalab" está vacío** (0 docs, 0 archivos). El MD de contexto vive solo en el repo | `[claude-project 2026-08-05]` `project_info`. **Resuelto** — este doc vive ahora en el Project |
| N-9 | **`App.jsx:187` pasa `onLoginExitoso={() => {}}`** — prop muerta. El login funciona solo por el listener `onAuthStateChange` | `[repo 2026-08-05]` `App.jsx:187`, `Login.jsx:27` |
| N-10 | **`ReglasAlertas.jsx:87-89` usa `Number()` sin validar** — un input vacío guarda 0 en `limite_aprobacion` en silencio | `[repo 2026-08-05]` `ReglasAlertas.jsx:87-89` — **sigue abierto** |
| N-11 | **No hay CI, ni tests, ni `.github/`** en el repo | `[repo 2026-08-05]` `ls .github` → no existe; `find "*.test.*"` → 0 |
| N-12 | `[chrome-live 2026-08-07]` **`aprobacionPendiente` (de `contadores_sidebar()`) no se ve en el sidebar hoy.** `[corregido 11/8/2026]` El motivo real no es que falte cablearlo en la UI (`Sidebar.jsx` YA tiene `<Badge valor={aprobacionPendiente} clase="nb-blu" />` dentro del NavItem de Alertas) — es que la función de Postgres nunca devuelve un valor distinto de 0 hoy, porque el flujo de aprobación en dos pasos (Sprint 2) todavía no está construido. Confirmado leyendo `Sidebar.jsx` línea por línea el 11/8 | `[chrome-live 2026-08-07]` capturas + llamada directa a `contadores_sidebar()` vía RPC comparada contra el DOM del sidebar. `[repo 2026-08-11]` lectura completa de `Sidebar.jsx` |
| N-13 | `[10/8/2026]` **Código muerto en `NuevaOC.jsx`**: el componente `ListaOrdenes` y las funciones `abrirOrden`/`decidir`/`enviarAAprobacion`/`borrarOrden` no tienen ningún botón que las invoque en la pantalla actual (la vista "lista" real es un selector de proveedor, `SelectorProveedor`). `decidir()`/`borrarOrden()` todavía usan `window.prompt`/`window.confirm` nativos — los mismos que se reemplazaron en `OrdenesPropias.jsx` el 10/8 — pero al ser código inalcanzable no hay riesgo activo para el usuario. Limpieza pendiente, no urgente | `[repo 2026-08-10]` `grep -n "ListaOrdenes\|abrirOrden\|onAbrir"` en `NuevaOC.jsx`: `ListaOrdenes` se define pero nunca se renderiza; `abrirOrden` se define pero nada la llama |

## CONTRADICCIONES

**C-1 — Edge Functions: ¿validan sesión o no? — RESUELTA.**
Tulkas tenía las dos versiones: "no valida sesión del llamante" y "solo valida JWT válido, no rol de negocio". `[repo 2026-08-05]` En el código **no había ninguna validación**: cero `getUser`, cero chequeo de rol en las 3 funciones. Las dos versiones eran parcialmente ciertas y el efecto práctico era el mismo: cualquiera con la anon key entraba. **✅ Cerrada 7/8/2026**: se agregó `supabase/functions/_shared/auth.ts` (`verificarLlamador()`) a las 3 funciones + CORS restringido a `ALLOWED_ORIGIN`. `[chrome-live 2026-08-07]` Validado en vivo contra producción: llamada solo con anon key → **401** en las 3 (`admin-usuarios`, `yiqi-connector`, `sync-yiqi`); llamada con la sesión real de Aris → **200**, devuelve los 4 usuarios reales correctamente.

**C-2 — Tabla `proveedores`: ¿existe? — RESUELTA.**
Este MD decía "existe pero está vacía". Tulkas decía "sin tabla ni UI". `[repo 2026-08-06]` La tabla existe y ahora tiene UI (`CondicionesProveedor.jsx`). Sigue vacía de datos reales — eso pasa a ESPERA A OTRA PERSONA, ya no es una contradicción.

**C-3 — Lógica de paginación duplicada: ¿6 o 7? — RESUELTA.**
Tulkas dice "7 pantallas" en un riesgo y "6 componentes" en otro. `[repo 2026-08-05]` Son **7**: `Alertas`, `HistorialOC`, `MonitorStock`, `OrdenesCompra`, `Proveedores`, `SeguimientoOC`, `UsuariosAccesos`. La versión de 6 omitía `UsuariosAccesos.jsx`.

## LO QUE NO ENCONTRÉ

Cada uno de estos es un hallazgo, no un vacío:

- **`supabase/migrations/`** — no existe. Tampoco hay ningún `.sql` en el repo. Sigue así al 7/8/2026.
- **`schema.sql`** — un riesgo CRITICAL de Tulkas ("Bearer token YiQi sin encriptar") cita `schema.sql:15` como evidencia. **Ese archivo no existe.** El riesgo apunta a la línea de un archivo fantasma; la preocupación de fondo (token en claro en `yiqi_config`, sin Vault) sigue en pie pero `[sin verificar]`.
- **`dentalab-compras-prototipo-v7.html`** — no existe. El archivo del repo es **v8**. Dos riesgos de Tulkas citan el v7 con números de línea.
- **`NOMBRE_ART`** — 0 apariciones en `frontend/src`.
- **`Fragment` / `<>` en `SeguimientoOC.jsx`** — 0 apariciones.
- **Cualquier `POST` a `/ORDEN_DE_COMPRA`** — 0 apariciones. Solo la whitelist de lectura en `yiqi-connector/index.ts:57`.
- **Código de Resend, WhatsApp o Puppeteer** — 0 líneas de integración automática. `[10/8/2026]` Matiz: sí existe un botón "Enviar por WhatsApp" en `NuevaOC.jsx` que arma un link `wa.me` con un template — abre WhatsApp con el texto ya cargado, pero el envío final lo hace la persona a mano, no es una API. Los dos riesgos HIGH de Tulkas ("Puppeteer incompatible con Deno", "dominio Resend sin verificar") siguen siendo preocupaciones sobre código que **todavía no existe** para el envío automático. No son defectos; son requisitos del ítem 2 de PENDIENTE INMEDIATO.
- **Remoto de git, CI, tests** — el remoto ya no aplica (creado 6/8/2026). CI y tests siguen sin existir.

---

# PENDIENTE INMEDIATO

Nueve, por impacto — actualizado 10/8/2026 con lo ya cerrado.

1. ~~Commitear todo y crear un remoto.~~ **✅ HECHO 6/8/2026** — `github.com/federicoaf79/dentalas_erp`, rama `main`, pusheado y confirmado por Federico.
2. **Rotar la password de Postgres y la anon key**, y sacar `dentalabs_Sup_KW.txt` del repo. El `.gitignore` ya lo cubre `[repo 2026-08-05]`, pero la credencial estuvo en claro en disco: ignorarla no la des-expone. **Sigue pendiente** — es una acción que hace Federico directamente en el dashboard, Claude no maneja esas credenciales. `[decisión 10/8/2026]` **Federico decidió explícitamente NO rotarlas por ahora**: confirmó que la credencial nunca salió de su entorno. Distinto del Personal Access Token de la CLI (`sbp_...`), que sí quedó expuesto en el chat dos veces esta sesión y **fue revocado** — ver SESIÓN 10/8/2026.
3. ~~Autorización en las 3 Edge Functions.~~ **✅ HECHO y validado en vivo 7/8/2026** — `verificarLlamador()` + CORS restringido, deployado, probado con anon-key-only (401 en las 3) y con sesión real (200). Ver contradicción C-1.
4. **Capturar el baseline de migrations desde prod** → `scripts/capturar-baseline.ps1`. Sin esto el repo no describe la base y la próxima sesión vuelve a adivinar. **Sigue pendiente** — Federico lo corre localmente. `[10/8/2026]` Se intentó: el script en sí tenía un bug (no chequea el exit code, reportaba "Listo" con archivos de 0 bytes) y además `supabase db dump --linked` ahora **requiere Docker Desktop instalado y corriendo localmente** (dependencia nueva de versiones recientes de la CLI). Se pospuso — no es urgente, no bloqueaba nada más esta sesión (las funciones que hacía falta ver se sacaron directo por SQL Editor). Instalar Docker Desktop implica permisos de administrador; evaluar cuándo convenga hacerlo.
5. **Verificar Fase B (RLS) en vivo** → `scripts/verificar-prod.ps1`, **logueado como Ivana en `https://dentalab-compras.vercel.app/login`** (no desde el SQL Editor: ahí `auth.uid()` es NULL). Es lo único que separa "el frontend filtra" de "los datos están protegidas". **Sigue pendiente** — no se corrió en ninguna sesión de agosto todavía.
6. **Crear los usuarios reales** en Supabase Auth + su fila en `usuarios_config` (Aris y Ivana). Sin la fila el sistema falla cerrado y no ven nada. **✅ Parcialmente hecho** — ambas cuentas ya existen y resuelven rol correctamente (validado 7/8/2026). Falta que Aris inicie sesión con la suya al menos una vez.
7. ~~Borrar el cartel falso de `UsuariosAccesos.jsx:259` y agregarle gate de `esAdmin` a la pantalla (N-3 y N-4).~~ **✅ HECHO 10/8/2026** — commit `edce81b`: gate `esAdmin` real (bloqueo total de contenido, no solo deshabilitar botones) + cartel corregido. Validado con esbuild. El backend ya rechazaba a no-admins desde el 7/8, así que esto cerraba UX/defensa en profundidad, no una vulnerabilidad activa.
8. ~~Limpiar los 21 `.bak`, empezando por los 2 de `supabase/functions/sync-yiqi/` que se despliegan a producción (N-1).~~ **✅ HECHO 10/8/2026** — movidos a `_to_delete/` (incluidos los 2 de `sync-yiqi/`); confirmado que `sync-yiqi/` quedó con solo `index.ts`. El mecanismo exacto de la limpieza final tuvo un detalle no del todo diagnosticado (ver SESIÓN 10/8/2026), pero el estado final (cero `.bak` en el repo) se verificó de forma independiente.
9. ~~Borrar o marcar las OC de prueba creadas en producción.~~ **✅ HECHO 10/8/2026, con una corrección importante en el camino:** se construyó una papelera reversible en `OrdenesPropias.jsx` (archivar → restaurar o eliminar definitivamente) en vez de un DELETE directo. Se archivaron **#3 (BERNABO) y #4 (QUINTANA ANA MARIA)** — las únicas confirmadas como prueba del 7/8. Se había asumido en un momento de esta misma sesión que **#6 y #7 (DENTAL MEDRANO) también eran de prueba — eso era incorrecto** y se corrigió antes de tocar nada: se verificó en vivo que DENTAL MEDRANO es proveedor real (código 3, 1.811 artículos en `material_yiqi`, con stock actual) y que las OC #2, #5, #6, #7 fueron creadas por Ivana y Aris (columna "Creada por", nueva) en el uso real del sistema. Ninguna de esas cuatro se tocó. Detalle completo en SESIÓN 10/8/2026, sección 7.
10. ~~Deployar y validar en vivo la limpieza de alertas (Etapa 1).~~ **✅ HECHO 11/8/2026** — `git push` (commit `9146741`) + `vercel --prod` confirmados; validación en vivo con Chrome (baseline 2603/450/3053, ciclos completos de pausar/reactivar y excluir/restaurar sobre SKU 1107, sin datos de prueba residuales). Ver SESIÓN 11/8/2026, sección 8.

# ESPERA A OTRA PERSONA

| Qué se necesita | De quién | Desde cuándo | Qué bloquea |
|---|---|---|---|
| Condiciones comerciales de los 15-20 proveedores principales (mínimo de compra, plazo, descuentos, mail/WhatsApp de pedidos) | **Aris** | 31/7/2026 | Cargar los datos en `CondicionesProveedor.jsx` (el diseño — reglas por perfil de proveedor — ya está confirmado y cerrado, decisión de negocio #13). Es lo más bloqueante del lado del cliente |
| Confirmar que el **módulo Compras está activo en la licencia de YiQi** | **Aris** / soporte YiQi | desde el inicio del proyecto | `POST /ORDEN_DE_COMPRA` — criterio 5 del MVP. Sin esto no se puede ni probar |
| Decisión sobre las smarties: avisar al equipo vs. crear usuario `sistema@dentalab.com.ar` con Integrador | **Aris** | 31/7/2026 (tras el incidente de la 2344) | Que se repita la pérdida de columnas en los 7.173 artículos |
| ~~Lista de composición de combos ML (49) y fraccionados (`-F`, 234)~~ | **Aris** | 31/7/2026 → **respondido y cargado 8-11/8/2026** | **✅ Resuelto por completo** — 44 filas cargadas en `composicion_articulos` (41 del 10/8 + 3 del combo Speedex `21081` confirmado por Aris el 11/8), integradas al cálculo |
| ~~¿Límite de aprobación por proveedor, o sigue global en $1.000.000?~~ | **Aris** | 31/7/2026 → **respondido y implementado 7/8/2026** | **✅ Resuelto por completo** — el límite es sobre Ivana; Aris confirma cualquier orden directo (commit `41febe8`) |
| ¿Se corrige el −58 de "En tránsito" del SKU 1002 en YiQi? | **Aris** | 31/7/2026 | Nada crítico; queda como dato sucio |
| Qué significa el campo **Asunto** de las OC (29 de 55 dicen "Listo- dsps borrar contenido") | **Ivana** | 31/7/2026 | Convertirlo en estado del pedido, si es que lo es |
| Validación del catálogo de causas y de su rutina diaria de pedidos | **Ivana** | 31/7/2026 | Ajuste fino del flujo operativo |
| **Capacitación** (1 hora) | **Ivana** | pendiente, sin fecha | Criterio 7 del MVP — el último que falta para cerrar el contrato |
| **Feedback del testeo del sitio** — Federico les mandó la guía de testeo (Word, 11/8/2026: qué está construido, qué probar esta ronda — alertas, condiciones comerciales, WhatsApp —, qué no hace todavía, y qué datos cargar) | **Aris** e **Ivana** | 11/8/2026 | Saber si algo de lo construido no funciona como esperan antes de seguir avanzando |
| ~~Crear en YiQi una smartie (vista guardada) para "Stock por Depósito" y otra para "Movimientos de Stock"~~ | **Federico** | 11/8/2026 → **hecho 14/8/2026** | **✅ Resuelto.** `Z.API_Stock_Por_Deposito_NO_BORRAR` (smartieId **2360**, entidad `STOCK`, pivot SKU × Ubicación con Cantidad) y `Z.API_Movimientos_Stock_NO_BORRAR` (smartieId **2359**, entidad `MOVIMIENTO_STOCK`, sin pivot) creadas y guardadas con prefijo `Z.` para no ensuciar la lista de vistas. Ver SESIÓN 14/8/2026 |
| **Confirmar si Acritone/NewcryL son productos activos o descontinuados** — el documento nuevo de Aris dice que se manejan 100% en local con alta disponibilidad; la sesión del 10/8 los había anotado como descontinuados (mismo criterio que BM4) | **Aris** | 11/8/2026 | Posible contradicción sin resolver — no se asumió ninguna de las dos versiones. Ver `ARIS_Especificacion_Reposicion_Interna_y_Produccion.md` |
| ~~Regenerar el token de integración con YiQi (`POST /token` con las credenciales de la cuenta de integración) y cargarlo en `yiqi_config`~~ | **Federico** | 14/8/2026 → **hecho el mismo día** | **✅ Resuelto.** Token nuevo generado (265 caracteres) y cargado en `yiqi_config`; sync probado en vivo (7185 filas de MATERIAL) y confirmado en el Monitor de Stock. Ver SESIÓN 14/8/2026 |

---

# VALIDACIÓN EN VIVO 7/8/2026

**Contexto:** tras crear el repo remoto (6/8) y cerrar el hueco de autorización en las 3 Edge Functions (deploy `3ef2edc` + `supabase functions deploy`), y tras deployar el fix del badge del sidebar (commit `c0ea403`, subido a Vercel por Federico), se validó todo en vivo contra **producción** (`https://dentalab-compras.vercel.app`) usando Claude in Chrome, logueado como Aris.

**Metodología de acá en adelante (instrucción explícita de Federico):** revisar siempre lo hecho antes de cambiar algo, no romper nada, validar cada construcción — en vivo cuando aplica — y priorizar gaps de seguridad/vulnerabilidades.

## Qué se validó

1. **Fix del badge (`c0ea403`) — deployado y sin errores, con un matiz importante.**
   - `[chrome-live 2026-08-07]` Se confirmó que el bundle de producción (`index-CQKK2wJ0.js`) contiene el wiring `onCambioOrdenes` (evidencia de que el commit está desplegado).
   - Se creó una OC de prueba (#3, BERNABO, $1.174.573 — supera el límite de $1.000.000) → quedó "Esperando aprobación de Aris" → se aprobó sin recargar la página → la lista de "Órdenes de compra" pasó de `Esperando aprobación (1)` a `(0)` **instantáneamente, sin F5**.
   - Se creó una segunda OC de prueba (#4, QUINTANA ANA MARIA, ~$3.413 — dentro del límite) → se auto-confirmó directo.
   - **Matiz:** el badge numérico del sidebar junto a "Órdenes de compra" (`ocsActivas`) **no cambió** en ningún momento de la prueba (se mantuvo en 51). Se verificó con una llamada directa a `contadores_sidebar()` que el valor mostrado siempre coincidió con el valor real en base — es decir, no hubo staleness, pero tampoco se pudo observar el badge "subir" porque `ocsActivas` cuenta únicamente OC en estado `Enviada`, y **ninguna OC nueva llega hoy a ese estado** (el paso de envío al ERP/proveedor no está construido — lo dice el propio banner de la pantalla). Y `aprobacionPendiente` (que sí hubiera reflejado la OC #3 mientras esperaba aprobación) sí está cableado en el sidebar (badge azul, ver corrección de N-12), pero como siempre valió 0 en esa prueba puntual (la OC ya se había aprobado para cuando se revisó), no se vio "subir" en esa validación puntual.
   - **Conclusión:** el fix está deployado y funcionando (confirmado a nivel código y a nivel de la lista de "Esperando aprobación" que sí se refresca sola). No se pudo reproducir visualmente el síntoma original exacto ("el badge no bajaba") porque, con los datos de prueba disponibles, ese contador específico no varía todavía por diseño del flujo actual. Si el síntoma que reportaron era otro (por ejemplo el badge de "Seguimiento de OC"), avisar para probarlo puntualmente.

2. **Autorización de las 3 Edge Functions — sin regresión tras el último deploy.**
   - `admin-usuarios`, `yiqi-connector`, `sync-yiqi`: llamada con **solo la anon key** (sin sesión) → **401 "Sesión inválida o vencida"** en las 3.
   - `admin-usuarios?accion=listar` con la sesión real de Aris → **200**, devuelve los 4 usuarios reales.
   - Sin errores de consola durante todo el flujo.

3. **Hallazgo de negocio (no técnico):** Federico aclaró en esta sesión que el límite de aprobación es sobre Ivana, no sobre Aris — y la prueba en vivo mostró que en ese momento el código no hacía esa distinción. `[actualización 11/8/2026]` Se corrigió esa misma tarde del 7/8 (commit `41febe8`), fuera de esta sesión — el hallazgo quedó cerrado el mismo día en que se abrió, pero el documento nunca se actualizó para reflejarlo hasta que se encontró el commit el 11/8. Ver DECISIONES DE NEGOCIO CONFIRMADAS POR ARIS #11 y SESIÓN 11/8/2026.

## Qué quedó pendiente de esta validación

- Confirmar el próximo tick automático del cron de `sync-yiqi` (jobid 3, cada 15 min) o revisar logs de la función, para el 100% de certeza de que el token de `pg_cron` sigue funcionando tras el redeploy.
- ~~Borrar o marcar como prueba las OC #3 y #4 (PENDIENTE INMEDIATO #9).~~ **✅ HECHO 10/8/2026.**
- Decidir la implementación del ítem 12 (Aris sin límite de aprobación).


---

# SESIÓN 10/8/2026

**Contexto:** mientras se esperaban las últimas respuestas de Aris (kit Speedex, BM4, Abrebocas), se avanzó todo lo posible del lado técnico. Instrucción explícita de Federico para la sesión: *"quiero precisión y certezas de que todo se hace bien"* — no asunciones.

## 1. UI — modal propio reemplaza diálogos nativos

`OrdenesPropias.jsx`: los `window.prompt()`/`window.confirm()` nativos (aprobar/rechazar/borrar OC) se reemplazaron por un modal propio, con los mismos tokens visuales del resto de la app. Commit `ac7cf7a`. Validado en vivo: se aprobó la OC #7 y el badge de "Alertas" desapareció sin recargar.

## 2. Fix de deploy de Vercel

`vercel --prod` tiene que correrse **desde la raíz del repo** (`C:\dentalab-compras`), no desde `frontend\` — el Root Directory ya está configurado en el proyecto de Vercel. Corriéndolo desde `frontend\` fallaba.

## 3. Tabla `composicion_articulos` — creada, con RLS, y poblada

Resuelve el gap documentado desde el 31/7 ("Composición de combos y conversión de fraccionados"): el consumo se registraba sobre el código que aparece en la venta (ej. "245-F", o una publicación de ML como "251"), pero lo que hay que comprar es otro código, en otra proporción.

- **Migration `20260810000000`**: crea la tabla (`codigo_padre`, `codigo_componente`, `cantidad`, `tipo`, `nota`) + 41 filas cargadas, cruzando las respuestas de Aris por WhatsApp contra `PEDIDO_Aris_combos_y_presentaciones.docx`, con **cada código verificado en vivo contra `material_yiqi`** antes de cargarlo (no se asumió ningún código de memoria).
- **Migration `20260810000100`**: la primera corrida dejó la tabla sin RLS ni GRANT (Supabase no lo hace automático en tablas creadas por SQL crudo) — devolvía `200 OK` con array vacío para cualquier consulta. Se detectó por validación en vivo, no se asumió que "corrió bien" = "funciona". Se agregó: lectura abierta a cualquier usuario logueado, escritura restringida a `es_admin()`. Validado: 41 filas visibles (7 fraccionados + 34 combos).

## 4. Bloque 1 — integración en el cálculo real, con validación matemática

Se obtuvo el código real de `sugerencias_compra()` e `historial_ventas()` vía SQL Editor (no se asumió su contenido) y se modificó el `CTE` que agrupa ventas en ambas para traducir código vendido → código a comprar, vía `composicion_articulos`, antes de calcular promedios. Migration `20260810120000`.

Detalles de diseño:
- Códigos sin fila en `composicion_articulos` siguen contándose igual que antes (multiplicador 1) — sin cambio de comportamiento para el 99% de los artículos.
- Combos con varios componentes (ej. "251" → 7 colores) expanden una venta en varias líneas de demanda.
- Filas con `cantidad` NULL (ej. "244-F", "según necesidad") quedan excluidas del cálculo automático, tal como pidió Aris.
- En `historial_ventas()` se agregó además una pre-agregación por (código, mes) **antes** de armar el JSON mensual — si no, un componente con ventas directas + traducidas en el mismo mes perdía una de las dos silenciosamente por colisión de clave en `jsonb_object_agg`. Se detectó por revisión de la lógica, no en producción.
- `proveedor` en `historial_ventas()` pasó a salir de `material_yiqi.clie_nombre` (antes venía de la venta original) — decisión confirmada con Federico, porque para un código traducido el proveedor real del componente puede no coincidir con el de la venta de la publicación.

**Validación en vivo (SQL Editor, no solo "corrió sin error"):**
- Para "245": venta directa (6u) + venta traducida de "245-F" (386 × 0.05 = 19.3) = 25.3 exacto — coincide con lo que devuelve `historial_ventas()`.
- Prueba aislada (sin tocar datos reales): una venta simulada del combo "251" se expandió correctamente en las 7 filas de color con la cantidad multiplicada bien; un código sin mapeo pasó igual (multiplicador 1); "244-F" quedó excluido.
- Los 3 caminos de la lógica (passthrough, combo, exclusión por NULL) quedaron probados con certeza matemática, no solo revisión de código.

**Pendiente:** correr `git push` — quedaron 3 commits locales sin subir a `origin/main` (`326047d`, `5cb1d53`, `a139f47`).

## 5. Supabase CLI — bug de persistencia de token resuelto

`capturar-baseline.ps1` fallaba con `supabase projects list` mostrando siempre "Comunas MVP"/"Curex Lat" en vez de "Dentalabs", pese a que el dashboard (navegando directo) confirmaba a `federico@tulkasmedia.com` como **Owner** de Dentalabs/UrbanTales. Cadena de causas encontradas y cerradas, en orden:

1. Una variable de entorno `SUPABASE_ACCESS_TOKEN` persistente a nivel Usuario en Windows, con un token viejo de otra cuenta, pisaba cualquier login nuevo. Se detectó y se limpió (`[Environment]::SetEnvironmentVariable(...,"User")`).
2. **CLI duplicada**: instalada por Scoop y por npm a la vez; Windows resolvía siempre la de Scoop, que estaba en v2.104.0 (con un bug real de no persistir el token tras el login). Se actualizó a v2.113.0 con `scoop update supabase`. Pendiente, sin apuro: desinstalar la copia de npm (`npm uninstall -g supabase`) para evitar ambigüedad futura.
3. Con la CLI actualizada, `supabase login` + `projects list` ya muestra "Dentalabs" correctamente, linkeado (●).

⚠️ **Nuevo hallazgo de seguridad, ya cerrado:** en el proceso de diagnóstico se expuso en el chat un Personal Access Token real (`sbp_c5823cc445a5c4b7e9b68155f5f8b6...`, visible en una captura de pantalla). **Fue revocado por Federico** — confirmado el 10/8/2026.

## 6. Respuestas finales de Aris — verificadas en vivo, no asumidas

- **BM4 Power Bleaching** (`6527-2`, `6539-2`): confirmado discontinuado ("no lo trabajamos más"). Excluido del sistema, mismo criterio que Acritone/NewcryL — no necesita fila en `composicion_articulos`.
- **Abreboca `40-2`**: la publicación de ML ya no existe (confirmado por Federico). Sin fila necesaria.
- **Abreboca `41-2`**: confirmado por Aris que no se usa más, mismo tratamiento. Verificado además en vivo que no existe ningún código "41" base ni variantes `41-M`/`41-L` en `material_yiqi` — el único código relacionado en todo el sistema es `41-2`, sin proveedor asignado.
- **Kit Speedex** (`21087`): Aris dio los códigos `21082`, `21084`, `21085`. Verificado en vivo: `21084` = "Silicona Speedex Light...140ml" ✅ y `21085` = "Silicona Speedex Activador Universal...60ml" ✅ existen. **`21082` (la masa) NO existe en `material_yiqi`** — único punto que sigue abierto. Federico ya le envió la pregunta a Aris; sin responder al cierre de esta sesión. `[11/8/2026]` Continúa en SESIÓN 11/8/2026.

## 7. Papelera reversible para Órdenes de compra

Más tarde el mismo 10/8, mientras se cerraba el Bloque 6 (limpiar OC de prueba), Federico pidió algo más amplio: unificar la gestión de Órdenes de compra en una sola pantalla ordenada por fecha, mostrar quién creó cada orden, priorizar las pendientes de aprobar arriba de todo, y reemplazar cualquier borrado directo por un archivado reversible ("tacho de basura" → papelera → restaurar o eliminar definitivo, con la posibilidad futura de editar y reenviar).

Se dividió el pedido en dos partes con Federico — decisión suya, explícita:
- **Parte A (hoy):** unificar pantalla, nombre del creador, orden con pendientes arriba, archivar/restaurar/eliminar.
- **Parte B (otra sesión):** editar una orden ya aprobada y reenviarla por WhatsApp con registro de "modificado por Aris" — no se tocó, toca montos e inventario y merece diseño propio. Ver "LO QUE SIGUE" ítem 13.

**Antes de tocar código** se revisaron `OrdenesPropias.jsx` y `NuevaOC.jsx` completos y se encontraron tres cosas que cambiaron el plan:
- `NuevaOC.jsx` tiene una implementación duplicada de lista/aprobación de OC (`ListaOrdenes`, `decidir`, `borrarOrden`, con `window.prompt`/`window.confirm` nativos) que resultó ser **código muerto** — inalcanzable desde la UI actual. No se tocó (fuera de alcance), ver N-13.
- "Enviar por WhatsApp" ya existe, pero solo al crear una orden nueva: arma un link `wa.me` con un template, no envía nada automáticamente.
- `creada_por` se guardaba desde siempre pero nunca se mostraba en ninguna pantalla.

**Migration `20260810150000`:**
- `ordenes_propias` suma `archivada_en` / `archivada_por` — no se tocó la columna `estado` existente, para no arriesgar el circuito de aprobación real que ya depende de sus 4 valores exactos en dos archivos distintos.
- Función `nombres_usuarios(uuid[])` — `SECURITY DEFINER`, mismo patrón que `es_admin()`/`mis_codigos_proveedor()` — porque `usuarios_config` tiene RLS por usuario y el frontend no puede leer el nombre de otro usuario por join directo.
- Corrida por Federico vía SQL Editor ("Success. No rows returned").

**Frontend (`OrdenesPropias.jsx`):**
- Columna "Creada por" (resuelta vía la función nueva).
- Orden: pendientes de aprobar siempre arriba, resto por fecha de creación descendente.
- Tacho 🗑 (solo admin) en cada fila de la vista activa → archiva, reversible. Pestaña "🗑 Papelera" (solo admin) → "Restaurar" o "Eliminar definitivamente" (esto sí irreversible, con modal de confirmación nuevo, distinto del modal de borrar-borrador que ya existía).
- Validado con esbuild antes de entregar. Commit `fa39d48`, pusheado y deployado a producción por Federico (`vercel --prod`).

**Validado en vivo (Chrome, logueado como Aris) después del deploy:**
- Columna "Creada por" mostró correctamente **Ivana** (OC #7, #6, #2) y **Aris** (OC #5, #4, #3) — confirma que `nombres_usuarios()` funciona.
- Se archivaron en vivo **OC #3 y #4** (único par confirmado como prueba) con el tacho nuevo: "Órdenes (6)"→"(4)", "Papelera (0)"→"(2)", mensaje de confirmación en pantalla, ambas reaparecieron en la pestaña Papelera con "Restaurar"/"Eliminar definitivamente" disponibles.
- **No se tocaron** OC #2 (BUDA PABLO, creada por Ivana), #5, #6, #7 (DENTAL MEDRANO, creadas por Ivana y Aris). Dato importante: en esta misma sesión se había asumido en un momento que #6/#7 también eran de prueba del 7/8 — **esa asunción era incorrecta**, y se corrigió antes de archivar nada: se verificó en vivo contra `material_yiqi` y `ordenes_yiqi` que DENTAL MEDRANO (código 3, 1.811 artículos, con stock actual en Monitor de Stock) y BUDA PABLO (código 242, 4 OC históricas reales en `ordenes_yiqi`) son proveedores reales y activos, y que esas 4 órdenes las crearon Ivana y Aris en el uso normal del sistema.

## Pendientes para la próxima sesión

1. ~~Código de la masa del kit Speedex (Aris dio "21082", no existe).~~ **✅ Cerrado 11/8/2026** — Aris confirmó la composición del combo `21081` (masa `21083` + light `21084` + activador `21085`); cargado en `composicion_articulos`. Ver SESIÓN 11/8/2026.
2. `scripts/verificar-prod.ps1` logueado como Ivana (Fase B / RLS) — PENDIENTE INMEDIATO #5. Requiere el login real de Federico/Ivana, Claude no maneja esas credenciales.
3. **Código muerto en `NuevaOC.jsx`** (N-13) — no es urgente, no afecta producción, pero conviene limpiarlo para que no confunda a una futura sesión (tiene `window.prompt`/`window.confirm` que parecen vigentes y no lo están).
4. Capturar el baseline con `capturar-baseline.ps1` una vez que se instale Docker Desktop (no urgente).
5. Desinstalar la copia duplicada de la CLI de Supabase vía npm (`npm uninstall -g supabase`), no urgente.
6. **Parte B de la papelera de Órdenes de compra** (ver "LO QUE SIGUE" ítem 13): editar una orden ya aprobada, recalcular el total, regenerar y reenviar por WhatsApp, con registro de "modificado por Aris". Funcionalidad nueva — no se abordó esta sesión a propósito (decisión explícita de Federico: solo Parte A hoy).

---

# SESIÓN 11/8/2026

**Contexto:** Federico aclaró que la masa del kit Speedex ya no se vende en la presentación chica (la del kit trial de MercadoLibre, código `21087`, 362g) — hoy se vende la presentación grande u otra presentación existente. Esto apunta a resolver el único punto pendiente de la integración de `composicion_articulos` del 10/8 (el código "21082" que había dado Aris nunca existió en `material_yiqi`).

**Investigación en vivo (SQL Editor, `material_yiqi`, proveedor DENTAL MEDRANO):**

| Código | Nombre | Stock |
|---|---|---|
| 21081 | COMBO - Silicona Speedex Combo Kit Putty 1.48kg + Light + Activador | 485 |
| 21083 | Silicona Speedex Putty Masa COLTENE 1.48kg | 157 |
| 21084 | Silicona Speedex Light (Liviana 7 días) COLTENE x 140ml | 314 |
| 21085 | Silicona Speedex Activador Universal COLTENE 60ml | 863 |
| 21087 | ### MercadoLibre SILICONA SPEEDEX TRIAL KIT MASA 362G + Light 60ml + Activador 40ml | **0** |

El kit de MercadoLibre (`21087`, el que tiene la masa chica de 362g) tiene **stock 0** — coherente con que Federico confirmó que esa presentación ya no se vende. La masa en presentación grande es `21083` ("Masa COLTENE 1.48kg"), que además coincide en tamaño con el combo `21081` (también 1.48kg). Conclusión técnica: **`21083` es el candidato correcto** para reemplazar el código inexistente `21082` que había dado Aris como componente del kit en `composicion_articulos`.

**Decisión de Federico (en el momento):** dejarlo anotado como pendiente de validación explícita — no cargar el código en `composicion_articulos` todavía. Se le pidió confirmación directa a Aris antes de tocar la tabla, siguiendo el criterio de la sesión de no asumir datos de negocio sin que el cliente los confirme, aun cuando la evidencia técnica ya fuera consistente.

**✅ Confirmado y cargado, más tarde el mismo 11/8/2026.** Aris contestó: **"21081 = 21083+21084+21085"** — no sobre `21087` (el kit chico, ya confirmado que no se vende más), sino sobre `21081` (el combo grande, "COMBO - Silicona Speedex Combo Kit Putty 1.48kg + Light + Activador"), la presentación que sí se vende hoy. La respuesta confirma exactamente lo que había encontrado la investigación técnica: `21083` = masa, `21084` = light, `21085` = activador.

Antes de escribir el `INSERT` se le pidió a Federico una muestra de las filas de combos ya cargadas (`select ... where tipo = 'combo' limit 5`) para no adivinar el formato — confirmó que `cantidad` es la unidad de cada componente por combo y `tipo='combo'`. Con eso se armó la migration **`20260811000200_agregar_combo_21081_speedex.sql`**: un `INSERT ... WHERE NOT EXISTS` (idempotente, no duplica si se corre dos veces) que agrega las 3 filas de `21081` sin tocar `21087` — esa fila queda con su componente inválido (`21082`) sin corregir, a propósito, porque el SKU está discontinuado y no afecta ningún cálculo real.

Corrida por Federico vía SQL Editor ("Success. No rows returned") y **validada en vivo** con `select ... where codigo_padre = '21081'`: devolvió las 3 filas esperadas (`21083` masa, `21084` light, `21085` activador), cada una con `cantidad=1` y la nota descriptiva correcta.

**Gap de "Composición de combos y conversión de fraccionados" cerrado por completo** — `composicion_articulos` queda en 44 filas.

**No se tocó ninguna otra tabla ni migration en esta parte de la sesión.**

## 8. Limpieza de alertas — Etapa 1

**Contexto:** más tarde el mismo día, Federico compartió capturas del Monitor de Stock en producción mostrando **2603 alertas críticas + 450 preventivas = 3053 en total**, y pidió reducir el ruido con dos reglas: (a) dejar de contar alertas de artículos que hace 3 años no se compran o no tienen ingresos de mercadería (sin borrarlos — se dejaron de fabricar, cambiaron de SKU, lo que hay en stock son saldos, etc.), y (b) poder pausar la alerta de faltante de un proveedor puntual, con un recordatorio a los 15 días para revisar si sigue en el mismo estado. También corrigió que "condiciones comerciales" ya es una decisión de diseño cerrada (reglas por perfil de proveedor), no un punto abierto — ver decisión de negocio #13.

**Por qué había 3053 alertas:** `Alertas.jsx` (`calcularAlerta()`) y `contadores_sidebar()` calculaban el nivel de alerta puramente por stock vs. umbral, **sin ningún filtro** — a diferencia de `sugerencias_compra()`, que ya excluye Mercado Libre, discontinuados (por patrón de nombre) y producción propia vía `es_comprable()`.

**Investigación de qué datos existen** antes de proponer una solución (no se asumió que "3 años sin compra" fuera algo que ya se pudiera calcular):
- `material_yiqi` es un espejo puro de stock (confirmado releyendo `mapearMaterial()` en `sync-yiqi/index.ts`) — no tiene fecha de última compra ni de último ingreso.
- `ordenes_yiqi` tiene fecha, pero son solo ~55 OC / ~291 líneas recientes (smartie "API_OC_Recientes") — insuficiente para una ventana de 3 años.
- `MOVIMIENTO_STOCK` (25.302 registros de ingresos) tiene lo que hace falta, pero no está sincronizado — ya estaba identificado como pendiente futuro (ítem 11 de "LO QUE SIGUE").
- No existe en ningún lado del esquema un mecanismo de "excluido"/"discontinuado" — confirmado con grep de todo el repo (`.sql`/`.ts`/`.jsx`) y revisando las 4 migrations existentes.

**Diseño acordado con Federico** (4 rondas de `AskUserQuestion`, resumidas):
1. Fuente de datos para la regla de 3 años → **las dos, en etapas**: exclusión manual ahora (Etapa 1), sincronizar `MOVIMIENTO_STOCK` más adelante (Etapa 2, ligada al ítem 11/16 de "LO QUE SIGUE").
2. Alcance de la pausa → **por artículo** (SKU puntual, no por proveedor completo).
3. Tipo de aviso a los 15 días → **aviso activo** (badge en el sidebar), no solo que la alerta reaparezca en silencio.
4. Sin integración de email/WhatsApp todavía → **badge/banner en la app** (no esperar a esa infraestructura).

Con el "dale" de Federico, se construyó la **Etapa 1**:

**Base de datos** (2 migraciones, corridas por Federico vía SQL Editor, "Success. No rows returned" en las dos, validadas en vivo):
- `20260811000000_alertas_exclusion_pausa.sql` — crea `articulos_excluidos_alertas` (SKU + motivo obligatorio + quién + cuándo; RLS: lectura para cualquier logueado, escritura solo admin — mismo criterio que `reglas_compra`/`composicion_articulos`, porque afecta el conteo de todos) y `alertas_pausadas` (SKU + motivo opcional + quién + cuándo + `reactivar_en`; RLS: lectura y escritura abiertas a cualquier logueado, porque pausar es una acción operativa del día a día, no una decisión de negocio). `reactivar_en` **no** se hizo con `GENERATED ALWAYS AS` (Postgres lo rechazó: error `42P17`, sumar un `interval` a un `timestamptz` no es IMMUTABLE por el cambio de horario de verano) — se resolvió con un trigger `BEFORE INSERT OR UPDATE` que siempre recalcula `reactivar_en = pausada_en + 15 días`, sin depender de lo que mande el frontend.
- `20260811000100_integrar_exclusion_pausa_en_contadores.sql` — `CREATE OR REPLACE` completo de `contadores_sidebar()` (se obtuvo el cuerpo exacto vía `pg_get_functiondef` antes de tocarla, no se asumió nada): la CTE `mat` ahora descarta los códigos excluidos y los pausados vigentes (`reactivar_en > now()`); se agregó la CTE `pausadas_vencidas` y la clave `alertasPausadasVencidas` al jsonb de salida. `oc`, `oc_estado` y `propias` quedaron sin ningún cambio.
- **No se tocó `es_comprable()`**: recibe nombre/proveedor, no el código del artículo — no puede consultar estas tablas nuevas sin cambiarle la firma y tocar `sugerencias_compra()`, que es otra pantalla y ya funciona bien.
- **Validado en vivo** con `select contadores_sidebar();` después de las dos migraciones: `alertasCriticas: 2603, alertasPreventivas: 450` (exactamente los mismos números que las capturas de producción, porque las tablas nuevas estaban vacías), `alertasPausadasVencidas: 0` (clave nueva, presente y en 0), resto de los contadores sin cambios.

**Frontend** (`Alertas.jsx` reescrito a v4, `Sidebar.jsx` con un campo nuevo; ambos validados con esbuild, entregados, y escritos en el repo local vía el puente al dispositivo):
- `conAlertaTodas` ahora descarta los códigos excluidos y los pausados vigentes, con la misma lógica que `contadores_sidebar()`.
- Pestañas nuevas junto a "Alertas": **"Excluidos"** (solo visible para admin) y **"Pausadas"** (visible para cualquiera).
- Botón "⏸ Pausar" en cada fila de alerta (cualquier usuario) y "🚫 Excluir" (solo admin) — abren un modal propio con motivo (obligatorio para excluir, opcional para pausar), mismo patrón visual que el modal de `OrdenesPropias.jsx` (no `window.prompt`/`window.confirm`).
- Pestaña Excluidos: tabla con motivo, quién y cuándo (vía `nombres_usuarios()`, mismo patrón que "Creada por" de Órdenes de compra) + botón "♻ Restaurar".
- Pestaña Pausadas: igual, más la fecha en que reactiva o un badge "Vencida — volvió a contar" si ya pasó, + botón "▶ Reactivar ahora" para sacar la pausa antes de que venza.
- Banner ámbar arriba de la vista de Alertas cuando hay pausas vencidas, con link directo a la pestaña Pausadas.
- `Sidebar.jsx`: nuevo badge azul (`nb-blu`, clase ya existente en `index.css`) para `alertasPausadasVencidas`, mismo patrón que los demás badges (no se dibuja si es 0).

**✅ Deployado y validado en vivo — 11/8/2026.** Federico corrió `git add`/commit/`git push`, resolviendo en el camino dos rondas de locks de git stale (`index.lock` primero, después `HEAD.lock` + `objects/maintenance.lock`, ambos con fecha de varios días antes de esta sesión — confirmado como stale, no un proceso corriendo de verdad, porque `git push` funcionaba igual de forma independiente): commit **`9146741`** en `main`. `vercel --prod` confirmó la URL de producción activa.

**Validación en vivo (Chrome, logueado como Aris, contra `https://dentalab-compras.vercel.app`):**
- Baseline confirmado sin tocar nada: **2603 críticas / 450 preventivas / 3053 total** — coincide exacto con las capturas de producción de antes de esta sesión.
- **Ciclo de pausa** sobre SKU **1107**: pausar → contadores bajan a 2602/450/3052, la fila aparece en la pestaña "Pausadas" con nombre de quien pausó y fechas correctas (pausada el / reactiva el) → "▶ Reactivar ahora" → contadores vuelven a 2603/450/3053, pestaña Pausadas vuelve a 0.
- **Ciclo de exclusión** sobre el mismo SKU 1107: excluir (con motivo) → contadores bajan, la fila aparece en la pestaña "Excluidos" (solo admin) con motivo/nombre/fecha correctos → "♻ Restaurar" → contadores vuelven a la baseline, pestaña Excluidos vuelve a 0.
- Ambos ciclos se probaron y revirtieron limpiamente: **no quedaron datos de prueba colgando** en `articulos_excluidos_alertas` ni en `alertas_pausadas`.

**Etapa 1 cerrada por completo** — badges, tabs, modales y ambas tablas funcionando de punta a punta en producción.

**Etapa 2 (futura, explícitamente diferida):** sincronizar `MOVIMIENTO_STOCK` desde YiQi para automatizar la detección de "3 años sin compra/ingreso" en vez de depender de la carga manual — ítem 16 de "LO QUE SIGUE", ligado al ítem 11 (Módulo de stock por depósito).

## Pendiente

- Etapa 2 de la limpieza de alertas (sincronizar `MOVIMIENTO_STOCK`) — futura, no urgente, ítem 16 de "LO QUE SIGUE".

## 9. Preparando el envío a testeo — se encontró info vieja en el documento

Federico pidió armar una guía de testeo en Word para mandarle a Aris e Ivana. Al redactar la sección de "qué no hace todavía" se escribió, por copiar lo que decía este documento, que el límite de aprobación de $1.000.000 le pedía aprobación también a Aris. Federico marcó que eso estaba mal: "Aris no tiene límites para pedir ni comprar ni nada."

**Investigación (no se asumió que Federico tuviera razón sin revisar el código, ni que el documento tuviera razón sin revisar el código):** se leyó `NuevaOC.jsx` en el repo real del usuario y se encontró que `requiereAprobacion = !esAdmin && (...)` — para Aris (`esAdmin`) es siempre `false`, sin excepción. Se cruzó contra `git log`: commit **`41febe8`**, *"Fix: las órdenes de Aris se confirman directo, sin control de aprobación"*, fechado **7/8/2026 18:30 UTC** — la misma tarde en que se había detectado el gap en la validación en vivo de esa sesión. Está en `origin/main`, entró a producción con el deploy de `c0ea403`/`ac7cf7a` de esa misma semana.

**Conclusión: Federico tenía razón, el documento estaba desactualizado.** El fix se hizo fuera de una sesión con Claude (no hay registro de quién lo escribió) y nunca se reflejó acá — quedó como "pendiente" en "LO QUE SIGUE" ítem 12 y en la decisión de negocio #11 durante más de 3 días después de estar ya resuelto y en producción. Se corrigió todo el documento (ítem 6 de "Lo que falta...", decisión #11, "LO QUE SIGUE" #12, la fila de ESPERA A OTRA PERSONA, y esta nota en VALIDACIÓN EN VIVO 7/8/2026) y se corrigió también el Word ya enviado (se reenvió la versión corregida).

**Chequeo más amplio, a pedido de Federico** ("¿revisás si hay algo más que se te haya pasado?"): se comparó `git log --oneline --all` completo (12 commits) contra cada commit que menciona este documento — **`41febe8` era el único no documentado**, no es un patrón repetido.

**Segundo punto, revisado y cerrado — no era un bug.** Revisando el mismo archivo aparecieron los nombres de campo que `NuevaOC.jsx` espera del resultado de `condiciones_proveedor()`: `limite`, `siempre_aprueba`, `minimo_compra`, `minimo_es_unidades`, `whatsapp`, `limite_es_propio` — mientras que la tabla `proveedores` guarda esos mismos conceptos con otros nombres de columna (`limite_aprobacion`, `siempre_requiere_aprobacion`, `whatsapp_pedidos`). Como el par `siempre_aprueba`↔`siempre_requiere_aprobacion` nunca se había probado en ninguna sesión (a diferencia de `limite` y `whatsapp`, ya usados y validados), quedó como sospecha de bug silencioso hasta confirmar. **Se pidió a Federico el cuerpo real de la función** (`pg_get_functiondef`) y confirma que sí rebautiza el campo correctamente: `'siempre_aprueba', coalesce(p.siempre_requiere_aprobacion, false)`. El checkbox "este proveedor siempre requiere aprobación de Aris" funciona como se espera — no hizo falta tocar nada.

**Cierre de la auditoría de esta sesión:** se corrigió la única info vieja encontrada (ítem 12, ya resuelto desde el 7/8 sin quedar documentado) y se descartó la única sospecha nueva (el mapeo de `siempre_aprueba`, confirmado correcto). No quedan puntos abiertos de esta revisión.

---

# SESIÓN 14/8/2026 — Smarties nuevas + sincronización de YiQi rota hace 10 días

## 1. Dos smarties nuevas creadas en YiQi, a mano, con Claude in Chrome

A pedido de Federico ("Armemos nosotros las Smartis"), se crearon en vivo, con Federico manejando el mouse/teclado y Claude guiando paso a paso desde la pantalla de configuración de cada entidad en YiQi:

- **`Z.API_Stock_Por_Deposito_NO_BORRAR`** — smartieId **2360**, entidad real `STOCK` (no `CONSULTA_DE_STOCK` como estaba whitelisted hasta ahora — ver punto 3). Pivot: fila = SKU + Artículo-Nombre, columna = Ubicación-Nombre, valor = Cantidad (suma). Se sacaron del pivot los campos `Nro de serie` y `Proveedor Artículo` porque duplicaban filas por SKU. Resultado validado en vivo: una fila por SKU, una columna por cada ubicación — incluye las 4 físicas (Depósito 1-Local, Depósito Central, Depósito 7-Jorge, Depósito ML Full) y varias virtuales que ya existían en YiQi (Baja, Diferencia de.., En tránsito, Exposiciones, Reclamo Proveedores, Reserva) — no se filtraron, no molestan.
- **`Z.API_Movimientos_Stock_NO_BORRAR`** — smartieId **2359**, entidad real `MOVIMIENTO_STOCK` (no `CONSUL_MOV_DE_STOCK`). Sin pivot: Artículo-SKU, Artículo-Nombre, Cantidad, Ubicación origen-Nombre, Ubicación destino-Nombre, Entidad Origen, Observaciones, Fecha de creación. Se buscó un campo de "fecha de pedido"/"fecha de recepción" separado y no existe — un movimiento interno es un hecho único, no un proceso en dos etapas como sí lo es una compra a proveedor externo.
- El prefijo `Z.` es deliberado: hace que las vistas caigan al final de cualquier selector alfabético en YiQi y no aparezcan mezcladas con las vistas de uso diario de Aris/Ivana/ventas.
- Se probó "Hacerla pública" en ambas por las dudas — no era la causa del problema que se describe abajo, pero no está de más tenerlas públicas.

**✅ Resuelto — mismatch de nombre de entidad cerrado del todo.** Se probó primero directo contra la API real de YiQi (bypaseando `yiqi-connector`, con el token nuevo ya cargado): `GET /api/public/STOCK/smartie?smartieId=2360...` → `200 OK`, 7.149 filas; `GET /api/public/MOVIMIENTO_STOCK/smartie?smartieId=2359...` → `200 OK`, página de 50 sobre un total de 1.373.423. Confirmado: los nombres de entidad reales son `STOCK` y `MOVIMIENTO_STOCK` — **no** `CONSULTA_DE_STOCK`/`CONSUL_MOV_DE_STOCK`, que eran una suposición de julio nunca antes probada. Se corrigió el whitelist `ENTIDADES_PERMITIDAS` en `yiqi-connector/index.ts` (reemplazo directo, sin dejar los nombres viejos — se confirmó con grep que no se usaban en ningún otro lado del repo), se deployó, y se volvió a probar **a través del conector** (no directo a YiQi): mismos resultados, 7.149 y 50/1.373.423 filas. Mismatch cerrado de punta a punta.

⚠️ **Hallazgo nuevo del gateway de Supabase, al probar el conector:** mandar `apikey` (JWT legacy `eyJ...`) junto con `Authorization: Bearer` (key nueva `sb_secret_...`) en la misma llamada da `401 Conflicting API keys` — el gateway rechaza la mezcla de un key legacy con uno del sistema nuevo. Solución: para probar Edge Functions a mano con la `sb_secret_...`, mandar **solo** el header `Authorization`, sin `apikey`. La nota vieja de este documento ("hacen falta los dos headers: Authorization + apikey") queda desactualizada para este caso — sigue valiendo para llamadas con la anon key legacy.

**`MOVIMIENTO_STOCK` es una tabla enorme** (1,37 millones de registros) comparada con el resto de las entidades sincronizadas hoy (la más grande, `material_yiqi`, tiene ~7.170). El día que se sincronice (Etapa 2, ítem 16 de "LO QUE SIGUE", todavía no ahora) va a hacer falta un filtro por fecha/rango, no traer todo el historial de una.

**Pendiente, sin bloquear nada:** decidir el diseño de sincronización de estas dos entidades a tablas propias (`stock_por_deposito`/similar) cuando se retome el módulo de Reposición interna — hoy solo están accesibles vía `yiqi-connector` a demanda, no hay tablas espejo ni cron para ellas todavía.

## 2. Al probar las smarties nuevas, se encontró que el sync automático de YiQi lleva 10 días roto

Antes de sumar las smarties a `sync-yiqi`, se probaron a mano vía `yiqi-connector`. Devolvían 401. La investigación paso a paso (sin asumir la primera hipótesis, con control tests en cada paso — mismo criterio que la investigación de `/search` vs `/smartie` de la sesión anterior):

1. **Primera hipótesis (correcta a medias):** el nombre de entidad whitelisted (`CONSULTA_DE_STOCK`/`CONSUL_MOV_DE_STOCK`) no coincide con el real (`STOCK`/`MOVIMIENTO_STOCK`) — descartada como causa única al ver el paso 2.
2. **Control test decisivo:** se probó `MATERIAL`/smartieId `2341` — la combinación que **siempre funcionó**, la misma que usa el sync cada 15 minutos — y **también** devolvió 401 de YiQi. Esto descartó que el problema fuera específico de las smarties nuevas.
3. **Se revisó el Monitor de Stock en producción:** "última actualización de YiQi" mostraba **4/8/2026, 10:30** — **10 días desactualizado**, hoy es 14/8. Esto incluye toda la ventana en que se le mandó a Aris e Ivana la guía de testeo (11/8) diciéndoles que el stock sincroniza cada 15 minutos.
4. **Trampa encontrada en `cron.job_run_details`:** el cron (jobid 3, `sync-material-cada-15-min`) mostraba `succeeded, 1 row` en **cada corrida**, sin un solo fallo visible, durante los 10 días. Esto es engañoso: el comando del job es `select net.http_post(...)`, y `net.http_post` de pg_net **encola** el pedido y devuelve éxito con solo lograr anotarlo en la cola — no espera ni refleja la respuesta HTTP real. La tabla `net._http_response` (la que sí tiene la respuesta real) mostró, para cada corrida reciente: `status_code 401`, body `{"ok":false,"error":"Sesión inválida o vencida"}`.
5. **Ese mensaje no es un error de YiQi — es de nuestro propio código.** Viene de `verificarLlamador()` en `supabase/functions/_shared/auth.ts` (agregado el 7/8/2026, ver VALIDACIÓN EN VIVO 7/8/2026), que exige o bien un usuario logueado real, o bien que el Authorization Bearer sea **exactamente igual** a la variable de entorno reservada `SUPABASE_SERVICE_ROLE_KEY`. Los 3 cron jobs (jobid 3, 4, 5) mandan una service_role key hardcodeada en el comando SQL — y esa comparación estaba fallando.
6. **Se descartaron, en orden, con pruebas reales (no supuestos):** que la key estuviera pegada con espacios/saltos de línea invisibles en el comando del cron (se probó con la key recién copiada del dashboard: mismo error); que la función tuviera cacheada una key vieja (se redeployó `sync-yiqi`: mismo error); que Federico hubiera puesto una key de prueba en vez de la real en los tests anteriores (confirmó que no, siempre usó la real, solo tapó la pantalla en las capturas para no exponerla en el chat).
7. **Causa real:** el proyecto de Supabase migró al sistema de API keys nuevo (pestañas "Publishable and secret API keys" vs "Legacy anon, service_role API keys" en Settings → API). La variable reservada `SUPABASE_SERVICE_ROLE_KEY` que leen las Edge Functions ahora resuelve a la key nueva (`sb_secret_...`), no a la JWT legacy (`eyJ...`) que seguía hardcodeada en los 3 cron jobs desde que se crearon. Confirmado probando `sync-yiqi` a mano con la `sb_secret_...`: pasó la validación de sesión y llegó hasta el punto esperado (el 401 de YiQi del punto 8).

## 3. Arreglado: los 3 cron jobs actualizados con la key nueva

Federico corrió `cron.alter_job(job_id := 3/4/5, command := ...)` para los tres jobs (`sync-material-cada-15-min`, `sync-oc-y-clientes-diario`, `sync-ventas-diario`), reemplazando la Authorization Bearer legacy por la `sb_secret_...` nueva. Confirmado en Supabase (resultado `alter_job` en los 3). **No hizo falta tocar `yiqi-connector` ni `admin-usuarios`** — esas dos las llaman usuarios reales desde el navegador (camino 2 de `verificarLlamador`, autenticación por sesión), que nunca dejó de funcionar; solo el camino 1 (service_role, usado por el cron) estaba roto.

## 4. Segundo problema, ya resuelto también: el token de YiQi

Con el cron ya arreglado, `sync-yiqi` pasaba nuestra propia validación de sesión sin problema — pero al llamar a YiQi con el token guardado en `yiqi_config`, **YiQi seguía respondiendo 401** (confirmado con `MATERIAL`/2341, la combinación históricamente confiable). Es un problema completamente distinto al del punto 2: no era nuestro código, era el token de integración con YiQi en sí.

**✅ Resuelto el mismo 14/8/2026.** Federico generó un token nuevo vía `POST https://api.yiqi.com.ar/token` (`username`/`password`/`grant_type=password`, credenciales de la cuenta de integración `ventas@dentalab.com.ar`, con permiso "Integrador" — no existe un tipo de usuario de integración separado, es una cuenta normal con ese flag activado) — el token nuevo tiene **265 caracteres** (el anterior tenía 512; la diferencia de longitud no resultó ser un problema, se validó empíricamente). Cargado en `yiqi_config` (fila `7b56cb5b-d7c3-4fc2-b127-e39515ff1bfb`) vía `UPDATE`, con `ultima_sync` reseteado a `null`.

**Validado en vivo, de punta a punta:**
- Llamada de prueba a `sync-yiqi?entidad=material` con la `sb_secret_...` nueva → `{"ok":true,"resultados":[{"entidad":"material","filasSincronizadas":7185}]}`.
- Monitor de Stock en producción: "Sincronizado 14/8, 11:37 a.m." / "última actualización de YiQi: 14/8/2026, 11:37:27" (antes: "4/8/2026, 10:30" — 10 días de atraso). Contadores de alertas también se refrescaron (2620 críticas / 457 preventivas, sobre el baseline stale de 2603/450).

**Sync restablecido en el momento — pero ver SESIÓN 15/8/2026: se volvió a cortar en menos de 24hs, con una pista nueva sobre la causa.**

**Investigación abierta — por qué se cortó el token de YiQi:** Federico confirmó que su propia contraseña de acceso a YiQi nunca cambió, así que la causa de que el token de integración se haya invalidado no está clara. La documentación original del proyecto decía que duraban ~4 años sin vencer, y este se cortó mucho antes — y volvió a cortarse al día siguiente de regenerarlo (ver SESIÓN 15/8/2026, hipótesis de la sesión compartida).

## 5. Impacto en el testeo que se le mandó a Aris e Ivana el 11/8

La guía de testeo enviada el 11/8 dice explícitamente que el stock sincroniza cada 15 minutos. Con el corte desde el 4/8, **todo el período de testeo (11/8 en adelante) mostró datos de stock de al menos una semana antes**, sin que nadie se diera cuenta — el cron parecía sano por el mismo motivo que a nosotros nos costó verlo (el falso "succeeded" de pg_cron). Queda a criterio de Federico si vale avisarles, dependiendo de si tomaron alguna decisión de compra basándose en esos números durante estos días.

## 6. Aprendizaje para el proyecto: el cron no es confiable como señal de salud

`cron.job_run_details.status = succeeded` **no significa que la llamada HTTP real haya funcionado** cuando el comando usa `net.http_post` — solo confirma que Postgres pudo encolar el pedido. La fuente de verdad real es `net._http_response` (o los logs de la Edge Function en el dashboard de Supabase). Vale la pena, más adelante y sin apuro, armar algún chequeo real de salud del sync (por ejemplo, que el propio Monitor de Stock muestre una alerta si `ultima_sync` tiene más de X horas) en vez de confiar en que el cron "se ve verde".

---

# SESIÓN 15/8/2026 — El sync se corta de nuevo, y aparece una pista real sobre la causa

**Contexto:** al día siguiente del arreglo del 14/8, Federico notó que el Monitor de Stock seguía mostrando "Sincronizado 14/8, 11:37 a.m." — no había vuelto a sincronizar en casi 4 horas (el cron corre cada 15 min). Se repitió el mismo método de diagnóstico que el día anterior, sin asumir que fuera la misma causa.

## 1. Bug nuevo, distinto al del 14/8: al comando del cron le faltaba "Bearer"

`net._http_response` mostró un error nuevo: `{"code":"UNAUTHORIZED_INVALID_JWT_FORMAT","message":"Auth header is not 'Bearer {token}'"}` — no es el mismo mensaje `"Sesión inválida o vencida"` del día anterior (ese era de `verificarLlamador()`; este viene del gateway de Supabase, antes de llegar a nuestro código). Se leyó el `command` real de `cron.job` (jobid 3, 4 y 5) y se encontró la causa: al correr el `cron.alter_job` del 14/8, el valor cargado en el header `Authorization` era la key sola (`'sb_secret_...'`), **sin el prefijo `Bearer `**. Los 3 jobs tenían el mismo error — probablemente un reemplazo de todo el placeholder `Bearer TU_SECRET_KEY_NUEVA` por la key sola, en vez de solo la parte de la key. **Corregido** con un nuevo `cron.alter_job` en los 3, agregando el `Bearer ` de vuelta. Confirmado releyendo el `command` guardado.

**Importante:** esto significa que el cron automático **nunca llegó a correr solo con éxito** desde el fix del 14/8 — lo que se vio funcionar ese día (7185 filas, "Sincronizado 11:37") fue la llamada manual de prueba por PowerShell, que sí tenía el `Bearer` bien puesto. El sync automático estuvo roto por este motivo *nuevo* durante todo ese tiempo.

## 2. Hallazgo aparte: un bache de ~5 horas sin respuestas registradas en `net._http_response`

Entre las 09:30 y las 14:15 del 15/8, el cron (jobid 3) corrió las 20 veces esperadas (cada 15 min) pero **ninguna quedó con `status_code`/`body` registrados** (ambos `null`) — ni éxito ni error, la respuesta HTTP nunca se completó del lado de `pg_net`/Supabase. Recién a partir de las 14:30 volvieron a aparecer respuestas reales. Es un problema de infraestructura de Supabase, separado del tema del token — anotado como hallazgo, no se investigó más a fondo (no es código nuestro y no bloqueaba nada más).

## 3. El token de YiQi volvió a morir — confirmado en vivo, sin ambigüedad

Con el bug del "Bearer" corregido, `net._http_response` mostró que YiQi volvía a rechazar el token (`401`, `"YiQi respondio 401 en MATERIAL/smartie page 1"`). Para descartar que fuera otro artefacto de nuestra infraestructura (como pasó dos veces seguidas ese mismo día), se probó el token actual **directo contra la API de YiQi, sin pasar por Supabase ni por nuestro código**: `401`, cuerpo vacío. Confirmado sin ambigüedad: el token que se generó el 14/8 a la mañana (~11:30) ya no es válido el 15/8 a la tarde — **duró menos de 24 horas**, muy distinto del token anterior (duró ~3 semanas, del 12/7 al 4/8).

## 4. Hipótesis con evidencia real, no solo una corazonada

La cuenta de integración (`ventas@dentalab.com.ar`, flag "Integrador") **no es una cuenta exclusiva para la API** — en la sesión del 11/8 (ver `ARIS_Especificacion_Reposicion_Interna_y_Produccion.md`) Federico ya había mostrado capturas de esa misma cuenta logueada en la interfaz web de YiQi como "Ventas Online", viendo el menú de Stock. Esto sugiere que alguien en Dentalab usa esa cuenta para trabajar en la web de YiQi, no solo nuestra integración por API. Si YiQi permite una sola sesión/token activo por cuenta (patrón común), cada login web con esa cuenta mataría el token de la API sin que nadie cambie ninguna contraseña — coherente con que Federico confirmó que su contraseña nunca cambió.

**Decisión de Federico:** no regenerar el token todavía — no tiene sentido gastar el paso si la misma cuenta lo puede volver a matar en cualquier momento. **Le pidió confirmación directa a Aris** sobre si alguien está o estuvo logueado con ese usuario. Queda pendiente la respuesta antes de regenerar y, si se confirma la hipótesis, plantear con Aris crear un usuario de YiQi exclusivo para la integración (separado de cualquier login de uso diario) — mismo tipo de solución que ya estaba anotada para proteger las smarties de ediciones accidentales (ver "🔴 INCIDENTE — la 2344 fue editada por alguien de Dentalab").

**Sigue abierto al cierre de esta sesión (15/8/2026):** todavía sin respuesta de Aris sobre la sesión de YiQi — no se regeneró el token.

## 5. Pedido nuevo de Aris sobre "Nueva OC": agregar cualquier artículo del proveedor, no solo los alertados

Mientras se esperaba la respuesta sobre el token, Aris (probando el sistema con Ivana, logueados con la cuenta demo porque su cuenta real "no funcionó" — ver ítem 1 de "LO QUE SIGUE", sigue pendiente) reportó que al armar una orden solo se pueden agregar artículos con alerta de stock, no cualquier artículo del proveedor. **No es un bug**: `ArmarOrden` arma la lista a partir de `sugerencias_compra()`, que por diseño solo trae artículos por debajo del punto de pedido — la pantalla nunca soportó agregar artículos libremente. Consultado, Aris confirmó que quiere **poder agregar cualquier artículo del proveedor a la orden, aunque el sistema no lo sugiera** (la sugerencia automática se mantiene igual, se suma la posibilidad de agregar a mano). Queda como pedido de producto nuevo, sin diseñar todavía — pasa a "LO QUE SIGUE".

## 6. Construido, deployado y validado en vivo: agregar artículo a mano en "Nueva OC"

**Diseño:** función nueva `buscar_articulos_proveedor(p_proveedor, p_busqueda, p_limite)` (migration `20260815160000_buscar_articulos_proveedor.sql`), hermana de `sugerencias_compra()` pero sin el filtro `stock <= umbral` — busca por SKU/nombre en todo el catálogo comprable del proveedor (mismo `es_comprable()`), sin calcular `cantidad_sugerida` (no es un artículo en alerta, no hay necesidad calculada: el campo queda "A definir", lo carga la persona). En `ArmarOrden` (`NuevaOC.jsx`) se agregó un buscador con debounce (350ms, mínimo 2 caracteres) arriba de la tabla; al elegir un resultado se suma a una lista `agregados` que se une con `sugerencias` (`filas = [...sugerencias, ...agregados]`) para todo lo demás — tabla, paginado, valorización, semáforo de aprobación, guardado. Si el artículo elegido ya estaba en la tabla (por alerta o por un agregado previo), no se duplica: solo se tilda. Se agregó `key={proveedorElegido}` al montar `ArmarOrden` para que lo agregado a mano no sobreviva a un cambio de proveedor.

**Deploy:** commit `f1e416f` ("Nueva OC: permitir agregar cualquier articulo del proveedor a mano") pusheado a `main`; migration aplicada por Federico vía SQL Editor ("Success. No rows returned", esperado para un `CREATE OR REPLACE FUNCTION`); `vercel --prod` corrido **desde la raíz del repo** (`C:\dentalab-compras`, no desde `frontend\` — el proyecto de Vercel tiene "Root Directory" = `frontend` configurado en su propio dashboard, así que correrlo ya parado en `frontend\` duplica la ruta a `frontend\frontend` y falla; quedó anotado para no repetir el error).

**Validado en vivo con Chrome, logueado como Aris, sin dejar datos de prueba:**
- **MASOTTO DANIEL** (1 solo artículo en alerta): buscar "vaso" trajo ese mismo artículo → clic en "+ Agregar" → no lo duplicó, solo lo tildó (semáforo pasó a "$180.000 · Orden directa").
- **DENTAL MEDRANO** (672 en alerta, catálogo grande): buscar "cera" trajo artículos que no estaban en la tabla de alertas (brackets, calentadores de cera) → se agregó "Calentador de Cera Digital SunBurst" (SKU 35552) → apareció en la tabla, tildado, cantidad 1 editable, "Sin historial" y "sin costo" (correcto: no tiene ventas ni costo cargado en YiQi) → semáforo reflejó bien "$0 · Orden directa — faltan costos en algunos artículos (1 sin costo cargado)".
- No se guardó ningún borrador ni se confirmó ninguna orden durante la prueba — no quedaron datos de prueba en el sistema.

**Bloqueo de proceso encontrado y resuelto en el camino:** `.git\index.lock` quedó trabado de nuevo (mismo patrón que el 11/8) — la sesión de la nube no tiene permiso para borrar archivos en el disco de Federico, así que lo borró él mismo (`del .git\index.lock`) tras confirmar que no era un `git` realmente colgado (una terminal vieja en otro repo, `comunas-app`, ya había devuelto el prompt — no tenía nada que ver).


---

# SESIÓN 17/8/2026 — Causa raíz real del vencimiento del token de YiQi: renovación automática construida, deployada y validada en vivo

**Contexto:** Aris confirmó que nadie de Dentalab usó la cuenta compartida `ventas@dentalab.com.ar` recientemente (ni web ni ninguna otra cosa), y Federico confirmó por su lado que él tampoco inició sesión en la web de YiQi durante toda la investigación. Esto descarta por completo la hipótesis del 15/8 ("un login web de uso diario comparte y mata el token de la API") — hacía falta encontrar la causa real, no seguir suponiendo.

## 1. Investigación en la documentación oficial de YiQi, no en supuestos

Se leyó la documentación pública de YiQi (`apidoc.yiqi.com.ar`) en vez de seguir adivinando. Confirma: el `access_token` es de **vida corta por diseño** (no ~4 años como decía un comentario viejo del código, nunca verificado contra la doc real desde julio), y la forma correcta de renovarlo sin volver a mandar usuario/contraseña es `POST /token` con `grant_type=refresh_token`. El `refresh_token` dura 14 días y **rota en cada uso** — YiQi solo acepta un `refresh_token` vivo por usuario a la vez.

Confirmado empíricamente generando un token real: `expires_in = 86399` segundos (~24hs), exacto.

**Esto cierra la pregunta abierta desde la SESIÓN 14/8/2026** ("por qué se venció el token sin que cambiara la contraseña"): nunca fue un problema de contraseña ni de sesión compartida — el sistema simplemente nunca implementó la renovación que YiQi exige, así que el token moría solo cada ~24hs, con o sin nadie tocando nada.

## 2. Fix construido: renovación automática centralizada

- **`supabase/functions/_shared/yiqiConfig.ts` (nuevo)** — único lugar del repo que lee/escribe `yiqi_config` de ahora en más. `getYiqiConfig()` chequea si el token vence en menos de 2hs (o si no se sabe cuándo vence) y lo renueva solo con el `refresh_token` guardado antes de devolverlo. Nunca deja `yiqi_config` a medias: o guarda los 3 campos juntos (`bearer_token`, `refresh_token`, `token_expira_en`) o no toca nada. Si el refresh falla y el token guardado todavía no venció, sigue usando ese en vez de cortar el sync por una renovación que no hacía falta todavía.
- **Migration `20260817190000_yiqi_refresh_token.sql`** — agrega `refresh_token` y `token_expira_en` a `yiqi_config`. Aplicada por Federico vía SQL Editor.
- **`sync-yiqi/index.ts` y `yiqi-connector/index.ts`** — se les sacó cada uno su propia lectura duplicada de `yiqi_config` (sin renovación) y ahora llaman al módulo compartido. De paso se corrigió en `yiqi-connector` el comentario viejo que decía "~4 años, sin refresh token" (nunca fue verdad, quedó de julio).

**Deployado** (`supabase functions deploy sync-yiqi` + `yiqi-connector`) desde la raíz del repo.

## 3. Dos intentos de backfill — el primero falló, y el error diseñado hizo su trabajo

**Intento 1:** se cargó el `refresh_token` capturado un rato antes (durante la investigación de `expires_in`). El primer sync post-deploy lo intentó usar y YiQi lo rechazó: `invalid_grant: Invalid or expired refresh token`. Diagnóstico limpio gracias al manejo de errores diseñado a propósito: `yiqi_config` no quedó tocado, y el error distinguió claramente "no se pudo renovar" de "YiQi está caído" — nunca fue un fallo silencioso como los de antes.

**Causa más probable (sin poder confirmarla al 100%, y no vale la pena perseguirla más):** entre generar ese `refresh_token` y cargarlo en la base pasó un rato en el que se probaron otras cosas por PowerShell — como YiQi solo permite un `refresh_token` vivo por usuario, es probable que algún otro pedido de token en el medio lo haya rotado antes de usarlo. No hay forma de reconstruirlo con certeza y no cambia nada del fix en sí.

**Intento 2:** Federico generó un token limpio, una sola vez, y se cargó el `refresh_token` de inmediato (mismo patrón: 265 caracteres, `expires_in: 86399`). Esta vez funcionó.

## 4. Validado en las tres capas — 17/8/2026, ~23:00 UTC

1. **Base de datos:** `token_expira_en` pasó de `NULL` a `2026-08-18 23:00:01` (~24hs exactas desde la renovación real); `ultima_sync` se actualizó a `2026-08-17 23:00:49`.
2. **Logs reales (`net._http_response`):** los `500` con `invalid_grant` son todos de *antes* del backfill del intento 2 (22:00–22:45). Ninguno después.
3. **En vivo (Chrome, sesión de Aris):** Monitor de Stock mostró "última actualización de YiQi: 17/8/2026, 08:00:48 p.m." (=23:00:48 UTC, coincide exacto), **7186 artículos**, origen **✓ Sincronizado**.

El sistema renovó el token solo, sin intervención manual, y el sync corrió con éxito de punta a punta: BD → Edge Function → frontend en producción.

## 5. Riesgo residual, documentado a propósito, sin acción por ahora

Los 3 cron jobs (`sync-material-cada-15-min`, `sync-oc-y-clientes-diario`, `sync-ventas-diario`) coinciden a las **6:00 UTC** (3:00 a.m. Argentina). Como el `refresh_token` rota en cada uso, si dos de esos tres llaman a `getYiqiConfig()` casi al mismo tiempo y ambos necesitan renovar, uno de los dos va a perder la carrera contra YiQi (el mismo error `invalid_grant` que se vio en el intento 1, pero por una causa distinta y esperada). Es de baja probabilidad y **auto-recuperable**: el siguiente ciclo de 15 minutos ya encuentra el token renovado por el que ganó la carrera y sigue solo. **Decisión explícita:** no se agregó locking para esto — es una complejidad que no se justifica para un caso raro y que se cura solo. Si en el futuro aparece un `500` puntual entre las 5:45 y 6:15 UTC, es este caso conocido, no un bug nuevo.

## Pendiente

- ~~Falta el `git add`/`commit`/`push` de esta sesión~~ **✅ HECHO 17/8/2026** — commit `901efac` ("Fix: renovación automática del token de YiQi"), pusheado a `main`. Tuvo que resolverse un `.git\index.lock` viejo (mismo patrón que 11/8 y 15/8) antes de poder commitear.
- Fila vieja/basura en `yiqi_config` (`57db7796-f8ba-4c91-8ea4-d4a8a0e94666`, 37 caracteres) sigue sin borrar — cosmético, no afecta nada porque el sync siempre usó la fila correcta por `created_at`. Sin apuro.


---

# SESIÓN 18/8/2026 — Cerrada la incógnita de escribir en YiQi (criterio 5 del MVP), sin preguntarle a Aris y sin crear nada real

**Contexto:** con el token de YiQi ya resuelto (SESIÓN 17/8/2026), Federico pidió cerrar el desarrollo lo antes posible. En vez de esperar la respuesta de Aris sobre si el módulo Compras estaba licenciado (paso que se venía planeando para "definiciones pendientes"), se decidió probarlo directo — más rápido y no depende de que Aris conteste.

## 1. El endpoint existe tal cual se asumía desde el inicio

Se descargó el schema completo de la documentación pública de YiQi (`erpdemo.schema-Compras-api.json`, con la conexión real de Federico — la sesión de la nube no llega a `apidoc.yiqi.com.ar`). Una primera lectura resumida (vía herramienta de fetch) sugirió, incorrectamente, que el módulo Compras solo exponía la entidad `DESPACHO` — resultó ser una lectura parcial de un JSON grande, no la realidad. Con la descarga completa y el archivo parseado en PowerShell, la lista real de rutas confirma **`/ORDEN_DE_COMPRA`** con el mismo patrón que toda entidad de YiQi (`POST`, `GET/{id}`, `search`, `smartie`, `query`, `changestate`, `changestatemultiple`, `file`, `report`) — el endpoint que se asumió desde julio existe de verdad.

## 2. Prueba de lectura — confirmada, sin cambios de código

Se encontró que `ORDEN_DE_COMPRA` **ya estaba en el whitelist de `yiqi-connector`** desde hace semanas (no hizo falta tocar código ni deployar). Usando el id interno real de una OC existente (`yiqi_id=1669`, correspondiente a la OC visible `#1727` — **importante: el número visible de OC y el id interno de YiQi son campos distintos**, `nro_oc` vs `yiqi_id` en nuestra tabla `ordenes_yiqi`), Federico corrió:

```
GET /functions/v1/yiqi-connector?entidad=ORDEN_DE_COMPRA&id=1669
```

Devolvió `200 OK` con el registro completo: proveedor, fechas, estado (`302 — En preparación`), y los arrays anidados `DETALLE`/`REMITOS`/histórico de estados. Confirma acceso de lectura al módulo Compras vía API.

**Hallazgo aparte, sin acción:** esa OC real tiene `ORDC_RAZON_DE_RECHAZO: "Prueba"` — parece una orden de prueba preexistente en el YiQi real de Dentalab, ajena a este proyecto. Solo se leyó, no se tocó.

## 3. Prueba de escritura — diseñada a propósito para no crear nada, y no creó nada

**Se descartó la prueba obvia (POST con body vacío)** antes de correrla: la misma OC real leída en el paso 2 tiene `DETALLE: []` y `ORDC_IMPORTE_TOTAL: 0` — es decir, **YiQi acepta órdenes sin líneas y en $0 como válidas**. Un POST vacío corría el riesgo real de crear una orden de verdad en el YiQi de Dentalab, no de rebotar con un error de validación.

**Segundo hallazgo, también antes de tocar nada:** ninguna entidad de este módulo tiene método `DELETE` en el schema — solo `POST`/`GET`/`PUT` (mismo patrón en las ~30 entidades listadas). Existe una entidad separada `CANCELACION_DE_COMPR`, lo que sugiere que en YiQi las órdenes **no se borran, se cancelan** (quedarían con estado "Cancelada" en el historial, visibles para Aris/Ivana, no desaparecen). Esto significa que si el POST de prueba llegaba a crear algo real, no había forma limpia de borrarlo — solo de marcarlo cancelado, dejando rastro.

**Diseño de la prueba, con esto en mente:** un `POST /ORDEN_DE_COMPRA` con un proveedor inexistente (`CLIE_ID_CLIE = 999999999`) y el resto de los campos con valores reales y válidos (tomados de la OC real ya leída: `COVE_ID_COVE=3`, `MONE_ID_MONE=171`), para que lo único inválido del pedido fuera justo eso — apostando a que la integridad referencial de la base de YiQi rechazara la operación completa antes de guardar nada, sin depender de que hubiera validaciones de negocio más laxas (como ya sabíamos, por el punto anterior, que las hay).

**Resultado — exactamente lo esperado:**
```
Status: 400
{"title":"No se puede guardar ésta instancia de Orden de Compra, ya que hace referencia a una instancia inexistente en Empresa","status":400}
```

`400` de validación de integridad referencial, no `403` de permiso — **confirma que el módulo está habilitado para escribir**, y el mensaje de error deja en claro que no se guardó nada (rechazado por apuntar a un proveedor que no existe, antes de persistir).

## 4. Conclusión: criterio 5 del MVP deja de ser una incógnita

Desde el inicio del proyecto, "escribir la OC en YiQi" estaba marcado como el mayor riesgo técnico, con la duda abierta de si el endpoint existía, si el módulo estaba licenciado, y si había que esperar una confirmación de Aris para poder ni empezar a probar. Las tres dudas quedaron resueltas hoy, en vivo, sin bloquear nada del lado del cliente:

- El endpoint existe, documentado y confirmado.
- El módulo está habilitado para leer y para escribir.
- No hizo falta preguntarle nada a Aris — se pudo probar de forma segura con datos ya conocidos y una prueba diseñada para fallar sin crear nada.

**Lo que queda ahora es trabajo de construcción normal, no una incógnita de "¿se puede?":** mapear los ids reales de proveedor (`CLIE_ID_CLIE`) y artículos desde nuestras tablas propias hacia los campos de YiQi, armar el array de líneas (`DETALLE`) con el formato real que YiQi espera, y decidir en qué punto del flujo de la app se dispara el POST (por ejemplo, al aprobar la orden en "Nueva OC"/"Órdenes de compra").

## 5. Formato real de `DETALLE` y mapeos confirmados (misma sesión, continuación)

La OC #1727 resultó atípica (`ORDC_RAZON_DE_RECHAZO: "Prueba"`, $0, sin líneas) — no representativa. Se repitió la misma lectura (sin riesgo, solo `GET`) contra una orden real y grande: **OC #1725 (DIS DEN, `yiqi_id=1667`, ~$14.8M, 27 líneas según nuestra propia base)**. Esta vez `DETALLE` vino completo, con las 27 líneas.

**Formato real de una línea de `DETALLE`:**
```json
{
  "MATE_ID_MATE": 416,
  "DEDO_NOMBRE_MATE": "Pinza Adson s/ Diente BELKYS",
  "DEDO_CANTIDAD": 5,
  "TIUN_ID_TIUN": 2,
  "ALIV_ID_ALIV": 3,
  "DEDO_PRECIO_UNITARIO_ACOR": 8678.0000,
  "DEDO_PRECIO_ACORDADO": 10500.3800,
  "DEDO_SUBTOTAL_NETO": 43390,
  "DEDO_SUBTOTAL": 52501.9,
  "DEDO_IVA": 9111.9,
  "DEDO_TOTAL": 52501.9
}
```
(`MATE_ID_MATE` = artículo, `DEDO_CANTIDAD` = cantidad, `TIUN_ID_TIUN` = unidad — `2` en todas las líneas vistas, `ALIV_ID_ALIV` = alícuota de IVA — `3` en todas las líneas vistas, precios netos vs. con impuesto, y los subtotales/IVA/total ya calculados por línea.)

**Mapeos confirmados contra nuestras propias tablas, sin necesidad de sincronizar nada nuevo:**
- **Artículo:** `material_yiqi.yiqi_id` = `MATE_ID_MATE` de YiQi. Confirmado con dato real: `yiqi_id=416` → `mate_nombre="Pinza Adson s/ Diente BELKYS"`, coincide exacto con la línea de la OC. Importante: `yiqi_id` (416) **es distinto** de `mate_codigo` (11218, el SKU que se usa en toda la app) — son dos campos separados, hay que usar el correcto en cada contexto.
- **Proveedor:** `clientes_yiqi.yiqi_id` = `CLIE_ID_CLIE` de YiQi. Confirmado con dato real: `yiqi_id=3954` → `clie_nombre="DIS DEN"`, coincide con el proveedor de la OC #1725. Mismo patrón: distinto de `clie_codigo` (432).

Con esto, los dos mapeos más importantes (artículo y proveedor) están resueltos usando datos que ya sincronizamos hoy — no hace falta tocar `sync-yiqi` para esta parte.

**Resuelto con un chequeo masivo (vía `yiqi-connector?entidad=ORDEN_DE_COMPRA`, trae ~500 órdenes de `/search`):**
- **`MONE_ID_MONE` es constante de verdad: `171` en el 100% de las órdenes.** Se usa siempre, sin depender de Aris.
- **`COVE_ID_COVE` varía (`3`, `4`, `6` en un subconjunto chico), pero la gran mayoría de las órdenes reales lo dejan vacío.** No hace falta resolver qué significa cada valor para escribir la primera versión — alcanza con dejarlo vacío/null, igual que la mayoría de las OC reales de Dentalab. Qué significan esos valores puntuales (y si alguna vez conviene setear uno al crear desde la app) queda anotado para cuando Aris conteste — no bloquea nada.

## Nota de seguridad menor

Durante esta sesión, el `bearer_token` completo de YiQi quedó pegado en el chat por Federico dos veces (al armar la variable `$token` en PowerShell para las pruebas). Riesgo bajo — no es una contraseña, y con la renovación automática de la SESIÓN 17/8/2026 va a rotar solo en menos de 24hs — pero se marca por transparencia, mismo criterio que exposiciones parciales anteriores en este proyecto (14/8, 15/8). No requirió ninguna acción.

## 10. Módulo de Stock — Fase 1: sync de stock por depósito (19/8/2026)

Arranque del módulo de Stock (especificación completa de Aris en `claude/ARIS_Especificacion_Reposicion_Interna_y_Produccion.md` — reposición Local↔Central por 8 niveles de prioridad, ABC, SKU madre/hijo, producción — eso es multi-fase, esto es solo la Fase 1: **tener el dato real automatizado**, base de todo lo demás).

- **Migration `20260819100000_stock_por_deposito.sql`**: tabla `stock_yiqi` (1 fila por SKU — `sku text unique`, nunca numérico, por la regla de Aris de preservar SKU como texto), RLS calcada de `material_yiqi` (Ivana ve solo sus proveedores, resuelto por join `stock_yiqi.sku = material_yiqi.mate_codigo`), `upsert_stock_yiqi()` con el mismo patrón de hash-diff que `upsert_material_yiqi`, y cron job propio `sync-stock-cada-15-min` (jobid 9, usa el secreto de Vault ya cargado el 19/8 para el sweep — no repite el error del secreto en texto plano).
- **`sync-yiqi/index.ts`**: nuevo `entidad=stock`. La smartie `STOCK` (id 2360) viene pivoteada igual que ventas (columnas genéricas `C2`..`C11`) — se mapea por **título**, no por el nombre de columna genérico, para no repetir el bug del `ID`/`id` de la sesión anterior si YiQi reordena el pivot. Detectado en vivo: algunos títulos vienen con entidades HTML sin decodificar (`"En tr&#225;nsito"`), manejado con un decoder chico antes de matchear.
- **Verificado en vivo**: 7150 SKUs sincronizados en el primer intento, sin errores. Chequeo puntual: SKU `00221` conservó el cero adelante; SKU `1000` coincide campo a campo con la respuesta cruda de YiQi vista antes de mapear (Local=99, Central=300, Jorge=4, ML Full=0, Baja=5225, Diferencia=133, En tránsito=0, Exposiciones=0, Reclamo=0, Reserva=29) — confirma que el mapeo por título es correcto. 3404 SKUs con stock en Local, 2031 con stock en Central.
- **Pendiente (Fase 2 en adelante, no arrancado)**: pantalla propia de "Reposición interna" con las 8 prioridades y clasificación ABC, relaciones SKU madre/hijo, recetas de producción/fraccionamiento, remitos de hasta 30 artículos. La RLS nueva no se probó todavía en vivo con la cuenta real de Ivana (solo se armó calcando el patrón ya usado, sin validar con Chrome).

### Limpieza pedida 19/8/2026 — sin cerrar todavía

Federico pidió limpiar/ordenar antes de que Aris/Ivana testeen, pero la sesión se desvió a Stock antes de ejecutar esto. Queda para la próxima:
- `yiqi-compras-schema.json` suelto en la raíz del repo (se coló en un `git add -A`) — sin confirmar si es descartable.
- Fila basura vieja en `yiqi_config` — no rompe nada (se toma la más reciente por fecha), pero ensucia la tabla.
- Webhook de Vercel desconectado — `git push` no dispara auto-deploy, hay que revisar Settings → Git en Vercel o seguir con `vercel --prod` a mano.
- Actualizar la tabla del MVP: criterio 5 (OC escrita en YiQi) pasa de "parcial" a **completo** desde el cierre de la sesión 18-19/8.

## Pendiente

- ~~Ver el formato real de `DETALLE` con datos reales~~ **✅ HECHO** — ver punto 5 arriba, con OC #1725/yiqi_id 1667.
- ~~Confirmar mapeo artículo/proveedor contra nuestras tablas~~ **✅ HECHO** — ver punto 5 arriba (`material_yiqi.yiqi_id`, `clientes_yiqi.yiqi_id`).
- ~~Confirmar si `MONE_ID_MONE` es constante~~ **✅ HECHO** — `171` en el 100% de ~500 órdenes reales revisadas. Se usa siempre.
- Qué significan los valores puntuales de `COVE_ID_COVE` (`3`/`4`/`6`) — **no bloquea la escritura** (se deja vacío, igual que la mayoría de las OC reales), pero queda anotado para preguntarle a Aris cuando conteste, por si conviene setear algo específico más adelante.
- ~~Diseñar en qué momento del flujo de la app se dispara la escritura real a YiQi~~ **✅ DECIDIDO 18/8/2026** — Federico confirmó: **al aprobar la orden desde la app** (no un botón aparte).
- ~~Definir qué pasa si el POST a YiQi falla al aprobar~~ **✅ DECIDIDO 18/8/2026** — **se aprueba local igual, no se bloquea a Ivana/Aris**. Decisión de Federico, con buen motivo: YiQi ya tuvo varios cortes reales este mes (token vencido, cron mal configurado) — bloquear la aprobación cada vez que YiQi tenga un problema paralizaría la operación de Dentalab por algo que no depende de ellos. La orden queda marcada con un aviso claro tipo **"Error de vinculación a YiQi"** y pendiente de reenviar (reintento automático, mismo patrón que el resto del sync). Diseño técnico pendiente de armar: columnas nuevas en `ordenes_propias` (`yiqi_enviada_en`, `yiqi_error`, `yiqi_id_creado`), badge/aviso en la UI de Órdenes de compra/Seguimiento de OC, y mecanismo de reintento (cron o botón manual "Reintentar envío").

## 6. Dónde vive hoy el "aprobar" en el código (leído 18/8/2026, sin tocar nada todavía)

Se leyeron `NuevaOC.jsx`, `OrdenesCompra.jsx` y `OrdenesPropias.jsx` para ubicar el punto exacto de enganche. Conclusión: **hay dos lugares distintos del frontend donde una orden pasa a `estado = 'aprobada'`**, ambos hoy son un `.update()`/`.insert()` directo a Supabase desde el navegador (con el JWT del usuario), sin pasar por ninguna Edge Function:

1. **`frontend/src/components/OrdenesPropias.jsx` → `confirmarDecision()`** (línea ~208). Es el circuito real de aprobar/rechazar en producción (a pesar del nombre del archivo, "Nueva OC" NO tiene ese circuito — tiene un comentario propio que lo aclara). Aris aprueba una orden que está en estado `pendiente` desde un modal (reemplaza a `window.prompt`).
2. **`frontend/src/pages/NuevaOC.jsx` → `guardarOrden()`** (línea ~884). Cuando Ivana arma una orden que **no** supera el límite de aprobación automática, o cuando **Aris mismo** arma una orden (es el dueño, nunca pasa por control), la orden se crea y queda `aprobada` directo, sin pasar por el modal de arriba.

**Diseño propuesto para enganchar la escritura a YiQi (todavía no construido, pendiente de luz verde):**

- **Migration nueva**: agrega a `ordenes_propias` las columnas `yiqi_enviada_en timestamptz`, `yiqi_id_creado bigint`, `yiqi_error text`.
- **Edge Function nueva** (p.ej. `enviar-oc-yiqi`): recibe `{ orden_id }`, valida el llamador con `verificarLlamador` (usuario real logueado, no hace falta `soloAdmin` porque el caso 2 lo dispara Ivana), trae la orden + sus items de `ordenes_propias`/`ordenes_propias_items`, resuelve `CLIE_ID_CLIE` desde `clientes_yiqi.yiqi_id` (por nombre de proveedor) y `MATE_ID_MATE` por línea desde `material_yiqi.yiqi_id` (por `mate_codigo`), arma el `DETALLE` y el header (`MONE_ID_MONE=171` fijo, `COVE_ID_COVE` sin setear) y hace el `POST /ORDEN_DE_COMPRA`. Si sale bien, guarda `yiqi_enviada_en` + `yiqi_id_creado` y limpia `yiqi_error`. Si falla, solo guarda `yiqi_error` — nunca toca `estado` (la aprobación local ya quedó firme antes de intentar esto).
- **Escribe una sola vez**: la función chequea primero si la orden ya tiene `yiqi_id_creado` — si ya se mandó con éxito, no vuelve a mandar nada (protección contra doble click o doble llamada de reintento).
- **Se llama desde los dos puntos de arriba** (mismo código, sin duplicar lógica), justo después de que el `update`/`insert` local a `estado='aprobada'` salga bien. El llamado a la función va en un `try/catch` propio que nunca interrumpe el flujo de aprobación local ya exitoso.
- **UI**: en `OrdenesPropias.jsx`, mostrar un aviso/badge "Error de vinculación a YiQi" cuando `yiqi_error` esté seteado y `yiqi_id_creado` sea `null`, con un botón "Reintentar envío" que vuelve a llamar a la misma función.

**Estado: diseño presentado, todavía no se escribió ni la migration ni la función ni el enganche en el frontend.** Se sigue el criterio de "escribir una sola vez, basado en confirmaciones" — todo lo de arriba usa solo hechos ya verificados por Federico en vivo, nada que dependa de una respuesta de Aris.

### Ajustes al diseño — confirmados por Federico 18/8/2026 ("sumalo al diseño. es importante")

1. **Red de seguridad en el backend, no solo el botón manual.** El disparo desde el navegador justo al aprobar no cubre el caso de que se corte la conexión o se cierre la pestaña en ese instante — la orden quedaría aprobada local pero sin ni siquiera haber intentado el envío, y nada lo detecta solo. Se suma un sweep por `pg_cron` (mismo patrón que ya usa `sync-yiqi`) que busca periódicamente órdenes `estado='aprobada'` con `yiqi_id_creado IS NULL` y reintenta. El botón "Reintentar envío" queda como complemento manual, no como único mecanismo de reintento.
2. **Verificar en masa `TIUN_ID_TIUN` y `ALIV_ID_ALIV` antes de hardcodearlos.** Solo se vieron constantes (`2` y `3`) en una única orden real (27 líneas, OC #1725). A diferencia de `MONE_ID_MONE` (chequeado contra ~500 órdenes vía `/search`), estos dos viven dentro de `DETALLE`, que **no** viene en `/search` — hay que pedir un muestreo de órdenes reales por `id` (una por una) y juntar los valores distintos vistos en sus líneas antes de asumir que son fijos. Paso pendiente, a correr antes de escribir el mapeo de `DETALLE` en la función.
3. **Match de proveedor normalizado.** `clientes_yiqi.clie_nombre` vs `ordenes_propias.proveedor_nombre` es un join por texto libre (mismo patrón que ya usa el resto de la app), así que la función normaliza (trim + sin distinguir mayúsculas/acentos) antes de comparar, para no fallar por una diferencia cosmética entre los dos nombres.
4. **Errores específicos, no genéricos.** Si un artículo (`mate_codigo`) no aparece en `material_yiqi`, o el proveedor no aparece en `clientes_yiqi`, la función corta con un `yiqi_error` puntual ("no se encontró el artículo 11218 en YiQi", "no se encontró el proveedor 'X' en YiQi") en vez de un mensaje genérico — así el aviso en la UI dice algo accionable.

**Próximo paso concreto:** ~~correr el muestreo de `DETALLE`~~ **✅ HECHO 18/8/2026** — ver punto 7 abajo.

## 7. Muestreo de `DETALLE` en 20 órdenes reales — `TIUN_ID_TIUN` y `ALIV_ID_ALIV` confirmados

Se sacó una muestra de 20 `yiqi_id` reales al azar (`SELECT yiqi_id FROM (SELECT DISTINCT yiqi_id FROM ordenes_yiqi WHERE total > 0) t ORDER BY random() LIMIT 20`) y se pidió cada una por `id` vía `yiqi-connector` (la respuesta viene anidada bajo `data`, ej. `resp.data.DETALLE` — un primer intento falló por no tener esto en cuenta, sin relación con los datos reales).

- **8 de las 20 órdenes trajeron `DETALLE` poblado** (las otras 12 vinieron con `DETALLE: []` — no es un problema para nuestro caso, ya que nosotros vamos a *escribir* nuestro propio `DETALLE`, no leer el de una orden existente).
- **`TIUN_ID_TIUN = 2` en el 100% de las líneas con dato.** Constante confirmada.
- **`ALIV_ID_ALIV = 3` en casi todas las líneas**, con dos excepciones: ambas son el mismo artículo `MATE_ID_MATE=122` (nombre en blanco, `" "`) en dos órdenes distintas (`553` y `1647`), que vino con `ALIV_ID_ALIV: null`. Ese mismo artículo (`122`) apareció también en la OC #1725/1667 vista en la sesión anterior, ahí **con** `ALIV_ID_ALIV=3` — es decir, ni siquiera es consistente para ese artículo puntual entre una orden y otra. Parece un ítem "comodín"/genérico cargado a mano en YiQi, ajeno al catálogo real (nombre vacío).

**Conclusión:** `TIUN_ID_TIUN=2` y `ALIV_ID_ALIV=3` se toman como constantes seguras para escribir, porque nuestro sistema arma `DETALLE` siempre a partir de `ordenes_propias_items`, cuyos artículos vienen del catálogo real (`material_yiqi`/`mate_codigo`) — nunca del ítem placeholder `122` que es el único caso visto con `ALIV_ID_ALIV` inconsistente.

**Con esto, los 4 ajustes al diseño quedan todos resueltos o incorporados. Sigue: escribir la migration (columnas `yiqi_enviada_en`/`yiqi_id_creado`/`yiqi_error` en `ordenes_propias`) y la Edge Function `enviar-oc-yiqi`.**

## 8. Construcción de la escritura a YiQi — migration, función y enganche (18/8/2026)

- **Migration `20260818130000_yiqi_escritura_oc.sql`** — agrega `yiqi_enviada_en`, `yiqi_id_creado`, `yiqi_error` a `ordenes_propias`. **✅ Aplicada** (corrida por Federico en el SQL Editor, "Success. No rows returned"). Guardada en el repo por mí vía el puente con su compu.
- **Edge Function nueva `supabase/functions/enviar-oc-yiqi/index.ts`** — recibe `{ orden_id }`, valida que la orden esté `aprobada` y no tenga ya `yiqi_id_creado` (idempotencia), resuelve `CLIE_ID_CLIE` (`clientes_yiqi`, con normalización de nombre — trim/acentos/mayúsculas) y `MATE_ID_MATE` por línea (`material_yiqi`, por `mate_codigo`, con error específico si falta alguno), arma `DETALLE` con `TIUN_ID_TIUN=2`/`ALIV_ID_ALIV=3` fijos e IVA calculado al 21% sobre el costo neto cargado, y hace `POST /ORDEN_DE_COMPRA`. Guarda éxito o error en las columnas nuevas; **nunca toca `estado`**. **✅ Deployada** (`supabase functions deploy enviar-oc-yiqi`, guardada por mí en el repo primero).
- **Enganche en el frontend** — agregado el llamado (fire-and-forget, en su propio try/catch que solo loguea si falla) a `supabase.functions.invoke('enviar-oc-yiqi', { body: { orden_id } })` en los dos puntos reales de aprobación:
  - `OrdenesPropias.jsx::confirmarDecision()` — cuando `nuevoEstado === 'aprobada'`.
  - `NuevaOC.jsx::guardarOrden()` — cuando `estado === 'aprobada'` (aprobación directa).
- **Pendiente todavía:**
  - ~~El sweep de `pg_cron`~~ **✅ HECHO 19/8/2026** — ver punto 9.
  - ~~El badge/aviso "Error de vinculación a YiQi" + botón "Reintentar envío"~~ **✅ HECHO 19/8/2026** — ver punto 9.
  - ~~Prueba de punta a punta~~ **✅ HECHO 18-19/8/2026** — orden real #9 creada en YiQi (`yiqi_id=1689`), verificada de punta a punta. Ver punto 9.

## 9. Cierre del circuito de escritura — prueba real, bug de raíz en el sync, red de seguridad y UI (18-19/8/2026)

### Prueba real de punta a punta

Se armó y aprobó una orden real chica desde la app (1 artículo, "Cepillito de Algodon PM", proveedor DENTAL MEDRANO, $860) — **orden #9**. Costó 2 rondas de ajuste al payload de `enviar-oc-yiqi` antes de que YiQi la aceptara:

1. Primer intento: `{ CLIE_ID_CLIE, MONE_ID_MONE, ... }` sueltos en la raíz del body → YiQi respondió `400 "schemaId cannot be empty"` (el `?schemaId=` en la query string, que sí alcanza para `GET`, no alcanza para este `POST`).
2. Segundo intento: se agregó `schemaId` también en el body, sigue plano → `400 "data cannot be empty"`.
3. **Formato correcto, confirmado en vivo:** el POST de creación espera el registro envuelto: `{ schemaId, data: { CLIE_ID_CLIE, MONE_ID_MONE, ORDC_FECHA, ORDC_ASUNTO, ORDC_OBSERVACIONES, DETALLE } }`. Con esto, YiQi creó la orden real.

**Bug propio encontrado en el camino (no de YiQi):** `enviar-oc-yiqi` no pudo extraer el `yiqi_id_creado` de la respuesta de éxito (quedó `null`) — la extracción original (`dataYiqi?.id ?? dataYiqi?.data?.id`) no achica correctamente el shape real de la respuesta de creación (ver bug de casing más abajo, la misma causa). **Corregido** probando las 4 combinaciones (`id`/`ID`, raíz/`data`) y logueando la respuesta cruda si ninguna matchea.

### Bug de raíz encontrado en `sync-yiqi`: YiQi usa `ID` (mayúscula), no `id`

Después de arreglar el envío, `sync-yiqi?entidad=oc` seguía devolviendo `filasSincronizadas: 0` — inicialmente se sospechó del token de YiQi (ver abajo), pero **la causa real era otra, más simple y más vieja**: la smartie `REPORTE_DE_OC` devuelve la clave primaria como `"ID"` (mayúscula, igual que el resto de sus campos — `NRO_OC`, `PROVEEDOR`, etc.), pero `mapearOrdenes()` (y también `mapearMaterial()`/`mapearClientes()`) leían `f.id` (minúscula) — siempre `undefined`, así que **todas** las filas se saltaban en silencio (el fix del 18/8 que saltea filas sin id, pensado para 1 fila excepcional, terminó enmascarando que se estaban salteando las 235). Confirmado inspeccionando la respuesta cruda de YiQi vía PowerShell directo (`ConvertTo-Json -Depth 3`). **Corregido en las 3 funciones de mapeo** (`sync-yiqi/index.ts`) para aceptar `id` o `ID`, sin asumir cuál usa cada smartie. Con el fix, `sync-yiqi?entidad=oc` pasó de `0` a **235 filas sincronizadas**.

De paso, ese mismo chequeo manual reveló el `yiqi_id` real de la orden #9 (`1689`, vía `ASUNTO: "Dentalab-Compras #9"`) — se hizo un backfill manual de `ordenes_propias.yiqi_id_creado` para esa orden puntual, y se verificó consistencia completa contra el espejo `ordenes_yiqi` (proveedor, artículo, SKU, cantidad, total — todo coincide).

### Token de YiQi: lock anti-carrera

Aparte del bug de arriba, el token de YiQi (renovado el 17/8) había vuelto a fallar (`invalid_grant`) el 18/8, casi con certeza por las múltiples Edge Functions distintas invocadas en poco tiempo durante las pruebas de hoy, coincidiendo con la ventana de auto-renovación (últimas 2hs de vida del `access_token`) — YiQi solo permite un `refresh_token` vivo por usuario, así que dos renovaciones casi simultáneas rompen la que pierde la carrera. Se regeneró el token a mano (`grant_type=password`) y se agregó una columna `refresh_lock_hasta` a `yiqi_config` (migration `20260818210000_yiqi_refresh_lock.sql`) — `_shared/yiqiConfig.ts` ahora toma un lock condicional antes de intentar renovar; si otra invocación ya lo tiene, espera 1.5s y relee en vez de competir por el mismo `refresh_token`.

### Red de seguridad por `pg_cron` (ajuste 1 del diseño, 18/8)

**Migration `20260819000000_yiqi_sweep_reintentos_oc.sql`** — función `reintentar_ordenes_pendientes_yiqi()` + cron job `reintentar-oc-pendientes-yiqi` (`*/10 * * * *`, mismo patrón `pg_net` que los otros 3 jobs). Barre `ordenes_propias` con `estado='aprobada'` y `yiqi_id_creado IS NULL`, filtrando por `coalesce(decidida_en, creada_en) < now() - interval '5 minutes'` para no pisar el fire-and-forget del frontend con una llamada en paralelo (riesgo real de duplicar la orden en YiQi si las dos corren casi juntas antes de que cualquiera guarde el resultado).

**Nota de seguridad — GitHub Push Protection bloqueó el primer commit:** la primera versión de la migration traía la `service_role` key pegada en texto plano (calcando el patrón de los otros 3 jobs, aplicados a mano sin versionar hasta ahora). Se corrigió sacando el secreto del archivo por completo: la función ahora lee la key desde **Supabase Vault** (`vault.decrypted_secrets`, cargado una sola vez a mano vía `vault.create_secret(...)`, nunca commiteado). El commit bloqueado nunca había llegado al remoto, así que se corrigió con `git commit --amend` antes del push exitoso — no reescribió historia compartida.

### UI: badge de error + reintento manual

En `OrdenesPropias.jsx`: badge "⚠ Error de vinculación a YiQi" (en la fila de la tabla y en el panel de detalle, con el texto de `yiqi_error`) cuando `estado='aprobada'` y `yiqi_id_creado IS NULL`, más botón "Reintentar envío" (tabla y detalle) que vuelve a invocar `enviar-oc-yiqi` — mismo endpoint idempotente que usa el sweep, sin riesgo de duplicar si la orden ya se había mandado bien.

### Deploy a producción

Frontend deployado a `dentalab-compras.vercel.app` vía `vercel --prod` (el auto-deploy de Vercel al hacer `git push` **sigue sin engancharse** — el webhook parece desconectado; hay que acordarse de correr `vercel --prod` a mano después de cada push que toque `frontend/`). Las 3 Edge Functions (`sync-yiqi`, `enviar-oc-yiqi`, `yiqi-connector`) redeployadas para tomar los fixes de `_shared/yiqiConfig.ts`.

### Estado al cierre de esta sesión

El circuito completo (aprobar → escribir en YiQi → verse en la UI si falla → reintento manual o automático) está construido, deployado y verificado con una orden real. Pendiente, sin urgencia:
- Reconectar el webhook de Vercel para que `git push` vuelva a auto-deployar (hoy hay que acordarse de `vercel --prod` a mano).
- Preguntarle a Aris qué significan los valores puntuales de `COVE_ID_COVE` (no bloquea nada, se sigue dejando vacío).
- Limpiar el archivo suelto `yiqi-compras-schema.json` en la raíz del repo (quedó commiteado sin querer con `git add -A`).
- Fila basura en `yiqi_config` (de una sesión anterior, no afecta porque `leerConfig()` toma la más reciente por `created_at`).
