import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Faltan las variables VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. ' +
    'Revisá el archivo .env.local en la carpeta frontend/'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ------------------------------------------------------------
// Helper para llamar a la Edge Function yiqi-connector
// ------------------------------------------------------------
export async function llamarYiqi(entidad, id = null) {
  const params = new URLSearchParams({ entidad })
  if (id) params.set('id', id)

  const { data, error } = await supabase.functions.invoke(
    `yiqi-connector?${params.toString()}`
  )

  if (error) {
    throw new Error(`Error llamando a YiQi (${entidad}): ${error.message}`)
  }

  if (!data?.ok) {
    throw new Error(`YiQi devolvió un error: ${data?.error ?? 'desconocido'}`)
  }

  return data.data
}
