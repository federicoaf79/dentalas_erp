import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// 23/10/2026 — modo prueba YiQi (no autorizado Live)
// Lee reglas_compra (id = 1).escritura_yiqi_habilitada una vez al montar.
// Fail-closed: si la columna no existe, hay error o el valor no es
// exactamente true, modoPrueba = true (la app asume que NO se escribe en YiQi).
export function useModoPruebaYiqi() {
  const [modoPrueba, setModoPrueba] = useState(true)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      let habilitada
      try {
        const { data, error } = await supabase
          .from('reglas_compra')
          .select('escritura_yiqi_habilitada')
          .eq('id', 1)
          .maybeSingle()
        habilitada = !error && data?.escritura_yiqi_habilitada === true
      } catch {
        habilitada = false
      }
      if (vivo) {
        setModoPrueba(!habilitada)
        setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [])

  return { modoPrueba, cargando }
}
