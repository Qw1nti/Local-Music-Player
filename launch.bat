@echo off
setlocal

set "APP_DIR=%~dp0"
cd /d "%APP_DIR%"

echo [Local Music Player] Starting one-click launcher...

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  echo Install Node.js LTS from: https://nodejs.org/
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found.
  echo Reinstall Node.js LTS from: https://nodejs.org/
  pause
  exit /b 1
)

node ".\scripts\one-click-launch.mjs"
if errorlevel 1 (
  echo [ERROR] Launch failed. See messages above.
  pause
  exit /b 1
)

echo [Local Music Player] Launch complete.
exit /b 0

