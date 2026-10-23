// ============================================================
// supabase/functions/_shared/escrituraYiqi.ts
// Dentalab-Compras — interruptor general de escritura a YiQi
// ============================================================
//
// 23/10/2026 — interruptor de escritura a YiQi (Federico: no autorizado
// Live). Se habilita con reglas_compra.escritura_yiqi_habilitada = true.
//
// Apagado por defecto y FAIL-CLOSED: devuelve true SOLO si la lectura de
// public.reglas_compra (id = 1) funciona y el valor es exactamente true.
// Cualquier error (columna inexistente porque la migración no corrió, fila
// nula, red, valor null/undefined/'true'/1) devuelve false.
//
// COMO SE USA (inmediatamente después de verificarLlamador y ANTES de
// cualquier lectura/escritura en la base o llamada a YiQi):
//   if (!(await escrituraYiqiHabilitada(supabaseAdmin))) return respuestaModoPrueba(CORS_HEADERS);
// ============================================================

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export async function escrituraYiqiHabilitada(supabaseAdmin: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from('reglas_compra')
      .select('escritura_yiqi_habilitada')
      .eq('id', 1)
      .maybeSingle();
    if (error || !data) return false;
    return (data as { escritura_yiqi_habilitada?: unknown }).escritura_yiqi_habilitada === true;
  } catch {
    return false;
  }
}

export function respuestaModoPrueba(
  cors: Record<string, string>,
  extra: Record<string, unknown> = {}
): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      modo_prueba: true,
      enviada: false,
      error: 'Modo prueba: la escritura a YiQi está deshabilitada. No se envió nada a YiQi.',
      ...extra,
    }),
    { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
  );
}
