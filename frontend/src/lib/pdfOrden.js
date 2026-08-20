// ============================================================
// pdfOrden.js
// Genera la orden de compra imprimible.
//
// Se hace con HTML + window.print() en vez de una librería de PDF:
// sale con la tipografía y los colores del navegador, el usuario elige
// "Guardar como PDF" en el mismo diálogo, y no agrega dependencias.
// La contra es que pasa por el diálogo de impresión en lugar de bajar
// el archivo directo.
//
// [19/8/2026] Se sumó `generarPdfOrdenDescargable()`, más abajo: para el
// envío semi-automático por WhatsApp hace falta un archivo .pdf real que
// se descargue solo, sin pasar por el diálogo de impresión (WhatsApp no
// tiene forma de recibir un archivo por link — la persona lo arrastra a
// mano una vez que ya está descargado). Usa jsPDF + jspdf-autotable.
// La función vieja (generarPdfOrden, arriba) sigue igual, para no tocar
// el botón "PDF"/"Descargar PDF" que ya funciona en producción.
// ============================================================

import { jsPDF } from 'jspdf'
// Import de efecto (no default): jspdf-autotable v3 se registra solo como
// jsPDF.API.autoTable al importarse. El import default (`import autoTable
// from ...`) + llamarlo como función funcionaba en dev pero rompía en el
// build de producción de Vite/Rollup con "(0 , UI.default) is not a
// function" — problema de interop CJS/ESM de este paquete, no del código.
// Encontrado probando en vivo tras el primer deploy; este es el patrón
// documentado por la librería para máxima compatibilidad entre bundlers.
import 'jspdf-autotable'

function moneda(n) {
  const num = Number(n)
  if (!Number.isFinite(num)) return '—'
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 2,
  }).format(num)
}

function numero(n) {
  if (n == null) return '—'
  const num = Number(n)
  if (!Number.isFinite(num)) return '—'
  return num % 1 === 0 ? String(num) : num.toFixed(2)
}

function fecha(f) {
  if (!f) return '—'
  try {
    return new Date(f).toLocaleDateString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })
  } catch { return '—' }
}

// Escapa el texto que viene de la base antes de meterlo en el HTML.
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]))
}

