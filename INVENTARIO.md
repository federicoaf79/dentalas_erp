# Inventario — Dentalab-Compras · 2026-11-19
<!-- Generado por TulkasOS cada mañana. NO EDITAR: se sobreescribe. Para corregir algo, escribilo en el bloque "## Cierre AAAA-MM-DD" de CLAUDE.md (DESMENTIDO / VALIDADO EN VIVO / PENDIENTE) o marcalo desde TulkasOS. -->

**Avance: 96%** (ponderado: módulo ×3, sección ×2, resto ×1) · 40 ítems · 40 validados · 0 testeados · 0 construidos · 40 en producción (Vercel ef8a60f) · 0 con evidencia rota
Cambios desde la auditoría anterior: +0 ~26 −0
Cobertura de lo cambiado desde 41b4767: 25/37 archivos de código caen bajo algún ítem · **12 sin ítem** (ver abajo)

Leyenda de estado: construido = el código existe · testeado = tests/verificación que corren · validado = probado en uso real o desplegado en producción con fecha · ✓prod = archivos del ítem en el commit desplegado · ⚠ = evidencia rota (cita rutas que no existen)

## Módulos
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `alertas` | Alertas de stock | validado (Federico) | 95 | ✓ | modificado | 1 |
| `app-deposito` | App de depósito | validado (Federico) | 95 | ✓ | modificado | 1 |
| `catalogo-causas` | Catálogo de causas | validado | 100 | ✓ | sin cambios | — |
| `comparacion-precios` | Comparación de precios | validado | 95 | ✓ | modificado | 1 |
| `historial-oc` | Historial de OC | validado | 100 | ✓ | sin cambios | — |
| `monitor-stock` | Monitor de stock | validado | 95 | ✓ | modificado | 1 |
| `nueva-oc` | Nueva OC | validado (Federico) | 100 | ✓ | modificado | — |
| `ordenes-compra` | Órdenes de compra | validado (Federico) | 100 | ✓ | sin cambios | — |
| `predictor-demanda` | Predictor de demanda | validado | 90 | ✓ | modificado | 2 |
| `proveedores` | Proveedores | validado | 95 | ✓ | modificado | 1 |
| `reglas-compra-aprobacion` | Reglas de compra y aprobación | validado | 100 | ✓ | sin cambios | — |
| `reposicion-central-local` | Reposición Central-Local | validado (Federico) | 85 | ✓ | modificado | 3 |
| `seguimiento-oc` | Seguimiento de OC | validado (Federico) | 95 | ✓ | modificado | 1 |
| `usuarios-accesos` | Usuarios y accesos | validado (Federico) | 90 | ✓ | modificado | 2 |

## Secciones
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `ayuda` | Ayuda | validado (Federico) | 90 | ✓ | modificado | 2 |
| `ayuda-deposito` | Ayuda de depósito | validado | 95 | ✓ | modificado | 1 |
| `condiciones-comerciales` | Condiciones comerciales | validado (Federico) | 90 | ✓ | modificado | 2 |
| `conector-yiqi` | Conector YiQi | validado | 95 | ✓ | modificado | 1 |
| `confirmar-recepcion` | Confirmar recepción | validado | 100 | ✓ | sin cambios | — |
| `datos-empresa` | Datos de la empresa | validado | 95 | ✓ | sin cambios | 1 |
| `declaraciones-causa` | Declaraciones de causa | validado | 100 | ✓ | sin cambios | — |
| `pedir-otro-deposito` | Pedir al otro depósito | validado | 100 | ✓ | modificado | — |
| `revisar-equivalencias` | Revisar equivalencias | validado (Federico) | 95 | ✓ | modificado | 1 |
| `solicitudes-preparar` | Solicitudes para preparar | validado | 100 | ✓ | sin cambios | — |
| `templates-mensajes` | Templates de mensajes | validado | 100 | ✓ | sin cambios | — |

## Herramientas
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `aviso-version-nueva` | Aviso de versión nueva de la app | validado | 95 | ✓ | modificado | 1 |
| `composicion-articulos` | Composición de artículos fraccionados/combos | validado (Federico) | 100 | ✓ | modificado | — |
| `admin-usuarios-fn` | Edge Function admin de usuarios | validado | 95 | ✓ | modificado | 1 |
| `whatsapp-pedidos` | Envío de OC por WhatsApp | validado | 95 | ✓ | modificado | 1 |
| `escritura-yiqi` | Escritura en YiQi (OC, stock) | validado | 95 | ✓ | modificado | 1 |
| `exportar-excel` | Exportar a Excel | validado | 100 | ✓ | sin cambios | — |
| `maximos-calculados` | Máximos calculados | validado (Federico) | 95 | ✓ | modificado | 1 |
| `modo-prueba-yiqi` | Modo prueba YiQi | validado | 100 | ✓ | sin cambios | — |
| `pdf-oc-remito` | PDF de orden de compra y remitos | validado | 95 | ✓ | modificado | 1 |
| `reposicion-interna-automatica` | Reposición interna automática | validado | 100 | ✓ | sin cambios | — |
| `sync-yiqi` | Sync espejo de YiQi | validado | 100 | ✓ | sin cambios | — |

