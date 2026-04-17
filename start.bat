@echo off
setlocal enabledelayedexpansion
chcp 65001 > /dev/null
title Yui Reception Setup
cd /d "%~dp0"

echo.
echo ====================================================
echo   Yui Reception - Setup and Start
echo ====================================================
echo.
echo Current folder: %CD%
echo.

set "NODE_DIR=%~dp0node-v20.18.0-win-x64"
set "NODE_ZIP=%~dp0node.zip"
set "NODE_URL=https://nodejs.org/dist/v20.18.0/node-v20.18.0-win-x64.zip"
set "NODE_EXE=%NODE_DIR%\node.exe"
set "NPM_CMD=%NODE_DIR%\npm.cmd"
set "PATH=%NODE_DIR%;%PATH%"

echo [1/5] Checking for portable Node.js...
if exist "%NODE_EXE%" (
    echo   Portable Node.js found.
    goto :install_deps
)

echo   Not found. Will download portable Node.js.
echo.

if exist "%NODE_ZIP%" (
    echo [2a/5] Zip already present, skipping download.
) else (
    echo [2a/5] Downloading Node.js v20.18.0 ^(about 30 MB^)...
    echo        This takes 1-2 minutes. Please wait.
    powershell -NoProfile -ExecutionPolicy Bypass -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%NODE_ZIP%' -UseBasicParsing; Write-Host 'Download complete.' } catch { Write-Host ('Download failed: ' + $_.Exception.Message); exit 1 }"
    if errorlevel 1 (
        echo.
        echo ERROR: Node.js download failed.
        echo Please check your internet connection and try again.
        pause
        exit /b 1
    )
)

echo.
echo [2b/5] Extracting Node.js ^(30-60 seconds^)...
if exist "%NODE_DIR%" (
    rmdir /s /q "%NODE_DIR%"
)
tar -xf "%NODE_ZIP%"
if errorlevel 1 (
    echo ERROR: Extraction failed.
    pause
    exit /b 1
)

if not exist "%NODE_EXE%" (
    echo ERROR: node.exe not found after extraction.
    echo Looking for: %NODE_EXE%
    dir "%~dp0"
    pause
    exit /b 1
)

echo   Extraction complete.

:install_deps
echo.
echo [3/5] Node.js version:
"%NODE_EXE%" --version
if errorlevel 1 (
    echo ERROR: Cannot run node.exe
    pause
    exit /b 1
)
echo.

echo [4/5] Installing dependencies ^(3-5 minutes on first run^)...
echo.
call "%NPM_CMD%" install --legacy-peer-deps
if errorlevel 1 (
    echo.
    echo ERROR: npm install failed. Scroll up to see error details.
    pause
    exit /b 1
)

echo.
echo [5/5] Starting dev server...
echo.
echo ====================================================
echo   Server will start at http://localhost:3000
echo   Open that URL in your browser after "ready" appears.
echo   Press Ctrl+C to stop the server.
echo ====================================================
echo.
call "%NPM_CMD%" run dev

pause
endlocal
