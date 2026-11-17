@echo off
setlocal
title Google Meet Recorder Launcher
color 0F

cd /d "%~dp0"

:: 1. Launch the native Windows System Tray application if present (single-instance protected)
if exist "Google Meet Recorder.exe" (
    start "" "Google Meet Recorder.exe"
    exit /b 0
)

if exist "Record Bot\Google Meet Recorder.exe" (
    start "" "Record Bot\Google Meet Recorder.exe"
    exit /b 0
)

:: 2. Fallback: launch via Node.js
if exist "Record Bot" cd /d "Record Bot"
node backend/src/server.js
