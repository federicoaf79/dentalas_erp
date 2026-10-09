# CLAUDE.md — Dentalab-Compras

> **Creado 2026-10-09** por reconciliación entre `PROMPT_CONTINUIDAD_Dentalab-Compras.md` (historial de sesiones hasta el 21/8/2026), `DEFINICIONES_PENDIENTES_Dentalab.md`, `git log` (111 commits, último `f86b582` 2026-10-07) y `supabase/migrations/` (55 archivos).
> **Este archivo es el estado operativo vigente.** `PROMPT_CONTINUIDAD` queda como historial (append-only, no se reescribe). Ante contradicción gana lo verificado; lo marcado **[sin verificar]** no fue probado en vivo.
> Reglas compartidas del ecosistema: `.claude/skills/tulkas-stack.md`, `karpathy-guidelines.md`, `anthropic-best-practices.md`.

## Qué es

Sistema de gestión de compras y stock para **Dentalab** (laboratorio dental, Argentina), integrado con su ERP **YiQi**. Dos aplicaciones en un mismo frontend: la app de **Compras/Stock** (`App.jsx`, Aris e Ivana) y la app de **Depósito** (`AppDeposito.jsx`, operarios de Local y Central). La base propia que se puebla desde YiQi es el cimiento de un futuro ERP completo para Dentalab.

## Quién es quién

- Cliente Dentalab. Dueño: **Aris Samandjian** (`aris@dentalab.com.ar`, rol admin — aprueba, ve todo, sus órdenes se confirman sin control de aprobación). Operadora: **Ivana** (`comprasdentalab@gmail.com`, rol operador — ve solo sus proveedores). Alex Samandjian = hermano de Aris, usuario de YiQi.
- Usuario YiQi del sistema: `ventas@dentalab.com.ar` (Integrador habilitado).
- Demo: `aris@dentalab-compras.demo` / `ivana@dentalab-compras.demo`. Las cuentas reales tienen cambio de clave propio desde `24cb355` (30/9); **ya no hay clave por defecto en el bundle**.

## Infraestructura y dónde se ejecuta cada cosa

| Qué | Dónde |
|---|---|
| Repo local | `C:\dentalab-compras\` — `frontend\` (React 19 + Vite 8 + Tailwind 4), `supabase\functions\`, `supabase\migrations\` |
| Remoto | `github.com/federicoaf79/dentalas_erp`, rama `main`. Vercel conectado a Git desde el 19/8 (auto-deploy al push) |
| Producción | `https://dentalab-compras.vercel.app` — deploy manual alternativo: `cd C:\dentalab-compras\frontend ; vercel --prod` |
| Supabase | proyecto `hsfudsnmooaesrzdwecg` (org UrbanTales, plan Pro). SQL Editor para migraciones y `pg_get_functiondef` |
| Edge Functions | `admin-usuarios`, `yiqi-connector`, `sync-yiqi`, `enviar-oc-yiqi`, `editar-oc-yiqi`, `yiqi-borrar-oc`, `mover-stock-yiqi`, `mover-stock-reposicion`, `_shared/yiqiConfig.ts` (renovación automática del token). Todas con `verify_jwt=false` y validación propia (`e837a58`, `b93f735`) |
| Credenciales | Token YiQi en tabla `yiqi_config` (se renueva solo, 2 h antes de vencer, `expires_in` ≈ 24 h). Keys de los crons en **Vault** (`20260930120000`). Nunca pedir tokens por chat |
| PowerShell | Siempre con `cd C:\dentalab-compras` al inicio. `Read-Host` falla seguido: leer la anon key de `frontend\.env.local` |

## Arquitectura de datos

El frontend **no llama a YiQi en vivo**. Dos capas:

1. **Sync** — Edge Function `sync-yiqi` disparada por `pg_cron`: jobid 3 `sync-material-cada-15-min` (MATERIAL), jobid 4 `sync-oc-y-clientes-diario` 06:00 UTC (REPORTE_DE_OC + CLIENTE), jobid 5 `sync-ventas-diario` 06:30 UTC (REPORTE_DE_VENTAS); más stock por depósito (`stock_yiqi`, cada 15 min), último movimiento por SKU (`ultimo_movimiento_stock_yiqi`) y ventas por vendedor (`ventas_mensual_yiqi_vendedor`, `20260914090000`). Desde `9bee321` (29/9) soporta el formato nuevo de smarties pivoteadas.
2. **Lectura** — las pantallas leen las tablas propias con fetch paralelo.

