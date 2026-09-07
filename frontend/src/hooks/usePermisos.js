// ---------------------------------------------------------------
// usePermisos — Dentalab-Compras
// ---------------------------------------------------------------
// Responde tres preguntas para el usuario logueado:
//   1) ¿Es admin? (ve todo)
//   2) Si es operador, ¿qué proveedores tiene asignados?
//   3) Si es de depósito (7/9/2026, circuito de reposición
//      Central↔Local), ¿a qué depósito(s) está asignado?
//
// Fuentes:
//   - usuarios_config   -> rol ('admin' | 'operador' | 'deposito') y activo
//   - usuario_proveedor -> asignaciones (solo si rol = 'operador')
//   - usuario_deposito  -> asignaciones (solo si rol = 'deposito')
//
// Las tres tablas tienen RLS: cada usuario lee únicamente sus filas.
//
// REGLA DE ORO: ninguna pantalla debe consultar datos mientras
// `cargando` sea true. Si lo hace, filtraría con listas vacías y
// mostraría cero filas (parece un bug, no lo es).
// ---------------------------------------------------------------

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const SIN_PERMISOS = {
  esAdmin: false,
  esDeposito: false,
  misDepositos: [],
  codigos: [],
  nombres: [],
  nombreUsuario: null,
}

export function usePermisos() {
  const [estado, setEstado] = useState({
    ...SIN_PERMISOS,
    cargando: true,
    error: null,
  })

  // Guarda quien era el usuario en la ultima carga. Sirve para distinguir
  // "cambio de usuario" (hay que recalcular) de "Supabase refresco el
  // token" (no cambia nada).
  const usuarioActual = useRef(null)

  useEffect(() => {
    let vivo = true

    async function cargar() {
      try {
        const { data: { user }, error: errUser } = await supabase.auth.getUser()
        if (errUser) throw errUser
        if (!user) throw new Error('No hay sesión activa')

        usuarioActual.current = user.id

        // --- 1) Rol del usuario -------------------------------------
        const { data: config, error: errConfig } = await supabase
          .from('usuarios_config')
          .select('rol, activo, nombre')
          .eq('user_id', user.id)
          .maybeSingle()

        if (errConfig) throw errConfig
        if (!config) {
          throw new Error(
            'El usuario no tiene fila en usuarios_config. ' +
            'Hay que darlo de alta antes de que pueda ver datos.'
          )
        }
        if (config.activo === false) throw new Error('Usuario desactivado')

        // --- 2a) Admin: no hay filtro que aplicar --------------------
        if (config.rol === 'admin') {
          if (vivo) {
            setEstado({
              esAdmin: true,
              esDeposito: false,
              misDepositos: [],
              codigos: [],
              nombres: [],
              nombreUsuario: config.nombre,
              cargando: false,
              error: null,
            })
          }
          return
        }

        // --- 2b) Depósito (7/9/2026): traer sus depósitos asignados --
        // Cuentas acotadas al circuito de reposición Central↔Local
        // (ver DISENO_TECNICO_Reposicion_CentralLocal_7-9-2026.md) —
        // no ven Compras, OC, Alertas ni el resto del sistema.
        if (config.rol === 'deposito') {
          const { data: asignacionesDeposito, error: errDep } = await supabase
            .from('usuario_deposito')
            .select('deposito_id')
            .eq('usuario_id', user.id)

          if (errDep) throw errDep

          if (vivo) {
            setEstado({
              esAdmin: false,
              esDeposito: true,
              misDepositos: (asignacionesDeposito ?? []).map((f) => f.deposito_id),
              codigos: [],
              nombres: [],
              nombreUsuario: config.nombre,
              cargando: false,
              error: null,
            })
          }
          return
        }

        // --- 2c) Operador: traer sus proveedores ---------------------
        const { data: asignaciones, error: errAsig } = await supabase
          .from('usuario_proveedor')
          .select('proveedor_codigo, proveedor_nombre')
          .eq('user_id', user.id)

        if (errAsig) throw errAsig

        const filas = asignaciones ?? []
        const limpiar = (campo) => [
          ...new Set(
            filas
              .map((f) => f[campo])
              .filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
              .map((v) => String(v))
          ),
        ]

        if (vivo) {
          setEstado({
            esAdmin: false,
            esDeposito: false,
            misDepositos: [],
            codigos: limpiar('proveedor_codigo'),
            nombres: limpiar('proveedor_nombre'),
            nombreUsuario: config.nombre,
            cargando: false,
            error: null,
          })
        }
      } catch (e) {
        // Falla cerrado: ante cualquier problema, no se ve nada.
        console.error('[usePermisos]', e)
        if (vivo) {
          setEstado({
            ...SIN_PERMISOS,
            cargando: false,
            error: e?.message ?? 'Error desconocido al cargar permisos',
          })
        }
      }
    }

    cargar()

    // OJO: onAuthStateChange NO dispara solo en login/logout. Supabase
    // tambien lo emite cuando refresca el token, y eso pasa cada vez que
    // volves a la pestaña despues de un rato. Si recalcularamos ahi,
    // toda la app se recargaria sola (y en pantallas grandes se pierde
    // la seleccion y se vuelven a traer miles de filas).
    //
    // Por eso solo recalculamos si REALMENTE cambio el usuario.
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, sesion) => {
      if (!vivo) return
      const nuevoId = sesion?.user?.id ?? null
      if (nuevoId === usuarioActual.current) return // mismo usuario: no hacer nada
      usuarioActual.current = nuevoId
      setEstado((prev) => ({ ...prev, cargando: true }))
      cargar()
    })

    return () => {
      vivo = false
      sub?.subscription?.unsubscribe()
    }
  }, [])

  return estado
}

