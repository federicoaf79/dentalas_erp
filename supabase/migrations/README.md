# supabase/migrations — baseline PENDIENTE

**Estado al 5/8/2026: esta carpeta está vacía a propósito.**

Todo el esquema de `hsfudsnmooaesrzdwecg` (tablas espejo `material_yiqi`, `ordenes_yiqi`,
`clientes_yiqi`, `ventas_mensual_yiqi`; tablas propias `usuarios_config`, `usuario_proveedor`,
`yiqi_config`, `ordenes_propias`, `ordenes_propias_items`, `reglas_compra`, `empresa_config`,
`catalogo_causas`, `declaraciones_causa`, `templates_mensaje`, `proveedores`; las funciones
`es_admin()`, `mis_codigos_proveedor()`, `mis_nombres_proveedor()`, `contadores_sidebar()`,
`historial_ventas()`, `historial_ventas_json()`, `sugerencias_compra()`,
`proveedores_con_alertas()`, `es_comprable()`; las políticas RLS y los 3 cron jobs de `pg_cron`)
fue aplicado **a mano en producción** y nunca se versionó.

## Por qué no hay un baseline escrito acá

La sesión del 5/8/2026 no pudo alcanzar producción: el entorno bloquea la salida a
`supabase.co`. Escribir el DDL "de memoria" a partir de la documentación habría producido
migrations que **no describen la base real** — exactamente el problema que esta carpeta
existe para resolver. Se prefirió dejar el hueco visible.

## Cómo cerrarlo (5 minutos, desde PowerShell)

    .\scripts\capturar-baseline.ps1

Genera `supabase/migrations/<timestamp>_baseline.sql` con el esquema real, sin datos.
Después de correrlo, **borrar este README** y commitear el baseline.

## Regla desde acá en adelante

Ningún cambio de esquema se aplica desde el SQL Editor sin su archivo en esta carpeta.
Si se aplica a mano por urgencia, se escribe la migration en la misma sesión.
