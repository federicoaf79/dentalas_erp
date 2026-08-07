# PROMPT DE CONTINUIDAD — Dentalab-Compras
**Actualizado: 31 de julio de 2026 · Reconciliado contra repo el 5 de agosto de 2026**
*Pegar este documento completo al inicio de una nueva conversación con Claude.*

> **Estado de la reconciliación del 5/8/2026.** Se verificó el repo local `C:\dentalab-compras` archivo por archivo.
> **Producción NO se pudo verificar**: el entorno de la sesión bloquea la salida a `supabase.co`, `api.yiqi.com.ar` y `vercel.app`.
> Todo lo que depende de prod quedó marcado `[sin verificar]` y hay un script para cerrarlo en `scripts/verificar-prod.ps1`.
> El registro completo está en la sección **RECONCILIACIÓN 5/8/2026** al final.

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
- Para invocar Edge Functions desde PowerShell hacen falta **los dos headers**: `Authorization: Bearer` + `apikey`.

## QUIÉN ES QUIÉN

- Cliente **Dentalab**. Dueño: **Aris Samandjian** (aprueba, ve todo). Operadora: **Ivana** (ve solo sus proveedores).
- **Alex Samandjian** = hermano de Aris, también usuario de YiQi.
- Mails reales: Ivana `comprasdentalab@gmail.com`, Aris `aris@dentalab.com.ar`
- Usuario YiQi del sistema: `ventas@dentalab.com.ar` (con "Integrador" habilitado)

## INFRAESTRUCTURA