export function generarPdfOrden({ orden, items, empresa, proveedor }) {
  const e = empresa ?? {}
  const totalCalculado = items.reduce((acc, i) => {
    const c = Number(i.costo_unitario)
    return acc + (Number.isFinite(c) ? c * Number(i.cantidad || 0) : 0)
  }, 0)
  const sinCosto = items.filter((i) => !i.costo_unitario).length

  const filas = items.map((i) => `
    <tr>
      <td class="mono">${esc(i.mate_codigo)}</td>
      <td>${esc(i.mate_nombre ?? '')}</td>
      <td class="num">${numero(i.cantidad)}</td>
      <td class="num">${i.costo_unitario ? moneda(i.costo_unitario) : '<span class="gris">a confirmar</span>'}</td>
      <td class="num">${i.costo_unitario ? moneda(Number(i.costo_unitario) * Number(i.cantidad || 0)) : '—'}</td>
    </tr>`).join('')

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>OC ${esc(orden.id)} - ${esc(orden.proveedor_nombre)}</title>
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
  tfoot td { padding: 8px; font-weight: 700; font-size: 13px; border-top: 2px solid #1f2937; }
  .nota { margin-top: 12px; border: 1px solid #e5e7eb; border-radius: 5px;
          padding: 9px 11px; font-size: 10px; }
  .nota h3 { margin: 0 0 3px; font-size: 9px; text-transform: uppercase;
             letter-spacing: .6px; color: #9ca3af; font-weight: 700; }
  .aviso { margin-top: 10px; padding: 7px 10px; border-radius: 5px;
           background: #fef3c7; color: #92400e; font-size: 10px; }
  .pie { margin-top: 18px; padding-top: 9px; border-top: 1px solid #e5e7eb;
         font-size: 9px; color: #9ca3af; white-space: pre-line; }
  .firmas { display: flex; gap: 40px; margin-top: 28px; }
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
  <span>Usá “Guardar como PDF” en el destino de impresión</span>
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
          ${e.direccion ? esc(e.direccion) + (e.localidad ? ', ' + esc(e.localidad) : '') + '<br>' : ''}
          ${e.telefono ? 'Tel. ' + esc(e.telefono) + '<br>' : ''}
          ${e.email ? esc(e.email) : ''}
        </div>
      </div>
    </div>
    <div class="doc">
      <div class="doc-tit">ORDEN DE COMPRA</div>
      <div class="doc-num">#${esc(orden.id)}</div>
      <div class="doc-fecha">Emitida ${fecha(orden.creada_en)}</div>
    </div>
  </div>

  <div class="bloques">
    <div class="bloque">
      <h3>Proveedor</h3>
      <div class="val">${esc(orden.proveedor_nombre)}</div>
      ${proveedor?.clie_cuit ? `<div class="sub">CUIT ${esc(proveedor.clie_cuit)}</div>` : ''}
      ${proveedor?.telefono ? `<div class="sub">Tel. ${esc(proveedor.telefono)}</div>` : ''}
      ${proveedor?.mail ? `<div class="sub">${esc(proveedor.mail)}</div>` : ''}
    </div>
    <div class="bloque">
      <h3>Artículos</h3>
      <div class="val">${items.length}</div>
      <div class="sub">${numero(items.reduce((a, i) => a + Number(i.cantidad || 0), 0))} unidades en total</div>
    </div>
    <div class="bloque">
      <h3>Total estimado</h3>
      <div class="val">${moneda(totalCalculado)}</div>
      <div class="sub">${sinCosto > 0 ? sinCosto + ' artículos a confirmar precio' : 'Todos los precios confirmados'}</div>
    </div>
  </div>

  <table>
    <thead><tr>
      <th>SKU</th><th>Artículo</th>
      <th class="num">Cantidad</th><th class="num">Precio unit.</th><th class="num">Subtotal</th>
    </tr></thead>
    <tbody>${filas}</tbody>
    <tfoot><tr>
      <td colspan="4" class="num">TOTAL ESTIMADO</td>
      <td class="num">${moneda(totalCalculado)}</td>
    </tr></tfoot>
  </table>

  ${sinCosto > 0 ? `<div class="aviso">
    ${sinCosto} ${sinCosto === 1 ? 'artículo no tiene' : 'artículos no tienen'} precio de referencia cargado:
    el total es estimativo y esos ítems quedan a confirmar con el proveedor.
  </div>` : ''}

  ${orden.notas ? `<div class="nota"><h3>Notas</h3>${esc(orden.notas)}</div>` : ''}

  <div class="firmas">
    <div class="firma">Solicitado por</div>
    <div class="firma">Autorizado por</div>
    <div class="firma">Recibido por / Fecha</div>
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

// Nombre de archivo prolijo: "OC-9-dental-medrano.pdf". Sin acentos ni
// espacios, para que no rompa al arrastrarlo a WhatsApp en ningún SO.
function nombreArchivoOrden(orden) {
  const prov = String(orden.proveedor_nombre ?? 'proveedor')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return `OC-${orden.id}-${prov || 'proveedor'}.pdf`
}

// Genera un PDF real (no un diálogo de impresión) y lo descarga solo,
// vía jsPDF. Pensado para el flujo semi-automático de WhatsApp: se llama
// justo antes de abrir wa.me, así el archivo ya está en Descargas cuando
// la persona quiere arrastrarlo a la conversación.
export function generarPdfOrdenDescargable({ orden, items, empresa, proveedor }) {
  const e = empresa ?? {}
  const totalCalculado = items.reduce((acc, i) => {
    const c = Number(i.costo_unitario)
    return acc + (Number.isFinite(c) ? c * Number(i.cantidad || 0) : 0)
  }, 0)
  const sinCosto = items.filter((i) => !i.costo_unitario).length

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const margenX = 14
  const margenDer = 196
  let y = 18

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(31, 41, 55)
  doc.text(e.nombre || 'Dentalab', margenX, y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(107, 114, 128)
  let yEmp = y + 5
  ;[
    e.razon_social,
    e.cuit ? `CUIT ${e.cuit}` : null,
    e.direccion ? `${e.direccion}${e.localidad ? ', ' + e.localidad : ''}` : null,
    e.telefono ? `Tel. ${e.telefono}` : null,
    e.email,
  ].filter(Boolean).forEach((linea) => { doc.text(String(linea), margenX, yEmp); yEmp += 4 })

  doc.setTextColor(31, 41, 55)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('ORDEN DE COMPRA', margenDer, y, { align: 'right' })
  doc.setFontSize(18)
  doc.text(`#${orden.id}`, margenDer, y + 7, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(107, 114, 128)
  doc.text(`Emitida ${fecha(orden.creada_en)}`, margenDer, y + 12, { align: 'right' })

  y = Math.max(yEmp, y + 16) + 6
  doc.setDrawColor(31, 41, 55)
  doc.setLineWidth(0.6)
  doc.line(margenX, y - 4, margenDer, y - 4)

  doc.setTextColor(156, 163, 175)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('PROVEEDOR', margenX, y)
  doc.setTextColor(31, 41, 55)
  doc.setFontSize(11)
  doc.text(String(orden.proveedor_nombre ?? ''), margenX, y + 5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(107, 114, 128)
  let yProv = y + 10
  ;[
    proveedor?.clie_cuit ? `CUIT ${proveedor.clie_cuit}` : null,
    proveedor?.telefono ? `Tel. ${proveedor.telefono}` : null,
    proveedor?.mail,
  ].filter(Boolean).forEach((linea) => { doc.text(String(linea), margenX, yProv); yProv += 4 })

  y = Math.max(yProv, y + 10) + 4

  const filas = items.map((i) => [
    i.mate_codigo ?? '',
    i.mate_nombre ?? '',
    numero(i.cantidad),
    i.costo_unitario ? moneda(i.costo_unitario) : 'a confirmar',
    i.costo_unitario ? moneda(Number(i.costo_unitario) * Number(i.cantidad || 0)) : '—',
  ])

  doc.autoTable({
    startY: y,
    margin: { left: margenX, right: 14 },
    head: [['SKU', 'Artículo', 'Cantidad', 'Precio unit.', 'Subtotal']],
    body: filas,
    styles: { fontSize: 8.5, cellPadding: 2, textColor: [31, 41, 55] },
    headStyles: { fillColor: [243, 244, 246], textColor: [107, 114, 128], fontStyle: 'bold', fontSize: 8 },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    foot: [['', '', '', 'TOTAL ESTIMADO', moneda(totalCalculado)]],
    footStyles: { fillColor: [255, 255, 255], textColor: [31, 41, 55], fontStyle: 'bold', fontSize: 10 },
  })

  let yFinal = doc.lastAutoTable.finalY + 8

  if (sinCosto > 0) {
    const texto = `${sinCosto} ${sinCosto === 1 ? 'artículo no tiene' : 'artículos no tienen'} precio de referencia cargado: el total es estimativo.`
    doc.setFillColor(254, 243, 199)
    doc.roundedRect(margenX, yFinal - 4, margenDer - margenX, 8, 1.5, 1.5, 'F')
    doc.setTextColor(146, 64, 14)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.text(texto, margenX + 3, yFinal + 1)
    yFinal += 12
  }

  if (orden.notas) {
    doc.setTextColor(31, 41, 55)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('Notas', margenX, yFinal)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(55, 65, 81)
    const notasWrap = doc.splitTextToSize(String(orden.notas), margenDer - margenX)
    doc.text(notasWrap, margenX, yFinal + 5)
  }

  doc.save(nombreArchivoOrden(orden))
}
