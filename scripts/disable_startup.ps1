param(
    [switch]$NonInteractive
)

$startupFolder = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup")
$shortcutFile = [System.IO.Path]::Combine($startupFolder, "Google Meet Recorder.lnk")
$legacyVbs = [System.IO.Path]::Combine($startupFolder, "GoogleMeetRecorder.vbs")

Write-Host "========================================================================" -ForegroundColor Yellow
Write-Host "       DISABLE GOOGLE MEET RECORDER FROM WINDOWS STARTUP               " -ForegroundColor Yellow
Write-Host "========================================================================" -ForegroundColor Yellow
Write-Host ""

$removed = $false

if (Test-Path $shortcutFile) {
    Remove-Item -Path $shortcutFile -Force -ErrorAction SilentlyContinue
    $removed = $true
}
if (Test-Path $legacyVbs) {
    Remove-Item -Path $legacyVbs -Force -ErrorAction SilentlyContinue
    $removed = $true
}

if ($removed) {
    Write-Host "========================================================================" -ForegroundColor Green
    Write-Host " [SUCCESS] Google Meet Recorder removed from Windows Startup." -ForegroundColor Green
    Write-Host "========================================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host " The bot will no longer launch automatically on Windows boot."
    Write-Host " You can start it manually anytime by double-clicking 'Google Meet Recorder.exe' or 'START.bat'."
    Write-Host ""
} else {
    Write-Host "========================================================================" -ForegroundColor Gray
    Write-Host " [INFO] Auto-startup is not currently enabled." -ForegroundColor Gray
    Write-Host "========================================================================" -ForegroundColor Gray
    Write-Host ""
}

if (-not $NonInteractive) {
    Read-Host "Press Enter to exit"
}
