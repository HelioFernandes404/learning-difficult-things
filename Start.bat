@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
if not exist .launcher mkdir .launcher
echo === Learning Difficult Things ===

rem 1) Node.js >= 20
set NODE_MAJOR=0
where node >nul 2>&1
if %errorlevel%==0 for /f %%v in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 20 (
  echo Node.js ^(version 20 or newer^) was not found on this computer.
  echo Install the LTS version from: https://nodejs.org
  echo After installing, double-click this file again.
  if not "%NO_OPEN%"=="1" start "" https://nodejs.org
  pause
  exit /b 1
)

rem 2) pnpm
set COREPACK_ENABLE_DOWNLOAD_PROMPT=0
set "PNPM=pnpm"
where pnpm >nul 2>&1
if errorlevel 1 (
  call corepack enable >nul 2>&1
  where pnpm >nul 2>&1
  if errorlevel 1 set "PNPM=npx --yes pnpm"
)
call %PNPM% --version >nul 2>&1
if errorlevel 1 (
  echo ERROR: could not set up pnpm. Check your internet and try again.
  pause
  exit /b 1
)

rem 3) dependencies
for /f %%h in ('powershell -NoProfile -Command "(Get-FileHash pnpm-lock.yaml -Algorithm SHA1).Hash"') do set LOCK_HASH=%%h
set OLD=
if exist .launcher\lock set /p OLD=<.launcher\lock
if not exist node_modules goto :install_deps
if not "%OLD%"=="%LOCK_HASH%" goto :install_deps
goto :sqlite
:install_deps
echo Installing dependencies ^(first run only, may take a few minutes^)...
call %PNPM% install --frozen-lockfile
if errorlevel 1 call %PNPM% install
if errorlevel 1 goto :deps_error
>.launcher\lock echo %LOCK_HASH%

:sqlite
node -e "new (require('better-sqlite3'))(':memory:')" >nul 2>&1
if errorlevel 1 (
  echo Building the database module...
  call %PNPM% rebuild better-sqlite3 >nul 2>&1
  node -e "new (require('better-sqlite3'))(':memory:')" >nul 2>&1
  if errorlevel 1 goto :deps_error
)

rem 4) build only if the code changed
for /f %%h in ('powershell -NoProfile -Command "$f=Get-ChildItem src,public -Recurse -File | Sort-Object FullName; $f+=Get-Item package.json,next.config.ts,tsconfig.json,pnpm-lock.yaml; $s=($f | ForEach-Object { (Get-FileHash $_.FullName -Algorithm SHA1).Hash }) -join ''; $b=[Text.Encoding]::UTF8.GetBytes($s); [BitConverter]::ToString([Security.Cryptography.SHA1]::Create().ComputeHash($b)).Replace('-','')"') do set SRC_HASH=%%h
set OLD=
if exist .launcher\src set /p OLD=<.launcher\src
set DIST=%NEXT_DIST_DIR%
if "%DIST%"=="" set DIST=.next
if not exist "%DIST%\BUILD_ID" goto :build
if not "%OLD%"=="%SRC_HASH%" goto :build
goto :port
:build
echo Preparing the app ^(only when there are changes, may take a while^)...
call %PNPM% build
if errorlevel 1 (
  echo ERROR: failed to prepare the app.
  pause
  exit /b 1
)
>.launcher\src echo %SRC_HASH%

:port
if "%PORT%"=="" set PORT=3000
for /f %%p in ('node -e "const net=require('net');let p=+process.argv[1];const end=p+50;(function t(){const s=net.createServer();s.once('error',()=>{p++;p<end?t():(console.log(0),process.exit())});s.once('listening',()=>s.close(()=>console.log(p)));s.listen(p,'127.0.0.1');})();" %PORT%') do set PORT=%%p
if "%PORT%"=="0" (
  echo ERROR: could not find a free port.
  pause
  exit /b 1
)
if "%HOST%"=="" set HOST=127.0.0.1
if not exist logs mkdir logs
if not exist data mkdir data

echo Starting...
start "Learning Difficult Things server" /min cmd /c "call %PNPM% start >> logs\launcher.log 2>&1"

set OK=0
for /l %%i in (1,1,120) do (
  powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:%PORT%/ -TimeoutSec 2).StatusCode | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
  if not errorlevel 1 ( set OK=1& goto :ready )
  timeout /t 1 /nobreak >nul
)
:ready
if not "%OK%"=="1" (
  echo ERROR: the server did not start. See the file logs\launcher.log
  pause
  exit /b 1
)
if not "%NO_OPEN%"=="1" start "" http://localhost:%PORT%
echo.
echo Learning Difficult Things running at http://localhost:%PORT%
echo Close this window to stop.
echo ^(If the server keeps running, also close the minimized window "Learning Difficult Things server".^)
pause >nul
rem Pressing a key stops the server.
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":%PORT% .*LISTENING"') do taskkill /PID %%p /T /F >nul 2>&1
exit /b 0

:deps_error
echo.
echo ERROR: failed to install dependencies.
echo Check your internet. If the error mentions "better-sqlite3", "gyp" or "compiler", install the
echo "Visual Studio Build Tools" ^(https://visualstudio.microsoft.com/visual-cpp-build-tools/^)
echo or use the Docker version ^(see the README^).
pause
exit /b 1