// ---------------------------------------------------------------
// HELPERS DE FILTRADO
// ---------------------------------------------------------------
// Por qué existen: la clave de asignación quedó partida. De las 19
// asignaciones reales, 10 tienen código numérico de YiQi (3, 72, 591…)
// y 9 tienen el NOMBRE metido dentro de proveedor_codigo, porque esos
// proveedores no tienen CLIE_CODIGO cargado en YiQi.
//
// Por eso material_yiqi se filtra por (código OR nombre). Filtrar solo
// por código dejaría 9 proveedores afuera en silencio.
//
// Verificado en la base: ningún clie_nombre asignado corresponde a más
// de un clie_codigo, así que filtrar por nombre no sobre-expone datos.
// ---------------------------------------------------------------

// PostgREST recibe el .or() como un string plano. Los nombres de
// proveedor tienen comas, paréntesis y espacios —"DEFLEX (REVENTA)",
// "SAENZ GUSTAVO - MUNDOYREAL (MAYORISTA)"— así que hay que encomillar
// cada valor o el parser corta mal la lista.
function comillar(valor) {
  const v = String(valor).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `"${v}"`
}

/**
 * Aplica el filtro de proveedores a una query sobre material_yiqi.
 * Admin -> devuelve la query intacta (ve todo).
 *
 *   let q = supabase.from('material_yiqi').select('*', { count: 'exact' })
 *   q = filtrarMaterial(q, permisos)
 */
export function filtrarMaterial(query, { esAdmin, codigos, nombres }) {
  if (esAdmin) return query

  const partes = []
  if (codigos?.length) partes.push(`clie_codigo.in.(${codigos.map(comillar).join(',')})`)
  if (nombres?.length) partes.push(`clie_nombre.in.(${nombres.map(comillar).join(',')})`)

  // Operador sin asignaciones: no ve nada (filtro imposible, no "todo").
  if (partes.length === 0) return query.in('clie_codigo', ['__sin_asignaciones__'])

  return query.or(partes.join(','))
}

/**
 * Aplica el filtro de proveedores a una query sobre ordenes_yiqi.
 * ordenes_yiqi NO tiene columna de código: solo `proveedor` (nombre),
 * así que este filtro es por nombre sí o sí.
 *
 * Nota: las líneas con proveedor NULL quedan fuera de la vista del
 * operador (solo las ve el admin). Hoy hay 1 línea en esa condición.
 */
export function filtrarOrdenes(query, { esAdmin, nombres }) {
  if (esAdmin) return query
  return query.in('proveedor', nombres?.length ? nombres : ['__sin_asignaciones__'])
}

/**
 * Aplica el filtro de proveedores a una query sobre precios_proveedor_yiqi.
 * Igual que filtrarOrdenes: esta smartie tampoco trae código de
 * proveedor (solo LDPC_NOMBRE), así que el filtro es por nombre.
 * Esto es una segunda capa además del RLS de la tabla (que ya filtra
 * por lo mismo) -- no es estrictamente necesario, pero se mantiene por
 * consistencia con el resto de las pantallas y para poder mostrar el
 * aviso de "vista filtrada" sin depender de inspeccionar el error de RLS.
 */
export function filtrarPrecios(query, { esAdmin, nombres }) {
  if (esAdmin) return query
  return query.in('proveedor', nombres?.length ? nombres : ['__sin_asignaciones__'])
}
