# Dentalab-Compras — frontend

App web de compras y stock de Dentalab, integrada con el ERP YiQi. Producción: https://dentalab-compras.vercel.app

El estado del proyecto, la arquitectura y los pendientes están en `../CLAUDE.md`. Este archivo solo cubre el frontend.

## Stack [repo 2026-10-18, `package.json`]

- React 19, Vite 8 y Tailwind 4 (`@tailwindcss/vite`).
- `@supabase/supabase-js` 2: autenticación y lectura de las tablas propias. El frontend nunca llama a YiQi directo.
- `@tabler/icons-webfont` 3.31: íconos del menú y de los botones, los mismos del prototipo v7.
- `jspdf` 4 y `jspdf-autotable` 5: el PDF que se descarga al enviar por WhatsApp.
- `xlsx` 0.18: exporta remitos a Excel. Tiene una vulnerabilidad conocida sin arreglo en npm, que solo afecta a la lectura de archivos; la app solo escribe Excel.

## Dos aplicaciones en el mismo build

- `src/App.jsx`: Compras / Stock (Aris e Ivana). Navegación por estado (`currentPage`), sin router. `?page=<clave>` abre una pantalla y `?page=ocs&orden=N` abre una sola orden.
- `src/AppDeposito.jsx`: cuentas de depósito (Central y Local), con su propio menú y su propia Ayuda.

## Estilos

- `src/index.css` tiene las clases del prototipo v7: `.ph`, `.btn*`, `.chip*`, `.pill-*`, `.card-*`, `.bloque-*`, `.tw` / `.tabla`, `.pasos`, `.metricas`, `.pagina` e `.info-ayuda`.
- Las clases sin capa le ganan a las utilidades de Tailwind (que viven en capas): para pisarlas hace falta el modificador `!`.
- Hasta 1700 px de ancho, las celdas son más compactas y los botones marcados `.btn-lbl-compacto` quedan solo con su ícono. `.tabla-acciones` deja fija la última columna.
- `src/pages/Ayuda.jsx` describe cada pantalla. Hay que actualizarlo a mano cuando una pantalla cambia (última revisión: 23/10/2026).

## Comandos (PowerShell)

```powershell
cd C:\dentalab-compras\frontend
npm install
npm run dev      # desarrollo local
npm run build    # build de producción
npm run lint
```

## Deploy

El push a `main` despliega solo en Vercel. `vercel --prod` desde esta carpeta falla ("Could not retrieve Project Settings"). [en vivo 2026-10-02]
