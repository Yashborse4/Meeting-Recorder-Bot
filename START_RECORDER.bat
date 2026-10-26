@echo off
setlocal enabledelayedexpansion
title Google Meet Recording Bot - Dashboard & Scheduler
color 0F

echo ========================================================================
echo               Google Meet Recorder Bot - Launching...
echo ========================================================================
echo.

:: Detect directory
cd /d "%~dp0"
if exist "Record Bot" cd /d "Record Bot"

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found on your system!
    echo.
    echo Please install Node.js (LTS recommended) from:
    echo   https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Check if backend dependencies are installed
if not exist "backend\node_modules\" (
    echo [Setup] First time setup: Installing backend dependencies...
    cd backend
    call npm install
    cd ..
    echo.
)

:: Check if extension build exists
if not exist "dist\background.js" (
    echo [Setup] Building extension assets...
    call npm run build
    echo.
)

echo [Status] Starting Dashboard Server on http://localhost:3000 ...
echo [Status] Timetable scheduler daemon is actively monitoring your schedule.
echo [Status] Press Ctrl+C at any time to stop the server.
echo ========================================================================
echo.

node backend/src/server.js

if %errorlevel% neq 0 (
    echo.
    echo [Notice] Server process terminated.
    pause
)
