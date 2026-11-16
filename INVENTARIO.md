# Inventario — Dentalab-Compras · 2026-11-16
<!-- Generado por TulkasOS cada mañana. NO EDITAR: se sobreescribe. Para corregir algo, escribilo en el bloque "## Cierre AAAA-MM-DD" de CLAUDE.md (DESMENTIDO / VALIDADO EN VIVO / PENDIENTE) o marcalo desde TulkasOS. -->

**Avance: 67%** (ponderado: módulo ×3, sección ×2, resto ×1) · 39 ítems · 13 validados · 0 testeados · 26 construidos · 0 en producción (Vercel b27df45) · 0 con evidencia rota
Cambios desde la auditoría anterior: +0 ~29 −0
Cobertura de lo cambiado desde b27df45: 0/0 archivos de código caen bajo algún ítem · todo cubierto

Leyenda de estado: construido = el código existe · testeado = tests/verificación que corren · validado = probado en uso real o desplegado en producción con fecha · ✓prod = archivos del ítem en el commit desplegado · ⚠ = evidencia rota (cita rutas que no existen)

## Módulos
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `alertas` | Alertas de stock | validado (Federico) | 95 | — | modificado | 1 |
| `app-deposito` | App de depósito | validado (Federico) | 100 | — | sin cambios | — |
| `catalogo-causas` | Catálogo de causas | construido | 50 | — | modificado | — |
| `comparacion-precios` | Comparación de precios | construido | 50 | — | modificado | — |
| `historial-oc` | Historial de OC | construido | 45 | — | modificado | 1 |
| `monitor-stock` | Monitor de stock | construido | 50 | — | modificado | — |
| `nueva-oc` | Nueva OC | validado (Federico) | 95 | — | sin cambios | 1 |
| `ordenes-compra` | Órdenes de compra | validado (Federico) | 95 | — | modificado | 1 |
| `predictor-demanda` | Predictor de demanda | construido | 45 | — | modificado | 1 |
| `proveedores` | Proveedores | construido | 45 | — | modificado | 1 |
| `reglas-compra-aprobacion` | Reglas de compra y aprobación | construido | 50 | — | modificado | — |
| `reposicion-central-local` | Reposición Central-Local | validado (Federico) | 100 | — | sin cambios | — |
| `seguimiento-oc` | Seguimiento de OC | validado (Federico) | 100 | — | modificado | — |
| `usuarios-accesos` | Usuarios y accesos | validado (Federico) | 95 | — | sin cambios | 1 |

## Secciones
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `ayuda` | Ayuda | validado (Federico) | 100 | — | sin cambios | — |
| `ayuda-deposito` | Ayuda de depósito | construido | 50 | — | modificado | — |
| `condiciones-comerciales` | Condiciones comerciales | validado (Federico) | 95 | — | sin cambios | 1 |
| `conector-yiqi` | Conector YiQi | construido | 45 | — | modificado | 1 |
| `confirmar-recepcion` | Confirmar recepción | construido | 50 | — | modificado | — |
| `datos-empresa` | Datos de la empresa | construido | 45 | — | modificado | 1 |
| `declaraciones-causa` | Declaraciones de causa | construido | 50 | — | modificado | — |
| `pedir-otro-deposito` | Pedir al otro depósito | construido | 50 | — | modificado | — |
| `revisar-equivalencias` | Revisar equivalencias | validado (Federico) | 100 | — | sin cambios | — |
| `solicitudes-preparar` | Solicitudes para preparar | construido | 50 | — | modificado | — |
| `templates-mensajes` | Templates de mensajes | construido | 50 | — | modificado | — |

## Herramientas
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `admin-usuarios-fn` | Admin de usuarios (Edge Function) | construido | 45 | — | modificado | 1 |
| `composicion-articulos` | Composición de artículos fraccionados/combos | validado (Federico) | 95 | — | sin cambios | 1 |
| `escritura-yiqi` | Escritura en YiQi (OC/stock) | validado | 95 | — | sin cambios | 1 |
| `exportar-excel` | Exportar a Excel | construido | 45 | — | modificado | 1 |
| `maximos-calculados` | Máximos calculados | validado (Federico) | 90 | — | sin cambios | 2 |
| `modo-prueba-yiqi` | Modo prueba YiQi | construido | 50 | — | modificado | — |
| `whatsapp-pedidos` | PDF de OC + envío WhatsApp | construido | 45 | — | modificado | 1 |
| `pdf-oc-remito` | PDF de OC y remito | construido | 50 | — | modificado | — |
| `reposicion-interna-automatica` | Reposición interna automática | construido | 50 | — | modificado | — |
| `sync-yiqi` | Sync espejo de YiQi | construido | 50 | — | modificado | — |

## Integraciones
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `yiqi-erp` | Integración YiQi (ERP) | construido | 40 | — | modificado | 2 |

## Entorno
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `vercel-deploy` | Deploy en Vercel | construido | 50 | — | modificado | — |
| `supabase-infra` | Infraestructura Supabase | construido | 50 | — | modificado | — |
| `login-permisos` | Login y permisos | construido | 45 | — | modificado | 1 |

## Pendientes por ítem
- `login-permisos` — pendiente previo no especificado
- `admin-usuarios-fn` — deployar la función con columna Rol
- `composicion-articulos` — planilla de fraccionados completa (pendiente de Ivana/Federico)
- `escritura-yiqi` — resolver pase a Live (autorización de Federico)
- `exportar-excel` — vulnerabilidad alta en xlsx sin fix upstream
- `maximos-calculados` — 1 vs 2 meses de cobertura (Aris); criterio de pico demasiado sensible
- `whatsapp-pedidos` — WhatsApp con proveedores reales
- `yiqi-erp` — comentario de smartieId desactualizado en yiqi-connector/index.ts:66-68; colisión de renovación de token a las 06:00 UTC (aceptada)
- `alertas` — verificar campos de punto de pedido con Aris/Vanig
- `historial-oc` — pastilla 'En revisión' sale gris en vez de azul, HistorialOC.jsx:97
- `nueva-oc` — sugerencia no respeta el máximo calculado
- `ordenes-compra` — pastilla 'En revisión' sale gris en vez de azul, OrdenesCompra.jsx:155
- `predictor-demanda` — SKU 887/888 sin clasificar como administrativo
- `proveedores` — condiciones comerciales reales (31 de 104)
- `usuarios-accesos` — deployar admin-usuarios con columna Rol
- `condiciones-comerciales` — días de entrega reales para todos los proveedores
- `conector-yiqi` — restringir 'Verificar ahora' a admin
- `datos-empresa` — datos reales de la empresa

## Eliminados en los últimos 7 días
(ninguno)

## Cómo se actualiza
Fuente: código y commits del repo + CLAUDE.md. Cada mañana a las 9 el Auditor de TulkasOS reescribe este archivo. Lo que vos sepas y el código no muestre (probado en producción, decisión tomada, algo que ya no aplica) va en `## Cierre AAAA-MM-DD` al final de CLAUDE.md usando estas claves, o se marca con `validar_item_inventario` desde Claude Desktop.
