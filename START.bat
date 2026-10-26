@echo off
setlocal
title Starting Google Meet Recorder...

cd /d "%~dp0"
if exist "Record Bot" cd /d "Record Bot"

:: Check if dashboard is already running on port 3000
netstat -ano 2>nul | findstr /R /C:":3000 .*LISTENING" >nul 2>nul
if %errorlevel% equ 0 (
    echo Recorder is already running. Opening Dashboard...
    start "" "http://localhost:3000"
    exit /b 0
)

:: Launch recorder in a minimized window (runs quietly in background)
start "Google Meet Recorder" /min cmd /c "call START_RECORDER.bat"

:: Open the web dashboard in your default browser
timeout /t 2 /nobreak >nul 2>nul
start "" "http://localhost:3000"
exit /b 0
