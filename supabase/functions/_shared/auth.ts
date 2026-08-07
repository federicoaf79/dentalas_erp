// ============================================================
// supabase/functions/_shared/auth.ts
// Dentalab-Compras — verificacion de llamador para Edge Functions
// ============================================================
//
// Por que existe (7 agosto 2026):
//   Las 3 Edge Functions (yiqi-connector, admin-usuarios, sync-yiqi)
//   corrian con el service_role key SIN validar quien las llamaba.
//   Cualquiera con la anon key publica (la misma que trae el bundle
//   del frontend) podia invocarlas directo por HTTP.
//
// COMO SE USA:
//   const chequeo = await verificarLlamador(req, supabaseAdmin)
//   if (!chequeo.ok) return respuestaError(chequeo.status, chequeo.error)
//
//   Pasar { soloAdmin: true } para exigir ademas rol admin
//   (usuarios_config.rol === 'admin').
//
// DOS CAMINOS DE CONFIANZA:
//   1) Llamador interno (pg_cron u otra Edge Function): el Authorization
//      Bearer que llega es EXACTAMENTE la service_role key de este
//      proyecto. Solo quien ya tiene ese secreto puede mandar ese
//      valor -- si alguien ya lo tiene, ya tiene acceso total de
//      todos modos, asi que esta comparacion no abre nada nuevo.
//   2) Usuario real logueado: se valida el JWT DE VERDAD contra
//      Supabase Auth (supabaseAdmin.auth.getUser), no solo se
//      decodifica -- por eso funciona sin importar si "Verify JWT"
//      esta prendido o apagado a nivel plataforma para la funcion.
//      Ademas se exige fila activa en usuarios_config.
//
// OJO CRON: si el cron job de pg_cron (select * from cron.job) NO
// manda el Authorization Bearer como la service_role key exacta,
// el sync automatico va a empezar a fallar con 401 despues de este
// cambio. Verificar el header configurado en cron.job ANTES de
// deployar sync-yiqi, o mirar los logs de la funcion en el
// dashboard de Supabase despues del proximo horario de sync
// (jobid 3, cada 15 min).
// ============================================================

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export type ResultadoAuth =
  | { ok: true; esServiceRole: true }
  | { ok: true; esServiceRole: false; userId: string; rol: string }
  | { ok: false; status: 401 | 403; error: string };

export async function verificarLlamador(
  req: Request,
  supabaseAdmin: SupabaseClient,
  opts: { soloAdmin?: boolean } = {}
): Promise<ResultadoAuth> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return { ok: false, status: 401, error: 'Falta el header Authorization' };
  }

  // Camino 1: llamada interna (cron u otra funcion) con la propia
  // service_role key del proyecto.
  if (token === SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: true, esServiceRole: true };
  }

  // Camino 2: usuario real. getUser() valida el JWT contra Supabase
  // Auth de verdad (no es un decode ingenuo).
  const { data: { user }, error: errUser } = await supabaseAdmin.auth.getUser(token);
  if (errUser || !user) {
    return { ok: false, status: 401, error: 'Sesión inválida o vencida' };
  }

  const { data: config, error: errConfig } = await supabaseAdmin
    .from('usuarios_config')
    .select('rol, activo')
    .eq('user_id', user.id)
    .maybeSingle();

  if (errConfig || !config || config.activo === false) {
    return { ok: false, status: 403, error: 'Usuario sin acceso al sistema' };
  }

  if (opts.soloAdmin && config.rol !== 'admin') {
    return { ok: false, status: 403, error: 'Esta acción requiere rol admin' };
  }

  return { ok: true, esServiceRole: false, userId: user.id, rol: config.rol };
}

// Helper chico para no repetir el armado de la respuesta de error
// con los headers de CORS en cada function.
export function respuestaAuthError(
  resultado: { status: 401 | 403; error: string },
  corsHeaders: Record<string, string>
): Response {
  return new Response(
    JSON.stringify({ ok: false, error: resultado.error }),
    { status: resultado.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
