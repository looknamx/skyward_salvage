param(
    [string]$Hostname,
    [switch]$SkipBuild,
    [int]$Port = 3001,
    [int]$GatewayPort = 3003
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$runtimeDir = Join-Path $projectRoot '.tunnel'
$configFile = Join-Path $runtimeDir 'gateway.json'
$gatewayStateFile = Join-Path $runtimeDir 'gateway-state.json'
if (!$Hostname -and (Test-Path -LiteralPath $configFile)) {
    $Hostname = (Get-Content -LiteralPath $configFile -Raw | ConvertFrom-Json).hostname
}
if (!$Hostname) { throw 'Supply -Hostname with your assigned ngrok domain the first time.' }
$Hostname = $Hostname.Trim().ToLowerInvariant()
if ($Hostname -notmatch '^[a-z0-9-]+\.ngrok-free\.(dev|app)$') { throw 'Supply the assigned ngrok-free.dev or ngrok-free.app hostname without https://.' }
if ($GatewayPort -lt 1 -or $GatewayPort -gt 65535 -or $GatewayPort -eq $Port) { throw 'Choose a valid, separate gateway port.' }
if (Test-Path -LiteralPath (Join-Path $runtimeDir 'named-tunnel.json')) { throw 'This redirect setup uses Quick Tunnel. A Named Tunnel configuration is already present.' }
if (Test-Path -LiteralPath $gatewayStateFile) {
    $previous = Get-Content -LiteralPath $gatewayStateFile -Raw | ConvertFrom-Json
    $running = Get-Process -Id $previous.ngrokPid -ErrorAction SilentlyContinue
    if ($running -and $running.StartTime.ToUniversalTime().Ticks.ToString() -eq $previous.ngrokStart) {
        Write-Host "Online gateway already running: $($previous.url)"
        return
    }
    throw 'Previous gateway session exists. Run scripts\Stop-Tunnel.ps1 before starting again.'
}
$node = (Get-Command node -ErrorAction Stop).Source
$ngrok = (Get-Command ngrok -ErrorAction Stop).Source
& $ngrok config check
if ($LASTEXITCODE -ne 0) { throw 'Configure your ngrok authtoken before starting.' }
if (Get-NetTCPConnection -LocalPort $GatewayPort -State Listen -ErrorAction SilentlyContinue) { throw "Gateway port $GatewayPort is already in use." }
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
@{hostname=$Hostname} | ConvertTo-Json | Set-Content -LiteralPath $configFile -Encoding UTF8
& (Join-Path $PSScriptRoot 'Start-Tunnel.ps1') -Port $Port -SkipBuild:$SkipBuild
$gateway = Start-Process -FilePath $node -ArgumentList 'scripts/redirect-server.mjs', "$GatewayPort" -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'gateway.out.log') -RedirectStandardError (Join-Path $runtimeDir 'gateway.err.log') -PassThru
$state = [ordered]@{gatewayPid=$gateway.Id; gatewayStart=$gateway.StartTime.ToUniversalTime().Ticks.ToString(); ngrokPid=0; ngrokStart=''; port=$GatewayPort; url="https://$Hostname"}
$state | ConvertTo-Json | Set-Content -LiteralPath $gatewayStateFile -Encoding UTF8
try {
    $healthy = $false
    for ($i=0; $i -lt 20; $i++) {
        try { $health = Invoke-RestMethod "http://127.0.0.1:$GatewayPort/_gateway/health" -TimeoutSec 2; if ($health.service -eq 'skyward-redirect') { $healthy=$true; break } } catch {}
        Start-Sleep -Milliseconds 500
    }
    if (!$healthy) { throw 'Redirect gateway did not start.' }
    $agent = Start-Process -FilePath $ngrok -ArgumentList 'http', "http://127.0.0.1:$GatewayPort", '--url', $state.url, '--log', 'stdout', '--log-format', 'json' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'ngrok.out.log') -RedirectStandardError (Join-Path $runtimeDir 'ngrok.err.log') -PassThru
    $state.ngrokPid = $agent.Id
    $state.ngrokStart = $agent.StartTime.ToUniversalTime().Ticks.ToString()
    $state | ConvertTo-Json | Set-Content -LiteralPath $gatewayStateFile -Encoding UTF8
    for ($i=0; $i -lt 45; $i++) {
        $agent.Refresh()
        if ($agent.HasExited) { throw 'ngrok exited. Check .tunnel\ngrok.err.log and ngrok.out.log. Your account needs a valid authtoken and this assigned domain.' }
        try {
            $publicHealth = Invoke-RestMethod "$($state.url)/_gateway/health" -Headers @{'ngrok-skip-browser-warning'='1'} -TimeoutSec 3
            if ($publicHealth.service -eq 'skyward-redirect') {
                $gameState = Get-Content -LiteralPath (Join-Path $runtimeDir 'state.json') -Raw | ConvertFrom-Json
                $gameHealth = Invoke-RestMethod "$($gameState.url)/health" -TimeoutSec 3
                if (!$gameHealth.ok) { throw 'Waiting for the public game endpoint.' }
                $state.url | Set-Content -LiteralPath (Join-Path $runtimeDir 'share-url.txt') -Encoding UTF8
                Write-Host "Share this permanent entry URL: $($state.url)"
                Write-Host 'Start again: scripts\Start-Online.ps1. Stop all: scripts\Stop-Tunnel.ps1'
                return
            }
        } catch {}
        Start-Sleep -Milliseconds 500
    }
    throw 'Public ngrok gateway could not be reached yet. Check .tunnel logs.'
} catch {
    # Only clean up gateway processes started in this invocation; leave the game
    # and Cloudflare available for diagnosis or direct play.
    foreach ($entry in @(@{id=$state.ngrokPid; started=$state.ngrokStart}, @{id=$state.gatewayPid; started=$state.gatewayStart})) {
        if ($entry.id -le 0) { continue }
        $process = Get-Process -Id $entry.id -ErrorAction SilentlyContinue
        if ($process -and $process.StartTime.ToUniversalTime().Ticks.ToString() -eq $entry.started) { Stop-Process -Id $process.Id }
    }
    Remove-Item -LiteralPath $gatewayStateFile -ErrorAction SilentlyContinue
    throw
}
