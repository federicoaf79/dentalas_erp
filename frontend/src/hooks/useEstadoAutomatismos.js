import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// 10/11/2026 — radiografía UX (ítem 18)
// Lee estado_automatismos() (migración 20261110121000): si los crons de
// reposición automática están activos. Falla silenciosa: si la RPC no existe
// (migración sin aplicar) o da error, devuelve null y la pantalla no muestra nada.
// Devuelve { reposicion_central_activa, reposicion_interna_activa } o null.
export function useEstadoAutomatismos() {
  const [estado, setEstado] = useState(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const { data, error } = await supabase.rpc('estado_automatismos')
        if (!vivo) return
        if (error || !data || typeof data !== 'object') setEstado(null)
        else setEstado(data)
      } catch {
        if (vivo) setEstado(null)
      }
    })()
    return () => {
      vivo = false
    }
  }, [])

  return estado
}
