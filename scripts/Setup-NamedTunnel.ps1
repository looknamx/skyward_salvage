param(
    [Parameter(Mandatory=$true)][string]$Hostname,
    [string]$Name = 'skyward-salvage',
    [int]$Port = 3001
)
$ErrorActionPreference = 'Stop'
$Hostname = $Hostname.Trim().ToLowerInvariant()
if ($Hostname -notmatch '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$') {
    throw 'Supply a DNS hostname, for example game.example.com, without https:// or a path.'
}
if ($Name -notmatch '^[a-zA-Z0-9-]+$') { throw 'Tunnel name must contain only letters, digits and hyphens.' }
if ($Port -lt 1 -or $Port -gt 65535) { throw 'Port must be between 1 and 65535.' }
$projectRoot = Split-Path $PSScriptRoot -Parent
$runtimeDir = Join-Path $projectRoot '.tunnel'
$cloudflared = (Get-Command cloudflared -ErrorAction Stop).Source
$certPath = Join-Path $env:USERPROFILE '.cloudflared\cert.pem'
if (!(Test-Path -LiteralPath $certPath)) {
    & $cloudflared tunnel login
    if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $certPath)) { throw 'Complete Cloudflare login and authorize the domain before running setup again.' }
}
$rawList = & $cloudflared tunnel list --output json
if ($LASTEXITCODE -ne 0) { throw 'Cannot list Cloudflare tunnels.' }
$matchesByName = @(($rawList -join "`n" | ConvertFrom-Json) | Where-Object { $_.name -eq $Name })
if ($matchesByName.Count -gt 1) { throw 'Multiple tunnels have this name. Choose a unique name.' }
if ($matchesByName.Count -eq 0) {
    & $cloudflared tunnel create $Name
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the named tunnel.' }
    $rawList = & $cloudflared tunnel list --output json
    if ($LASTEXITCODE -ne 0) { throw 'Cannot read the newly created tunnel.' }
    $matchesByName = @(($rawList -join "`n" | ConvertFrom-Json) | Where-Object { $_.name -eq $Name })
}
if ($matchesByName.Count -ne 1) { throw 'Named tunnel was not found.' }
$tunnelId = [string]$matchesByName[0].id
if ($tunnelId -notmatch '^[0-9a-fA-F-]{36}$') { throw 'Unexpected tunnel ID.' }
$credentials = Join-Path $env:USERPROFILE ".cloudflared\$tunnelId.json"
if (!(Test-Path -LiteralPath $credentials)) { throw 'Local credentials for this tunnel are missing. Use the computer that created it or choose a new tunnel name.' }
# Do not overwrite an existing DNS record: cloudflared reports a conflict instead.
& $cloudflared tunnel route dns $tunnelId $Hostname
if ($LASTEXITCODE -ne 0) { throw 'DNS route failed. Check that the domain is active in this account and the hostname is not already used.' }
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
$credentialsYaml = $credentials.Replace('\', '/').Replace("'", "''")
$configPath = Join-Path $runtimeDir 'named-tunnel.yml'
@"
tunnel: $tunnelId
credentials-file: '$credentialsYaml'
ingress:
  - hostname: $Hostname
    service: http://127.0.0.1:$Port
  - service: http_status:404
"@ | Set-Content -LiteralPath $configPath -Encoding UTF8
& $cloudflared tunnel --config $configPath ingress validate
if ($LASTEXITCODE -ne 0) { throw 'Invalid tunnel configuration.' }
@{id=$tunnelId; name=$Name; hostname=$Hostname; port=$Port} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtimeDir 'named-tunnel.json') -Encoding UTF8
Write-Host "Named tunnel configured: https://$Hostname"
Write-Host 'Start with scripts\Start-Tunnel.ps1. Credentials and local configuration are excluded from Git.'
