@echo off
title Simple Chat Server
echo =======================================
echo        Starting Simple Chat
echo =======================================
echo.

:: Change directory to your site folder
cd /d "C:\Users\bjorn\OneDrive - Rogaland Fylkeskommune EES\Dokumenter\GitHub\Nettsiderskoletulleri\simple-chat"

:: Start the local server in the background
echo Launching Python HTTP server on port 5500...
start /B python -m http.server 5500

:: Wait a couple seconds to let the server start
timeout /t 2 >nul

:: Open the site locally (optional)
start "" "https://simplechatdemo.loca.lt"

:: Open LocalTunnel
echo Opening LocalTunnel on port 5500...
echo (Press CTRL+C in this window to stop sharing)
echo.
lt --port 5500 --subdomain simplechatdemo

:: When LocalTunnel closes, stop the Python server
echo.
echo Stopping local server...
taskkill /F /IM python.exe >nul 2>&1
echo Server stopped.
pause
