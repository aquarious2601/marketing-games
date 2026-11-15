<#
.SYNOPSIS
    Starts a game's API and web dev servers, each in its own window.

.DESCRIPTION
    The frontend proxies /api to the backend, so both need to be running for
    the app to work. Close the two windows to stop them.

.PARAMETER Game
    Game folder to run. Defaults to roulette.

.PARAMETER ApiPort
    Port for the Symfony dev server. Defaults to 8000.

.PARAMETER WebPort
    Port for the Vite dev server. Defaults to 5173.

.EXAMPLE
    .\dev.ps1
    .\dev.ps1 -Game roulette -ApiPort 8001
#>
[CmdletBinding()]
param(
    [string] $Game = 'roulette',
    [int]    $ApiPort = 8000,
    [int]    $WebPort = 5173
)

$backend = Join-Path $PSScriptRoot "$Game\backend"
$frontend = Join-Path $PSScriptRoot "$Game\frontend"

if (-not (Test-Path $backend)) {
    Write-Host ("No backend at {0}" -f $backend) -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $frontend)) {
    Write-Host ("No frontend at {0}" -f $frontend) -ForegroundColor Red
    exit 1
}

Write-Host ('Starting the {0} API on port {1}...' -f $Game, $ApiPort) -ForegroundColor Cyan
Start-Process -FilePath 'php' `
              -ArgumentList @('-S', "127.0.0.1:$ApiPort", '-t', 'public', 'public/index.php') `
              -WorkingDirectory $backend

# Tells Vite where to forward /api, so a non-default API port still works.
$env:VITE_DEV_API_TARGET = "http://127.0.0.1:$ApiPort"

Write-Host ('Starting the {0} web app on port {1}...' -f $Game, $WebPort) -ForegroundColor Cyan
Start-Process -FilePath 'npm.cmd' `
              -ArgumentList @('run', 'dev', '--', '--port', "$WebPort", '--strictPort') `
              -WorkingDirectory $frontend

Write-Host ''
Write-Host ('  App  http://localhost:{0}' -f $WebPort) -ForegroundColor Green
Write-Host ('  API  http://127.0.0.1:{0}/api/health' -f $ApiPort) -ForegroundColor Green
Write-Host ''
Write-Host 'Close the two new windows to stop the servers.'
