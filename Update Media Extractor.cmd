@echo off
echo Finish downloads and close browsers using Media Extractor before updating.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0helper\install.ps1" -RefreshTools
pause
