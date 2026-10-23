# CLAUDE.md — Dentalab-Compras

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

**DESMENTIDO**
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
- **[ABIERTO — MEDIUM]** Carpetas `_to_delete`, `_to_delete_git_locks` y `_to_delete_old` en la raíz. [repo 2026-10-18]
- **[ABIERTO — MEDIUM]** `package-lock.json` vacío en la raíz, trackeado y sin relación con `frontend/`. [repo 2026-10-18]
- **[POR DISEÑO]** `alertas_pausadas_write_authenticated` (FOR ALL, `using (true)`) en el baseline, línea 1230: coincide con la regla "pausa de 15 días por cualquier usuario".
- **[ABIERTO — BAJO]** `xlsx` sin arreglo en npm. La app solo escribe Excel.

## PENDIENTE INMEDIATO

1. Avisarles a Ivana y a Aris del cambio del 23/10:
   - las OC vaciadas o borradas en YiQi aparecen "Cerradas en YiQi" y ya no son Demoradas;
   - "en camino" ya no descuenta lo de esas OC, así que en Alertas puede haber críticos nuevos.
   - Revisar 2 o 3 casos con Ivana.
2. Punto 4 (máximos): abrir en YiQi un artículo de MEGADENTAL con "Mín. 6 · Máx. 6" y comparar con la smartie 2344. Es para resolver la contradicción "el máximo lo genera el sistema". ~30 min con Claude in Chrome, Ventas Online.
3. Órdenes propias (borrador / esperando aprobación / aprobadas) en Seguimiento de OC. Pedido de Ivana (pregunta 5), ~3–4 h.
4. Verificación visual de la limpieza etapa 1 en la app: Reposición Central-Local sin pedidos "en preparación"; #2 y #12 en la papelera.
5. Credenciales en el historial de git: la clave de YiQi (`03b6288`) y la clave común de las cuentas reales (`PROMPT_CONTINUIDAD`, desde el 21/8).
   - Decidir si se purgan con `git filter-repo`.
   - Pedirles a Aris e Ivana que cambien su clave.
   - La rotación de la clave de YiQi no está autorizada por ahora.
6. Mover `dentalabs_Sup_KW.txt` fuera del repo; borrar `_to_delete*` y el `package-lock.json` de la raíz.
7. Capacitación de Ivana (criterio 7 del MVP).
8. Automatizar la regla "3 años sin movimiento" sobre `ultimo_movimiento_stock_yiqi`.

Fuera de la lista, sin cambios desde el 9/10: envío de OC por email (Resend). No fue pedido; no construir sin pedido. Pasar a Live (`escritura_yiqi_habilitada = true` + cron 6) **solo con autorización explícita de Federico**.

## ESPERA A OTRA PERSONA

| Qué | De quién | Desde |
|---|---|---|
| ¿La #21 (DENTAL MEDRANO, $10,5 M) fue prueba o compra real? Destraba la limpieza etapa 2 (borrado definitivo de #3–#11 con respaldo) | Aris | 23/10/2026 |
| Máximos y fraccionados: fórmula actual ("3 meses"), dónde debe vivir el mín/máx calculado (app o YiQi) y qué artículos entran | Ivana / Aris | 23/10/2026 |
| ¿Vacía la OC en YiQi también cuando se cancela un pedido? ¿Qué pasó con la 2700 (DROVER, vacía, sin asunto)? | Ivana | 23/10/2026 |
| Qué ve mal en "Detalle de una sola orden" (checklist, "A corregir") | Ivana | 23/10/2026 |
| ¿Las 8 causas declaradas entre el 22/8 y el 3/9 son reales o de prueba? ¿Revisa en YiQi los 4 movimientos de stock de septiembre (1437281, 1437282, 1438963, 1440204)? | Ivana | 23/10/2026 |
| Cargar "Días de entrega" en Condiciones comerciales (alimenta "Llega el") | Ivana / Aris | 23/10/2026 |
| Aprobar o rechazar la #14 (PESCIO) | Aris | 26/9/2026 |
| Prueba con su usuario: editar una orden suya esperando aprobación → vuelve a borrador. En el checklist marcó "Bien" el punto 14 [sin verificar que la haya probado con una orden suya] | Ivana | 3/10/2026 |
| Condiciones comerciales reales (hoy 31 de 104 cargadas) | Aris | 6/8/2026 |
| WhatsApp de pedidos de los proveedores reales | Aris / Ivana | 20/8/2026 |
| Que nadie edite las smarties "NO BORRAR" (o un usuario YiQi propio del sistema) | Aris | 31/7/2026 |
| ~~Respuestas al documento "Revisión para Ivana"~~ — respondido el 23/10 (`claude/FEEDBACK_IVANA_23-10-2026.md`) | Ivana | 7/10 → cerrado 23/10/2026 |
| ~~Aprobar o rechazar #18 y #12~~ — #18 rechazada y archivada por Aris (20/10); #12 a la papelera a pedido de Ivana (23/10) | Aris | cerrado 23/10/2026 |
| ~~Costo de 51006/51007 o rechazar la #2~~ — #2 a la papelera (limpieza etapa 1) | Aris / Ivana | cerrado 23/10/2026 |
| ~~Decisión sobre OC duplicadas en YiQi (orden #2)~~ — cerrado: no existen en YiQi (28/9) | Aris | 20/8/2026 → cerrado 18/10/2026 |
