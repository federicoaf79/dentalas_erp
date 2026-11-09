# Inventario — Dentalab-Compras · 2026-11-09
<!-- Generado por TulkasOS cada mañana. NO EDITAR: se sobreescribe. Para corregir algo, escribilo en el bloque "## Cierre AAAA-MM-DD" de CLAUDE.md (DESMENTIDO / VALIDADO EN VIVO / PENDIENTE) o marcalo desde TulkasOS. -->

**Avance: 68%** (ponderado: módulo ×3, sección ×2, resto ×1) · 39 ítems · 16 validados · 0 testeados · 23 construidos · 39 en producción (Vercel 4f12909) · 0 con evidencia rota
Cambios desde la auditoría anterior: +0 ~5 −0
Cobertura de lo cambiado desde 9ca9ad7: 0/0 archivos de código caen bajo algún ítem · todo cubierto

Leyenda de estado: construido = el código existe · testeado = tests/verificación que corren · validado = probado en uso real o desplegado en producción con fecha · ✓prod = archivos del ítem en el commit desplegado · ⚠ = evidencia rota (cita rutas que no existen)

## Módulos
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `alertas` | Alertas de stock | validado | 95 | ✓ | sin cambios | 1 |
| `app-deposito` | App de Depósito | construido | 50 | ✓ | sin cambios | — |
| `catalogo-causas` | Catálogo de causas | construido | 50 | ✓ | sin cambios | — |
| `comparacion-precios` | Comparación de precios | construido | 50 | ✓ | sin cambios | — |
| `historial-oc` | Historial de OC | validado | 100 | ✓ | sin cambios | — |
| `monitor-stock` | Monitor de stock | validado | 100 | ✓ | sin cambios | — |
| `nueva-oc` | Nueva OC | validado | 100 | ✓ | sin cambios | — |
| `ordenes-compra` | Órdenes de compra / aprobación | validado | 95 | ✓ | sin cambios | 1 |
| `predictor-demanda` | Predictor de demanda | construido | 50 | ✓ | sin cambios | — |
| `proveedores` | Proveedores | construido | 45 | ✓ | sin cambios | 1 |
| `reglas-compra-aprobacion` | Reglas de compra y aprobación | construido | 50 | ✓ | sin cambios | — |
| `reposicion-central-local` | Reposición Central-Local | validado | 100 | ✓ | sin cambios | — |
| `seguimiento-oc` | Seguimiento de OC | validado | 100 | ✓ | sin cambios | — |
| `usuarios-accesos` | Usuarios y accesos | construido | 50 | ✓ | modificado | — |

## Secciones
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `ayuda` | Ayuda (Compras/Stock) | construido | 45 | ✓ | sin cambios | 1 |
| `ayuda-deposito` | Ayuda (Depósito) | construido | 50 | ✓ | sin cambios | — |
| `condiciones-comerciales` | Condiciones comerciales | construido | 40 | ✓ | sin cambios | 2 |
| `confirmar-recepcion` | Confirmar recepción (Depósito) | construido | 50 | ✓ | sin cambios | — |
| `datos-empresa` | Datos de la empresa | construido | 45 | ✓ | sin cambios | 1 |
| `declaraciones-causa` | Declaración de causas | construido | 50 | ✓ | sin cambios | — |
| `conector-yiqi` | Pantalla Conector YiQi | validado | 100 | ✓ | sin cambios | — |
| `pedir-otro-deposito` | Pedir al otro depósito | construido | 50 | ✓ | sin cambios | — |
| `revisar-equivalencias` | Revisar equivalencias | construido | 50 | ✓ | sin cambios | — |
| `solicitudes-preparar` | Solicitudes para preparar (Depósito) | construido | 50 | ✓ | sin cambios | — |
| `templates-mensajes` | Templates de mensajes | construido | 50 | ✓ | sin cambios | — |

## Herramientas
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `admin-usuarios-fn` | Administración de usuarios | construido | 50 | ✓ | sin cambios | — |
| `composicion-articulos` | Composición de artículos | construido | 50 | ✓ | modificado | — |
| `whatsapp-pedidos` | Envío de OC por WhatsApp | construido | 45 | ✓ | sin cambios | 1 |
| `escritura-yiqi` | Escritura en YiQi | validado | 95 | ✓ | sin cambios | 1 |
| `exportar-excel` | Exportación a Excel | construido | 45 | ✓ | modificado | 1 |
| `modo-prueba-yiqi` | Interruptor de modo prueba YiQi | validado | 100 | ✓ | sin cambios | — |
| `maximos-calculados` | Máximos calculados | validado | 90 | ✓ | modificado | 2 |
| `pdf-oc-remito` | PDF de OC y remito | construido | 50 | ✓ | sin cambios | — |
| `reposicion-interna-automatica` | Reposición interna automática | construido | 50 | ✓ | modificado | — |
| `sync-yiqi` | Sync espejo YiQi | validado | 100 | ✓ | sin cambios | — |

## Integraciones
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `yiqi-erp` | Conector YiQi | validado | 95 | ✓ | sin cambios | 1 |

## Entorno
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `vercel-deploy` | Deploy Vercel | validado | 100 | ✓ | sin cambios | — |
| `supabase-infra` | Infraestructura Supabase | validado | 100 | ✓ | sin cambios | — |
| `login-permisos` | Login y permisos | validado | 95 | ✓ | sin cambios | 1 |

## Pendientes por ítem
- `login-permisos` — Verificar Fase B (RLS) en vivo, logueado como Ivana en /login
- `whatsapp-pedidos` — WhatsApp de pedidos de los proveedores reales (Aris/Ivana)
- `escritura-yiqi` — Resolver la contradicción del envío automático a YiQi al aprobar; pasar a Live solo con autorización explícita de Federico
- `exportar-excel` — xlsx sin arreglo en npm (vulnerabilidad alta sin fix disponible)
- `maximos-calculados` — Definir con Aris qué SKU llevan 2 meses de cobertura (K-tex, Totalcaína); Revisar criterio de pico (marca ~29% de los SKU)
- `yiqi-erp` — Purgar el historial de yiqi-renovar-token.ps1 (commit 03b6288) y decidir rotación de la clave de YiQi
- `alertas` — Automatizar la regla de 3 años sin movimiento sobre ultimo_movimiento_stock_yiqi
- `ordenes-compra` — Aprobar o rechazar OC #18, #14 y #12
- `proveedores` — Condiciones comerciales reales (hoy 31 de 104 proveedores cargados)
- `ayuda` — Respuestas al documento 'Revisión para Ivana' (8 preguntas + checklist 19 puntos)
- `condiciones-comerciales` — Condiciones comerciales reales (31 de 104 cargadas); Cargar 'Días de entrega' por proveedor (alimenta 'Llega el')
- `datos-empresa` — Datos reales de la empresa (membrete del PDF)

## Eliminados en los últimos 7 días
(ninguno)

## Cómo se actualiza
Fuente: código y commits del repo + CLAUDE.md. Cada mañana a las 9 el Auditor de TulkasOS reescribe este archivo. Lo que vos sepas y el código no muestre (probado en producción, decisión tomada, algo que ya no aplica) va en `## Cierre AAAA-MM-DD` al final de CLAUDE.md usando estas claves, o se marca con `validar_item_inventario` desde Claude Desktop.
