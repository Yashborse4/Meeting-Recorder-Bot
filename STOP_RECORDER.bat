@echo off
setlocal enabledelayedexpansion
title Stop Google Meet Recorder
color 0E

echo ========================================================================
echo                 Stopping Google Meet Recorder Bot...
echo ========================================================================
echo.

set FOUND=0

:: Check for process listening on port 3000
for /f "tokens=5" %%p in ('netstat -aon 2^>nul ^| findstr :3000 ^| findstr LISTENING') do (
    if not "%%p"=="" (
        echo [Action] Found active dashboard server on Port 3000 (PID: %%p). Terminating...
        taskkill /F /PID %%p >nul 2>nul
        set FOUND=1
    )
)

:: Terminate any lingering bot Chrome instances
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'bot_profile' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>nul

if %FOUND%==1 (
    echo.
    echo ========================================================================
    echo  [SUCCESS] Google Meet Recorder server was stopped cleanly.
    echo ========================================================================
) else (
    echo [INFO] No active Google Meet Recorder process found on port 3000.
)

echo.
timeout /t 3 >nul 2>nul || pause