- Local: `C:\dentalab-compras\` — `frontend\`, `supabase\functions\`
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
| 5 | **OC escrita en YiQi** vía `POST /ORDEN_DE_COMPRA` | ❌ **NO HECHO** — nunca se probó el endpoint |
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

1. **Envío de la OC al proveedor** (Resend / WhatsApp). Los templates y el PDF están; falta la integración de envío.
2. **Escritura en YiQi** (`POST /ORDEN_DE_COMPRA`). Marcado como el mayor riesgo técnico desde el roadmap original. Nunca se probó el formato.
3. **Comparación de precios entre proveedores** (`LISTA_DE_PRECIO_COMP` / `PRECIO_ARTICULO_COMP`, identificadas pero no exploradas).

## Lo que falta y SÍ depende de respuestas

4. **Condiciones comerciales por proveedor** (mínimo de compra, descuentos por volumen, plazo de pago). La tabla `proveedores` existe pero está vacía: YiQi no tiene esos datos (`INFO_PROVEEDOR` da 404 siempre). Sin el mínimo de compra **no se puede evaluar una de las dos causales de OC provisoria definidas en v8**.
   - `[repo 2026-08-05]` Ninguna pantalla consulta la tabla: `grep "from('proveedores')"` en `frontend/src` no devuelve nada. `Proveedores.jsx` lee `material_yiqi`, no `proveedores`.
   - `[sin verificar]` Que la tabla exista en prod sale del propio MD (31/7), no se pudo confirmar contra la base. Tulkas registra el riesgo contradictorio "sin tabla ni UI" — ver contradicción C-2.
5. **Composición de combos y conversión de fraccionados.**
6. **Límite de aprobación por proveedor** (hoy es global).

---

# LO QUE ESTÁ CONSTRUIDO

## Las 14 pantallas — ninguna en construcción

Monitor de Stock · Alertas · Órdenes de compra · Seguimiento de OC · Historial de OC · **Nueva OC** · **Predictor de demanda** · Proveedores · Usuarios y accesos · **Datos de la empresa** · **Catálogo de causas** · **Reglas y alertas** · **Templates de mensajes** · Conector YiQi

`[repo 2026-08-05]` **Verificado.** `App.jsx:26-41` define `PAGINAS_CON_DATOS_REALES` con las 14 claves (`stock, seguimiento, proveedores, historial, usuarios, alertas, ocs, yiqi, predictor, nueva-oc, reglas, causas, empresa, templates`) y `App.jsx:138-155` rutea las 14 a componentes reales. `PaginaEnConstruccion` (`App.jsx:43`) quedó inalcanzable salvo con una `currentPage` fuera de la lista.

## Arquitectura de datos

El frontend **no llama a YiQi en vivo**. Dos capas:

1. **Sync:** Edge Function `sync-yiqi` disparada por 3 cron jobs de `pg_cron`:
   - jobid 3 — `sync-material-cada-15-min` (`*/15 * * * *`) → MATERIAL
   - jobid 4 — `sync-oc-y-clientes-diario` (`0 6 * * *`) → REPORTE_DE_OC + CLIENTE
   - jobid 5 — `sync-ventas-diario` (`30 6 * * *`) → REPORTE_DE_VENTAS
2. **Lectura:** las pantallas leen de las tablas propias con fetch paralelo. ~1 segundo.

⚠️ **`update cron.job set active=...` da "permission denied" desde el SQL Editor.** Usar `select cron.alter_job(3, active := false);`

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

## Tablas en Supabase

**Espejo de YiQi** (nunca mezclar con lógica propia):
- `material_yiqi` — incluye `mate_crm` (costo neto) y `mate_crm_final` (con impuestos)
- `ordenes_yiqi` — nivel de línea, **sin columna de código de proveedor**
- `clientes_yiqi` — contacto/fiscal
- `ventas_mensual_yiqi` — 36.660 filas, `periodo` como date

**Lógica propia:**
- `usuarios_config` (rol admin/operador) · `usuario_proveedor` (permisos) · `yiqi_config`
- `ordenes_propias` + `ordenes_propias_items` — circuito de OC
- `reglas_compra` — límite $1.000.000, máx 2 bultos, 2 meses de cobertura
- `empresa_config` — membrete del PDF
- `catalogo_causas` + `declaraciones_causa`
- `templates_mensaje`
- `proveedores` — condiciones comerciales, **vacía**

## Permisos — frontend + RLS

**Fase A:** `src/hooks/usePermisos.js` exporta `usePermisos()`, `filtrarMaterial()`, `filtrarOrdenes()`. **Falla cerrado.**

**4 cuidados del patrón:**
1. El filtro va en **las dos queries** — la del `count: 'exact'` y las páginas paralelas
2. No consultar hasta que `permisos.cargando` sea `false`
3. Dependencia del `useEffect` por **clave derivada string**, no por el objeto
4. `onAuthStateChange` **también dispara al refrescar el token** (al volver a la pestaña). Hay un `useRef` con el user.id que evita recargar si no cambió realmente.

**Fase B:** funciones `SECURITY DEFINER` + `STABLE`: `es_admin()`, `mis_codigos_proveedor()`, `mis_nombres_proveedor()`. Políticas en `material_yiqi`, `ordenes_yiqi`, `ventas_mensual_yiqi`.

`[repo 2026-08-05]` **Fase A verificada y en uso.** `usePermisos.js:182` exporta `filtrarMaterial()`, `:203` `filtrarOrdenes()`. `MonitorStock.jsx:31` y `:48` lo aplican en la query de `count` y en las páginas paralelas (el cuidado #1 se cumple); `:96` corta si `permisos.cargando`; `:113-115` usa clave derivada string; `usePermisos.js` tiene el `useRef` del `user.id`. Los 4 cuidados están implementados. 13 pantallas + `App.jsx` importan `usePermisos`.

`[sin verificar]` **Fase B (RLS en Postgres) no se pudo confirmar** — requiere prod. Es lo único que separa "el frontend filtra" de "los datos están protegidos": sin las políticas, cualquiera con la anon key lee las tablas espejo por PostgREST salteando el frontend.

⚠️ `[repo 2026-08-05]` **`UsuariosAccesos.jsx:259` miente.** El texto en pantalla dice *"Esta asignación todavía no se aplica como filtro"* — es un cartel viejo (archivo del 23/7, `usePermisos.js` es del 31/7). El filtro **sí** se aplica. Ese cartel es el origen de 4 riesgos falsos en Tulkas. **Borrarlo.**

⚠️ **En el SQL Editor `auth.uid()` es NULL.** Verificar siempre en el navegador logueado.

**Por qué el filtro de material es (código OR nombre):** de las 19 asignaciones, 9 tienen el NOMBRE metido en `proveedor_codigo` porque esos proveedores no tienen `CLIE_CODIGO` en YiQi.

**Detalle técnico:** el `.or()` de PostgREST es un string plano y los nombres tienen comas y paréntesis. Hay que **encomillar** cada valor. Resuelto en `comillar()`.

## Funciones de negocio en Postgres

| Función | Qué hace |
|---|---|
| `contadores_sidebar()` | Badges reales. **Sin** `SECURITY DEFINER` a propósito |
| `historial_ventas(p_meses)` | Historial por SKU |
| `historial_ventas_json(p_meses)` | Igual pero en un jsonb — **esquiva el tope de 1.000 filas de PostgREST** |
| `sugerencias_compra(p_proveedor)` | Qué y cuánto comprar. Lee `reglas_compra` |
| `proveedores_con_alertas()` | Ordenado por **demanda en riesgo**, no por cantidad |
| `es_comprable(nombre, proveedor)` | Excluye `###` de ML, discontinuados y producción propia |

