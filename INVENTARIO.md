# Inventario — Dentalab-Compras · 2026-11-14
<!-- Generado por TulkasOS cada mañana. NO EDITAR: se sobreescribe. Para corregir algo, escribilo en el bloque "## Cierre AAAA-MM-DD" de CLAUDE.md (DESMENTIDO / VALIDADO EN VIVO / PENDIENTE) o marcalo desde TulkasOS. -->

**Avance: 98%** (ponderado: módulo ×3, sección ×2, resto ×1) · 39 ítems · 39 validados · 0 testeados · 0 construidos · 39 en producción (Vercel 3a66642) · 0 con evidencia rota
Cambios desde la auditoría anterior: +0 ~11 −0
Cobertura de lo cambiado desde d32eb33: 0/0 archivos de código caen bajo algún ítem · todo cubierto

Leyenda de estado: construido = el código existe · testeado = tests/verificación que corren · validado = probado en uso real o desplegado en producción con fecha · ✓prod = archivos del ítem en el commit desplegado · ⚠ = evidencia rota (cita rutas que no existen)

## Módulos
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `alertas` | Alertas de stock | validado (Federico) | 95 | ✓ | modificado | 1 |
| `app-deposito` | App de depósito | validado (Federico) | 100 | ✓ | sin cambios | — |
| `catalogo-causas` | Catálogo de causas | validado | 100 | ✓ | sin cambios | — |
| `comparacion-precios` | Comparación de precios entre proveedores | validado | 100 | ✓ | sin cambios | — |
| `historial-oc` | Historial de OC | validado | 100 | ✓ | sin cambios | — |
| `monitor-stock` | Monitor de stock | validado | 100 | ✓ | sin cambios | — |
| `nueva-oc` | Nueva OC | validado (Federico) | 95 | ✓ | modificado | 1 |
| `ordenes-compra` | Órdenes de compra | validado (Federico) | 100 | ✓ | sin cambios | — |
| `predictor-demanda` | Predictor de demanda | validado | 95 | ✓ | modificado | 1 |
| `proveedores` | Proveedores | validado | 95 | ✓ | modificado | 1 |
| `reglas-compra-aprobacion` | Reglas de compra y aprobación | validado | 100 | ✓ | sin cambios | — |
| `reposicion-central-local` | Reposición Central-Local (supervisión) | validado (Federico) | 100 | ✓ | sin cambios | — |
| `seguimiento-oc` | Seguimiento de OC | validado | 95 | ✓ | modificado | 1 |
| `usuarios-accesos` | Usuarios y accesos | validado (Federico) | 95 | ✓ | modificado | 1 |

## Secciones
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `ayuda` | Ayuda | validado | 95 | ✓ | modificado | 1 |
| `ayuda-deposito` | Ayuda de depósito | validado | 100 | ✓ | sin cambios | — |
| `condiciones-comerciales` | Condiciones comerciales | validado (Federico) | 95 | ✓ | sin cambios | 1 |
| `conector-yiqi` | Conector YiQi | validado | 95 | ✓ | sin cambios | 1 |
| `confirmar-recepcion` | Confirmar recepción | validado | 100 | ✓ | sin cambios | — |
| `datos-empresa` | Datos de la empresa | validado | 95 | ✓ | sin cambios | 1 |
| `declaraciones-causa` | Declaraciones de causa | validado | 100 | ✓ | sin cambios | — |
| `pedir-otro-deposito` | Pedir al otro depósito | validado | 100 | ✓ | sin cambios | — |
| `revisar-equivalencias` | Revisar equivalencias | validado (Federico) | 100 | ✓ | sin cambios | — |
| `solicitudes-preparar` | Solicitudes para preparar | validado | 100 | ✓ | sin cambios | — |
| `templates-mensajes` | Templates de mensajes | validado | 100 | ✓ | sin cambios | — |

