# PowerShell Packaging Script for Google Meet Recorder Release
$ErrorActionPreference = 'Stop'
$rootDir = Split-Path -Parent $PSScriptRoot
$releaseDir = Join-Path $rootDir "release"

Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "       CREATING GOOGLE MEET RECORDER RELEASE PACKAGES                   " -ForegroundColor Cyan
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $releaseDir)) {
    New-Item -ItemType Directory -Path $releaseDir | Out-Null
}

# 1. Build Extension with Webpack
Write-Host "[1/4] Building Chrome Extension via Webpack..." -ForegroundColor Yellow
npm --prefix (Join-Path $rootDir "Record Bot") run build

# 2. Package Chrome Extension ZIP
Write-Host "[2/4] Packaging Chrome Extension ZIP..." -ForegroundColor Yellow
$extZip = Join-Path $releaseDir "Google-Meet-Recorder-Extension-v1.0.0.zip"
if (Test-Path $extZip) { Remove-Item $extZip -Force }
Compress-Archive -Path (Join-Path $rootDir "Record Bot\dist\*") -DestinationPath $extZip
Write-Host " -> $extZip" -ForegroundColor Green

# 3. Compile Windows Tray App Executable
Write-Host "[3/4] Compiling Windows Tray App executable..." -ForegroundColor Yellow
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) { $csc = "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe" }
if (Test-Path $csc) {
    & $csc /target:winexe /win32icon:(Join-Path $rootDir "app.ico") /res:(Join-Path $rootDir "tray.ico") /out:(Join-Path $rootDir "Google Meet Recorder.exe") (Join-Path $rootDir "TrayApp.cs") | Out-Null
    Copy-Item (Join-Path $rootDir "Google Meet Recorder.exe") -Destination (Join-Path $rootDir "Record Bot\Google Meet Recorder.exe") -Force
}

# 4. Package Windows Full Bundle ZIP
Write-Host "[4/4] Packaging Full Windows Standalone Bundle ZIP..." -ForegroundColor Yellow
$bundleZip = Join-Path $releaseDir "Google-Meet-Recorder-v1.0.0-windows-x64.zip"
if (Test-Path $bundleZip) { Remove-Item $bundleZip -Force }

$stagingDir = Join-Path $env:TEMP "Google-Meet-Recorder-v1.0.0"
if (Test-Path $stagingDir) { Remove-Item $stagingDir -Recurse -Force }
New-Item -ItemType Directory -Path $stagingDir | Out-Null

$rootFiles = @(
    "Google Meet Recorder.exe", "TrayApp.cs", "app.ico", "tray.ico",
    "START.bat", "STOP.bat", "START_RECORDER.bat", "STOP_RECORDER.bat",
    "ADD_TO_DESKTOP.bat", "ENABLE_WINDOWS_STARTUP.bat", "ENABLE_WINDOWS_STARTUP.ps1",
    "DISABLE_WINDOWS_STARTUP.bat", "OPEN_DASHBOARD.bat", "package.json",
    "README.md", "REQUIREMENTS.md"
)
foreach ($f in $rootFiles) {
    $src = Join-Path $rootDir $f
    if (Test-Path $src) { Copy-Item $src -Destination $stagingDir -Force }
}

Copy-Item (Join-Path $rootDir "scripts") -Destination (Join-Path $stagingDir "scripts") -Recurse -Force

$recBotStaging = Join-Path $stagingDir "Record Bot"
New-Item -ItemType Directory -Path $recBotStaging | Out-Null

$recFiles = @("START.bat", "STOP.bat", "package.json", "manifest.json", "README.md", "REQUIREMENTS.md")
foreach ($f in $recFiles) {
    $src = Join-Path $rootDir "Record Bot\$f"
    if (Test-Path $src) { Copy-Item $src -Destination $recBotStaging -Force }
}

Copy-Item (Join-Path $rootDir "Record Bot\dist") -Destination (Join-Path $recBotStaging "dist") -Recurse -Force

$backendStaging = Join-Path $recBotStaging "backend"
New-Item -ItemType Directory -Path $backendStaging | Out-Null
Copy-Item (Join-Path $rootDir "Record Bot\backend\public") -Destination (Join-Path $backendStaging "public") -Recurse -Force
Copy-Item (Join-Path $rootDir "Record Bot\backend\src") -Destination (Join-Path $backendStaging "src") -Recurse -Force
Copy-Item (Join-Path $rootDir "Record Bot\backend\package.json") -Destination (Join-Path $backendStaging "package.json") -Force
Copy-Item (Join-Path $rootDir "Record Bot\backend\package-lock.json") -Destination (Join-Path $backendStaging "package-lock.json") -Force
$bFiles = @("README.md", "settings.example.json", "subjects.example.json", "timetable.example.json")
foreach ($bf in $bFiles) {
    $src = Join-Path $rootDir "Record Bot\backend\$bf"
    if (Test-Path $src) { Copy-Item $src -Destination $backendStaging -Force }
}

Compress-Archive -Path "$stagingDir\*" -DestinationPath $bundleZip
Remove-Item $stagingDir -Recurse -Force

Write-Host " -> $bundleZip" -ForegroundColor Green
Write-Host ""
Write-Host "========================================================================" -ForegroundColor Green
Write-Host " [SUCCESS] Packages built successfully in $releaseDir" -ForegroundColor Green
Write-Host "========================================================================" -ForegroundColor Green
Get-ChildItem $releaseDir | Select-Object Name, Length, LastWriteTime
