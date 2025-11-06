@echo off
title Simple Chat Server (robust)
echo =======================================
echo        Starting Simple Chat
echo =======================================
echo.

:: Change to your site folder (adjust if needed)
cd /d "C:\Users\bjorn\OneDrive - Rogaland Fylkeskommune EES\Dokumenter\GitHub\Nettsiderskoletulleri\simple-chat"

:: Start Python server in background
echo Launching Python HTTP server on port 5500...
start "pyserv" /B python -m http.server 5500

:: Wait a moment
timeout /t 2 >nul

:: Open local site in browser (optional)
start "" "http://localhost:5500"

:: If cloudflared.exe exists in this folder, use it (stable)
if exist ".\cloudflared.exe" (
    echo Found cloudflared.exe — starting stable Cloudflare Tunnel...
    echo (Press CTRL+C to stop both tools)
    start /B .\cloudflared.exe tunnel --url http://localhost:5500
    echo Cloudflare tunnel started in background.
    echo Your site: (see cloudflared console window for URL)
    echo.
    echo Press any key to stop all...
    pause >nul
    goto STOP_ALL
)

:: Otherwise use LocalTunnel but keep it in a retry loop
:LT_LOOP
echo Starting localtunnel (lt)...
echo lt --port 5500 --local-host localhost --subdomain simplechatdemo
lt --port 5500 --local-host localhost --subdomain simplechatdemo
if %ERRORLEVEL% NEQ 0 (
    echo LocalTunnel crashed or refused connection (error %ERRORLEVEL%).
    echo Retrying in 5 seconds...
    timeout /t 5 >nul
    goto LT_LOOP
)

:STOP_ALL
echo Stopping local server...
taskkill /F /IM python.exe >nul 2>&1
echo Done.
pause
