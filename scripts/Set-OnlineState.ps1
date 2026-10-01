param([Parameter(Mandatory=$true)][ValidateSet('start','stop')][string]$Action)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'Stop-Tunnel.ps1')
if ($Action -eq 'start') {
    try { & (Join-Path $PSScriptRoot 'Start-Online.ps1') }
    catch {
        & (Join-Path $PSScriptRoot 'Stop-Tunnel.ps1')
        throw
    }
}
