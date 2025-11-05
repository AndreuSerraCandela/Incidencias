#!/usr/bin/env python3
"""
Script de prueba para la Web-App de Incidencias
Verifica que todas las dependencias estén instaladas y funcionen correctamente
"""

import sys
import os
import importlib
import subprocess
import requests
import time
import threading

def print_status(message, status="INFO"):
    """Imprimir mensaje con formato de estado"""
    colors = {
        "INFO": "\033[94m",    # Azul
        "SUCCESS": "\033[92m", # Verde
        "WARNING": "\033[93m", # Amarillo
        "ERROR": "\033[91m",   # Rojo
        "RESET": "\033[0m"     # Reset
    }
    
    print(f"{colors.get(status, '')}[{status}]{colors['RESET']} {message}")

def check_python_version():
    """Verificar versión de Python"""
    version = sys.version_info
    if version.major >= 3 and version.minor >= 8:
        print_status(f"Python {version.major}.{version.minor}.{version.micro} ✓", "SUCCESS")
        return True
    else:
        print_status(f"Python {version.major}.{version.minor}.{version.micro} - Se requiere Python 3.8+", "ERROR")
        return False

def check_dependencies():
    """Verificar que todas las dependencias estén instaladas"""
    dependencies = [
        'flask',
        'flask_cors', 
        'cv2',
        'PIL',
        'requests',
        'pyzbar',
        'numpy'
    ]
    
    missing_deps = []
    
    for dep in dependencies:
        try:
            if dep == 'cv2':
                import cv2
                print_status(f"OpenCV {cv2.__version__} ✓", "SUCCESS")
            elif dep == 'PIL':
                from PIL import Image
                print_status(f"Pillow {Image.__version__} ✓", "SUCCESS")
            elif dep == 'flask_cors':
                import flask_cors
                print_status(f"Flask-CORS ✓", "SUCCESS")
            else:
                module = importlib.import_module(dep)
                version = getattr(module, '__version__', '✓')
                print_status(f"{dep} {version} ✓", "SUCCESS")
        except ImportError:
            print_status(f"{dep} ❌", "ERROR")
            missing_deps.append(dep)
    
    if missing_deps:
        print_status(f"Dependencias faltantes: {', '.join(missing_deps)}", "WARNING")
        print_status("Ejecuta: pip install -r requirements_web.txt", "INFO")
        return False
    
    return True

def check_files():
    """Verificar que todos los archivos necesarios existan"""
    required_files = [
        'web_app.py',
        'templates/index.html',
        'static/css/style.css',
        'static/js/app.js',
        'requirements_web.txt'
    ]
    
    missing_files = []
    
    for file_path in required_files:
        if os.path.exists(file_path):
            print_status(f"{file_path} ✓", "SUCCESS")
        else:
            print_status(f"{file_path} ❌", "ERROR")
            missing_files.append(file_path)
    
    if missing_files:
        print_status(f"Archivos faltantes: {', '.join(missing_files)}", "WARNING")
        return False
    
    return True

