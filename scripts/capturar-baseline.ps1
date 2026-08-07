# capturar-baseline.ps1 - Dentalab-Compras
# Captura el esquema REAL de produccion como migration versionada.
# Requiere: Supabase CLI instalado y el proyecto linkeado (supabase/.temp/project-ref ya existe).
# Correr desde la raiz del repo: .\scripts\capturar-baseline.ps1

$ErrorActionPreference = 'Stop'
$stamp = Get-Date -Format 'yyyyMMddHHmmss'
$dest  = "supabase\migrations\${stamp}_baseline.sql"

Write-Host "1/3  Verificando link del proyecto..." -ForegroundColor Cyan
supabase projects list

Write-Host "2/3  Volcando esquema (sin datos)..." -ForegroundColor Cyan
# --schema public y auth: las policies de RLS viven en public, los triggers de auth aparte.
supabase db dump --linked --schema public -f $dest

Write-Host "3/3  Volcando roles y policies..." -ForegroundColor Cyan
supabase db dump --linked --role-only -f "supabase\migrations\${stamp}_roles.sql"

Write-Host ""
Write-Host "Listo. Revisar antes de commitear:" -ForegroundColor Green
Write-Host "  $dest"
Write-Host ""
Write-Host "IMPORTANTE: los 3 cron jobs de pg_cron NO salen en db dump." -ForegroundColor Yellow
Write-Host "Capturarlos aparte con esta query en el SQL Editor y pegarla como migration:" -ForegroundColor Yellow
Write-Host "  select jobid, schedule, jobname, command, active from cron.job order by jobid;"