## Integraciones
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `yiqi-erp` | Integración YiQi (ERP) | validado | 95 | ✓ | modificado | 1 |

## Entorno
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `vercel-deploy` | Deploy en Vercel | validado | 100 | ✓ | sin cambios | — |
| `supabase-infra` | Infraestructura Supabase | validado | 95 | ✓ | modificado | 1 |
| `login-permisos` | Login y permisos (RLS) | validado | 100 | ✓ | modificado | — |

## Pendientes por ítem
- `supabase-infra` — mover-stock-reposicion ya tiene verify_jwt=false (resuelto)
- `aviso-version-nueva` — validar el aviso en el próximo deploy (dos builds seguidos)
- `admin-usuarios-fn` — Federico: Deployar la edge function admin-usuarios (columna Rol)
- `whatsapp-pedidos` — decidir PDF con/sin precios por proveedor
- `escritura-yiqi` — sigue en modo prueba hasta autorización de Federico
- `maximos-calculados` — decisión de Aris: 1 o 2 meses de cobertura
- `pdf-oc-remito` — decidir PDF con/sin precios por WhatsApp
- `yiqi-erp` — comentario de smartieId desactualizado (yiqi-connector/index.ts:66-68)
- `alertas` — deploy del fix pendiente de commitear
- `app-deposito` — validar en vivo "Llegó otro artículo" y subida real de remito firmado
- `comparacion-precios` — deploy del fix pendiente de commitear
- `monitor-stock` — deploy del fix pendiente de commitear
- `predictor-demanda` — deploy del fix pendiente de commitear; SKU 888 sin saber si es administrativo
- `proveedores` — deploy del fix pendiente de commitear
- `reposicion-central-local` — validar 'Llegó otro artículo' en vivo; decisión de Aris sobre tope de pedidos encadenados (resuelto parcial); Remito Interno YiQi sin validar contra YiQi real (decisión de Federico de no probarlo)
- `seguimiento-oc` — deploy del fix pendiente de commitear
- `usuarios-accesos` — deploy del fix pendiente de commitear; deploy de admin-usuarios con columna Rol
- `ayuda` — textos 'el Local'/'al Local' sin corregir (:181,211,212,262,719); deploy del fix pendiente de commitear
- `ayuda-deposito` — texto 'el Local' en línea 56 sin corregir
- `condiciones-comerciales` — deploy del fix pendiente de commitear; condiciones reales (31 de 104 cargadas)
- `conector-yiqi` — deploy del fix pendiente de commitear
- `datos-empresa` — datos reales del membrete
- `revisar-equivalencias` — deploy del fix pendiente de commitear

## Eliminados en los últimos 7 días
(ninguno)

## Código cambiado sin ítem que lo cubra
Archivos modificados desde la auditoría 41b4767 que no caen bajo la ubicación de ningún ítem. Si es algo nuevo, falta inventariarlo; si es parte de un ítem, falta ampliar su ubicación.
- `frontend/src/components/AvisoRemitoYiqi.jsx`
- `frontend/src/components/ConfigReposicionAutomatica.jsx`
- `frontend/src/components/DiferenciasRecepcion.jsx`
- `frontend/src/components/HistorialReposicion.jsx`
- `frontend/src/components/NuevoPedidoEntreDepositos.jsx`
- `frontend/src/components/RemitoFirmado.jsx`
- `frontend/src/components/Sidebar.jsx`
- `frontend/src/hooks/useEstadoAutomatismos.js`
- `frontend/src/lib/depositos.js`
- `frontend/src/pages/ReposicionInterna.jsx`
- `supabase/functions/mover-stock-reposicion/index.ts`
- `supabase/functions/remito-interno-yiqi/index.ts`

## Cómo se actualiza
Fuente: código y commits del repo + CLAUDE.md. Cada mañana a las 9 el Auditor de TulkasOS reescribe este archivo. Lo que vos sepas y el código no muestre (probado en producción, decisión tomada, algo que ya no aplica) va en `## Cierre AAAA-MM-DD` al final de CLAUDE.md usando estas claves, o se marca con `validar_item_inventario` desde Claude Desktop.