⚠️ `update cron.job set active=...` da permission denied en el SQL Editor → `select cron.alter_job(3, active := false);`
⚠️ El cron "succeeded" no es señal de salud: `net.http_post` encola y no refleja la respuesta. Mirar `net._http_response` y la observabilidad persistente (sesión 20/8).

### Tablas espejo de YiQi (nunca mezclar con lógica propia)
`material_yiqi` (incluye `mate_crm` costo neto y `mate_crm_final`) · `ordenes_yiqi` (**una fila por línea de OC** desde `20260928190000`) · `clientes_yiqi` (solo logueados desde `20260930121000`) · `ventas_mensual_yiqi` (36.660 filas, `periodo` date) · `ventas_mensual_yiqi_vendedor` · `stock_yiqi` · `ultimo_movimiento_stock_yiqi`.

### Tablas propias
`usuarios_config` (admin/operador) · `usuario_proveedor` · `yiqi_config` · `ordenes_propias` + `ordenes_propias_items` (papelera reversible `archivada_en/por`; `yiqi_id_creado`/`yiqi_error`) · `reglas_compra` · `empresa_config` · `catalogo_causas` + `declaraciones_causa` (append-only, archivar/restaurar `bca7b94`) · `templates_mensaje` · `proveedores` (condiciones comerciales, `vende_en_cajas_cerradas` `e54999b`) · `composicion_articulos` (44 filas, fraccionados y combos ML) · `articulos_excluidos_alertas` · `alertas_pausadas` · `alertas_suspendidas` · `reposiciones_sugeridas` · `solicitudes_reposicion` + líneas/remitos (circuito Central↔Local, `31dfee6`) · `sugerencias_compra` con máximo (`20261007120000`).

**Baseline**: `20260801000000_baseline_objetos_creados_a_mano.sql` versiona 25 tablas, funciones, vista, policies y triggers que se habían creado a mano (`aaa89e9`, 30/9). Cierra el riesgo "esquema sin migrations" de Tulkas.

### Las smarties en YiQi (renombrar CAMBIA el smartieId; editar columnas no)
| Smartie | id | Entidad |
|---|---|---|
| API_Articulos_Stock NO BORRAR | 2344 | MATERIAL (16 campos obligatorios, ver PROMPT_CONTINUIDAD "INCIDENTE 31/7") |
| API_OC_Recientes NO BORRAR | 2345 | REPORTE_DE_OC |
| API_Proveedores_Activos NO BORRAR | 2346 | CLIENTE |
| API_Ventas_Mensual NO BORRAR | 2353 | REPORTE_DE_VENTAS (pivoteada) |
| Z.API_Stock_Por_Deposito_NO_BORRAR | 2360 | STOCK |
| Z.API_Movimientos_Stock_NO_BORRAR | 2359 | MOVIMIENTO_STOCK |

Máximo 100 registros por página. El sufijo "NO BORRAR" no protege de ediciones (incidente del 31/7: la 2344 perdió 8 columnas).

## Permisos — frontend + RLS

- **Fase A (frontend)**: `src/hooks/usePermisos.js` → `usePermisos()`, `filtrarMaterial()`, `filtrarOrdenes()`. Falla cerrado. 4 cuidados: filtro en las dos queries (count + páginas), no consultar hasta `permisos.cargando === false`, dependencia por clave string, `useRef` del `user.id` para `onAuthStateChange`.
- **Fase B (Postgres)**: `es_admin()`, `mis_codigos_proveedor()`, `mis_nombres_proveedor()`, `nombres_usuarios(uuid[])` — `SECURITY DEFINER STABLE`. Policies en `material_yiqi`, `ordenes_yiqi`, `ventas_mensual_yiqi`, `composicion_articulos`. `EXECUTE` de funciones cerrado a `anon` (`20260930130000`); upserts de ventas sin `EXECUTE` público (`9bee321`).
- **Depósito**: permisos por depósito y control en declarar/confirmar/crear remito (`aaa89e9`); las pantallas de depósito no leen ventas ni consultas de compras (`54523b8`, `24cb355`).
- Filtro de material es (código OR nombre): 9 de 19 asignaciones tienen el nombre en `proveedor_codigo`. Encomillar valores en `.or()` → `comillar()`.
- ⚠️ En el SQL Editor `auth.uid()` es NULL: verificar siempre en el navegador logueado.
- Edición de OC: creadora en borrador/pendiente, Aris en no aprobadas; editar una pendiente la vuelve a borrador (`7d3b683`, `20261003100000`). "Editar solo para el creador del borrador" (`24cb355`).

