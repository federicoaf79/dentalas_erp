import * as XLSX from 'xlsx'

// ============================================================
// exportarExcel.js — 21/8/2026
//
// Export a Excel para remitos de Reposición interna (ver Aris,
// sección 4.5 y 9.5): columnas mínimas SKU / Descripción / Cantidad,
// SKU SIEMPRE como texto -- nunca como número. Hay SKU reales con
// letras, guiones o espacios ("31110 T", "66679-F", "2811-2158") y
// también puramente numéricos ("889", "40156") que Excel/SheetJS
// convertirían solos a número si no se fuerza el tipo de celda -- eso
// puede causar errores graves de picking/carga en YiQi (regla 10.3
// de Aris: "no convertir SKU a número").
// ============================================================

const CARACTERES_INVALIDOS_HOJA = /[:\\/?*[\]]/g

function nombreHojaSeguro(nombre) {
  const limpio = (nombre ?? 'Remito').replace(CARACTERES_INVALIDOS_HOJA, '-')
  // Excel limita el nombre de una hoja a 31 caracteres.
  return limpio.slice(0, 31) || 'Remito'
}

function construirHojaRemito(filas) {
  const encabezado = ['SKU', 'Descripción', 'Cantidad']
  const datos = filas.map((f) => [
    f.sku,
    f.mate_nombre,
    Math.round((Number(f.cantidad) || 0) * 100) / 100,
  ])
  const ws = XLSX.utils.aoa_to_sheet([encabezado, ...datos])

  // Forzar columna A (SKU) como texto en cada fila de datos, sin
  // importar qué forma tenga -- ver nota arriba.
  for (let i = 0; i < datos.length; i++) {
    const celda = ws[XLSX.utils.encode_cell({ r: i + 1, c: 0 })]
    if (celda) celda.t = 's'
  }

  ws['!cols'] = [{ wch: 14 }, { wch: 50 }, { wch: 10 }]
  return ws
}

// Un remito = un archivo, una sola hoja.
export function exportarRemitoExcel(nombreRemito, filas) {
  const wb = XLSX.utils.book_new()
  const ws = construirHojaRemito(filas)
  XLSX.utils.book_append_sheet(wb, ws, nombreHojaSeguro(nombreRemito))
  XLSX.writeFile(wb, `${nombreHojaSeguro(nombreRemito)}.xlsx`)
}

// Todos los remitos = un archivo, una hoja por remito (mismo criterio
// que "hojas operativas simples" de Aris -- cada hoja se imprime o se
// entrega por separado para el picking de esa tanda).
export function exportarTodosLosRemitosExcel(remitos) {
  const wb = XLSX.utils.book_new()
  const usados = new Set()

  for (const { nombre, filas } of remitos) {
    let nombreHoja = nombreHojaSeguro(nombre)
    let sufijo = 2
    while (usados.has(nombreHoja)) {
      nombreHoja = `${nombreHojaSeguro(nombre).slice(0, 28)}-${sufijo}`
      sufijo++
    }
    usados.add(nombreHoja)
    XLSX.utils.book_append_sheet(wb, construirHojaRemito(filas), nombreHoja)
  }

  const hoy = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `remitos-reposicion-${hoy}.xlsx`)
}
