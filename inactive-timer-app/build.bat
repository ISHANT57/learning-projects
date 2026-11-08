@echo off
rem Builds release\InactivityAlarm-Setup-<ver>.exe and release\InactivityAlarm-Portable-<ver>.exe
cd /d "%~dp0"
python -m pip install -r requirements.txt || exit /b 1
python build.py
