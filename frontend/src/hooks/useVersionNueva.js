import { useEffect, useRef, useState } from 'react'

// 17/11/2026 — feedback Ivana: la pestaña abierta días seguía con la versión vieja tras un deploy.
// Sin service worker ni config de build: compara el script principal cargado (/assets/index-*.js)
// con el que referencia hoy /index.html. Errores de red: silencio.
const INTERVALO_MS = 5 * 60 * 1000
const RE_SCRIPT = /src="(\/assets\/index-[^"]+\.js)"/

export default function useVersionNueva() {
  const [hayNueva, setHayNueva] = useState(false)
  const actual = useRef(null)

  useEffect(() => {
    try {
      actual.current =
        document.querySelector('script[type="module"][src*="/assets/"]')?.getAttribute('src') || null
    } catch {
      actual.current = null
    }
    if (!actual.current) return undefined // dev: sin bundle, no hay nada que comparar

    let vivo = true
    const chequear = async () => {
      try {
        const res = await fetch('/index.html', { cache: 'no-store' })
        if (!res.ok) return
        const m = RE_SCRIPT.exec(await res.text())
        if (vivo && m && m[1] !== actual.current) setHayNueva(true)
      } catch {
        /* sin red: silencio */
      }
    }
    const onVis = () => {
      if (document.visibilityState === 'visible') chequear()
    }
    const t = setInterval(chequear, INTERVALO_MS)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      vivo = false
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  return [hayNueva, () => setHayNueva(false)]
}
