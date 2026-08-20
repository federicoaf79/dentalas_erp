import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePermisos } from '../hooks/usePermisos'
import Aviso from '../components/Aviso'

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
      <div className="px-6 py-4 border-b border-[var(--border)] bg-white flex items-start justify-between gap-3">
        <div>
          <div className="text-[17px] font-bold">Templates de mensajes</div>
          <div className="text-[12px] text-[var(--sub)] mt-0.5">
            Textos con los que se le envía la orden al proveedor
          </div>
        </div>
        {esAdmin && sel && (
          <button
            onClick={guardar}
            disabled={guardando || !huboCambios}
            className="px-3.5 py-2 rounded-lg text-[13px] font-semibold bg-[var(--ind,#4338ca)] text-white hover:opacity-90 disabled:opacity-40"
          >
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        )}
      </div>

      {error && (
        <div className="mx-4 mt-4 bg-red-50 border border-red-200 text-[var(--red)] rounded-lg px-4 py-2.5 text-[13px]">
          {error}
        </div>
      )}
      {aviso && (
        <div className="mx-4 mt-4 bg-[var(--grn-bg,#dcfce7)] border border-green-200 text-[var(--grn,#3d9970)] rounded-lg px-4 py-2.5 text-[13px] flex items-center justify-between">
          <span>{aviso}</span>
          <button onClick={() => setAviso(null)} className="opacity-60 hover:opacity-100 px-1">×</button>
        </div>
      )}

      <Aviso tipo="info" id="templates-alcance" className="mx-4 mt-4">
        La plantilla de WhatsApp ya se usa sola desde el botón 💬 de una orden aprobada (Órdenes de
        compra) y desde Nueva OC: abre WhatsApp con este texto completado. Queda un paso manual —
        arrastrar el PDF de la orden a la conversación — porque WhatsApp no permite adjuntar un archivo
        por link. El envío automático por email todavía no está implementado.
      </Aviso>

      {cargando ? (
        <div className="p-10 text-center text-[var(--sub)] text-sm">Cargando plantillas…</div>
      ) : (
        <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-2.5">
          {/* Editor */}
          <div className="bg-white rounded-xl border border-[var(--border)] p-4">
            <div className="flex gap-2 mb-3 flex-wrap">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => elegir(t)}
                  className={`px-3 py-1.5 rounded-full text-sm border ${
                    selId === t.id
                      ? 'bg-[var(--ind,#4338ca)] text-white border-[var(--ind,#4338ca)]'
                      : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  {t.canal === 'email' ? '✉️' : '💬'} {t.nombre}
                </button>
              ))}
            </div>

            {sel && (
              <>
                <label className="block mb-3">
                  <div className="text-[11px] text-gray-400 uppercase mb-1">Nombre de la plantilla</div>
                  <input
                    value={form.nombre}
                    disabled={!esAdmin}
                    onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                    className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm w-full disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </label>

                {sel.canal === 'email' && (
                  <label className="block mb-3">
                    <div className="text-[11px] text-gray-400 uppercase mb-1">Asunto</div>
                    <input
                      value={form.asunto}
                      disabled={!esAdmin}
                      onChange={(e) => setForm((f) => ({ ...f, asunto: e.target.value }))}
                      className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm w-full disabled:bg-gray-50 disabled:text-gray-400"
                    />
                  </label>
                )}

                <label className="block">
                  <div className="text-[11px] text-gray-400 uppercase mb-1">Mensaje</div>
                  <textarea
                    value={form.cuerpo}
                    disabled={!esAdmin}
                    rows={14}
                    onChange={(e) => setForm((f) => ({ ...f, cuerpo: e.target.value }))}
                    className="border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] w-full font-mono leading-relaxed disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </label>

                {esAdmin && (
                  <div className="mt-3">
                    <div className="text-[11px] text-gray-400 uppercase mb-1.5">
                      Variables disponibles — click para insertar
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {VARIABLES.map((v) => (
                        <button
                          key={v.v}
                          onClick={() => insertarVariable(v.v)}
                          title={v.d}
                          className="px-2 py-1 rounded-md border border-gray-200 bg-gray-50 hover:border-[var(--ind,#4338ca)] hover:text-[var(--ind,#4338ca)] text-[11px] font-mono"
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
          <div className="bg-white rounded-xl border border-[var(--border)] p-4">
            <div className="flex items-center justify-between mb-2.5">
              <div className="text-[11px] text-gray-400 uppercase">
                Vista previa {sel?.canal === 'whatsapp' ? '· WhatsApp' : '· Email'}
              </div>
              <button
                onClick={copiar}
                className="text-[12px] text-[var(--ind,#4338ca)] hover:underline"
              >
                Copiar texto
              </button>
            </div>

            {sel?.canal === 'whatsapp' ? (
              <div className="bg-[#e5ddd5] rounded-lg p-3 min-h-[320px]">
                <div className="bg-[#dcf8c6] rounded-lg rounded-tr-none p-2.5 text-[13px] whitespace-pre-line shadow-sm max-w-[92%] ml-auto leading-relaxed">
                  {previewCuerpo || <span className="text-gray-400 italic">Escribí el mensaje…</span>}
                </div>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden min-h-[320px]">
                <div className="bg-gray-50 border-b border-gray-200 px-3 py-2">
                  <div className="text-[10px] text-gray-400 uppercase">Asunto</div>
                  <div className="text-[13px] font-semibold">
                    {previewAsunto || <span className="text-gray-400 italic font-normal">Sin asunto</span>}
                  </div>
                </div>
                <div className="p-3 text-[13px] whitespace-pre-line leading-relaxed">
                  {previewCuerpo || <span className="text-gray-400 italic">Escribí el mensaje…</span>}
                </div>
              </div>
            )}

            <div className="text-[11px] text-gray-400 mt-2.5">
              Los datos de la vista previa son de ejemplo. Al usar la plantilla se reemplazan por los de la
              orden real.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
