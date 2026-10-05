import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePermisos } from '../hooks/usePermisos'
import EncabezadoPagina from '../components/ui/EncabezadoPagina'

// ============================================================
// ReglasAlertas.jsx
// Configuración de las reglas que usa el motor de compra.
//
// Quién puede editar NO se decide acá: la política RLS de
// reglas_compra solo permite UPDATE al admin. Esta pantalla muestra
// los campos deshabilitados para el operador, pero aunque alguien
// forzara el update desde la consola, Postgres lo rechaza.
// ============================================================

// Estilo de campo del prototipo v7 (.fl rótulo 11 px mayúscula, .fi input).
const ROTULO = 'text-[11px] text-[var(--sub)] uppercase tracking-[.04em] font-semibold'
const INPUT =
  'px-3 py-2 border border-[#d1d5db] rounded-lg text-[13px] bg-[#f9fafb] outline-none focus:border-[var(--ind)] disabled:text-gray-400 disabled:cursor-not-allowed'

function Campo({ label, ayuda, valor, onChange, sufijo, disabled, min = 0, step = 'any' }) {
  return (
    <div className="seccion">
      <label className="block">
        <div className={`${ROTULO} mb-2`}>{label}</div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={min}
            step={step}
            value={valor}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            className={`${INPUT} w-44 text-right font-bold`}
          />
          {sufijo && <span className="text-[12px] text-[var(--sub)]">{sufijo}</span>}
        </div>
        <div className="text-[11px] text-[#9ca3af] mt-1.5 leading-snug">{ayuda}</div>
      </label>
    </div>
  )
}