## Funciones de negocio en Postgres

`contadores_sidebar()` (badges; sin SECURITY DEFINER a propósito; excluye excluidos/pausados/Acritone-NewcryL) · `historial_ventas(p_meses)` y `historial_ventas_json` (esquiva el tope de 1.000 filas de PostgREST) · `sugerencias_compra(p_proveedor)` (lee `reglas_compra`, `composicion_articulos`, excluye `es_administrativo`) · `proveedores_con_alertas()` (por demanda en riesgo) · `es_comprable(nombre, proveedor)` (excluye `###` ML, discontinuados, producción propia Dentalab, Acritone/NewcryL `37b465d`) · `es_administrativo(sku)` (889/890/99999) · `es_para_fraccionar(nombre)` · `reposicion_interna()` (Local↔Central, ABC, 8 prioridades; excluye a Patricia `20260911180000`, Pareto sin administrativos `20260914150000`) · `evaluar_reglas_reposicion_central()` (`20260916140000`) · `calcular_punto_equilibrio` (fix DELETE sin WHERE que congeló ventas desde el 8/9, `9bee321`) · `buscar_articulos_proveedor()`.

⚠️ PostgREST corta respuestas tipo TABLA en 1.000 filas (tope de servidor): devolver jsonb. ⚠️ `AVG()` miente en `ventas_mensual_yiqi`: usar `SUM()/N_meses`.

## Decisiones de negocio confirmadas por Aris (no rediscutir)

Punto de pedido calculado por el sistema (respaldo `mate_stock_seguridad`) · `mate_cantidad_de_unidades` es el campo autoritativo de unidad de compra · depósitos con movimiento: Local, Central, Vendedor Jorge; `MATE_STOCK_DISPONIBLE` = Local + Central · "En tránsito" es una ubicación · ML Full no vuelve · combos ML descuentan automáticamente · `###` = publicación ML; `-F`/`-U` = fraccionados · decimales en stock son legítimos · "Dentalab" como proveedor = producción propia · costo = `MATE_CRM` · el límite de aprobación es sobre Ivana, no sobre Aris · condiciones comerciales = reglas por perfil de proveedor (`CondicionesProveedor.jsx`) · limpieza de alertas: exclusión permanente por SKU (admin) + pausa de 15 días (cualquier usuario) · combo Speedex `21081 = 21083+21084+21085` · "PARA FRACCIONAR" = no enviar al local, sí puede comprarse como materia prima.

## Hechos técnicos de YiQi (no re-descubrir)

