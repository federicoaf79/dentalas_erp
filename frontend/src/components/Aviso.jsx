import { useEffect, useState } from 'react'

// ============================================================
// Aviso.jsx — cartel informativo cerrable, reutilizable.
//
// Reemplaza los <div> de aviso que estaban pegados a mano en cada
// pantalla. Dos comportamientos segun el tipo:
//
//   tipo="info"    (azul)  -> explicacion que se lee una vez.
//                             Se cierra con la X y NO vuelve mas
//                             (se recuerda en localStorage por `id`).
//
//   tipo="filtro"  (ambar) -> NO es un aviso, es un ESTADO: le dice al
//                             operador que lo que ve no es todo. Se
//                             auto-oculta a los 15 segundos y se puede
//                             cerrar con la X, pero NO se persiste:
//                             vuelve a mostrarse la proxima vez que se
//                             entra a la pantalla. Asi no ocupa lugar
//                             permanente, pero el dato nunca se pierde.
//
// Props:
//   tipo         'info' | 'filtro'   (default: 'info')
//   id           string — obligatorio si se quiere persistir el cierre
//   autoCerrarEn segundos; null = no se auto-oculta
//   className    clases extra para el contenedor (margenes, etc.)
// ============================================================

const ESTILOS = {
  info: 'bg-blue-50 border-blue-100 text-[#1d4ed8]',
  filtro: 'bg-[var(--yel-bg,#fef3c7)] border-amber-200 text-[#92400e]',
}

// El localStorage puede fallar (modo incognito, storage lleno, permisos).
// No es critico: si falla, el aviso simplemente vuelve a aparecer.
function leerCerrado(clave) {
  if (!clave) return false
  try {
    return window.localStorage.getItem(clave) === '1'
  } catch {
    return false
  }
}

function guardarCerrado(clave) {
  if (!clave) return
  try {
    window.localStorage.setItem(clave, '1')
  } catch {
    /* si no se puede guardar, el aviso vuelve la proxima vez. No pasa nada. */
  }
}

export default function Aviso({
  tipo = 'info',
  id = null,
  autoCerrarEn = null,
  className = '',
  children,
}) {
  // Solo los avisos de tipo "info" recuerdan que fueron cerrados.
  const clavePersistencia = tipo === 'info' && id ? `aviso-cerrado:${id}` : null

  const [visible, setVisible] = useState(() => !leerCerrado(clavePersistencia))

  // Auto-ocultado por tiempo. El timer se limpia al desmontar para no
  // dejar un setState colgado sobre un componente que ya no existe.
  useEffect(() => {
    if (!visible || !autoCerrarEn) return
    const t = setTimeout(() => setVisible(false), autoCerrarEn * 1000)
    return () => clearTimeout(t)
  }, [visible, autoCerrarEn])

  if (!visible) return null

  function cerrar() {
    setVisible(false)
    guardarCerrado(clavePersistencia)
  }

  return (
    <div
      className={`relative rounded-lg border px-4 py-2.5 pr-9 text-[12px] ${ESTILOS[tipo] ?? ESTILOS.info} ${className}`}
    >
      {children}
      <button
        onClick={cerrar}
        aria-label="Cerrar aviso"
        title="Cerrar"
        className="absolute top-1.5 right-2 leading-none text-[15px] opacity-50 hover:opacity-100 px-1"
      >
        ×
      </button>
    </div>
  )
}
