@echo off
chcp 65001 >nul
title Tecpancito POS

set "ROOT=%~dp0"

echo.
echo  Tecpancito POS - Backend ^& Frontend
echo  =====================================
echo.

:: Verificar que node_modules existan
if not exist "%ROOT%node_modules" (
    echo  [ERROR] No se encontraron node_modules en la raiz.
    echo          Ejecuta "npm install" una vez antes de usar este script.
    echo.
    pause
    exit /b 1
)

if not exist "%ROOT%apps\backend\node_modules" (
    echo  [ERROR] Faltan node_modules en apps\backend.
    echo          Ejecuta "npm install" en la raiz del proyecto.
    echo.
    pause
    exit /b 1
)

if not exist "%ROOT%apps\pos-mobile\node_modules" (
    echo  [ERROR] Faltan node_modules en apps\pos-mobile.
    echo          Ejecuta "npm install" en la raiz del proyecto.
    echo.
    pause
    exit /b 1
)

if not exist "%ROOT%apps\pos-tablet\node_modules" (
    echo  [ERROR] Faltan node_modules en apps\pos-tablet.
    echo          Ejecuta "npm install" en la raiz del proyecto.
    echo.
    pause
    exit /b 1
)

:: Verificar si better-sqlite3 esta compilado para esta version de Node
echo  Verificando better-sqlite3...
node -e "require('better-sqlite3')" >nul 2>&1
if errorlevel 1 (
    echo  [!] better-sqlite3 no esta compilado para esta version de Node.
    echo      Recompilando... esto puede tardar un minuto.
    echo.
    pushd "%ROOT%"
    call npm rebuild better-sqlite3
    if errorlevel 1 (
        echo.
        echo  [ERROR] No se pudo recompilar better-sqlite3.
        echo          Asegurate de tener Visual Studio Build Tools instalado.
        echo          https://aka.ms/vs/17/release/vs_BuildTools.exe
        echo.
        pause
        exit /b 1
    )
    popd
    echo  [OK] better-sqlite3 recompilado correctamente.
    echo.
)

echo  [1/3] Iniciando Backend    (http://localhost:3000)
echo  [2/3] Iniciando POS Tablet (http://localhost:5173)
echo  [3/3] Iniciando POS Mobile (http://localhost:5174)
echo.
echo  Cada frontend abre en su propia ventana.
echo  Cierra las ventanas para detener los procesos.
echo.

:: Levantar backend en ventana separada
start "Tecpancito - Backend" /D "%ROOT%apps\backend" cmd /k "node --env-file=.env src/server.js"

:: Breve pausa para que el backend arranque primero
timeout /t 2 /nobreak >nul

:: Levantar pos-tablet en ventana separada
if exist "%ROOT%node_modules\.bin\vite.cmd" (
    start "Tecpancito - POS Tablet" /D "%ROOT%apps\pos-tablet" cmd /k ""%ROOT%node_modules\.bin\vite.cmd""
) else if exist "%ROOT%apps\pos-tablet\node_modules\.bin\vite.cmd" (
    start "Tecpancito - POS Tablet" /D "%ROOT%apps\pos-tablet" cmd /k ""%ROOT%apps\pos-tablet\node_modules\.bin\vite.cmd""
) else (
    echo  [ERROR] No se encontro vite para pos-tablet. Ejecuta "npm install" en la raiz.
    pause
    exit /b 1
)

:: Levantar pos-mobile en ventana separada
if exist "%ROOT%node_modules\.bin\vite.cmd" (
    start "Tecpancito - POS Mobile" /D "%ROOT%apps\pos-mobile" cmd /k ""%ROOT%node_modules\.bin\vite.cmd""
) else if exist "%ROOT%apps\pos-mobile\node_modules\.bin\vite.cmd" (
    start "Tecpancito - POS Mobile" /D "%ROOT%apps\pos-mobile" cmd /k ""%ROOT%apps\pos-mobile\node_modules\.bin\vite.cmd""
) else (
    echo  [ERROR] No se encontro vite para pos-mobile. Ejecuta "npm install" en la raiz.
    pause
    exit /b 1
)

echo.
echo  Todo levantado. Esta ventana puede cerrarse.
echo.
pause
