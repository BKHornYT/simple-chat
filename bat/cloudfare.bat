@echo off
title Simple Chat - Cloudflare Tunnel
setlocal enabledelayedexpansion

:: === CHANGE DIRECTORY TO SCRIPT FOLDER ===
cd /d "%~dp0"

echo =======================================
echo        Starting Simple Chat Server
echo =======================================
echo.

:: === START PYTHON SERVER IN BACKGROUND ===
echo [1/3] Launching Python HTTP server on port 5500...
start "python-server" /B python -m http.server 5500
timeout /t 2 >nul

:: === START CLOUDFLARED AND CAPTURE URL ===
echo [2/3] Starting Cloudflare Tunnel...
echo Waiting for Cloudflare to generate public URL...
echo.

:: Run cloudflared and pipe output into a temp file
start "cloudflared" /B cmd /c ^
    ""%~dp0cloudflare.exe" tunnel --url http://localhost:5500 --loglevel info > tunnel_output.txt"

:: Wait for URL to appear
:waitloop
timeout /t 1 >nul
findstr /r "https://.*trycloudflare\.com" tunnel_output.txt > url.txt
if %errorlevel% neq 0 (
    goto waitloop
)

:: Read the URL
set /p PUBLIC_URL=<url.txt

echo ---------------------------------------
echo Your public URL is:
echo %PUBLIC_URL%
echo ---------------------------------------

:: === OPEN PUBLIC URL IN BROWSER ===
echo [3/3] Opening website in browser...
start "" "%PUBLIC_URL%"

echo.
echo Chat is LIVE! Share this URL with anyone.
echo (Leave this window open to keep the server running.)
echo.

pause
endlocal
