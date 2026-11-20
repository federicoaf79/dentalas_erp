# CLAUDE.md — Dentalab-Compras

<!-- TULKASOS:ESTADO:INICIO -->
> **Estado TulkasOS (automático, 2026-11-19):** 96% · 40 ítems · 40 validados · 40 en producción · 0 evidencia rota · cambios: +0 ~26 −0. Detalle por ítem en `INVENTARIO.md`. No editar este bloque: lo reescribe el sistema. Lo tuyo va en `## Cierre AAAA-MM-DD` al final de este archivo.
<!-- TULKASOS:ESTADO:FIN -->

> **Trabajo con TulkasOS:** al abrir una sesión, leé el bloque "Estado TulkasOS" y el último "## Cierre" de este archivo más `INVENTARIO.md`, y proponé el trabajo a partir de los pendientes por ítem. Al cerrar, seguí el protocolo "Trabajo con TulkasOS" (commits descriptivos + bloque `## Cierre AAAA-MM-DD` con claves de `INVENTARIO.md`). No edites `INVENTARIO.md` ni la sección "Estado TulkasOS". Nunca `git push`.

> **Creado 2026-10-09** por reconciliación entre `PROMPT_CONTINUIDAD_Dentalab-Compras.md` (historial de sesiones hasta el 21/8/2026), `DEFINICIONES_PENDIENTES_Dentalab.md`, `git log` (111 commits, último `f86b582` 2026-10-07) y `supabase/migrations/` (55 archivos).
> **Actualizado 2026-10-18** con la reconciliación de producción (en vivo), repo (HEAD `8c9a98e` = `origin/main`) y Tulkas — ver la sección "Reconciliación 2026-10-18".
> **Actualizado 2026-10-23** (HEAD `8076d6c` = `origin/main`): feedback de Ivana, modo prueba (no se escribe en YiQi), limpieza etapa 1, la #21 no existe en YiQi, OC "Cerradas en YiQi" (fin de las falsas "Demoradas") y fechas de Seguimiento — ver la sección "Actualización 2026-10-23".
> **Este archivo es el estado operativo vigente.** `PROMPT_CONTINUIDAD` queda como historial (append-only, no se reescribe). Ante contradicción gana lo verificado; lo marcado **[sin verificar]** no fue probado en vivo.
> Reglas compartidas del ecosistema: `.claude/skills/tulkas-stack.md`, `karpathy-guidelines.md`, `anthropic-best-practices.md`.

## Qué es

Sistema de gestión de compras y stock para **Dentalab** (laboratorio dental, Argentina), integrado con su ERP **YiQi**. Dos aplicaciones en un mismo frontend: la app de **Compras/Stock** (`App.jsx`, Aris e Ivana) y la app de **Depósito** (`AppDeposito.jsx`, operarios de Local y Central). La base propia que se puebla desde YiQi es el cimiento de un futuro ERP completo para Dentalab.

## Quién es quién

- Cliente Dentalab. Dueño: **Aris Samandjian** (`aris@dentalab.com.ar`, rol admin — aprueba, ve todo, sus órdenes se confirman sin control de aprobación). Operadora: **Ivana** (`comprasdentalab@gmail.com`, rol operador — ve solo sus proveedores). Alex Samandjian = hermano de Aris, usuario de YiQi.
- Usuario YiQi del sistema: `ventas@dentalab.com.ar` (Integrador habilitado).
- Demo:
  - `aris@dentalab-compras.demo` / `ivana@dentalab-compras.demo`: **borradas el 6/9** (DESMENTIDO 23/10: este archivo las seguía listando). Federico entra como admin con `federico@tulkasmedia.com`.
  - Cuentas de depósito de prueba: `central@` y `local@dentalab-compras.demo` [prod 2026-10-23].
  - Las cuentas reales tienen cambio de clave propio desde `24cb355` (30/9). **Ya no hay clave por defecto en el bundle.**

## Infraestructura y dónde se ejecuta cada cosa

| Qué | Dónde |
|---|---|
| Repo local | `C:\dentalab-compras\` — `frontend\` (React 19 + Vite 8 + Tailwind 4), `supabase\functions\`, `supabase\migrations\` |
| Remoto | `github.com/federicoaf79/dentalas_erp`, rama `main`. Vercel conectado a Git desde el 19/8 (auto-deploy al push) |
| Producción | `https://dentalab-compras.vercel.app` — se despliega solo con el push a `main`. `vercel --prod` falla ("Could not retrieve Project Settings") [en vivo 2026-10-02] |
| Supabase | proyecto `hsfudsnmooaesrzdwecg` (org UrbanTales, plan Pro). SQL Editor para migraciones y `pg_get_functiondef` |
| Edge Functions | `admin-usuarios`, `yiqi-connector`, `sync-yiqi`, `enviar-oc-yiqi`, `editar-oc-yiqi`, `yiqi-borrar-oc`, `mover-stock-yiqi`, `mover-stock-reposicion`, `_shared/yiqiConfig.ts` (renovación automática del token). Validación propia con `verificarLlamador()` (`e837a58`, `b93f735`). `verify_jwt=false` en `config.toml` para 7 de 8; falta `mover-stock-reposicion` [repo 2026-10-18] |
| Credenciales | Token YiQi en tabla `yiqi_config` (se renueva solo, 2 h antes de vencer, `expires_in` ≈ 24 h). Keys de los crons en **Vault** (`20260930120000`). Nunca pedir tokens por chat |
| PowerShell | Siempre con `cd C:\dentalab-compras` al inicio. `Read-Host` falla seguido: leer la anon key de `frontend\.env.local` |

## Arquitectura de datos

El frontend **no llama a YiQi en vivo**. Dos capas:

1. **Sync** — Edge Function `sync-yiqi` disparada por `pg_cron`: jobid 17 `sync-material-cada-15-min` (MATERIAL), jobid 18 `sync-oc-y-clientes-diario` 06:00 UTC (REPORTE_DE_OC + CLIENTE), jobid 19 `sync-ventas-diario` 06:30 UTC (REPORTE_DE_VENTAS). Eran los jobid 3, 4 y 5 hasta que `20260930120000` los recreó para leer la key de Vault [prod 2026-10-23]; más stock por depósito (`stock_yiqi`, cada 15 min), último movimiento por SKU (`ultimo_movimiento_stock_yiqi`) y ventas por vendedor (`ventas_mensual_yiqi_vendedor`, `20260914090000`). Desde `9bee321` (29/9) soporta el formato nuevo de smarties pivoteadas.
2. **Lectura** — las pantallas leen las tablas propias con fetch paralelo.

⚠️ `update cron.job set active=...` da permission denied en el SQL Editor → `select cron.alter_job(17, active := false);` (17 = sync de MATERIAL)
⚠️ El cron "succeeded" no es señal de salud: `net.http_post` encola y no refleja la respuesta. Mirar `net._http_response` y la observabilidad persistente (sesión 20/8).

### Tablas espejo de YiQi (nunca mezclar con lógica propia)
`material_yiqi` (incluye `mate_crm` costo neto y `mate_crm_final`) · `ordenes_yiqi` (**una fila por línea de OC** desde `20260928190000`; columna `cerrada_en_yiqi` desde `20261023180000` = la OC dejó de venir en el reporte 2345, o sea que ya no tiene pendientes en YiQi; `sincronizado_en` = última vez que vino) · `clientes_yiqi` (solo logueados desde `20260930121000`) · `ventas_mensual_yiqi` (36.660 filas, `periodo` date) · `ventas_mensual_yiqi_vendedor` · `stock_yiqi` · `ultimo_movimiento_stock_yiqi`.

### Tablas propias
`usuarios_config` (admin/operador) · `usuario_proveedor` · `yiqi_config` · `ordenes_propias` + `ordenes_propias_items` (papelera reversible `archivada_en/por`; `yiqi_id_creado`/`yiqi_error`) · `reglas_compra` · `empresa_config` · `catalogo_causas` + `declaraciones_causa` (append-only, archivar/restaurar `bca7b94`) · `templates_mensaje` · `proveedores` (condiciones comerciales, `vende_en_cajas_cerradas` `e54999b`) · `composicion_articulos` (44 filas, fraccionados y combos ML) · `articulos_excluidos_alertas` · `alertas_pausadas` · `alertas_suspendidas` · `reposiciones_sugeridas` · `solicitudes_reposicion` + líneas/remitos (circuito Central↔Local, `31dfee6`).

**Baseline**: `20260801000000_baseline_objetos_creados_a_mano.sql` versiona 25 tablas, funciones, vista, policies y triggers que se habían creado a mano (`aaa89e9`, 30/9). Cierra el riesgo "esquema sin migrations" de Tulkas **salvo `declaraciones_causa`**, que no tenía `CREATE TABLE` ejecutable en ninguna migración (solo comentado en `20260822000000:18`) [repo 2026-10-18]. Versionada el 23/10 en `20260801000100_declaraciones_causa_tabla.sql`, idempotente, con la estructura leída de producción. Producción tiene 35 tablas en `public`, y las 35 tienen ahora su `CREATE TABLE` en el repo [prod 2026-10-23].

### Las smarties en YiQi (renombrar CAMBIA el smartieId; editar columnas no)
| Smartie | id | Entidad |
|---|---|---|
| API_Articulos_Stock NO BORRAR | 2344 | MATERIAL (16 campos obligatorios, ver PROMPT_CONTINUIDAD "INCIDENTE 31/7") |
| API_OC_Recientes NO BORRAR | 2345 | REPORTE_DE_OC — trae solo las OC con algo pendiente, **sin corte por fecha** (incluye OC de enero 2024). El sync la baja completa y llama una sola vez a `upsert_ordenes_yiqi` [prod 2026-10-23] |
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

`contadores_sidebar()` (badges; sin SECURITY DEFINER a propósito; excluye excluidos/pausados/Acritone-NewcryL; "OC en curso" sin las `cerrada_en_yiqi` desde `20261023180000`) · `upsert_ordenes_yiqi(p_rows)` (reemplaza cada OC del lote; desde `20261023180000` marca `cerrada_en_yiqi` las que no vinieron, solo si el lote trae ≥ 10 OC; una OC que vuelve se reabre sola; EXECUTE solo `service_role`) · `historial_ventas(p_meses)` y `historial_ventas_json` (esquiva el tope de 1.000 filas de PostgREST) · `sugerencias_compra(p_proveedor)` (lee `reglas_compra`, `composicion_articulos`, excluye `es_administrativo`; desde `20261007120000` devuelve `maximo` = `mate_punto_pedido_max`) · `proveedores_con_alertas()` (por demanda en riesgo) · `es_comprable(nombre, proveedor)` (excluye `###` ML, discontinuados, producción propia Dentalab, Acritone/NewcryL `37b465d`) · `es_administrativo(sku)` (889/890/99999) · `es_para_fraccionar(nombre)` · `reposicion_interna()` (Local↔Central, ABC, 8 prioridades; excluye a Patricia `20260911180000`, Pareto sin administrativos `20260914150000`) · `evaluar_reglas_reposicion_central()` (`20260916140000`) · `calcular_punto_equilibrio` (fix DELETE sin WHERE que congeló ventas desde el 8/9, `9bee321`) · `buscar_articulos_proveedor()`.

⚠️ PostgREST corta respuestas tipo TABLA en 1.000 filas (tope de servidor): devolver jsonb. ⚠️ `AVG()` miente en `ventas_mensual_yiqi`: usar `SUM()/N_meses`.

## Decisiones de negocio confirmadas por Aris (no rediscutir)

Punto de pedido calculado por el sistema (respaldo `mate_stock_seguridad`) · `mate_cantidad_de_unidades` es el campo autoritativo de unidad de compra · depósitos con movimiento: Local, Central, Vendedor Jorge; `MATE_STOCK_DISPONIBLE` = Local + Central · "En tránsito" es una ubicación · ML Full no vuelve · combos ML descuentan automáticamente · `###` = publicación ML; `-F`/`-U` = fraccionados · decimales en stock son legítimos · "Dentalab" como proveedor = producción propia · costo = `MATE_CRM` · el límite de aprobación es sobre Ivana, no sobre Aris · condiciones comerciales = reglas por perfil de proveedor (`CondicionesProveedor.jsx`) · limpieza de alertas: exclusión permanente por SKU (admin) + pausa de 15 días (cualquier usuario) · combo Speedex `21081 = 21083+21084+21085` · "PARA FRACCIONAR" = no enviar al local, sí puede comprarse como materia prima.

## Hechos técnicos de YiQi (no re-descubrir)

