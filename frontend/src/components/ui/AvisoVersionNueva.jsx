import useVersionNueva from '../../hooks/useVersionNueva'

// 17/11/2026 — feedback Ivana: aviso de versión nueva de la app (distinto de "Datos de YiQi").
// Se puede ocultar hasta el próximo chequeo (5 min o al volver a la pestaña); no se descarta para siempre.
export default function AvisoVersionNueva() {
  const [hayNueva, ocultar] = useVersionNueva()
  if (!hayNueva) return null
  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-[1000] max-w-[360px] bg-white border border-[var(--border)] rounded-xl shadow-lg p-3 flex items-start gap-2.5"
    >
      <i className="ti ti-refresh text-[18px] text-[var(--ind)] mt-0.5" aria-hidden="true" />
      <div className="flex-1 text-[12px] text-gray-700">
        Hay una versión nueva de la app. Actualizá para ver los últimos cambios.
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-2.5 py-1 rounded-md bg-[var(--ind)] text-white text-[12px] font-semibold"
          >
            Actualizar
          </button>
          <button type="button" onClick={ocultar} className="px-2 py-1 text-[12px] text-gray-500 hover:text-gray-700">
            Después
          </button>
        </div>
      </div>
    </div>
  )
}