## Herramientas
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `admin-usuarios-fn` | Administración de usuarios (Edge Function) | validado | 95 | ✓ | sin cambios | 1 |
| `composicion-articulos` | Composición de artículos fraccionados/combos | validado (Federico) | 90 | ✓ | modificado | 2 |
| `whatsapp-pedidos` | Envío de pedidos por WhatsApp | validado | 95 | ✓ | modificado | 1 |
| `escritura-yiqi` | Escritura en YiQi (OC y stock) | validado | 95 | ✓ | sin cambios | 1 |
| `exportar-excel` | Exportar a Excel | validado | 95 | ✓ | sin cambios | 1 |
| `maximos-calculados` | Máximo calculado por la app | validado (Federico) | 90 | ✓ | modificado | 2 |
| `modo-prueba-yiqi` | Modo prueba YiQi | validado | 100 | ✓ | sin cambios | — |
| `pdf-oc-remito` | PDF de OC y remito | validado | 100 | ✓ | sin cambios | — |
| `reposicion-interna-automatica` | Reposición interna Central-Local automática | validado | 100 | ✓ | sin cambios | — |
| `sync-yiqi` | Sync espejo de YiQi | validado | 100 | ✓ | sin cambios | — |

## Integraciones
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `yiqi-erp` | Integración YiQi (ERP) | validado | 90 | ✓ | sin cambios | 2 |

## Entorno
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `vercel-deploy` | Deploy automático en Vercel | validado | 100 | ✓ | sin cambios | — |
| `supabase-infra` | Infraestructura Supabase | validado | 100 | ✓ | modificado | — |
| `login-permisos` | Login con roles y permisos | validado | 95 | ✓ | sin cambios | 1 |

## Pendientes por ítem
- `login-permisos` — pendiente heredado sin detalle
- `admin-usuarios-fn` — deployar la función a producción (0,1h, Federico)
- `composicion-articulos` — confirmar con Ivana 9150-F y 31822-F (posible error de código); confirmar con Ivana 6067-F (50 pares) y 61322-F (24 láminas)
- `whatsapp-pedidos` — WhatsApp de pedidos de los proveedores reales
- `escritura-yiqi` — pasar a Live solo con autorización explícita de Federico
- `exportar-excel` — vulnerabilidad alta en xlsx sin fix disponible en npm
- `maximos-calculados` — decidir 1 vs 2 meses de cobertura (Aris); revisar criterio de pico, marca 29% de los SKU
- `yiqi-erp` — comentario desactualizado de smartieIds en yiqi-connector/index.ts:65-67; decidir si 'Verificar ahora' se restringe a admin
- `alertas` — 4 conteos distintos de alertas sin unificar (menú/página/Nueva OC/Proveedores)
- `nueva-oc` — cantidad sugerida no respeta el máximo calculado (ej. PESCIO 69611: stock 33, máx. 25, sugiere 25)
- `predictor-demanda` — SKU 887 y 888 (nombre vacío) sin resolver si son administrativos
- `proveedores` — condiciones comerciales reales: 31 de 104 cargadas
- `seguimiento-oc` — aclarar con Ivana qué significa el asunto 'Revisión - enviado'
- `usuarios-accesos` — deployar admin-usuarios a producción (columna Rol)
- `ayuda` — línea 823: limitación condicional coherente con el resto, no es contradicción real
- `condiciones-comerciales` — condiciones comerciales reales: 31 de 104 cargadas
- `conector-yiqi` — decidir si 'Verificar ahora' se restringe a admin
- `datos-empresa` — datos reales de la empresa pendientes

## Eliminados en los últimos 7 días
(ninguno)

## Cómo se actualiza
Fuente: código y commits del repo + CLAUDE.md. Cada mañana a las 9 el Auditor de TulkasOS reescribe este archivo. Lo que vos sepas y el código no muestre (probado en producción, decisión tomada, algo que ya no aplica) va en `## Cierre AAAA-MM-DD` al final de CLAUDE.md usando estas claves, o se marca con `validar_item_inventario` desde Claude Desktop.
