// ============================================================
// fechas.js — 26/10/2026
// Ivana (26/10): los "Días de entrega" de Condiciones comerciales son
// días HÁBILES y se cuentan desde que se le manda el pedido al proveedor.
// Hábil = lunes a viernes. Los feriados no se descuentan (no hay
// calendario de feriados cargado en el sistema).
// ============================================================

// Devuelve una fecha nueva (medianoche local) = desde + n días hábiles.
// n = 0 → el mismo día. null si los datos no sirven.
export function sumarDiasHabiles(desde, n) {
  const dias = Math.round(Number(n))
  if (!(desde instanceof Date) || Number.isNaN(desde.getTime()) || !Number.isFinite(dias) || dias < 0) return null
  const d = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate())
  let faltan = dias
  while (faltan > 0) {
    d.setDate(d.getDate() + 1)
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) faltan--
  }
  return d
}

// 'AAAA-MM-DD' (o timestamp que empiece así) → Date local, sin pasar por UTC.
export function fechaLocalDeTexto(fechaStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fechaStr ?? ''))
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}
