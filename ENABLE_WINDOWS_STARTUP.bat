@echo off
setlocal enabledelayedexpansion
title Setup Google Meet Recorder - Windows Auto-Startup
color 0A

:: Resolve absolute project directory
set "PROJ_DIR=%~dp0"
if exist "%PROJ_DIR%Record Bot\" set "PROJ_DIR=%PROJ_DIR%Record Bot\"
if "%PROJ_DIR:~-1%"=="\" set "PROJ_DIR=%PROJ_DIR:~0,-1%"

set "TARGET_BAT=%PROJ_DIR%\START_RECORDER.bat"
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_FILE=%STARTUP_FOLDER%\Google Meet Recorder.lnk"
set "LEGACY_VBS=%STARTUP_FOLDER%\GoogleMeetRecorder.vbs"

echo ========================================================================
echo        ENABLE GOOGLE MEET RECORDER ON WINDOWS STARTUP
echo ========================================================================
echo.
echo Project Directory: %PROJ_DIR%
echo Startup Shortcut : %SHORTCUT_FILE%
echo.

:: Clean up any legacy .vbs file that might trigger antivirus
if exist "%LEGACY_VBS%" del /f /q "%LEGACY_VBS%" 2>nul

:: Check Node.js is accessible
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js was not detected in PATH.
    echo Please make sure Node.js is installed from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Create a standard Windows .lnk shortcut (native Windows shell object - safe from antivirus)
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ws = New-Object -ComObject WScript.Shell; " ^
    "$s = $ws.CreateShortcut('%SHORTCUT_FILE%'); " ^
    "$s.TargetPath = '%TARGET_BAT%'; " ^
    "$s.WorkingDirectory = '%PROJ_DIR%'; " ^
    "$s.WindowStyle = 7; " ^
    "$s.Save()"

if exist "%SHORTCUT_FILE%" (
    echo ========================================================================
    echo  [SUCCESS] Auto-Startup Successfully Configured!
    echo ========================================================================
    echo.
    echo  - Standard Windows shortcut created in Startup folder (100%% antivirus safe).
    echo  - The recorder bot will start minimized when Windows boots.
    echo  - All scheduled classes in your timetable will be recorded hands-free!
    echo.
    echo  To view or edit timetable/recordings at any time:
    echo    - Double-click OPEN_DASHBOARD.bat
    echo    - Or visit: http://localhost:3000
    echo.
    echo  To disable auto-startup anytime:
    echo    - Double-click DISABLE_WINDOWS_STARTUP.bat
    echo ========================================================================
) else (
    echo [ERROR] Failed to write to Windows Startup folder.
    echo Please verify permissions for %STARTUP_FOLDER%
)

echo.
pause
