@echo off
setlocal
title Disable Google Meet Recorder - Windows Auto-Startup
color 0C

set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_FILE=%STARTUP_FOLDER%\Google Meet Recorder.lnk"
set "LEGACY_VBS=%STARTUP_FOLDER%\GoogleMeetRecorder.vbs"

echo ========================================================================
echo       DISABLE GOOGLE MEET RECORDER FROM WINDOWS STARTUP
echo ========================================================================
echo.

set "REMOVED=0"

if exist "%SHORTCUT_FILE%" (
    del /f /q "%SHORTCUT_FILE%"
    set "REMOVED=1"
)
if exist "%LEGACY_VBS%" (
    del /f /q "%LEGACY_VBS%"
    set "REMOVED=1"
)

if "%REMOVED%"=="1" (
    echo ========================================================================
    echo  [SUCCESS] Google Meet Recorder removed from Windows Startup.
    echo ========================================================================
    echo.
    echo  The bot will no longer launch automatically on Windows boot.
    echo  You can start it manually anytime by double-clicking:
    echo    - START_RECORDER.bat
    echo.
) else (
    echo ========================================================================
    echo  [INFO] Auto-startup is not currently enabled.
    echo ========================================================================
    echo  No startup shortcut or script was found in:
    echo  %STARTUP_FOLDER%
    echo.
)

pause
