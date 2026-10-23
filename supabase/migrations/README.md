# supabase/migrations

**Estado al 18/10/2026:** 54 migraciones, de `20260801000000_baseline_objetos_creados_a_mano.sql` a `20261007120000_sugerencias_compra_maximo.sql`. [repo 2026-10-18]

## Historia corta

- **5/8/2026:** la carpeta estaba vacía a propósito. Todo el esquema se había aplicado a mano en el SQL Editor y la sesión no podía leer producción para escribir un baseline real.
- **30/9/2026:** se versionó el baseline (`20260801000000`, commit `aaa89e9`). Cubre 25 tablas, funciones, vista, policies y triggers creados a mano. Lleva la fecha 1/8 para que quede primero.
- **Excepción conocida:** `declaraciones_causa` no tiene `CREATE TABLE` ejecutable en ninguna migración. Solo aparece comentado en `20260822000000_declaraciones_causa.sql:18`, y el baseline no la incluye. Pendiente: leer su DDL en producción y versionarla. [repo 2026-10-18]

## Cómo se aplican

- **A mano, en el SQL Editor de Supabase** (proyecto `hsfudsnmooaesrzdwecg`), pegando el archivo. No se usa `supabase db push`.
  - Por eso `supabase migration list` no sirve: la tabla de control del CLI nunca se llenó.
- **Para comprobar que lo del repo está aplicado** se pregunta directo al catálogo de Postgres:
  - `scripts/verificar_migraciones_21_8.sql` (28/28 objetos y 6/6 versiones, 21/8).
  - `scripts/verificar_migraciones_10_9.sql`.
  - `scripts/radiografia_esquema_30_9.sql` y `scripts/radiografia_funciones_30_9.sql`.
- **Últimas dos, verificadas en producción:**
  - `20261003100000` (policies `crear/editar/borrar items` y trigger `trg_items_vuelve_a_borrador`). [prod 2026-10-03]
  - `20261007120000` (`sugerencias_compra` devuelve `maximo`, EXECUTE solo `authenticated`). [prod 2026-10-07]

## Reglas

- Ningún cambio de esquema se aplica desde el SQL Editor sin su archivo en esta carpeta. Si se aplica a mano por urgencia, la migración se escribe en la misma sesión.
- Una función `RETURNS TABLE` a la que se le agrega una columna necesita `DROP FUNCTION` antes (error 42P13). El DROP borra los GRANT: hay que volver a otorgarlos, igual que en `20260930130000_permisos_funciones.sql` (revoke a `public, anon` y grant a `authenticated`).
- Las keys de los crons se leen de Vault (`20260930120000_crons_sync_a_vault.sql`). Nunca escribir una key en un archivo de esta carpeta: GitHub Push Protection ya bloqueó un commit por eso (28/9).
- Nombre: `AAAAMMDDhhmmss_descripcion_corta.sql`.
