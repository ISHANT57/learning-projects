@echo off
rem Inactivity Alarm - (c) 2026 IMPS. All rights reserved. Made by Ishant. Fingerprint: IMPS-IA-E91E8AB6F47B4248
rem Builds release\InactivityAlarm-Setup-<ver>.exe and release\InactivityAlarm-Portable-<ver>.exe
cd /d "%~dp0"
python -m pip install -r requirements.txt || exit /b 1
python build.py
