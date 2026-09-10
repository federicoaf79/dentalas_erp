// ============================================================
// pdfRemito.js — 10/9/2026
// ============================================================
// Remito imprimible del circuito de reposición Central<->Local
// (solicitudes_reposicion / solicitudes_reposicion_lineas).
//
// Pedido explícito de Aris (feedback 10/9): "Hay control físico de lo
// que se generó en el remito. (que el remito se pueda imprimir)". Se
// confirmó el mismo día que la confirmación en destino se hace CONTRA
// este remito impreso — no es un accesorio, es parte del control.
//
// Mismo patrón que generarPdfOrden() en pdfOrden.js: HTML + window.print(),
// no jsPDF — no hace falta el archivo descargable acá (no hay envío por
// WhatsApp de esto), y así se evita sumar una dependencia más. Si más
// adelante hace falta el .pdf descargable, se puede clonar el patrón de
// generarPdfOrdenDescargable() de ese mismo archivo.
// ============================================================

import { nombreDeposito } from './depositos'

function numero(n) {
  if (n == null) return '—'
  const num = Number(n)
  if (!Number.isFinite(num)) return '—'
  return num % 1 === 0 ? String(num) : num.toFixed(2)
}

function fecha(f) {
  if (!f) return '—'
  try {
    return new Date(f).toLocaleString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch { return '—' }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]))
}

// Etiqueta de estado por línea — mismo rótulo "En tránsito" que ya se usa
// en las pantallas de depósito desde el 10/9 (antes decía "declarada").
function etiquetaEstadoLinea(l) {
  if (l.estado_linea === 'recibida') return 'Recibido'
  if (l.cantidad_enviada != null) return 'En tránsito'
  return 'Pendiente de preparar'
}

