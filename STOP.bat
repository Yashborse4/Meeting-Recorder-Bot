@echo off
setlocal enabledelayedexpansion
title Stop Google Meet Recorder
color 0E

cd /d "%~dp0"
if exist "Record Bot" cd /d "Record Bot"

call STOP_RECORDER.bat
