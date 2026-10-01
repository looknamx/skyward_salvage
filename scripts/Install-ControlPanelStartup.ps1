$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$startupDir = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupDir 'Skyward Salvage Control Panel.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$powershellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
if ((Test-Path -LiteralPath $shortcutPath) -and $shortcut.Description -ne 'Skyward Salvage local game controls') {
    throw 'A different startup shortcut already uses this name. No change was made.'
}
$shortcut.TargetPath = $powershellPath
$shortcut.Arguments = '-WindowStyle Hidden -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + (Join-Path $PSScriptRoot 'Start-ControlPanel.ps1') + '"'
$shortcut.WorkingDirectory = $projectRoot
$shortcut.WindowStyle = 7
$shortcut.Description = 'Skyward Salvage local game controls'
$shortcut.Save()
Write-Host 'Control panel will start at Windows sign-in. The game itself stays off until you click Start.'
& (Join-Path $PSScriptRoot 'Start-ControlPanel.ps1')
