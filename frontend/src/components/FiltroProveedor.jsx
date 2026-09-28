import { useMemo, useState } from 'react'

// ============================================================
// FiltroProveedor.jsx — 28/9/2026
// ============================================================
// UI del filtro de proveedores estilo YiQi (ver lib/filtroProveedor.js
// para la lógica de filtrado en sí y el criterio de scope). Compartido
// entre MonitorStock.jsx y Alertas.jsx.
// ============================================================
export default function FiltroProveedor({ proveedoresDisponibles, valor, onChange }) {
  const [abierto, setAbierto] = useState(false)
  const [excluirTexto, setExcluirTexto] = useState('')

  const modoActivo = valor.modo !== 'todos'
  const hayExcluidos = valor.excluidos.length > 0
  const filtroActivo = modoActivo || hayExcluidos

  const sugerenciasExcluir = useMemo(() => {
    if (!excluirTexto) return []
    const t = excluirTexto.toLowerCase()
    return proveedoresDisponibles
      .filter((p) => p.toLowerCase().includes(t) && !valor.excluidos.includes(p))
      .slice(0, 8)
  }, [excluirTexto, proveedoresDisponibles, valor.excluidos])

  function agregarExcluido(p) {
    onChange({ ...valor, excluidos: [...valor.excluidos, p] })
    setExcluirTexto('')
  }
  function quitarExcluido(p) {
    onChange({ ...valor, excluidos: valor.excluidos.filter((e) => e !== p) })
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className={`px-3 py-2 rounded-lg text-sm border whitespace-nowrap ${
          filtroActivo
            ? 'border-[var(--ind,#4338ca)] text-[var(--ind,#4338ca)] bg-indigo-50'
            : 'border-[var(--border)] bg-white text-gray-600'
        }`}
      >
        Proveedor{filtroActivo ? ' ●' : ''} ▾
      </button>
      {abierto && (
        <>
          {/* Backdrop invisible para cerrar al clickear afuera, mismo
              patrón que el buscador de "Agregar artículo" en NuevaOC.jsx. */}
          <div className="fixed inset-0 z-10" onClick={() => setAbierto(false)} />
          <div className="absolute z-20 mt-1 w-80 bg-white border border-[var(--border)] rounded-lg shadow-lg p-3">
            <div className="text-[11px] uppercase text-gray-400 font-semibold mb-1.5">Condición</div>
            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
              {[
                { key: 'todos', label: 'Todos' },
                { key: 'es', label: 'Es' },
                { key: 'no_es', label: 'No es' },
                { key: 'vacio', label: 'Es vacío' },
              ].map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() =>
                    onChange({ ...valor, modo: m.key, proveedor: m.key === 'vacio' ? '' : valor.proveedor })
                  }
                  className={`px-2 py-1 rounded text-[12px] font-semibold border ${
                    valor.modo === m.key
                      ? 'bg-[var(--ind,#4338ca)] text-white border-[var(--ind,#4338ca)]'
                      : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {(valor.modo === 'es' || valor.modo === 'no_es') && (
              <select
                value={valor.proveedor}
                onChange={(e) => onChange({ ...valor, proveedor: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm mb-1"
              >
                <option value="">Elegí un proveedor…</option>
                {proveedoresDisponibles.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            )}

            <div className="text-[11px] uppercase text-gray-400 font-semibold mb-1.5 mt-2">
              Excluir proveedores puntuales
            </div>
            <input
              type="text"
              value={excluirTexto}
              onChange={(e) => setExcluirTexto(e.target.value)}
              placeholder="Buscar proveedor para excluir…"
              className="w-full border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm"
            />
            {sugerenciasExcluir.length > 0 && (
              <div className="border border-[var(--border)] rounded-lg mt-1 max-h-32 overflow-y-auto">
                {sugerenciasExcluir.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => agregarExcluido(p)}
                    className="w-full text-left px-2 py-1.5 text-[13px] hover:bg-gray-50"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
            {hayExcluidos && (
              <div className="flex flex-wrap gap-1 mt-2">
                {valor.excluidos.map((p) => (
                  <span
                    key={p}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px]"
                  >
                    {p}
                    <button type="button" onClick={() => quitarExcluido(p)} className="text-gray-400 hover:text-[var(--red)]">
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => onChange({ modo: 'todos', proveedor: '', excluidos: [] })}
                className="text-[12px] text-gray-500 hover:underline"
              >
                Limpiar todo
              </button>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                className="text-[12px] font-semibold text-[var(--ind,#4338ca)] hover:underline"
              >
                Cerrar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
