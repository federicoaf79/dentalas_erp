// ============================================================
// filtroProveedor.js — 28/9/2026
// ============================================================
// Filtro de proveedores estilo "Filtrar lista" de YiQi (feedback del
// cliente, punto 1, 28/9/2026): constructor simple de condición (Es /
// No es / Es vacío) más una lista de proveedores excluidos a mano
// ("sigue trabajando con ellos pero no los quiere ver por el
// momento"). Se aplica DESPUÉS del filtro de permisos de usePermisos()
// -- es una capa extra manual sobre lo que ya es visible para el
// usuario logueado, no lo reemplaza.
//
// Vive como función pura + estado plano (en vez de un hook con su
// propio estado) para poder compartirla tal cual entre MonitorStock.jsx
// y Alertas.jsx sin duplicar la lógica de filtrado en los dos lugares.
// A propósito no persiste entre sesiones (ni localStorage ni tabla
// propia): es un filtro de trabajo momentáneo, no una configuración. Si
// más adelante hace falta que persista, es una decisión aparte con
// Federico (habría que definir si es por usuario o compartido).
// ============================================================

export const FILTRO_PROVEEDOR_INICIAL = { modo: 'todos', proveedor: '', excluidos: [] }

export function filtroProveedorActivo(filtro) {
  if (!filtro) return false
  return filtro.modo !== 'todos' || (filtro.excluidos?.length ?? 0) > 0
}

export function aplicarFiltroProveedor(articulos, filtro) {
  if (!filtro) return articulos
  let out = articulos
  if (filtro.modo === 'es' && filtro.proveedor) {
    out = out.filter((a) => a.clie_nombre === filtro.proveedor)
  } else if (filtro.modo === 'no_es' && filtro.proveedor) {
    out = out.filter((a) => a.clie_nombre !== filtro.proveedor)
  } else if (filtro.modo === 'vacio') {
    out = out.filter((a) => !a.clie_nombre)
  }
  if (filtro.excluidos && filtro.excluidos.length > 0) {
    const excl = new Set(filtro.excluidos)
    out = out.filter((a) => !excl.has(a.clie_nombre))
  }
  return out
}
