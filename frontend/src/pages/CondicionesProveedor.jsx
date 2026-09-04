import { Fragment, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePermisos } from '../hooks/usePermisos'
import Aviso from '../components/Aviso'

// ============================================================
// CondicionesProveedor.jsx
// Condiciones comerciales por proveedor: mínimo de compra, plazo de
// pago, contacto de pedidos, y el límite de aprobación propio.
//
// Estos datos NO están en YiQi (lo verificamos: el plazo de pago viene
// vacío y la entidad de información de proveedor no responde), así que
// se cargan acá a mano.
//
// La lista viene precargada con los proveedores que tienen artículos
// en el catálogo. Aris solo completa los que tienen condiciones
// especiales — el resto queda con los valores por defecto del sistema.
// ============================================================

function moneda(n) {
  const num = Number(n)
  if (!Number.isFinite(num)) return null
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
  }).format(num)
}

const VACIO = {
  minimo_compra: '', minimo_es_unidades: false, plazo_pago: '',
  descuento_volumen: '', dias_entrega: '', mail_pedidos: '',
  whatsapp_pedidos: '', contacto: '', limite_aprobacion: '',
  siempre_requiere_aprobacion: false, vende_en_cajas_cerradas: false, notas: '',
}

export default function CondicionesProveedor({ preseleccion, onConsumirPreseleccion } = {}) {
  const permisos = usePermisos()
  const esAdmin = permisos.esAdmin

  const [filas, setFilas] = useState([])
  const [reglas, setReglas] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const [busqueda, setBusqueda] = useState('')
  const [soloIncompletos, setSoloIncompletos] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(VACIO)

  async function cargar() {
    setCargando(true)
    setError(null)
    try {
      const [resProv, resReglas] = await Promise.all([
        supabase.from('proveedores').select('*').order('clie_nombre'),
        supabase.from('reglas_compra').select('*').eq('id', 1).maybeSingle(),
      ])
      if (resProv.error) throw new Error(resProv.error.message)
      setFilas(resProv.data ?? [])
      setReglas(resReglas.data ?? null)
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

  // Si venimos desde otra pantalla (ej. "Proveedores") con un nombre
  // preseleccionado, precargamos la búsqueda y abrimos ese proveedor
  // si ya tiene una fila cargada. Si no tiene fila, igual queda
  // filtrado por nombre en la búsqueda.
  useEffect(() => {
    if (!preseleccion || cargando) return
    setBusqueda(preseleccion)
    const match = filas.find((p) => p.clie_nombre === preseleccion)
    if (match) abrir(match)
    onConsumirPreseleccion?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preseleccion, cargando, filas])

  // "Completo" = tiene al menos el mínimo de compra o un contacto de
  // pedidos. Es lo mínimo para que el sistema pueda hacer algo con él.
  function estaCompleto(p) {
    return p.minimo_compra != null || !!p.whatsapp_pedidos || !!p.mail_pedidos
  }

  const visibles = useMemo(() => {
    let out = filas
    if (soloIncompletos) out = out.filter((p) => !estaCompleto(p))
    if (busqueda) {
      const t = busqueda.toLowerCase()
      out = out.filter((p) => p.clie_nombre?.toLowerCase().includes(t))
    }
    return out
  }, [filas, busqueda, soloIncompletos])

  const completos = useMemo(() => filas.filter(estaCompleto).length, [filas])

  function abrir(p) {
    setEditando(p.id)
    setForm({
      minimo_compra: p.minimo_compra ?? '',
      minimo_es_unidades: p.minimo_es_unidades ?? false,
      plazo_pago: p.plazo_pago ?? '',
      descuento_volumen: p.descuento_volumen ?? '',
      dias_entrega: p.dias_entrega ?? '',
      mail_pedidos: p.mail_pedidos ?? '',
      whatsapp_pedidos: p.whatsapp_pedidos ?? '',
      contacto: p.contacto ?? '',
      limite_aprobacion: p.limite_aprobacion ?? '',
      siempre_requiere_aprobacion: p.siempre_requiere_aprobacion ?? false,
      vende_en_cajas_cerradas: p.vende_en_cajas_cerradas ?? false,
      notas: p.notas ?? '',
    })
  }

  async function guardar(p) {
    setGuardando(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const num = (v) => (v === '' || v == null ? null : Number(v))
      const txt = (v) => (v?.trim?.() ? v.trim() : null)

      const { error } = await supabase.from('proveedores').update({
        minimo_compra: num(form.minimo_compra),
        minimo_es_unidades: !!form.minimo_es_unidades,
        plazo_pago: txt(form.plazo_pago),
        descuento_volumen: txt(form.descuento_volumen),
        dias_entrega: num(form.dias_entrega),
        mail_pedidos: txt(form.mail_pedidos),
        whatsapp_pedidos: txt(form.whatsapp_pedidos),
        contacto: txt(form.contacto),
        limite_aprobacion: num(form.limite_aprobacion),
        siempre_requiere_aprobacion: !!form.siempre_requiere_aprobacion,
        vende_en_cajas_cerradas: !!form.vende_en_cajas_cerradas,
        notas: txt(form.notas),
        actualizado_por: user?.id ?? null,
        actualizado_en: new Date().toISOString(),
      }).eq('id', p.id)
      if (error) throw new Error(error.message)
      setAviso(`${p.clie_nombre} actualizado.`)
      setEditando(null)
      await cargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  const limiteGlobal = reglas?.limite_aprobacion

  return (
    <div className="flex-1 overflow-y-auto bg-[#f7f8fa]">
      <div className="px-6 py-4 border-b border-[var(--border)] bg-white">
        <div className="text-[17px] font-bold">Condiciones comerciales</div>
        <div className="text-[12px] text-[var(--sub)] mt-0.5">
          Mínimos de compra, plazos, contacto de pedidos y límites de aprobación por proveedor
        </div>
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

      <Aviso tipo="info" id="condiciones-origen" className="mx-4 mt-4">
        Estos datos no están en YiQi, se cargan acá. No hace falta completar los {filas.length}: solo los que
        tienen condiciones especiales. Los que queden en blanco usan los valores generales del sistema
        {limiteGlobal ? ` (límite de aprobación: ${moneda(limiteGlobal)})` : ''}.
      </Aviso>

      {!esAdmin && !permisos.cargando && (
        <Aviso tipo="filtro" autoCerrarEn={15} className="mx-4 mt-2">
          Estas condiciones las carga Aris. Podés consultarlas, pero no editarlas.
        </Aviso>
      )}

      <div className="grid grid-cols-3 gap-2.5 p-4">
        <div className="bg-white rounded-xl p-3.5 border border-[var(--border)]">
          <div className="text-[10px] text-[var(--sub)] uppercase tracking-wide mb-1">Proveedores</div>
          <div className="text-2xl font-bold">{filas.length}</div>
        </div>
        <div className="bg-white rounded-xl p-3.5 border border-[var(--border)]">
          <div className="text-[10px] text-[var(--sub)] uppercase tracking-wide mb-1">Con condiciones cargadas</div>
          <div className="text-2xl font-bold text-[var(--grn)]">{completos}</div>
        </div>
        <div className="bg-white rounded-xl p-3.5 border border-[var(--border)]">
          <div className="text-[10px] text-[var(--sub)] uppercase tracking-wide mb-1">Pasan siempre por Aris</div>
          <div className="text-2xl font-bold text-[#1d4ed8]">
            {filas.filter((p) => p.siempre_requiere_aprobacion).length}
          </div>
        </div>
      </div>

      <div className="px-4 pb-2 flex items-center gap-3 flex-wrap">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar proveedor…"
          className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm w-64"
        />
        <label className="flex items-center gap-2 text-[13px] text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={soloIncompletos}
            onChange={(e) => setSoloIncompletos(e.target.checked)}
          />
          Ver solo los que faltan completar ({filas.length - completos})
        </label>
      </div>

      <div className="mx-4 mb-6 bg-white rounded-xl border border-[var(--border)] overflow-hidden">
        {cargando ? (
          <div className="p-8 text-center text-[var(--sub)] text-sm">Cargando…</div>
        ) : visibles.length === 0 ? (
          <div className="p-8 text-center text-[var(--sub)] text-sm">
            No hay proveedores que coincidan.
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-[var(--border)]">
                {['Proveedor', 'Mínimo de compra', 'Plazo de pago', 'Contacto de pedidos', 'Límite propio', ''].map((h) => (
                  <th key={h} className="text-left px-3.5 py-2.5 text-[10px] font-bold text-[var(--sub)] uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => {
                const abierto = editando === p.id
                return (
                  <Fragment key={p.id}>
                    <tr className={`border-b border-gray-100 ${abierto ? 'bg-indigo-50/40' : ''}`}>
                      <td className="px-3.5 py-2.5">
                        <div className="font-semibold text-[13px]">{p.clie_nombre}</div>
                        {p.siempre_requiere_aprobacion && (
                          <span className="inline-flex mt-0.5 mr-1 px-2 py-0.5 rounded-full bg-blue-50 text-[#1d4ed8] text-[10px] font-semibold">
                            siempre pasa por Aris
                          </span>
                        )}
                        {p.vende_en_cajas_cerradas && (
                          <span className="inline-flex mt-0.5 px-2 py-0.5 rounded-full bg-amber-50 text-[#92400e] text-[10px] font-semibold">
                            cajas cerradas
                          </span>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 text-[13px]">
                        {p.minimo_compra != null
                          ? (p.minimo_es_unidades ? `${p.minimo_compra} un.` : moneda(p.minimo_compra))
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3.5 py-2.5 text-[13px] text-[var(--sub)]">{p.plazo_pago ?? <span className="text-gray-300">—</span>}</td>
                      <td className="px-3.5 py-2.5 text-[12px] text-[var(--sub)]">
                        {p.whatsapp_pedidos || p.mail_pedidos || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3.5 py-2.5 text-[13px]">
                        {p.limite_aprobacion != null
                          ? moneda(p.limite_aprobacion)
                          : <span className="text-gray-400 text-[11px] italic">general</span>}
                      </td>
                      <td className="px-3.5 py-2.5 text-right">
                        {esAdmin && (
                          <button
                            onClick={() => (abierto ? setEditando(null) : abrir(p))}
                            className="text-sm text-[var(--ind,#4338ca)] hover:underline"
                          >
                            {abierto ? 'Cerrar' : 'Completar'}
                          </button>
                        )}
                      </td>
                    </tr>

                    {abierto && (
                      <tr className="border-b border-gray-100 bg-indigo-50/20">
                        <td colSpan={6} className="px-3.5 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <label>
                              <div className="text-[11px] text-gray-400 uppercase mb-1">Mínimo de compra</div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number" step="any"
                                  value={form.minimo_compra}
                                  onChange={(e) => setForm((f) => ({ ...f, minimo_compra: e.target.value }))}
                                  className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm w-full"
                                />
                                <select
                                  value={form.minimo_es_unidades ? 'un' : 'ars'}
                                  onChange={(e) => setForm((f) => ({ ...f, minimo_es_unidades: e.target.value === 'un' }))}
                                  className="border border-[var(--border)] rounded-lg px-2 py-2 text-sm"
                                >
                                  <option value="ars">pesos</option>
                                  <option value="un">unidades</option>
                                </select>
                              </div>
                            </label>

                            <label>
                              <div className="text-[11px] text-gray-400 uppercase mb-1">Plazo de pago</div>
                              <input
                                value={form.plazo_pago}
                                placeholder="30 días / contado"
                                onChange={(e) => setForm((f) => ({ ...f, plazo_pago: e.target.value }))}
                                className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm w-full"
                              />
                            </label>

                            <label>
                              <div className="text-[11px] text-gray-400 uppercase mb-1">Descuento por volumen</div>
                              <input
                                value={form.descuento_volumen}
                                placeholder="5% a partir de $500.000"
                                onChange={(e) => setForm((f) => ({ ...f, descuento_volumen: e.target.value }))}
                                className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm w-full"
                              />
                            </label>

                            <label>
                              <div className="text-[11px] text-gray-400 uppercase mb-1">WhatsApp de pedidos</div>
                              <input
                                value={form.whatsapp_pedidos}
                                placeholder="+54 9 11 ..."
                                onChange={(e) => setForm((f) => ({ ...f, whatsapp_pedidos: e.target.value }))}
                                className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm w-full"
                              />
                            </label>

                            <label>
                              <div className="text-[11px] text-gray-400 uppercase mb-1">Mail de pedidos</div>
                              <input
                                value={form.mail_pedidos}
                                placeholder="pedidos@proveedor.com"
                                onChange={(e) => setForm((f) => ({ ...f, mail_pedidos: e.target.value }))}
                                className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm w-full"
                              />
                            </label>

                            <label>
                              <div className="text-[11px] text-gray-400 uppercase mb-1">Contacto</div>
                              <input
                                value={form.contacto}
                                placeholder="Juan, el vendedor"
                                onChange={(e) => setForm((f) => ({ ...f, contacto: e.target.value }))}
                                className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm w-full"
                              />
                            </label>

                            <label>
                              <div className="text-[11px] text-gray-400 uppercase mb-1">Días de entrega</div>
                              <input
                                type="number"
                                value={form.dias_entrega}
                                placeholder="3"
                                onChange={(e) => setForm((f) => ({ ...f, dias_entrega: e.target.value }))}
                                className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm w-full"
                              />
                            </label>

                            <label>
                              <div className="text-[11px] text-gray-400 uppercase mb-1">
                                Límite de aprobación propio
                              </div>
                              <input
                                type="number" step="1000"
                                value={form.limite_aprobacion}
                                placeholder={limiteGlobal ? `General: ${limiteGlobal}` : 'Usa el general'}
                                onChange={(e) => setForm((f) => ({ ...f, limite_aprobacion: e.target.value }))}
                                className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm w-full"
                              />
                            </label>

                            <label className="flex items-end pb-2">
                              <span className="flex items-center gap-2 text-[13px] text-gray-700 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={form.siempre_requiere_aprobacion}
                                  onChange={(e) => setForm((f) => ({ ...f, siempre_requiere_aprobacion: e.target.checked }))}
                                />
                                Siempre requiere mi aprobación
                              </span>
                            </label>

                            <label className="flex items-end pb-2">
                              <span className="flex items-center gap-2 text-[13px] text-gray-700 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={form.vende_en_cajas_cerradas}
                                  onChange={(e) => setForm((f) => ({ ...f, vende_en_cajas_cerradas: e.target.checked }))}
                                />
                                Vende en cajas cerradas
                              </span>
                            </label>
                          </div>

                          <label className="block mt-3">
                            <div className="text-[11px] text-gray-400 uppercase mb-1">Notas</div>
                            <input
                              value={form.notas}
                              placeholder="Cualquier detalle a tener en cuenta al pedirle"
                              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
                              className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm w-full"
                            />
                          </label>

                          <div className="flex justify-end gap-2 mt-3">
                            <button onClick={() => setEditando(null)} className="text-sm text-gray-500 hover:underline px-2">
                              Cancelar
                            </button>
                            <button
                              onClick={() => guardar(p)}
                              disabled={guardando}
                              className="px-3.5 py-2 rounded-lg text-[13px] font-semibold bg-[var(--ind,#4338ca)] text-white hover:opacity-90 disabled:opacity-40"
                            >
                              {guardando ? 'Guardando…' : 'Guardar'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