def start_server():
    """Iniciar el servidor Flask en segundo plano"""
    try:
        # Iniciar servidor en proceso separado
        process = subprocess.Popen(
            [sys.executable, 'web_app.py'],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        
        # Esperar un poco para que el servidor se inicie
        time.sleep(3)
        
        if process.poll() is None:
            print_status("Servidor iniciado correctamente ✓", "SUCCESS")
            return process
        else:
            stdout, stderr = process.communicate()
            print_status("Error al iniciar servidor:", "ERROR")
            print_status(f"STDOUT: {stdout}", "ERROR")
            print_status(f"STDERR: {stderr}", "ERROR")
            return None
            
    except Exception as e:
        print_status(f"Error al iniciar servidor: {e}", "ERROR")
        return None

def test_server():
    """Probar que el servidor responda correctamente"""
    try:
        # Probar endpoint de salud
        response = requests.get('http://localhost:5015/health', timeout=5)
        if response.status_code == 200:
            print_status("Endpoint /health responde correctamente ✓", "SUCCESS")
            return True
        else:
            print_status(f"Endpoint /health responde con código {response.status_code}", "ERROR")
            return False
            
    except requests.exceptions.RequestException as e:
        print_status(f"Error al conectar con el servidor: {e}", "ERROR")
        return False

def test_qr_api():
    """Probar la API de escaneo de QR"""
    try:
        # Crear una imagen de prueba simple
        from PIL import Image, ImageDraw
        
        # Crear imagen de prueba
        img = Image.new('RGB', (200, 200), color='white')
        draw = ImageDraw.Draw(img)
        draw.rectangle([50, 50, 150, 150], outline='black', width=2)
        
        # Guardar temporalmente
        test_image_path = 'test_qr_image.png'
        img.save(test_image_path)
        
        # Leer y convertir a base64
        import base64
        with open(test_image_path, 'rb') as f:
            image_data = base64.b64encode(f.read()).decode('utf-8')
        
        # Probar API
        response = requests.post(
            'http://localhost:5000/api/scan-qr',
            data={'image_data': f'data:image/png;base64,{image_data}'},
            timeout=10
        )
        
        # Limpiar archivo temporal
        os.remove(test_image_path)
        
        if response.status_code == 404:  # No encontró QR (esperado)
            print_status("API de QR funciona correctamente ✓", "SUCCESS")
            return True
        elif response.status_code == 200:
            print_status("API de QR funciona correctamente ✓", "SUCCESS")
            return True
        else:
            print_status(f"API de QR responde con código {response.status_code}", "ERROR")
            return False
            
    except Exception as e:
        print_status(f"Error al probar API de QR: {e}", "ERROR")
        return False

def main():
    """Función principal de pruebas"""
    print("=" * 60)
    print("🧪 PRUEBAS DE LA WEB-APP DE INCIDENCIAS")
    print("=" * 60)
    
    tests_passed = 0
    total_tests = 5
    
    # Test 1: Versión de Python
    print("\n1️⃣ Verificando versión de Python...")
    if check_python_version():
        tests_passed += 1
    
    # Test 2: Dependencias
    print("\n2️⃣ Verificando dependencias...")
    if check_dependencies():
        tests_passed += 1
    
    # Test 3: Archivos
    print("\n3️⃣ Verificando archivos...")
    if check_files():
        tests_passed += 1
    
    # Test 4: Servidor
    print("\n4️⃣ Iniciando y probando servidor...")
    server_process = start_server()
    if server_process:
        if test_server():
            tests_passed += 1
        else:
            print_status("El servidor no responde correctamente", "ERROR")
    else:
        print_status("No se pudo iniciar el servidor", "ERROR")
    
    # Test 5: API
    print("\n5️⃣ Probando API...")
    if test_qr_api():
        tests_passed += 1
    
    # Resultados
    print("\n" + "=" * 60)
    print("📊 RESULTADOS DE LAS PRUEBAS")
    print("=" * 60)
    
    if tests_passed == total_tests:
        print_status(f"✅ TODAS LAS PRUEBAS PASARON ({tests_passed}/{total_tests})", "SUCCESS")
        print_status("🎉 La web-app está lista para usar!", "SUCCESS")
        print("\n📱 Para usar desde tu móvil:")
        print("   1. Asegúrate de estar en la misma red WiFi")
        print("   2. Encuentra la IP de tu PC con 'ipconfig'")
        print("   3. Abre http://[IP_DE_TU_PC]:5015 en tu móvil")
    else:
        print_status(f"❌ {total_tests - tests_passed} PRUEBAS FALLARON ({tests_passed}/{total_tests})", "ERROR")
        print_status("🔧 Revisa los errores anteriores y corrígelos", "WARNING")
    
    # Detener servidor si está ejecutándose
    if server_process:
        print("\n🛑 Deteniendo servidor...")
        server_process.terminate()
        server_process.wait()
        print_status("Servidor detenido", "INFO")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⏹️ Pruebas interrumpidas por el usuario")
    except Exception as e:
        print_status(f"Error inesperado: {e}", "ERROR")
        sys.exit(1)
