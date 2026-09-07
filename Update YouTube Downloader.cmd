@echo off
echo Close Brave, Chrome and Edge before updating the background downloader.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0helper\setup.ps1"
if errorlevel 1 (
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0helper\install.ps1"
pause
