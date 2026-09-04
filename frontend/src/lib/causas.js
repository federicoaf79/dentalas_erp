import { supabase } from './supabase'

// ============================================================
// causas.js — helper compartido para el ítem 7 (declarar causas).
//
// OJO 22/8/2026: declaraciones_causa YA EXISTÍA en producción, sin
// migración propia (mismo patrón que catalogo_causas), cuando se
// escribió la primera versión de este archivo -- con un esquema
// distinto al que se había asumido (3 columnas tipadas por ámbito en
// vez de una referencia_id genérica). Este archivo habla con el
// esquema REAL, verificado en vivo el 22/8/2026:
//   mate_codigo   (text)   -- referencia para ámbito 'stock'
//   nro_oc        (text)   -- referencia para ámbito 'entrega'
//   orden_propia  (bigint) -- referencia para ámbito 'compra'
//   declarada_por / declarada_en (no declarado_por / declarado_en)
// COLUMNA_REFERENCIA mapea ámbito -> columna real, así el resto de
// este archivo (y las 3 pantallas que lo usan) siguen hablando de
// "referenciaId" en general sin saber cuál es la columna física.
// ============================================================

const COLUMNA_REFERENCIA = {
  stock: 'mate_codigo',
  entrega: 'nro_oc',
  compra: 'orden_propia',
}

// Trae la última declaración de cada referencia dentro de un ámbito,
// para el lote de ids visible en la pantalla. Devuelve un objeto
// { [referencia]: declaracion } -- la clave siempre como string
// (String(valor)), para que las pantallas indexen igual sin importar
// si la columna real es texto (SKU, nro_oc) o bigint (orden_propia).
export async function ultimasCausasPorReferencia(ambito, referenciaIds) {
  const columna = COLUMNA_REFERENCIA[ambito]
  const ids = [...new Set((referenciaIds ?? []).filter((v) => v !== null && v !== undefined && v !== ''))]
  if (!columna || ids.length === 0) return {}

  const { data, error } = await supabase
    .from('declaraciones_causa')
    .select(`id, ${columna}, causa_id, referencia_texto, nota, declarada_por, declarada_en, catalogo_causas(rotulo)`)
    .eq('ambito', ambito)
    .in(columna, ids)
    // Ítem #47 (4/9/2026): una declaración archivada no cuenta como
    // "vigente" -- si se archivó la última causa declarada, pasa a
    // mostrarse la siguiente no archivada (o "—" si no queda ninguna).
    .is('archivada_en', null)
    .order('declarada_en', { ascending: false })

  if (error) {
    // No es crítico para el resto de la pantalla: si falla, simplemente
    // no se muestra "causa vigente" en ninguna fila.
    console.error('[ultimasCausasPorReferencia]', error)
    return {}
  }

  const nombresPorId = await nombresDeclarantes(data ?? [])

  const ultimaPorReferencia = {}
  for (const fila of data ?? []) {
    // Ya viene ordenado por declarada_en desc -- la primera vez que
    // aparece cada referencia es la más reciente.
    const clave = String(fila[columna])
    if (!ultimaPorReferencia[clave]) {
      ultimaPorReferencia[clave] = {
        ...fila,
        causa_rotulo: fila.catalogo_causas?.rotulo ?? '—',
        declarante_nombre: nombresPorId[fila.declarada_por] ?? null,
      }
    }
  }
  return ultimaPorReferencia
}

