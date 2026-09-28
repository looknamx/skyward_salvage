$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$stateFile = Join-Path $projectRoot '.tunnel\state.json'
if (!(Test-Path -LiteralPath $stateFile)) { Write-Host 'No recorded tunnel session.'; return }
$state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
foreach ($entry in @(@{id=$state.tunnelPid; started=$state.tunnelStart}, @{id=$state.serverPid; started=$state.serverStart})) {
    if ($entry.id -le 0) { continue }
    $running = Get-Process -Id $entry.id -ErrorAction SilentlyContinue
    if ($running -and $running.StartTime.ToUniversalTime().Ticks.ToString() -eq $entry.started) {
        Stop-Process -Id $running.Id
    }
}
Remove-Item -LiteralPath $stateFile
Write-Host 'Game server and tunnel stopped.'
