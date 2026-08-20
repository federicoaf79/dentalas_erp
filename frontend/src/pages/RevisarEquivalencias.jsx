import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePermisos } from '../hooks/usePermisos'
import Aviso from '../components/Aviso'

// ============================================================
// RevisarEquivalencias.jsx — 20/8/2026
//
// Pantalla de revisión en tandas para "Comparación de precios": el
// sistema sugiere PARES de artículos de distintos proveedores con
// nombre parecido (candidatos_equivalencia_precios(), similitud de
// texto vía pg_trgm en el servidor); la persona confirma o rechaza
// cada par a mano. La confirmación queda en equivalencias_precios y
// alimenta la sección "Equivalencias confirmadas" de
// ComparacionPrecios.jsx.
//
// Criterio (decisión de Federico, 20/8/2026): confirmar significa "es
// el mismo producto, en la misma unidad de medida base" — SIN importar
// la presentación comercial (uno lo vende suelto, otro en caja de 1kg
// o bolsa de 100gr). Eso se explica en el aviso de la pantalla, no se
// intenta calcular.
// ============================================================

const TAMANIO_TANDA = 30

function formatoMoneda(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n)
}

export default function RevisarEquivalencias() {
  const permisos = usePermisos()

  const [tanda, setTanda] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [procesando, setProcesando] = useState(null) // yiqi_id_a-yiqi_id_b en curso
  const [revisadosEnSesion, setRevisadosEnSesion] = useState(0)
  const [tandaVacia, setTandaVacia] = useState(false)

  const cargarTanda = useCallback(async () => {
    setLoading(true)
    setError(null)
    setTandaVacia(false)
    try {
      const { data, error: err } = await supabase.rpc('candidatos_equivalencia_precios', {
        p_limite: TAMANIO_TANDA,
      })
      if (err) throw new Error(err.message)
      setTanda(data ?? [])
      setTandaVacia((data ?? []).length === 0)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (permisos.cargando || permisos.error) return
    cargarTanda()
  }, [permisos.cargando, permisos.error, cargarTanda])

  async function decidir(par, estado) {
    const clave = `${par.yiqi_id_a}-${par.yiqi_id_b}`
    setProcesando(clave)
    try {
      const { error: err } = await supabase.from('equivalencias_precios').insert({
        yiqi_id_menor: par.yiqi_id_a, // la RPC ya garantiza yiqi_id_a < yiqi_id_b
        yiqi_id_mayor: par.yiqi_id_b,
        estado,
        similitud_texto: par.similitud,
      })
      // Código 23505 = unique_violation: alguien más ya decidió este
      // par mientras tanto (dos personas revisando a la vez). No es un
      // error real para el usuario -- simplemente se saca de la tanda.
      if (err && err.code !== '23505') throw new Error(err.message)
      setTanda((prev) => prev.filter((p) => `${p.yiqi_id_a}-${p.yiqi_id_b}` !== clave))
      setRevisadosEnSesion((n) => n + 1)
    } catch (e) {
      setError(e.message)
    } finally {
      setProcesando(null)
    }
  }

  const cargandoAlgo = loading || permisos.cargando
  const vistaFiltrada = !permisos.cargando && !permisos.error && !permisos.esAdmin

  return (
    <div className="flex-1 overflow-y-auto bg-[#f7f8fa]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--border)] bg-white flex items-start justify-between gap-3">
        <div>
          <div className="text-[17px] font-bold">Revisar equivalencias de precios</div>
          <div className="text-[12px] text-[var(--sub)] mt-0.5">
            {cargandoAlgo
              ? 'Cargando…'
              : `Tanda actual: ${tanda.length} pares · revisados en esta sesión: ${revisadosEnSesion}`}
          </div>
        </div>
        <button
          onClick={cargarTanda}
          disabled={cargandoAlgo}
          className="px-3 py-1.5 rounded-lg text-[13px] font-semibold border border-[var(--border)] bg-white hover:bg-gray-50 disabled:opacity-50"
        >
          {cargandoAlgo ? 'Cargando…' : '↻ Cargar tanda nueva'}
        </button>
      </div>

      {/* Error de permisos */}
      {permisos.error && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-[var(--red)] rounded-lg p-4">
          <p className="font-semibold">No se pudieron determinar tus permisos</p>
          <p className="text-sm mt-1">{permisos.error}</p>
        </div>
      )}

      {/* Error de datos */}
      {error && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-[var(--red)] rounded-lg p-4">
          <p className="font-semibold">Ocurrió un error</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      )}

      {/* Explicación del criterio (importante, se deja fija) */}
      <Aviso tipo="info" id="revisar-equivalencias-criterio" className="mx-4 mt-4">
        Para cada par, la pregunta es: <strong>¿es el mismo producto, en la misma unidad de medida base, aunque
        cambie el proveedor?</strong> Ignorá la presentación comercial — si uno lo vende suelto y el otro en caja
        de 1kg o bolsa de 100gr, pero ambos son "100gr del mismo producto", contestá que sí. Lo que importa es que
        sea la misma unidad base, no cómo lo empaqueta cada proveedor.
      </Aviso>

      {vistaFiltrada && (
        <Aviso tipo="filtro" autoCerrarEn={15} className="mx-4 mt-2">
          Vista filtrada: solo te aparecen pares entre los {permisos.nombres.length} proveedores asignados a tu
          usuario.
        </Aviso>
      )}

      {/* Tandas */}
      <div className="px-4 pb-6 pt-2">
        {cargandoAlgo && (
          <div className="bg-white rounded-xl border border-[var(--border)] p-8 text-center text-[var(--sub)] text-sm">
            Buscando pares parecidos entre proveedores…
          </div>
        )}

        {!cargandoAlgo && tandaVacia && !error && (
          <div className="bg-white rounded-xl border border-[var(--border)] p-8 text-center text-[var(--sub)] text-sm">
            No hay más pares para revisar por ahora — o ya se revisaron todos los que YiQi tiene con nombre
            parecido, o no hay dos proveedores con artículos comparables en tu vista. Volvé a probar más adelante,
            cuando se sincronicen precios nuevos.
          </div>
        )}

        {!cargandoAlgo && tanda.length > 0 && (
          <div className="space-y-3">
            {tanda.map((par) => {
              const clave = `${par.yiqi_id_a}-${par.yiqi_id_b}`
              const enCurso = procesando === clave
              return (
                <div key={clave} className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
                  <div className="px-3.5 py-1.5 bg-gray-50 border-b border-[var(--border)] flex items-center justify-between">
                    <span className="text-[10px] font-bold text-[var(--sub)] uppercase tracking-wide">
                      Posible equivalencia
                    </span>
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600">
                      Coincidencia de nombre: {Math.round(par.similitud * 100)}%
                    </span>
                  </div>

                  <div className="grid grid-cols-2 divide-x divide-gray-100">
                    <div className="p-3.5">
                      <div className="text-[11px] text-[var(--sub)] mb-0.5">{par.proveedor_a}</div>
                      <div className="font-semibold text-sm">{par.mate_nombre_a}</div>
                      <div className="font-mono text-xs text-gray-400 mt-1">{par.sku_a}</div>
                      <div className="font-bold mt-1">{formatoMoneda(par.precio_final_a)}</div>
                    </div>
                    <div className="p-3.5">
                      <div className="text-[11px] text-[var(--sub)] mb-0.5">{par.proveedor_b}</div>
                      <div className="font-semibold text-sm">{par.mate_nombre_b}</div>
                      <div className="font-mono text-xs text-gray-400 mt-1">{par.sku_b}</div>
                      <div className="font-bold mt-1">{formatoMoneda(par.precio_final_b)}</div>
                    </div>
                  </div>

                  <div className="px-3.5 py-2.5 border-t border-[var(--border)] bg-gray-50 flex items-center justify-end gap-2">
                    <button
                      onClick={() => decidir(par, 'rechazado')}
                      disabled={enCurso}
                      className="px-3 py-1.5 rounded-lg text-[13px] font-semibold border border-[var(--border)] bg-white hover:bg-red-50 hover:text-[var(--red)] hover:border-red-200 disabled:opacity-50"
                    >
                      ✕ No es el mismo
                    </button>
                    <button
                      onClick={() => decidir(par, 'confirmado')}
                      disabled={enCurso}
                      className="px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-[var(--grn)] hover:opacity-90 disabled:opacity-50"
                    >
                      ✓ Sí, mismo producto
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {!cargandoAlgo && tanda.length === 0 && !tandaVacia && !error && (
          <div className="bg-white rounded-xl border border-[var(--border)] p-8 text-center text-[var(--sub)] text-sm">
            ¡Tanda completa! Revisaste los {TAMANIO_TANDA} pares.
            <div className="mt-3">
              <button
                onClick={cargarTanda}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white bg-[var(--ind,#4338ca)] hover:opacity-90"
              >
                Cargar la siguiente tanda
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
