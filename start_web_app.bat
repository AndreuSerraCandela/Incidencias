@echo off
title Web-App de Incidencias
color 0A

echo ========================================
echo    Iniciando Web-App de Incidencias
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

echo Verificando dependencias...
python -c "import flask, cv2, pyzbar" >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ADVERTENCIA: Faltan algunas dependencias
    echo Ejecutando instalacion automatica...
    echo.
    pip install -r requirements_web.txt
    if %errorlevel% neq 0 (
        echo.
        echo ERROR: No se pudieron instalar las dependencias
        echo Ejecuta manualmente: pip install -r requirements_web.txt
        pause
        exit /b 1
    )
)

echo.
echo ========================================
echo    Iniciando Servidor...
echo ========================================
echo.
echo La web-app estara disponible en:
echo   - PC: http://localhost:5000
echo   - Movil: http://[IP_DE_TU_PC]:5000
echo.
echo Para encontrar tu IP, ejecuta 'ipconfig' en otra ventana
echo.
echo Presiona Ctrl+C para detener el servidor
echo.

python web_app.py

echo.
echo Servidor detenido.
pause