⚠️ **PostgREST corta las respuestas de tipo TABLA en 1.000 filas y el tope es del servidor** — `.range()` desde el frontend no lo levanta. Solución: devolver todo en un jsonb.

⚠️ **`AVG()` miente** en `ventas_mensual_yiqi`: las celdas vacías no generan fila. Usar `SUM() / N_meses`.

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

1. **🔴 Crear los usuarios reales** en Supabase Auth + su fila en `usuarios_config` (sin la fila, el sistema falla cerrado y no ven nada). Copiar las asignaciones de proveedores de la Ivana demo.
2. **🔴 Envío de la OC al proveedor** — Resend para email. Los templates y el PDF ya están.
3. **🔴 Escritura en YiQi** (`POST /ORDEN_DE_COMPRA`) — el mayor riesgo técnico pendiente desde el inicio.
4. **Condiciones comerciales por proveedor** — depende de que Aris complete los datos.
5. **Comparación de precios** (`LISTA_DE_PRECIO_COMP` / `PRECIO_ARTICULO_COMP`).
6. **Composición de combos y fraccionados** — tabla de mapeo a mano + definición de Aris.
7. **Declarar causas desde las pantallas** — el catálogo existe, falta el modal donde se usa.
8. **Límite de aprobación por proveedor** — hoy global. Se agrega columna a `proveedores` y la lógica pasa a "el del proveedor si tiene, si no el global".
9. **Capacitación de Ivana** — criterio 7 del MVP.
10. **Badge del sidebar no se refresca** tras aprobar (se corrige recargando).
11. **Módulo de stock por depósito** — entidades ya identificadas: `CONSULTA_DE_STOCK`, `MOVIMIENTO_STOCK` (25.302 registros de ingresos), `ACTUALIZACION_DE_STO` (60.616), `PUNTO_DE_PEDIDO_POR` (punto de pedido por ubicación, solo 5 cargados).

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
| D-1 | Tulkas registra el proyecto con repo `federicoaf79/dentalab-compras`, como si el código estuviera publicado | **No hay remoto configurado.** Un único commit (`db2b8f8`, instalación de skills). `frontend/` y `supabase/` untracked. Todo el proyecto vive en un solo disco sin backup | `[repo 2026-08-05]` `git remote -v` → vacío; `git log --oneline` → 1 línea; `git status --porcelain` → `?? frontend/`, `?? supabase/` |
| D-2 | Este MD presenta la seguridad como resuelta ("Fase B: RLS real en Postgres", criterio 1 ✅ COMPLETO) | **La RLS está salteada por diseño.** Las 3 Edge Functions corren con `service_role` y ninguna valida al llamante. Lo que pase por ellas ignora las políticas | `[repo 2026-08-05]` `grep "getUser\|rol\|esAdmin"` en las 3 → ninguna validación; `yiqi-connector:234`, `admin-usuarios:121`, `sync-yiqi:422` crean el client con `SUPABASE_SERVICE_ROLE_KEY` |
| D-3 | Este MD no menciona en ningún lugar que falten migrations | **`supabase/migrations/` no existe, y no hay ni un `.sql` en todo el repo.** El repo no describe la base | `[repo 2026-08-05]` `ls supabase/migrations` → No such file; `find . -name "*.sql"` → 0 resultados |
| D-4 | `dentalabs_Sup_KW.txt` figuraba en Tulkas 8 veces como riesgo abierto — pero sin confirmar si seguía vivo | **Sigue sin gitignorear y con la password de Postgres en claro.** Corregido en esta sesión (`.gitignore`), pero **la credencial ya estuvo expuesta y hay que rotarla** | `[repo 2026-08-05]` `git check-ignore dentalabs_Sup_KW.txt` → no ignorado; aparecía en `git status ??` |
| D-5 | Este MD (31/7) describe el estado del proyecto | **Hay trabajo del 2/8 que el MD no refleja**: `App.jsx`, `Sidebar.jsx`, `OrdenesPropias.jsx`, `pdfOrden.js`, `Empresa.jsx`, `TemplatesMensajes.jsx`, `CatalogoCausas.jsx`, `ReglasAlertas.jsx`. De ahí salen H-1 y H-2 | `[repo 2026-08-05]` `find -newermt "2026-07-31"` sobre `frontend/src` |

