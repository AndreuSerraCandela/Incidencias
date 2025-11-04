@echo off
title Web-App Inteligente - Incidencias
color 0B

echo ========================================
echo    Web-App Inteligente de Incidencias
echo ========================================
echo.

echo Verificando Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python no esta instalado o no esta en el PATH
    echo Por favor, instala Python 3.8+ desde python.org
    pause
    exit /b 1
)

echo.
echo ========================================
echo    Verificando dependencias...
echo ========================================
echo.

echo Verificando dependencias basicas...
python -c "import flask, requests" >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ADVERTENCIA: Faltan dependencias basicas
    echo Ejecutando instalacion automatica...
    echo.
    pip install Flask Flask-CORS requests
    if %errorlevel% neq 0 (
        echo ERROR: No se pudieron instalar las dependencias basicas
        pause
        exit /b 1
    )
)

echo.
echo ========================================
echo    Intentando version principal...
echo ========================================
echo.

echo Verificando si web_app.py puede ejecutarse...
python -c "import cv2, pyzbar" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Todas las dependencias disponibles
    echo Iniciando version completa...
    echo.
    python web_app.py
    if %errorlevel% equ 0 (
        echo.
        echo Servidor detenido normalmente
        pause
        exit /b 0
    ) else (
        echo.
        echo ⚠️ Version principal fallo, intentando version ligera...
        echo.
    )
) else (
    echo ⚠️ Algunas dependencias no estan disponibles
    echo Iniciando version ligera...
    echo.
)

echo.
echo ========================================
echo    Iniciando version ligera...
echo ========================================
echo.

if exist "web_app_light.py" (
    echo Iniciando web_app_light.py...
    python web_app_light.py
    if %errorlevel% equ 0 (
        echo.
        echo Servidor detenido normalmente
        pause
        exit /b 0
    ) else (
        echo.
        echo ERROR: Ambas versiones fallaron
        echo.
        echo Soluciones:
        echo 1. Ejecuta: install_web_robust.bat
        echo 2. Verifica que Python este en el PATH
        echo 3. Usa Python 3.11 o 3.12 en lugar de 3.13
        echo.
        pause
        exit /b 1
    )
) else (
    echo ERROR: web_app_light.py no encontrado
    echo.
    echo Soluciones:
    echo 1. Verifica que estes en el directorio correcto
    echo 2. Ejecuta: install_web_robust.bat
    echo 3. Usa: start_web_app.bat
    echo.
    pause
    exit /b 1
)

