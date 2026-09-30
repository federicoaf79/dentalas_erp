-- ============================================================
-- 30/9/2026 — Versiona el trigger trg_reactivar_alertas de stock_yiqi,
-- que existía en producción sin migración (radiografía del 30/9).
-- Su función reactivar_alertas_por_stock() está en la baseline
-- 20260801000000. Solo se crea si no existe: en producción no cambia nada.
-- ============================================================
do $b$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_reactivar_alertas' and tgrelid = 'public.stock_yiqi'::regclass) then
    create trigger trg_reactivar_alertas after update on public.stock_yiqi
      for each row execute function public.reactivar_alertas_por_stock();
  end if;
end $b$;
