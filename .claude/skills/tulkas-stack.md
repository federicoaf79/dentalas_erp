---
name: tulkas-stack
description: >
  Stack técnico y convenciones compartidas por todos los proyectos de Tulkas Media.
  Activar en cualquier tarea de desarrollo para cualquier proyecto del ecosistema.
  Contiene las reglas no negociables y los patrones establecidos.
---

# Tulkas Stack — Convenciones del Ecosistema

## Stack base (todos los proyectos web)
- Frontend: React + Vite + Tailwind CSS
- Backend: Supabase (PostgreSQL + Auth + Storage + Realtime)
- Deploy: Vercel (frontend) + Supabase (backend)
- DNS: Cloudflare
- Email: Resend
- Control de versiones: GitHub

## Reglas no negociables

### Supabase
- Toda tabla nueva necesita migration file versionado en `supabase/migrations/`
- Nunca `USING (true)` en políticas RLS — siempre filtrar por tenant/user
- fetchAllPaginated para queries que pueden superar 1000 rows
- Siempre manejar el error de Supabase: `const { data, error } = await ...; if (error) throw error`

### React / Frontend
- No hardcodear datos que deberían venir de la DB
- Estados de loading y error siempre implementados en pantallas principales
- Validación de formularios antes de enviar a Supabase
- No dejar console.log en código que va a producción
- Paleta sin verde (regla de diseño Tulkas): usar cobre #B8712E como acento

### Git
- Commits en formato: tipo(scope): descripción en presente
- Tipos: fix, feat, docs, refactor, chore, test
- Nunca commitear .env o secrets
- Un PR / feature por branch

### Seguridad
- API keys siempre en variables de entorno
- Nunca en código, nunca en historial de git
- Si hay keys en historial: rotar inmediatamente y limpiar con BFG

## Proyectos del ecosistema

| ID | Nombre | Repo | Local | Estado |
|---|---|---|---|---|
| comunas | Comunas ERP | federicoaf79/comunas-app | C:\Users\ffrey\comunas-app | PROD |
| oohplanner | OOH Planner | federicoaf79/oohplanner-app | C:\oohplanner-app | PROD |
| tolrank | Tolrank | federicoaf79/ai-audit-web | C:\Users\ffrey\ai-audit-web | PROD |
| curex | Curex | federicoaf79/curex-alpha | C:\Curex | DEV |
| planb | Plan-B | PlanB1205/plan-b-backend | C:\plan-b-backend | PAUSA |
| urbantales | Urban Tales | federicoaf79/urban-tales | C:\UrbanTales | DEV |
| dentalab | Dentalab-Compras | federicoaf79/dentalab-compras | C:\dentalab-compras | NUEVO |

## Cuentas y accesos
- GitHub principal: federicoaf79
- GitHub Plan-B: PlanB1205
- Vercel: federicoaf79 (curex, oohplanner, comunas) + contacto-5166 (Plan-B)
- Supabase TulkasOS: fbcuspqkmpqtotwajqnq.supabase.co
- MCP Server: localhost:3100
- Backend TulkasOS: localhost:3101

## FreyHub — módulos reutilizables
Repo: federicoaf79/federico-packages (C:\Users\ffrey\federico-packages)
Es un reservorio de copy-paste — NO una dependencia npm.

Módulos disponibles:
- @federico/utils — helpers de formato, cn(), datetime Argentina TZ
- @federico/supabase — cliente principal + fetchAllPaginated
- @federico/email — Resend
- @federico/whatsapp-web-sender — Puppeteer WhatsApp (puerto 3099)

Uso: copiar el código del módulo al proyecto, NO instalar como npm package.
