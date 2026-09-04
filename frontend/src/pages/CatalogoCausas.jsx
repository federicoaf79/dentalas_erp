import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePermisos } from '../hooks/usePermisos'
import Aviso from '../components/Aviso'

// ============================================================
// CatalogoCausas.jsx
// Catálogo ABIERTO de causas, administrable por Aris.
//
// El `codigo` (causa_01, causa_02…) es la clave estable que usa el
// sistema; el `rotulo` es lo que se ve y se puede renombrar sin
// romper nada. Por eso al crear una causa el código se genera solo.
//
// Las causas usadas NO se borran: se desactivan. Si se borrara una
// que ya fue declarada en algún artículo, esa declaración quedaría
// apuntando a la nada.
// ============================================================

const AMBITOS = [
  { key: 'stock',   label: 'Stock',    ayuda: 'Por qué un artículo está en alerta o no se repone' },
  { key: 'compra',  label: 'Compras',  ayuda: 'Condiciones o excepciones al momento de comprar' },
  { key: 'entrega', label: 'Entregas', ayuda: 'Qué pasó con una entrega del proveedor' },
]

export default function CatalogoCausas() {
  const permisos = usePermisos()
  const esAdmin = permisos.esAdmin

  const [causas, setCausas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  const [ambito, setAmbito] = useState('stock')
  const [nuevoRotulo, setNuevoRotulo] = useState('')
  const [nuevaDesc, setNuevaDesc] = useState('')
  const [editando, setEditando] = useState(null)
  const [borrador, setBorrador] = useState({ rotulo: '', descripcion: '' })

  async function cargar() {
    setCargando(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('catalogo_causas')
        .select('*')
        .order('ambito')
        .order('orden')
      if (error) throw new Error(error.message)
      setCausas(data ?? [])
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

  const delAmbito = useMemo(
    () => causas.filter((c) => c.ambito === ambito),
    [causas, ambito]
  )

  // El código se genera solo, continuando la numeración existente.
  function proximoCodigo() {
    const nums = causas
      .map((c) => Number(String(c.codigo).replace(/\D/g, '')))
      .filter((n) => Number.isFinite(n))
    const max = nums.length ? Math.max(...nums) : 0
    return `causa_${String(max + 1).padStart(2, '0')}`
  }

  async function agregar() {
    if (!nuevoRotulo.trim()) return
    setOcupado(true)
    try {
      const maxOrden = delAmbito.reduce((m, c) => Math.max(m, c.orden ?? 0), 0)
      const { error } = await supabase.from('catalogo_causas').insert({
        codigo: proximoCodigo(),
        ambito,
        rotulo: nuevoRotulo.trim(),
        descripcion: nuevaDesc.trim() || null,
        orden: maxOrden + 10,
      })
      if (error) throw new Error(error.message)
      setNuevoRotulo('')
      setNuevaDesc('')
      setAviso('Causa agregada.')
      await cargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  async function guardarEdicion(causa) {
    setOcupado(true)
    try {
      const { error } = await supabase
        .from('catalogo_causas')
        .update({
          rotulo: borrador.rotulo.trim(),
          descripcion: borrador.descripcion.trim() || null,
        })
        .eq('id', causa.id)
      if (error) throw new Error(error.message)
      setEditando(null)
      await cargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  async function alternarActiva(causa) {
    setOcupado(true)
    try {
      const { error } = await supabase
        .from('catalogo_causas')
        .update({ activa: !causa.activa })
        .eq('id', causa.id)
      if (error) throw new Error(error.message)
      await cargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#f7f8fa]">
      <div className="px-6 py-4 border-b border-[var(--border)] bg-white">
        <div className="text-[17px] font-bold">Catálogo de causas</div>
        <div className="text-[12px] text-[var(--sub)] mt-0.5">
          Motivos que se pueden declarar sobre un artículo, una compra o una entrega
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

      <Aviso tipo="info" id="causas-origen" className="mx-4 mt-4">
        Las causas precargadas salieron de las notas que Dentalab ya escribe hoy en YiQi sobre los artículos
        (“no tienen stock”, “solo por pedido”, “lo pide Aris”…). La lista es abierta: se pueden agregar,
        renombrar o desactivar. Al declarar una situación siempre queda además un campo de nota libre, porque
        hay detalle de la operación diaria que no entra en ninguna categoría.
      </Aviso>

      {!esAdmin && !permisos.cargando && (
        <Aviso tipo="filtro" autoCerrarEn={15} className="mx-4 mt-2">
          Este catálogo lo administra Aris. Podés consultarlo, pero no editarlo.
        </Aviso>
      )}

      {/* Ámbitos */}
      <div className="px-4 pt-4 flex items-center gap-2 flex-wrap">
        {AMBITOS.map((a) => {
          const cant = causas.filter((c) => c.ambito === a.key).length
          return (
            <button
              key={a.key}
              onClick={() => setAmbito(a.key)}
              className={`px-3 py-1.5 rounded-full text-sm border ${
                ambito === a.key
                  ? 'bg-[var(--ind,#4338ca)] text-white border-[var(--ind,#4338ca)]'
                  : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              {a.label} ({cant})
            </button>
          )
        })}
      </div>

      <div className="px-4 pt-1.5 text-[12px] text-[var(--sub)]">
        {AMBITOS.find((a) => a.key === ambito)?.ayuda}
      </div>

      {/* Tabla */}
      <div className="mx-4 mt-3 mb-3 bg-white rounded-xl border border-[var(--border)] overflow-hidden">
        {cargando ? (
          <div className="p-8 text-center text-[var(--sub)] text-sm">Cargando…</div>
        ) : delAmbito.length === 0 ? (
          <div className="p-8 text-center text-[var(--sub)] text-sm">
            No hay causas cargadas para este ámbito.
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-[var(--border)]">
                {['Código', 'Causa', 'Descripción', 'Estado', ''].map((h) => (
                  <th key={h} className="text-left px-3.5 py-1.5 text-[10px] font-bold text-[var(--sub)] uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {delAmbito.map((c) => {
                const enEdicion = editando === c.id
                return (
                  <tr key={c.id} className={`border-b border-gray-100 last:border-0 ${!c.activa ? 'opacity-50' : ''}`}>
                    <td className="px-3.5 py-1.5 font-mono text-xs text-gray-400">{c.codigo}</td>
                    <td className="px-3.5 py-1.5">
                      {enEdicion ? (
                        <input
                          value={borrador.rotulo}
                          onChange={(e) => setBorrador((b) => ({ ...b, rotulo: e.target.value }))}
                          className="border border-[var(--border)] rounded-lg px-2 py-1 text-sm w-full"
                        />
                      ) : (
                        <span className="font-semibold text-[13px]">{c.rotulo}</span>
                      )}
                    </td>
                    <td className="px-3.5 py-1.5 text-[var(--sub)] text-xs">
                      {enEdicion ? (
                        <input
                          value={borrador.descripcion}
                          onChange={(e) => setBorrador((b) => ({ ...b, descripcion: e.target.value }))}
                          className="border border-[var(--border)] rounded-lg px-2 py-1 text-sm w-full"
                        />
                      ) : (
                        c.descripcion ?? '—'
                      )}
                    </td>
                    <td className="px-3.5 py-1.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        c.activa ? 'bg-[var(--grn-bg)] text-[var(--grn)]' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {c.activa ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="px-3.5 py-1.5 text-right whitespace-nowrap">
                      {esAdmin && (enEdicion ? (
                        <>
                          <button
                            disabled={ocupado}
                            onClick={() => guardarEdicion(c)}
                            className="text-sm font-semibold text-[var(--ind,#4338ca)] hover:underline mr-3 disabled:opacity-40"
                          >
                            Guardar
                          </button>
                          <button onClick={() => setEditando(null)} className="text-sm text-gray-400 hover:underline">
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setEditando(c.id)
                              setBorrador({ rotulo: c.rotulo, descripcion: c.descripcion ?? '' })
                            }}
                            className="text-sm text-[var(--ind,#4338ca)] hover:underline mr-3"
                          >
                            Renombrar
                          </button>
                          <button
                            disabled={ocupado}
                            onClick={() => alternarActiva(c)}
                            className="text-sm text-gray-400 hover:text-gray-700 disabled:opacity-40"
                            title="Las causas ya usadas no se borran: se desactivan para que no aparezcan al declarar"
                          >
                            {c.activa ? 'Desactivar' : 'Activar'}
                          </button>
                        </>
                      ))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Alta */}
      {esAdmin && (
        <div className="mx-4 mb-6 bg-white rounded-xl border border-[var(--border)] p-4">
          <div className="text-[13px] font-semibold mb-2.5">
            Agregar causa a {AMBITOS.find((a) => a.key === ambito)?.label}
          </div>
          <div className="flex items-end gap-2.5 flex-wrap">
            <label className="flex-1 min-w-[220px]">
              <div className="text-[11px] text-gray-400 uppercase mb-1">Causa</div>
              <input
                value={nuevoRotulo}
                onChange={(e) => setNuevoRotulo(e.target.value)}
                placeholder="Ej: Producto discontinuado"
                className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm w-full"
              />
            </label>
            <label className="flex-1 min-w-[220px]">
              <div className="text-[11px] text-gray-400 uppercase mb-1">Descripción (opcional)</div>
              <input
                value={nuevaDesc}
                onChange={(e) => setNuevaDesc(e.target.value)}
                placeholder="Para que quede claro cuándo se usa"
                className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm w-full"
              />
            </label>
            <button
              onClick={agregar}
              disabled={ocupado || !nuevoRotulo.trim()}
              className="px-3.5 py-2 rounded-lg text-[13px] font-semibold bg-[var(--ind,#4338ca)] text-white hover:opacity-90 disabled:opacity-40"
            >
              Agregar
            </button>
          </div>
          <div className="text-[11px] text-gray-400 mt-2">
            El código ({proximoCodigo()}) se asigna solo. El nombre se puede cambiar después sin afectar
            las declaraciones ya hechas.
          </div>
        </div>
      )}
    </div>
  )
}
