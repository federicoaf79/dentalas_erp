# Inventario — Dentalab-Compras · 2026-11-06
<!-- Generado por TulkasOS cada mañana. NO EDITAR: se sobreescribe. Para corregir algo, escribilo en el bloque "## Cierre AAAA-MM-DD" de CLAUDE.md (DESMENTIDO / VALIDADO EN VIVO / PENDIENTE) o marcalo desde TulkasOS. -->

**Avance: 69%** (ponderado: módulo ×3, sección ×2, resto ×1) · 39 ítems · 16 validados · 0 testeados · 23 construidos · 39 en producción (Vercel 4f12909) · 0 con evidencia rota
Cambios desde la auditoría anterior: +0 ~5 −0

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
| `nueva-oc` | Nueva orden de compra | validado | 100 | ✓ | sin cambios | — |
| `ordenes-compra` | Órdenes de compra / aprobación | validado | 100 | ✓ | sin cambios | — |
| `predictor-demanda` | Predictor de demanda | construido | 50 | ✓ | sin cambios | — |
| `proveedores` | Proveedores | construido | 45 | ✓ | sin cambios | 1 |
| `reglas-compra-aprobacion` | Reglas de compra y aprobación | construido | 50 | ✓ | sin cambios | — |
| `reposicion-central-local` | Reposición Central-Local | validado | 100 | ✓ | sin cambios | — |
| `seguimiento-oc` | Seguimiento de OC | validado | 100 | ✓ | sin cambios | — |
| `usuarios-accesos` | Usuarios y accesos | construido | 50 | ✓ | sin cambios | — |

## Secciones
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `ayuda` | Ayuda (Compras/Stock) | construido | 45 | ✓ | sin cambios | 1 |
| `ayuda-deposito` | Ayuda (Depósito) | construido | 50 | ✓ | sin cambios | — |
| `condiciones-comerciales` | Condiciones comerciales | construido | 40 | ✓ | modificado | 2 |
| `confirmar-recepcion` | Confirmar recepción (Depósito) | construido | 50 | ✓ | sin cambios | — |
| `datos-empresa` | Datos de la empresa | construido | 45 | ✓ | modificado | 1 |
| `declaraciones-causa` | Declaraciones de causa | construido | 50 | ✓ | sin cambios | — |
| `conector-yiqi` | Pantalla Conector YiQi | validado | 100 | ✓ | sin cambios | — |
| `pedir-otro-deposito` | Pedir al otro depósito | construido | 50 | ✓ | sin cambios | — |
| `revisar-equivalencias` | Revisar equivalencias | construido | 50 | ✓ | sin cambios | — |
| `solicitudes-preparar` | Solicitudes para preparar (Depósito) | construido | 50 | ✓ | sin cambios | — |
| `templates-mensajes` | Templates de mensajes | construido | 50 | ✓ | sin cambios | — |

## Herramientas
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `composicion-articulos` | Composición de artículos | construido | 50 | ✓ | sin cambios | — |
| `admin-usuarios-fn` | Edge Function admin-usuarios | construido | 50 | ✓ | sin cambios | — |
| `whatsapp-pedidos` | Envío de OC por WhatsApp | construido | 45 | ✓ | sin cambios | 1 |
| `escritura-yiqi` | Escritura en YiQi (OC/stock) | validado | 95 | ✓ | modificado | 1 |
| `exportar-excel` | Exportar a Excel | construido | 45 | ✓ | sin cambios | 1 |
| `modo-prueba-yiqi` | Interruptor modo prueba YiQi | validado | 100 | ✓ | sin cambios | — |
| `maximos-calculados` | Máximos calculados por la app | validado | 90 | ✓ | modificado | 2 |
| `pdf-oc-remito` | PDF de OC y remito | construido | 50 | ✓ | sin cambios | — |
| `reposicion-interna-automatica` | Reposición interna automática | construido | 50 | ✓ | sin cambios | — |
| `sync-yiqi` | Sync espejo de YiQi | validado | 100 | ✓ | sin cambios | — |

## Integraciones
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `yiqi-erp` | Conector genérico YiQi | validado | 95 | ✓ | modificado | 1 |

## Entorno
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `vercel-deploy` | Deploy en Vercel | validado | 100 | ✓ | sin cambios | — |
| `supabase-infra` | Infraestructura Supabase | validado | 100 | ✓ | sin cambios | — |
| `login-permisos` | Login con roles y permisos | validado | 95 | ✓ | sin cambios | 1 |

## Pendientes por ítem
- `login-permisos` — no re-verificado en vivo este ciclo
- `whatsapp-pedidos` — validar con proveedores reales
- `escritura-yiqi` — autorización explícita de Federico para pasar a Live
- `exportar-excel` — xlsx tiene 1 vulnerabilidad alta sin fix en npm (la app solo escribe, no lee archivos ajenos)
- `maximos-calculados` — Aris define qué SKU llevan 2 meses de cobertura en vez de 1 (K-tex, Totalcaína); revisar criterio de pico: marca ~29% de los SKU, posiblemente muy sensible con volúmenes bajos
- `yiqi-erp` — comentario de smartieId desactualizado en index.ts:65-68 (dice 2340/2341/2343, los reales son 2344/2345/2346)
- `alertas` — no se tomó el número de críticas/preventivas antes del cambio del 23/10 para comparar
- `proveedores` — condiciones comerciales reales: 31 de 104 proveedores cargados
- `ayuda` — mantener al día con cada feature nueva
- `condiciones-comerciales` — cargar días de entrega reales (alimenta 'Llega el'); 31 de 104 proveedores con condiciones cargadas
- `datos-empresa` — cargar datos reales para el membrete del PDF

## Eliminados en los últimos 7 días
(ninguno)

## Cómo se actualiza
Fuente: código y commits del repo + CLAUDE.md. Cada mañana a las 9 el Auditor de TulkasOS reescribe este archivo. Lo que vos sepas y el código no muestre (probado en producción, decisión tomada, algo que ya no aplica) va en `## Cierre AAAA-MM-DD` al final de CLAUDE.md usando estas claves, o se marca con `validar_item_inventario` desde Claude Desktop.
