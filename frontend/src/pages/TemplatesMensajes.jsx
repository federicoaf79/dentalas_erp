import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePermisos } from '../hooks/usePermisos'
import EncabezadoPagina from '../components/ui/EncabezadoPagina'

// ============================================================
// TemplatesMensajes.jsx
// Plantillas para enviarle la orden al proveedor.
//
// ACLARACIÓN IMPORTANTE que se muestra en pantalla: [19/8/2026] el
// template "tpl_wa_oc" ya se usa solo, desde el botón 💬 de Órdenes de
// compra (orden aprobada) y desde Nueva OC — abre WhatsApp con el texto
// ya completado. Sigue habiendo un paso manual (arrastrar el PDF a la
// conversación): WhatsApp no permite adjuntar un archivo por link, así
// que eso no es "semi" por elección de diseño, es un límite de WhatsApp.
// El envío por email todavía no está construido.
// ============================================================

// Datos de ejemplo para la vista previa. Son inventados a propósito y
// están rotulados como tales: sirven para ver cómo queda el formato,
// no para dar a entender que hay una orden real detrás.
const EJEMPLO = {
  empresa: 'Dentalab',
  proveedor: 'DENTAL MEDRANO',
  nro_orden: '17',
  fecha: '31/07/2026',
  total: '$ 1.284.500',
  cant_items: '6',
  items: [
    '• 1000 — Alginato Cromatico LASCOD Kromopan 450g — 24 un.',
    '• 33700 — Dientes NewcryL Surtidos — 10 un.',
    '• 6284 — Detergente Surgizime O3 Trienzimatico 1L — 12 un.',
  ].join('\n'),
  notas: 'Entregar en Depósito Central, de 9 a 17 hs.',
  contacto: 'Ivana — compras@dentalab.com.ar',
}

const VARIABLES = [
  { v: 'empresa',    d: 'Nombre de la empresa' },
  { v: 'proveedor',  d: 'Nombre del proveedor' },
  { v: 'nro_orden',  d: 'Número de la orden' },
  { v: 'fecha',      d: 'Fecha de emisión' },
  { v: 'total',      d: 'Total estimado' },
  { v: 'cant_items', d: 'Cantidad de artículos' },
  { v: 'items',      d: 'Lista de artículos' },
  { v: 'notas',      d: 'Notas de la orden' },
  { v: 'contacto',   d: 'Quién la envía' },
]

// Estilo de campo del prototipo v7 (.fl rótulo, .fi input, .fta textarea).
const ROTULO = 'text-[11px] text-[var(--sub)] uppercase tracking-[.04em] font-semibold mb-[5px]'
const INPUT =
  'px-3 py-2 border border-[#d1d5db] rounded-lg text-[13px] bg-[#f9fafb] outline-none focus:border-[var(--ind)] w-full disabled:text-gray-400 disabled:cursor-not-allowed'

export function renderTemplate(texto, datos) {
  return String(texto ?? '').replace(/\{\{(\w+)\}\}/g, (coincidencia, clave) =>
    datos[clave] != null ? String(datos[clave]) : coincidencia
  )
}

