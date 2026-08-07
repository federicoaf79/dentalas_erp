// ============================================================
// supabase/functions/admin-usuarios/index.ts
// Dentalab-Compras — Gestion de usuarios y permisos por proveedor
// ============================================================
//
// Por que existe esta funcion aparte de yiqi-connector:
//   Listar usuarios de Supabase Auth requiere el service_role key
//   (la anon key del frontend NO tiene permiso para eso, a
//   proposito, por seguridad). Esta funcion corre con service_role
//   del lado del servidor y expone solo lo necesario al frontend,
//   igual que yiqi-connector hace con el Bearer token de YiQi.
//
// ACCIONES SOPORTADAS (via query param "accion"):
//   GET  ?accion=listar
//     -> devuelve todos los usuarios de Supabase Auth (id, email,
//        fecha de creacion) + sus proveedores asignados (desde la
//        tabla propia usuario_proveedor)
//
//   POST ?accion=asignar
//     Body JSON: { userId, proveedorCodigo, proveedorNombre, accion: "agregar" | "quitar" }
//     -> agrega o quita UNA fila de usuario_proveedor
//
// TABLA REQUERIDA (ya creada, 14 julio 2026):
//   usuario_proveedor (id, user_id, proveedor_codigo, proveedor_nombre, created_at)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*', // TODO: restringir al dominio real antes de produccion
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// ------------------------------------------------------------
// Helper: listar todos los usuarios de Supabase Auth + sus
// proveedores asignados
// ------------------------------------------------------------
async function listarUsuarios(supabaseAdmin: ReturnType<typeof createClient>) {
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers();
  if (authError) {
    throw new Error(`Error listando usuarios de Auth: ${authError.message}`);
  }

  const { data: asignaciones, error: asigError } = await supabaseAdmin
    .from('usuario_proveedor')
    .select('user_id, proveedor_codigo, proveedor_nombre');

  if (asigError) {
    throw new Error(`Error leyendo usuario_proveedor: ${asigError.message}`);
  }

  const usuarios = authData.users.map((u) => {
    const proveedoresDeEsteUsuario = (asignaciones ?? [])
      .filter((a) => a.user_id === u.id)
      .map((a) => ({ codigo: a.proveedor_codigo, nombre: a.proveedor_nombre }));

    return {
      id: u.id,
      email: u.email,
      creadoEl: u.created_at,
      ultimoLogin: u.last_sign_in_at,
      proveedores: proveedoresDeEsteUsuario,
    };
  });

  return usuarios;
}

// ------------------------------------------------------------
// Helper: agregar o quitar una asignación de proveedor
// ------------------------------------------------------------
async function asignarProveedor(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  proveedorCodigo: string,
  proveedorNombre: string,
  accion: 'agregar' | 'quitar',
) {
  if (accion === 'agregar') {
    const { error } = await supabaseAdmin
      .from('usuario_proveedor')
      .insert({ user_id: userId, proveedor_codigo: proveedorCodigo, proveedor_nombre: proveedorNombre });

    if (error) {
      // Si ya existe esa asignación (ej. doble click), no lo tratamos como error fatal
      if (error.code === '23505') return { ok: true, nota: 'La asignación ya existía' };
      throw new Error(`Error agregando asignación: ${error.message}`);
    }
    return { ok: true };
  }

  if (accion === 'quitar') {
    const { error } = await supabaseAdmin
      .from('usuario_proveedor')
      .delete()
      .eq('user_id', userId)
      .eq('proveedor_codigo', proveedorCodigo);

    if (error) {
      throw new Error(`Error quitando asignación: ${error.message}`);
    }
    return { ok: true };
  }

  throw new Error(`Acción "${accion}" no reconocida. Usar "agregar" o "quitar".`);
}

// ------------------------------------------------------------
// Handler principal
// ------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const url = new URL(req.url);
    const accionQuery = url.searchParams.get('accion');

    if (accionQuery === 'listar') {
      const usuarios = await listarUsuarios(supabaseAdmin);
      return new Response(
        JSON.stringify({ ok: true, usuarios }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (accionQuery === 'asignar') {
      const body = await req.json();
      const { userId, proveedorCodigo, proveedorNombre, accion } = body;

      if (!userId || !proveedorCodigo || !accion) {
        return new Response(
          JSON.stringify({ error: 'Faltan campos: userId, proveedorCodigo, accion son obligatorios' }),
          { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      const resultado = await asignarProveedor(supabaseAdmin, userId, proveedorCodigo, proveedorNombre ?? '', accion);
      return new Response(
        JSON.stringify(resultado),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Falta el parámetro "accion" (listar | asignar)' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Error en admin-usuarios:', err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : 'Error desconocido' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});
