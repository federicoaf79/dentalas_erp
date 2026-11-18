# Inventario — Dentalab-Compras · 2026-11-18
<!-- Generado por TulkasOS cada mañana. NO EDITAR: se sobreescribe. Para corregir algo, escribilo en el bloque "## Cierre AAAA-MM-DD" de CLAUDE.md (DESMENTIDO / VALIDADO EN VIVO / PENDIENTE) o marcalo desde TulkasOS. -->

**Avance: 97%** (ponderado: módulo ×3, sección ×2, resto ×1) · 40 ítems · 40 validados · 0 testeados · 0 construidos · 40 en producción (Vercel 41b4767) · 0 con evidencia rota
Cambios desde la auditoría anterior: +1 ~21 −0
Cobertura de lo cambiado desde 2f92b10: 20/27 archivos de código caen bajo algún ítem · **7 sin ítem** (ver abajo)

Leyenda de estado: construido = el código existe · testeado = tests/verificación que corren · validado = probado en uso real o desplegado en producción con fecha · ✓prod = archivos del ítem en el commit desplegado · ⚠ = evidencia rota (cita rutas que no existen)

## Módulos
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `alertas` | Alertas de stock | validado (Federico) | 95 | ✓ | modificado | 1 |
| `app-deposito` | App de depósito | validado (Federico) | 95 | ✓ | modificado | 1 |
| `catalogo-causas` | Catálogo de causas | validado | 100 | ✓ | sin cambios | — |
| `comparacion-precios` | Comparación de precios | validado | 100 | ✓ | sin cambios | — |
| `historial-oc` | Historial de OC | validado | 100 | ✓ | modificado | — |
| `monitor-stock` | Monitor de stock | validado | 100 | ✓ | sin cambios | — |
| `nueva-oc` | Nueva OC | validado (Federico) | 95 | ✓ | modificado | 1 |
| `ordenes-compra` | Órdenes de compra | validado (Federico) | 100 | ✓ | modificado | — |
| `predictor-demanda` | Predictor de demanda | validado | 95 | ✓ | modificado | 1 |
| `proveedores` | Proveedores | validado | 95 | ✓ | sin cambios | 1 |
| `reglas-compra-aprobacion` | Reglas de compra y aprobación | validado | 100 | ✓ | sin cambios | — |
| `reposicion-central-local` | Reposición Central-Local | validado (Federico) | 90 | ✓ | modificado | 2 |
| `seguimiento-oc` | Seguimiento de OC | validado (Federico) | 100 | ✓ | sin cambios | — |
| `usuarios-accesos` | Usuarios y accesos | validado (Federico) | 95 | ✓ | sin cambios | 1 |

## Secciones
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `ayuda` | Ayuda | validado (Federico) | 100 | ✓ | sin cambios | — |
| `ayuda-deposito` | Ayuda de depósito | validado | 100 | ✓ | sin cambios | — |
| `condiciones-comerciales` | Condiciones comerciales | validado (Federico) | 95 | ✓ | modificado | 1 |
| `conector-yiqi` | Conector YiQi | validado | 100 | ✓ | modificado | — |
| `confirmar-recepcion` | Confirmar recepción | validado | 100 | ✓ | sin cambios | — |
| `datos-empresa` | Datos de la empresa | validado | 95 | ✓ | modificado | 1 |
| `declaraciones-causa` | Declaraciones de causa | validado | 100 | ✓ | sin cambios | — |
| `pedir-otro-deposito` | Pedir al otro depósito | validado | 95 | ✓ | modificado | 1 |
| `revisar-equivalencias` | Revisar equivalencias | validado (Federico) | 100 | ✓ | sin cambios | — |
| `solicitudes-preparar` | Solicitudes para preparar | validado | 100 | ✓ | sin cambios | — |
| `templates-mensajes` | Templates de mensajes | validado | 100 | ✓ | sin cambios | — |

