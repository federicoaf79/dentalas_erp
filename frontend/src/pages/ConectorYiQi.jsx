import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// ============================================================
// ConectorYiQi.jsx — pantalla nueva (15 julio 2026)
// ============================================================
//
// Vista de DIAGNÓSTICO de la integración con YiQi -- no es una
// pantalla operativa, es para ver de un vistazo si la conexión
// está viva, cuándo fue la última sincronización, y qué entidades
// están habilitadas. Nunca muestra el Bearer token (la Edge
// Function solo devuelve un subconjunto seguro de datos).
// ============================================================

function formatoFechaHora(fechaStr) {
  if (!fechaStr) return 'Nunca'
  try {
    return new Date(fechaStr).toLocaleString('es-AR')
  } catch {
    return fechaStr
  }
}

async function traerEstado() {
  const { data, error } = await supabase.functions.invoke('yiqi-connector?accion=estado')
  if (error) throw new Error(error.message || 'Error llamando a yiqi-connector')
  return data
}

export default function ConectorYiQi() {
  const [estado, setEstado] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function cargar() {
    setLoading(true)
    setError(null)
    try {
      const data = await traerEstado()
      setEstado(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargar()
  }, [])

  return (
    <div className="flex-1 overflow-y-auto bg-[#f7f8fa]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--border)] bg-white flex items-start justify-between gap-3">
        <div>
          <div className="text-[17px] font-bold">Conector YiQi</div>
          <div className="text-[12px] text-[var(--sub)] mt-0.5">Diagnóstico de la integración en vivo</div>
        </div>
        <button
          onClick={cargar}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg text-[13px] font-semibold border border-[var(--border)] bg-white hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? 'Verificando…' : '↻ Verificar ahora'}
        </button>
      </div>

      {error && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-[var(--red)] rounded-lg p-4">
          <p className="font-semibold">No se pudo consultar el estado</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      )}

      {loading && !estado ? (
        <div className="p-8 text-center text-[var(--sub)] text-sm">Verificando conexión…</div>
      ) : estado ? (
        <div className="mx-4 mt-4 space-y-4">
          {/* Estado de conexión */}
          <div className="bg-white rounded-xl border border-[var(--border)] p-5">
            <div className="flex items-center gap-3">
              <span
                className={`w-3 h-3 rounded-full ${
                  estado.conectado ? 'bg-[var(--grn)]' : 'bg-[var(--red)]'
                }`}
              />
              <span className="text-lg font-bold">
                {estado.conectado ? 'Conectado a YiQi' : 'Sin conexión'}
              </span>
            </div>
            {!estado.conectado && estado.error && (
              <p className="text-sm text-[var(--red)] mt-2">{estado.error}</p>
            )}
          </div>

          {estado.conectado && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-xl border border-[var(--border)] p-4">
                <div className="text-[10px] text-[var(--sub)] uppercase tracking-wide mb-1">
                  Última sincronización
                </div>
                <div className="text-sm font-semibold">{formatoFechaHora(estado.ultimaSync)}</div>
              </div>
              <div className="bg-white rounded-xl border border-[var(--border)] p-4">
                <div className="text-[10px] text-[var(--sub)] uppercase tracking-wide mb-1">Schema</div>
                <div className="text-sm font-semibold">{estado.schemaId}</div>
              </div>
              <div className="bg-white rounded-xl border border-[var(--border)] p-4">
                <div className="text-[10px] text-[var(--sub)] uppercase tracking-wide mb-1">Base URL</div>
                <div className="text-sm font-semibold truncate" title={estado.baseUrl}>
                  {estado.baseUrl}
                </div>
              </div>
            </div>
          )}

          {/* Entidades permitidas */}
          <div className="bg-white rounded-xl border border-[var(--border)] p-5">
            <div className="text-[13px] font-bold mb-3">Entidades habilitadas para consultar</div>
            <div className="flex flex-wrap gap-2">
              {(estado.entidadesPermitidas ?? []).map((e) => (
                <span
                  key={e}
                  className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-mono"
                >
                  {e}
                </span>
              ))}
            </div>
          </div>

          {/* Smarties conocidas (referencia fija, no viene de la API) */}
          <div className="bg-white rounded-xl border border-[var(--border)] p-5">
            <div className="text-[13px] font-bold mb-3">Smarties configuradas en YiQi</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 text-[11px] uppercase">
                  <th className="py-1.5">Nombre en YiQi</th>
                  <th className="py-1.5">Entidad</th>
                  <th className="py-1.5">smartieId</th>
                  <th className="py-1.5">Uso</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-gray-100">
                  <td className="py-1.5 font-mono text-xs">API_Articulos_Stock NO BORRAR</td>
                  <td className="py-1.5 font-mono text-xs">MATERIAL</td>
                  <td className="py-1.5">2344</td>
                  <td className="py-1.5 text-gray-500">Monitor de Stock, Alertas, Proveedores, Usuarios y accesos</td>
                </tr>
                <tr className="border-t border-gray-100">
                  <td className="py-1.5 font-mono text-xs">API_OC_Recientes NO BORRAR</td>
                  <td className="py-1.5 font-mono text-xs">REPORTE_DE_OC</td>
                  <td className="py-1.5">2345</td>
                  <td className="py-1.5 text-gray-500">Seguimiento de OC, Historial de OC, Órdenes de compra</td>
                </tr>
                <tr className="border-t border-gray-100">
                  <td className="py-1.5 font-mono text-xs">API_Proveedores_Activos NO BORRAR</td>
                  <td className="py-1.5 font-mono text-xs">CLIENTE</td>
                  <td className="py-1.5">2346</td>
                  <td className="py-1.5 text-gray-500">Proveedores (datos de contacto)</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="text-[11px] text-gray-400 px-1">
            💡 Renombrar una smartie en YiQi cambia su smartieId — si alguien renombra alguna de estas, hay que
            actualizar el código con el nuevo ID (ver hover sobre la pestaña en YiQi).
          </div>
        </div>
      ) : null}
    </div>
  )
}