## NUEVO — apareció y no estaba documentado en ningún lado

| # | Hallazgo | Evidencia |
|---|---|---|
| N-1 | **Copias `.bak` dentro de `supabase/functions/sync-yiqi/`** (`index.ts.bak`, `.bak2`). `supabase functions deploy` empaqueta el directorio entero: van al bundle de Deno en producción | `[repo 2026-08-05]` `find supabase/functions -name "*.bak*"` |
| N-2 | **Los smartieId documentados en `yiqi-connector` son los viejos.** El comentario dice 2340/2341/2343 y los ejemplos usan 2341; el sync real usa 2344/2345/2346 | `[repo 2026-08-05]` `yiqi-connector/index.ts:45-47,385,390` vs `sync-yiqi/index.ts:379-381` |
| N-3 | **`UsuariosAccesos.jsx:259` muestra un cartel falso al usuario**: "Esta asignación todavía no se aplica como filtro". El archivo es del 23/7, `usePermisos.js` del 31/7. Es el origen de los 4 riesgos falsos de H-1 | `[repo 2026-08-05]` `UsuariosAccesos.jsx:259` + fechas de mtime |
| N-4 | **`UsuariosAccesos.jsx` no importa `usePermisos`** — es la única pantalla operativa sin gate de rol. Cualquier usuario logueado puede reasignar proveedores | `[repo 2026-08-05]` `grep esAdmin UsuariosAccesos.jsx` → 0 resultados; no figura en la lista de importadores de `usePermisos` |
| N-5 | **Son 21 archivos `.bak`**, no 18 ni 19: 19 en `frontend/src` + 2 en `supabase/functions` | `[repo 2026-08-05]` `find -name "*.bak*"` |
| N-6 | **La integración de Tulkas con GitHub está rota.** `get_commits(dentalab)` devuelve `Bad credentials`. Las auditorías de Tulkas **no están leyendo commits** — coherente con D-1 (no hay nada que leer) | `[tulkas 2026-08-05]` respuesta de la herramienta |
| N-7 | **Tulkas tiene 98 riesgos abiertos que son ~41 problemas reales.** 74 entradas son duplicados de 17 issues. El mismo problema entra con severidad distinta según la auditoría (los badges del sidebar están como CRITICAL y como LOW a la vez) | `[tulkas 2026-08-05]` agrupación de los 98 |
| N-8 | **El Project de Claude "Módulo Compras Dentalab" está vacío** (0 docs, 0 archivos). El MD de contexto vive solo en el repo | `[claude-project 2026-08-05]` `project_info` |
| N-9 | **`App.jsx:187` pasa `onLoginExitoso={() => {}}`** — prop muerta. El login funciona solo por el listener `onAuthStateChange` | `[repo 2026-08-05]` `App.jsx:187`, `Login.jsx:27` |
| N-10 | **`ReglasAlertas.jsx:87-89` usa `Number()` sin validar** — un input vacío guarda 0 en `limite_aprobacion` en silencio | `[repo 2026-08-05]` `ReglasAlertas.jsx:87-89` |
| N-11 | **No hay CI, ni tests, ni `.github/`** en el repo | `[repo 2026-08-05]` `ls .github` → no existe; `find "*.test.*"` → 0 |

