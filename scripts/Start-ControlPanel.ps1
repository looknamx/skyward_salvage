param([int]$Port = 3010)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$runtimeDir = Join-Path $projectRoot '.tunnel'
$stateFile = Join-Path $runtimeDir 'panel-state.json'
try {
    $health = Invoke-RestMethod "http://127.0.0.1:$Port/health" -TimeoutSec 2
    if ($health.service -eq 'skyward-control-panel') { Write-Host "Control panel already running: http://localhost:$Port"; return }
} catch {}
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw "Port $Port is in use by another application." }
$node = (Get-Command node -ErrorAction Stop).Source
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
$panel = Start-Process -FilePath $node -ArgumentList 'scripts/control-panel.mjs', "$Port" -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'panel.out.log') -RedirectStandardError (Join-Path $runtimeDir 'panel.err.log') -PassThru
@{pid=$panel.Id; started=$panel.StartTime.ToUniversalTime().Ticks.ToString(); port=$Port} | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8
for ($i=0; $i -lt 20; $i++) {
    try { $health = Invoke-RestMethod "http://127.0.0.1:$Port/health" -TimeoutSec 2; if ($health.service -eq 'skyward-control-panel') { Write-Host "Bookmark this control panel: http://localhost:$Port"; return } } catch {}
    Start-Sleep -Milliseconds 500
}
throw 'Control panel did not start. Check .tunnel\panel.err.log.'
