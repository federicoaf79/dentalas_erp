# Inventario — Dentalab-Compras · 2026-11-15
<!-- Generado por TulkasOS cada mañana. NO EDITAR: se sobreescribe. Para corregir algo, escribilo en el bloque "## Cierre AAAA-MM-DD" de CLAUDE.md (DESMENTIDO / VALIDADO EN VIVO / PENDIENTE) o marcalo desde TulkasOS. -->

**Avance: 98%** (ponderado: módulo ×3, sección ×2, resto ×1) · 39 ítems · 39 validados · 0 testeados · 0 construidos · 39 en producción (Vercel b27df45) · 0 con evidencia rota
Cambios desde la auditoría anterior: +0 ~21 −0
Cobertura de lo cambiado desde 63643d7: 7/9 archivos de código caen bajo algún ítem · **2 sin ítem** (ver abajo)

Leyenda de estado: construido = el código existe · testeado = tests/verificación que corren · validado = probado en uso real o desplegado en producción con fecha · ✓prod = archivos del ítem en el commit desplegado · ⚠ = evidencia rota (cita rutas que no existen)

## Módulos
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `alertas` | Alertas de stock | validado (Federico) | 95 | ✓ | modificado | 1 |
| `app-deposito` | App de depósito | validado (Federico) | 100 | ✓ | sin cambios | — |
| `catalogo-causas` | Catálogo de causas | validado | 100 | ✓ | sin cambios | — |
| `comparacion-precios` | Comparación de precios | validado | 100 | ✓ | sin cambios | — |
| `historial-oc` | Historial de OC | validado | 95 | ✓ | modificado | 1 |
| `monitor-stock` | Monitor de stock | validado | 100 | ✓ | sin cambios | — |
| `nueva-oc` | Nueva OC | validado (Federico) | 95 | ✓ | modificado | 1 |
| `ordenes-compra` | Órdenes de compra | validado (Federico) | 95 | ✓ | modificado | 1 |
| `predictor-demanda` | Predictor de demanda | validado | 95 | ✓ | modificado | 1 |
| `proveedores` | Proveedores | validado | 95 | ✓ | modificado | 1 |
| `reglas-compra-aprobacion` | Reglas de compra y aprobación | validado | 100 | ✓ | sin cambios | — |
| `reposicion-central-local` | Reposición Central-Local | validado (Federico) | 100 | ✓ | sin cambios | — |
| `seguimiento-oc` | Seguimiento de OC | validado (Federico) | 100 | ✓ | modificado | — |
| `usuarios-accesos` | Usuarios y accesos | validado (Federico) | 95 | ✓ | modificado | 1 |

## Secciones
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `ayuda` | Ayuda | validado (Federico) | 100 | ✓ | modificado | — |
| `ayuda-deposito` | Ayuda de depósito | validado | 100 | ✓ | sin cambios | — |
| `condiciones-comerciales` | Condiciones comerciales | validado (Federico) | 95 | ✓ | modificado | 1 |
| `conector-yiqi` | Conector YiQi | validado | 95 | ✓ | modificado | 1 |
| `confirmar-recepcion` | Confirmar recepción | validado | 100 | ✓ | sin cambios | — |
| `datos-empresa` | Datos de la empresa | validado | 95 | ✓ | modificado | 1 |
| `declaraciones-causa` | Declaraciones de causa | validado | 100 | ✓ | sin cambios | — |
| `pedir-otro-deposito` | Pedir al otro depósito | validado | 100 | ✓ | sin cambios | — |
| `revisar-equivalencias` | Revisar equivalencias | validado (Federico) | 100 | ✓ | sin cambios | — |
| `solicitudes-preparar` | Solicitudes para preparar | validado | 100 | ✓ | sin cambios | — |
| `templates-mensajes` | Templates de mensajes | validado | 100 | ✓ | sin cambios | — |

