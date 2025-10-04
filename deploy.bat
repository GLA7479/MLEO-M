@echo off
echo Building MLEO Game for deployment...
npm run build

if %ERRORLEVEL% EQU 0 (
    echo Build successful! Ready for deployment.
    echo.
    echo Next steps:
    echo 1. Commit your changes: git add . && git commit -m "Fix deployment configuration"
    echo 2. Push to repository: git push origin main
    echo 3. Vercel will automatically deploy from the main branch
) else (
    echo Build failed! Please check the errors above.
)

pause
