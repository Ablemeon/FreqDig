setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required to run the local server.
  echo Download it from https://nodejs.org/
  pause
  exit /b 1
)

node scripts\static-server.mjs 8000 --open
pause
