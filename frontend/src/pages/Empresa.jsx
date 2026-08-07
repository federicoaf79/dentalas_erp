import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePermisos } from '../hooks/usePermisos'
import Aviso from '../components/Aviso'

// ============================================================
// Empresa.jsx
// Datos de Dentalab que encabezan las órdenes de compra: membrete
// del PDF y de los mensajes al proveedor.
//
// El logo se guarda como URL, no como archivo subido. Es una decisión
// deliberada: subir requiere configurar Storage con sus políticas, y
// una URL funciona hoy. Si más adelante quieren carga de archivo, se
// agrega sin cambiar nada de lo que consume este dato.
// ============================================================

const CAMPOS = [
  { key: 'nombre',       label: 'Nombre comercial',  placeholder: 'Dentalab',                    ancho: 'col-span-1' },
  { key: 'razon_social', label: 'Razón social',      placeholder: 'Dentalab S.R.L.',             ancho: 'col-span-1' },
  { key: 'cuit',         label: 'CUIT',              placeholder: '30-12345678-9',               ancho: 'col-span-1' },
  { key: 'telefono',     label: 'Teléfono',          placeholder: '011 4000-0000',               ancho: 'col-span-1' },
  { key: 'direccion',    label: 'Dirección',         placeholder: 'Av. Siempreviva 742',         ancho: 'col-span-1' },
  { key: 'localidad',    label: 'Localidad',         placeholder: 'CABA, Buenos Aires',          ancho: 'col-span-1' },
  { key: 'email',        label: 'Email de compras',  placeholder: 'compras@dentalab.com.ar',     ancho: 'col-span-1' },
  { key: 'web',          label: 'Sitio web',         placeholder: 'dentalab.com.ar',             ancho: 'col-span-1' },
]

