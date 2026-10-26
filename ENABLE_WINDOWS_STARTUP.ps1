param(
    [switch]$NonInteractive
)

# Google Meet Recorder - Enable Windows Auto-Startup (Antivirus-Safe .lnk Shortcut)
$ErrorActionPreference = 'Stop'

Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "       ENABLE GOOGLE MEET RECORDER ON WINDOWS STARTUP                   " -ForegroundColor Cyan
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host ""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (Test-Path (Join-Path $scriptDir "Record Bot")) {
    $projDir = Join-Path $scriptDir "Record Bot"
} else {
    $projDir = $scriptDir
}

$startupFolder = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup")
$shortcutFile = [System.IO.Path]::Combine($startupFolder, "Google Meet Recorder.lnk")
$legacyVbs = [System.IO.Path]::Combine($startupFolder, "GoogleMeetRecorder.vbs")
$targetBat = Join-Path $projDir "START_RECORDER.bat"

Write-Host "Project Directory: $projDir"
Write-Host "Startup Shortcut : $shortcutFile"
Write-Host ""

# Clean up any legacy .vbs file
if (Test-Path $legacyVbs) {
    Remove-Item -Path $legacyVbs -Force -ErrorAction SilentlyContinue
}

# Verify node exists
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js was not detected in PATH. Please install Node.js from https://nodejs.org/" -ForegroundColor Red
    if (-not $NonInteractive) { Read-Host "Press Enter to exit" }
    exit 1
}

try {
    $wshShell = New-Object -ComObject WScript.Shell
    $shortcut = $wshShell.CreateShortcut($shortcutFile)
    $shortcut.TargetPath = $targetBat
    $shortcut.WorkingDirectory = $projDir
    $shortcut.WindowStyle = 7 # Minimized
    $shortcut.Save()

    if (Test-Path $shortcutFile) {
        Write-Host "========================================================================" -ForegroundColor Green
        Write-Host " [SUCCESS] Auto-Startup Successfully Configured!                         " -ForegroundColor Green
        Write-Host "========================================================================" -ForegroundColor Green
        Write-Host ""
        Write-Host " - Native Windows shortcut (.lnk) created in Startup folder (100% Antivirus Safe)."
        Write-Host " - The bot starts minimized on Windows boot without popups or command windows."
        Write-Host " - All scheduled classes in your timetable will be recorded hands-free!"
        Write-Host ""
        Write-Host " To view or edit timetable/recordings at any time:"
        Write-Host "   - Double-click OPEN_DASHBOARD.bat"
        Write-Host "   - Or visit: http://localhost:3000"
        Write-Host ""
        Write-Host " To disable auto-startup anytime:"
        Write-Host "   - Double-click DISABLE_WINDOWS_STARTUP.bat"
        Write-Host "========================================================================" -ForegroundColor Green
    }
} catch {
    Write-Host "[ERROR] Failed to write to Startup folder: $_" -ForegroundColor Red
}

Write-Host ""
if (-not $NonInteractive) {
    Read-Host "Press Enter to exit"
}
