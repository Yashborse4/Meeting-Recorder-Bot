param(
    [switch]$NonInteractive
)

$ErrorActionPreference = 'Stop'

Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "       ENABLE GOOGLE MEET RECORDER ON WINDOWS STARTUP                   " -ForegroundColor Cyan
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host ""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir

$startupFolder = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup")
$shortcutFile = [System.IO.Path]::Combine($startupFolder, "Google Meet Recorder.lnk")
$legacyVbs = [System.IO.Path]::Combine($startupFolder, "GoogleMeetRecorder.vbs")

# Prefer native exe
$targetApp = Join-Path $rootDir "Google Meet Recorder.exe"
$appArgs = "--startup"
if (-not (Test-Path $targetApp)) {
    $targetApp = Join-Path $rootDir "START.bat"
    $appArgs = ""
}

Write-Host "Project Directory: $rootDir"
Write-Host "Startup Shortcut : $shortcutFile"
Write-Host "Target App       : $targetApp"
Write-Host ""

# Clean up legacy .vbs
if (Test-Path $legacyVbs) {
    Remove-Item -Path $legacyVbs -Force -ErrorAction SilentlyContinue
}

# Create standard Windows .lnk shortcut
$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut($shortcutFile)
$s.TargetPath = $targetApp
if ($appArgs) { $s.Arguments = $appArgs }
$s.WorkingDirectory = $rootDir
$s.WindowStyle = 7 # Minimized
$s.Description = "Google Meet Recorder Background Scheduler"
$s.Save()

if (Test-Path $shortcutFile) {
    Write-Host "========================================================================" -ForegroundColor Green
    Write-Host " [SUCCESS] Auto-Startup Successfully Configured!" -ForegroundColor Green
    Write-Host "========================================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host " - Standard Windows shortcut created in Startup folder (antivirus safe)."
    Write-Host " - The recorder runs quietly in the Windows 11 system tray on boot."
    Write-Host " - All scheduled classes in your timetable are monitored and recorded hands-free!"
    Write-Host ""
} else {
    Write-Host "[ERROR] Could not write shortcut to $startupFolder" -ForegroundColor Red
}

if (-not $NonInteractive) {
    Read-Host "Press Enter to exit"
}
