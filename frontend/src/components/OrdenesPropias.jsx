import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePermisos } from '../hooks/usePermisos'
import DeclararCausaModal from './DeclararCausaModal'
import { ultimasCausasPorReferencia } from '../lib/causas'
import { generarPdfOrden, generarPdfOrdenDescargable, subtotalLinea } from '../lib/pdfOrden'
import { ESTADO_OC_PROPIA } from '../lib/estados'
import Pastilla from './ui/Pastilla'
import BloqueAccion from './ui/BloqueAccion'
import BarraPasos from './ui/BarraPasos'
import { renderTemplate } from '../pages/TemplatesMensajes'
// ============================================================
// OrdenesPropias.jsx
// Órdenes generadas DESDE el sistema (tablas ordenes_propias /
// ordenes_propias_items), con su circuito de aprobación.
//
// Vive acá y no en "Nueva OC" a propósito: Nueva OC es para CREAR,
// Órdenes de compra es para GESTIONAR. Las que esperan aprobación de
// Aris no van en la pantalla donde se arman.
//
// Quién puede hacer qué NO se decide en este archivo: las políticas RLS
// de ordenes_propias son las que mandan. Acá solo se muestran u ocultan
// botones.
//
// onCambio: callback opcional que sube desde App.jsx (a traves de
// OrdenesCompra) y recalcula los badges del sidebar. Se llama despues
// de aprobar, rechazar, enviar a aprobacion o borrar — cualquier accion
// que cambie cuantas ordenes estan "esperando aprobacion". Sin esto el
// badge quedaba desactualizado hasta que alguien recargaba la pagina.
// ============================================================
// Semáforo de la tarjeta (feedback Ivana 17/21): el tono sale del estado y,
// para las aprobadas, de dónde quedaron (YiQi / WhatsApp).
function vistaEstadoOrden(o) {
  if (o.estado === 'aprobada') {
    if (!o.yiqi_id_creado) return { tono: 'rojo', label: 'No se pudo cargar en YiQi' }
    if (!o.whatsapp_enviada_en) return { tono: 'amarillo', label: 'Lista para enviar' }
    return { tono: 'verde', label: 'Enviada al proveedor' }
  }
  if (o.estado === 'borrador') return { tono: 'amarillo', label: 'Borrador' }
  const e = ESTADO_OC_PROPIA[o.estado]
  return e ? { tono: e.tono, label: e.label } : { tono: 'gris', label: o.estado }
}
const SEM_DE_TONO = { verde: 'sg', amarillo: 'sy', rojo: 'sr', azul: 'sb', gris: 'bg-gray-300' }
const COLOR_TOTAL = {
  verde: 'text-[var(--grn)]', amarillo: 'text-[#92400e]', rojo: 'text-[var(--red)]',
  azul: 'text-[var(--blu)]', gris: 'text-gray-900',
}
function formatoMoneda(n) {
  const num = Number(n)
  if (!Number.isFinite(num)) return '—'
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
  }).format(num)
}
// Precio unitario con 2 decimales (igual que el PDF): con 0 decimales
// "48 × $398" no daba el subtotal "$19.114" (el costo real es $398,21).
function formatoMoneda2(n) {
  const num = Number(n)
  if (!Number.isFinite(num)) return '—'
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(num)
}
// Fecha corta (sin hora) para la barra de pasos.
function formatoDia(f) {
  if (!f) return null
  try {
    return new Date(f).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch { return null }
}
function formatoNumero(n) {
  if (n == null) return '—'
  const num = Number(n)
  if (!Number.isFinite(num)) return '—'
  return num % 1 === 0 ? String(num) : num.toFixed(1)
}
function formatoFecha(f) {
  if (!f) return '—'
  try {
    return new Date(f).toLocaleString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return '—' }
}

// Botones de la columna de acciones (30/9/2026). Mismo alto para todos
// (h-7) así la fila queda alineada; los de consulta son neutros y los de
// la acción del estado llevan color.
const BTN_BASE = 'inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[12px] font-semibold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
const BTN_SEC = `${BTN_BASE} bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 hover:text-[var(--ind,#4338ca)]`
const BTN_PRIM = `${BTN_BASE} bg-[var(--ind,#4338ca)] border-[var(--ind,#4338ca)] text-white hover:opacity-90`
const BTN_OK = `${BTN_BASE} bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700`
const BTN_PELIGRO = `${BTN_BASE} bg-white border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300`
const BTN_WA = `${BTN_BASE} bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100`
const BTN_WA_OUT = `${BTN_BASE} bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-50`
const BTN_AVISO = `${BTN_BASE} bg-amber-50 border-amber-300 text-[#92400e] hover:bg-amber-100`
const BTN_ICONO = `${BTN_BASE} px-2 bg-white border-transparent text-gray-400 hover:text-red-600 hover:bg-red-50`

// soloOrdenId (2/10/2026, feedback Ivana 12/19): cuando la pantalla se abre
// con ?orden=N (pestaña nueva desde "Ver/Editar ↗"), se muestra SOLO esa
// orden, con barra de pasos y bloque de acción, sin la lista.
export default function OrdenesPropias({ onCambio, soloOrdenId = null }) {
  const permisos = usePermisos()
  const [ordenes, setOrdenes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  // 'activas' = todas las que no estan en la papelera (orden: pendientes
  // de aprobar primero, despues por fecha de creacion). 'papelera' = las
  // que Aris archivo, hasta que las restaure o las elimine del todo.
  const [filtro, setFiltro] = useState('activas')
  const [abierta, setAbierta] = useState(null)
  const [items, setItems] = useState([])
  // Cruce con el espejo de YiQi por Asunto "Dentalab-Compras #<id>" (la única
  // clave confiable, ver FEEDBACK_IVANA_2-10-2026 punto 22). null = no buscado.
  const [ingresoYiqi, setIngresoYiqi] = useState(null)
  const [empresa, setEmpresa] = useState(null)
  // Modal propio para aprobar/rechazar/eliminar, en reemplazo de
  // window.prompt/window.confirm: esos diálogos nativos no se pueden
  // estilar y además bloquean la automatización de pruebas.
  //   { tipo: 'aprobar' | 'rechazar' | 'borrar', orden, nuevoEstado? }
  const [modal, setModal] = useState(null)
  const [comentarioModal, setComentarioModal] = useState('')
  // "+ Agregar mercadería" (23/8/2026) — sumar ítems a una OC que ya
  // está aprobada Y vinculada a YiQi (yiqi_id_creado). Ver
  // supabase/functions/editar-oc-yiqi. Filas en edición, separado de
  // `modal` porque el usuario tipea en varios inputs a la vez.
  const [lineasNuevas, setLineasNuevas] = useState([{ mate_codigo: '', mate_nombre: '', cantidad: '', costo_unitario: '' }])
  const [errorMercaderia, setErrorMercaderia] = useState(null)
  // Id de la orden que se está mandando por WhatsApp ahora mismo — estado
  // propio, separado de `ocupado`, para no deshabilitar Aprobar/Rechazar
  // de otras filas mientras se arma el PDF y se abre WhatsApp de esta.
  const [enviandoWaId, setEnviandoWaId] = useState(null)
  // Ítem 7 (22/8/2026) — causa vigente declarada por orden (ámbito
  // 'compra', referencia = id de ordenes_propias). Ver frontend/src/lib/causas.js.
  const [causasPorOrden, setCausasPorOrden] = useState({})
  const [modalCausa, setModalCausa] = useState(null) // { referenciaId, referenciaTexto } | null

  // ---- Deep link "Ver detalle" en pestaña nueva (28/9/2026) ----
  // El botón "Ver detalle" de la tabla ahora abre `?page=ocs&orden=<id>`
  // en una pestaña nueva (window.open) en vez de expandir el panel en la
  // misma pestaña -- pedido explícito de Federico y del cliente. Esta
  // pestaña nueva arranca sin nada abierto, así que acá se lee el query
  // param UNA sola vez al montar (useState perezoso, no vuelve a leerse
  // aunque cambie la URL) y, apenas la orden pedida aparece en `ordenes`
  // (se carga async), se abre sola con `abrir()` -- mismo código que usa
  // el click manual, ver más abajo.
  const [ordenIdDesdeURL] = useState(() => {
    try {
      const idParam = new URLSearchParams(window.location.search).get('orden')
      return idParam ? Number(idParam) : null
    } catch {
      return null
    }
  })
  useEffect(() => {
    if (!ordenIdDesdeURL || abierta) return
    const encontrada = ordenes.find((o) => o.id === ordenIdDesdeURL)
    if (encontrada) abrir(encontrada)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordenIdDesdeURL, ordenes])

  // ---- Editar cantidades / quitar líneas (28/9/2026) ----
  // Alcance A PROPÓSITO acotado a 'borrador' ÚNICAMENTE (ajustado el
  // mismo día tras verificar la RLS real en vivo contra pg_policies):
  // las 3 policies de escritura de ordenes_propias_items (crear/editar/
  // borrar items) exigen TODAS `orden_id IN (SELECT id FROM
  // ordenes_propias WHERE creada_por = auth.uid() AND estado =
  // 'borrador')` -- sin excepción para 'pendiente' y SIN bypass de
  // es_admin() (a diferencia del UPDATE de la cabecera ordenes_propias,
  // que sí tiene es_admin() OR ...). O sea: hoy, ni siquiera Aris puede
  // editar los ítems de una orden en borrador que armó Ivana -- cada
  // tabla tiene su propia policy independiente. Por eso el gate de abajo
  // usa solo 'borrador'. [30/9/2026] Además se oculta el botón si quien
  // mira no es quien creó el borrador (antes se mostraba y el guardado
  // chocaba con la RLS). Si Postgres rechaza igual, el error real se
  // muestra tal cual en errorEdicionItems -- no se enmascara. Ver
  // migración opcional al final de este archivo (comentario, no se
  // aplicó) si en algún momento se quiere sumar el bypass de admin y/o
  // 'pendiente' a estas policies.
  //
  // Una orden 'aprobada' ya puede estar vinculada a YiQi
  // (yiqi_id_creado) -- tocar cantidades o borrar líneas ahí
  // desincronizaría el ERP del cliente sin que nadie lo pida ni esté
  // probado (mismo motivo por el que editar-oc-yiqi solo permite
  // AGREGAR líneas nuevas, nunca tocar las existentes). En 'borrador' no
  // hay YiQi de por medio todavía -- es 100% local.
  // Solo quien creó el borrador puede editar sus ítems (la RLS de
  // ordenes_propias_items no tiene bypass de admin). Desde el 30/9/2026
  // el botón se oculta a los demás en vez de dejar que choquen con el
  // error de RLS al guardar.
  const [miUserId, setMiUserId] = useState(null)
  useEffect(() => {
    let vivo = true
    supabase.auth.getUser().then(({ data }) => {
      if (vivo) setMiUserId(data?.user?.id ?? null)
    })
    return () => {
      vivo = false
    }
  }, [])
  const [editandoItems, setEditandoItems] = useState(false)
  const [itemsEdit, setItemsEdit] = useState([])
  const [errorEdicionItems, setErrorEdicionItems] = useState(null)
  function puedeEditarItems(orden) {
    return (
      !!orden &&
      !orden.archivada_en &&
      orden.estado === 'borrador' &&
      !!miUserId &&
      orden.creada_por === miUserId
    )
  }
  function iniciarEdicionItems() {
    setItemsEdit(items.map((i) => ({ ...i, _cantidad: String(i.cantidad) })))
    setErrorEdicionItems(null)
    setEditandoItems(true)
  }
  function cancelarEdicionItems() {
    setEditandoItems(false)
    setItemsEdit([])
    setErrorEdicionItems(null)
  }
  function actualizarCantidadEdit(id, valor) {
    setItemsEdit((prev) => prev.map((i) => (i.id === id ? { ...i, _cantidad: valor } : i)))
  }
  function quitarItemEdit(id) {
    // Nunca deja la orden sin ítems desde acá (mismo criterio que
    // quitarLineaNueva de "+ Agregar mercadería", más abajo): si hay que
    // vaciarla del todo, se usa "Eliminar" (borrador) o "Archivar".
    setItemsEdit((prev) => (prev.length <= 1 ? prev : prev.filter((i) => i.id !== id)))
  }
  async function guardarEdicionItems() {
    if (!abierta) return
    setErrorEdicionItems(null)
    for (const it of itemsEdit) {
      if (!(Number(it._cantidad) > 0)) {
        setErrorEdicionItems(`Cantidad inválida para ${it.mate_nombre ?? it.mate_codigo}.`)
        return
      }
    }
    setOcupado(true)
    try {
      const idsRestantes = new Set(itemsEdit.map((i) => i.id))
      const idsEliminados = items.filter((i) => !idsRestantes.has(i.id)).map((i) => i.id)
      const cambiados = itemsEdit.filter((i) => {
        const original = items.find((o) => o.id === i.id)
        return original && Number(original.cantidad) !== Number(i._cantidad)
      })
      if (idsEliminados.length > 0) {
        const { error } = await supabase.from('ordenes_propias_items').delete().in('id', idsEliminados)
        if (error) throw new Error(error.message)
      }
      for (const it of cambiados) {
        const { error } = await supabase
          .from('ordenes_propias_items')
          .update({ cantidad: Number(it._cantidad) })
          .eq('id', it.id)
        if (error) throw new Error(error.message)
      }
      // Recalcula total_estimado / items_sin_costo con lo que queda --
      // mismo criterio que editar-oc-yiqi al sumar mercadería: estas dos
      // columnas quedan desactualizadas si no se tocan acá también (la
      // segunda además es la que bloquea la aprobación si queda mal).
      const nuevoTotal = itemsEdit.reduce(
        (acc, i) => acc + (Number(i.costo_unitario) || 0) * Number(i._cantidad), 0
      )
      const nuevoSinCosto = itemsEdit.filter((i) => !(Number(i.costo_unitario) > 0)).length
      const { error: errTotal } = await supabase
        .from('ordenes_propias')
        .update({ total_estimado: nuevoTotal, items_sin_costo: nuevoSinCosto })
        .eq('id', abierta.id)
      if (errTotal) throw new Error(errTotal.message)

      setAviso(`Ítems de la orden #${abierta.id} actualizados.`)
      setEditandoItems(false)
      setItemsEdit([])
      await cargar()
      await abrir(abierta)
      avisarCambio()
    } catch (e) {
      setErrorEdicionItems(e.message)
    } finally {
      setOcupado(false)
    }
  }

  useEffect(() => {
    if (!modal) return
    function onKeyDown(e) {
      if (e.key === 'Escape') cerrarModal()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal])

  // Notifica al padre sin romper el flujo si onCambio no vino (por
  // ejemplo si este componente se usa en otro lugar sin conectar el
  // sidebar).
  function avisarCambio() {
    if (typeof onCambio === 'function') onCambio()
  }

  async function cargar() {
    setCargando(true)
    setError(null)
    try {
      const [resOrdenes, resEmpresa] = await Promise.all([
        supabase
          .from('ordenes_propias')
          .select('*, ordenes_propias_items(count)')
          .order('id', { ascending: false }),
        supabase.from('empresa_config').select('*').eq('id', 1).maybeSingle(),
      ])
      const { data, error } = resOrdenes
      if (error) throw new Error(error.message)
      setEmpresa(resEmpresa.data ?? null)

      const filas = (data ?? []).map((o) => ({
        ...o,
        cant_items: o.ordenes_propias_items?.[0]?.count ?? 0,
      }))

      // Nombre de quien creo cada orden, para la columna "Creada por".
      // usuarios_config tiene RLS propia (cada usuario lee solo su fila
      // — ver usePermisos.js), asi que un join directo desde aca no
      // mostraria el nombre de nadie mas que uno mismo. Se resuelve con
      // nombres_usuarios(), la funcion SECURITY DEFINER de la migration
      // 20260810150000 que expone solo el nombre, nada sensible.
      const idsCreadores = [...new Set(filas.map((o) => o.creada_por).filter(Boolean))]
      let nombresPorId = {}
      if (idsCreadores.length > 0) {
        const { data: nombresData, error: errNombres } = await supabase.rpc('nombres_usuarios', {
          p_ids: idsCreadores,
        })
        if (errNombres) {
          // No es critico para el resto de la pantalla: si falla, la
          // columna "Creada por" queda en blanco nomas.
          console.error('[nombres_usuarios]', errNombres)
        } else {
          nombresPorId = Object.fromEntries((nombresData ?? []).map((n) => [n.user_id, n.nombre]))
        }
      }

      setOrdenes(filas.map((o) => ({
        ...o,
        creador_nombre: o.creada_por ? (nombresPorId[o.creada_por] ?? null) : null,
      })))
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }
  const clave =
    permisos.cargando || permisos.error ? null : `${permisos.esAdmin}`
  useEffect(() => {
    if (clave === null) return
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])
  const activas = useMemo(() => ordenes.filter((o) => !o.archivada_en), [ordenes])
  const archivadas = useMemo(() => ordenes.filter((o) => o.archivada_en), [ordenes])
  const pendientes = useMemo(
    () => activas.filter((o) => o.estado === 'pendiente'),
    [activas]
  )
  // Las que esperan aprobacion van siempre arriba, sin importar la
  // fecha: son las que Aris tiene que accionar. El resto, mas nuevas
  // primero (la query ya viene ordenada por id desc, pero se reordena
  // aca por si el sort de pendientes lo alteró).
  const activasOrdenadas = useMemo(() => {
    return [...activas].sort((a, b) => {
      const pa = a.estado === 'pendiente' ? 0 : 1
      const pb = b.estado === 'pendiente' ? 0 : 1
      if (pa !== pb) return pa - pb
      return b.id - a.id
    })
  }, [activas])
  const visibles = filtro === 'papelera' ? archivadas : activasOrdenadas

  // Clave por VALOR (no por referencia de array) para no recargar en loop.
  const claveIdsCausas = visibles.map((o) => o.id).join('|')
  useEffect(() => {
    const ids = claveIdsCausas ? claveIdsCausas.split('|') : []
    if (ids.length === 0) return
    let cancelado = false
    ultimasCausasPorReferencia('compra', ids).then((res) => {
      if (!cancelado) setCausasPorOrden((prev) => ({ ...prev, ...res }))
    })
    return () => { cancelado = true }
  }, [claveIdsCausas])

  async function abrir(orden) {
    setAbierta(orden)
    setItems([])
    // Por si se pasa de una orden a otra con la edición de ítems
    // abierta: no se arrastra a la orden nueva.
    setEditandoItems(false)
    setItemsEdit([])
    setErrorEdicionItems(null)
    const { data, error } = await supabase
      .from('ordenes_propias_items')
      .select('*')
      .eq('orden_id', orden.id)
      .order('id')
    if (error) setError(error.message)
    else setItems(data ?? [])
    setIngresoYiqi(null)
    if (orden.estado === 'aprobada' && orden.yiqi_id_creado) {
      const { data: filasYiqi } = await supabase
        .from('ordenes_yiqi')
        .select('nro_oc, cantidad, cantidad_entregada, cantidad_pendiente')
        .eq('asunto', `Dentalab-Compras #${orden.id}`)
      const f = filasYiqi ?? []
      setIngresoYiqi({
        encontrada: f.length > 0,
        nroOC: f[0]?.nro_oc ?? null,
        cantidad: f.reduce((a, x) => a + Number(x.cantidad ?? 0), 0),
        entregada: f.reduce((a, x) => a + Number(x.cantidad_entregada ?? 0), 0),
        pendiente: f.reduce((a, x) => a + Math.max(0, Number(x.cantidad_pendiente ?? 0)), 0),
      })
    }
  }
  async function imprimir(orden) {
    let lista = items
    if (abierta?.id !== orden.id) {
      const { data, error } = await supabase
        .from('ordenes_propias_items')
        .select('*')
        .eq('orden_id', orden.id)
        .order('id')
      if (error) { setError(error.message); return }
      lista = data ?? []
    }
    const { data: prov } = await supabase
      .from('clientes_yiqi')
      .select('clie_cuit, mail, telefono')
      .eq('clie_nombre', orden.proveedor_nombre)
      .limit(1)
      .maybeSingle()
    generarPdfOrden({ orden, items: lista, empresa, proveedor: prov ?? null })
  }
  // Envío semi-automático por WhatsApp (19/8/2026): descarga el PDF real
  // de la orden (jsPDF, se guarda solo en Descargas) y abre WhatsApp con
  // el texto de la plantilla "tpl_wa_oc" ya completado con los datos
  // reales de esta orden, al número de WhatsApp de pedidos cargado en
  // Condiciones comerciales para este proveedor.
  //
  // Por qué no queda 100% automático: wa.me solo puede pre-cargar texto,
  // nunca adjuntar un archivo — es una limitación de WhatsApp, no de acá
  // (confirmado antes de construir esto). El único paso manual que queda
  // es arrastrar el PDF ya descargado a la conversación que se abre.
  async function enviarWhatsApp(orden) {
    setEnviandoWaId(orden.id)
    setError(null)
    try {
      let lista = items
      if (abierta?.id !== orden.id) {
        const { data, error } = await supabase
          .from('ordenes_propias_items')
          .select('*')
          .eq('orden_id', orden.id)
          .order('id')
        if (error) throw new Error(error.message)
        lista = data ?? []
      }

      const [{ data: prov }, { data: provCond }, { data: plantilla }] = await Promise.all([
        supabase.from('clientes_yiqi').select('clie_cuit, mail, telefono')
          .eq('clie_nombre', orden.proveedor_nombre).limit(1).maybeSingle(),
        supabase.from('proveedores').select('whatsapp_pedidos')
          .eq('clie_nombre', orden.proveedor_nombre).limit(1).maybeSingle(),
        supabase.from('templates_mensaje').select('cuerpo')
          .eq('codigo', 'tpl_wa_oc').maybeSingle(),
      ])

      const whatsapp = provCond?.whatsapp_pedidos
      if (!whatsapp) {
        setError(
          `${orden.proveedor_nombre} no tiene WhatsApp de pedidos cargado. ` +
          'Cargalo en "Condiciones comerciales" y volvé a intentar.'
        )
        return
      }

      // El PDF se genera con los items reales recién traídos, no con los
      // de otra orden que pudiera estar abierta en pantalla.
      generarPdfOrdenDescargable({ orden, items: lista, empresa, proveedor: prov ?? null })

      // Sprint 4/9/2026, feedback del cliente: sin SKU interno de YiQi
      // (no le sirve al proveedor), sin ningún valor/precio de la orden
      // (total vacío a propósito, no sacado del objeto -- ver el mismo
      // comentario en NuevaOC.jsx/abrirWhatsApp), y con quién generó el
      // pedido (creador_nombre ya viene resuelto desde cargar(), vía
      // nombres_usuarios()).
      const datos = {
        empresa: empresa?.nombre || 'Dentalab',
        proveedor: orden.proveedor_nombre,
        nro_orden: String(orden.id),
        fecha: formatoFecha(orden.creada_en),
        total: '',
        cant_items: String(lista.length),
        items: lista
          .map((i) => `• ${i.mate_nombre ?? i.mate_codigo} — ${formatoNumero(i.cantidad)} un.`)
          .join('\n'),
        notas: orden.notas || '',
        contacto: orden.creador_nombre || '',
      }
      const texto = renderTemplate(plantilla?.cuerpo ?? '', datos)
      const numero = String(whatsapp).replace(/\D/g, '')
      window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`, '_blank')

      // Registro de auditoría, mismo patrón que archivada_en/archivada_por
      // y marcado_en/marcado_por en el resto del sistema. Best-effort: si
      // esto falla no hay que deshacer nada, el envío ya pasó.
      const ahora = new Date().toISOString()
      try {
        const { data: { user } } = await supabase.auth.getUser()
        await supabase.from('ordenes_propias').update({
          whatsapp_enviada_en: ahora,
          whatsapp_enviada_por: user?.id ?? null,
        }).eq('id', orden.id)
      } catch (errRegistro) {
        console.error('[whatsapp_enviada]', errRegistro)
      }

      setAviso(
        `PDF descargado y WhatsApp abierto para ${orden.proveedor_nombre}. ` +
        'Arrastrá el PDF (carpeta Descargas) a la conversación para adjuntarlo y enviar.'
      )
      if (abierta?.id === orden.id) {
        setAbierta((prev) => (prev ? { ...prev, whatsapp_enviada_en: ahora } : prev))
      }
      await cargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setEnviandoWaId(null)
    }
  }
  // Abre el modal de aprobar/rechazar (reemplaza al viejo window.prompt).
  //
  // Freno agregado el 20/8/2026: la OC #2 se aprobó con 2 artículos sin
  // costo cargado y quedó en YiQi rechazando el POST con "El precio
  // unitario y final no se corresponden" -- YiQi NUNCA acepta una OC con
  // un ítem sin precio, no es un riesgo, es un rechazo seguro. Antes de
  // esto no había ninguna advertencia acá (el semáforo de "sin costo" en
  // Nueva OC ya frena a Ivana, pero Aris podía aprobar cualquier orden
  // pendiente sin que nada la avisara). Ahora, si falta costo, no se abre
  // el modal normal de aprobar -- se explica por qué y no hay forma de
  // confirmar desde acá.
  function pedirDecision(orden, nuevoEstado) {
    if (nuevoEstado === 'aprobada' && orden.items_sin_costo > 0) {
      setModal({ tipo: 'sinCosto', orden })
      return
    }
    setModal({ tipo: nuevoEstado === 'aprobada' ? 'aprobar' : 'rechazar', orden, nuevoEstado })
    setComentarioModal('')
  }
  function cerrarModal() {
    if (ocupado) return
    setModal(null)
    setComentarioModal('')
  }
  async function confirmarDecision() {
    if (!modal) return
    const { orden, nuevoEstado } = modal
    setOcupado(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('ordenes_propias')
        .update({
          estado: nuevoEstado,
          decidida_por: user?.id ?? null,
          decidida_en: new Date().toISOString(),
          comentario_decision: comentarioModal.trim() || null,
        })
        .eq('id', orden.id)
      if (error) throw new Error(error.message)

      // Escritura a YiQi: solo si quedó aprobada. Nunca bloquea ni
      // deshace la aprobación ya confirmada arriba -- si falla, la
      // función misma guarda yiqi_error en la orden y acá no hacemos
      // nada más que loguearlo. Ver supabase/functions/enviar-oc-yiqi.
      if (nuevoEstado === 'aprobada') {
        try {
          await supabase.functions.invoke('enviar-oc-yiqi', { body: { orden_id: orden.id } })
        } catch (errYiqi) {
          console.error('[enviar-oc-yiqi]', errYiqi)
        }
      }

      setAviso(`Orden #${orden.id} ${nuevoEstado === 'aprobada' ? 'aprobada' : 'rechazada'}.`)
      setAbierta(null)
      setModal(null)
      setComentarioModal('')
      await cargar()
      avisarCambio()
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }
  // Reintento manual del envío a YiQi (botón "Reintentar envío" / badge de
  // error). Mismo endpoint que dispara la aprobación automáticamente y que
  // barre el sweep de pg_cron -- enviar-oc-yiqi es idempotente, así que no
  // hay riesgo de duplicar en YiQi si esta orden ya se había enviado bien.
  async function reintentarEnvioYiqi(orden) {
    setOcupado(true)
    try {
      const { data, error } = await supabase.functions.invoke('enviar-oc-yiqi', {
        body: { orden_id: orden.id },
      })
      if (error) throw new Error(error.message)
      if (data?.ok && data?.enviada) {
        setAviso(`Orden #${orden.id} vinculada a YiQi (OC #${data.yiqi_id}).`)
      } else if (data?.ok) {
        setAviso(data?.motivo ? `Orden #${orden.id}: ${data.motivo}` : `Orden #${orden.id}: sin cambios.`)
      } else {
        setError(data?.error || 'No se pudo reenviar la orden a YiQi.')
      }
      await cargar()
      // Si el detalle de esta orden está abierto, se relee directo para
      // que el panel muestre yiqi_id_creado/yiqi_error al toque, sin
      // depender del timing de los setState de cargar().
      if (abierta?.id === orden.id) {
        const { data: fresca } = await supabase
          .from('ordenes_propias')
          .select('*')
          .eq('id', orden.id)
          .maybeSingle()
        if (fresca) setAbierta((prev) => (prev ? { ...prev, ...fresca } : prev))
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }
  // ---- "+ Agregar mercadería" (23/8/2026) ----
  function abrirAgregarMercaderia(orden) {
    setLineasNuevas([{ mate_codigo: '', mate_nombre: '', cantidad: '', costo_unitario: '' }])
    setErrorMercaderia(null)
    setModal({ tipo: 'agregarMercaderia', orden })
  }
  function actualizarLineaNueva(idx, campo, valor) {
    setLineasNuevas((prev) => prev.map((l, i) => (i === idx ? { ...l, [campo]: valor } : l)))
  }
  function agregarLineaNueva() {
    setLineasNuevas((prev) => [...prev, { mate_codigo: '', mate_nombre: '', cantidad: '', costo_unitario: '' }])
  }
  function quitarLineaNueva(idx) {
    setLineasNuevas((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)))
  }
  async function confirmarAgregarMercaderia() {
    if (!modal || modal.tipo !== 'agregarMercaderia') return
    const { orden } = modal
    setErrorMercaderia(null)

    const items = lineasNuevas
      .map((l) => ({
        mate_codigo: l.mate_codigo.trim(),
        mate_nombre: l.mate_nombre.trim() || null,
        cantidad: Number(l.cantidad),
        costo_unitario: Number(l.costo_unitario),
      }))
      .filter((l) => l.mate_codigo)

    if (items.length === 0) {
      setErrorMercaderia('Cargá al menos un SKU.')
      return
    }
    for (const it of items) {
      if (!(it.cantidad > 0)) {
        setErrorMercaderia(`Cantidad inválida para ${it.mate_codigo}.`)
        return
      }
      if (!(it.costo_unitario > 0)) {
        setErrorMercaderia(`Falta el costo unitario de ${it.mate_codigo}.`)
        return
      }
    }

    setOcupado(true)
    try {
      const { data, error } = await supabase.functions.invoke('editar-oc-yiqi', {
        body: { orden_id: orden.id, items },
      })
      if (error) throw new Error(error.message)
      if (!data?.ok) throw new Error(data?.error || 'No se pudo agregar la mercadería.')

      setAviso(`Se agregaron ${data.itemsAgregados} ítem(s) a la orden #${orden.id} y a YiQi.`)
      setModal(null)
      await cargar()
      await abrir(orden) // refresca el detalle e ítems abiertos
      avisarCambio()
    } catch (e) {
      setErrorMercaderia(e.message)
    } finally {
      setOcupado(false)
    }
  }
  async function enviarAAprobacion(orden) {
    setOcupado(true)
    try {
      const { error } = await supabase
        .from('ordenes_propias')
        .update({ estado: 'pendiente', enviada_en: new Date().toISOString() })
        .eq('id', orden.id)
      if (error) throw new Error(error.message)
      setAviso(`Orden #${orden.id} enviada a aprobación.`)
      setAbierta(null)
      await cargar()
      avisarCambio()
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }
  // Abre el modal de confirmación de borrado (reemplaza a window.confirm).
  function pedirBorrar(orden) {
    setModal({ tipo: 'borrar', orden })
  }
  async function confirmarBorrar() {
    if (!modal) return
    const { orden } = modal
    setOcupado(true)
    try {
      const { error } = await supabase.from('ordenes_propias').delete().eq('id', orden.id)
      if (error) throw new Error(error.message)
      setModal(null)
      await cargar()
      avisarCambio()
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }
  // Archivar: la saca de la vista principal y la manda a la papelera.
  // Reversible — no es un delete. Disponible para admin en cualquier
  // estado (a diferencia del "Eliminar" de mas abajo, que solo existe
  // para borradores propios y SI borra en el momento).
  async function archivar(orden) {
    setOcupado(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('ordenes_propias')
        .update({ archivada_en: new Date().toISOString(), archivada_por: user?.id ?? null })
        .eq('id', orden.id)
      if (error) throw new Error(error.message)
      setAviso(`Orden #${orden.id} archivada. Podés recuperarla desde "🗑 Papelera".`)
      if (abierta?.id === orden.id) setAbierta(null)
      await cargar()
      avisarCambio()
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }
  async function restaurar(orden) {
    setOcupado(true)
    try {
      const { error } = await supabase
        .from('ordenes_propias')
        .update({ archivada_en: null, archivada_por: null })
        .eq('id', orden.id)
      if (error) throw new Error(error.message)
      setAviso(`Orden #${orden.id} restaurada.`)
      await cargar()
      avisarCambio()
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }
  // Borrado definitivo — solo desde adentro de la papelera. A
  // diferencia de archivar, esto no tiene vuelta atras.
  function pedirEliminarDefinitivo(orden) {
    setModal({ tipo: 'eliminar_papelera', orden })
  }
  async function confirmarEliminarDefinitivo() {
    if (!modal) return
    const { orden } = modal
    setOcupado(true)
    try {
      const { error } = await supabase.from('ordenes_propias').delete().eq('id', orden.id)
      if (error) throw new Error(error.message)
      setModal(null)
      await cargar()
      avisarCambio()
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  if (!cargando && ordenes.length === 0) return null
  return (
    <div className="mx-4 mt-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-[var(--red)] rounded-lg px-4 py-2.5 text-[13px] mb-3">
          {error}
        </div>
      )}
      {aviso && (
        <div className="bg-[var(--grn-bg,#dcfce7)] border border-green-200 text-[var(--grn,#3d9970)] rounded-lg px-4 py-2.5 text-[13px] mb-3 flex items-center justify-between">
          <span>{aviso}</span>
          <button onClick={() => setAviso(null)} className="opacity-60 hover:opacity-100 px-1">×</button>
        </div>
      )}
      {!soloOrdenId && (<>
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <div>
          <div className="text-[15px] font-bold">
            Órdenes generadas desde el sistema
            {pendientes.length > 0 && (
              <span className="ml-2 inline-flex px-2 py-0.5 rounded-full bg-blue-50 text-[#1d4ed8] text-[11px] font-semibold align-middle">
                {pendientes.length} {pendientes.length === 1 ? 'espera aprobación' : 'esperan aprobación'}
              </span>
            )}
          </div>
          <div className="text-[12px] text-[var(--sub)]">
            Al aprobarse se vinculan solas a YiQi. El envío al proveedor por WhatsApp (💬) es
            semi-automático: descarga el PDF y abre WhatsApp con el texto listo — el único paso manual
            es arrastrar el PDF a la conversación, WhatsApp no permite adjuntarlo solo.
          </div>
        </div>
        <div className="flex gap-2">
          {[
            { key: 'activas', label: `Órdenes (${activas.length})` },
            // La papelera es cosa de Aris: quien la mando ahi es quien
            // decide si se restaura o se borra para siempre.
            ...(permisos.esAdmin ? [{ key: 'papelera', label: `🗑 Papelera (${archivadas.length})` }] : []),
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFiltro(f.key)}
              className={`chip ${filtro === f.key ? 'chip-on' : ''}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {/* 2/10/2026 (feedback Ivana 17, prototipo v7): tarjetas con semáforo en
          vez de tabla. Mismas acciones y reglas que antes; solo cambia la forma. */}
      {filtro === 'activas' && !cargando && visibles.length > 0 && (
        <div className="flex items-center gap-5 flex-wrap px-4 py-2.5 mb-3 bg-white border border-[var(--border)] rounded-xl text-[12px]">
          <span className="font-bold text-[11px] uppercase tracking-wide text-[var(--sub)]">Qué hay que hacer:</span>
          <span className="flex items-center gap-2"><span className="sem sb" /> <b className="text-[var(--blu)]">Aprobar</b> <span className="text-[var(--sub)]">— espera a Aris</span></span>
          <span className="flex items-center gap-2"><span className="sem sy" /> <b className="text-[#92400e]">Completar o enviar</b> <span className="text-[var(--sub)]">— borrador o lista para mandar al proveedor</span></span>
          <span className="flex items-center gap-2"><span className="sem sr" /> <b className="text-[var(--red)]">Problema</b> <span className="text-[var(--sub)]">— rechazada o no se pudo cargar en YiQi</span></span>
          <span className="flex items-center gap-2"><span className="sem sg" /> <b className="text-[var(--grn)]">Listo</b> <span className="text-[var(--sub)]">— enviada al proveedor</span></span>
        </div>
      )}
      <div className="mb-6">
        {cargando ? (
          <div className="card p-6 text-center text-[var(--sub)] text-sm">Cargando…</div>
        ) : visibles.length === 0 ? (
          <div className="card p-6 text-center text-[var(--sub)] text-sm">
            {filtro === 'papelera' ? 'La papelera está vacía.' : 'No hay órdenes.'}
          </div>
        ) : (
          <div className="space-y-3">
            {visibles.map((o) => {
              const vista = vistaEstadoOrden(o)
              const causa = causasPorOrden[String(o.id)]
              return (
                <div key={o.id} className={`card card-${vista.tono}`}>
                  <div className="px-5 py-3.5 flex items-center gap-4">
                    <span className={`sem ${SEM_DE_TONO[vista.tono]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-bold text-gray-900 truncate">{o.proveedor_nombre}</div>
                      <div className="text-[12px] text-[var(--sub)] mt-0.5">
                        Orden #{o.id} · {o.creador_nombre ?? '—'} · {formatoDia(o.creada_en)} · {o.cant_items ?? 0} {(o.cant_items ?? 0) === 1 ? 'ítem' : 'ítems'}
                        {o.items_sin_costo > 0 && <span className="text-[#92400e]"> · {o.items_sin_costo} sin costo</span>}
                      </div>
                      {o.estado === 'aprobada' && !o.yiqi_id_creado && o.yiqi_error && (
                        <div className="text-[11px] text-[var(--red)] mt-1 truncate" title={o.yiqi_error}>⚠ {o.yiqi_error}</div>
                      )}
                      {causa && (
                        <div className="text-[11px] text-gray-500 mt-1 truncate" title={causa.nota ?? ''}>📝 {causa.causa_rotulo}</div>
                      )}
                    </div>
                    <Pastilla tono={vista.tono}>{vista.label}</Pastilla>
                    <div className={`text-[18px] font-bold tabular-nums min-w-[130px] text-right ${COLOR_TOTAL[vista.tono]}`}>
                      {o.total_estimado != null ? formatoMoneda(o.total_estimado) : '—'}
                    </div>
                  </div>
                  <div className="px-5 py-2.5 bg-[#fafafa] border-t border-[var(--border)] flex items-center justify-end">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            // Pestaña nueva de verdad (28/9/2026), no el panel
                            // en esta misma pantalla. `?page=ocs` hace que
                            // App.jsx arranque directo en esta sección y
                            // `?orden=<id>` hace que OrdenesPropias se abra
                            // sola en el detalle de esta orden (ver el efecto
                            // de ordenIdDesdeURL más arriba).
                            const url = `${window.location.origin}${window.location.pathname}?page=ocs&orden=${o.id}`
                            window.open(url, '_blank', 'noopener')
                          }}
                          title={puedeEditarItems(o) ? 'Abrir la orden para editarla (pestaña nueva)' : 'Ver la orden (pestaña nueva)'}
                          className={BTN_SEC}
                        >
                          {/* Feedback Ivana 2/10 (punto 13): "Editar" solo cuando se puede editar de verdad. */}
                          {puedeEditarItems(o) ? '✏️ Editar ↗' : 'Ver ↗'}
                        </button>
                        <button onClick={() => imprimir(o)} title="Ver e imprimir el PDF de la orden" className={BTN_SEC}>
                          📄 PDF
                        </button>
                        <button
                          onClick={() =>
                            setModalCausa({ referenciaId: o.id, referenciaTexto: `Orden #${o.id} — ${o.proveedor_nombre}` })
                          }
                          title={causasPorOrden[String(o.id)] ? 'Ver o editar la causa declarada' : 'Declarar una causa (demora, faltante, etc.)'}
                          className={causasPorOrden[String(o.id)] ? `${BTN_SEC} border-amber-300 text-[#92400e] bg-amber-50` : BTN_SEC}
                        >
                          {causasPorOrden[String(o.id)] ? '📝 Causa' : '📝 Causa +'}
                        </button>

                        {(filtro === 'activas' || filtro === 'papelera') && <span className="w-px h-5 bg-gray-200 mx-1" aria-hidden="true" />}

                        {filtro === 'activas' && o.estado === 'aprobada' && (
                          <button
                            disabled={enviandoWaId === o.id}
                            onClick={() => enviarWhatsApp(o)}
                            title={o.whatsapp_enviada_en ? `Ya se envió el ${formatoFecha(o.whatsapp_enviada_en)} — volver a enviar` : 'Descargar PDF y abrir WhatsApp'}
                            className={o.whatsapp_enviada_en ? BTN_WA_OUT : BTN_WA}
                          >
                            {enviandoWaId === o.id ? 'Enviando…' : o.whatsapp_enviada_en ? '💬 Reenviar' : '💬 WhatsApp'}
                          </button>
                        )}
                        {filtro === 'activas' && permisos.esAdmin && o.estado === 'pendiente' && (
                          <>
                            <button disabled={ocupado} onClick={() => pedirDecision(o, 'aprobada')} className={BTN_OK}>
                              ✓ Aprobar
                            </button>
                            <button disabled={ocupado} onClick={() => pedirDecision(o, 'rechazada')} className={BTN_PELIGRO}>
                              Rechazar
                            </button>
                          </>
                        )}
                        {filtro === 'activas' && !permisos.esAdmin && o.estado === 'borrador' && (
                          <>
                            <button disabled={ocupado} onClick={() => enviarAAprobacion(o)} className={BTN_PRIM}>
                              Enviar a aprobación
                            </button>
                            <button disabled={ocupado} onClick={() => pedirBorrar(o)} className={BTN_PELIGRO}>
                              Eliminar
                            </button>
                          </>
                        )}
                        {/* 7/9/2026 (U-4): título aclara qué hace el botón, no solo
                            por qué falló la primera vez. */}
                        {filtro === 'activas' && permisos.esAdmin && o.estado === 'aprobada' && !o.yiqi_id_creado && (
                          <button
                            disabled={ocupado}
                            onClick={() => reintentarEnvioYiqi(o)}
                            title={`${o.yiqi_error || 'Todavía no se envió a YiQi.'} — Reintentar vuelve a mandar esta misma orden a YiQi con los mismos datos.`}
                            className={BTN_AVISO}
                          >
                            ↻ Reintentar envío
                          </button>
                        )}
                        {filtro === 'activas' && permisos.esAdmin && (
                          <button
                            disabled={ocupado}
                            onClick={() => archivar(o)}
                            title="Archivar (mover a la papelera)"
                            aria-label="Archivar"
                            className={BTN_ICONO}
                          >
                            🗑
                          </button>
                        )}
                        {filtro === 'papelera' && (
                          <>
                            <button disabled={ocupado} onClick={() => restaurar(o)} className={BTN_PRIM}>
                              Restaurar
                            </button>
                            <button disabled={ocupado} onClick={() => pedirEliminarDefinitivo(o)} className={BTN_PELIGRO}>
                              Eliminar definitivamente
                            </button>
                          </>
                        )}
                      </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      </>)}
      {soloOrdenId && !cargando && !abierta && !ordenes.some((o) => o.id === soloOrdenId) && (
        <div className="bloque bloque-gris text-[13px] mb-6">No se encontró la orden #{soloOrdenId} (o no tenés acceso).</div>
      )}
      {/* Detalle */}
      {abierta && (
        <div className={`card card-${(ESTADO_OC_PROPIA[abierta.estado] ?? {}).tono ?? 'gris'} p-5 mb-6`}>
          {/* Encabezado (feedback Ivana 19): número, estado, proveedor y total grande */}
          <div className="flex items-start justify-between mb-4 gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[18px] font-bold text-[var(--ind)]">Orden #{abierta.id}</span>
                <Pastilla tono={(ESTADO_OC_PROPIA[abierta.estado] ?? {}).tono}>
                  {(ESTADO_OC_PROPIA[abierta.estado] ?? {}).label ?? abierta.estado}
                </Pastilla>
                {abierta.archivada_en && <Pastilla tono="gris">En papelera</Pastilla>}
              </div>
              <div className="text-[15px] font-semibold text-gray-900 mt-1">{abierta.proveedor_nombre}</div>
              <div className="text-[12px] text-[var(--sub)] mt-0.5">
                Creada {formatoFecha(abierta.creada_en)}
                {abierta.items_sin_costo > 0 && ` · ${abierta.items_sin_costo} artículos sin costo cargado`}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-[24px] font-bold text-gray-900 tabular-nums leading-none">
                {abierta.total_estimado != null ? formatoMoneda(abierta.total_estimado) : '—'}
              </div>
              <div className="text-[11px] text-[var(--sub)] mt-1">total estimado</div>
            </div>
          </div>

          {/* Barra de pasos */}
          {(() => {
            const e = abierta.estado
            const aprobada = e === 'aprobada'
            const enYiqi = aprobada && !!abierta.yiqi_id_creado
            const enviadaProv = !!abierta.whatsapp_enviada_en
            const ing = ingresoYiqi
            const pasos = [
              { rotulo: 'Borrador', fecha: formatoDia(abierta.creada_en), estado: e === 'borrador' ? 'actual' : 'hecho' },
              {
                rotulo: e === 'rechazada' ? 'Rechazada' : 'Aprobación',
                fecha: formatoDia(abierta.decidida_en),
                estado: e === 'pendiente' ? 'espera' : e === 'rechazada' ? 'alerta' : aprobada ? 'hecho' : 'pend',
              },
              {
                rotulo: 'Cargada en YiQi',
                fecha: enYiqi ? formatoDia(abierta.yiqi_enviada_en) : null,
                estado: enYiqi ? 'hecho' : aprobada ? 'alerta' : 'pend',
              },
              {
                rotulo: 'Enviada al proveedor',
                fecha: enviadaProv ? formatoDia(abierta.whatsapp_enviada_en) : null,
                estado: enviadaProv ? 'hecho' : enYiqi ? 'actual' : 'pend',
              },
              {
                rotulo: ing?.encontrada && ing.entregada > 0 && ing.pendiente > 0
                  ? `Recibida ${ing.entregada} de ${ing.cantidad} u`
                  : 'Mercadería recibida',
                estado: ing?.encontrada && ing.cantidad > 0 && ing.pendiente === 0 && ing.entregada > 0
                  ? 'hecho'
                  : ing?.encontrada && ing.entregada > 0 ? 'actual' : 'pend',
              },
            ]
            const sigue = {
              borrador: 'Sigue: enviarla a aprobación.',
              pendiente: 'Sigue: que Aris la apruebe o la rechace.',
              rechazada: 'La orden fue rechazada.',
            }[e] ?? (
              !enYiqi ? 'Sigue: cargarla en YiQi (reintentar envío).'
              : !enviadaProv ? 'Sigue: mandarla al proveedor por WhatsApp.'
              : ing?.encontrada && ing.pendiente === 0 && ing.entregada > 0 ? 'Recibida completa.'
              : 'Sigue: esperar la mercadería.'
            )
            return <div className="mb-4"><BarraPasos pasos={pasos} sigue={sigue} /></div>
          })()}

          {/* Bloque de acción según el estado (código de color único) */}
          {abierta.estado === 'borrador' && (
            <BloqueAccion
              tono="amarillo"
              className="mb-3"
              titulo="Borrador — todavía no se mandó a aprobación"
              acciones={!permisos.esAdmin && !abierta.archivada_en && (
                <>
                  <button disabled={ocupado} onClick={() => enviarAAprobacion(abierta)} className="btn btn-sm btn-pri">
                    Enviar a aprobación
                  </button>
                  <button disabled={ocupado} onClick={() => pedirBorrar(abierta)} className="btn btn-sm btn-peligro">
                    Eliminar
                  </button>
                </>
              )}
            >
              Revisá cantidades y artículos antes de enviarla.
            </BloqueAccion>
          )}
          {abierta.estado === 'pendiente' && (
            <BloqueAccion
              tono="azul"
              className="mb-3"
              titulo="Esperando aprobación de Aris"
              acciones={permisos.esAdmin && !abierta.archivada_en && (
                <>
                  <button disabled={ocupado} onClick={() => pedirDecision(abierta, 'rechazada')} className="btn btn-sm btn-peligro">
                    Rechazar
                  </button>
                  <button disabled={ocupado} onClick={() => pedirDecision(abierta, 'aprobada')} className="btn btn-sm btn-ok">
                    ✓ Aprobar orden
                  </button>
                </>
              )}
            >
              {abierta.enviada_en ? `Enviada a aprobación el ${formatoDia(abierta.enviada_en)}.` : 'Enviada a aprobación.'}
            </BloqueAccion>
          )}
          {abierta.estado === 'rechazada' && (
            <BloqueAccion tono="rojo" className="mb-3" titulo="Orden rechazada">
              {abierta.comentario_decision || 'Sin comentario.'}
            </BloqueAccion>
          )}
          {abierta.estado === 'aprobada' && !abierta.yiqi_id_creado && (
            <BloqueAccion
              tono="rojo"
              className="mb-3"
              titulo="⚠ No se pudo cargar en YiQi"
              acciones={permisos.esAdmin && (
                <button
                  disabled={ocupado}
                  onClick={() => reintentarEnvioYiqi(abierta)}
                  title="Vuelve a mandar esta misma orden a YiQi con los mismos datos."
                  className="btn btn-sm btn-peligro"
                >
                  {ocupado ? 'Reintentando…' : '↻ Reintentar envío'}
                </button>
              )}
            >
              {abierta.yiqi_error || 'Todavía no se pudo enviar esta orden a YiQi.'}
            </BloqueAccion>
          )}
          {abierta.estado === 'aprobada' && abierta.yiqi_id_creado && (
            <BloqueAccion
              tono={abierta.whatsapp_enviada_en ? 'verde' : 'amarillo'}
              className="mb-3"
              titulo={abierta.whatsapp_enviada_en
                ? `Enviada al proveedor el ${formatoFecha(abierta.whatsapp_enviada_en)}`
                : 'Lista para enviar al proveedor'}
              acciones={
                <>
                  <button onClick={() => imprimir(abierta)} className="btn btn-sm">📄 PDF</button>
                  <button
                    disabled={enviandoWaId === abierta.id}
                    onClick={() => enviarWhatsApp(abierta)}
                    className={`btn btn-sm ${abierta.whatsapp_enviada_en ? '' : 'btn-ok'}`}
                  >
                    {enviandoWaId === abierta.id
                      ? 'Enviando…'
                      : abierta.whatsapp_enviada_en ? '💬 Reenviar' : '💬 Enviar por WhatsApp'}
                  </button>
                </>
              }
            >
              Cargada en YiQi (OC #{abierta.yiqi_id_creado}) el {formatoDia(abierta.yiqi_enviada_en)}.
              {ingresoYiqi && !ingresoYiqi.encontrada && ' Todavía no figura en el reporte de OC de YiQi.'}
            </BloqueAccion>
          )}
          {abierta.notas && (
            <div className="border border-[var(--border)] rounded-lg px-3.5 py-2.5 text-[13px] mb-3">
              <span className="text-[10px] uppercase text-gray-400 block mb-0.5">Notas</span>
              {abierta.notas}
            </div>
          )}
          {abierta.comentario_decision && abierta.estado !== 'rechazada' && (
            <div className="border border-[var(--border)] rounded-lg px-3.5 py-2.5 text-[13px] mb-3">
              <span className="text-[10px] uppercase text-gray-400 block mb-0.5">Comentario de aprobación</span>
              {abierta.comentario_decision}
            </div>
          )}
          {/* Editar cantidades / quitar líneas (28/9/2026) -- ver el bloque
              de comentario junto a los estados de arriba (editandoItems).
              Solo aparece en 'borrador' (RLS real de ordenes_propias_items
              no admite 'pendiente' ni bypass de admin, ver comentario):
              en cualquier otro estado la tabla queda 100% de solo lectura,
              como siempre. Solo lo ve quien creó el borrador (30/9/2026). */}
          {puedeEditarItems(abierta) && !editandoItems && (
            <div className="flex justify-end mb-2">
              <button
                type="button"
                onClick={iniciarEdicionItems}
                className="btn btn-sm btn-pri"
              >
                ✏ Editar cantidades / quitar ítems
              </button>
            </div>
          )}
          {errorEdicionItems && (
            <div className="border border-[#fecaca] bg-[#fef2f2] text-[var(--red)] rounded-lg px-3 py-2 text-[13px] mb-2">
              {errorEdicionItems}
            </div>
          )}
          <div className="tw mb-3">
            <table className="tabla">
              <thead>
                <tr>
                  {[
                    'SKU', 'Producto', 'Cantidad', 'Costo unit.', 'Subtotal', 'Stock al armar', 'Prom./mes',
                    ...(editandoItems ? [''] : []),
                  ].map((h, idx) => (
                    <th key={`${h}-${idx}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(editandoItems ? itemsEdit : items).map((i) => (
                  <tr key={i.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-3.5 py-2 font-mono text-xs">{i.mate_codigo}</td>
                    <td className="px-3.5 py-2 text-[13px] font-medium">{i.mate_nombre ?? '—'}</td>
                    <td className="px-3.5 py-2 font-bold">
                      {editandoItems ? (
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={i._cantidad}
                          onChange={(e) => actualizarCantidadEdit(i.id, e.target.value)}
                          disabled={ocupado}
                          className="w-20 border border-[var(--border)] rounded-lg px-2 py-1 text-[13px] disabled:opacity-60"
                        />
                      ) : (
                        formatoNumero(i.cantidad)
                      )}
                    </td>
                    <td className="px-3.5 py-2 text-sm tabular-nums">
                      {i.costo_unitario ? formatoMoneda2(i.costo_unitario) : '—'}
                    </td>
                    <td className="px-3.5 py-2 text-sm tabular-nums font-semibold">
                      {i.costo_unitario
                        ? formatoMoneda2(subtotalLinea(editandoItems ? { ...i, cantidad: i._cantidad } : i))
                        : '—'}
                    </td>
                    <td className="px-3.5 py-2 text-gray-400 text-sm">{formatoNumero(i.stock_al_momento)}</td>
                    <td className="px-3.5 py-2 text-gray-400 text-sm">{formatoNumero(i.promedio_mensual)}</td>
                    {editandoItems && (
                      <td className="px-3.5 py-2">
                        <button
                          type="button"
                          disabled={ocupado || itemsEdit.length <= 1}
                          onClick={() => quitarItemEdit(i.id)}
                          title="Quitar línea"
                          className="text-gray-400 hover:text-[var(--red)] disabled:opacity-30 text-lg leading-none"
                        >
                          ×
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {editandoItems && (
            <div className="flex items-center justify-end gap-2 mb-3">
              <button
                type="button"
                disabled={ocupado}
                onClick={cancelarEdicionItems}
                className="px-3.5 py-2 rounded-lg text-[13px] font-semibold border border-[var(--border)] bg-white hover:bg-gray-50 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={ocupado}
                onClick={guardarEdicionItems}
                className="px-3.5 py-2 rounded-lg text-[13px] font-semibold bg-[var(--ind,#4338ca)] text-white hover:opacity-90 disabled:opacity-40"
              >
                {ocupado ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          )}
          {/* Fila de acciones al pie (feedback Ivana 19) */}
          <div className="flex items-center justify-between gap-2 flex-wrap pt-3 mt-1 border-t border-gray-100">
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => imprimir(abierta)} className="btn btn-sm">📄 PDF de la orden</button>
              {abierta.estado === 'aprobada' && abierta.yiqi_id_creado && (
                <button onClick={() => abrirAgregarMercaderia(abierta)} className="btn btn-sm">+ Agregar mercadería</button>
              )}
              <button
                onClick={() =>
                  setModalCausa({ referenciaId: abierta.id, referenciaTexto: `Orden #${abierta.id} — ${abierta.proveedor_nombre}` })
                }
                className="btn btn-sm"
              >
                📝 {causasPorOrden[String(abierta.id)] ? 'Ver causa' : 'Declarar causa'}
              </button>
            </div>
            {soloOrdenId ? null : (
              <button
                onClick={() => { setAbierta(null); setEditandoItems(false); setItemsEdit([]) }}
                className="btn btn-sm"
              >
                Cerrar
              </button>
            )}
          </div>
        </div>
      )}
      {/* Modal de aprobar / rechazar / eliminar — reemplaza a
          window.prompt() y window.confirm(). Se estila con los mismos
          tokens que el resto de la app. */}
      {modal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
          onClick={cerrarModal}
        >
          <div
            className={`bg-white rounded-xl border border-[var(--border)] shadow-xl w-full p-5 ${
              modal.tipo === 'agregarMercaderia' ? 'max-w-2xl' : 'max-w-md'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {modal.tipo === 'borrar' ? (
              <>
                <div className="text-[15px] font-bold mb-1.5">Eliminar borrador</div>
                <div className="text-[13px] text-[var(--sub)] mb-4">
                  ¿Eliminar el borrador #{modal.orden.id}
                  {modal.orden.proveedor_nombre ? ` (${modal.orden.proveedor_nombre})` : ''}?
                  Esta acción no se puede deshacer.
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    disabled={ocupado}
                    onClick={cerrarModal}
                    className="px-3.5 py-2 rounded-lg text-[13px] font-semibold border border-[var(--border)] bg-white hover:bg-gray-50 disabled:opacity-40"
                  >
                    Cancelar
                  </button>
                  <button
                    disabled={ocupado}
                    onClick={confirmarBorrar}
                    className="px-3.5 py-2 rounded-lg text-[13px] font-semibold bg-[var(--red)] text-white hover:opacity-90 disabled:opacity-40"
                  >
                    {ocupado ? 'Eliminando…' : 'Eliminar'}
                  </button>
                </div>
              </>
            ) : modal.tipo === 'sinCosto' ? (
              <>
                <div className="text-[15px] font-bold mb-1.5 text-[#92400e]">
                  No se puede aprobar la orden #{modal.orden.id}
                </div>
                <div className="text-[13px] text-[var(--sub)] mb-4">
                  Tiene {modal.orden.items_sin_costo} artículo{modal.orden.items_sin_costo === 1 ? '' : 's'} sin costo
                  cargado. YiQi rechaza cualquier OC con un ítem sin precio ("el precio unitario y final no se
                  corresponden") -- si se aprueba igual, va a quedar marcada como "Error de vinculación a YiQi" sin
                  forma de resolverla desde acá.
                  <br /><br />
                  Rechazá esta orden y volvé a cargarla desde Nueva OC con el costo completo de todos los artículos,
                  o pedile el precio faltante a quien corresponda antes de reintentar.
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={cerrarModal}
                    className="px-3.5 py-2 rounded-lg text-[13px] font-semibold border border-[var(--border)] bg-white hover:bg-gray-50"
                  >
                    Entendido
                  </button>
                </div>
              </>
            ) : modal.tipo === 'agregarMercaderia' ? (
              <>
                <div className="text-[15px] font-bold mb-1.5">
                  Agregar mercadería — orden #{modal.orden.id}
                </div>
                <div className="text-[13px] text-[var(--sub)] mb-4">
                  Suma ítems a una orden que ya está aprobada y vinculada a YiQi (OC #{modal.orden.yiqi_id_creado}).
                  Se manda a YiQi al toque — si YiQi lo rechaza, no queda nada guardado acá tampoco.
                </div>
                <div className="space-y-2 mb-3 max-h-[45vh] overflow-y-auto">
                  {lineasNuevas.map((linea, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_1fr_90px_120px_28px] gap-2 items-center">
                      <input
                        placeholder="SKU (mate_codigo)"
                        value={linea.mate_codigo}
                        onChange={(e) => actualizarLineaNueva(idx, 'mate_codigo', e.target.value)}
                        className="border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-[13px]"
                      />
                      <input
                        placeholder="Nombre (opcional)"
                        value={linea.mate_nombre}
                        onChange={(e) => actualizarLineaNueva(idx, 'mate_nombre', e.target.value)}
                        className="border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-[13px]"
                      />
                      <input
                        placeholder="Cant."
                        type="number"
                        min="0"
                        step="any"
                        value={linea.cantidad}
                        onChange={(e) => actualizarLineaNueva(idx, 'cantidad', e.target.value)}
                        className="border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-[13px]"
                      />
                      <input
                        placeholder="Costo unit. neto"
                        type="number"
                        min="0"
                        step="any"
                        value={linea.costo_unitario}
                        onChange={(e) => actualizarLineaNueva(idx, 'costo_unitario', e.target.value)}
                        className="border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-[13px]"
                      />
                      <button
                        type="button"
                        disabled={lineasNuevas.length <= 1}
                        onClick={() => quitarLineaNueva(idx)}
                        className="text-gray-400 hover:text-[var(--red)] disabled:opacity-30 text-lg leading-none"
                        title="Quitar línea"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={agregarLineaNueva}
                  className="text-[13px] font-semibold text-[var(--ind,#4338ca)] hover:underline mb-4"
                >
                  + otra línea
                </button>
                {errorMercaderia && (
                  <div className="border border-[#fecaca] bg-[#fef2f2] text-[var(--red)] rounded-lg px-3 py-2 text-[13px] mb-3">
                    {errorMercaderia}
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    disabled={ocupado}
                    onClick={cerrarModal}
                    className="px-3.5 py-2 rounded-lg text-[13px] font-semibold border border-[var(--border)] bg-white hover:bg-gray-50 disabled:opacity-40"
                  >
                    Cancelar
                  </button>
                  <button
                    disabled={ocupado}
                    onClick={confirmarAgregarMercaderia}
                    className="px-3.5 py-2 rounded-lg text-[13px] font-semibold bg-[var(--ind,#4338ca)] text-white hover:opacity-90 disabled:opacity-40"
                  >
                    {ocupado ? 'Agregando…' : 'Agregar a la orden'}
                  </button>
                </div>
              </>
            ) : modal.tipo === 'eliminar_papelera' ? (
              <>
                <div className="text-[15px] font-bold mb-1.5">Eliminar definitivamente</div>
                <div className="text-[13px] text-[var(--sub)] mb-4">
                  ¿Eliminar para siempre la orden #{modal.orden.id}
                  {modal.orden.proveedor_nombre ? ` (${modal.orden.proveedor_nombre})` : ''}?
                  A diferencia de archivar, esto no tiene vuelta atrás.
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    disabled={ocupado}
                    onClick={cerrarModal}
                    className="px-3.5 py-2 rounded-lg text-[13px] font-semibold border border-[var(--border)] bg-white hover:bg-gray-50 disabled:opacity-40"
                  >
                    Cancelar
                  </button>
                  <button
                    disabled={ocupado}
                    onClick={confirmarEliminarDefinitivo}
                    className="px-3.5 py-2 rounded-lg text-[13px] font-semibold bg-[var(--red)] text-white hover:opacity-90 disabled:opacity-40"
                  >
                    {ocupado ? 'Eliminando…' : 'Eliminar definitivamente'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-[15px] font-bold mb-1.5">
                  {modal.tipo === 'aprobar'
                    ? `Aprobar orden #${modal.orden.id}`
                    : `Rechazar orden #${modal.orden.id}`}
                </div>
                <div className="text-[13px] text-[var(--sub)] mb-3">
                  {modal.orden.proveedor_nombre}
                  {modal.orden.total_estimado != null && ` · ${formatoMoneda(modal.orden.total_estimado)}`}
                </div>
                <label className="block text-[11px] uppercase text-gray-400 font-semibold mb-1">
                  {modal.tipo === 'aprobar' ? 'Comentario de aprobación (opcional)' : 'Motivo del rechazo (opcional)'}
                </label>
                <textarea
                  autoFocus
                  value={comentarioModal}
                  onChange={(e) => setComentarioModal(e.target.value)}
                  rows={3}
                  disabled={ocupado}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] mb-4 resize-none focus:outline-none focus:ring-2 focus:ring-[var(--ind,#4338ca)]/30 focus:border-[var(--ind,#4338ca)] disabled:opacity-60"
                  placeholder="Escribí un comentario si querés dejarlo registrado…"
                />
                <div className="flex justify-end gap-2">
                  <button
                    disabled={ocupado}
                    onClick={cerrarModal}
                    className="px-3.5 py-2 rounded-lg text-[13px] font-semibold border border-[var(--border)] bg-white hover:bg-gray-50 disabled:opacity-40"
                  >
                    Cancelar
                  </button>
                  <button
                    disabled={ocupado}
                    onClick={confirmarDecision}
                    className={`px-3.5 py-2 rounded-lg text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-40 ${
                      modal.tipo === 'aprobar' ? 'bg-[var(--grn,#3d9970)]' : 'bg-[var(--red)]'
                    }`}
                  >
                    {ocupado
                      ? 'Guardando…'
                      : modal.tipo === 'aprobar'
                        ? 'Aprobar orden'
                        : 'Rechazar orden'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {modalCausa && (
        <DeclararCausaModal
          ambito="compra"
          referenciaId={modalCausa.referenciaId}
          referenciaTexto={modalCausa.referenciaTexto}
          onCerrar={() => setModalCausa(null)}
          onGuardado={() => {
            ultimasCausasPorReferencia('compra', [modalCausa.referenciaId]).then((res) => {
              setCausasPorOrden((prev) => ({ ...prev, ...res }))
            })
          }}
        />
      )}
    </div>
  )
}
