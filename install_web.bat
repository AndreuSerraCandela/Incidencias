@echo off
title Instalacion Robusta - Web-App de Incidencias
color 0E

echo ========================================
echo    Instalacion Robusta de Dependencias
echo    Web-App de Incidencias
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

echo Verificando pip...
pip --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: pip no esta disponible
    echo Ejecuta: python -m ensurepip --upgrade
    pause
    exit /b 1
)

echo.
echo ========================================
echo    Instalando dependencias basicas...
echo ========================================
echo.

echo Instalando Flask y dependencias web...
pip install Flask Flask-CORS Werkzeug
if %errorlevel% neq 0 (
    echo ERROR: No se pudo instalar Flask
    pause
    exit /b 1
)

echo Instalando utilidades...
pip install requests numpy
if %errorlevel% neq 0 (
    echo ERROR: No se pudo instalar utilidades basicas
    pause
    exit /b 1
)

echo.
echo ========================================
echo    Instalando procesamiento de imagenes...
echo ========================================
echo.

echo Intentando instalar opencv-python-headless (recomendado)...
pip install opencv-python-headless
if %errorlevel% neq 0 (
    echo.
    echo ADVERTENCIA: opencv-python-headless fallo
    echo Intentando alternativa: opencv-python...
    pip install opencv-python
    if %errorlevel% neq 0 (
        echo.
        echo ERROR: No se pudo instalar OpenCV
        echo La funcionalidad de camara estara limitada
        echo.
        echo Alternativas:
        echo 1. Instala Visual Studio Build Tools
        echo 2. Usa Python 3.11 o 3.12 en lugar de 3.13
        echo 3. Instala desde wheel precompilado
        echo.
        pause
    ) else (
        echo opencv-python instalado correctamente
    )
) else (
    echo opencv-python-headless instalado correctamente
)

echo Instalando Pillow...
pip install Pillow
if %errorlevel% neq 0 (
    echo ERROR: No se pudo instalar Pillow
    pause
    exit /b 1
)

echo.
echo ========================================
echo    Instalando escaneo QR...
echo ========================================
echo.

echo Instalando pyzbar...
pip install pyzbar
if %errorlevel% neq 0 (
    echo.
    echo ADVERTENCIA: pyzbar fallo
    echo Intentando instalar desde wheel...
    pip install --only-binary=all pyzbar
    if %errorlevel% neq 0 (
        echo.
        echo ERROR: No se pudo instalar pyzbar
        echo La funcionalidad de escaneo QR no estara disponible
        echo.
        echo Soluciones:
        echo 1. Instala Visual Studio Build Tools
        echo 2. Usa Python 3.11 o 3.12
        echo 3. Descarga wheel manualmente desde: https://www.lfd.uci.edu/~gohlke/pythonlibs/
        echo.
        pause
    ) else (
        echo pyzbar instalado desde wheel
    )
) else (
    echo pyzbar instalado correctamente
)

echo.
echo ========================================
echo    Verificando instalacion...
echo ========================================
echo.

echo Verificando dependencias instaladas...
python -c "import flask; print('Flask:', flask.__version__)"
python -c "import flask_cors; print('Flask-CORS: OK')"
python -c "import requests; print('Requests:', requests.__version__)"
python -c "import numpy; print('NumPy:', numpy.__version__)"

echo.
echo Verificando OpenCV...
python -c "import cv2; print('OpenCV:', cv2.__version__)" 2>nul
if %errorlevel% neq 0 (
    echo OpenCV: NO DISPONIBLE
) else (
    echo OpenCV: INSTALADO
)

echo.
echo Verificando Pillow...
python -c "from PIL import Image; print('Pillow:', Image.__version__)"
if %errorlevel% neq 0 (
    echo Pillow: NO DISPONIBLE
) else (
    echo Pillow: INSTALADO
)

echo.
echo Verificando pyzbar...
python -c "import pyzbar; print('pyzbar: OK')" 2>nul
if %errorlevel% neq 0 (
    echo pyzbar: NO DISPONIBLE
) else (
    echo pyzbar: INSTALADO
)

echo.
echo ========================================
echo    Instalacion completada!
echo ========================================
echo.

echo Para ejecutar la web-app:
echo 1. Ejecuta: python web_app.py
echo 2. O usa: start_web_app.bat
echo.
echo Para probar: python test_web_app.py
echo.

if exist "web_app.py" (
    echo ¿Quieres iniciar la web-app ahora? (S/N)
    set /p choice=
    if /i "%choice%"=="S" (
        echo.
        echo Iniciando web-app...
        python web_app.py
    )
) else (
    echo ADVERTENCIA: web_app.py no encontrado
    echo Asegurate de estar en el directorio correcto
)

echo.
pause
