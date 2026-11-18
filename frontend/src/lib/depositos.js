// ============================================================
// lib/depositos.js — 7/9/2026
// ============================================================
// Constantes compartidas por las pantallas de depósito (circuito de
// reposición automática Central<->Local). Ids reales de
// UBICACION_STOCK, confirmados el 6/9/2026 (ver
// INCIDENTE_duplicados_ordenes_yiqi_5-9-2026.md).
// ============================================================

export const DEPOSITO_LOCAL = 155
export const DEPOSITO_CENTRAL = 157

const DEPOSITO_NOMBRES = {
  // 18/11/2026 — nombre unificado: antes "el Local" / "Depósito Central" (radiografía en vivo).
  [DEPOSITO_LOCAL]: 'Depósito Local',
  [DEPOSITO_CENTRAL]: 'Depósito Central',
}

export const DEPOSITO_OTRO = {
  [DEPOSITO_LOCAL]: DEPOSITO_CENTRAL,
  [DEPOSITO_CENTRAL]: DEPOSITO_LOCAL,
}

export function nombreDeposito(id) {
  return DEPOSITO_NOMBRES[id] ?? `Depósito ${id}`
}

// "a el Local" / "de el Local" no existen en castellano: se contraen
// ("al Local", "del Local"). 30/9/2026, bug "Pedir a el Local".
// 18/11/2026 — con los nombres "Depósito Local" / "Depósito Central" salen
// "a Depósito Local", "de Depósito Central" (sin contracción). Se deja la rama
// "el X" por si algún día se agrega un nombre con artículo.
export function aDeposito(id) {
  const n = nombreDeposito(id)
  return n.startsWith('el ') ? `al ${n.slice(3)}` : `a ${n}`
}
export function deDeposito(id) {
  const n = nombreDeposito(id)
  return n.startsWith('el ') ? `del ${n.slice(3)}` : `de ${n}`
}
