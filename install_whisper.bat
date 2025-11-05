@echo off
echo ========================================
echo    INSTALANDO WHISPER PARA AUDIO
echo ========================================
echo.

echo Actualizando pip, setuptools y wheel...
python.exe -m pip install --upgrade pip setuptools wheel

echo.
echo Instalando dependencias necesarias para Whisper...
pip install ffmpeg-python

echo.
echo Instalando PyTorch (CPU version, compatible con Python 3.13)...
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

echo.
echo Instalando Whisper (version compatible con Python 3.13)...
echo NOTA: Si falla, intentaremos con una version alternativa...
pip install --upgrade --no-build-isolation openai-whisper

if errorlevel 1 (
    echo.
    echo La instalacion directa fallo. Intentando metodo alternativo...
    pip install --upgrade git+https://github.com/openai/whisper.git
)

echo.
echo ========================================
echo    INSTALACION COMPLETADA
echo ========================================
echo.
echo Whisper se descargara automaticamente la primera vez que se use.
echo El modelo "base" se usara para mejor rendimiento.
echo.
echo Si la instalacion fallo, puedes intentar:
echo   pip install openai-whisper --no-build-isolation
echo.
pause
