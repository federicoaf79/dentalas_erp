# ============================================================
# yiqi-renovar-token.ps1
# ============================================================
# Regenera el access_token + refresh_token de YiQi desde cero
# (grant_type=password) y prepara el UPDATE para yiqi_config.
#
# COMO USARLO:
#   1. Completa $usuario y $clave abajo (cuenta de integracion,
#      la misma de siempre: ventas@dentalab.com.ar).
#   2. Correlo: .\yiqi-renovar-token.ps1
#   3. El UPDATE queda copiado al portapapeles solo -- no se
#      imprime en pantalla. Pegalo en el SQL Editor de Supabase
#      y ejecutalo.
#   4. Borra la contraseña de este archivo (o borra el archivo
#      entero) apenas termines. No lo compartas ni lo pegues en
#      el chat -- nadie mas necesita verlo.
# ============================================================

$usuario = "ventas@dentalab.com.ar"
$clave   = "Unproducto345"

if ($clave -eq "COMPLETAR_ACA") {
    Write-Host "Falta completar la contraseña en la linea `$clave` antes de correr esto." -ForegroundColor Red
    exit 1
}

$body = @{
    grant_type = "password"
    username   = $usuario
    password   = $clave
}

try {
    $resp = Invoke-RestMethod -Uri "https://api.yiqi.com.ar/token" -Method Post -Body $body -ContentType "application/x-www-form-urlencoded"
} catch {
    Write-Host "YiQi rechazo el pedido de token:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}

if (-not $resp.access_token -or -not $resp.refresh_token -or -not $resp.expires_in) {
    Write-Host "La respuesta de YiQi no tiene la forma esperada (falta access_token/refresh_token/expires_in)." -ForegroundColor Red
    $resp | ConvertTo-Json
    exit 1
}

Write-Host "OK -- token nuevo obtenido." -ForegroundColor Green
Write-Host ("  access_token:  {0} caracteres" -f $resp.access_token.Length)
Write-Host ("  refresh_token: {0} caracteres" -f $resp.refresh_token.Length)
Write-Host ("  expires_in:    {0} segundos" -f $resp.expires_in)

# El vencimiento se calcula en el propio SQL (now() + intervalo), no en
# PowerShell -- evita cualquier lio de zona horaria entre tu maquina y
# la base.
$sql = @"
update yiqi_config
set bearer_token = '$($resp.access_token)',
    refresh_token = '$($resp.refresh_token)',
    token_expira_en = now() + interval '$($resp.expires_in) seconds',
    refresh_lock_hasta = null
where id = (select id from yiqi_config order by created_at desc limit 1)
returning id, token_expira_en;
"@

$sql | Set-Clipboard

Write-Host ""
Write-Host "Listo. El UPDATE quedo copiado al portapapeles (no se muestra en pantalla)." -ForegroundColor Cyan
Write-Host "Pegalo en el SQL Editor de Supabase y ejecutalo. Despues borra la contraseña de este archivo."
