@echo off
setlocal
title Build Google Meet Recorder Windows App
color 0B

cd /d "%~dp0\.."

echo ========================================================================
echo         BUILDING GOOGLE MEET RECORDER WINDOWS EXECUTABLE
echo ========================================================================
echo.

set "CSC=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" (
    set "CSC=C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)

if not exist "%CSC%" (
    echo [ERROR] .NET Framework C# compiler csc.exe was not found!
    pause
    exit /b 1
)

echo [1/3] Terminating any running instance of Google Meet Recorder...
taskkill /F /IM "Google Meet Recorder.exe" >nul 2>nul
timeout /t 1 >nul 2>nul

echo [2/3] Compiling TrayApp.cs into native Windows executable...
"%CSC%" /target:winexe /win32icon:app.ico /res:tray.ico /out:"Google Meet Recorder.exe" TrayApp.cs
if %errorlevel% neq 0 (
    echo [ERROR] Compilation failed!
    pause
    exit /b 1
)

echo [3/3] Synchronizing binary to Record Bot folder...
copy /y "Google Meet Recorder.exe" "Record Bot\Google Meet Recorder.exe" >nul 2>nul

echo.
echo ========================================================================
echo  [SUCCESS] Google Meet Recorder.exe built successfully!
echo ========================================================================
echo.
pause