export default function Empresa() {
  const permisos = usePermisos()
  const esAdmin = permisos.esAdmin

  const [datos, setDatos] = useState(null)
  const [form, setForm] = useState({})
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [logoRoto, setLogoRoto] = useState(false)

  async function cargar() {
    setCargando(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('empresa_config')
        .select('*')
        .eq('id', 1)
        .maybeSingle()
      if (error) throw new Error(error.message)
      setDatos(data)
      setForm(data ?? {})
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

  useEffect(() => { setLogoRoto(false) }, [form.logo_url])

  async function guardar() {
    setGuardando(true)
    setError(null)
    setAviso(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const patch = {}
      for (const c of CAMPOS) patch[c.key] = form[c.key]?.trim() || null
      patch.logo_url = form.logo_url?.trim() || null
      patch.pie_pagina = form.pie_pagina?.trim() || null
      patch.actualizado_por = user?.id ?? null
      patch.actualizado_en = new Date().toISOString()
      // nombre es not null: si lo vaciaron, dejamos el anterior
      if (!patch.nombre) patch.nombre = datos?.nombre ?? 'Dentalab'

      const { error } = await supabase.from('empresa_config').update(patch).eq('id', 1)
      if (error) throw new Error(error.message)
      setAviso('Datos guardados. Se usan en las órdenes de compra que se generen de ahora en más.')
      await cargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  const huboCambios =
    datos &&
    [...CAMPOS.map((c) => c.key), 'logo_url', 'pie_pagina'].some(
      (k) => (form[k] ?? '') !== (datos[k] ?? '')
    )

  return (
    <div className="flex-1 overflow-y-auto bg-[#f7f8fa]">
      <div className="px-6 py-4 border-b border-[var(--border)] bg-white flex items-start justify-between gap-3">
        <div>
          <div className="text-[17px] font-bold">Datos de la empresa</div>
          <div className="text-[12px] text-[var(--sub)] mt-0.5">
            Encabezan las órdenes de compra en PDF y los mensajes al proveedor
          </div>
        </div>
        {esAdmin && (
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

      {!esAdmin && !permisos.cargando && (
        <Aviso tipo="info" id="empresa-solo-lectura" className="mx-4 mt-4">
          Estos datos los configura Aris.
        </Aviso>
      )}

      {cargando ? (
        <div className="p-10 text-center text-[var(--sub)] text-sm">Cargando…</div>
      ) : (
        <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-2.5">
          {/* Formulario */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-[var(--border)] p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {CAMPOS.map((c) => (
                <label key={c.key} className={c.ancho}>
                  <div className="text-[11px] text-gray-400 uppercase mb-1">{c.label}</div>
                  <input
                    value={form[c.key] ?? ''}
                    disabled={!esAdmin}
                    placeholder={c.placeholder}
                    onChange={(e) => setForm((f) => ({ ...f, [c.key]: e.target.value }))}
                    className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm w-full disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </label>
              ))}
            </div>

            <label className="block mt-3">
              <div className="text-[11px] text-gray-400 uppercase mb-1">URL del logo</div>
              <input
                value={form.logo_url ?? ''}
                disabled={!esAdmin}
                placeholder="https://dentalab.com.ar/logo.png"
                onChange={(e) => setForm((f) => ({ ...f, logo_url: e.target.value }))}
                className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm w-full disabled:bg-gray-50 disabled:text-gray-400"
              />
              <div className="text-[11px] text-gray-400 mt-1">
                Dirección de una imagen ya publicada en internet. Click derecho sobre el logo en el sitio →
                “Copiar dirección de la imagen”.
              </div>
            </label>

            <label className="block mt-3">
              <div className="text-[11px] text-gray-400 uppercase mb-1">Pie de página (opcional)</div>
              <textarea
                value={form.pie_pagina ?? ''}
                disabled={!esAdmin}
                rows={2}
                placeholder="Condiciones generales, horario de recepción de mercadería, etc."
                onChange={(e) => setForm((f) => ({ ...f, pie_pagina: e.target.value }))}
                className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm w-full disabled:bg-gray-50 disabled:text-gray-400"
              />
            </label>
          </div>

          {/* Vista previa del membrete */}
          <div className="bg-white rounded-xl border border-[var(--border)] p-4">
            <div className="text-[11px] text-gray-400 uppercase mb-2.5">Así se va a ver</div>
            <div className="border border-gray-200 rounded-lg p-4 bg-white">
              <div className="flex items-start gap-3 pb-3 border-b border-gray-200">
                {form.logo_url && !logoRoto ? (
                  <img
                    src={form.logo_url}
                    alt=""
                    onError={() => setLogoRoto(true)}
                    className="h-12 w-auto object-contain flex-shrink-0"
                  />
                ) : (
                  <div className="h-12 w-12 rounded bg-gray-100 flex items-center justify-center text-[10px] text-gray-400 flex-shrink-0 text-center leading-tight">
                    {logoRoto ? 'logo\nno carga' : 'sin\nlogo'}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="font-bold text-[15px] truncate">{form.nombre || 'Dentalab'}</div>
                  {form.razon_social && (
                    <div className="text-[11px] text-gray-500 truncate">{form.razon_social}</div>
                  )}
                  {form.cuit && <div className="text-[11px] text-gray-500">CUIT {form.cuit}</div>}
                </div>
              </div>
              <div className="pt-2.5 text-[11px] text-gray-500 space-y-0.5">
                {form.direccion && <div>{form.direccion}{form.localidad ? `, ${form.localidad}` : ''}</div>}
                {form.telefono && <div>Tel. {form.telefono}</div>}
                {form.email && <div>{form.email}</div>}
                {form.web && <div>{form.web}</div>}
                {!form.direccion && !form.telefono && !form.email && !form.web && (
                  <div className="text-gray-300 italic">Completá los datos de contacto</div>
                )}
              </div>
              <div className="mt-3 pt-2.5 border-t border-gray-200">
                <div className="text-[13px] font-bold">ORDEN DE COMPRA #—</div>
                <div className="text-[11px] text-gray-400">Proveedor · Fecha · Total</div>
              </div>
              {form.pie_pagina && (
                <div className="mt-3 pt-2.5 border-t border-gray-200 text-[10px] text-gray-400 whitespace-pre-line">
                  {form.pie_pagina}
                </div>
              )}
            </div>

            {logoRoto && form.logo_url && (
              <div className="text-[11px] text-[var(--red)] mt-2">
                La imagen no se pudo cargar. Verificá que la dirección sea pública y termine en .png, .jpg o .svg.
              </div>
            )}
          </div>
        </div>
      )}

      {datos?.actualizado_en && !cargando && (
        <div className="mx-4 mb-6 text-[11px] text-gray-400">
          Última modificación: {new Date(datos.actualizado_en).toLocaleString('es-AR')}
        </div>
      )}
    </div>
  )
}
