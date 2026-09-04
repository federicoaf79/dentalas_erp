import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePermisos } from '../hooks/usePermisos'
import Aviso from '../components/Aviso'
import { renderTemplate } from './TemplatesMensajes'
import { traerStockPorDeposito, textoDesgloseStock } from '../lib/stockPorDeposito'

// ============================================================
// NuevaOC.jsx — v1
// Circuito completo de orden de compra sobre tablas propias:
//   borrador -> pendiente -> aprobada / rechazada
//
// Ivana arma y envia a aprobar. Aris aprueba o rechaza.
// Las reglas de quien puede hacer que NO viven aca: viven en las
// politicas RLS de ordenes_propias / ordenes_propias_items. Esta
// pantalla solo muestra u oculta botones; aunque alguien forzara una
// accion desde la consola, Postgres la rechaza.
//
// IMPORTANTE: al aprobar NO se escribe todavia en YiQi. La orden queda
// aprobada en nuestra base y lista para enviarse. Eso se avisa en
// pantalla para no dar a entender que ya llego al ERP.
//
// LIMPIEZA 14 agosto 2026 (N-13, 10/8/2026): se saco un circuito
// completo de codigo muerto — ListaOrdenes, DetalleOrden, abrirOrden,
// enviarAAprobacion, decidir, borrarOrden, y los estados ordenAbierta/
// itemsAbiertos/ordenes que solo alimentaban a ese bloque. Nada de eso
// se renderizaba nunca: la vista real de lista es SelectorProveedor,
// y el circuito de aprobar/rechazar/archivar en produccion vive en
// OrdenesPropias.jsx (pantalla "Ordenes de compra"), no aca. Se
// confirmo que era inalcanzable siguiendo cada referencia antes de
// borrar (grep de cada funcion y de cada estado que solo la alimentaba).
// ============================================================

const ESTADOS = {
  borrador:  { label: 'Borrador',            clase: 'bg-gray-100 text-gray-600' },
  pendiente: { label: 'Esperando aprobación', clase: 'bg-blue-50 text-[#1d4ed8]' },
  aprobada:  { label: 'Aprobada',            clase: 'bg-[var(--grn-bg)] text-[var(--grn)]' },
  rechazada: { label: 'Rechazada',           clase: 'bg-[var(--red-bg)] text-[var(--red)]' },
}

const MESES_COBERTURA = 2

function formatoNumero(n) {
  if (n == null) return '—'
  const num = Number(n)
  if (!Number.isFinite(num)) return '—'
  return num % 1 === 0 ? String(num) : num.toFixed(1)
}

// Bloqueo de "cantidad a pedir" que no es múltiplo del bulto (sprint
// 5/9/2026, ítem de la reunión con Dentalab: Farmadental/SKU1007,
// regla de Pescio). sugerencias_compra() ya redondea la cantidad
// SUGERIDA al múltiplo de bulto -- esto cubre lo que la sugerencia no
// controla: una cantidad tipeada a mano, tanto sobre una fila sugerida
// como sobre un artículo agregado a mano por el buscador. Tolerancia
// chica para no romper por errores de punto flotante (24 / 8 puede no
// dar exactamente 3 en JS). Sin bulto cargado (proveedor sin ese dato
// en YiQi) no hay nada que validar -- se deja pasar, igual que hoy.
function esMultiploDeBulto(cantidad, bulto) {
  const b = Number(bulto) || 0
  if (b <= 0) return true
  const cociente = Number(cantidad) / b
  return Math.abs(cociente - Math.round(cociente)) < 1e-6
}

