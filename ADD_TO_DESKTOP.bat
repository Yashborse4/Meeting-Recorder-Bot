@echo off
setlocal
title Add Google Meet Recorder to Desktop
color 0A

:: Target batch file
set "TARGET_BAT=%~dp0START.bat"
set "DESKTOP_PATH=%USERPROFILE%\Desktop\Google Meet Recorder.lnk"

echo ========================================================================
echo        ADD GOOGLE MEET RECORDER SHORTCUT TO DESKTOP
echo ========================================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ws = New-Object -ComObject WScript.Shell; " ^
    "$s = $ws.CreateShortcut('%DESKTOP_PATH%'); " ^
    "$s.TargetPath = '%TARGET_BAT%'; " ^
    "$s.WorkingDirectory = '%~dp0'; " ^
    "$s.Description = 'One-click launcher for Google Meet Recording Bot & Dashboard'; " ^
    "$s.Save()"

if exist "%DESKTOP_PATH%" (
    echo [SUCCESS] Desktop shortcut created successfully!
    echo.
    echo You can now double-click 'Google Meet Recorder' directly on your
    echo Desktop anytime to start the bot and open your dashboard.
) else (
    echo [ERROR] Could not create desktop shortcut.
)

echo.
pause