## Herramientas
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `admin-usuarios-fn` | Admin de usuarios (Edge Function) | validado | 95 | ✓ | modificado | 1 |
| `composicion-articulos` | Composición de artículos fraccionados/combos | validado (Federico) | 95 | ✓ | modificado | 1 |
| `escritura-yiqi` | Escritura en YiQi (OC/stock) | validado | 95 | ✓ | modificado | 1 |
| `exportar-excel` | Exportar a Excel | validado | 95 | ✓ | modificado | 1 |
| `maximos-calculados` | Máximos calculados | validado (Federico) | 90 | ✓ | modificado | 2 |
| `modo-prueba-yiqi` | Modo prueba YiQi | validado | 100 | ✓ | sin cambios | — |
| `whatsapp-pedidos` | PDF de OC + envío WhatsApp | validado | 95 | ✓ | modificado | 1 |
| `pdf-oc-remito` | PDF de OC y remito | validado | 100 | ✓ | sin cambios | — |
| `reposicion-interna-automatica` | Reposición interna automática | validado | 100 | ✓ | sin cambios | — |
| `sync-yiqi` | Sync espejo de YiQi | validado | 100 | ✓ | sin cambios | — |

## Integraciones
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `yiqi-erp` | Integración YiQi (ERP) | validado | 90 | ✓ | modificado | 2 |

## Entorno
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `vercel-deploy` | Deploy en Vercel | validado | 100 | ✓ | sin cambios | — |
| `supabase-infra` | Infraestructura Supabase | validado | 100 | ✓ | modificado | — |
| `login-permisos` | Login y permisos | validado | 95 | ✓ | modificado | 1 |

## Pendientes por ítem
- `login-permisos` — pendiente previo no especificado en este ciclo
- `admin-usuarios-fn` — deployar la función con columna Rol
- `composicion-articulos` — planilla de fraccionados completa (pendiente de Ivana/Federico)
- `escritura-yiqi` — resolver pase a Live (autorización de Federico)
- `exportar-excel` — vulnerabilidad alta en xlsx sin fix upstream
- `maximos-calculados` — 1 vs 2 meses de cobertura (Aris); criterio de pico demasiado sensible
- `whatsapp-pedidos` — WhatsApp con proveedores reales
- `yiqi-erp` — comentario desactualizado de smartieId; colisión de renovación a las 06:00 UTC (aceptado)
- `alertas` — verificar campos de punto de pedido con Aris/Vanig
- `historial-oc` — tono gris de la pastilla 'En revisión' (bug medio, HistorialOC.jsx:96,508)
- `nueva-oc` — sugerencia no respeta el máximo calculado
- `ordenes-compra` — tono gris de la pastilla 'En revisión' (bug medio, OrdenesCompra.jsx:155,342)
- `predictor-demanda` — SKU 887/888 sin clasificar como administrativo
- `proveedores` — condiciones comerciales reales (31 de 104)
- `usuarios-accesos` — deployar admin-usuarios con columna Rol
- `condiciones-comerciales` — días de entrega reales para todos los proveedores
- `conector-yiqi` — restringir 'Verificar ahora' a admin
- `datos-empresa` — datos reales de la empresa

## Eliminados en los últimos 7 días
(ninguno)

## Código cambiado sin ítem que lo cubra
Archivos modificados desde la auditoría 63643d7 que no caen bajo la ubicación de ningún ítem. Si es algo nuevo, falta inventariarlo; si es parte de un ítem, falta ampliar su ubicación.
- `frontend/src/lib/estadoOCPorSku.js`
- `frontend/src/lib/estados.js`

## Cómo se actualiza
Fuente: código y commits del repo + CLAUDE.md. Cada mañana a las 9 el Auditor de TulkasOS reescribe este archivo. Lo que vos sepas y el código no muestre (probado en producción, decisión tomada, algo que ya no aplica) va en `## Cierre AAAA-MM-DD` al final de CLAUDE.md usando estas claves, o se marca con `validar_item_inventario` desde Claude Desktop.