function formatoFecha(f) {
  if (!f) return '—'
  try {
    return new Date(f).toLocaleString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

// ------------------------------------------------------------
// Vista 2 — panorama de quiebres y eleccion de proveedor
//
// Ahora ordena por DEMANDA EN RIESGO: la suma del consumo mensual
// promedio de los articulos que estan en quiebre o por debajo del
// minimo. Es decir, cuantas unidades por mes se dejan de poder vender
// si no se repone. Eso si dice por donde empezar.
// ------------------------------------------------------------
function SelectorProveedor({ proveedores, cargando, onElegir, onCancelar }) {
  const [busqueda, setBusqueda] = useState('')

  const filtrados = useMemo(() => {
    if (!busqueda) return proveedores
    const t = busqueda.toLowerCase()
    return proveedores.filter((p) => p.proveedor?.toLowerCase().includes(t))
  }, [proveedores, busqueda])

  const resumen = useMemo(() => {
    return proveedores.reduce(
      (acc, p) => ({
        criticas: acc.criticas + Number(p.criticas ?? 0),
        preventivas: acc.preventivas + Number(p.preventivas ?? 0),
        demanda: acc.demanda + Number(p.demanda_riesgo ?? 0),
      }),
      { criticas: 0, preventivas: 0, demanda: 0 }
    )
  }, [proveedores])

  return (
    <div className="p-4">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div>
          <div className="text-[15px] font-bold">¿Por dónde empezar?</div>
          <div className="text-[12px] text-[var(--sub)]">
            Proveedores ordenados por la demanda mensual que está en riesgo por falta de stock.
          </div>
        </div>
        {onCancelar && (
          <button onClick={onCancelar} className="text-sm text-gray-500 hover:underline whitespace-nowrap">
            Cancelar
          </button>
        )}
      </div>

      {/* Panorama: el estado general antes de decidir */}
      <div className="grid grid-cols-4 gap-2.5 mb-4">
        <div className="bg-white rounded-xl p-3.5 border border-[var(--border)]">
          <div className="text-[10px] text-[var(--sub)] uppercase tracking-wide mb-1">Sin stock</div>
          <div className="text-2xl font-bold text-[var(--red)]">{resumen.criticas}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">artículos en cero</div>
        </div>
        <div className="bg-white rounded-xl p-3.5 border border-[var(--border)]">
          <div className="text-[10px] text-[var(--sub)] uppercase tracking-wide mb-1">Bajo mínimo</div>
          <div className="text-2xl font-bold text-[#92400e]">{resumen.preventivas}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">todavía con stock</div>
        </div>
        <div className="bg-white rounded-xl p-3.5 border border-[var(--border)]">
          <div className="text-[10px] text-[var(--sub)] uppercase tracking-wide mb-1">Demanda en riesgo</div>
          <div className="text-2xl font-bold">{formatoNumero(resumen.demanda)}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">unidades por mes</div>
        </div>
        <div className="bg-white rounded-xl p-3.5 border border-[var(--border)]">
          <div className="text-[10px] text-[var(--sub)] uppercase tracking-wide mb-1">Proveedores</div>
          <div className="text-2xl font-bold">{proveedores.length}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">con algo que reponer</div>
        </div>
      </div>

      <input
        type="text"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar proveedor…"
        className="w-full max-w-sm border border-[var(--border)] rounded-lg px-3 py-2 text-sm mb-3"
      />

      <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
        {cargando ? (
          <div className="p-8 text-center text-[var(--sub)] text-sm">Calculando prioridades…</div>
        ) : filtrados.length === 0 ? (
          <div className="p-8 text-center text-[var(--sub)] text-sm">
            No hay proveedores con artículos para reponer.
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-[var(--border)]">
                <th className="text-left px-3.5 py-1.5 text-[10px] font-bold text-[var(--sub)] uppercase tracking-wide">#</th>
                <th className="text-left px-3.5 py-1.5 text-[10px] font-bold text-[var(--sub)] uppercase tracking-wide">Proveedor</th>
                <th className="text-right px-3 py-1.5 text-[10px] font-bold text-[var(--sub)] uppercase tracking-wide whitespace-nowrap">
                  Demanda en riesgo
                </th>
                <th className="text-right px-3 py-1.5 text-[10px] font-bold text-[var(--sub)] uppercase tracking-wide">Sin stock</th>
                <th className="text-right px-3 py-1.5 text-[10px] font-bold text-[var(--sub)] uppercase tracking-wide">Bajo mín.</th>
                <th className="text-right px-3 py-1.5 text-[10px] font-bold text-gray-400 tracking-wide whitespace-nowrap">Sin historial</th>
                <th className="px-3.5 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p, i) => (
                <tr key={p.proveedor} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-3.5 py-1.5 text-xs text-gray-400 tabular-nums">{i + 1}</td>
                  <td className="px-3.5 py-1.5 font-semibold text-[13px]">{p.proveedor}</td>
                  <td className="px-3 py-1.5 text-right">
                    {Number(p.demanda_riesgo) > 0 ? (
                      <span className="font-bold tabular-nums">
                        {formatoNumero(p.demanda_riesgo)}
                        <span className="text-[10px] text-gray-400 font-normal"> u/mes</span>
                      </span>
                    ) : (
                      <span className="text-[11px] text-gray-400 italic">sin historial</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {Number(p.criticas) > 0 ? (
                      <span className="inline-flex px-2 py-0.5 rounded-full bg-[var(--red-bg)] text-[var(--red)] text-[11px] font-semibold">
                        {p.criticas}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {Number(p.preventivas) > 0 ? (
                      <span className="inline-flex px-2 py-0.5 rounded-full bg-[var(--yel-bg)] text-[#92400e] text-[11px] font-semibold">
                        {p.preventivas}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right text-xs text-gray-400 tabular-nums">
                    {Number(p.sin_historial) > 0 ? p.sin_historial : '—'}
                  </td>
                  <td className="px-3.5 py-1.5 text-right">
                    <button
                      onClick={() => onElegir(p.proveedor)}
                      className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-[var(--border)] bg-white hover:border-[var(--ind,#4338ca)] hover:text-[var(--ind,#4338ca)] whitespace-nowrap"
                    >
                      Armar orden
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// Vista 3 — armar la orden
// ------------------------------------------------------------
function formatoMoneda(n) {
  const num = Number(n)
  if (!Number.isFinite(num)) return '—'
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(num)
}

function ArmarOrden({ proveedor, sugerencias, cargando, onGuardar, onCancelar, ocupado, condiciones, esAdmin, preseleccionSku, nombreUsuario }) {
  const [seleccion, setSeleccion] = useState(() => new Set())
  const [cantidades, setCantidades] = useState({})
  const [notas, setNotas] = useState('')

  // Articulos agregados a mano (no venian en las sugerencias por
  // alerta). Viven aparte de `sugerencias` — que es prop del padre
  // y se recarga sola al cambiar de proveedor — para no pisarse con
  // ese ciclo. `filas` mas abajo las une para todo lo demas (tabla,
  // busqueda, paginado, calculo de items a guardar).
  const [agregados, setAgregados] = useState([])
  const [buscarTexto, setBuscarTexto] = useState('')
  const [buscarResultados, setBuscarResultados] = useState([])
  const [buscarCargando, setBuscarCargando] = useState(false)
  const [buscarAbierto, setBuscarAbierto] = useState(false)

  // Viene desde "🛒 Pedir a proveedor" en Reposición interna (21/8/2026,
  // ítem 5): precarga el buscador con el SKU que ya sabíamos que hacía
  // falta, para no obligar a Aris/Ivana a volver a escribirlo. A
  // propósito NO lo agrega solo a la orden -- mismo criterio que el
  // resto de esta pantalla ("el sistema sugiere, la persona decide", ver
  // más abajo): la persona ve el resultado y hace click en "+ Agregar"
  // si quiere. `key={proveedorElegido}` en el padre remonta este
  // componente al cambiar de proveedor, así que este efecto corre una
  // sola vez por viaje desde Reposición interna, no en cada render.
  useEffect(() => {
    if (!preseleccionSku) return
    setBuscarTexto(preseleccionSku)
    setBuscarAbierto(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Buscar en el catalogo completo del proveedor (no solo lo que
  // esta en alerta) con un poco de debounce: no tiene sentido pegarle
  // a la funcion en cada tecla. Minimo 2 caracteres para no traer de
  // una el catalogo entero de proveedores con miles de articulos.
  useEffect(() => {
    const texto = buscarTexto.trim()
    if (texto.length < 2) {
      setBuscarResultados([])
      setBuscarCargando(false)
      return
    }
    setBuscarCargando(true)
    const id = setTimeout(() => {
      supabase
        .rpc('buscar_articulos_proveedor', { p_proveedor: proveedor, p_busqueda: texto, p_limite: 20 })
        .then(({ data, error }) => {
          if (!error) setBuscarResultados(data ?? [])
          setBuscarCargando(false)
        })
    }, 350)
    return () => clearTimeout(id)
  }, [buscarTexto, proveedor])

  const codigosSugeridos = useMemo(() => new Set(sugerencias.map((s) => s.mate_codigo)), [sugerencias])
  const codigosAgregados = useMemo(() => new Set(agregados.map((a) => a.mate_codigo)), [agregados])

  // Agregar un articulo encontrado en el buscador: si ya estaba entre
  // las sugerencias por alerta, no se duplica — solo se tilda (puede
  // que ya estuviera ahi sin seleccionar). Si es nuevo, se suma a
  // `agregados` y se tilda con cantidad 1 de arranque: a diferencia de
  // las sugerencias (que arrancan sin tildar, ver mas abajo), agregar
  // algo a mano ES la decision de incluirlo.
  function agregarArticulo(fila) {
    setSeleccion((prev) => new Set(prev).add(fila.mate_codigo))
    setCantidades((prev) => {
      const actual = prev[fila.mate_codigo]
      if (actual !== undefined && actual !== '' && actual !== null) return prev
      return { ...prev, [fila.mate_codigo]: 1 }
    })
    if (!codigosSugeridos.has(fila.mate_codigo) && !codigosAgregados.has(fila.mate_codigo)) {
      setAgregados((prev) => [...prev, { ...fila, cantidad_sugerida: null, topeada: false }])
    }
    setBuscarTexto('')
    setBuscarResultados([])
    setBuscarAbierto(false)
  }

  // Plantilla de WhatsApp: se carga una vez al entrar a armar la orden.
  // No se resuelve con permisos porque templates_mensaje es de lectura
  // publica para cualquier usuario logueado.
  const [plantillaWa, setPlantillaWa] = useState(null)
  useEffect(() => {
    supabase
      .from('templates_mensaje')
      .select('cuerpo')
      .eq('codigo', 'tpl_wa_oc')
      .maybeSingle()
      .then(({ data }) => setPlantillaWa(data))
  }, [])

  // Desglose de stock por deposito (21/8/2026) -- hasta ahora esta
  // pantalla solo mostraba `s.stock` (Local+Central combinado, viene
  // de sugerencias_compra()/buscar_articulos_proveedor()). Saber
  // cuanto hay en Local vs Central ayuda a decidir si conviene primero
  // una reposicion interna (Central -> Local, pantalla de Reposicion
  // interna) en vez de salir a comprarle al proveedor. No bloquea el
  // armado de la orden si falla -- es informativo, no critico.
  const [stockPorSku, setStockPorSku] = useState({})
  useEffect(() => {
    traerStockPorDeposito()
      .then(setStockPorSku)
      .catch((err) => console.warn('No se pudo cargar el desglose de stock por deposito:', err.message))
  }, [])

  // Paginado y filtros: hay proveedores con 700+ articulos en alerta.
  // Renderizarlos todos de una traba el scroll, porque cada fila tiene
  // un checkbox y un input controlado.
  const [busqueda, setBusqueda] = useState('')
  const [ocultarSinHistorial, setOcultarSinHistorial] = useState(false)
  const [paginaActual, setPaginaActual] = useState(1)
  const [filasPorPagina, setFilasPorPagina] = useState(50)

  // Union de lo sugerido por alerta y lo agregado a mano: de aca para
  // abajo (tabla, busqueda del listado, paginado, calculo de items a
  // guardar) todo trabaja sobre `filas`, sin distinguir el origen.
  const filas = useMemo(() => [...sugerencias, ...agregados], [sugerencias, agregados])

  const filtradas = useMemo(() => {
    let out = filas
    if (ocultarSinHistorial) out = out.filter((s) => s.cantidad_sugerida != null)
    if (busqueda) {
      const t = busqueda.toLowerCase()
      out = out.filter(
        (s) =>
          s.mate_codigo?.toLowerCase().includes(t) ||
          s.mate_nombre?.toLowerCase().includes(t)
      )
    }
    return out
  }, [filas, busqueda, ocultarSinHistorial])

  useEffect(() => {
    setPaginaActual(1)
  }, [busqueda, ocultarSinHistorial, filasPorPagina])

  const totalFilas = filtradas.length
  const totalPaginas = Math.max(1, Math.ceil(totalFilas / filasPorPagina))
  const paginaSegura = Math.min(paginaActual, totalPaginas)
  const inicio = (paginaSegura - 1) * filasPorPagina
  const paginadas = filtradas.slice(inicio, inicio + filasPorPagina)

  const sinHistorialTotal = useMemo(
    () => filas.filter((s) => s.cantidad_sugerida == null).length,
    [filas]
  )

  // NADA viene tildado por defecto. El sistema sugiere, la persona
  // decide: una orden de compra termina en plata gastada, asi que
  // ningun articulo entra sin que alguien lo haya elegido.
  // Las cantidades SI vienen precargadas, que es el trabajo que
  // realmente se ahorra: al tildar, el numero ya esta puesto.
  useEffect(() => {
    const cants = {}
    for (const s of sugerencias) {
      cants[s.mate_codigo] = s.cantidad_sugerida != null ? Number(s.cantidad_sugerida) : ''
    }
    setSeleccion(new Set())
    setCantidades(cants)
  }, [sugerencias])

  function toggle(codigo) {
    setSeleccion((prev) => {
      const n = new Set(prev)
      if (n.has(codigo)) n.delete(codigo)
      else n.add(codigo)
      return n
    })
  }

  // "Seleccionar todo" aplica SOLO a la pagina visible: con 700 filas,
  // un tilde que marca todo lo que no ves es una forma facil de mandar
  // una orden gigante sin querer.
  function toggleTodos() {
    const codigosPagina = paginadas.map((s) => s.mate_codigo)
    const todosMarcados = codigosPagina.length > 0 && codigosPagina.every((c) => seleccion.has(c))
    setSeleccion((prev) => {
      const n = new Set(prev)
      for (const c of codigosPagina) {
        if (todosMarcados) n.delete(c)
        else n.add(c)
      }
      return n
    })
  }

  const items = useMemo(
    () =>
      filas
        .filter((s) => seleccion.has(s.mate_codigo))
        .map((s) => ({
          mate_codigo: s.mate_codigo,
          mate_nombre: s.mate_nombre,
          cantidad: Number(cantidades[s.mate_codigo]) || 0,
          stock_al_momento: s.stock,
          promedio_mensual: s.promedio,
          unidades_por_bulto: s.unidades_por_bulto,
          costo_unitario: s.costo_unitario ?? null,
        }))
        .filter((i) => i.cantidad > 0),
    [filas, seleccion, cantidades]
  )

  // Valorizacion con CRM Neto (costo sin impuestos). Los articulos sin
  // costo cargado NO suman al total: por eso se cuentan aparte y el
  // semaforo queda en amarillo, para no mostrar un verde que se apoya
  // en un total incompleto.
  const valorizacion = useMemo(() => {
    let total = 0
    let sinCosto = 0
    for (const i of items) {
      const c = Number(i.costo_unitario)
      if (Number.isFinite(c) && c > 0) total += c * i.cantidad
      else sinCosto++
    }
    return { total, sinCosto }
  }, [items])

  // El limite viene resuelto de condiciones_proveedor(): ya trae el
  // propio del proveedor si existe, o el general si no. No hay que
  // repetir esa logica ac\u00e1.
  const limite = condiciones?.limite ?? null

  const superaLimite = limite != null && valorizacion.total > limite
  const siempreAprueba = !!condiciones?.siempre_aprueba

  // Minimo de compra: puede estar en pesos o en unidades (Aris carga
  // "$150.000 o 20 unidades", son cosas distintas). Se compara contra
  // lo que corresponde en cada caso.
  const totalUnidades = items.reduce((acc, i) => acc + Number(i.cantidad || 0), 0)
  const minimo = condiciones?.minimo_compra ?? null
  const minimoEsUnidades = !!condiciones?.minimo_es_unidades
  const noLlegaAlMinimo =
    minimo != null &&
    items.length > 0 &&
    (minimoEsUnidades ? totalUnidades < minimo : valorizacion.total < minimo)

  const whatsapp = condiciones?.whatsapp ?? null

  // Arma el link de wa.me con el template de WhatsApp cargado en
  // Templates de mensajes, reemplazando las variables con los datos de
  // esta orden. No envia nada solo: abre WhatsApp con el texto ya
  // escrito y la persona aprieta enviar.
  // Sprint 4/9/2026, feedback del cliente: el mensaje de WhatsApp al
  // proveedor no debe mostrar el SKU interno de YiQi (es una referencia
  // nuestra, no del proveedor) ni ningún valor/precio de la orden -- y
  // sí debe decir quién generó el pedido. "total" se deja vacío a
  // propósito (no se saca del objeto: si la plantilla en "Templates de
  // mensajes" todavía tiene {{total}} escrito, así se renderiza en
  // blanco en vez de mostrar el precio o dejar el "{{total}}" literal
  // sin reemplazar).
  function abrirWhatsApp() {
    if (!whatsapp) return
    const datos = {
      empresa: 'Dentalab',
      proveedor,
      nro_orden: '(se asigna al guardar)',
      fecha: new Date().toLocaleDateString('es-AR'),
      total: '',
      cant_items: String(items.length),
      items: items
        .map((i) => `• ${i.mate_nombre ?? i.mate_codigo} — ${formatoNumero(i.cantidad)} un.`)
        .join('\n'),
      notas: notas || '',
      contacto: nombreUsuario || '',
    }
    const texto = renderTemplate(plantillaWa?.cuerpo ?? '', datos)
    const numero = String(whatsapp).replace(/\D/g, '')
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`, '_blank')
  }

  // Si supera el limite, si hay articulos sin costo, o si el proveedor
  // esta marcado para pasar SIEMPRE por Aris, va a aprobacion. El caso
  // sin costo es a proposito: no se puede afirmar que una orden esta
  // dentro del limite si parte del total no se pudo calcular.
  //
  // Excepcion: si quien arma la orden es Aris (esAdmin), no hay control
  // que aplicarle — es el dueño, la orden se confirma directo sin pasar
  // por "pendiente" (ni siquiera por su propia aprobación). El límite y
  // el "siempre aprueba" son controles pensados para Ivana.
  const requiereAprobacion =
    !esAdmin && items.length > 0 && (superaLimite || valorizacion.sinCosto > 0 || siempreAprueba)

  const semaforo = items.length === 0
    ? null
    : esAdmin
      ? (valorizacion.sinCosto > 0
          ? { clase: 'bg-[var(--yel-bg)] text-[#92400e] border-amber-200', label: 'Orden directa — faltan costos en algunos artículos' }
          : { clase: 'bg-[var(--grn-bg,#dcfce7)] text-[var(--grn)] border-green-200', label: 'Orden directa (sin controles de aprobación)' })
      : siempreAprueba
        ? { clase: 'bg-blue-50 text-[#1d4ed8] border-blue-200', label: 'Este proveedor siempre requiere aprobación de Aris' }
        : valorizacion.sinCosto > 0
          ? { clase: 'bg-[var(--yel-bg)] text-[#92400e] border-amber-200', label: 'Falta costo de algunos artículos' }
          : superaLimite
            ? { clase: 'bg-blue-50 text-[#1d4ed8] border-blue-200', label: 'Requiere aprobación de Aris' }
            : { clase: 'bg-[var(--grn-bg,#dcfce7)] text-[var(--grn)] border-green-200', label: 'Dentro del límite' }

  return (
    <div className="p-4">
      <button
        onClick={onCancelar}
        className="text-sm text-[var(--ind,#4338ca)] hover:underline mb-2 inline-block"
      >
        ← Volver a proveedores
      </button>

      <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
        <div>
          <div className="text-[15px] font-bold">{proveedor}</div>
          <div className="text-[12px] text-[var(--sub)]">
            {sugerencias.length} artículos por debajo del punto de pedido · {items.length} seleccionados
          </div>
          {semaforo && (
            <div className={`mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[12px] font-semibold ${semaforo.clase}`}>
              <span>{formatoMoneda(valorizacion.total)}</span>
              <span className="opacity-40">·</span>
              <span>{semaforo.label}</span>
              {valorizacion.sinCosto > 0 && (
                <span className="font-normal opacity-80">
                  ({valorizacion.sinCosto} sin costo cargado)
                </span>
              )}
            </div>
          )}
          {limite != null && !esAdmin && (
            <div className="text-[11px] text-gray-400 mt-1">
              Límite de aprobación automática: {formatoMoneda(limite)}
              {condiciones?.limite_es_propio && (
                <span className="text-[#1d4ed8]"> (propio de este proveedor)</span>
              )}
            </div>
          )}
          {noLlegaAlMinimo && (
            <div className="mt-1.5 text-[11px] text-[#92400e] bg-[var(--yel-bg,#fef3c7)] inline-block px-2 py-1 rounded-md">
              No llega al mínimo de compra de este proveedor
              ({minimoEsUnidades ? `${minimo} unidades` : formatoMoneda(minimo)})
            </div>
          )}
        </div>
        {/* Las mismas acciones que abajo: con 700 filas, obligar a
            scrollear hasta el final para guardar es una molestia. */}
        <div className="flex items-center gap-2">
          {whatsapp && (
            <button
              type="button"
              disabled={items.length === 0}
              onClick={abrirWhatsApp}
              title={`Abrir WhatsApp con ${whatsapp}`}
              className="px-3.5 py-2 rounded-lg text-[13px] font-semibold border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-40"
            >
              💬 Enviar por WhatsApp
            </button>
          )}
          <button
            disabled={ocupado || items.length === 0}
            onClick={() => onGuardar({ items, notas, estado: 'borrador', valorizacion })}
            className="px-3.5 py-2 rounded-lg text-[13px] font-semibold border border-[var(--border)] bg-white hover:bg-gray-50 disabled:opacity-40"
          >
            Guardar borrador
          </button>
          <button
            disabled={ocupado || items.length === 0}
            onClick={() => onGuardar({ items, notas, estado: requiereAprobacion ? 'pendiente' : 'aprobada', valorizacion })}
            className="px-3.5 py-2 rounded-lg text-[13px] font-semibold bg-[var(--ind,#4338ca)] text-white hover:opacity-90 disabled:opacity-40"
          >
            {requiereAprobacion ? 'Enviar a aprobación' : 'Confirmar orden'} ({items.length})
          </button>
        </div>
      </div>

      {preseleccionSku && (
        <Aviso tipo="filtro" autoCerrarEn={20} className="mb-3">
          Viniste desde Reposición interna: Depósito Central no tiene stock suficiente de <b>{preseleccionSku}</b>{' '}
          para cubrir el faltante del local, por eso te sugerimos pedirlo directo a {proveedor}. Lo dejamos
          buscado más abajo — hacé click en "+ Agregar" si querés incluirlo en esta orden.
        </Aviso>
      )}

      <Aviso tipo="info" id="nuevaoc-sugerencia" className="mb-3">
        La cantidad sugerida busca cubrir el consumo de los próximos meses según el promedio de venta y se
        redondea hacia arriba al múltiplo de compra, con un tope máximo por producto. Esos parámetros y el
        límite de aprobación se configuran en las reglas del sistema. Es un punto de partida: podés editar
        libremente las cantidades.
      </Aviso>

      {/* Agregar a mano: busca en TODO el catálogo comprable del
          proveedor, no solo lo que está en alerta. Al elegir un
          resultado se suma a la tabla de abajo, tildado, cantidad 1
          para editar. Si el artículo ya estaba en la tabla (por alerta
          o por un agregado previo), no se duplica: solo se tilda. */}
      <div className="relative mb-3">
        <label className="block text-[12px] font-semibold text-[var(--sub)] mb-1">
          Agregar otro artículo del proveedor
        </label>
        <input
          type="text"
          value={buscarTexto}
          onChange={(e) => {
            setBuscarTexto(e.target.value)
            setBuscarAbierto(true)
          }}
          onFocus={() => setBuscarAbierto(true)}
          onBlur={() => setTimeout(() => setBuscarAbierto(false), 150)}
          placeholder="Buscar por SKU o nombre en todo el catálogo de este proveedor…"
          className="w-full max-w-md border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
        />
        {buscarAbierto && buscarTexto.trim().length >= 2 && (
          <div className="absolute z-10 mt-1 w-full max-w-md bg-white border border-[var(--border)] rounded-lg shadow-lg max-h-72 overflow-y-auto">
            {buscarCargando ? (
              <div className="px-3 py-2.5 text-sm text-[var(--sub)]">Buscando…</div>
            ) : buscarResultados.length === 0 ? (
              <div className="px-3 py-2.5 text-sm text-[var(--sub)]">
                Sin resultados en el catálogo de {proveedor}.
              </div>
            ) : (
              buscarResultados.map((r) => {
                const yaIncluido = seleccion.has(r.mate_codigo)
                return (
                  <button
                    type="button"
                    key={r.mate_codigo}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => agregarArticulo(r)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0 flex items-center justify-between gap-2"
                  >
                    <span className="min-w-0 flex items-baseline gap-2">
                      <span className="font-mono text-xs text-gray-400 whitespace-nowrap">{r.mate_codigo}</span>
                      <span className="text-[13px] font-medium truncate">{r.mate_nombre ?? '—'}</span>
                    </span>
                    <span className="text-[11px] font-semibold whitespace-nowrap">
                      {yaIncluido ? (
                        <span className="text-[var(--grn,#3d9970)]">Agregado ✓</span>
                      ) : (
                        <span className="text-[var(--ind,#4338ca)]">+ Agregar</span>
                      )}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por SKU o nombre…"
            className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm w-64"
          />
          {sinHistorialTotal > 0 && (
            <label className="flex items-center gap-2 text-[13px] text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={ocultarSinHistorial}
                onChange={(e) => setOcultarSinHistorial(e.target.checked)}
              />
              Ocultar sin historial ({sinHistorialTotal})
            </label>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-500">
          Filas por página
          <select
            value={filasPorPagina}
            onChange={(e) => setFilasPorPagina(Number(e.target.value))}
            className="border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm"
          >
            {[25, 50, 100].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden mb-3">
        {cargando ? (
          <div className="p-8 text-center text-[var(--sub)] text-sm">Calculando sugerencias…</div>
        ) : paginadas.length === 0 ? (
          <div className="p-8 text-center text-[var(--sub)] text-sm">
            {filas.length === 0
              ? 'Este proveedor no tiene artículos por debajo del punto de pedido. Podés buscar y agregar artículos a mano más arriba.'
              : 'Ningún artículo coincide con el filtro.'}
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-[var(--border)]">
                <th className="px-3 py-1.5 w-10">
                  <input
                    type="checkbox"
                    title="Seleccionar todo lo visible en esta página"
                    checked={
                      paginadas.length > 0 && paginadas.every((s) => seleccion.has(s.mate_codigo))
                    }
                    onChange={toggleTodos}
                  />
                </th>
                {['SKU', 'Producto', 'Stock', 'Mín.', 'Prom./mes', 'Bulto', 'Costo unit.', 'Cantidad a pedir'].map((h) => (
                  <th key={h} className="text-left px-3 py-1.5 text-[10px] font-bold text-[var(--sub)] uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginadas.map((s) => {
                const marcado = seleccion.has(s.mate_codigo)
                const sinBase = s.cantidad_sugerida == null
                return (
                  <tr
                    key={s.mate_codigo}
                    className={`border-b border-gray-100 last:border-0 ${marcado ? 'bg-indigo-50/40' : ''}`}
                  >
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={marcado} onChange={() => toggle(s.mate_codigo)} />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{s.mate_codigo}</td>
                    <td className="px-3 py-2 text-[13px] font-medium max-w-[280px] truncate" title={s.mate_nombre ?? ''}>
                      {s.mate_nombre ?? '—'}
                      {s.notas && (
                        <span
                          title={`Nota de YiQi sobre el punto de pedido: ${s.notas}`}
                          className="ml-1 text-[11px] text-[var(--ind,#4338ca)] cursor-help"
                        >
                          📝
                        </span>
                      )}
                    </td>
                    <td className={`px-3 py-2 font-bold text-sm ${Number(s.stock) <= 0 ? 'text-[var(--red)]' : ''}`}>
                      {formatoNumero(s.stock)}
                      {(() => {
                        const desglose = textoDesgloseStock(stockPorSku[s.mate_codigo])
                        if (!desglose) return null
                        return (
                          <div
                            className="text-[10px] font-normal text-gray-400 whitespace-nowrap"
                            title={desglose.tooltip}
                          >
                            {desglose.principal}
                          </div>
                        )
                      })()}
                    </td>
                    <td className="px-3 py-2 text-gray-400 text-sm">{formatoNumero(s.umbral)}</td>
                    <td className="px-3 py-2 text-sm">
                      {sinBase ? (
                        <span className="text-[11px] text-gray-400 italic whitespace-nowrap">Sin historial</span>
                      ) : (
                        <span className="text-[var(--ind,#4338ca)] font-semibold">{formatoNumero(s.promedio)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-400 text-sm">
                      {s.unidades_por_bulto ? `x${formatoNumero(s.unidades_por_bulto)}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-sm text-right tabular-nums">
                      {s.costo_unitario
                        ? formatoMoneda(s.costo_unitario)
                        : <span className="text-[11px] text-gray-400 italic">sin costo</span>}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={cantidades[s.mate_codigo] ?? ''}
                        placeholder={sinBase ? 'A definir' : ''}
                        onChange={(e) => {
                          const valor = e.target.value
                          setCantidades((prev) => ({ ...prev, [s.mate_codigo]: valor }))
                          // Escribir una cantidad ES la decisión de sumar el
                          // artículo a la orden -- no debería hacer falta un
                          // segundo click en el tilde para que cuente (pedido
                          // de Federico, sprint 4/9/2026). Solo tilda: no
                          // destilda si se borra o se pone en 0 mientras se
                          // está corrigiendo un número a mano -- para sacar
                          // un artículo de la orden, el tilde sigue siendo
                          // la acción explícita.
                          const num = Number(valor)
                          if (valor !== '' && Number.isFinite(num) && num > 0) {
                            setSeleccion((prev) =>
                              prev.has(s.mate_codigo) ? prev : new Set(prev).add(s.mate_codigo)
                            )
                          }
                        }}
                        className={`w-24 border rounded-lg px-2 py-1 text-sm text-right ${
                          sinBase ? 'border-dashed border-gray-300 placeholder:text-[11px]' : 'border-[var(--border)]'
                        }`}
                      />
                      {s.topeada && (
                        <div
                          className="text-[10px] text-[#92400e] mt-0.5"
                          title="El cálculo pedía más, pero la regla limita a 2 bultos por producto"
                        >
                          topeado por regla
                        </div>
                      )}
                      {(() => {
                        const cant = Number(cantidades[s.mate_codigo]) || 0
                        const bulto = Number(s.unidades_por_bulto) || 0
                        if (cant <= 0 || bulto <= 0 || esMultiploDeBulto(cant, bulto)) return null
                        return (
                          <div
                            className="text-[10px] text-[var(--red)] mt-0.5"
                            title={`Este proveedor vende en bultos de ${formatoNumero(bulto)}. La cantidad tiene que ser 0 o un múltiplo de ${formatoNumero(bulto)} para poder confirmar la orden.`}
                          >
                            no es múltiplo del bulto (x{formatoNumero(bulto)})
                          </div>
                        )
                      })()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {totalFilas > 0 && (
        <div className="flex items-center justify-between text-sm text-gray-500 px-1 mb-3">
          <span>
            Mostrando {inicio + 1}–{Math.min(inicio + filasPorPagina, totalFilas)} de {totalFilas}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
              disabled={paginaSegura <= 1}
              className="px-2.5 py-1 rounded border border-[var(--border)] disabled:opacity-40"
            >
              ‹ Anterior
            </button>
            <span className="text-xs text-gray-400">Página {paginaSegura} de {totalPaginas}</span>
            <button
              onClick={() => setPaginaActual((p) => Math.min(totalPaginas, p + 1))}
              disabled={paginaSegura >= totalPaginas}
              className="px-2.5 py-1 rounded border border-[var(--border)] disabled:opacity-40"
            >
              Siguiente ›
            </button>
          </div>
        </div>
      )}

      <textarea
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        placeholder="Notas para el proveedor o para Aris (opcional)…"
        rows={2}
        className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm mb-3"
      />

      <div className="flex items-center justify-end gap-2">
        <button
          disabled={ocupado || items.length === 0}
          onClick={() => onGuardar({ items, notas, estado: 'borrador', valorizacion })}
          className="px-3.5 py-2 rounded-lg text-[13px] font-semibold border border-[var(--border)] bg-white hover:bg-gray-50 disabled:opacity-40"
        >
          Guardar borrador
        </button>
        <button
          disabled={ocupado || items.length === 0}
          onClick={() => onGuardar({ items, notas, estado: requiereAprobacion ? 'pendiente' : 'aprobada', valorizacion })}
          className="px-3.5 py-2 rounded-lg text-[13px] font-semibold bg-[var(--ind,#4338ca)] text-white hover:opacity-90 disabled:opacity-40"
        >
          {requiereAprobacion ? 'Enviar a aprobación' : 'Confirmar orden'} ({items.length})
        </button>
      </div>
    </div>
  )
}

// ============================================================
// Componente principal
// ============================================================
export default function NuevaOC({ onCambioOrdenes, preseleccion, onConsumirPreseleccion }) {
  const permisos = usePermisos()

  const [vista, setVista] = useState('lista') // lista | armar
  const [proveedores, setProveedores] = useState([])
  const [reglas, setReglas] = useState(null)
  const [sugerencias, setSugerencias] = useState([])
  const [condicionesProveedor, setCondicionesProveedor] = useState(null)
  const [proveedorElegido, setProveedorElegido] = useState(null)
  // SKU que trajo el botón "🛒 Pedir a proveedor" de Reposición interna
  // (21/8/2026, ítem 5) -- ver elegirProveedor() y el efecto de abajo.
  const [skuPreseleccionado, setSkuPreseleccionado] = useState(null)

  const [cargando, setCargando] = useState(true)
  const [cargandoSub, setCargandoSub] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)

  const claveFiltro =
    permisos.cargando || permisos.error
      ? null
      : `${permisos.esAdmin}|${permisos.nombres.join(',')}`

  async function cargarTodo() {
    setCargando(true)
    setError(null)
    try {
      const [resProv, resReglas] = await Promise.all([
        supabase.rpc('proveedores_con_alertas'),
        supabase.from('reglas_compra').select('*').eq('id', 1).maybeSingle(),
      ])

      if (resProv.error) throw new Error(resProv.error.message)
      if (resReglas.error) throw new Error(resReglas.error.message)
      setReglas(resReglas.data ?? null)
      setProveedores(resProv.data ?? [])
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }

  const cargarOrdenes = cargarTodo

  useEffect(() => {
    if (claveFiltro === null) return
    cargarOrdenes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveFiltro])

  async function elegirProveedor(nombre) {
    // Limpia cualquier preselección de un viaje anterior desde Reposición
    // interna: si no se limpia acá, elegir OTRO proveedor a mano después
    // de volver de una preselección dejaría el buscador de la pantalla
    // nueva precargado con un SKU que no tiene nada que ver.
    setSkuPreseleccionado(null)
    setProveedorElegido(nombre)
    setVista('armar')
    setCargandoSub(true)
    try {
      // Sugerencias y condiciones comerciales en paralelo: la funcion
      // condiciones_proveedor() ya devuelve el limite resuelto (propio
      // del proveedor si existe, general si no), asi que ArmarOrden no
      // tiene que decidir eso.
      const [resSug, resCond] = await Promise.all([
        supabase.rpc('sugerencias_compra', { p_proveedor: nombre }),
        supabase.rpc('condiciones_proveedor', { p_proveedor: nombre }),
      ])
      if (resSug.error) throw new Error(resSug.error.message)
      if (resCond.error) throw new Error(resCond.error.message)
      setSugerencias(resSug.data ?? [])
      setCondicionesProveedor(resCond.data ?? null)
    } catch (e) {
      setError(e.message)
    } finally {
      setCargandoSub(false)
    }
  }

  // Puente desde Reposición interna (21/8/2026, ítem 5): si llega una
  // preselección, salta directo a "armar" con ese proveedor -- sin pasar
  // por SelectorProveedor, y sin importar si ese proveedor aparece o no
  // en proveedores_con_alertas() (es una lista distinta, calculada con
  // otro criterio -- sugerencias_compra() vs reposicion_interna()).
  // elegirProveedor() ya funciona con cualquier nombre de proveedor, así
  // que no hace falta duplicar su lógica acá. Se consume una sola vez
  // (avisa al padre para que limpie su estado) para no repetir el salto
  // si el usuario vuelve a esta pantalla por su cuenta después.
  useEffect(() => {
    if (!preseleccion) return
    elegirProveedor(preseleccion.proveedor)
    setSkuPreseleccionado(preseleccion.sku)
    if (typeof onConsumirPreseleccion === 'function') onConsumirPreseleccion()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preseleccion])

  async function guardarOrden({ items, notas, estado, valorizacion }) {
    // El borrador puede quedar con cantidades a medio ajustar -- el
    // bloqueo por múltiplo de bulto es solo para lo que se manda de
    // verdad (aprobada/pendiente). Se repite el chequeo acá (además
    // del aviso visual en la tabla, en ArmarOrden) porque no hay
    // garantía de que la persona haya visto ese aviso antes de tocar
    // "Confirmar orden" / "Enviar a aprobación".
    if (estado !== 'borrador') {
      const conError = items.filter((i) => !esMultiploDeBulto(i.cantidad, i.unidades_por_bulto))
      if (conError.length > 0) {
        setError(
          (conError.length === 1
            ? 'No se puede confirmar: 1 artículo no respeta el múltiplo de bulto del proveedor — '
            : `No se puede confirmar: ${conError.length} artículos no respetan el múltiplo de bulto del proveedor — `) +
            conError
              .map(
                (i) =>
                  `${i.mate_codigo} (pediste ${formatoNumero(i.cantidad)}, bulto de ${formatoNumero(i.unidades_por_bulto)})`
              )
              .join('; ') +
            '. Ajustá la cantidad a un múltiplo del bulto (o dejala en 0 para sacarlo de la orden) y volvé a confirmar.'
        )
        return
      }
    }
    setOcupado(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sesión vencida. Volvé a iniciar sesión.')

      const { data: cab, error: errCab } = await supabase
        .from('ordenes_propias')
        .insert({
          proveedor_nombre: proveedorElegido,
          notas: notas || null,
          estado: 'borrador', // se crea como borrador y despues se mueve
          creada_por: user.id,
          // Foto de la valorizacion al momento de armarla: los costos
          // cambian, y la decision se tomo con estos numeros.
          total_estimado: valorizacion?.total ?? null,
          items_sin_costo: valorizacion?.sinCosto ?? 0,
          // Antes guardaba siempre reglas?.limite_aprobacion (el limite
          // GENERAL), aunque el proveedor tuviera uno propio distinto:
          // el numero que quedaba en el historial no coincidia con el
          // que realmente se uso para decidir (ver condiciones_proveedor
          // arriba). Si arma Aris, no hay limite que haya aplicado.
          limite_al_crear: permisos.esAdmin
            ? null
            : (condicionesProveedor?.limite ?? reglas?.limite_aprobacion ?? null),
        })
        .select()
        .single()
      if (errCab) throw new Error(errCab.message)

      const { error: errItems } = await supabase
        .from('ordenes_propias_items')
        .insert(items.map((i) => ({ ...i, orden_id: cab.id })))
      if (errItems) throw new Error(errItems.message)

      // Si pidio enviarla a aprobacion, recien ahora cambia de estado:
      // asi los items ya estan guardados cuando Aris la ve.
      if (estado !== 'borrador') {
        const parche = { estado, enviada_en: new Date().toISOString() }
        // Dentro del limite: no necesita aprobacion de nadie, queda
        // confirmada directamente por quien la armo. Si la arma Aris,
        // es directa siempre (es el dueño, no tiene límite que aplique).
        if (estado === 'aprobada') {
          parche.decidida_por = user.id
          parche.decidida_en = new Date().toISOString()
          parche.comentario_decision = permisos.esAdmin
            ? 'Orden directa de Aris (dueño, sin control de aprobación)'
            : 'Dentro del límite de aprobación automática'
        }
        const { error: errEstado } = await supabase
          .from('ordenes_propias')
          .update(parche)
          .eq('id', cab.id)
        if (errEstado) throw new Error(errEstado.message)

        // Escritura a YiQi: solo si quedó aprobada directo (dentro del
        // límite, o la armó Aris). Nunca bloquea ni deshace la
        // aprobación ya confirmada arriba -- si falla, la función
        // misma guarda yiqi_error en la orden. Ver
        // supabase/functions/enviar-oc-yiqi.
        if (estado === 'aprobada') {
          try {
            await supabase.functions.invoke('enviar-oc-yiqi', { body: { orden_id: cab.id } })
          } catch (errYiqi) {
            console.error('[enviar-oc-yiqi]', errYiqi)
          }
        }
      }

      setAviso(
        estado === 'pendiente'
          ? `Orden #${cab.id} enviada a aprobación de Aris.`
          : estado === 'aprobada'
            ? permisos.esAdmin
              ? `Orden #${cab.id} confirmada directo (la armó Aris).`
              : `Orden #${cab.id} confirmada: está dentro del límite de aprobación automática.`
            : `Borrador #${cab.id} guardado.`
      )
      setVista('lista')
      await cargarOrdenes()
      // Solo puede haber cambiado el badge si NO quedo en borrador
      // (paso a pendiente, o quedo aprobada directo por estar dentro
      // del limite). Evita una llamada de mas en el caso mas comun.
      if (estado !== 'borrador' && typeof onCambioOrdenes === 'function') {
        onCambioOrdenes()
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#f7f8fa]">
      <div className="px-6 py-4 border-b border-[var(--border)] bg-white flex items-start justify-between gap-3">
        <div>
          <div className="text-[17px] font-bold">Nueva OC</div>
          <div className="text-[12px] text-[var(--sub)] mt-0.5">
            Armá órdenes a partir de los quiebres de stock. El seguimiento y la aprobación
            están en “Órdenes de compra”.
          </div>
        </div>
      </div>

      {permisos.error && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-[var(--red)] rounded-lg p-4">
          <p className="font-semibold">No se pudieron determinar tus permisos</p>
          <p className="text-sm mt-1">{permisos.error}</p>
        </div>
      )}

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

      {cargando ? (
        <div className="p-10 text-center text-[var(--sub)] text-sm">Cargando…</div>
      ) : vista === 'lista' ? (
        <SelectorProveedor
          proveedores={proveedores}
          cargando={false}
          onElegir={elegirProveedor}
        />
      ) : vista === 'armar' ? (
        <ArmarOrden
          // key por proveedor: fuerza un montaje limpio al cambiar de
          // proveedor, para que los artículos agregados a mano (estado
          // local del componente, no viene por props) no sobrevivan al
          // salto de un proveedor a otro.
          key={proveedorElegido}
          proveedor={proveedorElegido}
          sugerencias={sugerencias}
          cargando={cargandoSub}
          onGuardar={guardarOrden}
          onCancelar={() => setVista('lista')}
          ocupado={ocupado}
          condiciones={condicionesProveedor}
          esAdmin={permisos.esAdmin}
          preseleccionSku={skuPreseleccionado}
          nombreUsuario={permisos.nombreUsuario}
        />
      ) : null}
    </div>
  )
}
