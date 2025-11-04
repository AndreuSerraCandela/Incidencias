@echo off
echo ========================================
echo    INSTALANDO FFMPEG PARA WHISPER
echo ========================================
echo.

echo Instalando FFmpeg usando chocolatey...
echo Si no tienes chocolatey instalado, se instalara automaticamente.

REM Verificar si chocolatey esta instalado
where choco >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Instalando Chocolatey...
    powershell -Command "Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))"
    echo Chocolatey instalado.
) else (
    echo Chocolatey ya esta instalado.
)

echo.
echo Instalando FFmpeg...
choco install ffmpeg -y

echo.
echo ========================================
echo    INSTALACION COMPLETADA
echo ========================================
echo.
echo FFmpeg se instalo correctamente.
echo Ahora puedes usar Whisper sin problemas.
echo.
pause