// Historial completo (todas las declaraciones, no solo la última) de
// una referencia puntual -- para el modal, cuando el usuario quiere
// ver "cómo veníamos pensando esto antes". Incluye las archivadas
// (ítem #47): archivar nunca borra la fila, solo la saca de
// "vigente" -- el historial la sigue mostrando, marcada.
export async function historialCausas(ambito, referenciaId) {
  const columna = COLUMNA_REFERENCIA[ambito]
  if (!columna) throw new Error(`Ámbito desconocido: ${ambito}`)

  const { data, error } = await supabase
    .from('declaraciones_causa')
    .select(
      `id, causa_id, referencia_texto, nota, declarada_por, declarada_en, archivada_en, archivada_por, catalogo_causas(rotulo)`
    )
    .eq('ambito', ambito)
    .eq(columna, referenciaId)
    .order('declarada_en', { ascending: false })

  if (error) throw new Error(error.message)

  const nombresPorId = await nombresDeclarantes(data ?? [])
  return (data ?? []).map((fila) => ({
    ...fila,
    causa_rotulo: fila.catalogo_causas?.rotulo ?? '—',
    declarante_nombre: nombresPorId[fila.declarada_por] ?? null,
    archivante_nombre: fila.archivada_por ? nombresPorId[fila.archivada_por] ?? null : null,
  }))
}

// Ítem #47 (4/9/2026), pedido de Federico: "que haya opción de borrar,
// o archivar". Un DELETE real rompería el append-only (se perdería el
// rastro de qué causa se declaró y cuándo) y ya existe el precedente
// de "papelera" reversible en el proyecto (ver
// 20260810150000_papelera_ordenes_propias.sql / OrdenesPropias.jsx) --
// mismo patrón acá: UPDATE de archivada_en/archivada_por, nunca DELETE.
// La RLS ("cada uno edita lo suyo" OR es_admin()) ya limita quién
// puede archivar/restaurar -- no hace falta repetir esa lógica acá.
export async function archivarCausa(id) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No se pudo identificar al usuario logueado. Volvé a iniciar sesión e intentá de nuevo.')

  const { error } = await supabase
    .from('declaraciones_causa')
    .update({ archivada_en: new Date().toISOString(), archivada_por: user.id })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function restaurarCausa(id) {
  const { error } = await supabase
    .from('declaraciones_causa')
    .update({ archivada_en: null, archivada_por: null })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

// catalogo_causas activas de un ámbito, para el <select> del modal.
export async function causasDelAmbito(ambito) {
  const { data, error } = await supabase
    .from('catalogo_causas')
    .select('id, codigo, rotulo, descripcion')
    .eq('ambito', ambito)
    .eq('activa', true)
    .order('orden')
  if (error) throw new Error(error.message)
  return data ?? []
}

// declarada_por NO tiene default en la tabla real (verificado en
// vivo) -- la política de INSERT exige declarada_por = auth.uid()
// explícitamente (with check), así que hace falta traer el user acá,
// no se puede confiar en un default de columna. Mismo patrón que
// creada_por/decidida_por/archivada_por en OrdenesPropias.jsx.
export async function declararCausa({ ambito, causaId, referenciaId, referenciaTexto, nota }) {
  const columna = COLUMNA_REFERENCIA[ambito]
  if (!columna) throw new Error(`Ámbito desconocido: ${ambito}`)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No se pudo identificar al usuario logueado. Volvé a iniciar sesión e intentá de nuevo.')

  const { error } = await supabase.from('declaraciones_causa').insert({
    ambito,
    causa_id: causaId,
    [columna]: referenciaId,
    referencia_texto: referenciaTexto ?? null,
    nota: nota?.trim() || null,
    declarada_por: user.id,
  })
  if (error) throw new Error(error.message)
}

// nombres_usuarios() -- misma función SECURITY DEFINER de la
// migration 20260810150000 (papelera de ordenes_propias), reutilizada
// acá porque usuarios_config tiene RLS que solo deja leer la propia
// fila: sin esto, Aris no vería el nombre de las declaraciones de
// Ivana ni viceversa.
async function nombresDeclarantes(filas) {
  const ids = [
    ...new Set(
      filas.flatMap((f) => [f.declarada_por, f.archivada_por]).filter(Boolean)
    ),
  ]
  if (ids.length === 0) return {}
  const { data, error } = await supabase.rpc('nombres_usuarios', { p_ids: ids })
  if (error) {
    console.error('[nombres_usuarios]', error)
    return {}
  }
  return Object.fromEntries((data ?? []).map((n) => [n.user_id, n.nombre]))
}
