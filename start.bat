@echo off
REM ================================================
REM AgentIQ Pro - 1-Click Start Script
REM ================================================

echo.
echo ================================================
echo   AgentIQ Pro - Starting Up...
echo ================================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo [1/4] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo ERROR: Failed to install dependencies!
        pause
        exit /b 1
    )
)

echo [2/4] Building application...
call npm run build
if errorlevel 1 (
    echo ERROR: Build failed!
    pause
    exit /b 1
)

echo [3/4] Running tests...
call npm test
if errorlevel 1 (
    echo WARNING: Some tests failed. See above for details.
)

echo [4/4] Starting development server...
echo.
echo ================================================
echo   App is ready! Opening in browser...
echo ================================================
echo.

REM Open browser
start http://localhost:3000

REM Start the dev server
npm start