## CONTRADICCIONES

**C-1 — Edge Functions: ¿validan sesión o no? — RESUELTA PARCIALMENTE.**
Tulkas tiene las dos versiones: "no valida sesión del llamante" y "solo valida JWT válido, no rol de negocio". `[repo 2026-08-05]` En el código **no hay ninguna validación**: cero `getUser`, cero chequeo de rol en las 3 funciones. `config.toml` no declara `verify_jwt` por función, así que aplica el default de plataforma — que exige un JWT válido, **pero la anon key ES un JWT válido y es pública**. Las dos versiones son parcialmente ciertas y el efecto práctico es el mismo: cualquiera con la anon key entra. `[sin verificar]` Falta confirmar en prod si se desplegaron con `--no-verify-jwt`.

**C-2 — Tabla `proveedores`: ¿existe? — SIN RESOLVER.**
Este MD dice "existe pero está vacía". Tulkas dice "sin tabla ni UI". `[repo 2026-08-05]` Ninguna pantalla la consulta, así que el repo no decide la cuestión. `[sin verificar]` Requiere prod. **Se deja escrita como contradicción.**

**C-3 — Lógica de paginación duplicada: ¿6 o 7? — RESUELTA.**
Tulkas dice "7 pantallas" en un riesgo y "6 componentes" en otro. `[repo 2026-08-05]` Son **7**: `Alertas`, `HistorialOC`, `MonitorStock`, `OrdenesCompra`, `Proveedores`, `SeguimientoOC`, `UsuariosAccesos`. La versión de 6 omitía `UsuariosAccesos.jsx`.

## LO QUE NO ENCONTRÉ

Cada uno de estos es un hallazgo, no un vacío:

- **`supabase/migrations/`** — no existe. Tampoco hay ningún `.sql` en el repo.
- **`schema.sql`** — un riesgo CRITICAL de Tulkas ("Bearer token YiQi sin encriptar") cita `schema.sql:15` como evidencia. **Ese archivo no existe.** El riesgo apunta a la línea de un archivo fantasma; la preocupación de fondo (token en claro en `yiqi_config`, sin Vault) sigue en pie pero `[sin verificar]`.
- **`dentalab-compras-prototipo-v7.html`** — no existe. El archivo del repo es **v8**. Dos riesgos de Tulkas citan el v7 con números de línea.
- **`NOMBRE_ART`** — 0 apariciones en `frontend/src`.
- **`Fragment` / `<>` en `SeguimientoOC.jsx`** — 0 apariciones.
- **Cualquier `POST` a `/ORDEN_DE_COMPRA`** — 0 apariciones. Solo la whitelist de lectura en `yiqi-connector/index.ts:57`.
- **Código de Resend, WhatsApp o Puppeteer** — 0 líneas. Los dos riesgos HIGH de Tulkas ("Puppeteer incompatible con Deno", "dominio Resend sin verificar") son preocupaciones sobre código que **todavía no existe**. No son defectos; son requisitos del ítem 2 de PENDIENTE INMEDIATO.
- **Remoto de git, CI, tests** — nada de eso existe.