Auth `POST /token` (form) → `GET /api/accountapi/GetLoginInformation` → `schemaId=328`. Smarties: `GET /api/public/{ENTIDAD}/smartie?smartieId=&schemaId=328&page=`. `/query` siempre 500; `/search` topeado en 50. Códigos de error inútiles. Vistas guardadas son por usuario. Pivot obliga COLUMNA + DATOS; claves genéricas `C2..C21` desordenadas, mapeo en `columns`. Lead time = `MATE_LEAD_TIME_MAXIMO`. Artículo Base vacío. Campo basura `ckeck`. Escritura: `POST /ORDEN_DE_COMPRA` funciona (OC #9 → `yiqi_id=1689`, 19/8); `POST /MOVIMIENTO_STOCK` funciona (`3faf484`, 6/9); YiQi devuelve `ID` mayúscula; no hay `DELETE` (solo `CANCELACION_DE_COMPR`); `yiqi-borrar-oc` es herramienta manual de limpieza, 1 OC por vez. El `access_token` dura ~24 h: la renovación vive en `_shared/yiqiConfig.ts`.

## Estado contra el MVP contratado (USD 1.500 / ~106 h)

| # | Criterio | Estado |
|---|---|---|
| 1 | Login con roles | ✅ |
| 2 | Sync de stock sin intervención | ✅ (crons con keys en Vault) |
| 3 | Monitor bajo punto de reposición | ✅ |
| 4 | OC generada, aprobada y enviada al proveedor | ✅ WhatsApp semi-automático (PDF + texto) |
| 5 | OC escrita en YiQi | ✅ |
| 6 | Historial de OC consultable | ✅ |
| 7 | Ivana opera sola tras capacitación | ⏸️ pendiente la capacitación |

Entregado de más: predictor de demanda (Módulo D, USD 360), semáforo de aprobación, catálogo de causas, templates, PDF, RLS real, comparación de precios, reposición interna con remitos Excel, circuito Central↔Local con app de depósito, estética v7.

## Pantallas

**Compras/Stock** (`App.jsx`, navegación por estado `currentPage`, sin router): Monitor de stock · Alertas · Nueva OC · Órdenes de compra · Seguimiento de OC · Historial de OC · Predictor de demanda · Comparación de precios · Revisar equivalencias · Reposición Central-Local (supervisión admin) · Proveedores · Condiciones comerciales · Usuarios y accesos · Datos de la empresa · Catálogo de causas · Reglas y alertas · Templates de mensajes · Conector YiQi · Ayuda. Reposición interna salió del menú de Aris/Ivana (`07986d6`).
**Depósito** (`AppDeposito.jsx`, `pages/deposito/`): Solicitudes para preparar · Confirmar recepción · Pedir al otro depósito · Ayuda. Clase ABC congelada en la línea del remito (`54523b8`).

## Actualizaciones 22 ago → 7 oct 2026 (70 commits) — [repo 2026-10-09]

> No estaban en ningún documento. Resumen por tema con hashes.

- **Causas y OC** — declarar causas en Stock, Compras y Entregas (`b6f9dd8`, ítem 7 cerrado); agregar mercadería a OC ya vinculada a YiQi (`b7a6509`, `editar-oc-yiqi`); archivar/restaurar causa sin romper append-only (`bca7b94`); Nueva OC bloquea cantidad que no es múltiplo del bulto (`dd8ae08`), tilda al cargar cantidad (`eb042c5`), evita duplicadas con bloqueo de doble guardado (`f542115`); editar OC pendiente/borrador (`7d3b683`); validación de costo en `enviar-oc-yiqi` (`cd6ac92`).
- **Alertas / Monitor** — exclusión Acritone/NewcryL (`29ac3a4`, `37b465d`, `2be9434`); reactivar exclusión manual (`7e5bcb2`); Monitor aplica exclusiones y pausas (`109e585`); filtro Stock Seguridad = 0 (`26ad820`); estado de OC por SKU y rotación (`8d82d2d`); cantidad en camino (`fe2c185`); barra Stock/Min/Max y gráfico (`98bb0ab`, `921f3a7`); armar OC desde Alertas; trigger que reactiva alertas de stock (`20260930131000`).
- **YiQi escritura y herramientas** — `yiqi-borrar-oc` (modos GET, diagnóstico, búsqueda genérica por entidad, `b356fff`→`cb2675b`); Movido de Reposición interna se refleja en YiQi vía `POST /MOVIMIENTO_STOCK` (`3faf484`, `mover-stock-yiqi`); `verify_jwt=false` en las 7 funciones porque el formato nuevo de key rompía la validación de plataforma (`e837a58`).
- **Circuito Central↔Local (Eje 1)** — pantallas de depósito, shell `AppDeposito`, permisos por depósito, `mover-stock-reposicion` (`31dfee6`); vista de supervisión admin (`11497de`); remito imprimible, En tránsito (`07986d6`); clase ABC en depósito y remito (`4ff070b`); cierre automático de pedidos completada/anulada (`492f36a`, `20260930140000`); migraciones Eje 1 + scripts de verificación contra prod (`6fbd685`).
- **Sync y seguridad** — ventas por vendedor (`20260911170000`, cron `20260914090000`, suma por clave antes de las tandas `24cb355`); formato nuevo de smarties pivoteadas + fix ventas congeladas desde 8/9 (`9bee321`); crons leen key de Vault con timeout 120 s (`48d6741`); lectura solo logueados (`20260930121000`); permisos de funciones (`20260930130000`); baseline de 25 objetos creados a mano (`aaa89e9`); cambio de clave propio, sin clave por defecto en el bundle (`24cb355`); migraciones del 11–16/9 que estaban aplicadas sin commitear, versionadas (`3e3e0cc`); jspdf 4 + autotable 5, audit fix (`af9210f`).
- **UX / estética v7 (feedback de Ivana, fases A–E, 2/10)** — base visual del prototipo v7, código de color único (`8804f80`); Editar/Ver según permiso, filtro Sin proveedor (`2a51f1b`); detalle de OC con barra de pasos (`2c791b2`); tablas aireadas, pastillas unificadas (`70c4d1b`, `30e4b7e`); órdenes como tarjetas con semáforo, Monitor con KPIs accionables (`446004e`, `021d97b`); iconos Tabler (`3ab7af4`); tablas que entran en 1536 px (`f86b582`); PDF A4 centrado, fix congelamiento al imprimir (`ab34e4f`, `8b6cd5a`); auditorías de usabilidad 6/9 y 7/9 (`f3423f9`, `f4f98a9`); Ayuda actualizada al 7/10 (`58fa466`).

## Riesgos — estado real [repo 2026-10-09]

- Credenciales en la raíz del repo [repo 2026-10-09, `git ls-files` + lectura del script]: `dentalabs_Sup_KW.txt` y `verificarschemastockyiqi.ps1` **NO están trackeados** (quedaron fuera con `f1d246b`). `yiqi-renovar-token.ps1` sí está trackeado pero `$clave = "COMPLETAR_ACA"` es un placeholder con guard — **no hay credencial real en el repo**. Los riesgos de Tulkas "credencial YiQi en texto plano" y "password-yiqi-en-yiqi-renovar-token" quedan **DESMENTIDOS** para el working tree; `git log --all` confirma que `dentalabs_Sup_KW.txt` y `verificarschemastockyiqi.ps1` **nunca entraron al historial**. Riesgo cerrado del todo.
- Edge Functions sin autorización → **cerrado** 7/8 (`verificarLlamador`) y reforzado con `verify_jwt=false` + validación propia 6/9. Tulkas lo sigue listando: desactualizado.
- Esquema sin migrations → **cerrado** con baseline `20260801000000` (30/9). Tulkas desactualizado.
- Código sin git → **cerrado** 6/8 (remoto `dentalas_erp`). Tulkas desactualizado.
- Duplicados históricos de OC en YiQi sin reconciliar → abierto; herramienta `yiqi-borrar-oc` lista, decisión de Aris pendiente.
- Colisión de renovación de token entre los 3 crons a las 06:00 UTC → aceptado, sin locking.
- Carpetas `_to_delete`, `_to_delete_git_locks`, `_to_delete_old` en la raíz → pendientes de borrar a mano.

## PENDIENTE INMEDIATO

1. Mover `dentalabs_Sup_KW.txt` fuera del repo (está sin trackear pero sigue en la carpeta; cualquier `git add .` descuidado lo sube).
2. Capacitación de Ivana (criterio 7 del MVP).
3. Borrar las carpetas `_to_delete*` de la raíz.
4. Automatizar la regla "3 años sin movimiento" sobre `ultimo_movimiento_stock_yiqi` (hoy exclusión manual).
5. Envío de OC por email (Resend) — no pedido, no construir sin pedido.

## ESPERA A OTRA PERSONA

| Qué | De quién | Desde |
|---|---|---|
| Condiciones comerciales reales de los 15–20 proveedores principales | Aris | 6/8/2026 |
| WhatsApp de pedidos de los proveedores reales | Aris / Ivana | 20/8/2026 |
| Decisión sobre OC duplicadas en YiQi (orden #2) | Aris | 20/8/2026 |
| Datos reales de "Datos de la empresa" (membrete del PDF) | Aris | 21/8/2026 |
| Que nadie edite las smarties "NO BORRAR" (o usuario YiQi propio del sistema) | Aris | 31/7/2026 |
