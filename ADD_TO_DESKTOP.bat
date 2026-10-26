@echo off
setlocal
title Add Google Meet Recorder to Desktop
color 0A

set "TARGET_EXE=%~dp0Google Meet Recorder.exe"
set "DESKTOP_PATH=%USERPROFILE%\Desktop\Google Meet Recorder.lnk"
set "ICON_PATH=%~dp0app.ico"

echo ========================================================================
echo        ADD GOOGLE MEET RECORDER APP TO DESKTOP
echo ========================================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ws = New-Object -ComObject WScript.Shell; " ^
    "$s = $ws.CreateShortcut('%DESKTOP_PATH%'); " ^
    "$s.TargetPath = '%TARGET_EXE%'; " ^
    "$s.WorkingDirectory = '%~dp0'; " ^
    "$s.IconLocation = '%ICON_PATH%'; " ^
    "$s.Description = 'Google Meet Recording Bot & Web Dashboard (Tray App)'; " ^
    "$s.Save()"

if exist "%DESKTOP_PATH%" (
    echo [SUCCESS] Windows App Desktop shortcut updated successfully!
    echo.
    echo Double-clicking 'Google Meet Recorder' on your Desktop will now:
    echo  - Run quietly in your Windows 11 System Tray (notification area)
    echo  - Automatically open your Web Dashboard at http://localhost:3000
    echo  - Let you easily stop or restart it with a right-click on the tray icon!
) else (
    echo [ERROR] Could not create desktop shortcut.
)

echo.
pause
