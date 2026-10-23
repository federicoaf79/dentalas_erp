# ============================================================
# yiqi-renovar-token.ps1
# ============================================================
# Regenera el access_token + refresh_token de YiQi desde cero
# (grant_type=password) y prepara el UPDATE para yiqi_config.
#
# COMO USARLO:
#   1. La clave NO va en este archivo (estaba trackeada en git; sacada
#      el 23/10/2026). Cargala solo en la consola donde lo vas a correr:
#        $env:YIQI_CLAVE = "<la clave de ventas@dentalab.com.ar>"
#      $usuario sigue siendo la cuenta de integracion de siempre.
#   2. Correlo: .\yiqi-renovar-token.ps1
#   3. El UPDATE queda copiado al portapapeles solo -- no se
#      imprime en pantalla. Pegalo en el SQL Editor de Supabase
#      y ejecutalo.
#   4. Cerra la consola al terminar (la variable YIQI_CLAVE muere con
#      ella). No pegues la clave en el chat ni en ningun archivo.
# ============================================================

$usuario = "ventas@dentalab.com.ar"
$clave   = if ($env:YIQI_CLAVE) { $env:YIQI_CLAVE } else { "COMPLETAR_ACA" }

if ($clave -eq "COMPLETAR_ACA") {
    Write-Host "Falta la clave: corre antes `$env:YIQI_CLAVE = ""..."" en esta misma consola." -ForegroundColor Red
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
