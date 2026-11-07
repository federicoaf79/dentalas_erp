# Inventario — Dentalab-Compras · 2026-11-07
<!-- Generado por TulkasOS cada mañana. NO EDITAR: se sobreescribe. Para corregir algo, escribilo en el bloque "## Cierre AAAA-MM-DD" de CLAUDE.md (DESMENTIDO / VALIDADO EN VIVO / PENDIENTE) o marcalo desde TulkasOS. -->

**Avance: 68%** (ponderado: módulo ×3, sección ×2, resto ×1) · 39 ítems · 16 validados · 0 testeados · 23 construidos · 39 en producción (Vercel 4f12909) · 0 con evidencia rota
Cambios desde la auditoría anterior: +0 ~13 −0

Leyenda de estado: construido = el código existe · testeado = tests/verificación que corren · validado = probado en uso real o desplegado en producción con fecha · ✓prod = archivos del ítem en el commit desplegado · ⚠ = evidencia rota (cita rutas que no existen)

## Módulos
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `alertas` | Alertas de stock | validado | 95 | ✓ | modificado | 1 |
| `app-deposito` | App de Depósito | construido | 50 | ✓ | sin cambios | — |
| `catalogo-causas` | Catálogo de causas | construido | 50 | ✓ | sin cambios | — |
| `comparacion-precios` | Comparación de precios | construido | 50 | ✓ | sin cambios | — |
| `historial-oc` | Historial de OC | validado | 100 | ✓ | sin cambios | — |
| `monitor-stock` | Monitor de stock | validado | 100 | ✓ | sin cambios | — |
| `nueva-oc` | Nueva OC | validado | 100 | ✓ | sin cambios | — |
| `ordenes-compra` | Órdenes de compra | validado | 95 | ✓ | modificado | 1 |
| `predictor-demanda` | Predictor de demanda | construido | 50 | ✓ | sin cambios | — |
| `proveedores` | Proveedores | construido | 45 | ✓ | modificado | 1 |
| `reglas-compra-aprobacion` | Reglas de compra y aprobación | construido | 50 | ✓ | sin cambios | — |
| `reposicion-central-local` | Reposición Central-Local | validado | 100 | ✓ | sin cambios | — |
| `seguimiento-oc` | Seguimiento de OC | validado | 100 | ✓ | sin cambios | — |
| `usuarios-accesos` | Usuarios y accesos | construido | 45 | ✓ | modificado | 1 |

## Secciones
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `ayuda` | Ayuda | construido | 45 | ✓ | modificado | 1 |
| `ayuda-deposito` | Ayuda Depósito | construido | 50 | ✓ | sin cambios | — |
| `condiciones-comerciales` | Condiciones comerciales | construido | 40 | ✓ | modificado | 2 |
| `conector-yiqi` | Conector YiQi (pantalla) | validado | 100 | ✓ | sin cambios | — |
| `confirmar-recepcion` | Confirmar recepción | construido | 50 | ✓ | sin cambios | — |
| `datos-empresa` | Datos de la empresa | construido | 45 | ✓ | modificado | 1 |
| `declaraciones-causa` | Declaraciones de causa | construido | 50 | ✓ | sin cambios | — |
| `pedir-otro-deposito` | Pedir al otro depósito | construido | 50 | ✓ | sin cambios | — |
| `revisar-equivalencias` | Revisar equivalencias | construido | 50 | ✓ | sin cambios | — |
| `solicitudes-preparar` | Solicitudes para preparar | construido | 50 | ✓ | sin cambios | — |
| `templates-mensajes` | Templates de mensajes | construido | 50 | ✓ | sin cambios | — |

## Herramientas
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `composicion-articulos` | Composición de artículos | construido | 50 | ✓ | sin cambios | — |
| `whatsapp-pedidos` | Envío de OC por WhatsApp | construido | 45 | ✓ | modificado | 1 |
| `escritura-yiqi` | Escritura en YiQi | validado | 95 | ✓ | modificado | 1 |
| `exportar-excel` | Exportar a Excel | construido | 45 | ✓ | modificado | 1 |
| `admin-usuarios-fn` | Función admin de usuarios | construido | 50 | ✓ | sin cambios | — |
| `maximos-calculados` | Máximos calculados por la app | validado | 90 | ✓ | modificado | 2 |
| `modo-prueba-yiqi` | Modo prueba YiQi | validado | 100 | ✓ | sin cambios | — |
| `pdf-oc-remito` | PDF de OC y remito | construido | 50 | ✓ | sin cambios | — |
| `reposicion-interna-automatica` | Reposición interna automática | construido | 50 | ✓ | sin cambios | — |
| `sync-yiqi` | Sync espejo YiQi | validado | 100 | ✓ | sin cambios | — |

## Integraciones
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `yiqi-erp` | Integración YiQi | validado | 95 | ✓ | modificado | 1 |

## Entorno
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `vercel-deploy` | Deploy Vercel | validado | 100 | ✓ | sin cambios | — |
| `supabase-infra` | Infraestructura Supabase | validado | 100 | ✓ | sin cambios | — |
| `login-permisos` | Login y permisos | validado | 95 | ✓ | modificado | 1 |

## Pendientes por ítem
- `login-permisos` — verificar Fase B (RLS) en vivo logueado como Ivana
- `whatsapp-pedidos` — WhatsApp de pedidos de los proveedores reales (Aris/Ivana)
- `escritura-yiqi` — pasar a Live requiere autorización explícita de Federico (hoy en modo prueba)
- `exportar-excel` — vulnerabilidad xlsx sin fix en npm (solo escribe, no lee archivos ajenos)
- `maximos-calculados` — revisar criterio de pico (marca 29% de los SKU); definir con Aris qué SKU llevan 2 meses de cobertura en vez de 1
- `yiqi-erp` — purgar historial de credencial (commit 03b6288)
- `alertas` — automatizar regla 3 años sin movimiento sobre ultimo_movimiento_stock_yiqi
- `ordenes-compra` — aprobar o rechazar OC #18, #14, #12
- `proveedores` — condiciones comerciales reales (31 de 104 cargadas)
- `usuarios-accesos` — borrar cartel falso y agregar gate de esAdmin
- `ayuda` — capacitación de Ivana (criterio 7 del MVP)
- `condiciones-comerciales` — condiciones comerciales reales (31/104); cargar días de entrega
- `datos-empresa` — datos reales de la empresa (membrete del PDF)

## Eliminados en los últimos 7 días
(ninguno)

## Cómo se actualiza
Fuente: código y commits del repo + CLAUDE.md. Cada mañana a las 9 el Auditor de TulkasOS reescribe este archivo. Lo que vos sepas y el código no muestre (probado en producción, decisión tomada, algo que ya no aplica) va en `## Cierre AAAA-MM-DD` al final de CLAUDE.md usando estas claves, o se marca con `validar_item_inventario` desde Claude Desktop.
