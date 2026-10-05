import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import EncabezadoPagina from '../components/ui/EncabezadoPagina'
import BloqueAccion from '../components/ui/BloqueAccion'

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

// Rótulo de campo del prototipo v7 (.fl).
const ROTULO = 'text-[11px] text-[var(--sub)] uppercase tracking-[.04em] font-semibold'

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

// Diagnóstico histórico (agregado 20/8/2026, tabla yiqi_token_eventos):
// a diferencia de traerEstado() de arriba, esto NO dispara un intento
// de renovación en vivo -- solo lee lo que ya quedó guardado. Sirve
// para ver la señal temprana (fallas silenciosas de renovación en las
// últimas 24hs) incluso cuando "estado" de arriba dice que está todo
// bien porque el token guardado todavía no venció.
async function traerDiagnostico() {
  const { data, error } = await supabase.rpc('yiqi_estado_actual')
  if (error) throw new Error(error.message || 'Error llamando a yiqi_estado_actual')
  return Array.isArray(data) ? data[0] : data
}

export default function ConectorYiQi() {
  const [estado, setEstado] = useState(null)
  const [diagnostico, setDiagnostico] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function cargar() {
    setLoading(true)
    setError(null)
    try {
      const [data, diag] = await Promise.all([
        traerEstado(),
        traerDiagnostico().catch((err) => {
          console.error('[yiqi_estado_actual]', err)
          return null
        }),
      ])
      setEstado(data)
      setDiagnostico(diag)
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
      <EncabezadoPagina titulo="Conector YiQi" bajada="Diagnóstico de la integración en vivo">
        <button onClick={cargar} disabled={loading} className="btn btn-sm">
          <i className={`ti ${loading ? 'ti-loader-2 animate-spin' : 'ti-plug'}`} />
          {loading ? 'Verificando…' : 'Verificar ahora'}
        </button>
      </EncabezadoPagina>

      <div className="pagina flex flex-col gap-4">
        {error && (
          <BloqueAccion tono="rojo" titulo="No se pudo consultar el estado">
            {error}
          </BloqueAccion>
        )}

        {loading && !estado ? (
          <div className="p-8 text-center text-[var(--sub)] text-[13px]">Verificando conexión…</div>
        ) : estado ? (
          <>
            {/* Estado de conexión */}
            <div className="seccion">
              <div className="seccion-titulo flex items-center gap-2" style={{ marginBottom: 14 }}>
                <i className="ti ti-plug-connected text-[var(--ind)] text-[15px]" />
                Estado de la conexión
              </div>
              <div
                className={`flex items-center gap-2 px-4 py-3 rounded-[10px] border text-[13px] font-semibold ${
                  estado.conectado
                    ? 'bg-[var(--grn-bg)] border-[var(--grn-bd)] text-[var(--grn)]'
                    : 'bg-[var(--red-bg)] border-[var(--red-bd)] text-[var(--red)]'
                }`}
              >
                <i className={`ti ${estado.conectado ? 'ti-circle-check' : 'ti-circle-x'} text-[16px]`} />
                {estado.conectado ? 'Conectado a YiQi' : 'Sin conexión'}
              </div>
              {!estado.conectado && estado.error && (
                <p className="text-[13px] text-[var(--red)] mt-2">{estado.error}</p>
              )}

              {estado.conectado && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mt-4">
                  <div className="flex flex-col gap-[5px] min-w-0">
                    <div className={ROTULO}>Última sincronización</div>
                    <div className="text-[14px] font-semibold">{formatoFechaHora(estado.ultimaSync)}</div>
                  </div>
                  <div className="flex flex-col gap-[5px] min-w-0">
                    <div className={ROTULO}>Schema</div>
                    <div className="text-[14px] font-semibold">{estado.schemaId}</div>
                  </div>
                  <div className="flex flex-col gap-[5px] min-w-0">
                    <div className={ROTULO}>Base URL</div>
                    <div className="text-[14px] font-semibold truncate" title={estado.baseUrl}>
                      {estado.baseUrl}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Señal temprana (agregado 20/8/2026): renovaciones que
                fallaron en las últimas 24hs pero sin cortar el sync
                todavía, porque el token guardado alcanzaba. Antes de
                yiqi_token_eventos esto se perdía en logs efímeros --
                ahora queda visible acá aunque arriba diga "Conectado". */}
            {diagnostico && Number(diagnostico.fallos_recuperables_24h) > 0 && (
              <BloqueAccion
                tono="amarillo"
                titulo={
                  <span className="inline-flex items-center gap-1.5">
                    <i className="ti ti-alert-triangle text-[14px]" />
                    {diagnostico.fallos_recuperables_24h} renovación(es) de token fallaron en las últimas 24hs
                  </span>
                }
              >
                No cortó el sync porque el token guardado todavía alcanzaba, pero es la misma falla que termina en
                "Sin conexión" si se repite. Último intento fallido: {formatoFechaHora(diagnostico.ultimo_evento_en)}.
              </BloqueAccion>
            )}

            {/* Entidades permitidas */}
            <div className="seccion">
              <div className="seccion-titulo flex items-center gap-2">
                <i className="ti ti-api text-[var(--ind)] text-[15px]" />
                Entidades habilitadas para consultar
              </div>
              <div className="flex flex-wrap gap-2">
                {(estado.entidadesPermitidas ?? []).map((e) => (
                  <span key={e} className="badge bg-[#f3f4f6] text-[#374151] font-mono">
                    {e}
                  </span>
                ))}
              </div>
            </div>

            {/* Smarties conocidas (referencia fija, no viene de la API) */}
            <div className="seccion">
              <div className="seccion-titulo flex items-center gap-2" style={{ marginBottom: 14 }}>
                <i className="ti ti-database text-[var(--ind)] text-[15px]" />
                Smarties configuradas en YiQi
              </div>
              <div className="tw">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Nombre en YiQi</th>
                      <th>Entidad</th>
                      <th>smartieId</th>
                      <th>Uso</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="sku">API_Articulos_Stock NO BORRAR</td>
                      <td className="sku">MATERIAL</td>
                      <td className="font-semibold">2344</td>
                      <td className="text-[12px] text-[var(--sub)]">Monitor de Stock, Alertas, Proveedores, Usuarios y accesos</td>
                    </tr>
                    <tr>
                      <td className="sku">API_OC_Recientes NO BORRAR</td>
                      <td className="sku">REPORTE_DE_OC</td>
                      <td className="font-semibold">2345</td>
                      <td className="text-[12px] text-[var(--sub)]">Seguimiento de OC, Historial de OC, Órdenes de compra</td>
                    </tr>
                    <tr>
                      <td className="sku">API_Proveedores_Activos NO BORRAR</td>
                      <td className="sku">CLIENTE</td>
                      <td className="font-semibold">2346</td>
                      <td className="text-[12px] text-[var(--sub)]">Proveedores (datos de contacto)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="text-[11px] text-[var(--sub)] mt-2.5 flex items-start gap-1.5">
                <i className="ti ti-bulb text-[13px] mt-px" />
                <span>
                  Renombrar una smartie en YiQi cambia su smartieId — si alguien renombra alguna de estas, hay que
                  actualizar el código con el nuevo ID (ver hover sobre la pestaña en YiQi).
                </span>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
