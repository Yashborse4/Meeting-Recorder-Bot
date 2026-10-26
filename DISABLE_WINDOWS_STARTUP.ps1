param(
    [switch]$NonInteractive
)

# Google Meet Recorder - Disable Windows Auto-Startup
$ErrorActionPreference = 'Stop'

Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "      DISABLE GOOGLE MEET RECORDER FROM WINDOWS STARTUP                 " -ForegroundColor Cyan
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host ""

$startupFolder = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup")
$startupFile = [System.IO.Path]::Combine($startupFolder, "GoogleMeetRecorder.vbs")

if (Test-Path $startupFile) {
    Remove-Item -Path $startupFile -Force
    Write-Host "========================================================================" -ForegroundColor Green
    Write-Host " [SUCCESS] Google Meet Recorder removed from Windows Startup.           " -ForegroundColor Green
    Write-Host "========================================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host " The bot will no longer launch automatically on Windows boot."
    Write-Host " You can still start it manually anytime by double-clicking:"
    Write-Host "   - START_RECORDER.bat (Normal window)"
    Write-Host "   - START_BACKGROUND.vbs (Background mode)"
    Write-Host ""
} else {
    Write-Host "========================================================================" -ForegroundColor Yellow
    Write-Host " [INFO] Auto-startup is not currently enabled.                          " -ForegroundColor Yellow
    Write-Host "========================================================================" -ForegroundColor Yellow
    Write-Host " No startup files were found in: $startupFolder"
    Write-Host ""
}

Write-Host ""
if (-not $NonInteractive) {
    Read-Host "Press Enter to exit"
}