// `solicitud`: fila de solicitudes_reposicion (remito_numero, deposito_origen_id,
// deposito_destino_id, creada_en, procesada_en).
// `lineas`: filas de solicitudes_reposicion_lineas (sku, mate_nombre,
// cantidad_solicitada, cantidad_enviada, estado_linea, motivo_sin_stock).
// `empresa`: fila de empresa_config (mismos campos que usa pdfOrden.js) —
// opcional, si no se pasa se imprime sin membrete.
export function generarRemitoImprimible({ solicitud, lineas, empresa }) {
  const e = empresa ?? {}
  const origen = nombreDeposito(solicitud.deposito_origen_id)
  const destino = nombreDeposito(solicitud.deposito_destino_id)
  const totalPedido = lineas.reduce((acc, l) => acc + Number(l.cantidad_solicitada || 0), 0)
  const totalEnviado = lineas.reduce((acc, l) => acc + Number(l.cantidad_enviada || 0), 0)

  const filas = lineas.map((l) => `
    <tr>
      <td class="mono">${esc(l.sku)}</td>
      <td>${esc(l.mate_nombre ?? '')}</td>
      <td class="num">${numero(l.cantidad_solicitada)}</td>
      <td class="num">${l.cantidad_enviada != null ? numero(l.cantidad_enviada) : '<span class="gris">—</span>'}</td>
      <td>${l.motivo_sin_stock ? esc(l.motivo_sin_stock) : ''}</td>
      <td><span class="estado ${l.estado_linea === 'recibida' ? 'ok' : ''}">${esc(etiquetaEstadoLinea(l))}</span></td>
    </tr>`).join('')

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Remito ${esc(solicitud.remito_numero ?? solicitud.id)} - ${esc(origen)} a ${esc(destino)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         color: #1f2937; font-size: 11px; margin: 0; }
  .cab { display: flex; justify-content: space-between; align-items: flex-start;
         gap: 20px; padding-bottom: 12px; border-bottom: 2px solid #1f2937; }
  .logo { height: 52px; width: auto; object-fit: contain; }
  .emp-nombre { font-size: 17px; font-weight: 700; }
  .emp-datos { font-size: 10px; color: #6b7280; line-height: 1.5; margin-top: 3px; }
  .doc { text-align: right; }
  .doc-tit { font-size: 15px; font-weight: 700; letter-spacing: .5px; }
  .doc-num { font-size: 22px; font-weight: 700; }
  .doc-fecha { font-size: 10px; color: #6b7280; margin-top: 2px; }
  .bloques { display: flex; gap: 14px; margin: 14px 0; }
  .bloque { flex: 1; border: 1px solid #e5e7eb; border-radius: 5px; padding: 9px 11px; }
  .bloque h3 { margin: 0 0 4px; font-size: 9px; text-transform: uppercase;
               letter-spacing: .6px; color: #9ca3af; font-weight: 700; }
  .bloque .val { font-size: 13px; font-weight: 600; }
  .bloque .sub { font-size: 10px; color: #6b7280; margin-top: 1px; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  thead th { background: #f3f4f6; text-align: left; padding: 6px 8px;
             font-size: 9px; text-transform: uppercase; letter-spacing: .4px;
             color: #6b7280; border-bottom: 1px solid #d1d5db; }
  tbody td { padding: 6px 8px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
  tbody tr:nth-child(even) { background: #fafafa; }
  .num { text-align: right; white-space: nowrap; }
  .mono { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 10px; }
  .gris { color: #9ca3af; font-style: italic; }
  .estado { display: inline-block; padding: 1px 7px; border-radius: 999px;
            background: #eef2ff; color: #4338ca; font-size: 9px; font-weight: 700; }
  .estado.ok { background: #d1fae5; color: #065f46; }
  .pie { margin-top: 18px; padding-top: 9px; border-top: 1px solid #e5e7eb;
         font-size: 9px; color: #9ca3af; white-space: pre-line; }
  .firmas { display: flex; gap: 40px; margin-top: 34px; }
  .firma { flex: 1; border-top: 1px solid #9ca3af; padding-top: 4px;
           font-size: 9px; color: #6b7280; text-align: center; }
  @media print { .no-print { display: none !important; } }
  .barra { position: fixed; top: 0; left: 0; right: 0; background: #4338ca;
           color: #fff; padding: 9px 16px; font-size: 13px; display: flex;
           justify-content: space-between; align-items: center; }
  .barra button { background: #fff; color: #4338ca; border: 0; border-radius: 6px;
                  padding: 6px 14px; font-weight: 600; cursor: pointer; font-size: 13px; }
  .cuerpo { margin-top: 46px; }
  @media print { .cuerpo { margin-top: 0; } }
</style></head>
<body>
<div class="barra no-print">
  <span>Usá "Guardar como PDF" en el destino de impresión, o imprimí en papel para el control físico</span>
  <button onclick="window.print()">Imprimir / Guardar PDF</button>
</div>

<div class="cuerpo">
  <div class="cab">
    <div style="display:flex; gap:12px; align-items:flex-start;">
      ${e.logo_url ? `<img class="logo" src="${esc(e.logo_url)}" alt="">` : ''}
      <div>
        <div class="emp-nombre">${esc(e.nombre || 'Dentalab')}</div>
        <div class="emp-datos">
          ${e.razon_social ? esc(e.razon_social) + '<br>' : ''}
          ${e.cuit ? 'CUIT ' + esc(e.cuit) + '<br>' : ''}
        </div>
      </div>
    </div>
    <div class="doc">
      <div class="doc-tit">REMITO DE REPOSICIÓN</div>
      <div class="doc-num">${esc(solicitud.remito_numero ?? `#${solicitud.id}`)}</div>
      <div class="doc-fecha">Generado ${fecha(solicitud.procesada_en ?? solicitud.creada_en)}</div>
    </div>
  </div>

  <div class="bloques">
    <div class="bloque">
      <h3>Origen</h3>
      <div class="val">${esc(origen)}</div>
      <div class="sub">Prepara y envía</div>
    </div>
    <div class="bloque">
      <h3>Destino</h3>
      <div class="val">${esc(destino)}</div>
      <div class="sub">Confirma recepción contra este remito</div>
    </div>
    <div class="bloque">
      <h3>Artículos</h3>
      <div class="val">${lineas.length}</div>
      <div class="sub">${numero(totalPedido)} pedidas · ${numero(totalEnviado)} en tránsito/enviadas</div>
    </div>
  </div>

  <table>
    <thead><tr>
      <th>SKU</th><th>Artículo</th>
      <th class="num">Pedido</th><th class="num">Envía</th><th>Motivo si falta</th><th>Estado</th>
    </tr></thead>
    <tbody>${filas}</tbody>
  </table>

  <div class="firmas">
    <div class="firma">Preparado por (${esc(origen)})</div>
    <div class="firma">Recibido por (${esc(destino)}) / Fecha</div>
  </div>

  ${e.pie_pagina ? `<div class="pie">${esc(e.pie_pagina)}</div>` : ''}
</div>
</body></html>`

  const win = window.open('', '_blank')
  if (!win) {
    alert('El navegador bloqueó la ventana. Permití las ventanas emergentes para este sitio y probá de nuevo.')
    return
  }
  win.document.write(html)
  win.document.close()
}
