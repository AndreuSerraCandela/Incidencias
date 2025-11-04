#!/bin/bash

echo "Instalando Aplicacion de Incidencias..."
echo

# Verificar si Python está instalado
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python3 no está instalado"
    echo "Por favor instala Python 3.7 o superior"
    exit 1
fi

echo "Python encontrado. Creando entorno virtual..."
python3 -m venv venv

echo "Activando entorno virtual..."
source venv/bin/activate

echo "Instalando dependencias..."
pip install -r requirements.txt

echo
echo "Instalacion completada exitosamente!"
echo
echo "Para ejecutar la aplicacion:"
echo "1. Activa el entorno virtual: source venv/bin/activate"
echo "2. Ejecuta: python main.py"
echo
