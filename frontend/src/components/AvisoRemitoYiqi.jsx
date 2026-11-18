// ============================================================
// components/AvisoRemitoYiqi.jsx — 18/11/2026
// ============================================================
// Camino B (decisión de Federico, 18/11): la app planifica el pedido entre
// depósitos y lo escribe en YiQi como "Remito Interno" Pendiente; los depósitos
// lo envían, lo reciben y lo procesan en YiQi, y YiQi mueve el stock. Para esos
// pedidos (solicitudes_reposicion.gestion_en_yiqi = true) las pantallas de
// depósito no muestran acciones: muestran este aviso con el link a YiQi.
// Las columnas yiqi_* las agrega la migración del agente G; si todavía no
// existen, gestion_en_yiqi viene undefined y nada de esto se muestra.
// ============================================================

export function urlRemitoYiqi(solicitud) {
  if (!solicitud?.yiqi_remito_id) return null
  return `https://me.yiqi.com.ar/view/REMITO_INTERNO?schemaId=328#/${solicitud.yiqi_remito_id}`
}

// Tono de la pastilla según el estado del remito en YiQi: verde Procesado, azul Pendiente/Enviado, gris Anulado.
export function tonoEstadoYiqi(estado) {
  const e = String(estado ?? '').toLowerCase()
  if (e.startsWith('proces')) return 'verde'
  if (e.startsWith('anul')) return 'gris'
  return 'azul'
}

export function textoRemitoYiqi(solicitud) {
  const nro = solicitud?.yiqi_remito_nro ?? solicitud?.yiqi_remito_id
  const estado = solicitud?.yiqi_remito_estado
  if (!nro) return estado ? `Remito interno en YiQi (${estado})` : 'Remito interno en YiQi (todavía sin número)'
  return `Remito interno N° ${nro}${estado ? ` (${estado})` : ''}`
}

export default function AvisoRemitoYiqi({ solicitud, className = '' }) {
  if (!solicitud?.gestion_en_yiqi) return null
  const url = urlRemitoYiqi(solicitud)
  return (
    <div
      className={`bg-blue-50 border border-blue-100 text-[#1d4ed8] rounded-lg px-3.5 py-2.5 text-[13px] ${className}`}
    >
      Este pedido se gestiona en YiQi: {textoRemitoYiqi(solicitud)}. Envialo, recibilo y procesalo desde YiQi, como
      siempre.
      {url && (
        <>
          {' '}
          <a href={url} target="_blank" rel="noreferrer" className="font-semibold underline">
            Abrir en YiQi ↗
          </a>
        </>
      )}
      {solicitud.yiqi_hay_diferencias && (
        <div className="mt-1 text-[#92400e] font-semibold">Con diferencias en YiQi.</div>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// Publicación de pedidos manuales en YiQi (18/11/2026)
// ------------------------------------------------------------
// Id de la solicitud que devuelve crear_remito_reposicion_manual (número, objeto o arreglo).
export function idSolicitudDeRpc(data) {
  if (data == null) return null
  if (Array.isArray(data)) return idSolicitudDeRpc(data[0])
  if (typeof data === 'object') return data.id ?? data.solicitud_id ?? data.crear_remito_reposicion_manual ?? null
  return data
}

// ¿Está prendido el módulo "Remito interno en YiQi"? true / false / null (no se pudo leer:
// puede ser RLS o columna inexistente; en ese caso se invoca igual, la función decide).
export async function moduloRemitoYiqiPrendido(supabase) {
  try {
    const { data, error } = await supabase
      .from('reglas_reposicion_central')
      .select('escribir_remito_en_yiqi')
      .limit(1)
      .maybeSingle()
    if (error || !data) return null
    return data.escribir_remito_en_yiqi === true
  } catch {
    return null
  }
}

// Fire-and-forget con espera corta: devuelve 'creado' | 'modo_prueba' | null.
// Nunca lanza: si falla, el pedido de la app ya se creó y no hay que romper nada.
export async function publicarPedidoEnYiqi(supabase, rpcData, { esperaMs = 6000 } = {}) {
  try {
    const solicitudId = idSolicitudDeRpc(rpcData)
    if (solicitudId == null) return null
    if ((await moduloRemitoYiqiPrendido(supabase)) === false) return null
    const llamada = supabase.functions
      .invoke('remito-interno-yiqi', { body: { accion: 'publicar', solicitud_id: solicitudId } })
      .then(({ data, error }) => {
        if (error) return null
        if (data?.modo_prueba) return 'modo_prueba'
        if (data?.error || data?.ok === false) return null
        return 'creado'
      })
      .catch(() => null)
    return await Promise.race([llamada, new Promise((r) => setTimeout(() => r(null), esperaMs))])
  } catch {
    return null
  }
}