export default function TemplatesMensajes() {
  const permisos = usePermisos()
  const esAdmin = permisos.esAdmin

  const [templates, setTemplates] = useState([])
  const [selId, setSelId] = useState(null)
  const [form, setForm] = useState({ nombre: '', asunto: '', cuerpo: '' })
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)

  async function cargar() {
    setCargando(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('templates_mensaje')
        .select('*')
        .order('canal')
        .order('id')
      if (error) throw new Error(error.message)
      setTemplates(data ?? [])
      if (data?.length && selId == null) elegir(data[0])
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    if (permisos.cargando || permisos.error) return
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permisos.cargando, permisos.error])

  function elegir(t) {
    setSelId(t.id)
    setForm({ nombre: t.nombre ?? '', asunto: t.asunto ?? '', cuerpo: t.cuerpo ?? '' })
    setAviso(null)
  }

  const sel = useMemo(() => templates.find((t) => t.id === selId) ?? null, [templates, selId])

  const huboCambios =
    sel &&
    ((form.nombre ?? '') !== (sel.nombre ?? '') ||
      (form.asunto ?? '') !== (sel.asunto ?? '') ||
      (form.cuerpo ?? '') !== (sel.cuerpo ?? ''))

  async function guardar() {
    if (!sel) return
    setGuardando(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('templates_mensaje')
        .update({
          nombre: form.nombre.trim() || sel.nombre,
          asunto: form.asunto?.trim() || null,
          cuerpo: form.cuerpo,
          actualizado_por: user?.id ?? null,
          actualizado_en: new Date().toISOString(),
        })
        .eq('id', sel.id)
      if (error) throw new Error(error.message)
      setAviso('Plantilla guardada.')
      await cargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  function insertarVariable(v) {
    setForm((f) => ({ ...f, cuerpo: `${f.cuerpo}{{${v}}}` }))
  }

  const previewAsunto = renderTemplate(form.asunto, EJEMPLO)
  const previewCuerpo = renderTemplate(form.cuerpo, EJEMPLO)

  async function copiar() {
    try {
      const texto = sel?.canal === 'email' && previewAsunto
        ? `${previewAsunto}\n\n${previewCuerpo}`
        : previewCuerpo
      await navigator.clipboard.writeText(texto)
      setAviso('Vista previa copiada al portapapeles.')
    } catch {
      setError('No se pudo copiar. Seleccioná el texto manualmente.')
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#f7f8fa]">
      <EncabezadoPagina
        titulo="Templates de mensajes"
        bajada="Textos con los que se le envía la orden al proveedor"
        info="La plantilla de WhatsApp ya se usa sola desde el botón 💬 de una orden aprobada (Órdenes de compra) y desde Nueva OC: abre WhatsApp con este texto completado. Queda un paso manual — arrastrar el PDF de la orden a la conversación — porque WhatsApp no permite adjuntar un archivo por link. El envío automático por email todavía no está implementado."
      >
        {esAdmin && sel && (
          <button
            onClick={guardar}
            disabled={guardando || !huboCambios}
            className="btn btn-sm btn-pri"
          >
            <i className="ti ti-device-floppy" />
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        )}
      </EncabezadoPagina>

      {(error || aviso) && (
        <div className="px-7 pt-5 flex flex-col gap-2.5">
          {error && <div className="bloque bloque-rojo text-[13px]">{error}</div>}
          {aviso && (
            <div className="bloque bloque-verde text-[13px] flex items-center justify-between gap-3">
              <span>{aviso}</span>
              <button onClick={() => setAviso(null)} className="opacity-60 hover:opacity-100 px-1" aria-label="Cerrar">
                <i className="ti ti-x" />
              </button>
            </div>
          )}
        </div>
      )}

      {cargando ? (
        <div className="p-10 text-center text-[var(--sub)] text-[13px]">Cargando plantillas…</div>
      ) : (
        <div className="pagina grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Editor */}
          <div className="seccion">
            <div className="seccion-titulo flex items-center gap-2">
              <i className={`ti ${sel?.canal === 'whatsapp' ? 'ti-brand-whatsapp text-[var(--grn)]' : 'ti-mail text-[var(--ind)]'} text-[15px]`} />
              {sel ? `Template de ${sel.canal === 'whatsapp' ? 'WhatsApp' : 'email'}` : 'Plantilla'}
            </div>
            <div className="flex gap-2 mb-3.5 flex-wrap">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => elegir(t)}
                  className={`chip inline-flex items-center gap-1.5 ${selId === t.id ? 'chip-on' : ''}`}
                >
                  <i className={`ti ${t.canal === 'email' ? 'ti-mail' : 'ti-brand-whatsapp'} text-[14px]`} /> {t.nombre}
                </button>
              ))}
            </div>

            {sel && (
              <>
                {sel.canal === 'email' && (
                  // 6/9/2026 (auditoría UX, H-10): el banner de arriba explica que
                  // el envío por email no está implementado, pero es un <Aviso>
                  // que se puede cerrar con la X -- una vez cerrado, no queda
                  // ningún indicio acá adentro de que este editor no manda nada
                  // solo. Este aviso vive DENTRO del editor, no se puede cerrar,
                  // para que no desaparezca justo donde más hace falta.
                  <div className="bloque bloque-amarillo mb-3 text-[12px] flex items-start gap-2">
                    <i className="ti ti-alert-triangle text-[14px] mt-px" />
                    <span>Esta plantilla todavía no se envía sola por email — hoy solo sirve para ver el
                    formato. El envío automático no está construido.</span>
                  </div>
                )}
                <label className="block mb-3">
                  <div className={ROTULO}>Nombre de la plantilla</div>
                  <input
                    value={form.nombre}
                    disabled={!esAdmin}
                    onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                    className={INPUT}
                  />
                </label>

                {sel.canal === 'email' && (
                  <label className="block mb-3">
                    <div className={ROTULO}>Asunto</div>
                    <input
                      value={form.asunto}
                      disabled={!esAdmin}
                      onChange={(e) => setForm((f) => ({ ...f, asunto: e.target.value }))}
                      className={INPUT}
                    />
                  </label>
                )}

                <label className="block">
                  <div className={ROTULO}>Mensaje</div>
                  <textarea
                    value={form.cuerpo}
                    disabled={!esAdmin}
                    rows={14}
                    onChange={(e) => setForm((f) => ({ ...f, cuerpo: e.target.value }))}
                    className={`${INPUT} font-mono leading-relaxed resize-y min-h-[100px]`}
                  />
                </label>

                {esAdmin && (
                  <div className="mt-3">
                    <div className="text-[11px] text-[var(--sub)] mb-1.5">
                      Variables disponibles — click para insertar
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {VARIABLES.map((v) => (
                        <button
                          key={v.v}
                          onClick={() => insertarVariable(v.v)}
                          title={v.d}
                          className="px-[7px] py-0.5 rounded-[10px] bg-[var(--ind-bg)] text-[var(--ind)] text-[11px] font-semibold hover:bg-[var(--ind-lt)]"
                        >
                          {'{{'}{v.v}{'}}'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Vista previa */}
          <div className="seccion">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="seccion-titulo flex items-center gap-2" style={{ marginBottom: 0 }}>
                <i className="ti ti-eye text-[var(--ind)] text-[15px]" />
                Vista previa {sel?.canal === 'whatsapp' ? '· WhatsApp' : '· Email'}
              </div>
              <button onClick={copiar} className="btn btn-sm">
                <i className="ti ti-copy" /> Copiar texto
              </button>
            </div>

            {sel?.canal === 'whatsapp' ? (
              <div className="bg-[#e5ddd5] rounded-lg p-3 min-h-[320px]">
                <div className="bg-[#dcf8c6] rounded-lg rounded-tr-none p-2.5 text-[13px] whitespace-pre-line shadow-sm max-w-[92%] ml-auto leading-relaxed">
                  {previewCuerpo || <span className="text-gray-400 italic">Escribí el mensaje…</span>}
                </div>
              </div>
            ) : (
              <div className="border border-[var(--grn-bd)] rounded-[10px] overflow-hidden min-h-[320px]">
                <div className="bg-[#f9fafb] border-b border-[var(--grn-bd)] px-3.5 py-2">
                  <div className="text-[10px] text-gray-400 uppercase">Asunto</div>
                  <div className="text-[13px] font-semibold">
                    {previewAsunto || <span className="text-gray-400 italic font-normal">Sin asunto</span>}
                  </div>
                </div>
                <div className="bg-[var(--grn-bg)] p-3.5 text-[13px] text-[#1a4a2e] whitespace-pre-line leading-[1.7]">
                  {previewCuerpo || <span className="text-gray-400 italic">Escribí el mensaje…</span>}
                </div>
              </div>
            )}

            <div className="text-[11px] text-[var(--sub)] mt-2">
              Los datos de la vista previa son de ejemplo. Al usar la plantilla se reemplazan por los de la
              orden real.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
