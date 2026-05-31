@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% equ 0 (
  set "NODE_EXE=node"
) else (
  set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)

if not exist "%NODE_EXE%" if not "%NODE_EXE%"=="node" (
  echo Node.js wurde nicht gefunden.
  echo.
  echo Bitte Node.js LTS installieren:
  echo https://nodejs.org/
  echo.
  pause
  exit /b 1
)

echo Starte Festkasse Community Edition...
echo.
echo Browser-Adresse:
echo http://localhost:3000
echo.
echo Dieses Fenster offen lassen. Mit Strg+C beendest du den Server.
echo.

start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:3000'"
"%NODE_EXE%" server.js

echo.
echo Server wurde beendet.
pause
