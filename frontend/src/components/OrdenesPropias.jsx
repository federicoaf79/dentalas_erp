import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePermisos } from '../hooks/usePermisos'
import Aviso from './Aviso'
import DeclararCausaModal from './DeclararCausaModal'
import { ultimasCausasPorReferencia } from '../lib/causas'
import { generarPdfOrden, generarPdfOrdenDescargable } from '../lib/pdfOrden'
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
const ESTADOS = {
  borrador:  { label: 'Borrador',             clase: 'bg-gray-100 text-gray-600' },
  pendiente: { label: 'Esperando aprobación', clase: 'bg-blue-50 text-[#1d4ed8]' },
  aprobada:  { label: 'Aprobada',             clase: 'bg-[var(--grn-bg)] text-[var(--grn)]' },
  rechazada: { label: 'Rechazada',            clase: 'bg-[var(--red-bg)] text-[var(--red)]' },
}
function formatoMoneda(n) {
  const num = Number(n)
  if (!Number.isFinite(num)) return '—'
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
  }).format(num)
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
export default function OrdenesPropias({ onCambio }) {
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
    const { data, error } = await supabase
      .from('ordenes_propias_items')
      .select('*')
      .eq('orden_id', orden.id)
      .order('id')
    if (error) setError(error.message)
    else setItems(data ?? [])
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

      const totalReal = lista.reduce((acc, i) => {
        const c = Number(i.costo_unitario)
        return acc + (Number.isFinite(c) ? c * Number(i.cantidad || 0) : 0)
      }, 0)
      const datos = {
        empresa: empresa?.nombre || 'Dentalab',
        proveedor: orden.proveedor_nombre,
        nro_orden: String(orden.id),
        fecha: formatoFecha(orden.creada_en),
        total: formatoMoneda(totalReal),
        cant_items: String(lista.length),
        items: lista
          .map((i) => `• ${i.mate_codigo} — ${i.mate_nombre ?? ''} — ${formatoNumero(i.cantidad)} un.`)
          .join('\n'),
        notas: orden.notas || '',
        contacto: '',
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
              className={`px-3 py-1.5 rounded-full text-sm border ${
                filtro === f.key
                  ? 'bg-[var(--ind,#4338ca)] text-white border-[var(--ind,#4338ca)]'
                  : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden mb-6">
        {cargando ? (
          <div className="p-6 text-center text-[var(--sub)] text-sm">Cargando…</div>
        ) : visibles.length === 0 ? (
          <div className="p-6 text-center text-[var(--sub)] text-sm">
            {filtro === 'papelera' ? 'La papelera está vacía.' : 'No hay órdenes.'}
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-[var(--border)]">
                {['#', 'Proveedor', 'Creada por', 'Estado', 'Total', 'Creada', 'Ítems', ''].map((h) => (
                  <th key={h} className="text-left px-3.5 py-2.5 text-[10px] font-bold text-[var(--sub)] uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibles.map((o) => {
                const est = ESTADOS[o.estado] ?? ESTADOS.borrador
                return (
                  <tr key={o.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-3.5 py-2.5 font-mono text-xs">#{o.id}</td>
                    <td className="px-3.5 py-2.5 font-semibold">{o.proveedor_nombre}</td>
                    <td className="px-3.5 py-2.5 text-[13px] text-[var(--sub)]">
                      {o.creador_nombre ?? '—'}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${est.clase}`}>
                        {est.label}
                      </span>
                      {o.estado === 'aprobada' && !o.yiqi_id_creado && (
                        <span
                          title={o.yiqi_error || 'Todavía no se envió a YiQi.'}
                          className="block mt-1 text-[10px] font-semibold text-[#b45309]"
                        >
                          ⚠ Error de vinculación a YiQi
                        </span>
                      )}
                      {causasPorOrden[String(o.id)] && (
                        <span
                          className="block mt-1 text-[10px] text-gray-400"
                          title={causasPorOrden[String(o.id)].nota ?? ''}
                        >
                          {causasPorOrden[String(o.id)].causa_rotulo}
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 font-semibold tabular-nums text-[13px]">
                      {o.total_estimado != null ? formatoMoneda(o.total_estimado) : '—'}
                      {o.items_sin_costo > 0 && (
                        <span className="block text-[10px] text-[#92400e] font-normal">
                          {o.items_sin_costo} sin costo
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-[var(--sub)] text-xs">{formatoFecha(o.creada_en)}</td>
                    <td className="px-3.5 py-2.5 text-xs">{o.cant_items ?? 0}</td>
                    <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => abrir(o)} className="text-sm text-[var(--ind,#4338ca)] hover:underline mr-3">
                        Ver detalle
                      </button>
                      <button onClick={() => imprimir(o)} className="text-sm text-gray-500 hover:text-[var(--ind,#4338ca)] hover:underline mr-3">
                        PDF
                      </button>
                      <button
                        onClick={() =>
                          setModalCausa({ referenciaId: o.id, referenciaTexto: `Orden #${o.id} — ${o.proveedor_nombre}` })
                        }
                        className="text-sm text-gray-500 hover:text-[var(--ind,#4338ca)] hover:underline mr-3"
                      >
                        {causasPorOrden[String(o.id)] ? 'Causa' : 'Declarar causa'}
                      </button>
                      {filtro === 'activas' && o.estado === 'aprobada' && (
                        <button
                          disabled={enviandoWaId === o.id}
                          onClick={() => enviarWhatsApp(o)}
                          title={o.whatsapp_enviada_en ? `Ya se envió el ${formatoFecha(o.whatsapp_enviada_en)} — volver a enviar` : 'Descargar PDF y abrir WhatsApp'}
                          className="text-sm text-green-600 hover:text-green-700 hover:underline mr-3 disabled:opacity-40"
                        >
                          {enviandoWaId === o.id ? 'Enviando…' : o.whatsapp_enviada_en ? '💬 Reenviar' : '💬 WhatsApp'}
                        </button>
                      )}
                      {filtro === 'activas' && permisos.esAdmin && o.estado === 'pendiente' && (
                        <>
                          <button
                            disabled={ocupado}
                            onClick={() => pedirDecision(o, 'aprobada')}
                            className="text-sm font-semibold text-[var(--grn)] hover:underline mr-3 disabled:opacity-40"
                          >
                            Aprobar
                          </button>
                          <button
                            disabled={ocupado}
                            onClick={() => pedirDecision(o, 'rechazada')}
                            className="text-sm text-[var(--red)] hover:underline mr-3 disabled:opacity-40"
                          >
                            Rechazar
                          </button>
                        </>
                      )}
                      {filtro === 'activas' && !permisos.esAdmin && o.estado === 'borrador' && (
                        <>
                          <button
                            disabled={ocupado}
                            onClick={() => enviarAAprobacion(o)}
                            className="text-sm font-semibold text-[var(--ind,#4338ca)] hover:underline mr-3 disabled:opacity-40"
                          >
                            Enviar
                          </button>
                          <button
                            disabled={ocupado}
                            onClick={() => pedirBorrar(o)}
                            className="text-sm text-gray-400 hover:text-[var(--red)] disabled:opacity-40"
                          >
                            Eliminar
                          </button>
                        </>
                      )}
                      {filtro === 'activas' && permisos.esAdmin && o.estado === 'aprobada' && !o.yiqi_id_creado && (
                        <button
                          disabled={ocupado}
                          onClick={() => reintentarEnvioYiqi(o)}
                          title={o.yiqi_error || 'Todavía no se envió a YiQi.'}
                          className="text-sm font-semibold text-[#b45309] hover:underline mr-3 disabled:opacity-40"
                        >
                          Reintentar envío
                        </button>
                      )}
                      {filtro === 'activas' && permisos.esAdmin && (
                        <button
                          disabled={ocupado}
                          onClick={() => archivar(o)}
                          title="Archivar (mover a la papelera)"
                          className="text-sm text-gray-400 hover:text-[var(--red)] disabled:opacity-40"
                        >
                          🗑
                        </button>
                      )}
                      {filtro === 'papelera' && (
                        <>
                          <button
                            disabled={ocupado}
                            onClick={() => restaurar(o)}
                            className="text-sm font-semibold text-[var(--ind,#4338ca)] hover:underline mr-3 disabled:opacity-40"
                          >
                            Restaurar
                          </button>
                          <button
                            disabled={ocupado}
                            onClick={() => pedirEliminarDefinitivo(o)}
                            className="text-sm text-[var(--red)] hover:underline disabled:opacity-40"
                          >
                            Eliminar definitivamente
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      {/* Detalle */}
      {abierta && (
        <div className="bg-white rounded-xl border border-[var(--border)] p-4 mb-6">
          <div className="flex items-start justify-between mb-3 gap-3">
            <div>
              <div className="text-[15px] font-bold">
                Orden #{abierta.id} — {abierta.proveedor_nombre}
              </div>
              <div className="text-[12px] text-[var(--sub)] mt-0.5">
                Creada {formatoFecha(abierta.creada_en)}
                {abierta.total_estimado != null && ` · ${formatoMoneda(abierta.total_estimado)}`}
                {abierta.items_sin_costo > 0 && ` · ${abierta.items_sin_costo} artículos sin costo cargado`}
              </div>
            </div>
            <div className="flex items-center gap-3 whitespace-nowrap">
              <button
                onClick={() => imprimir(abierta)}
                className="px-3 py-1.5 rounded-lg text-[13px] font-semibold border border-[var(--border)] bg-white hover:border-[var(--ind,#4338ca)] hover:text-[var(--ind,#4338ca)]"
              >
                Descargar PDF
              </button>
              {abierta.estado === 'aprobada' && abierta.yiqi_id_creado && (
                <button
                  onClick={() => abrirAgregarMercaderia(abierta)}
                  className="px-3 py-1.5 rounded-lg text-[13px] font-semibold border border-[var(--ind,#4338ca)] text-[var(--ind,#4338ca)] bg-white hover:bg-indigo-50"
                >
                  + Agregar mercadería
                </button>
              )}
              {abierta.estado === 'aprobada' && (
                <button
                  disabled={enviandoWaId === abierta.id}
                  onClick={() => enviarWhatsApp(abierta)}
                  className="px-3 py-1.5 rounded-lg text-[13px] font-semibold border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-40"
                >
                  {enviandoWaId === abierta.id
                    ? 'Enviando…'
                    : abierta.whatsapp_enviada_en ? '💬 Reenviar por WhatsApp' : '💬 Enviar por WhatsApp'}
                </button>
              )}
              <button onClick={() => setAbierta(null)} className="text-sm text-gray-500 hover:underline">
                Cerrar
              </button>
            </div>
          </div>
          {abierta.estado === 'aprobada' && abierta.yiqi_id_creado && (
            <Aviso tipo="filtro" className="mb-3">
              Vinculada a YiQi (OC #{abierta.yiqi_id_creado}) el {formatoFecha(abierta.yiqi_enviada_en)}.
            </Aviso>
          )}
          {abierta.whatsapp_enviada_en && (
            <Aviso tipo="filtro" className="mb-3">
              💬 Enviada por WhatsApp el {formatoFecha(abierta.whatsapp_enviada_en)}.
            </Aviso>
          )}
          {abierta.estado === 'aprobada' && !abierta.yiqi_id_creado && (
            <div className="border border-[#fde68a] bg-[#fffbeb] text-[#92400e] rounded-lg px-3.5 py-2.5 text-[13px] mb-3 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="font-semibold">⚠ Error de vinculación a YiQi</div>
                <div className="mt-0.5 opacity-90">
                  {abierta.yiqi_error || 'Todavía no se pudo enviar esta orden a YiQi.'}
                </div>
              </div>
              {permisos.esAdmin && (
                <button
                  disabled={ocupado}
                  onClick={() => reintentarEnvioYiqi(abierta)}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-[#b45309] text-white hover:opacity-90 disabled:opacity-40"
                >
                  {ocupado ? 'Reintentando…' : 'Reintentar envío'}
                </button>
              )}
            </div>
          )}
          {abierta.notas && (
            <div className="border border-[var(--border)] rounded-lg px-3.5 py-2.5 text-[13px] mb-3">
              <span className="text-[10px] uppercase text-gray-400 block mb-0.5">Notas</span>
              {abierta.notas}
            </div>
          )}
          {abierta.comentario_decision && (
            <div className="border border-[var(--border)] rounded-lg px-3.5 py-2.5 text-[13px] mb-3">
              <span className="text-[10px] uppercase text-gray-400 block mb-0.5">
                Comentario de {abierta.estado === 'rechazada' ? 'rechazo' : 'aprobación'}
              </span>
              {abierta.comentario_decision}
            </div>
          )}
          <div className="border border-[var(--border)] rounded-lg overflow-hidden mb-3">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-[var(--border)]">
                  {['SKU', 'Producto', 'Cantidad', 'Costo unit.', 'Stock al armar', 'Prom./mes'].map((h) => (
                    <th key={h} className="text-left px-3.5 py-2 text-[10px] font-bold text-[var(--sub)] uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-3.5 py-2 font-mono text-xs">{i.mate_codigo}</td>
                    <td className="px-3.5 py-2 text-[13px] font-medium">{i.mate_nombre ?? '—'}</td>
                    <td className="px-3.5 py-2 font-bold">{formatoNumero(i.cantidad)}</td>
                    <td className="px-3.5 py-2 text-sm tabular-nums">
                      {i.costo_unitario ? formatoMoneda(i.costo_unitario) : '—'}
                    </td>
                    <td className="px-3.5 py-2 text-gray-400 text-sm">{formatoNumero(i.stock_al_momento)}</td>
                    <td className="px-3.5 py-2 text-gray-400 text-sm">{formatoNumero(i.promedio_mensual)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {permisos.esAdmin && abierta.estado === 'pendiente' && !abierta.archivada_en && (
            <div className="flex items-center justify-end gap-2">
              <button
                disabled={ocupado}
                onClick={() => pedirDecision(abierta, 'rechazada')}
                className="px-3.5 py-2 rounded-lg text-[13px] font-semibold border border-[var(--border)] text-[var(--red)] bg-white hover:bg-red-50 disabled:opacity-40"
              >
                Rechazar
              </button>
              <button
                disabled={ocupado}
                onClick={() => pedirDecision(abierta, 'aprobada')}
                className="px-3.5 py-2 rounded-lg text-[13px] font-semibold bg-[var(--grn,#3d9970)] text-white hover:opacity-90 disabled:opacity-40"
              >
                Aprobar orden
              </button>
            </div>
          )}
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
