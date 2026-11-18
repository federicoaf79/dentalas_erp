import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// 18/11/2026 — copia firmada del remito entre depósitos.
// Lista las copias subidas a un pedido y permite subir una foto o PDF del remito firmado.
// Archivos en el bucket privado `remitos-firmados` (path <solicitud_id>/<timestamp>-<nombre>),
// registro en public.remitos_firmados vía RPC registrar_remito_firmado.
// Si la migración 20261118140000 todavía no está aplicada, no rompe: muestra un texto gris.
const MAX_BYTES = 10 * 1024 * 1024

function sanear(nombre) {
  const limpio = String(nombre || 'remito')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return (limpio || 'remito').slice(-80)
}

function fechaCorta(x) {
  try { return new Date(x).toLocaleString('es-AR', { hourCycle: 'h23' }) } catch { return '' }
}

export default function RemitoFirmado({ solicitudId, puedeSubir = true, compacto = false }) {
  const [copias, setCopias] = useState([])
  const [cargando, setCargando] = useState(true)
  const [noDisponible, setNoDisponible] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [mensaje, setMensaje] = useState(null) // { ok, texto }
  const inputRef = useRef(null)

  const cargar = useCallback(async () => {
    if (!solicitudId) return
    const { data, error } = await supabase
      .from('remitos_firmados')
      .select('id, storage_path, nombre_archivo, tipo, tamano_bytes, subido_por, subido_en, nota')
      .eq('solicitud_id', solicitudId)
      .order('subido_en', { ascending: false })
    if (error) {
      setNoDisponible(true)
      setCopias([])
    } else {
      setNoDisponible(false)
      setCopias(data || [])
    }
    setCargando(false)
  }, [solicitudId])

  useEffect(() => { setCargando(true); cargar() }, [cargar])

  async function ver(c) {
    // Abrir la pestaña antes del await para que el navegador no la bloquee.
    const ventana = window.open('', '_blank')
    const { data, error } = await supabase.storage.from('remitos-firmados').createSignedUrl(c.storage_path, 120)
    if (error || !data?.signedUrl) {
      if (ventana) ventana.close()
      setMensaje({ ok: false, texto: 'No se pudo abrir el archivo. Probá de nuevo en un rato.' })
      return
    }
    if (ventana) ventana.location.href = data.signedUrl
    else window.open(data.signedUrl, '_blank')
  }

  async function subir(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setMensaje(null)
    if (file.size > MAX_BYTES) {
      setMensaje({ ok: false, texto: 'El archivo pesa más de 10 MB. Sacale la foto con menos resolución o mandá un PDF más liviano.' })
      return
    }
    setSubiendo(true)
    const path = `${solicitudId}/${Date.now()}-${sanear(file.name)}`
    const { error: errSubida } = await supabase.storage
      .from('remitos-firmados')
      .upload(path, file, { upsert: false, contentType: file.type || undefined })
    if (errSubida) {
      setSubiendo(false)
      setMensaje({ ok: false, texto: 'No se pudo subir el archivo. Revisá que sea una foto o un PDF y que tengas permiso sobre este pedido.' })
      return
    }
    const { error: errRpc } = await supabase.rpc('registrar_remito_firmado', {
      p_solicitud_id: solicitudId,
      p_path: path,
      p_nombre: file.name,
      p_tipo: file.type || null,
      p_tamano: file.size,
      p_nota: null,
    })
    setSubiendo(false)
    if (errRpc) {
      setMensaje({ ok: false, texto: 'El archivo se subió pero no quedó registrado en el pedido. Avisale a Federico.' })
      return
    }
    setMensaje({ ok: true, texto: 'Subido ✓' })
    cargar()
  }

  if (!solicitudId) return null
  if (cargando) return null
  if (noDisponible) {
    return <span className="text-xs text-gray-400">Remito firmado: no disponible por ahora</span>
  }

  const boton = puedeSubir && (
    <>
      <input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={subir} />
      <button
        type="button"
        disabled={subiendo}
        onClick={() => inputRef.current?.click()}
        className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
      >
        {subiendo ? 'Subiendo…' : '📎 Subir remito firmado'}
      </button>
    </>
  )

  const aviso = mensaje && (
    <span className={`text-xs ${mensaje.ok ? 'text-green-700' : 'text-red-600'}`}>{mensaje.texto}</span>
  )

  if (compacto) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2 text-xs">
        {copias.length === 0 ? (
          <span className="text-amber-700/80">Remito firmado: todavía no se subió</span>
        ) : (
          <span className="text-gray-700">
            Remito firmado ({copias.length}){' '}
            <button type="button" onClick={() => ver(copias[0])} className="underline text-blue-700">Ver</button>
          </span>
        )}
        {boton}
        {aviso}
      </span>
    )
  }

  return (
    <div className="text-sm space-y-1">
      {copias.length === 0 ? (
        <div className="text-xs text-amber-700/80">Remito firmado: todavía no se subió</div>
      ) : (
        <ul className="space-y-0.5">
          {copias.map((c) => (
            <li key={c.id} className="text-xs text-gray-700 flex flex-wrap items-center gap-2">
              <span>📄 {c.nombre_archivo || 'Remito firmado'}</span>
              <span className="text-gray-400">{fechaCorta(c.subido_en)}</span>
              <button type="button" onClick={() => ver(c)} className="underline text-blue-700">Ver</button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">{boton}{aviso}</div>
    </div>
  )
}