export default function ReglasAlertas() {
  const permisos = usePermisos()

  const [reglas, setReglas] = useState(null)
  const [form, setForm] = useState({ limite: '', cajas: '', meses: '' })
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)

  async function cargar() {
    setCargando(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('reglas_compra')
        .select('*')
        .eq('id', 1)
        .maybeSingle()
      if (error) throw new Error(error.message)
      setReglas(data)
      setForm({
        limite: data?.limite_aprobacion ?? '',
        cajas: data?.max_cajas_por_producto ?? '',
        meses: data?.meses_cobertura ?? '',
      })
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

  // N-10 del documento de continuidad (5/8/2026, seguía abierto): un
  // input vacío pasaba por Number('') → 0 y se guardaba en silencio como
  // límite de aprobación (o como tope de bultos / meses de cobertura).
  // Nadie lo pedía así, era un descuido de tipeo — pero el sistema lo
  // guardaba como si fuera una decisión real. Se valida acá, antes de
  // guardar nada, para que el usuario tenga que corregir el campo en
  // vez de que el sistema adivine 0.
  function campoInvalido(v) {
    return v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) || Number(v) < 0
  }
  const hayCampoInvalido =
    campoInvalido(form.limite) || campoInvalido(form.cajas) || campoInvalido(form.meses)

  async function guardar() {
    if (hayCampoInvalido) {
      setError('Completá los tres campos con un número válido (0 o más) antes de guardar.')
      return
    }
    setGuardando(true)
    setError(null)
    setAviso(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('reglas_compra')
        .update({
          limite_aprobacion: Number(form.limite),
          max_cajas_por_producto: Number(form.cajas),
          meses_cobertura: Number(form.meses),
          actualizado_por: user?.id ?? null,
          actualizado_en: new Date().toISOString(),
        })
        .eq('id', 1)
      if (error) throw new Error(error.message)
      setAviso('Reglas actualizadas. Se aplican a las órdenes que se armen de ahora en más.')
      await cargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  const esAdmin = permisos.esAdmin
  const huboCambios =
    reglas &&
    (Number(form.limite) !== Number(reglas.limite_aprobacion) ||
      Number(form.cajas) !== Number(reglas.max_cajas_por_producto) ||
      Number(form.meses) !== Number(reglas.meses_cobertura))

  return (
    <div className="flex-1 overflow-y-auto bg-[#f7f8fa]">
      {/* 7/9/2026 (U-3): rótulo alineado con el del sidebar — ver
          comentario en Sidebar.jsx sobre por qué se sacó "alertas"
          del nombre. */}
      <EncabezadoPagina
        titulo="Reglas de compra y aprobación"
        bajada="Parámetros que usa el sistema para sugerir cantidades y decidir qué requiere aprobación"
        info={
          !esAdmin && !permisos.cargando
            ? 'Estas reglas las configura Aris. Podés verlas para saber con qué criterio el sistema arma las sugerencias, pero no editarlas.'
            : undefined
        }
      >
        {esAdmin && (
          <button
            onClick={guardar}
            disabled={guardando || !huboCambios || hayCampoInvalido}
            title={hayCampoInvalido ? 'Completá los tres campos con un número válido antes de guardar' : undefined}
            className="btn btn-sm btn-pri"
          >
            <i className="ti ti-device-floppy" />
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        )}
      </EncabezadoPagina>

      <div className="pagina flex flex-col gap-3.5">
      {error && (
        <div className="bloque bloque-rojo text-[13px]">
          {error}
        </div>
      )}

      {aviso && (
        <div className="bloque bloque-verde text-[13px] flex items-center justify-between gap-3">
          <span>{aviso}</span>
          <button onClick={() => setAviso(null)} className="opacity-60 hover:opacity-100 px-1" aria-label="Cerrar">
            <i className="ti ti-x" />
          </button>
        </div>
      )}

      {cargando ? (
        <div className="p-10 text-center text-[var(--sub)] text-[13px]">Cargando reglas…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
            <Campo
              label="Límite de aprobación automática"
              ayuda="Si el total de una orden supera este monto, tiene que aprobarla Aris. Por debajo, quien la arma la confirma directamente."
              valor={form.limite}
              onChange={(v) => setForm((f) => ({ ...f, limite: v }))}
              sufijo="pesos"
              disabled={!esAdmin}
              step="1000"
            />
            <Campo
              label="Máximo de bultos por producto"
              ayuda="Tope de la cantidad sugerida. Si un artículo viene en cajas, no se sugieren más de esta cantidad de cajas por vez. Los artículos sueltos no se topean."
              valor={form.cajas}
              onChange={(v) => setForm((f) => ({ ...f, cajas: v }))}
              sufijo="bultos"
              disabled={!esAdmin}
              step="1"
            />
            <Campo
              label="Meses de cobertura objetivo"
              ayuda="Cuántos meses de consumo promedio busca cubrir la cantidad sugerida. Más meses = pedidos más grandes y menos frecuentes."
              valor={form.meses}
              onChange={(v) => setForm((f) => ({ ...f, meses: v }))}
              sufijo="meses"
              disabled={!esAdmin}
              step="0.5"
            />
          </div>

          <div className="seccion">
            <div className="seccion-titulo flex items-center gap-2">
              <i className="ti ti-shield-check text-[var(--ind)] text-[15px]" />
              Cómo se combinan
            </div>
            <ol className="text-[13px] text-gray-600 space-y-1.5 list-decimal list-inside leading-relaxed">
              <li>
                Se listan los artículos cuyo stock está por debajo del punto de pedido (o del stock de
                seguridad, cuando el punto de pedido no está cargado).
              </li>
              <li>
                Para cada uno se calcula cuánto falta para cubrir <b>{form.meses || '—'} meses</b> de
                consumo promedio de los últimos 12 meses.
              </li>
              <li>
                Esa cantidad se redondea hacia arriba al múltiplo de compra del artículo, y se topea en{' '}
                <b>{form.cajas || '—'} bultos</b>.
              </li>
              <li>
                La orden se valoriza con el costo de reposición (CRM Neto). Si el total supera{' '}
                <b>
                  {form.limite
                    ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(form.limite))
                    : '—'}
                </b>{' '}
                —o si algún artículo no tiene costo cargado— pasa a requerir aprobación.
              </li>
            </ol>
            <div className="text-[12px] text-gray-400 mt-3 pt-3 border-t border-gray-100">
              Los artículos de Mercado Libre (###), los discontinuados y los de producción propia
              (proveedor “Dentalab”) quedan fuera de las sugerencias: no se compran a un proveedor.
            </div>
          </div>

          {reglas?.actualizado_en && (
            <div className="text-[11px] text-gray-400">
              Última modificación: {new Date(reglas.actualizado_en).toLocaleString('es-AR')}
            </div>
          )}
        </>
      )}
      </div>
    </div>
  )
}
