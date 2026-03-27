@echo off
cd /d "%~dp0"
title MLEO — Next.js port 3000
echo.
echo Project: %CD%
echo Starting http://localhost:3000 ...
echo Tip: Use Ctrl+C to stop the server.
echo If you see EADDRINUSE port 3000: close other terminals, or run free-port-3000.bat first.
echo.

REM Must use CALL — otherwise npm.cmd ends this batch too early and the window closes (no PAUSE).
call npm run dev

echo.
echo Exit code: %ERRORLEVEL%
pause
