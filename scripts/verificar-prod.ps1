# verificar-prod.ps1 - Dentalab-Compras
# Cierra los items [sin verificar] de la reconciliacion del 5/8/2026.
# Correr desde la raiz del repo: .\scripts\verificar-prod.ps1

$ErrorActionPreference = 'Continue'

$env_file = ".env"
$URL  = ((Get-Content $env_file | Where-Object { $_ -match '^VITE_SUPABASE_URL=' }) -replace '^VITE_SUPABASE_URL=','').Trim().Trim('"').Trim("'")
$ANON = ((Get-Content $env_file | Where-Object { $_ -match '^VITE_SUPABASE_ANON_KEY=' }) -replace '^VITE_SUPABASE_ANON_KEY=','').Trim().Trim('"').Trim("'")

if (-not $URL -or -not $ANON) { Write-Host "No pude leer URL/ANON de .env" -ForegroundColor Red; exit 1 }
$H = @{ apikey = $ANON; Authorization = "Bearer $ANON" }

Write-Host "=== 1. C-2: existe la tabla proveedores? ===" -ForegroundColor Cyan
try {
  $spec = Invoke-RestMethod -Uri "$URL/rest/v1/" -Headers $H -TimeoutSec 30
  $tablas = $spec.definitions.PSObject.Properties.Name | Sort-Object
  Write-Host ("Tablas/vistas expuestas ({0}):" -f $tablas.Count)
  $tablas | ForEach-Object { Write-Host "   $_" }
  if ($tablas -contains 'proveedores') {
    Write-Host "-> proveedores EXISTE. C-2 se resuelve a favor del MD." -ForegroundColor Green
  } else {
    Write-Host "-> proveedores NO aparece. C-2 se resuelve a favor de Tulkas." -ForegroundColor Yellow
  }
} catch { Write-Host "ERROR: $_" -ForegroundColor Red }

Write-Host ""
Write-Host "=== 2. C-1 (lo mas importante): las Edge Functions atienden con SOLO la anon key? ===" -ForegroundColor Cyan
Write-Host "    Sin sesion de usuario. Si responden 200, cualquiera con la key publica entra." -ForegroundColor DarkGray
foreach ($fn in @('yiqi-connector?entidad=CLIENTE&pageDesde=1&pageHasta=1','admin-usuarios')) {
  $nombre = $fn.Split('?')[0]
  try {
    $r = Invoke-WebRequest -Uri "$URL/functions/v1/$fn" -Headers $H -Method GET -TimeoutSec 45 -SkipHttpErrorCheck
    $col = if ($r.StatusCode -eq 200) { 'Red' } else { 'Green' }
    Write-Host ("   {0,-18} -> HTTP {1}" -f $nombre, $r.StatusCode) -ForegroundColor $col
    if ($r.StatusCode -eq 200) { Write-Host ("      CONFIRMADO ABIERTO. Primeros 200 chars: " + $r.Content.Substring(0,[Math]::Min(200,$r.Content.Length))) -ForegroundColor Red }
  } catch { Write-Host "   $nombre -> ERROR: $_" -ForegroundColor Yellow }
}

Write-Host ""
Write-Host "=== 3. Fase B: la RLS filtra de verdad? ===" -ForegroundColor Cyan
Write-Host "    Se loguea como IVANA (operadora, ve solo sus proveedores) y compara contra anonimo." -ForegroundColor DarkGray
$body = @{ email = 'ivana@dentalab-compras.demo'; password = 'Dentalab2026!' } | ConvertTo-Json
try {
  $auth = Invoke-RestMethod -Uri "$URL/auth/v1/token?grant_type=password" -Headers @{apikey=$ANON} -Method POST -Body $body -ContentType 'application/json' -TimeoutSec 30
  $HI = @{ apikey = $ANON; Authorization = "Bearer $($auth.access_token)"; Prefer = 'count=exact' }
  foreach ($t in @('material_yiqi','ordenes_yiqi','ventas_mensual_yiqi')) {
    $ra = Invoke-WebRequest -Uri "$URL/rest/v1/${t}?select=*&limit=1" -Headers (@{apikey=$ANON;Authorization="Bearer $ANON";Prefer='count=exact'}) -TimeoutSec 45 -SkipHttpErrorCheck
    $ri = Invoke-WebRequest -Uri "$URL/rest/v1/${t}?select=*&limit=1" -Headers $HI -TimeoutSec 45 -SkipHttpErrorCheck
    $ca = $ra.Headers['Content-Range']; $ci = $ri.Headers['Content-Range']
    Write-Host ("   {0,-22} anonimo={1,-12} ivana={2}" -f $t, $ca, $ci)
  }
  Write-Host "   Lectura: anonimo deberia dar 0 (o error). Ivana, un subconjunto - NO el total." -ForegroundColor DarkGray
} catch { Write-Host "   ERROR de login/consulta: $_" -ForegroundColor Yellow }

Write-Host ""
Write-Host "=== 4. Cron jobs activos ===" -ForegroundColor Cyan
Write-Host "   No sale por REST. Pegar en el SQL Editor:" -ForegroundColor DarkGray
Write-Host "     select jobid, jobname, schedule, active from cron.job order by jobid;"
Write-Host "   Esperado: jobid 3 (*/15), 4 (0 6 * * *), 5 (30 6 * * *), los tres active=true."

Write-Host ""
Write-Host "=== 5. yiqi_config: el token esta en claro? ===" -ForegroundColor Cyan
Write-Host "   Pegar en el SQL Editor (NO imprime el token, solo si esta en texto plano):" -ForegroundColor DarkGray
Write-Host "     select id, length(yiqi_bearer_token) as largo,"
Write-Host "            yiqi_bearer_token like 'ey%' as parece_jwt_plano from yiqi_config;"
