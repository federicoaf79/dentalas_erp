-- ============================================================
-- 20260929120000_fix_sync_ventas_permisos_y_punto_equilibrio.sql
-- Dentalab-Compras -- 29/9/2026
-- ============================================================
-- Versiona 3 cambios YA APLICADOS a mano en producción el 29/9/2026
-- (SQL Editor, Federico). Ver claude/STATUS_GLOBAL_29-9-2026.md.
--
-- 1. RLS de ventas_mensual_yiqi_vendedor: en prod ya estaba activa
--    (sin policies) aunque 20260911170000 no la habilitaba. Se deja
--    escrito para que el repo refleje prod. Sin policies, anon y
--    authenticated no leen ni escriben; service_role sí.
--    PENDIENTE (decisión): reposicion_interna() es SECURITY INVOKER y
--    con esto un usuario logueado lee 0 filas de esta tabla. Ver
--    supabase/migrations_borrador/20260929100000_*.
--
-- 2. EXECUTE de las funciones de carga de ventas: estaban abiertas a
--    public/anon/authenticated (SECURITY DEFINER -> cualquiera con la
--    anon key podía sobrescribir ventas). Quedan solo para
--    service_role (sync-yiqi) y postgres.
--
-- 3. calcular_punto_equilibrio(): "delete from punto_equilibrio_local;"
--    sin WHERE era bloqueado por la protección de Supabase contra
--    DELETE sin condición cuando la escritura llega por la API. Como
--    se ejecuta desde el trigger trg_ventas_mensual_yiqi_punto_equilibrio
--    (AFTER INSERT OR UPDATE ... FOR EACH STATEMENT), cada sync de
--    ventas (smartie 2353) fallaba con "DELETE requires a WHERE clause"
--    desde el 8/9/2026: ventas_mensual_yiqi y punto_equilibrio_local
--    quedaron congeladas 3 semanas. Única diferencia con la versión
--    anterior: "where true". Verificado 29/9 19:03 UTC: ventas 41048
--    filas y punto_equilibrio_local 4025 filas recalculadas.
-- ============================================================

begin;

-- 1
alter table public.ventas_mensual_yiqi_vendedor enable row level security;

-- 2
revoke execute on function public.upsert_ventas_mensual_yiqi(jsonb)
  from public, anon, authenticated;
grant execute on function public.upsert_ventas_mensual_yiqi(jsonb)
  to service_role;

revoke execute on function public.upsert_ventas_mensual_yiqi_vendedor(jsonb)
  from public, anon, authenticated;
grant execute on function public.upsert_ventas_mensual_yiqi_vendedor(jsonb)
  to service_role;

-- 3
create or replace function public.calcular_punto_equilibrio()
 returns void
 language plpgsql
 security definer
as $function$
declare
  v_hasta date := date_trunc('month', current_date)::date - interval '1 month';
  v_desde_rotacion date := v_hasta - interval '5 months';
  v_desde_exclusion date := v_hasta - interval '11 months';
begin
  delete from punto_equilibrio_local where true;

  insert into punto_equilibrio_local (
    sku, mate_nombre, venta_mensual_prom, meses_considerados,
    periodo_desde, periodo_hasta, calculado_en, excluido, motivo_exclusion
  )
  select
    v12.sku,
    st.mate_nombre,
    coalesce(r6.total_6m, 0) / 6.0,
    6, v_desde_rotacion, v_hasta, now(), false, null
  from (
    select distinct mate_codigo as sku
    from ventas_mensual_yiqi
    where periodo >= v_desde_exclusion and periodo <= v_hasta
  ) v12
  inner join stock_yiqi st on st.sku = v12.sku  -- solo productos reales (existen en stock)
  left join (
    select mate_codigo as sku, sum(cantidad) as total_6m
    from ventas_mensual_yiqi
    where periodo >= v_desde_rotacion and periodo <= v_hasta
    group by mate_codigo
  ) r6 on r6.sku = v12.sku;

  insert into punto_equilibrio_local (
    sku, mate_nombre, venta_mensual_prom, meses_considerados,
    periodo_desde, periodo_hasta, calculado_en, excluido, motivo_exclusion
  )
  select
    st.sku, st.mate_nombre, 0, 6, v_desde_rotacion, v_hasta, now(),
    true, 'Sin ventas en los ultimos 12 meses y sin stock (discontinuado)'
  from stock_yiqi st
  where coalesce(greatest(st.stock_central,0),0) + coalesce(greatest(st.stock_local,0),0) = 0
    and exists (select 1 from ventas_mensual_yiqi v where v.mate_codigo = st.sku)
    and not exists (
      select 1 from ventas_mensual_yiqi v2
      where v2.mate_codigo = st.sku
        and v2.periodo >= v_desde_exclusion and v2.periodo <= v_hasta
    )
    and not exists (select 1 from punto_equilibrio_local pel where pel.sku = st.sku);
end;
$function$;

commit;
