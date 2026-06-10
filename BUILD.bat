@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File scripts\build-installer.ps1
if %ERRORLEVEL% neq 0 (
    echo.
    echo ERROR: La build fallo. Revisa los mensajes arriba.
    pause
    exit /b 1
)
echo.
echo Instalador generado en:
echo   dist-electron\
pause
