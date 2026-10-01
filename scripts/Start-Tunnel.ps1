param([switch]$SkipBuild, [int]$Port = 3001)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$runtimeDir = Join-Path $projectRoot '.tunnel'
$stateFile = Join-Path $runtimeDir 'state.json'
$namedFile = Join-Path $runtimeDir 'named-tunnel.json'
$namedConfig = Join-Path $runtimeDir 'named-tunnel.yml'
$named = $null
if (Test-Path -LiteralPath $namedFile) {
    $named = Get-Content -LiteralPath $namedFile -Raw | ConvertFrom-Json
    if (!$PSBoundParameters.ContainsKey('Port')) { $Port = [int]$named.port }
    if ($Port -ne [int]$named.port) { throw 'Named tunnel port differs. Run Setup-NamedTunnel.ps1 again with the desired -Port.' }
    if (!(Test-Path -LiteralPath $namedConfig)) { throw 'Named tunnel configuration is missing. Run Setup-NamedTunnel.ps1 again.' }
}

if (Test-Path -LiteralPath $stateFile) {
    $previous = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    $running = Get-Process -Id $previous.tunnelPid -ErrorAction SilentlyContinue
    if ($running -and $running.StartTime.ToUniversalTime().Ticks.ToString() -eq $previous.tunnelStart) {
        Write-Host "Tunnel already running: $($previous.url)"
        return
    }
    throw 'Previous session exists. Run scripts\Stop-Tunnel.ps1 before starting again.'
}
$nodePath = (Get-Command node -ErrorAction Stop).Source
$tunnelPath = (Get-Command cloudflared -ErrorAction Stop).Source
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    throw "Port $Port is already in use. Choose another port with -Port."
}
Push-Location $projectRoot
try {
    if (!$SkipBuild) {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Game build failed.' }
    }
    if (!(Test-Path -LiteralPath (Join-Path $projectRoot 'dist\index.html'))) { throw 'Build the game first.' }
    New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
    $oldPort = $env:PORT
    $oldOrigins = $env:ALLOWED_ORIGINS
    try {
        $env:PORT = "$Port"
        $env:ALLOWED_ORIGINS = ''
        $game = Start-Process -FilePath $nodePath -ArgumentList '--import', 'tsx', 'server/index.ts' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'server.out.log') -RedirectStandardError (Join-Path $runtimeDir 'server.err.log') -PassThru
    } finally { $env:PORT = $oldPort; $env:ALLOWED_ORIGINS = $oldOrigins }
    $state = [ordered]@{serverPid=$game.Id; serverStart=$game.StartTime.ToUniversalTime().Ticks.ToString(); tunnelPid=0; tunnelStart=''; port=$Port; url=''}
    $state | ConvertTo-Json | Set-Content -LiteralPath $stateFile
    $healthy = $false
    for ($i=0; $i -lt 30; $i++) {
        try { $health = Invoke-RestMethod "http://127.0.0.1:$Port/health" -TimeoutSec 2; if ($health.ok) { $healthy=$true; break } } catch {}
        Start-Sleep -Milliseconds 500
    }
    if (!$healthy) { throw 'Game server did not start. Check .tunnel\server.err.log and run Stop-Tunnel.ps1.' }
    $tunnelArgs = @('tunnel', '--no-autoupdate', '--url', "http://127.0.0.1:$Port")
    if ($named) {
        & $tunnelPath tunnel --config $namedConfig ingress validate
        if ($LASTEXITCODE -ne 0) { throw 'Named tunnel configuration is invalid. Run Stop-Tunnel.ps1 and correct the configuration.' }
        $tunnelArgs = @('tunnel', '--no-autoupdate', '--config', ('"' + $namedConfig + '"'), 'run', [string]$named.id)
    }
    $tunnel = Start-Process -FilePath $tunnelPath -ArgumentList $tunnelArgs -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'tunnel.out.log') -RedirectStandardError (Join-Path $runtimeDir 'tunnel.err.log') -PassThru
    $state.tunnelPid=$tunnel.Id
    $state.tunnelStart=$tunnel.StartTime.ToUniversalTime().Ticks.ToString()
    $state | ConvertTo-Json | Set-Content -LiteralPath $stateFile
    for ($i=0; $i -lt 90; $i++) {
        $log = [string](Get-Content -LiteralPath (Join-Path $runtimeDir 'tunnel.err.log') -Raw -ErrorAction SilentlyContinue) + [string](Get-Content -LiteralPath (Join-Path $runtimeDir 'tunnel.out.log') -Raw -ErrorAction SilentlyContinue)
        $tunnel.Refresh()
        if ($tunnel.HasExited) { throw 'Cloudflare tunnel exited. Check .tunnel\tunnel.err.log and run Stop-Tunnel.ps1.' }
        $detectedUrl = ''
        if ($named) {
            if ($log -match 'Registered tunnel connection') { $detectedUrl = "https://$($named.hostname)" }
        } elseif ($log -match 'https://[a-z0-9-]+\.trycloudflare\.com') { $detectedUrl = $Matches[0] }
        if ($detectedUrl) {
            $state.url=$detectedUrl
            $state | ConvertTo-Json | Set-Content -LiteralPath $stateFile
            $state.url | Set-Content -LiteralPath (Join-Path $runtimeDir 'url.txt')
            Write-Host "Share this game URL: $($state.url)"
            Write-Host 'Keep this computer awake. To stop: scripts\Stop-Tunnel.ps1'
            return
        }
        Start-Sleep -Milliseconds 500
    }
    throw 'Tunnel URL was not received. Check .tunnel\tunnel.err.log and run Stop-Tunnel.ps1.'
} finally { Pop-Location }
