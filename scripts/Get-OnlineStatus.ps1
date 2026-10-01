$ErrorActionPreference = 'Stop'
$runtimeDir = Join-Path (Split-Path $PSScriptRoot -Parent) '.tunnel'
function Read-State($name) {
    try { Get-Content -LiteralPath (Join-Path $runtimeDir $name) -Raw | ConvertFrom-Json } catch { return $null }
}
function Is-Running($id, $started) {
    if (!$id -or !$started) { return $false }
    $process = Get-Process -Id $id -ErrorAction SilentlyContinue
    return [bool]($process -and $process.StartTime.ToUniversalTime().Ticks.ToString() -eq $started)
}
$game = Read-State 'state.json'
$gateway = Read-State 'gateway-state.json'
$config = Read-State 'gateway.json'
$serverRunning = Is-Running $game.serverPid $game.serverStart
$cloudflareRunning = Is-Running $game.tunnelPid $game.tunnelStart
$gatewayRunning = Is-Running $gateway.gatewayPid $gateway.gatewayStart
$ngrokRunning = Is-Running $gateway.ngrokPid $gateway.ngrokStart
$healthy = $false
if ($serverRunning) {
    try { $healthy = [bool](Invoke-RestMethod "http://127.0.0.1:$($game.port)/health" -TimeoutSec 2).ok } catch {}
}
$publicReady = $false
if ($healthy -and $cloudflareRunning -and $gatewayRunning -and $ngrokRunning) {
    try { $publicReady = [bool](Invoke-RestMethod "$($game.url)/health" -TimeoutSec 2).ok } catch {}
}
@{
    online = [bool]($healthy -and $cloudflareRunning -and $gatewayRunning -and $ngrokRunning -and $publicReady)
    partial = [bool]($serverRunning -or $cloudflareRunning -or $gatewayRunning -or $ngrokRunning)
    url = $(if ($config.hostname -match '^[a-z0-9-]+\.ngrok-free\.(dev|app)$') { "https://$($config.hostname)" } else { '' })
    services = @{game=[bool]$healthy; cloudflare=$cloudflareRunning; gateway=$gatewayRunning; ngrok=$ngrokRunning}
} | ConvertTo-Json -Compress
