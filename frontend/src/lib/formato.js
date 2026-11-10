// ============================================================
// formato.js
// 10/11/2026 — radiografía UX (ítem 4): formato de números es-AR único.
// Todos los números en pantalla: miles con punto, decimales con coma
// ("5.267,3", "1.147,1", "7,4"). Solo presentación: nunca usar estos
// strings para cálculos, comparaciones, inputs editables ni Excel.
// ============================================================

// valor → string es-AR. "—" para null/undefined/''/NaN/Infinity.
// `decimales` = máximo de decimales; `minDecimales` = mínimo (rellena con ceros).
export function formatoNumero(valor, { decimales = 1, minDecimales = 0 } = {}) {
  if (valor == null || valor === '') return '—'
  const num = Number(valor)
  if (!Number.isFinite(num)) return '—'
  const max = Math.max(decimales, minDecimales)
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: minDecimales,
    maximumFractionDigits: max,
    useGrouping: 'always', // es-AR agrupa también los de 4 cifras ("1.147")
  }).format(num)
}

// Monto en pesos sin decimales ("$ 3.645"). null → "—".
export function formatoMoneda(valor) {
  if (valor == null || valor === '') return '—'
  const num = Number(valor)
  if (!Number.isFinite(num)) return '—'
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
  }).format(num)
}