Auth `POST /token` (form) → `GET /api/accountapi/GetLoginInformation` → `schemaId=328`. Smarties: `GET /api/public/{ENTIDAD}/smartie?smartieId=&schemaId=328&page=`. `/query` siempre 500; `/search` topeado en 50. Códigos de error inútiles. Vistas guardadas son por usuario. Pivot obliga COLUMNA + DATOS; claves genéricas `C2..C21` desordenadas, mapeo en `columns`. Lead time = `MATE_LEAD_TIME_MAXIMO`. Artículo Base vacío. Campo basura `ckeck`. Escritura: `POST /ORDEN_DE_COMPRA` funciona (OC #9 → `yiqi_id=1689`, 19/8); `POST /MOVIMIENTO_STOCK` funciona (`3faf484`, 6/9); YiQi devuelve `ID` mayúscula; no hay `DELETE` (solo `CANCELACION_DE_COMPR`); `yiqi-borrar-oc` es herramienta manual de limpieza, 1 OC por vez. El `access_token` dura ~24 h: la renovación vive en `_shared/yiqiConfig.ts`.

**Recepción de mercadería en YiQi (relevado en vivo el 23/10/2026, Ventas Online en me.yiqi.com.ar, solo lectura):**
- La OC **nunca cambia de estado**: todas dicen "En preparación", incluso las de 2025.
- **El remito de compra no se vincula a la OC.** "# Remitos relacionados" = 0 y "Total Entregado" = 0 en las 10 OC revisadas; "Nros OC" vacío en los 7 remitos revisados. El botón "Generar Remito" de la OC no se usa.
- **El proceso real de Ivana** (explicado por ella el 16/9 y confirmado en vivo el 23/10):
  1. "Revisión - enviado".
  2. "Listo - dsps borrar contenido" = **pedido hecho**, todavía con líneas.
  3. Cuando la mercadería está dada de alta, **vacía la OC** (0 líneas, $0) y deja "Listo".
- Una OC vaciada o eliminada deja de venir en la smartie 2345. Esa es la señal que usa `cerrada_en_yiqi`.
- `REMITO_COMPRA` (`/view/REMITO_COMPRA`, 6.250 registros):
  - Campos: proveedor, ubicación destino, fecha de recepción, fecha de procesado, # SKUs, # unidades, facturas y estado Pendiente / Procesado.
  - También se usa para "CORRECCION DE STOCK" y "FRACCIONAMIENTO DE STOCK" como si fueran proveedores.
  - Cruzarlo con las OC sería heurístico (proveedor + fecha + SKUs).
- **Detalles de la interfaz web:**
  - La búsqueda rápida del listado filtra también por asunto y distingue acentos ("Revisión" ≠ "revision").
  - Para las OC 2652–2700, el id interno del registro (`#/<id>` en la URL) = Nro OC + 3917.
  - La grilla es Kendo y se puede leer con `jQuery('[data-role=grid]').data('kendoGrid')`.

## Estado contra el MVP contratado (USD 1.500 / ~106 h)

| # | Criterio | Estado |
|---|---|---|
| 1 | Login con roles | ✅ |
| 2 | Sync de stock sin intervención | ✅ (crons con keys en Vault) |
| 3 | Monitor bajo punto de reposición | ✅ |
| 4 | OC generada, aprobada y enviada al proveedor | ✅ WhatsApp semi-automático (PDF + texto) |
| 5 | OC escrita en YiQi | ✅ construido · **apagado por modo prueba desde el 23/10** (no autorizado Live) |
| 6 | Historial de OC consultable | ✅ |
| 7 | Ivana opera sola tras capacitación | ⏸️ pendiente la capacitación |

Entregado de más: predictor de demanda (Módulo D, USD 360), semáforo de aprobación, catálogo de causas, templates, PDF, RLS real, comparación de precios, reposición interna con remitos Excel, circuito Central↔Local con app de depósito, estética v7.

## Pantallas

**Compras/Stock** (`App.jsx`, navegación por estado `currentPage`, sin router): Monitor de stock · Alertas · Nueva OC · Órdenes de compra · Seguimiento de OC · Historial de OC · Predictor de demanda · Comparación de precios · Revisar equivalencias · Reposición Central-Local (supervisión admin) · Proveedores · Condiciones comerciales · Usuarios y accesos · Datos de la empresa · Catálogo de causas · Reglas de compra y aprobación · Templates de mensajes · Conector YiQi · Ayuda. Reposición interna salió del menú de Aris/Ivana (`07986d6`).
**Depósito** (`AppDeposito.jsx`, `pages/deposito/`): Solicitudes para preparar · Confirmar recepción · Pedir al otro depósito · Ayuda. Clase ABC congelada en la línea del remito (`54523b8`).

## Actualizaciones 22 ago → 7 oct 2026 (70 commits) — [repo 2026-10-09]

> No estaban en ningún documento. Resumen por tema con hashes.

- **Causas y OC** — declarar causas en Stock, Compras y Entregas (`b6f9dd8`, ítem 7 cerrado); agregar mercadería a OC ya vinculada a YiQi (`b7a6509`, `editar-oc-yiqi`); archivar/restaurar causa sin romper append-only (`bca7b94`); Nueva OC bloquea cantidad que no es múltiplo del bulto (`dd8ae08`), tilda al cargar cantidad (`eb042c5`), evita duplicadas con bloqueo de doble guardado (`f542115`); editar OC pendiente/borrador (`7d3b683`); validación de costo en `enviar-oc-yiqi` (`cd6ac92`).
- **Alertas / Monitor** — exclusión Acritone/NewcryL (`29ac3a4`, `37b465d`, `2be9434`); reactivar exclusión manual (`7e5bcb2`); Monitor aplica exclusiones y pausas (`109e585`); filtro Stock Seguridad = 0 (`26ad820`); estado de OC por SKU y rotación (`8d82d2d`); cantidad en camino (`fe2c185`); barra Stock/Min/Max y gráfico (`98bb0ab`, `921f3a7`); armar OC desde Alertas; trigger que reactiva alertas de stock (`20260930131000`).
- **YiQi escritura y herramientas** — `yiqi-borrar-oc` (modos GET, diagnóstico, búsqueda genérica por entidad, `b356fff`→`cb2675b`); Movido de Reposición interna se refleja en YiQi vía `POST /MOVIMIENTO_STOCK` (`3faf484`, `mover-stock-yiqi`); `verify_jwt=false` en las 7 funciones porque el formato nuevo de key rompía la validación de plataforma (`e837a58`).
- **Circuito Central↔Local (Eje 1)** — pantallas de depósito, shell `AppDeposito`, permisos por depósito, `mover-stock-reposicion` (`31dfee6`); vista de supervisión admin (`11497de`); remito imprimible, En tránsito (`07986d6`); clase ABC en depósito y remito (`4ff070b`); cierre automático de pedidos completada/anulada (`492f36a`, `20260930140000`); migraciones Eje 1 + scripts de verificación contra prod (`6fbd685`).
- **Sync y seguridad** — ventas por vendedor (`20260911170000`, cron `20260914090000`, suma por clave antes de las tandas `24cb355`); formato nuevo de smarties pivoteadas + fix ventas congeladas desde 8/9 (`9bee321`); crons leen key de Vault con timeout 120 s (`48d6741`); lectura solo logueados (`20260930121000`); permisos de funciones (`20260930130000`); baseline de 25 objetos creados a mano (`aaa89e9`); cambio de clave propio, sin clave por defecto en el bundle (`24cb355`); migraciones del 11–16/9 que estaban aplicadas sin commitear, versionadas (`3e3e0cc`); jspdf 4 + autotable 5, audit fix (`af9210f`).
- **UX / estética v7 (feedback de Ivana, fases A–E, 2/10)** — base visual del prototipo v7, código de color único (`8804f80`); Editar/Ver según permiso, filtro Sin proveedor (`2a51f1b`); detalle de OC con barra de pasos (`2c791b2`); tablas aireadas, pastillas unificadas (`70c4d1b`, `30e4b7e`); órdenes como tarjetas con semáforo, Monitor con KPIs accionables (`446004e`, `021d97b`); iconos Tabler (`3ab7af4`); tablas que entran en 1536 px (`f86b582`); PDF A4 centrado, fix congelamiento al imprimir (`ab34e4f`, `8b6cd5a`); auditorías de usabilidad 6/9 y 7/9 (`f3423f9`, `f4f98a9`); Ayuda actualizada al 7/10 (`58fa466`).

## Reconciliación 2026-10-18 — producción + repo + MD + Tulkas

> Fuentes cruzadas el 18/10/2026:
> - **Repo:** HEAD `8c9a98e` = `origin/main`, último commit de código `f86b582` (7/10), ningún archivo modificado después del 9/10, 54 migraciones `.sql`.
> - **Producción en vivo:** Claude in Chrome, Federico (admin) en `dentalab-compras.vercel.app`, solo lectura.
> - **Tulkas:** `get_risks`.
> - **Este archivo.**

**HECHO**
- **Sync de MATERIAL al día:** "Conectado a YiQi", última sincronización 18/10/2026 21:31:11, con el reloj del navegador a las 21:32. [en vivo 2026-10-18, Federico en /?page=yiqi]
- **Órdenes propias:** 4 activas y 9 en papelera (#3–#11).
  - Activas: #18 DENTAL MEDRANO, #14 PESCIO y #12 PREMIUM DENTAL esperando aprobación; #2 BUDA PABLO aprobada con error de YiQi (artículos 51006 y 51007 sin costo).
  - Evidencia: [en vivo 2026-10-18, Federico en /?page=ocs]
- **Números de Monitor:** 2224 críticas / 394 preventivas, OC en curso 150, artículos 7.319, requieren aprobación 3. Seguimiento: Todas 156 (Enviadas 149, Ingreso parcial 1, Completadas 6). [en vivo 2026-10-18, Federico en /?page=stock y /?page=seguimiento]
- **Reglas:** límite $1.000.000, 2 bultos por producto, 2 meses de cobertura. **Condiciones comerciales:** 31 de 104 proveedores cargados, 19 "pasan siempre por Aris". [en vivo 2026-10-18, Federico en /?page=reglas y /?page=condiciones]
- **Migraciones 3/10 y 7/10:** `20261003100000` (editar órdenes pendientes) [prod 2026-10-03, policies y trigger verificados en el SQL Editor] y `20261007120000` (`sugerencias_compra` con `maximo`) [prod 2026-10-07, MEGADENTAL: 25 de 46 filas con máximo en Nueva OC] están aplicadas.
- **Envío automático a YiQi al aprobar:** sigue activo en el código, `OrdenesPropias.jsx:683` (`supabase.functions.invoke('enviar-oc-yiqi')`). [repo 2026-10-18]

**DESMENTIDO**
- **Credencial de YiQi:**
  - El 9/10 este archivo decía que `yiqi-renovar-token.ps1` tenía un placeholder y que el riesgo estaba cerrado. **Es falso.**
  - La línea `$clave` tiene un valor real (13 caracteres, no es `COMPLETAR_ACA`) en el working tree, en HEAD y en el único commit que tocó el archivo (`03b6288`, 20/8), que está en `origin/main`.
  - La confusión vino del guard de la línea 22 (`if ($clave -eq "COMPLETAR_ACA")`).
  - Tulkas tenía razón (CRITICAL). [repo 2026-10-18, verificado sin imprimir el valor]
- **"Esquema sin migrations → cerrado con baseline":** **parcialmente falso.** `declaraciones_causa` no tiene `CREATE TABLE` ejecutable en ninguna migración; solo aparece comentado en `20260822000000_declaraciones_causa.sql:18`, y el baseline no la incluye. Tulkas tenía razón (HIGH). [repo 2026-10-18]
- **"Edge Functions: todas con `verify_jwt=false`":** falso para 1 de 8. `supabase/config.toml` lista 7; `mover-stock-reposicion` no figura, aunque usa `verificarLlamador()`. [repo 2026-10-18]
- **"Deploy manual alternativo: `vercel --prod`":** falla ("Could not retrieve Project Settings", `.vercel` viejo). El push a `main` despliega solo. [en vivo 2026-10-02]
- **"Duplicados históricos de OC en YiQi sin reconciliar → abierto, decisión de Aris":** falso.
  - Las 859 OC duplicadas que creó `enviar-oc-yiqi` el 18–20/8 ya no existían en YiQi el 28/9: los números 1746–2148, 2150–2563 y 2567–2608 no existen. [en vivo 2026-09-28, Ventas Online en me.yiqi.com.ar/view/ORDEN_DE_COMPRA]
  - El espejo se limpió (`delete from ordenes_yiqi where asunto like 'Dentalab-Compras #%'`, restantes = 0). [prod 2026-09-28]
  - Las 7 OC aprobadas de la app (#5–#11) tampoco existen en YiQi; se archivaron. [en vivo 2026-10-02]
- **"Ivana tiene que elegir qué borrador queda de cada par duplicado":** ya no aplica.
  - #13, #16 y #17 (los dos pares), y también #15 y #19, no figuran ni activas ni en la papelera: se eliminaron definitivamente entre el 3/10 y el 18/10.
  - Quién los eliminó: [sin verificar].
  - Evidencia: [en vivo 2026-10-18, Federico en /?page=ocs, chips "Órdenes (4)" / "Papelera (9)"]
- **Nombre de la pantalla "Reglas y alertas":** en el menú se llama "Reglas de compra y aprobación" (`Sidebar.jsx:64`). [repo 2026-10-18]

**NUEVO**
- **Crons:** 11 jobs, 10 activos. [prod 2026-10-23]
  - `reintentar-oc-pendientes-yiqi` (id 6) corre cada 10 min, activo.
  - `generar-reposicion-interna-diario` (id 10) está inactivo, coherente con "la reposición automática se reactiva solo cuando Federico lo pida".
  - El resto: stock, movimientos y material cada 15 min; reglas de reposición Central cada 15 min; precios 06:15, OC y clientes 06:00, ventas 06:30, ventas por vendedor 06:35, candidatos de equivalencia 06:30 UTC.
- **`composicion_articulos`:** 44 filas. [prod 2026-10-23]
- **"OC en curso" sube sin parar:** 115 (28/9) → 137 (7/10) → 150 (18/10).
  - `sync-yiqi` hace upsert de lo que trae el reporte 2345, pero nunca saca las OC que dejan de venir. El reporte trae solo las OC con pendiente, así que una OC recibida completa queda congelada como "Enviada".
  - Afecta el número del menú, Seguimiento, Historial y el paso "Mercadería recibida" del detalle de cada orden.
  - **Medido:** 125 de las 162 OC del espejo (357 líneas) no se actualizaron en el último sync del reporte. [prod 2026-10-23]
- **Revisión de Ivana:** el documento con 8 preguntas y 19 puntos para revisar (Claude Docs, más el Word en Descargas) está sin respuestas al 18/10.
- **Dependencias:** `npm audit --omit=dev` deja 1 vulnerabilidad alta, en `xlsx` (no hay arreglo en npm). La app solo escribe Excel (`exportarExcel.js`), no lee archivos ajenos, que es donde están las fallas. [repo 2026-10-05]
- **Tablas en pantallas de 1536 px:** `f86b582`. [en vivo 2026-10-07, Federico en Monitor, Alertas, Proveedores y Predictor]

## Actualización 2026-10-23 — feedback de Ivana, modo prueba, limpieza y OC cerradas en YiQi

> Fuentes:
> - **Repo:** commits `9298460`, `c9f76a0`, `16a7a5e`, `ff8eb62`, `48d907c`, `f5e92e8`, `8b25782` y `8076d6c`; HEAD `8076d6c` = `origin/main`.
> - **Producción:** SQL Editor, resultados pegados por Federico.
> - **YiQi en vivo:** Ventas Online en me.yiqi.com.ar, solo lectura.
> - **App en vivo:** Federico (admin) en `dentalab-compras.vercel.app`.
>
> Detalle en el proyecto de Claude: `claude/INVESTIGACION_escrituras_YiQi_23-10-2026.md`, `claude/LIMPIEZA_datos_prueba_23-10-2026.md` y `claude/FEEDBACK_IVANA_23-10-2026.md`.

**HECHO**
- **Feedback de Ivana del 23/10, implementado** (`c9f76a0`):
  - Nueva OC oculta solo los mínimos = 0.
  - Las tarjetas y los chips de Alertas cuentan respetando el filtro de proveedor.
  - "Generada por" / "Aprobada por".
  - "Llega el dd/mm" / "Demorada desde el dd/mm", con `proveedores.dias_entrega`.
  - Barra de pasos en Reposición Central-Local.
  - Ayuda actualizada.
- **Modo prueba:** la app no escribe nada en YiQi.
  - Cron 6 pausado (`20261023150000`). Interruptor `reglas_compra.escritura_yiqi_habilitada = false` (`20261023160000`).
  - Las 5 funciones que escriben están deployadas con la guarda fail-closed.
  - Prueba real: la respuesta id 32807 devolvió `modo_prueba: true` [prod 2026-10-23].
- **Limpieza etapa 1** (`20261023170000`, `f5e92e8`):
  - Cron 15 `evaluar-reglas-reposicion-central` pausado.
  - 8 pedidos automáticos del 30/9 anulados (9 anulados en total, 0 en preparación).
  - #2 y #12 a la papelera.
  - Evidencia: [prod 2026-10-23]
- **Órdenes propias:**
  - Activas: #14 PESCIO (esperando aprobación), #22 DIS DEN (borrador, Aris) y #23 DROVER (borrador, Ivana).
  - Papelera: #2–#12, #18 y #21.
  - Evidencia: [prod 2026-10-23]
- **La #21 (DENTAL MEDRANO, $10,5 M) no existe en YiQi:**
  - La búsqueda "Compras" da 0 resultados. El asunto que manda la app es siempre `Dentalab-Compras #<id>` (`enviar-oc-yiqi/index.ts:279`).
  - Control: "Revisión" devuelve 2 OC.
  - "MEDRANO" devuelve solo las OC #82, #83 y #86 (2022–2023).
  - Evidencia: [en vivo 2026-10-23, Ventas Online en /view/ORDEN_DE_COMPRA]
- **Punto 3 "Recibida confiable", cerrado** (`20261023180000`, `8b25782`):
  - Antes de reemplazar `upsert_ordenes_yiqi` se verificó que la versión de prod era idéntica a la de `20260928190000`. La única otra función que lee `ordenes_yiqi` es `contadores_sidebar`, y ninguna vista la lee.
  - Verificación: 37 OC vigentes, 125 cerradas, 7.955 u en camino vigentes, permisos `{postgres, service_role}` conservados [prod 2026-10-23].
  - Probado en Postgres local: marca, reabre, guarda (< 10 OC) e idempotencia.
- **Validado en vivo** [en vivo 2026-10-23, Federico (admin)]:
  - **/?page=seguimiento:** Todas 162, Enviadas 30, Ingreso parcial 1, Completadas 6, Cerradas en YiQi 125 y **Demoradas 11 (antes 88)**. La OC #2681 aparece "Cerrada en YiQi después del 19/10/2026".
  - **/?page=ocs:** 31 OC activas · 7.952 u.
  - **/?page=historial:** el filtro "Cerrada en YiQi" muestra 125.
  - **/?page=alertas:** 2242 críticas / 455 preventivas. No se tomó el número de antes [sin verificar la diferencia].
- **Fechas de OC en hora local, carpetas por mes ordenadas** (`8076d6c`):
  - La #2681 (fecha 2026-10-06) mostraba "5/10/2026"; ahora "6/10/2026".
  - Las carpetas van de Octubre 2026 a Enero 2024.
  - Evidencia: [en vivo 2026-10-23, Federico en /?page=seguimiento]

- **Limpieza etapa 1, verificada en la app** [en vivo 2026-10-23, Federico (admin) en /?page=reposicion-central-local y /?page=ocs]:
  - Reposición Central-Local: "Activas" vacío; "Todas" muestra 11 (9 anuladas: REP-0002 y REP-0008..0015; 2 completas: REP-0007 y REP-M0907213806).
  - Órdenes de compra: Órdenes (3), Papelera (13) = #2–#12, #18, #21.
- **Punto 4, máximos: de dónde sale el número** [en vivo 2026-10-23, Ventas Online en /view/MATERIAL, artículo 1999-0.25 (MEGADENTAL), id 11565]:
  - YiQi tiene 4 campos de "punto de pedido", **todos de solo lectura** (los calcula YiQi):
    - "Punto de pedido" = 10;
    - "Punto de pedido máximo" = 20;
    - "Punto máximo de pedido" = 10;
    - "# a Reponer Máx" = 10.
  - Editables: Stock Seguridad 10, Tiempo de reposición 8 días, Lead Time Máximo 15 días.
  - La app muestra "Mín. 10 · Máx. 20": el máximo es "Punto de pedido máximo" (`MATE_PUNTO_PEDIDO_MAX`, smartie 2344).
  - **La app no calcula ningún máximo.** "Lo genera el sistema" se refiere a YiQi.
  - Contradicción sin cerrar: cuál de los dos "máximos" de YiQi espera ver Ivana [preguntarle].
  - Una segunda muestra (artículos de MEGADENTAL) no se pudo leer: la pestaña de YiQi dejó de responder.

**DESMENTIDO**
- **"#14, #21, #22 y #23 son uso real porque las cargaron las cuentas reales de Aris e Ivana"** (`INVESTIGACION` y `LIMPIEZA` del 23/10, y ESPERA desde el 26/9): falso como criterio.
  - La app no está aprobada para uso real (Federico, 23/10). Todo lo que está en ella (órdenes, causas, pedidos de reposición) es dato de prueba.
  - Que lo haya cargado una cuenta real solo dice quién estaba probando.
  - Lo único con efecto real son las escrituras a YiQi de septiembre: los 4 movimientos de stock y las OC #3–#11, que ya no existen en YiQi.
- **"La smartie 2345 tiene una ventana de fechas acotada"** (comentario LIMITACIÓN de `20260928190000`): falso. Las OC vigentes van del 27/01/2024 al 22/10/2026; lo que la filtra es que la OC tenga algo pendiente [prod 2026-10-23].
- **"Recibida = remito procesado" (opción A del feedback):** no sirve. YiQi no vincula remitos a OC [en vivo 2026-10-23].
- **"'Listo' en el asunto = recibida"** (hipótesis del 23/10): falso. "Listo - dsps borrar contenido" es el pedido hecho; la recepción se ve cuando la OC queda vacía. Ivana ya lo había explicado el 16/9 (`PROMPT_CONTINUIDAD_RESUMEN`, ítem 12).
- **"La cantidad en camino reemplazó la marca manual de Ivana" (16–17/9):** solo en parte. Sumaba los pendientes de OC ya recibidas y congeladas en el espejo: 357 líneas, 311 SKU, 9.713 u, hasta el 23/10 [prod 2026-10-23].
- **Riesgo "Filas congeladas": "opción robusta: leer el estado por `ORDC_ASUNTO`"**: no sirve (ver arriba). Se cerró por la ausencia en el reporte.
- **PENDIENTE del 18/10 "Falta el commit" (credencial y `declaraciones_causa`):** ya estaba commiteado en `9298460` [repo 2026-10-23].

**NUEVO**
- **OC borradas en YiQi:**
  - 2651, 2665, 2672, 2674 y 2682 no figuran en el listado de YiQi.
  - 2651 (BUDA MARCOS), 2672 (RONALD) y 2674 (BIODENTAL) estaban en el espejo; ahora quedan "Cerradas en YiQi" igual que las vaciadas.
  - Evidencia: [en vivo 2026-10-23]
- **La 2700 (DROVER, 20/10) está vacía y sin asunto.** Motivo [sin verificar]: preguntar a Ivana.
- **Crons:** 11 jobs. Inactivos: 6 (pausado el 23/10), 15 (pausado el 23/10) y 10 (ya inactivo). Activos: 8, derivado [prod 2026-10-23].
- **La clave común que se les puso a las cuentas reales el 21/8 estaba escrita en texto plano** en `PROMPT_CONTINUIDAD_Dentalab-Compras.md` (7 apariciones, trackeado en git) y en `PROMPT_CONTINUIDAD_RESUMEN.md` (proyecto).
  - Se tapó en los dos el 23/10. Sigue en el historial de git.
  - Si Aris e Ivana ya la cambiaron con "Cambiar mi contraseña" (`24cb355`): [sin verificar].

## Riesgos — estado real [actualizado 2026-10-23]

- **[ABIERTO — CRITICAL] Credencial real de YiQi (`ventas@dentalab.com.ar`) en `yiqi-renovar-token.ps1`.**
  - Trackeado desde `03b6288` (20/8) y presente en HEAD y en `origin/main`. [repo 2026-10-18]
  - 23/10: sacada del working tree. El script ahora la lee de `$env:YIQI_CLAVE`, con el guard `COMPLETAR_ACA` si falta. Sigue en el historial (`03b6288`) hasta que se purgue. [repo 2026-10-23]
  - Visibilidad del repo en GitHub: [sin verificar].
  - Remediación:
    1. Reemplazar el valor por `COMPLETAR_ACA` y commitear.
    2. Purgar el historial (`git filter-repo`).
    3. Rotar la clave. Decisión vigente de Federico: la clave de YiQi no se cambia por ahora.
  - *Texto del 9/10, DESMENTIDO el 18/10:* "`yiqi-renovar-token.ps1` sí está trackeado pero `$clave = "COMPLETAR_ACA"` es un placeholder con guard — no hay credencial real en el repo."
- **[CERRADO]** `dentalabs_Sup_KW.txt` y `verificarschemastockyiqi.ps1`: no están trackeados y nunca entraron al historial. Siguen en la carpeta. [repo 2026-10-18, `git ls-files`]
- **[CERRADO 7/8, reforzado 6/9]** Edge Functions sin autorización (`verificarLlamador`). Observación nueva: `mover-stock-reposicion` no está en `config.toml`, así que en un próximo deploy queda con `verify_jwt=true`. [repo 2026-10-18]
- **[CERRADO en el repo 2026-10-23] Esquema sin migrations.** El baseline `20260801000000` (30/9) cubre 25 tablas. `declaraciones_causa`, la única de las 35 tablas de producción sin `CREATE TABLE`, se versionó en `20260801000100`. Es idempotente y está probada en Postgres local: con dos corridas queda igual a producción (12 columnas, 4 policies, 3 índices, 6 restricciones). [prod 2026-10-23, repo 2026-10-23]
  - *Estado anterior, 18/10:* ABIERTO — "`declaraciones_causa` no tiene `CREATE TABLE` ejecutable".
- **[CERRADO 6/8]** Código sin git (remoto `dentalas_erp`).
- **[CERRADO 28/9]** Duplicados históricos de OC en YiQi. No existen en YiQi y el espejo está limpio (ver DESMENTIDO). Tulkas lo sigue listando como LOW: desactualizado.
- **[CERRADO 2026-10-23] Filas congeladas en `ordenes_yiqi`.**
  - `upsert_ordenes_yiqi` marca `cerrada_en_yiqi` las OC que no vienen en el reporte (`20261023180000`, `8b25782`).
  - Demoradas: 88 → 11. El badge de Órdenes de compra en el menú pasó a 31 (el 18/10, "OC en curso" daba 150; el número de Monitor después del cambio no se miró [sin verificar]). "En camino" ya no suma 9.713 u congeladas.
  - Evidencia: [prod 2026-10-23] y [en vivo 2026-10-23, Federico en /?page=seguimiento]
  - *Texto anterior:* [ABIERTO] El sync no da de baja las OC que salen del reporte 2345. Opción robusta: leer el estado por `ORDC_ASUNTO` desde `ORDEN_DE_COMPRA` (~2–3 h).
- **[ABIERTO — MEDIUM] Clave común de las cuentas reales en el historial de git** (`PROMPT_CONTINUIDAD_Dentalab-Compras.md`, desde el 21/8). Tapada en el working tree el 23/10.
  - Remediación: que Aris e Ivana la cambien desde "Cambiar mi contraseña" (si no lo hicieron ya [sin verificar]).
  - Purgar el historial junto con la credencial de YiQi.
  - Evidencia: [repo 2026-10-23]
- **[ABIERTO — BAJO] Lote parcial de la smartie 2345.**
  - `traerSmartieCompleta` solo advierte (no corta) si una página vuelve vacía antes de tiempo.
  - Un lote parcial de 10 OC o más cerraría OC de más hasta la sincronización siguiente, que las reabre sola.
  - Evidencia: [repo 2026-10-23, `sync-yiqi/index.ts:144-151`]
- **[RESUELTO 2026-10-23 — MODO PRUEBA]** Decisión de Federico (23/10): "No autorizamos a pasar a Live la herramienta de momento".
  - Cron `reintentar-oc-pendientes-yiqi` pausado y barrido sin archivadas (`20261023150000`) [prod 2026-10-23, `cron_activo = false`].
  - Interruptor general `reglas_compra.escritura_yiqi_habilitada = false` (`20261023160000`) [prod 2026-10-23]. Las 5 funciones que escriben en YiQi (`enviar-oc-yiqi`, `editar-oc-yiqi`, `mover-stock-reposicion`, `mover-stock-yiqi`, `yiqi-borrar-oc` en modo escritura) responden `modo_prueba` sin tocar la base ni YiQi; fail-closed. Deployadas el 23/10.
  - Aviso "Modo prueba" en la app: commit `ff8eb62` [en vivo 2026-10-23, Federico en /?page=ocs].
  - Para habilitar: `update public.reglas_compra set escritura_yiqi_habilitada = true where id = 1;`
  - Investigación: `claude/INVESTIGACION_escrituras_YiQi_23-10-2026.md` (proyecto). La #21 (Aris, 20/10, $10,5 M) se intentó crear y YiQi respondió 400 ("El pre…"); el cron la reintentó cada 10 min hasta el 23/10 16:20 UTC.
  - *Texto anterior:* [CONTRADICCIÓN SIN RESOLVER] Federico (28/9) dice que el envío a YiQi era "construido pero sin activar". El código lo dispara al aprobar (`OrdenesPropias.jsx:683`, `NuevaOC.jsx`) y el cron `reintentar-oc-pendientes-yiqi` (id 6) está activo cada 10 min [prod 2026-10-23]: la #2 se reintenta con error de costo.
- **[ACEPTADO]** Colisión de renovación de token entre los 3 crons a las 06:00 UTC, sin locking.
- **[CERRADO 2026-11-09]** Carpetas `_to_delete`, `_to_delete_git_locks` y `_to_delete_old` en la raíz. [repo 2026-10-18] → borradas por Federico desde PowerShell [repo 2026-11-09].
- **[CERRADO 2026-11-09]** `package-lock.json` vacío en la raíz, trackeado y sin relación con `frontend/`. [repo 2026-10-18] → quitado con `git rm`, commit `1c1aedc` [repo 2026-11-09].
- **[POR DISEÑO]** `alertas_pausadas_write_authenticated` (FOR ALL, `using (true)`) en el baseline, línea 1230: coincide con la regla "pausa de 15 días por cualquier usuario".
- **[ABIERTO — BAJO]** `xlsx` sin arreglo en npm. La app solo escribe Excel.

## PENDIENTE INMEDIATO

0. **Respuestas de Ivana del 26/10** (`claude/FEEDBACK_IVANA_23-10-2026.md`, proyecto):
   - **Hecho:** días hábiles en "Llega el" y zonas de color en la barra (`5a5b1a6`).
   - **Hecho: máximo calculado por la app** (opción A, decisión de Federico del 26/10). Migración `20261026120000` y commit `e5c1928`.
     - Fórmula: promedio de 3 meses cerrados, fraccionados/combos sumados con `composicion_articulos`, redondeo al bulto, ⚠ en los picos. Solo lectura.
     - Verificación: 2.868 SKU con máximo y 832 con pico [prod 2026-10-26]. El 1999-0.25 no tuvo ventas jul–sep, así que no tiene máximo calculado.
     - Validado en Alertas y en Nueva OC (MEGADENTAL), con el tooltip mes a mes [en vivo 2026-10-26, Federico (admin) en /?page=alertas y /?page=nueva-oc].
   - **Respuestas de Ivana (26/10, segunda tanda):**
     - El máximo cubre **1 mes** (2 como mucho); lo confirma Aris para los productos que se compran en cantidad (Compresas K-tex, Totalcaína), que pasan 2 meses sin reponerse.
     - Picos: los define Aris (le pueden servir para saber en qué época conviene pedir).
     - La planilla de fraccionados todavía no le llegó: Federico tiene que mandársela.
     - La OC 2700 de YiQi la borró ella (iba a pedir, pero Aris ya había armado el pedido).
     - Los 4 movimientos de stock: el encargado de stock no está por ahora.
     - Feriados: está bien no descontarlos.
     - Evidencia: [stated por Ivana, 26/10, vía Federico]
   - **Para revisar:** el criterio de pico (más del doble de la mediana con ≥ 3 u) marca el 29 % de los SKU. Probablemente sea demasiado sensible con volúmenes bajos.
1. Avisarles a Ivana y a Aris del cambio del 23/10:
   - las OC vaciadas o borradas en YiQi aparecen "Cerradas en YiQi" y ya no son Demoradas;
   - "en camino" ya no descuenta lo de esas OC, así que en Alertas puede haber críticos nuevos.
   - Revisar 2 o 3 casos con Ivana.
2. ~~Punto 4 (máximos): comparar con YiQi~~ — hecho el 23/10. El máximo es el "Punto de pedido máximo" que calcula YiQi. Queda la pregunta a Ivana (ver ESPERA).
3. Órdenes propias en Seguimiento de OC (pedido de Ivana, pregunta 5): construido el 23/10.
   - Bloque "Órdenes de la app · todavía no están en YiQi" + chip "De la app".
   - Push `f44de29`.
   - Validado [en vivo 2026-10-23, Federico (admin) en /?page=seguimiento]: aparecen #23 DROVER (Borrador, generada por Ivana), #22 DIS DEN (Borrador, Aris) y #14 PESCIO (Esperando aprobación, Ivana). Chips: "Todas (165)" y "De la app (3)". El chip "De la app" muestra solo esas 3.
4. ~~Verificación visual de la limpieza etapa 1~~ — hecho el 23/10 (ver HECHO).
5. Credenciales en el historial de git: la clave de YiQi (`03b6288`) y la clave común de las cuentas reales (`PROMPT_CONTINUIDAD`, desde el 21/8).
   - Decidir si se purgan con `git filter-repo`.
   - Pedirles a Aris e Ivana que cambien su clave.
   - La rotación de la clave de YiQi no está autorizada por ahora.
6. ~~Mover `dentalabs_Sup_KW.txt` fuera del repo; borrar `_to_delete*` y el `package-lock.json` de la raíz.~~ Hecho el 9/11 (ver Cierre 2026-11-09).
7. Capacitación de Ivana (criterio 7 del MVP).
8. Automatizar la regla "3 años sin movimiento" sobre `ultimo_movimiento_stock_yiqi`.

Fuera de la lista, sin cambios desde el 9/10: envío de OC por email (Resend). No fue pedido; no construir sin pedido. Pasar a Live (`escritura_yiqi_habilitada = true` + cron 6) **solo con autorización explícita de Federico**.

## ESPERA A OTRA PERSONA

| Qué | De quién | Desde |
|---|---|---|
| ~~¿La #21 fue prueba o compra real?~~ Mal planteado (Federico, 23/10): la app no está aprobada para uso real, así que todo lo que está en ella es dato de prueba, lo haya cargado quien lo haya cargado. La #21 nunca llegó a YiQi. La limpieza etapa 2 no depende de Aris | — | cerrado 23/10/2026 |
| Máximos: ¿qué artículos llevan 2 meses de máximo en vez de 1 (K-tex, Totalcaína…)? ¿Qué hacer con los picos (dejarlos en el promedio, sacarlos o usarlos para ver la temporada)? | Aris | 26/10/2026 |
| Planilla de fraccionados completada (160 "-F"; la tiene que recibir de Federico) | Ivana (con Aris) | 26/10/2026 |
| ~~¿Qué "máximo" de YiQi espera ver?~~ Respondido el 26/10: ninguno de los que calcula YiQi. Lo cargan a mano en "Uso mensual" y quieren que la app lo calcule (ver PENDIENTE) | Ivana | cerrado 26/10/2026 |
| ¿Vacía la OC en YiQi también cuando se cancela un pedido? ¿Qué pasó con la 2700 (DROVER, vacía, sin asunto)? | Ivana | 23/10/2026 |
| Qué ve mal en "Detalle de una sola orden" (checklist, "A corregir") | Ivana | 23/10/2026 |
| ¿Revisa en YiQi los 4 movimientos de stock de septiembre que escribieron las pruebas de la app? **Ojo:** los números que le pasamos eran ids de la API. Los "Nro Movimiento" visibles en YiQi son 1430138, 1430139, 1431820 y 1433061 [en vivo 2026-10-26]. Lo consulta con el encargado de stock. Es lo único de las pruebas que tocó datos reales. (Las 8 causas del 22/8 al 3/9 son datos de la app: prueba por definición, no se pregunta) | Ivana | 23/10/2026 |
| Cargar "Días de entrega" en Condiciones comerciales (alimenta "Llega el") | Ivana / Aris | 23/10/2026 |
| ~~Aprobar o rechazar la #14 (PESCIO)~~ Mal planteado: es una orden de prueba de la app, no un pedido pendiente de Aris | — | cerrado 23/10/2026 |
| Prueba con su usuario: editar una orden suya esperando aprobación → vuelve a borrador. En el checklist marcó "Bien" el punto 14 [sin verificar que la haya probado con una orden suya] | Ivana | 3/10/2026 |
| Condiciones comerciales reales (hoy 31 de 104 cargadas) | Aris | 6/8/2026 |
| WhatsApp de pedidos de los proveedores reales | Aris / Ivana | 20/8/2026 |
| Que nadie edite las smarties "NO BORRAR" (o un usuario YiQi propio del sistema) | Aris | 31/7/2026 |
| ~~Respuestas al documento "Revisión para Ivana"~~ — respondido el 23/10 (`claude/FEEDBACK_IVANA_23-10-2026.md`) | Ivana | 7/10 → cerrado 23/10/2026 |
| ~~Aprobar o rechazar #18 y #12~~ — #18 rechazada y archivada por Aris (20/10); #12 a la papelera a pedido de Ivana (23/10) | Aris | cerrado 23/10/2026 |
| ~~Costo de 51006/51007 o rechazar la #2~~ — #2 a la papelera (limpieza etapa 1) | Aris / Ivana | cerrado 23/10/2026 |
| ~~Decisión sobre OC duplicadas en YiQi (orden #2)~~ — cerrado: no existen en YiQi (28/9) | Aris | 20/8/2026 → cerrado 18/10/2026 |

## Cierre 2026-11-09
- HECHO: composicion-articulos — migración `supabase/migrations/20261109120000_composicion_fraccionados_ivana.sql` con 144 factores de fraccionados ("-F" → caja cerrada) sacados de la planilla que devolvió Ivana el 9/11 (130 "sí" sobre la sugerencia del sistema + 14 completados por ella: blisters, láminas, gramos, hilos, sobres). Solo inserta si la caja existe en `material_yiqi` y el par no estaba (idempotente; probada en Postgres local). Aplicación en prod: pendiente.
- HECHO: composicion-articulos — migración aplicada en prod: `cargadas_9_11 = 144`, `composicion_articulos` pasa de 44 a 188 filas [prod 2026-11-09].
- VALIDADO EN VIVO: maximos-calculados — [en vivo 2026-11-09, federico@tulkasmedia.com (Chrome Tulkas) en /?page=monitor, "Ver todos"]:
  - 750: stock 100, Mín. 78,4, **Máx. 31** (ago 27,15 · sep 34,25 · oct 30,65);
  - 32791: stock 27, Mín. 253,6, **Máx. 129** (Prom./mes 129,2, que también ya suma los fraccionados);
  - 6505: **Máx. 72** (redondeado al bulto de 24);
  - 66679: **Máx. 3**.
- NUEVO: maximos-calculados — en cajas de mucha rotación el Mín. de YiQi queda bastante más alto que el Máx. calculado a 1 mes (750: 78,4 vs 31; 32791: 253,6 vs 129). Refuerza la pregunta a Aris sobre 1 o 2 meses de máximo.
- PENDIENTE: composicion-articulos — preguntar a Ivana por 9150-F ("surtidas", códigos "9150-N°") y 31822-F (menciona 33066-500 → 33066-100 → -F x100, posible error de código) · Ivana · —
- PENDIENTE: composicion-articulos — confirmar con Ivana 6067-F → 6067-50 (50 pares) y 61322-F = 24 láminas (dijo "entre 23 y 25") · Ivana · —
- HECHO: maximos-calculados — el máximo pasa a sumar lo vendido en fraccionado para esas 144 cajas en cuanto se aplique la migración. **Radio de explosión:** `sugerencias_compra()` y el Predictor usan la misma tabla desde el 10/8, así que la cantidad sugerida de esas cajas en Nueva OC también sube y el "-F" deja de tener promedio propio.
- DESMENTIDO: (sin clave: escrituras de stock de prueba en YiQi) — Ivana buscó los 4 movimientos por número y no los encontró. Lo que le pasamos el 23/10 eran ids de la API. Los "Nro Movimiento" visibles en YiQi son 1430138, 1430139, 1431820 y 1433061 [en vivo 2026-10-26, Ventas Online en /view/MOVIMIENTO_STOCK]. Se crearon por la API (`POST /MOVIMIENTO_STOCK` desde `mover-stock-yiqi` / `mover-stock-reposicion`, usuario `ventas@dentalab.com.ar`), no desde una pantalla de YiQi.
- NO SE CARGAN (Ivana: el "-F" no es fraccionado): 6530-F, 66696-F (Flameador), 21931/21934/21937-F (se venden sueltos, sin caja), 5942-F (color), 5946-F1/F2/F3 y 33296-F1/F3, 33281-F1 (modelos F1–F3), 623-F (Fino), 6610-F (Frutilla).
- HECHO: ordenes-compra — clic en la tarjeta de una orden abre el detalle en pestaña nueva, igual que "Editar ↗" / "Ver ↗" (pregunta 1 de Ivana del 26/10). Helper `abrirEnPestana` en `frontend/src/components/OrdenesPropias.jsx:216`; tarjeta clickeable con teclado (Enter) en `:1085`. Texto de Ayuda actualizado (`frontend/src/pages/Ayuda.jsx:364`). Sintaxis verificada con esbuild; build y push pendientes [repo 2026-11-09].
- HECHO: (sin clave: limpieza de datos de prueba, etapa 2) — migración `supabase/migrations/20261109130000_limpieza_datos_prueba_etapa2.sql`: respalda en el schema `respaldo` (no expuesto por la API) y borra las órdenes en papelera #2–#12, #18 y #21 con sus ítems y causas (ON DELETE CASCADE). Aborta si aparece una FK no prevista hacia `ordenes_propias`. No toca #14, #22, #23 ni YiQi. Aplicación en prod: pendiente [repo 2026-11-09].
- HECHO: (sin clave: configuración TulkasOS) — campo `repo_github` del proyecto `dentalab` corregido de `federicoaf79/dentalab-compras` a `federicoaf79/dentalas_erp` con `configurar_proyecto` [TulkasOS 2026-11-09].
- DESMENTIDO: ordenes-compra — el pendiente "Aprobar o rechazar OC #18, #14 y #12" no aplica: la #18 la rechazó y archivó Aris (20/10), la #12 fue a la papelera (etapa 1, `f5e92e8`, 23/10) y la #14 es dato de prueba (criterio de Federico del 23/10: la app no está aprobada para uso real). Ver tabla ESPERA, filas cerradas el 23/10.
- DESMENTIDO: ayuda — el pendiente "Respuestas al documento 'Revisión para Ivana'" está cerrado: Ivana respondió el 23/10 y el 26/10 (`claude/FEEDBACK_IVANA_23-10-2026.md` en el proyecto).
- DESMENTIDO: escritura-yiqi — la "contradicción del envío automático a YiQi al aprobar" está resuelta: con el modo prueba (`20261023160000`, `reglas_compra.escritura_yiqi_habilitada = false`, fail-closed) aprobar no escribe en YiQi, y el cron 6 está pausado (`20261023150000`). Queda solo "pasar a Live con autorización explícita de Federico".
- HECHO: (sin clave: limpieza etapa 2) — migración `20261109130000` aplicada en prod: `respaldadas = 13`, `items_respaldados = 80`, `causas_respaldadas = 1`, `ordenes_que_quedan = 14,22,23` [prod 2026-11-09]. Commit `7b78c5a`.
- HECHO: (sin clave: housekeeping del repo) — `dentalabs_Sup_KW.txt` movido a `Documentos\credenciales-dentalab` (fuera del repo); `_to_delete`, `_to_delete_git_locks` y `_to_delete_old` borradas; `package-lock.json` de la raíz quitado con `git rm` (quedó dentro del commit `1c1aedc`) [repo 2026-11-09]. Cierra los riesgos MEDIUM de carpetas `_to_delete*` y `package-lock.json` vacío.
- VALIDADO EN VIVO: ordenes-compra — [en vivo 2026-11-09, federico@tulkasmedia.com (Chrome Tulkas) en /?page=ocs] deploy `e05e217`: las 3 tarjetas (#14, #23, #22) son clickeables (cursor de mano, título "Clic para abrir la orden…") y el clic llama a la apertura en pestaña nueva; Papelera (0) y Órdenes (3) confirman la limpieza etapa 2.

## Cierre 2026-11-10
- HECHO: (sin clave: radiografía de UX) — relevamiento pantalla por pantalla con tres roles, sin cambiar nada: `claude/RADIOGRAFIA_UX_9-11-2026.md` (proyecto). Admin [en vivo 2026-11-09, federico@ en las 19 pantallas]; operadora [en vivo 2026-11-10, federico@ pasado temporalmente a `operador` con los 62 proveedores de Ivana]; depósito [en vivo 2026-11-10, central@dentalab-compras.demo en las 4 pantallas]. Hallazgos sin priorizar, con evidencia y horas estimadas.
- HECHO: (sin clave: cuenta de prueba) — `federico@` pasó a `operador` para la pasada y volvió a `admin` con 0 proveedores; verificado por SQL [prod 2026-11-10]. Cambio temporal y revertido: no requiere migración.
- NUEVO: ordenes-compra — la operadora no ve órdenes ajenas (RLS "ver ordenes propias", baseline `:1164`), así que Nueva OC no le avisa "ya hay una orden abierta" si la abrió otra persona. Probado: como operadora, DIS DEN no avisó, y Aris tiene la #22 en borrador [en vivo 2026-11-10, /?page=nueva-oc]. Riesgo de órdenes duplicadas.
- NUEVO: nueva-oc — la cantidad sugerida (promedio de 12 meses × 2 meses de cobertura, `sugerencias_compra`) no tiene en cuenta el máximo calculado (promedio de 3 meses × 1 mes). Sugiere comprar artículos ya por encima del máximo (PESCIO 69611: stock 33, máx. 25, sugiere 25) [en vivo 2026-11-09].
- NUEVO: alertas — con stock negativo, la barra Mín./Máx. se dibuja llena (`BarraMinStockMax.jsx:31`, ancho negativo) [en vivo 2026-11-09, 66679-IU con −10].
- NUEVO: alertas — cuatro conteos distintos para las alertas: menú 2253/593, página 2207/545, Nueva OC 2402, Proveedores por proveedor [en vivo 2026-11-09].
- PENDIENTE: maximos-calculados — decidir qué manda para comprar: punto de pedido de YiQi, máximo de 1 mes o regla de 2 meses (D1), y la ventana de "Prom./mes" (D2) · Federico / Aris · —
- PENDIENTE: seguimiento-oc — preguntar a Ivana qué significa el asunto "Revisión - enviado" (¿ya se pidió?), porque define si esas OC pueden figurar Demoradas (D3) · Ivana · —
- PENDIENTE: alertas — preguntar a Ivana si cargan a mano algo que alimente el punto de pedido de YiQi; la ayuda dice "cuando Dentalab lo cargó manualmente" (D4) · Ivana · —
- PENDIENTE: (sin clave: arreglos de la radiografía UX) — elegir cuáles de la radiografía se hacen · Federico · según lo que se elija (en el documento, de 0,25 h a 5 h por ítem)
- HECHO: (sin clave: arreglos de la radiografía UX, ítems 1–20) — 4 agentes en paralelo con archivos separados + ítem 4 al final. `vite build` OK sobre una copia Linux del frontend [repo 2026-11-10]:
  - alertas / monitor-stock: barra con stock negativo vacía y en rojo, sin superponer zonas si máx < mín (`BarraMinStockMax.jsx`); encabezados fijos con scroll propio de la tabla; explicación por columna (`AYUDA_COLUMNA`); notas sin saltos crudos.
  - (menú): `title` en los badges (`Sidebar.jsx`); "Usuarios y accesos" oculto si no es admin (falla cerrado).
  - ordenes-compra / nueva-oc: el bloque de órdenes de la app no desaparece vacío; aviso "Vista filtrada" en Nueva OC; "Sin historial" unificado; aviso de orden abierta de otra persona vía RPC `ordenes_abiertas_proveedor` (con fallback si la migración no está aplicada; link solo a órdenes propias o como admin).
  - seguimiento-oc / historial-oc: carpeta "Cerradas en YiQi (recibidas o canceladas)"; "Ingreso con exceso" en el aviso y en el detalle; KPI "Total de OC del mes".
  - (configuración): `AvisoSoloLectura` en Empresa, Reglas, Causas, Templates, Condiciones y Conector para no admin; botón Actualizar con ícono Tabler; "Completar"/"Editar" según `estaCompleto`; columna "Días de entrega" en Condiciones.
  - usuarios-accesos: columna Rol y texto por rol en "Proveedores asignados" (`UsuariosAccesos.jsx`); `admin-usuarios` devuelve `rol` desde `usuarios_config` (`supabase/functions/admin-usuarios/index.ts`, `listarUsuarios`).
  - app-deposito / ayuda-deposito: el aviso de "no hay" dice lo que hace (suspende la alerta; no crea OC — DESMENTIDO del texto anterior y de `AyudaDeposito.jsx`); aviso de Confirmar recepción según modo prueba; menú con íconos Tabler y botones navegables con teclado.
  - ayuda: tarjeta "Glosario"; Ayuda de depósito con modo prueba y reposición automática pausada.
  - reposicion-central-local: aviso "reposición automática pausada" vía RPC `estado_automatismos` (hook `useEstadoAutomatismos`, falla silenciosa).
  - revisar-equivalencias: candidatos sin discontinuados ni producción propia (`es_comprable` en `recalcular_candidatos_equivalencia_precios`) + limpieza de la caché.
  - predictor-demanda: excluye 889/890/99999 y Acritone/NewcryL en el front (`esExcluidoDelPredictor`).
  - (formato): `lib/formato.js` único es-AR (`formatoNumero`, `formatoMoneda`); 10 helpers locales duplicados reemplazados; Excel, PDF e inputs editables sin tocar.
- HECHO: (sin clave) — migraciones `20261110120000_ordenes_abiertas_por_proveedor`, `20261110121000_estado_automatismos` y `20261110122000_candidatos_equivalencia_sin_ruido` aplicadas en prod: `abiertas_dis_den = 1` (la #22), `automatismos = {reposicion_central_activa: false, reposicion_interna_activa: false}`, `ruido_en_cache = 0` [prod 2026-11-10].
- PENDIENTE: usuarios-accesos — deployar la edge function `admin-usuarios` (columna Rol) · Federico · 0,1 h
- PENDIENTE: (sin clave) — validar en vivo después del deploy: como admin (Monitor, Alertas, Usuarios, Condiciones, Equivalencias, Predictor) y como operadora (Nueva OC DIS DEN debe avisar la #22 de Aris; menú sin Usuarios; avisos de solo lectura) · Claude con Federico · 1,5 h
- PENDIENTE: (sin clave) — SKU 887 y 888 (nombre vacío, aparecen en el Predictor): ¿son administrativos? Si sí, sumarlos a `es_administrativo()` y a los espejos JS · Federico / Aris · —
- NUEVO: conector-yiqi — "Verificar ahora" (`yiqi-connector?accion=estado`) lo puede usar una operadora y dispara un intento de renovación del token. Decidir si se restringe a admin · Federico · —
- NUEVO: ayuda — `Ayuda.jsx` todavía dice que la app "no muestra la fecha estimada de llegada", pero "Llega el" existe desde el 23/10 (`c9f76a0`) [repo 2026-11-10].
- VALIDADO EN VIVO: (radiografía UX, deploy `b862402`) — [en vivo 2026-11-10, central@dentalab-compras.demo en la app de depósito]: menú con íconos Tabler y `button`; aviso de "no hay" fiel ("suspende la alerta… no genera por sí solo una orden de compra"); aviso "reposición automática Central→Local pausada"; texto de Confirmar recepción en modo prueba sin contradicción.
- VALIDADO EN VIVO: (radiografía UX, deploy `b862402`) — [en vivo 2026-11-10, federico@ (admin)]:
  - /?page=alertas: stock −10 y −1 con barra al 0 % y número en rojo; encabezados `sticky`; ayuda por columna; `title` en los badges.
  - /?page=usuarios: columna Rol (Depósito / Administrador / Operador) y "— (cuenta de depósito)" / "Todos (administrador)".
  - /?page=condiciones: columna "Días de entrega"; 31 "Editar" / 73 "Completar".
  - /?page=equivalencias: 0 pares de discontinuados (seguían 6 con proveedor DENTALAB, ver abajo).
  - /?page=predictor: sin Acritone/NewcryL; números es-AR ("376.564,1").
  - /?page=seguimiento: "Ingreso con exceso — OC #1705"; carpeta "Cerradas en YiQi (recibidas o canceladas)".
  - /?page=historial: "Total de OC del mes".
  - /?page=nueva-oc: "1.147,1 u/mes", "5.268,2".
  - /?page=reposicion-central-local: aviso de reposición pausada.
  - Como admin no aparecen los avisos "Solo lectura" ni "Vista filtrada" y "Usuarios y accesos" sigue en el menú.
- HECHO: alertas — a 1536 px la tabla de Alertas medía 1.315 px contra 1.236 px de contenedor y la columna de acciones (fija a la derecha) tapaba la de Causa. Se cambió el ícono ⓘ de los encabezados por subrayado punteado (Monitor y Alertas) y `min-w` de Producto en Alertas de 180 a 145 px. Medido en vivo: 1.236 / 1.236 [en vivo 2026-11-10]. `vite build` OK.
- HECHO: revisar-equivalencias — `es_comprable()` compara con 'Dentalab', y en `precios_proveedor_yiqi` el proveedor viene 'DENTALAB'. Nueva migración `20261110123000_candidatos_equivalencia_sin_dentalab.sql` con `upper(proveedor) <> 'DENTALAB'` en los dos lados y limpieza de la caché. No toca `es_comprable()`. La verificación de `20261110122000` daba 0 porque comparaba 'Dentalab' (falso negativo).
- PENDIENTE: predictor-demanda — el SKU 888 (nombre vacío, 1.453 u/mes) sigue primero en el Predictor; falta saber si es administrativo · Federico / Aris · —
- VALIDADO EN VIVO: (radiografía UX, como operadora) — [en vivo 2026-11-10, federico@ pasado temporalmente a `operador` con los 62 proveedores de Ivana]:
  - /?page=nueva-oc → DIS DEN: "Ya hay una orden abierta de DIS DEN — #22 borrador, de Aris del 20/10/2026", sin link a la orden ajena (RPC `ordenes_abiertas_proveedor`). Cierra el riesgo NUEVO del 10/11 de OC duplicadas por RLS.
  - Nueva OC con "Vista filtrada: estás viendo solo tus 62 proveedores asignados".
  - "Usuarios y accesos" fuera del menú (por URL sigue el bloqueo "No tenés permiso").
  - /?page=reglas: "Solo lectura: esta configuración la edita Aris (administrador)".
  - /?page=ocs: bloque "Órdenes generadas desde el sistema" visible vacío ("Todavía no armaste órdenes desde la app…") y el texto de abajo remite al "bloque anterior".
  - /?page=equivalencias: 0 tarjetas DENTALAB y 0 discontinuadas (30 pares) después de `20261110123000` [prod 2026-11-10, `dentalab_en_cache = 0`].

## Cierre 2026-11-14
- HECHO: (sin clave: respuestas de Ivana del 14/11, vía Federico) — [stated por Ivana, 14/11]:
  1. 9150-F (hojas de bisturí surtidas x unidad) sale de varias cajas (9150-10 … 9150-24) y tiene su propio ranking: no se carga en `composicion_articulos`.
  2. 31822-F: los códigos son 31822-100 y 31822-500 (había escrito 33066 por error).
  3. 6067-F: no entendió la pregunta ("¿o sea que se fraccionan 50 pares?"); se le repregunta.
  4. 61322-F = 24 láminas: confirmado.
  5. "Revisión - enviado" = se la mandó a Aris y espera que confirme la OC; todavía no se pidió al proveedor.
  6. A mano cargan solo Stock de seguridad y consumo mensual; el Punto de pedido lo calcula YiQi. YiQi se actualizó hace poco y "Punto pedido" tiene campos nuevos: verlo con Aris y Vanig.
  7. Los 4 movimientos de stock de prueba (Nro 1430138, 1430139, 1431820, 1433061) los vio en YiQi y todavía no se dieron de baja.
  - Días de entrega: hay proveedores sin día fijo; ella lo revisa.
- HECHO: seguimiento-oc / historial-oc / ordenes-compra / monitor-stock — estado nuevo "En revisión (Aris)" para OC de YiQi con asunto que contiene "Revisión" (`esAsuntoRevision` en `lib/estados.js`): chip propio en Seguimiento, sin "Llega el" ni "Demorada" (`SeguimientoOC.jsx`, `calcularLlegada`), opción en el filtro de Historial, rótulo en Órdenes de compra, y nivel `en_revision` en la columna Estado OC de Monitor/Alertas (`lib/estadoOCPorSku.js`; la cantidad se sigue sumando "en camino" para no pedirla dos veces). Cierra D3 de la radiografía [repo 2026-11-14]. `vite build` OK.
- DESMENTIDO: alertas — el texto "se respeta el Punto de pedido cuando Dentalab lo cargó manualmente" (`Alertas.jsx` ~616, `MonitorStock.jsx` ~504) era falso: lo calcula YiQi a partir del Stock de seguridad y el consumo mensual que carga Dentalab (Ivana, 14/11). Corregido junto con el glosario de `Ayuda.jsx`. Cierra D4 / A6 de la radiografía [repo 2026-11-14].
- HECHO: ayuda — se quitó de "Cosas que el sistema todavía no hace" la línea "No muestra la fecha estimada de llegada" ("Llega el" existe desde `c9f76a0`); el glosario suma "En revisión (Aris)".
- HECHO: composicion-articulos — migración `supabase/migrations/20261114120000_composicion_31822.sql`: 31822-F → 1/500 y 31822-100 → 1/5 de la caja 31822-500 (la que se compra), cargados directo contra la -500 porque la composición se aplica a un solo nivel. Las cantidades por caja salen del código [confirmar]. Aplicación en prod: pendiente.
- PENDIENTE: composicion-articulos — repreguntar 6067-F a Ivana: "¿el 6067-F es 1 par suelto que sale de abrir la caja 6067-50, que trae 50 pares?" · Ivana · —
- PENDIENTE: alertas / sync-yiqi — YiQi se actualizó y "Punto pedido" tiene campos nuevos (Ivana, 14/11). Verificar que `mate_punto_de_pedido`, `mate_punto_pedido_max` y `mate_stock_seguridad` sigan llegando por la smartie 2344 (SQL de solo lectura) y ver con Aris y Vanig qué cambió · Federico · 0,2 h
- PENDIENTE: (sin clave: movimientos de stock de prueba en YiQi) — siguen vigentes en YiQi. Decidir si se revierten a mano (movimiento inverso) o se ajustan con un conteo físico · Aris / encargado de stock · —
- HECHO: composicion-articulos — `20261114120000` aplicada en prod: 2 filas (31822-F → 0,002 y 31822-100 → 0,2 de 31822-500); máximo de 31822-500 = 1 (prom. 0,21) [prod 2026-11-14]. Unidades confirmadas por el catálogo: "x Unid.", "x 100" y "x 500" (`mate_nombre`), así que se quita el [confirmar].
- DESMENTIDO: composicion-articulos — el PENDIENTE "repreguntar 6067-F a Ivana" no hace falta. El catálogo lo confirma: 6067-F = "Cubre Calzado Descartable x Par", 6067-50 = "x 100 und. (50 pares)", 6067-100 = "x 200 und. (100 pares)". El factor 1/50 contra 6067-50 (la caja más usada, según Ivana el 9/11) es correcto [prod 2026-11-14].
- HECHO: sync-yiqi — después de la actualización de "Punto pedido" en YiQi, los campos siguen llegando por la smartie 2344: de 7.348 artículos, 3.010 con punto de pedido, 3.010 con máximo y 2.960 con stock de seguridad; último sync 14/11 20:15 UTC [prod 2026-11-14]. No hay un conteo anterior para comparar, así que no se descarta un cambio en los valores [sin verificar]. Queda verlo con Aris y Vanig.
- VALIDADO EN VIVO: seguimiento-oc — [en vivo 2026-11-14, federico@ (admin) en Chrome Tulkas, /?page=seguimiento, deploy `afa0c39`]: chip "En revisión (2)" con #2704 ROMAN (asunto "REVISION") y #2695 KODENT SA ("Revisión - enviado"), las dos "En revisión (Aris)", sin "Llega el" ni "Demorada". Chips: Todas 186 / Enviadas 26 / Demoradas 11.
- VALIDADO EN VIVO: alertas / ayuda — [en vivo 2026-11-14, federico@ en /?page=alertas y /?page=ayuda]: el texto del ⓘ de Alertas dice "Punto de pedido que calcula YiQi (a partir del Stock de seguridad y el consumo mensual que carga Dentalab)"; el glosario tiene "En revisión (Aris)" y el punto de pedido corregido; ya no aparece "No muestra la fecha estimada de llegada".
- HECHO: (sin clave: quién es quién) — Vanig es hermano de Aris y trabaja en Dentalab [stated por Federico, 14/11]. Es con quien Ivana sugiere ver los cambios de "Punto pedido" en YiQi, junto con Aris. No confundir con Alex Samandjian (hermano de Aris, usuario de YiQi, ya listado en "Quién es quién"); si son la misma persona: [sin verificar].

## Cierre 2026-11-17
- HECHO: (sin clave: feedback de Ivana del 17/11, vía Federico) — [stated por Ivana, 17/11]: ya usa la app para armar pedidos reales (FORM-AR, borrado por urgente; ahora GRIMBERG DENTALES). Pregunta por 21609 (stock 10, Mín. 11,6, Máx. 2, sugiere 2); pide números sin coma; pide el filtro "Ocultar Stock Seguridad = 0" en Alertas; al editar un borrador quiere ver el listado de faltantes/preventivos del proveedor, como en Nueva OC; como la app no está sincronizada con YiQi, le preocupa que se le escape algún código; pregunta si el promedio sale del "Reporte de ventas" de YiQi.
- HECHO: alertas / monitor-stock / nueva-oc / predictor-demanda — números en entero en pantalla (`formatoEntero` en `lib/formato.js`): Mín./punto de pedido, Stock Seguridad y Máx. hacia arriba; Prom./mes y demanda en riesgo redondeados; Cobertura en meses enteros ("<1 m." entre 0 y 1). El stock conserva sus decimales. Solo presentación [repo 2026-11-17]. `vite build` OK.
- HECHO: maximos-calculados — provisorio hasta la respuesta de Aris (D1): en la barra, si el Máx. calculado es menor que el Mín. de YiQi se muestra el Mín. como Máx., y el tooltip lo aclara (`BarraMinStockMax.jsx`). No cambia `sugerencias_compra` ni lo que se guarda [repo 2026-11-17].
- HECHO: alertas — filtro "Ocultar Stock Seguridad = 0 (N)", con el mismo criterio que Monitor; chips y tarjetas lo reflejan (`Alertas.jsx`) [repo 2026-11-17].
- PENDIENTE: ordenes-compra / nueva-oc — editar un borrador con el listado de faltantes y preventivos del proveedor (reusar `ArmarOrden` de Nueva OC precargado con los ítems de la orden; ya era la opción A del punto 14 del 2/10) · Federico decide · 4–6 h
- PENDIENTE: escritura-yiqi — Ivana ya arma pedidos reales en la app y los carga a mano en YiQi (modo prueba): riesgo de doble carga y de olvidos. Decidir: pasar a Live, o mientras tanto una ayuda para cargarla en YiQi (por ejemplo, copiar la orden en el formato de YiQi) · Federico · —
- VALIDADO EN VIVO: monitor-stock / maximos-calculados — [en vivo 2026-11-17, federico@ (admin) en Chrome Tulkas, /?page=stock, deploy `485340a`]: 21609 Silicona Klepp (GRIMBERG DENTALES): stock 10, barra "máx 12", Punto de pedido 12, Stock Seguridad 8, Prom./mes 1, Cobertura 13 m. Tooltip: "Mín. 12 · Máx. 12 — El máximo calculado (2) es menor que el mínimo de YiQi: se muestra el mínimo hasta que Aris defina la regla".
- VALIDADO EN VIVO: alertas — [en vivo 2026-11-17, federico@ en /?page=alertas]: filtro "Ocultar Stock Seguridad = 0 (1554)"; 6001 MUNTAL con "Mín. 30 · Máx. 30" (calculado 16) y Prom./mes 13 sin decimales; stock negativo "−1" conservado.
- HECHO: ordenes-compra — al editar un borrador aparece el bloque "Faltantes y preventivos de <proveedor> que no están en la orden" (`components/OrdenesPropias.jsx`, modo `editandoItems`, ~l.316 carga y ~l.1565 render): `sugerencias_compra(proveedor)`, sin los que ya están en la orden, con barra Stock/Mín./Máx., Mín., Prom./mes, sugerida y "+ Agregar" con la cantidad sugerida; "Ocultar sin historial"; "Mostrar más" de a 30. No cambia `guardarEdicionItems` [repo 2026-11-17]. `vite build` OK. Elegido sobre reusar `ArmarOrden` entero porque el modo edición ya inserta, borra y recalcula totales.
- VALIDADO EN VIVO: ordenes-compra — [en vivo 2026-11-17, federico@ (admin) en Chrome Tulkas, deploy `21c59d7`]: borrador de prueba #26 PESCIO (1 ítem, 34507-15) armado en /?page=nueva-oc; en /?page=ocs&orden=26 → "Editar orden" aparece "Faltantes y preventivos de PESCIO que no están en la orden (14)", sin el 34507-15; "+ Agregar" sobre 69618 lo sumó con la sugerida (12) y la lista bajó a 13; "Guardar cambios" dejó la orden con 2 ítems. Después la #26 se archivó y se eliminó definitivamente desde la Papelera (Papelera 0, Órdenes 3: #14, #25, #22), con autorización de Federico.
- NUEVO: (sin clave: órdenes de la app) — Ivana creó la #25 GRIMBERG DENTALES (borrador, 22 ítems, $3.140.729, 17/11) y la #23 DROVER ya no figura [en vivo 2026-11-17].
- HECHO: (sin clave: feedback de Ivana del 17/11, segunda tanda) — [stated por Ivana vía Federico]: tuvo que borrar las cookies para ver los cambios, y "Sincronizado <fecha>" le hacía pensar que la app ya estaba al día; pide un PDF para el proveedor sin precios ni SKU; GRIMBERG DENTALES le pide aprobación de Aris aunque ella habla directo con ese proveedor.
- HECHO: (sin clave: versión de la app) — aviso "Hay una versión nueva de la app" con botón "Actualizar" en las dos apps (`hooks/useVersionNueva.js`: compara el `/assets/index-*.js` cargado con el de `/index.html` cada 5 min y al volver a la pestaña; `components/ui/AvisoVersionNueva.jsx`; `App.jsx`, `AppDeposito.jsx`). No hay service worker. El menú pasa de "Sincronizado <fecha>" a "Datos de YiQi: <fecha>" con `title` aclaratorio (`Sidebar.jsx`) [repo 2026-11-17]. Se valida recién con dos deploys seguidos.
- HECHO: ordenes-compra / pdf-oc-remito — botón "PDF sin precios" junto a cada "PDF": sin SKU, sin precios, sin subtotales ni total (`lib/pdfOrden.js`, `{ conPrecios }` en `generarPdfOrden` y `generarPdfOrdenDescargable`; `OrdenesPropias.jsx`). El envío por WhatsApp sigue mandando el PDF con precios (`enviarWhatsApp`, ~l.726) [repo 2026-11-17].
- HECHO: nueva-oc / ordenes-compra — el semáforo de Nueva OC y el bloque "Esperando aprobación de Aris" dicen el motivo con números: límite que aplica (propio o general) y total, artículos sin costo, o proveedor marcado "siempre requiere aprobación" (este último solo en Nueva OC: no se guarda en la orden) [repo 2026-11-17]. `vite build` OK.
- DESMENTIDO: (sin clave: aprobación de GRIMBERG) — no es un error. La #25 ($3.140.729) supera el límite general de $1.000.000 y GRIMBERG no tiene límite propio [sin verificar el valor en `proveedores`]. Lo resuelve Aris fijando un límite propio en Condiciones comerciales (el campo `limite_aprobacion` por proveedor ya existe).
- PENDIENTE: pdf-oc-remito — decidir si el PDF que se manda por WhatsApp va con o sin precios (por proveedor, con un campo en Condiciones comerciales) · Federico / Aris · 1 h
- VALIDADO EN VIVO: (sin clave: versión de la app) / pdf-oc-remito — [en vivo 2026-11-17, federico@ en /?page=ocs&orden=14, bundle `index-BsGC2-xP.js`, deploy `994d2f0`]: el menú dice "Datos de YiQi: 17/11, 04:45 p. m."; en el detalle aparecen "PDF de la orden" y "PDF sin precios" (el PDF no se abrió, para no disparar el diálogo de impresión).
- HECHO: ordenes-compra — la #14 mostraba "Motivo: el total ($ 1.024.652) supera el límite de aprobación de $ 0" porque las órdenes viejas guardaron `limite_al_crear = 0`. Ahora el motivo por límite solo se muestra si `limite_al_crear > 0` (`OrdenesPropias.jsx` ~l.1435) [repo 2026-11-17]. `vite build` OK.
- HECHO: reposicion-central-local — botón "Nuevo pedido entre depósitos", solo para admin, en `pages/ReposicionCentralLocal.jsx` (~l.331), con el modal `components/NuevoPedidoEntreDepositos.jsx`. Tiene dirección Central → Local o Local → Central (ids 155/157 de `lib/depositos.js`), buscador sobre `material_yiqi`, carrito con stock del depósito de origen (`traerStockPorDeposito`) y llama `crear_remito_reposicion_manual`, que ya acepta admin. Aviso de que preparar y confirmar sigue siendo en la app de depósito, y de que en modo prueba no mueve stock en YiQi. Sin migración [repo 2026-11-17]. `vite build` OK. Pedido de Aris vía Federico.
- PENDIENTE: reposicion-central-local — validar en vivo como admin que el RPC acepte a Aris (crear un pedido de prueba y anularlo) · Claude con Federico · 0,3 h
- VALIDADO EN VIVO: reposicion-central-local (parcial) — [en vivo 2026-11-17, federico@ (admin) en Chrome Tulkas, /?page=reposicion-central-local, bundle `index-BaxioZa9.js`]:
  - el botón "Nuevo pedido entre depósitos" abre el modal con dirección "Central → Local" y su aclaración, y el aviso de app de depósito y modo prueba;
  - la búsqueda de 21609 muestra "Stock en Depósito Central: 5";
  - "+ Agregar" lo pasa a "Pedido (1)" y habilita "Enviar pedido a Depósito Central".
  - **No se envió**: falta probar que el RPC acepte a un admin.
- NUEVO: reposicion-central-local — hay un pedido activo REP-2026-M1112204036, manual, Local → Depósito Central, creado el 12/11/2026 05:40, "En preparación · Paso 3 de 4 · En tránsito", 1 línea [en vivo 2026-11-17]. Quién lo creó: [sin verificar]. Es dato de prueba según el criterio del 23/10.
- VALIDADO EN VIVO: ordenes-compra — la #14 ya no muestra "Motivo: … límite de $ 0" [en vivo 2026-11-17, bundle `index-BaxioZa9.js`].
- PENDIENTE: (sin clave: versión de la app) — el aviso "Hay una versión nueva" no se pudo ver: la pestaña ya tenía la última versión (publicado = cargado). Se prueba en el próximo deploy dejando una pestaña abierta · Claude con Federico · —
- HECHO: app-deposito / reposicion-central-local — buscador de artículos por palabras para los pedidos entre depósitos. Migración `supabase/migrations/20261117120000_buscar_articulos_deposito.sql`: RPC `buscar_articulos_deposito(texto, limite)` con palabras sueltas en cualquier orden, sin tildes (`unaccent`), orden por relevancia, total + hasta 50, sin ML/combos/discontinuados/Acritone (incluye producción propia) y stock de Local y Central. El front la usa en `pages/deposito/PedirAlOtroDeposito.jsx` y `components/NuevoPedidoEntreDepositos.jsx`, con fallback al query viejo si el RPC no existe; muestra "Mostrando N de M", una recomendación de búsqueda siempre visible (pedido de Federico) y un mensaje para 0 resultados. Antes era la frase entera, distinguía tildes y cortaba en 20 sin orden [repo 2026-11-17]. `vite build` OK. Aplicación en prod: pendiente.
- HECHO: app-deposito / reposicion-central-local — migración `20261117120000_buscar_articulos_deposito` aplicada en prod: "acrilico auto" = 36, "auto acrílico" = 36 (mismo total en otro orden y con tilde), "acrilico" = 152; los primeros resultados de "acrilico auto" son 60016-100, 60016 y 60016-200 (Dentalab), con stock Local/Central [prod 2026-11-17].
- HECHO: app-deposito — las cantidades de los pedidos entre depósitos se mostraban con ",00" (500,00; 2.000,00) y en los inputs como "500.00", porque el wrapper `num()` forzaba 2 decimales (cambio del 10/11) y `numInput()` usaba `toFixed(2)`. Ahora se muestran enteras y solo llevan hasta 2 decimales si los tienen (`ConfirmarRecepcion.jsx`, `SolicitudesParaPreparar.jsx`, `ReposicionCentralLocal.jsx`, `ReposicionInterna.jsx`). El remito PDF ya lo hacía bien (`pdfRemito.js:25`) [repo 2026-11-17]. `vite build` OK. Lo vio Federico en vivo como local@ (Solicitudes para preparar).
- NUEVO: reposicion-central-local — Federico creó desde la app de depósito los pedidos de prueba REP-2026-M1117211422 (5 artículos de acrílico, hasta 10.000 u) y REP-2026-M1117211419 (1118 × 500), Local → Central, el 17/11; los dos quedaron "En preparación" [en vivo 2026-11-17, captura de Federico]. Son datos de prueba.
- NUEVO: app-deposito — prueba de Federico con Aris (17/11): pedido Local → Central confirmado con menos cantidad de la enviada. La diferencia queda guardada (`cantidad_recibida` vs `cantidad_enviada` en `solicitudes_reposicion_lineas`), pero no se avisaba a nadie: solo se veía la columna "Recibida" en el detalle de Aris [stated por Federico, 17/11].
- HECHO: reposicion-central-local / app-deposito — diferencias de recepción visibles, sin migración:
  - pantalla de Aris (`pages/ReposicionCentralLocal.jsx`): pastilla "Recibido con diferencia · faltan/sobran N u", chip "Con diferencias (N)" y columna "Diferencia" en el detalle, calculado en memoria;
  - app de depósito (`components/DiferenciasRecepcion.jsx` en `SolicitudesParaPreparar.jsx`): bloque "Diferencias en recepción" para el depósito de origen, con las líneas recibidas en los últimos 30 días con faltante o sobrante;
  - Ayuda: `Ayuda.jsx` y `AyudaDeposito.jsx`.
  - Diferencia = recibida − enviada, solo en líneas `recibida` [repo 2026-11-17]. `vite build` OK.
- PENDIENTE: reposicion-central-local — parte B: motivo obligatorio al recibir menos de lo enviado, botón "Revisado" (quién/cuándo) y número en el menú. Requiere migración y que Aris defina quién resuelve la diferencia (él o el depósito que envió) y si se reenvía lo faltante · Aris decide · 2–3 h
- DESMENTIDO: reposicion-central-local — el PENDIENTE de arriba ("Aris decide quién resuelve") ya está definido. Regla de Aris (vía Federico, 17/11) [stated]: la diferencia la revisa quien recibe (Local o Central); si lo enviado difiere de lo pedido se asienta el motivo; si lo recibido difiere de lo enviado, ese artículo se frena; los que coinciden se cierran OK y mueven stock. Reenviar lo faltante no se pidió.
- HECHO: reposicion-central-local — parte B, migración `supabase/migrations/20261117130000_diferencias_recepcion.sql`:
  - estado de línea nuevo `con_diferencia` (amplía el check del baseline `:405`); columnas `cantidad_recibida_inicial`, `motivo_diferencia`, `nota_diferencia`, `diferencia_revisada_en/por`, `nota_revision`;
  - `declarar_linea_reposicion`: motivo obligatorio también cuando se envía de más (la suspensión de alerta sigue solo para faltantes);
  - `confirmar_recepcion_linea` (4 parámetros, devuelve `'recibida'` o `'con_diferencia'`): si no coincide pide motivo y frena la línea. No mueve stock (`mover-stock-reposicion` solo mueve `recibida`) y no cierra el pedido (el trigger de `20260930140000` no la toma como terminal);
  - RPC nuevo `revisar_diferencia_linea(linea, cantidad_final, nota)`: solo destino o admin; pasa a `recibida` con la cantidad final y el trigger cierra el pedido si era la última;
  - probada en Postgres 16 local con esquema mínimo: dos corridas sin error; caso A=OK / B=frenada / C=faltante declarado → pedido abierto; "Revisado" de B → pedido `completada`; el origen no puede confirmar ni revisar [repo 2026-11-17]. Aplicación en prod: pendiente.
- HECHO: reposicion-central-local — parte B, frontend: `pages/deposito/ConfirmarRecepcion.jsx` (motivo + nota cuando no coincide, botón "⚠ Confirmar con diferencia", bloque "Recibido con diferencia — pendiente de revisar" con "✓ Revisado"; con cantidad final 0 no se invoca el movimiento); `SolicitudesParaPreparar.jsx` (motivo si se envía de más, estado "Recibido con diferencia — lo revisa quien recibe"); `components/DiferenciasRecepcion.jsx` (incluye las frenadas, columna Estado: Pendiente de revisar / Revisada · final N; `select('*')` para no romper antes de aplicar la migración); `pages/ReposicionCentralLocal.jsx` (estado "Frenado por diferencia", "N sin revisar" en la pastilla, motivo y revisión en el detalle); Ayuda y Ayuda de depósito. `vite build` OK [repo 2026-11-17].
- PENDIENTE: reposicion-central-local — aplicar `20261117130000` en prod y validar en vivo con `local@` / `central@` (pedido de prueba con un artículo OK y uno con diferencia, "Revisado", cierre del pedido) · Federico + Claude · 0,5 h
- PENDIENTE: reposicion-central-local — badge en el menú de depósito con los artículos frenados (no construido) · Federico decide · 0,5 h
- VALIDADO EN PROD: reposicion-central-local — `20261117130000` aplicada: `confirmar_recepcion_linea` con 4 parámetros, `revisar_diferencia_linea` y `declarar_linea_reposicion` presentes, `columnas_nuevas = 6` [prod 2026-11-17]. Push `bbd6f93` / `e6b726a`.
- HECHO: reposicion-central-local — corrección de lo enviado + historial (caso de Aris, vía Federico, 17/11 [stated]: Central declara 8, llegan 6 al Local, en Central no existían; el ingreso queda frenado hasta que Central corrige 8 → 6 desde su panel, recién ahí lo confirma el Local, y queda en un historial). Migración `supabase/migrations/20261117140000_correccion_envio_e_historial.sql`:
  - tabla `reposicion_lineas_eventos` (append-only, sin FK para que sobreviva al pedido; RLS de lectura por depósito origen/destino o admin; sin permisos de escritura para `authenticated`), con eventos `declarada`, `recibida_ok`, `recibida_con_diferencia`, `envio_corregido`, `diferencia_revisada`;
  - las 3 funciones del circuito registran su evento; RPC nuevo `corregir_envio_linea(linea, cantidad, motivo)`: solo origen o admin, solo sobre `con_diferencia`, vuelve la línea a `declarada` con la cantidad corregida (y suspende la alerta si queda faltante contra lo pedido);
  - backfill de las líneas que ya tenían diferencia;
  - probada en Postgres 16 local: dos corridas sin error; caso 8 → llegan 6 → frenada → el destino no puede corregir → Central corrige a 6 → vuelve en tránsito → el Local confirma 6 → pedido `completada`; 6 eventos en el historial [repo 2026-11-17]. Aplicación en prod: pendiente.
- HECHO: reposicion-central-local — frontend: `components/HistorialReposicion.jsx` (nuevo); `components/DiferenciasRecepcion.jsx` ("Corregir lo enviado" en las pendientes, historial de los últimos 30 días); `pages/deposito/ConfirmarRecepcion.jsx` ("Corregido por el otro depósito: figuraba N"); `pages/ReposicionCentralLocal.jsx` ("Historial del pedido" al abrir cada pedido); Ayuda y Ayuda de depósito. `vite build` OK [repo 2026-11-17].
- NUEVO: reposicion-central-local — la policy "actualizar lineas segun depositos asignados" del baseline (`:1206`) deja que una cuenta de depósito haga UPDATE directo sobre `solicitudes_reposicion_lineas` por la API, salteando los RPC (y el historial). No es explotable desde la app; decidir si se restringe · Federico · 0,5 h
- PENDIENTE: reposicion-central-local — aplicar `20261117140000` en prod y validar en vivo con `local@` y `central@` el caso 8 → 6 completo · Federico + Claude · 0,5 h
- VALIDADO EN PROD: reposicion-central-local — `20261117140000` aplicada: `tabla_historial = 1`, `eventos_cargados = 0` (ninguna línea tenía diferencia antes del historial), `corregir_envio_linea` y `registrar_evento_linea` presentes [prod 2026-11-17]. Validación en vivo del caso 8 → 6: pendiente.

## Cierre 2026-11-18
- VALIDADO EN VIVO: reposicion-central-local — caso de Aris completo [en vivo 2026-11-17/18, local@ y central@dentalab-compras.demo en la app de depósito; federico@ en /?page=reposicion-central-local]: local@ pidió 8 u de 1018 (REP-2026-M1117232605) → central@ declaró 8 → local@ confirmó 6 con motivo y quedó frenado sin mover stock → central@ "Corregir lo enviado" 8 → 6 → volvió al Local "Corregido por el otro depósito: figuraba 8" → local@ confirmó 6 → pedido "✓ Completa" con "Historial del pedido (4)".
- HECHO: (sin clave: radiografía depósitos) — `claude/RADIOGRAFIA_DEPOSITOS_18-11-2026.md` (proyecto): 20 hallazgos con las 3 cuentas.
- NUEVO: reposicion-central-local — las cuentas de depósito ven el stock en 0: la policy "stock segun proveedores asignados" de `stock_yiqi` solo deja leer a admin o a quien tiene proveedores asignados (60016 Local 1, 60016-100 Central 2, 1365-A2 Local 5 / Central 4 en prod, todos "0" en Pedir al otro depósito) [prod 2026-11-18].
- NUEVO: (sin clave: formato de hora) — `toLocaleString('es-AR')` en Chrome usa ciclo h12 sin "a. m./p. m.": 21:14 UTC se ve "06:14:19" [en vivo 2026-11-18, `Intl` hourCycle h12, zona America/Buenos_Aires].
- NUEVO: reposicion-central-local — 34 publicaciones de ML (###) en el universo de la reposición automática; PARA FRACCIONAR 0; universo 3.817; entrarían hoy 354 [prod 2026-11-18].
- HECHO: reposicion-central-local — sprint del 18/11 (5 agentes en paralelo + orquestación), `vite build` OK [repo 2026-11-18]. Migraciones escritas, sin aplicar en prod:
  - `20261118120000_stock_depositos_y_tope_pedidos.sql`: policy de lectura de `stock_yiqi` para cuentas con depósito; `stock_disponible_deposito(deposito, skus)` = stock YiQi − comprometido en pedidos abiertos; `crear_remito_reposicion_manual` rechaza superar el disponible del origen y numera `REP-AAAA-NNNN`. Front: "Disponible en …", tope y "Usar N" en Pedir al otro depósito y en el modal del admin; "Stock acá" y aviso al declarar de más; "Sin faltante" en gris. Probada en Postgres local (t_a).
  - `20261118130000_reposicion_automatica_configurable.sql`: interruptor = `reglas_reposicion_central.activa` (queda en false), cron 15 reactivado, `maximo_lineas`, helper `reposicion_central_candidatos()` (sin ###, combos ni discontinuados), el trigger ya no declara (Central declara a mano), RPC admin `configurar_reposicion_automatica` / `estado_reposicion_automatica`, `estado_automatismos` = regla activa Y cron. Front: `components/ConfigReposicionAutomatica.jsx` en Reposición Central-Local; "Paso 2 de 4 · falta declarar"; columna "Generado"; pastilla "Tuvo diferencia (resuelta)"; YiQi "modo prueba". Probada en t_b.
  - `20261118140000_remitos_firmados.sql`: bucket privado `remitos-firmados`, policies en `storage.objects`, tabla `remitos_firmados` + RPC `registrar_remito_firmado`. Front: `components/RemitoFirmado.jsx` montado en Confirmar recepción, Solicitudes para preparar y el detalle de Reposición Central-Local; línea en el PDF. Probada en t_c.
  - `20261118150000_articulos_no_previstos.sql`: `no_previsto`, `reemplaza_linea_id`, 3 eventos nuevos, `con_diferencia` nunca terminal en el cierre, RPC `registrar_no_previsto` (destino) y `resolver_no_previsto` (origen: aceptar mueve stock, rechazar no). Front: motivo "Llegó otro artículo", "+ Llegó algo que no está en el remito", remito y depósito en los frenados, Aceptar/Rechazar en Diferencias, historial filtrado a los pedidos propios como origen, "arriba". Probada en t_d.
  - `20261118160000_admin_depositos_usuarios.sql`: RPC admin para ver y asignar el depósito de cada cuenta de depósito. Front: Usuarios y accesos; Reglas con separador de miles y barra "Tenés cambios sin guardar"; `lib/depositos.js` = "Depósito Local" / "Depósito Central". Sin prueba local.
  - Formato de hora `hourCycle: 'h23'` en 20 lugares de fecha/hora (`toLocaleString('es-AR')`). Ayuda y Ayuda de depósito actualizadas.
- PENDIENTE: reposicion-central-local — aplicar las 5 migraciones del 18/11 en orden y validar en vivo con local@, central@ y federico@ · Federico + Claude · 1,5 h
- NUEVO: reposicion-central-local — un artículo extra hay que registrarlo antes de confirmar la última línea: si el pedido se cerró, ya no se puede (informe del agente D). Textos "el Local"/"al Local" que quedan en Ayuda.jsx (:181, :211, :212, :262, :719) y AyudaDeposito.jsx:56 [repo 2026-11-18].
- VALIDADO EN PROD: reposicion-central-local — las 5 migraciones del 18/11 aplicadas: policy `stock para cuentas de deposito`; regla `activa = false`, `maximo_lineas = 30`, cron 15 activo, `candidatos_hoy = 354`, `trigger_ya_no_declara = true`; 3 policies de remitos firmados; no previstos `2 · 2 · true · true`; central@ = 157, local@ = 155 [prod 2026-11-18]. Push `5d596cf`.
- VALIDADO EN VIVO: reposicion-central-local — [en vivo 2026-11-18, federico@ (admin) en /?page=reposicion-central-local]: tarjeta "Reposición automática Central → Local" en "Pausada", "Hoy entrarían 354 artículos (30 en el primer remito)", "Cómo arma el remito"; "Paso 2 de 4 · En preparación — falta declarar"; columna "Generado"; horas en 24 h (20:26, 18:14); REP-2026-M1117232605 con "Tuvo diferencia (resuelta)" en "Con diferencias (2)". No se activó el automático.
- VALIDADO EN VIVO: usuarios-accesos — [en vivo 2026-11-18, federico@ en /?page=usuarios]: local@ "Depósito Local", central@ "Depósito Central". [/?page=reglas]: límite "$ 1.000.000" sin ecos. La barra "cambios sin guardar" no se probó.
- VALIDADO EN VIVO: reposicion-central-local — [en vivo 2026-11-18, local@ en la app de depósito]: "Stock acá" 0 (1118) y 94 (1000) con aviso "Declarás más de lo que figura en stock"; "Subir remito firmado" en cada pedido; en Pedir a Depósito Central, "Disponible en Depósito Central: 2" (60016-100) y "Sin stock en Depósito Central" bloqueado; con 5 sobre 2: "No hay más en stock: máximo disponible real 2", "Usar 2" y envío deshabilitado (no se envió).
- PENDIENTE: reposicion-central-local — validar en vivo "Llegó otro artículo" / "+ Llegó algo que no está en el remito" y la subida real de un remito firmado (requieren un pedido de prueba nuevo entre local@ y central@) · Federico + Claude · 0,5 h
- NUEVO: reposicion-central-local — con 354 candidatos y máximo 30 por remito, al prender el automático el encadenado arma ~12 pedidos seguidos en el primer disparo (informe del agente B). Decidir con Aris antes de activarlo: subir el máximo, poner un tope de pedidos encadenados o aceptarlo · Federico / Aris · —
- HECHO: reposicion-central-local — reglas de Aris para el automático (vía Federico, 18/11 [stated]): máximo 2 pedidos de 30 artículos abiertos y no generar más hasta que se preparen y entreguen; mantener ABC; los pedidos en espera se reformulan con el stock nuevo sumando los faltantes A; un tercer botón para forzar la actualización; todo editable por Aris. Migración `supabase/migrations/20261118170000_reposicion_automatica_tope_y_recalculo.sql`: `maximo_ordenes_abiertas` (2) y `recalcular_en_espera` en la regla; `armado_iniciado_en` / `recalculado_en` en el pedido; `armar_lineas_remito_central`, `reposicion_central_cantidad_abiertos`, `recalcular_remitos_en_espera` (interna, con advisory lock; anula el pedido si queda vacío), encadenado con tope, evaluador con tope y recálculo por frecuencia, RPC `marcar_armado_iniciado`, `forzar_actualizacion_reposicion` (admin), `estado_pedidos_automaticos_abiertos`. "En espera" = automático abierto sin imprimir ni declarar. Front: campos nuevos y lista de abiertos en la tarjeta; botón "⟳ Recalcular remitos" en Reposición Central-Local; en Solicitudes para preparar, imprimir marca el armado, leyenda de "se actualiza solo" y aviso de frenado. Ayuda actualizada. Probada en Postgres local (t_f, casos a–f). `vite build` OK [repo 2026-11-18]. Aplicación en prod: pendiente.
- PENDIENTE: (sin clave: remito de YiQi) — Aris pide usar el remito interno que ya hace YiQi (ya lo había pedido el 10/9 y no se relevó). Relevar en me.yiqi.com.ar (solo lectura) y decidir: A) copiar su formato en el remito de la app (sin escribir en YiQi) o B) generar el movimiento en YiQi al despachar e imprimir el remito real (requiere salir del modo prueba) · Federico / Aris · —
- VALIDADO EN PROD: reposicion-central-local — `20261118170000` aplicada: `activa false · maximo_lineas 30 · maximo_ordenes_abiertas 2 · recalcular_en_espera true · abiertos_ahora 0 · funciones_nuevas 5 · columnas_nuevas 2` [prod 2026-11-18]. Push `cea5ba6`.
- VALIDADO EN VIVO: reposicion-central-local — [en vivo 2026-11-18, federico@ (admin) en /?page=reposicion-central-local]: campos "Máximo de pedidos abiertos a la vez" (2) y "Actualizar los pedidos en espera con el stock nuevo" (Sí); "Pedidos automáticos abiertos: 0 de 2"; "Hoy entrarían 320 artículos (30 en el primer remito)"; botón "⟳ Recalcular remitos" con el automático pausado → "El automático está pausado y no había pedidos en espera para actualizar." No se activó el automático.
- NUEVO: (sin clave: remito interno de YiQi) — relevado [en vivo 2026-11-18, Ventas Online en me.yiqi.com.ar, solo lectura]: Stock → Remitos → "Remito Interno" (`/view/REMITO_INTERNO?schemaId=328`, 6.418 registros) y "Generador de Remito Interno". Los depósitos lo usan a diario para lo mismo que el circuito de la app: Central → Local ("TRANSFERENCIA DE MERCADERIA GREGORIO", "ABASTECIMIENTO LOCAL - DROVER") y Local → Central ("PARA COMPLETAR PEDIDO 49332"), estados Pendiente / Procesado, usuario `deposito@dentalab.com.ar`. Campos: Nro remito interno, fecha de carga y de entrega, usuario responsable, método de envío, origen/destino, nro remito externo, observación, unidades totales, bultos, pallets, contenedores, # SKUs, "Puede procesar", "Hay diferencias". Pestaña "Items enviados" (artículo, Cant. en origen, Cant. enviada, Faltante en stock origen, estado) y "Items recibidos" (Cant. recibida, Cant. devueltos, Cant. enviada). Acciones: Enviar, Hoja de ruta, Vista de impresión (`/Instance/print?Id=781&...`), Generar PDF, Artículos enviados, Cancelar. Ej.: remito 6587 Pendiente, 11 SKU, 260 u.
- PENDIENTE: (sin clave: remito interno de YiQi) — decidir con Aris cómo se usa: A) copiar el formato en el remito de la app, B) que la app genere el REMITO_INTERNO en YiQi (Pendiente) y los depósitos lo ejecuten en YiQi como hoy, leyendo el estado de vuelta (requiere salir del modo prueba e investigar la API de REMITO_INTERNO), o C) mixto · Federico / Aris · —
- DECISIÓN: (sin clave: remito interno de YiQi) — camino B [stated por Federico, 18/11]: "al habilitar el módulo, tiene que escribir en YiQi"; la app planifica y escribe en YiQi, tanto en depósitos (Remito Interno) como en compras (OC) cuando Aris encienda cada módulo. Hasta que Aris lo encienda sigue el modo prueba (`escritura_yiqi_habilitada = false`). Riesgo a resolver en el diseño: si YiQi mueve el stock al procesar el Remito Interno, la app NO tiene que escribir además el `MOVIMIENTO_STOCK` de `mover-stock-reposicion` (doble movimiento).
- HECHO: (sin clave: remito interno de YiQi) — fase 1, relevamiento por API (solo lectura) [en vivo 2026-11-18, GET `REMITO_INTERNO/6601` vía `yiqi-borrar-oc` modo GET con la sesión de federico@]: el registro trae `REIN_*` (nro visible `REIN_NRO_REMITO_INTERNO`, id interno `id`, `CEDI_ID_CEDI` origen 157, `CEDI_ID_CED1` destino 155, `REIN_USUARIO_RESPONSABLE` 156, `REIN_PUEDE_PROCESAR`, `REIN_HAY_DIFERENCIAS`, `ESTA_NOMBRE`) y los arrays `ITEMSENVIADOS` (`MATE_ID_MATE`, `DERI_CANTIDAD`, `DERI_CANTIDAD_ORIGEN`, `DERI_FALTANTE`, `TIUN_ID_TIUN` 2) e `ITEMSRECIBIDOS` (`REIR_CANTIDAD`, `REIR_CANTIDAD_DEVUELTOS`, `REIR_CANTIDAD_ENVIADA`). Eventos del 6596: "Evento al enviar" y "Crea mov. de stock de los recibidos" → YiQi mueve el stock al procesar. El Swagger público (apidoc.yiqi.com.ar, módulo Stock) llega truncado y no muestra REMITO_INTERNO.
- HECHO: (sin clave: remito interno de YiQi) — fases 2–3 (agentes G y H): migración `20261118180000_remito_interno_yiqi.sql` (columnas `gestion_en_yiqi` y `yiqi_*` en el pedido; `escribir_remito_en_yiqi` y `yiqi_usuario_responsable` en la regla; `configurar_remito_yiqi`; `aplicar_estado_remito_yiqi` (espejo del estado de YiQi: Enviado → declarada, Procesado → recibida y cierra, anulado/404 → anulada); candado `reclamar_publicacion_yiqi` contra doble publicación; las 6 RPC del circuito de la app rechazan pedidos gestionados en YiQi; recálculo solo si en YiQi sigue Pendiente; cron `remito-interno-yiqi-ciclo` cada 10 min). Edge function nueva `remito-interno-yiqi` (publicar / actualizar / sincronizar / ciclo; escribir exige `escritura_yiqi_habilitada` Y `escribir_remito_en_yiqi`; sincronizar es solo GET). `mover-stock-reposicion` no escribe si el pedido lo gestiona YiQi. Front: interruptor "Crear el remito interno en YiQi" en la tarjeta de Aris, pastillas y "Leer estado de YiQi" en Reposición Central-Local, aviso con link a YiQi y sin botones de acción en las pantallas de depósito para esos pedidos, publicación de pedidos manuales, Ayuda. Probada en Postgres local (t_g); `vite build` OK [repo 2026-11-18]. Aplicación en prod y deploy: pendientes.
- PENDIENTE: (sin clave: remito interno de YiQi) — fase 4, prueba controlada en YiQi (1 remito de 1 unidad y su anulación) para validar el formato del POST, el PUT de ítems, los nombres de estados ("Enviado", anulación) y el 404 de un borrado. Requiere ok explícito de Federico para habilitar la escritura solo durante la prueba · Federico + Claude · 1 h
- VALIDADO EN PROD: (sin clave: remito interno de YiQi) — `20261118180000` aplicada: `10 · 2 · 6 · 6 · 1 · false · false` (cron `remito-interno-yiqi-ciclo` activo, jobid 20; módulo y escritura apagados) [prod 2026-11-18]. Deploy `remito-interno-yiqi` y `mover-stock-reposicion` (`--no-verify-jwt`) OK [prod 2026-11-18].
- VALIDADO EN VIVO: (sin clave: remito interno de YiQi) — [en vivo 2026-11-18, federico@ (admin) en /?page=reposicion-central-local, deploy `ffef3f3`]: sección "Remito interno en YiQi" con estado "Desactivado", interruptor "Crear el remito interno en YiQi" apagado y aviso "Modo prueba: la escritura a YiQi está deshabilitada; aunque lo prendas, no se crea nada en YiQi hasta que Federico la habilite". No se prendió.
- VALIDADO EN PROD: (sin clave: remito interno de YiQi) — cron `remito-interno-yiqi-ciclo`: respuesta 200 `{"ok":true,"escritura_habilitada":false,"publicados":[],"actualizados":[],"sincronizados":0,"errores":[]}` a las 19:50 UTC [prod 2026-11-18, `net._http_response`].
- PENDIENTE: (sin clave: remito interno de YiQi) — prueba controlada en YiQi (1 remito de 1 unidad Central → Local, leerlo, anularlo; escritura habilitada solo durante la prueba) · espera ok de Federico · 1 h
- DECISIÓN: (sin clave: remito interno de YiQi) — no se hace la prueba controlada [stated por Federico, 18/11]: "Si habilitas la prueba se escribe en YiQi, y no queremos eso". La integración queda apagada y SIN validar contra YiQi: el formato del POST, el PUT de ítems, el nombre del estado tras "Enviar" y la respuesta de un remito anulado o borrado siguen siendo supuestos [sin verificar]. El primer remito real que se cree cuando se habilite el módulo hace de prueba: revisarlo en YiQi y en la app apenas se cree.

## Cierre 2026-11-19
- HECHO: (sin clave: radiografía visual) — `claude/RADIOGRAFIA_VISUAL_19-11-2026.md` (proyecto): todas las pantallas como admin en iframes de 1536 y 1280 px con detector automático y acciones abiertas sin ejecutar [en vivo 2026-11-19, federico@ en Chrome Tulkas]. A 1536 px sin desbordes; a 1280 px Monitor, Alertas, Predictor y Proveedores con columnas fuera de vista; menú con textos cortados.
- HECHO: (sin clave: radiografía visual) — arreglos con 3 agentes en paralelo: `Sidebar.jsx` (menú en 2 líneas), `Ayuda.jsx` (más ancha, 2 columnas), `ConectorYiQi.jsx` (smarties 2353/2359/2360 y REMITO_INTERNO), `ComparacionPrecios.jsx` / `UsuariosAccesos.jsx` / `RevisarEquivalencias.jsx` (botón Actualizar unificado; "Se guarda al tildar" y confirmación; precios chicos con 2 decimales), `MonitorStock.jsx` / `Alertas.jsx` / `PredictorDemanda.jsx` / `Proveedores.jsx` (compactas por debajo de 1536 px, columnas de decisión fijas a la derecha, Alertas con Críticas primero), `ConfigReposicionAutomatica.jsx` (plegable con resumen, interruptores unificados), `NuevoPedidoEntreDepositos.jsx` (nombres de depósito), `SeguimientoOC.jsx` (ocultar avisos de ingreso con exceso, `title`), `CondicionesProveedor.jsx` ("aprobación de Aris", límite formateado). `vite build` OK [repo 2026-11-19].
- NUEVO: proveedores — en las notas de ABC LAB SRL (Condiciones comerciales) hay una contraseña del portal del proveedor en texto plano, visible para quien abra Condiciones [en vivo 2026-11-19]. Que Aris la borre · Aris · —
- NUEVO: revisar-equivalencias — `formatoMoneda` (`lib/formato.js:37-44`) redondea a enteros: precios unitarios chicos se veían "$ 0"; arreglado localmente en Equivalencias, el resto de la app sigue igual [repo 2026-11-19].
- PENDIENTE: (sin clave: radiografía visual) — validar en vivo los arreglos a 1536 y 1280 px después del deploy; pasada de depósito con local@ y central@ · Claude con Federico · 1 h
- VALIDADO EN VIVO: (sin clave: radiografía visual) — [en vivo 2026-11-19, federico@ en iframes de 1280 y 1536 px, deploy `4639728`]: a 1280 px Proveedores entra entero; Monitor desborda 25 px y Alertas 95 px con Estado / "+ OC" / acciones fijas a la derecha y visibles; Predictor desborda 114 px con Total fijo (queda tapado el último mes). Textos cortados ahora con `title`. Alertas con Críticas primero. Reposición Central-Local con la tarjeta del automático plegada en una línea de resumen y el menú "Reposición Central-Local" en 2 líneas. A 1536 px sin desbordes.
- HECHO: (sin clave: radiografía visual) — pasada de depósito [en vivo 2026-11-19, central@ en iframes de 1280 y 1536 px, 4 pantallas]: sin desbordes; hallazgos: nombre de la cuenta cortado sin `title` en el pie del menú, Ayuda de depósito angosta y con el aviso "reposición automática pausada" fijo, Pedir al otro depósito en una columna de ~300 px con lista de resultados de ~4 artículos. Arreglado (agente L): `AppDeposito.jsx` (title y 2 líneas), `AyudaDeposito.jsx` (más ancha, 2 columnas; avisos de automático y modo prueba leídos en vivo con `useEstadoAutomatismos` / `useModoPruebaYiqi`), `PedirAlOtroDeposito.jsx` (resultados y pedido lado a lado desde `lg`, lista hasta 60 % de la altura). `vite build` OK [repo 2026-11-19]. local@ no se repasó: mismas pantallas, validadas el 18/11.
- VALIDADO EN VIVO: (sin clave: radiografía visual) — [en vivo 2026-11-19, central@ en iframe de 1536 px, deploy `de5b301`]: Pedir a Depósito Local con resultados y pedido lado a lado (lista larga, "Disponible en Depósito Local: N", "Sin stock" bloqueado); Ayuda de depósito en 2 columnas con el aviso de automático pausado leído en vivo. Radiografía visual cerrada.
- HECHO: predictor-demanda — Ivana (20/11, vía Federico) [stated]: los SKU 887 y 888 son genéricos para productos comprados puntualmente para un cliente o vendedor, sin código propio. Migración `supabase/migrations/20261120120000_sku_genericos_887_888.sql`: `es_administrativo()` suma 887 y 888 (afecta sugerencias, reposición interna, contadores del menú) y `reposicion_central_candidatos()` deja afuera los administrativos (antes no lo hacía). Front: los filtros de `Alertas.jsx`, `MonitorStock.jsx` y `PredictorDemanda.jsx` suman 887/888. `vite build` OK [repo 2026-11-20]. Aplicación en prod: pendiente.
- PENDIENTE: predictor-demanda — "Prioritario a domicilio" (aparece con ~300 u/mes en el Predictor): Ivana no sabe qué es; preguntar a Aris · Aris · —
- NUEVO: datos-empresa — datos pasados por Ivana (20/11) [stated]: razón social AGRA DENTAL S.R.L., CUIT 30-71502151-6, mails de compras compras@dentalab.com.ar y comprasdentalab@gmail.com. Se cargan en Datos de la empresa con la cuenta admin.
- VALIDADO EN PROD: predictor-demanda — `20261120120000` aplicada: `es_administrativo` 887/888/889 = true, 1000 = false; 0 administrativos en `reposicion_central_candidatos()` [prod 2026-11-20]. Push `452c0a1`.
- HECHO: predictor-demanda — "Prioritario a domicilio" (código del reporte de ventas, sin artículo en el catálogo) entra en la misma categoría que 887/888: no se repone [stated por Federico, 20/11]. Migración `supabase/migrations/20261120130000_prioritario_a_domicilio.sql` (`es_administrativo()` lo reconoce sin distinguir mayúsculas ni espacios) y los filtros de `Alertas.jsx`, `MonitorStock.jsx` y `PredictorDemanda.jsx`. `vite build` OK [repo 2026-11-20]. Cierra el PENDIENTE de arriba sobre "Prioritario a domicilio".
- VALIDADO EN PROD: predictor-demanda — `20261120130000` aplicada: `true · true · false` [prod 2026-11-20]. Push `8eca889`.
- NUEVO: predictor-demanda — en `ventas_mensual_yiqi` hay 4 códigos de envío, no uno: "Prioritario", "Prioritario a domicilio", "Prioritario a sucursal de correo" y "Retiro en sucursal OCA Prioritario" [prod 2026-11-20].
- HECHO: predictor-demanda — migración `supabase/migrations/20261120140000_conceptos_de_envio.sql`: `es_administrativo()` reconoce los 4; filtros de `Alertas.jsx`, `MonitorStock.jsx` y `PredictorDemanda.jsx` igual. `vite build` OK [repo 2026-11-20]. Aplicación en prod: pendiente.
