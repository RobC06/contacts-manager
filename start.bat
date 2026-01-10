@echo off
REM Contact Outreach Manager - Windows Startup Script

echo ======================================
echo Contact Outreach Manager
echo ======================================
echo.
echo Starting server...
echo.

REM Check if node_modules exists
if not exist "node_modules\" (
    echo Installing dependencies...
    call npm install
    echo.
)

REM Start the server
echo Server starting at http://localhost:3000
echo.
echo Press Ctrl+C to stop the server
echo ======================================
echo.

REM Open browser after a 2 second delay
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

node server.js

pause
