# Inventario — Dentalab-Compras · 2026-11-10
<!-- Generado por TulkasOS cada mañana. NO EDITAR: se sobreescribe. Para corregir algo, escribilo en el bloque "## Cierre AAAA-MM-DD" de CLAUDE.md (DESMENTIDO / VALIDADO EN VIVO / PENDIENTE) o marcalo desde TulkasOS. -->

**Avance: 98%** (ponderado: módulo ×3, sección ×2, resto ×1) · 39 ítems · 39 validados · 0 testeados · 0 construidos · 39 en producción (Vercel e72f104) · 0 con evidencia rota
Cambios desde la auditoría anterior: +0 ~30 −0
Cobertura de lo cambiado desde 7fab770: 4/4 archivos de código caen bajo algún ítem · todo cubierto

Leyenda de estado: construido = el código existe · testeado = tests/verificación que corren · validado = probado en uso real o desplegado en producción con fecha · ✓prod = archivos del ítem en el commit desplegado · ⚠ = evidencia rota (cita rutas que no existen)

## Módulos
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `alertas` | Alertas de stock | validado | 95 | ✓ | modificado | 1 |
| `app-deposito` | App de Depósito | validado | 100 | ✓ | modificado | — |
| `catalogo-causas` | Catálogo de causas | validado | 100 | ✓ | modificado | — |
| `comparacion-precios` | Comparación de precios | validado | 100 | ✓ | modificado | — |
| `historial-oc` | Historial de OC | validado | 100 | ✓ | sin cambios | — |
| `monitor-stock` | Monitor de stock | validado | 100 | ✓ | sin cambios | — |
| `nueva-oc` | Nueva OC | validado | 100 | ✓ | sin cambios | — |
| `ordenes-compra` | Órdenes de compra / aprobación | validado (Federico) | 100 | ✓ | modificado | — |
| `predictor-demanda` | Predictor de demanda | validado | 100 | ✓ | modificado | — |
| `proveedores` | Proveedores | validado | 95 | ✓ | modificado | 1 |
| `reglas-compra-aprobacion` | Reglas de compra y aprobación | validado | 100 | ✓ | modificado | — |
| `reposicion-central-local` | Reposición Central-Local | validado | 100 | ✓ | sin cambios | — |
| `seguimiento-oc` | Seguimiento de OC | validado | 100 | ✓ | sin cambios | — |
| `usuarios-accesos` | Usuarios y accesos | validado | 95 | ✓ | modificado | 1 |

## Secciones
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `ayuda` | Ayuda (Compras/Stock) | validado | 100 | ✓ | modificado | — |
| `ayuda-deposito` | Ayuda (Depósito) | validado | 100 | ✓ | modificado | — |
| `condiciones-comerciales` | Condiciones comerciales | validado | 90 | ✓ | modificado | 2 |
| `confirmar-recepcion` | Confirmar recepción (Depósito) | validado | 100 | ✓ | modificado | — |
| `datos-empresa` | Datos de la empresa | validado | 95 | ✓ | modificado | 1 |
| `declaraciones-causa` | Declaración de causas | validado | 100 | ✓ | modificado | — |
| `conector-yiqi` | Pantalla Conector YiQi | validado | 100 | ✓ | sin cambios | — |
| `pedir-otro-deposito` | Pedir al otro depósito | validado | 100 | ✓ | modificado | — |
| `revisar-equivalencias` | Revisar equivalencias | validado | 100 | ✓ | modificado | — |
| `solicitudes-preparar` | Solicitudes para preparar (Depósito) | validado | 100 | ✓ | modificado | — |
| `templates-mensajes` | Templates de mensajes | validado | 100 | ✓ | modificado | — |

## Herramientas
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `admin-usuarios-fn` | Admin de usuarios (Edge Function) | validado | 100 | ✓ | modificado | — |
| `composicion-articulos` | Composición de artículos (fraccionados/combos) | validado (Federico) | 90 | ✓ | modificado | 2 |
| `escritura-yiqi` | Escritura en YiQi (OC, stock) | validado | 95 | ✓ | modificado | 1 |
| `exportar-excel` | Exportar a Excel | validado | 95 | ✓ | modificado | 1 |
| `maximos-calculados` | Máximos calculados | validado (Federico) | 90 | ✓ | modificado | 2 |
| `modo-prueba-yiqi` | Modo prueba YiQi | validado | 100 | ✓ | sin cambios | — |
| `pdf-oc-remito` | PDF de OC y remito | validado | 100 | ✓ | modificado | — |
| `reposicion-interna-automatica` | Reposición interna automática | validado | 100 | ✓ | modificado | — |
| `sync-yiqi` | Sync espejo YiQi | validado | 100 | ✓ | sin cambios | — |
| `whatsapp-pedidos` | WhatsApp de pedidos | validado | 95 | ✓ | modificado | 1 |

## Integraciones
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `yiqi-erp` | Integración YiQi | validado | 95 | ✓ | modificado | 1 |

## Entorno
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `vercel-deploy` | Deploy Vercel | validado | 100 | ✓ | sin cambios | — |
| `supabase-infra` | Infraestructura Supabase | validado | 100 | ✓ | modificado | — |
| `login-permisos` | Login y permisos | validado | 95 | ✓ | modificado | 1 |

## Pendientes por ítem
- `login-permisos` — Verificar Fase B (RLS) en vivo logueado como Ivana
- `composicion-articulos` — confirmar con Ivana 9150-F y 31822-F (código ambiguo); confirmar con Ivana 6067-F y 61322-F (valores aproximados)
- `escritura-yiqi` — pasar a Live con autorización explícita de Federico
- `exportar-excel` — vulnerabilidad alta en xlsx sin fix en npm
- `maximos-calculados` — decidir con Aris si el máximo cubre 1 o 2 meses para productos de compra puntual; revisar el criterio de pico (29% de SKU)
- `whatsapp-pedidos` — WhatsApp de pedidos de los proveedores reales
- `yiqi-erp` — comentario desactualizado del smartieId
- `alertas` — Number() sin validar guarda 0 en silencio en ReglasAlertas
- `proveedores` — condiciones comerciales reales: 31 de 104 cargadas
- `usuarios-accesos` — borrar cartel falso y agregar gate de esAdmin
- `condiciones-comerciales` — cargar días de entrega; 31 de 104 proveedores cargados
- `datos-empresa` — datos reales de la empresa (membrete del PDF)

## Eliminados en los últimos 7 días
(ninguno)

## Cómo se actualiza
Fuente: código y commits del repo + CLAUDE.md. Cada mañana a las 9 el Auditor de TulkasOS reescribe este archivo. Lo que vos sepas y el código no muestre (probado en producción, decisión tomada, algo que ya no aplica) va en `## Cierre AAAA-MM-DD` al final de CLAUDE.md usando estas claves, o se marca con `validar_item_inventario` desde Claude Desktop.
