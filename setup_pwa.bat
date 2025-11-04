@echo off
echo ========================================
echo    Configuracion PWA - Incidencias Malla
echo ========================================
echo.

echo 🎨 Generando iconos para la PWA...
python generate_icons.py

echo.
echo 📁 Verificando estructura de archivos...
if not exist "static\icons" (
    echo ❌ Error: No se pudieron generar los iconos
    echo    Verifica que tengas Python y Pillow instalados
    pause
    exit /b 1
)

echo ✅ Iconos generados correctamente
echo.

echo 🚀 Iniciando la aplicacion PWA...
echo.
echo 💡 Para instalar la PWA en tu movil:
echo    1. Abre la app en tu navegador movil
echo    2. Toca "Añadir a la Pantalla de Inicio"
echo    3. La app se instalara como aplicacion nativa
echo.

python web_app.py

pause
