@echo off
echo Freeing TCP port 3000 (LISTENING only) ...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
  echo   taskkill /F /PID %%P
  taskkill /F /PID %%P 2>nul
)
echo Done. You can run run.bat now.
pause
