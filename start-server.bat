@echo off
rem PackageBuilder - start the local UI server (default port 4600).
rem Usage:  start-server.bat  [port]
rem The real logic lives in server-control.ps1 (Persian output, UTF-8 safe).
setlocal
set "PORT=4600"
if not "%~1"=="" set "PORT=%~1"
set "PS=pwsh"
where pwsh >nul 2>&1 || set "PS=powershell"
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0server-control.ps1" -Action start -Port %PORT%
exit /b %ERRORLEVEL%
