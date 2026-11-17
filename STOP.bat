@echo off
setlocal enabledelayedexpansion
title Stop Google Meet Recorder
color 0E

echo ========================================================================
echo                 Stopping Google Meet Recorder Bot...
echo ========================================================================
echo.

:: 1. Terminate native Tray Application if running
taskkill /F /IM "Google Meet Recorder.exe" >nul 2>nul

:: 2. Terminate background Node.js server on Port 3000
for /f "tokens=5" %%p in ('netstat -aon 2^>nul ^| findstr :3000 ^| findstr LISTENING') do (
    if not "%%p"=="" (
        echo [Action] Stopping active dashboard server on Port 3000 PID %%p
        taskkill /F /PID %%p >nul 2>nul
    )
)

:: 3. Terminate any lingering bot Chrome instances
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'bot_profile' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>nul

echo.
echo ========================================================================
echo  [SUCCESS] All Google Meet Recorder components stopped cleanly.
echo ========================================================================
echo.
timeout /t 3 >nul 2>nul || pause
