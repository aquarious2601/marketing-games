<#
.SYNOPSIS
    Runs every test suite in this repository and fails if any of them fail.

.DESCRIPTION
    Walks each application folder and runs whatever suites it finds:
      backend/   -> PHPUnit
      frontend/  -> TypeScript typecheck, then Vitest

    The Playwright end-to-end suite is NOT part of a normal run. It takes
    minutes rather than seconds, so it is opt-in: pass -E2E.

    A second game needs no change here either: games live inside one
    application (P05), so this still finds one backend/ and one frontend/.

    Exits 0 only when every suite passed (F00 R12).

.PARAMETER App
    Limit the run to one application folder, e.g. -App app. -Game still
    works as an alias.

.PARAMETER SkipBackend
    Skip PHP suites.

.PARAMETER SkipFrontend
    Skip JavaScript suites.

.PARAMETER E2E
    Also run the Playwright end-to-end suite. Off by default: it starts real
    servers and a real browser and takes several minutes.

.EXAMPLE
    .\test-all.ps1
    .\test-all.ps1 -SkipBackend
#>
[CmdletBinding()]
param(
    [Alias('Game')]
    [string] $App,
    [switch] $SkipBackend,
    [switch] $SkipFrontend,
    [switch] $E2E
)

$repoRoot = $PSScriptRoot
$passed = New-Object System.Collections.Generic.List[string]
$failed = New-Object System.Collections.Generic.List[string]

function Invoke-Suite {
    param(
        [string]   $Name,
        [string]   $WorkingDirectory,
        [string]   $Executable,
        [string[]] $Arguments
    )

    Write-Host ''
    Write-Host ('--- {0} ---' -f $Name) -ForegroundColor Cyan

    Push-Location $WorkingDirectory
    try {
        & $Executable @Arguments
        $code = $LASTEXITCODE
    }
    catch {
        Write-Host $_.Exception.Message -ForegroundColor Red
        $code = 1
    }
    finally {
        Pop-Location
    }

    if ($code -eq 0) {
        $passed.Add($Name)
        Write-Host ('PASS  {0}' -f $Name) -ForegroundColor Green
    }
    else {
        $failed.Add($Name)
        Write-Host ('FAIL  {0}  (exit {1})' -f $Name, $code) -ForegroundColor Red
    }
}

$games = Get-ChildItem -Path $repoRoot -Directory |
    Where-Object { $_.Name -notmatch '^\.' } |
    Where-Object {
        (Test-Path (Join-Path $_.FullName 'backend')) -or
        (Test-Path (Join-Path $_.FullName 'frontend'))
    }

if ($App) {
    $games = $games | Where-Object { $_.Name -eq $App }

    if (-not $games) {
        Write-Host ("No application folder named '{0}'." -f $App) -ForegroundColor Red
        exit 1
    }
}

if (-not $games) {
    Write-Host 'No application folder with a backend/ or frontend/ was found.' -ForegroundColor Yellow
    exit 1
}

foreach ($g in $games) {
    $backend = Join-Path $g.FullName 'backend'
    $frontend = Join-Path $g.FullName 'frontend'

    if (-not $SkipBackend -and (Test-Path (Join-Path $backend 'vendor\bin\phpunit'))) {
        Invoke-Suite -Name ('{0} backend (phpunit)' -f $g.Name) `
                     -WorkingDirectory $backend `
                     -Executable 'php' `
                     -Arguments @('vendor/bin/phpunit')
    }

    if (-not $SkipFrontend -and (Test-Path (Join-Path $frontend 'package.json'))) {
        Invoke-Suite -Name ('{0} frontend (typecheck)' -f $g.Name) `
                     -WorkingDirectory $frontend `
                     -Executable 'npm' `
                     -Arguments @('run', 'typecheck')

        Invoke-Suite -Name ('{0} frontend (vitest)' -f $g.Name) `
                     -WorkingDirectory $frontend `
                     -Executable 'npm' `
                     -Arguments @('test')

        if ($E2E -and (Test-Path (Join-Path $frontend 'playwright.config.ts'))) {
            Invoke-Suite -Name ('{0} end-to-end (playwright)' -f $g.Name) `
                         -WorkingDirectory $frontend `
                         -Executable 'npm' `
                         -Arguments @('run', 'test:e2e')
        }
    }
}

Write-Host ''
Write-Host '=============== summary ===============' -ForegroundColor Cyan

foreach ($name in $passed) {
    Write-Host ('  PASS  {0}' -f $name) -ForegroundColor Green
}
foreach ($name in $failed) {
    Write-Host ('  FAIL  {0}' -f $name) -ForegroundColor Red
}

Write-Host ''
Write-Host ('{0} passed, {1} failed' -f $passed.Count, $failed.Count)

if (-not $E2E -and -not $SkipFrontend) {
    Write-Host ''
    Write-Host 'End-to-end tests were not run. Add -E2E to include them.' -ForegroundColor DarkGray
}

if ($failed.Count -gt 0) {
    exit 1
}

exit 0
