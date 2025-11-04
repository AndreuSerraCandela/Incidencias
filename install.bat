@echo off
echo Instalando Aplicacion de Incidencias...
echo.

REM Verificar si Python está instalado
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python no está instalado o no está en el PATH
    echo Por favor instala Python 3.7 o superior desde https://python.org
    pause
    exit /b 1
)

echo Python encontrado. Creando entorno virtual...
python -m venv venv

echo Activando entorno virtual...
call venv\Scripts\activate.bat

echo Instalando dependencias...
pip install -r requirements.txt

echo.
echo Instalacion completada exitosamente!
echo.
echo Para ejecutar la aplicacion:
echo 1. Activa el entorno virtual: venv\Scripts\activate.bat
echo 2. Ejecuta: python main.py
echo.
pause
