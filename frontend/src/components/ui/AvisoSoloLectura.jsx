// 10/11/2026 — radiografía UX (ítem 6): franja sobria que le dice al operador
// que una configuración es de solo lectura. El padre decide cuándo mostrarla
// (`!permisos.cargando && !permisos.esAdmin`).
export const TEXTO_SOLO_LECTURA = 'Solo lectura: esta configuración la edita Aris (administrador).'

export default function AvisoSoloLectura({ children = TEXTO_SOLO_LECTURA, className = '' }) {
  return (
    <div
      role="status"
      className={`flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[var(--border)] bg-gray-50 text-[12.5px] text-[var(--sub)] ${className}`}
    >
      <i className="ti ti-lock text-[14px]" aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}
