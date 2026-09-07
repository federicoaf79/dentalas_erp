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
  [DEPOSITO_LOCAL]: 'el Local',
  [DEPOSITO_CENTRAL]: 'Depósito Central',
}

export const DEPOSITO_OTRO = {
  [DEPOSITO_LOCAL]: DEPOSITO_CENTRAL,
  [DEPOSITO_CENTRAL]: DEPOSITO_LOCAL,
}

export function nombreDeposito(id) {
  return DEPOSITO_NOMBRES[id] ?? `Depósito ${id}`
}
