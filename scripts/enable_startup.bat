@echo off
setlocal
title Enable Google Meet Recorder - Windows Auto-Startup
color 0B

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0enable_startup.ps1"