---

# PENDIENTE INMEDIATO

Ocho, por impacto.

1. **Commitear todo y crear un remoto.** `[repo 2026-08-05]` Un solo commit, sin remoto, `frontend/` y `supabase/` untracked. Un disco que se rompe se lleva el proyecto entero. Es el riesgo más grande y el más barato de cerrar.
2. **Rotar la password de Postgres y la anon key**, y sacar `dentalabs_Sup_KW.txt` del repo. El `.gitignore` ya lo cubre `[repo 2026-08-05]`, pero la credencial estuvo en claro en disco: ignorarla no la des-expone.
3. **Autorización en las 3 Edge Functions.** `[repo 2026-08-05]` Corren con `service_role` sin validar al llamante. Mientras siga así, la RLS de Fase B no protege nada de lo que pase por ellas.
4. **Capturar el baseline de migrations desde prod** → `scripts/capturar-baseline.ps1`. Sin esto el repo no describe la base y la próxima sesión vuelve a adivinar.
5. **Verificar Fase B (RLS) en vivo** → `scripts/verificar-prod.ps1`, **logueado como Ivana en `https://dentalab-compras.vercel.app/login`** (no desde el SQL Editor: ahí `auth.uid()` es NULL). Es lo único que separa "el frontend filtra" de "los datos están protegidos".
6. **Crear los usuarios reales** en Supabase Auth + su fila en `usuarios_config` (Aris y Ivana). Sin la fila el sistema falla cerrado y no ven nada.
7. **Borrar el cartel falso de `UsuariosAccesos.jsx:259`** y agregarle gate de `esAdmin` a la pantalla (N-3 y N-4). Hoy miente al usuario y no restringe.
8. **Limpiar los 21 `.bak`**, empezando por los 2 de `supabase/functions/sync-yiqi/` que se despliegan a producción (N-1).

# ESPERA A OTRA PERSONA

| Qué se necesita | De quién | Desde cuándo | Qué bloquea |
|---|---|---|---|
| Condiciones comerciales de los 15-20 proveedores principales (mínimo de compra, plazo, descuentos, mail/WhatsApp de pedidos) | **Aris** | 31/7/2026 | Una de las dos causales de OC provisoria. Es lo más bloqueante del lado del cliente |
| Confirmar que el **módulo Compras está activo en la licencia de YiQi** | **Aris** / soporte YiQi | desde el inicio del proyecto | `POST /ORDEN_DE_COMPRA` — criterio 5 del MVP. Sin esto no se puede ni probar |
| Decisión sobre las smarties: avisar al equipo vs. crear usuario `sistema@dentalab.com.ar` con Integrador | **Aris** | 31/7/2026 (tras el incidente de la 2344) | Que se repita la pérdida de columnas en los 7.173 artículos |
| Lista de composición de combos ML (49) y fraccionados (`-F`, 234) | **Aris** | 31/7/2026 | El cálculo de consumo promedio; hoy sugiere comprar de menos |
| ¿Límite de aprobación por proveedor, o sigue global en $1.000.000? | **Aris** | 31/7/2026 | Ítem 8 del roadmap |
| ¿Se corrige el −58 de "En tránsito" del SKU 1002 en YiQi? | **Aris** | 31/7/2026 | Nada crítico; queda como dato sucio |
| Qué significa el campo **Asunto** de las OC (29 de 55 dicen "Listo- dsps borrar contenido") | **Ivana** | 31/7/2026 | Convertirlo en estado del pedido, si es que lo es |
| Validación del catálogo de causas y de su rutina diaria de pedidos | **Ivana** | 31/7/2026 | Ajuste fino del flujo operativo |
| **Capacitación** (1 hora) | **Ivana** | pendiente, sin fecha | Criterio 7 del MVP — el último que falta para cerrar el contrato |
