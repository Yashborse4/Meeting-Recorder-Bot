@echo off
setlocal
title Google Meet Recorder Launcher

cd /d "%~dp0"

if exist "Google Meet Recorder.exe" (
    start "" "Google Meet Recorder.exe"
    exit /b 0
)

call START_RECORDER.bat
