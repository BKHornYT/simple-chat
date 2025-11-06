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

:: Wait two seconds
timeout /t 2 >nul

:: Open the site locally
start "" "http://localhost:5500"

echo.
echo =======================================
echo   Starting LocalTunnel (stable mode)
echo =======================================
echo.

:START_LT
echo Opening LocalTunnel on port 5500...
echo If this fails, it will automatically retry.
echo.

lt --port 5500 --subdomain simplechatdemo --local-host localhost
IF ERRORLEVEL 1 (
    echo.
    echo LocalTunnel failed! Retrying in 5 seconds...
    timeout /t 5 >nul
    goto START_LT
)

:: When LocalTunnel closes, kill the server
echo.
echo Stopping local server...
taskkill /F /IM python.exe >nul 2>&1
echo Server stopped.
pause
