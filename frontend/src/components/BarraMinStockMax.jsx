// ============================================================
// BarraMinStockMax.jsx — 28/9/2026 (zonas de color de fondo: 26/10/2026)
// ============================================================
// Gráfico más intuitivo para Mín./Stock/Máx. (feedback del cliente,
// punto 3): una barra horizontal en vez de 3 números en columnas
// separadas, para ver de un vistazo si el stock está por debajo del
// mínimo, entre mínimo y máximo, o por encima del máximo. Puramente
// visual -- no cambia ningún cálculo de alerta (calcularAlerta sigue
// igual en Alertas.jsx/MonitorStock.jsx), es un resumen de los mismos
// valores que ya se mostraban sueltos.
//
// Ivana pidió lo mismo para Nueva OC (ver FEEDBACK_IVANA_28-9-2026.md,
// punto 11) -- aplicado ahí el 7/10/2026 (columna Stock).
// ============================================================
export default function BarraMinStockMax({ stock, min, max }) {
  const s = Number(stock) || 0
  const mn = min != null && Number(min) > 0 ? Number(min) : null
  const mx = max != null && Number(max) > 0 ? Number(max) : null

  // Sin ningún umbral cargado, no hay contra qué graficar -- se cae al
  // número solo, igual que antes.
  if (mn == null && mx == null) {
    return <span className="text-gray-700 font-bold text-sm">{s}</span>
  }

  // Escala: el techo visual es el mayor entre stock/mín/máx (piso de 1
  // para que la barra no quede vacía si todo es chico), así un stock
  // que se pasó del máximo también se alcanza a ver.
  const techo = Math.max(s, mn ?? 0, mx ?? 0, 1)
  const pctStock = Math.min(100, (s / techo) * 100)
  const pctMin = mn != null ? Math.min(100, (mn / techo) * 100) : null
  const pctMax = mx != null ? Math.min(100, (mx / techo) * 100) : null

  let colorBarra = 'bg-[var(--grn,#3d9970)]'
  if (mn != null && s <= mn) colorBarra = 'bg-[var(--red)]'
  else if (mx != null && s > mx) colorBarra = 'bg-[var(--ind,#4338ca)]'

  return (
    <div
      className="w-28"
      title={`Stock ${s}${mn != null ? ` · Mín. ${mn}` : ''}${mx != null ? ` · Máx. ${mx}` : ''}\nRojo: hasta el mínimo · Verde: entre mínimo y máximo · Índigo: por encima del máximo`}
    >
      <div className="flex items-baseline justify-between text-[11px] mb-0.5">
        <span className="font-bold text-gray-700">{s}</span>
        {mx != null && <span className="text-gray-300">máx {mx}</span>}
      </div>
      <div className="relative h-1.5 bg-gray-100 rounded-full overflow-visible">
        {/* 26/10/2026 — Ivana: "solo veo el bordó". En Nueva OC casi todo está bajo el
            mínimo (stock 0 → barra vacía), así que se pintan de fondo las tres zonas:
            rojo claro hasta el mínimo, verde claro entre mínimo y máximo, índigo claro
            por encima del máximo. La barra del stock va encima con su color fuerte. */}
        {pctMin != null && (
          <div className="absolute inset-y-0 left-0 rounded-l-full bg-[#fde2e2]" style={{ width: `${pctMin}%` }} />
        )}
        <div
          className="absolute inset-y-0 bg-[#dcf2e6]"
          style={{ left: `${pctMin ?? 0}%`, width: `${Math.max(0, (pctMax ?? 100) - (pctMin ?? 0))}%` }}
        />
        {pctMax != null && pctMax < 100 && (
          <div className="absolute inset-y-0 right-0 rounded-r-full bg-[#e3e1fb]" style={{ left: `${pctMax}%` }} />
        )}
        <div className={`relative h-1.5 rounded-full ${colorBarra}`} style={{ width: `${pctStock}%` }} />
        {pctMin != null && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-[#92400e]"
            style={{ left: `${pctMin}%` }}
          />
        )}
        {pctMax != null && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-gray-400"
            style={{ left: `${pctMax}%` }}
          />
        )}
      </div>
    </div>
  )
}