## Herramientas
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `admin-usuarios-fn` | Admin de usuarios (Edge Function) | validado | 95 | ✓ | modificado | 1 |
| `aviso-version-nueva` | Aviso de versión nueva de la app | validado | 95 | ✓ | nuevo | 1 |
| `composicion-articulos` | Composición de artículos (fraccionados/combos) | validado (Federico) | 95 | ✓ | modificado | 1 |
| `whatsapp-pedidos` | Envío de OC por WhatsApp | validado | 95 | ✓ | modificado | 1 |
| `escritura-yiqi` | Escritura en YiQi (OC/stock) | validado | 95 | ✓ | modificado | 1 |
| `exportar-excel` | Exportar a Excel | validado | 100 | ✓ | modificado | — |
| `maximos-calculados` | Máximos calculados | validado (Federico) | 95 | ✓ | modificado | 1 |
| `modo-prueba-yiqi` | Modo prueba YiQi | validado | 100 | ✓ | sin cambios | — |
| `pdf-oc-remito` | PDF de orden y remito | validado | 95 | ✓ | modificado | 1 |
| `reposicion-interna-automatica` | Reposición interna automática | validado | 100 | ✓ | sin cambios | — |
| `sync-yiqi` | Sync espejo de YiQi | validado | 100 | ✓ | sin cambios | — |

## Integraciones
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `yiqi-erp` | Integración YiQi (conector) | validado | 95 | ✓ | modificado | 1 |

## Entorno
| clave | ítem | estado | % | prod | cambio | pendientes |
|---|---|---|---|---|---|---|
| `vercel-deploy` | Deploy automático (Vercel) | validado | 100 | ✓ | sin cambios | — |
| `supabase-infra` | Infraestructura Supabase | validado | 95 | ✓ | modificado | 1 |
| `login-permisos` | Login y permisos | validado | 95 | ✓ | modificado | 1 |

## Pendientes por ítem
- `supabase-infra` — capturar baseline de migrations desde producción
- `login-permisos` — Verificar Fase B (RLS) en vivo logueado como Ivana
- `admin-usuarios-fn` — deployar la función con la columna Rol
- `aviso-version-nueva` — probar en el próximo deploy dejando una pestaña abierta
- `composicion-articulos` — Confirmar con Ivana 9150-F
- `whatsapp-pedidos` — decidir si el PDF de WhatsApp va con o sin precios
- `escritura-yiqi` — decidir pasar a Live o ayuda de carga manual
- `maximos-calculados` — decidir con Aris 1 o 2 meses de cobertura y qué hacer con los picos
- `pdf-oc-remito` — decidir PDF con/sin precios por proveedor
- `yiqi-erp` — verificar campos de Punto de pedido con Aris/Vanig tras el cambio en YiQi
- `alertas` — revisar el criterio de pico (29% de SKU)
- `app-deposito` — agregar policy de stock_yiqi para es_usuario_deposito()
- `nueva-oc` — la sugerencia no respeta el máximo calculado (D1/D2 con Aris)
- `predictor-demanda` — SKU 888 sin definir si es administrativo
- `proveedores` — condiciones comerciales reales (31 de 104)
- `reposicion-central-local` — validar en vivo envío admin y caso 8→6; decidir si se restringe la policy de UPDATE directo
- `usuarios-accesos` — deployar admin-usuarios con columna Rol
- `condiciones-comerciales` — cargar días de entrega reales
- `datos-empresa` — datos reales del membrete
- `pedir-otro-deposito` — agregar policy de stock_yiqi para es_usuario_deposito()

## Eliminados en los últimos 7 días
(ninguno)

## Código cambiado sin ítem que lo cubra
Archivos modificados desde la auditoría 2f92b10 que no caen bajo la ubicación de ningún ítem. Si es algo nuevo, falta inventariarlo; si es parte de un ítem, falta ampliar su ubicación.
- `frontend/src/App.jsx`
- `frontend/src/components/DiferenciasRecepcion.jsx`
- `frontend/src/components/HistorialReposicion.jsx`
- `frontend/src/components/NuevoPedidoEntreDepositos.jsx`
- `frontend/src/components/Sidebar.jsx`
- `frontend/src/lib/formato.js`
- `frontend/src/pages/ReposicionInterna.jsx`

## Cómo se actualiza
Fuente: código y commits del repo + CLAUDE.md. Cada mañana a las 9 el Auditor de TulkasOS reescribe este archivo. Lo que vos sepas y el código no muestre (probado en producción, decisión tomada, algo que ya no aplica) va en `## Cierre AAAA-MM-DD` al final de CLAUDE.md usando estas claves, o se marca con `validar_item_inventario` desde Claude Desktop.
