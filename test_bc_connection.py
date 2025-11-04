#!/usr/bin/env python3
"""
Script de prueba para verificar la conexión con Business Central
"""

import requests
import json
import base64
from config import get_bc_url, get_bc_auth_header, BC_CONFIG
import os

def test_bc_connection():
    """Prueba la conexión con Business Central"""
    try:
        print("🔍 Probando conexión con Business Central...")
        print(f"📍 URL: {get_bc_url()}")
        print(f"🏢 Empresa: {BC_CONFIG['company']}")
        print(f"⏱️  Timeout: {BC_CONFIG['timeout']} segundos")
        print("-" * 50)
        
        # Crear datos de prueba
        test_data = [{
            "qrtarea": "TEST_QR_001",
            "Id_Navision": "TEST_001",
            "document": [{
                "document": {
                    "url": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=",
                    "name": "test_image.jpg"
                }
            }]
        }]
        
        # Envolver en el formato que espera BC
        datos = {
            "jsonText": json.dumps(test_data)
        }
        
        # URL y parámetros para la petición
        url = get_bc_url()
        params = {"company": BC_CONFIG['company']}
        
        # Headers con autenticación
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": get_bc_auth_header()
        }
        
        print("📤 Enviando datos de prueba...")
        print(f"📋 Datos: {json.dumps(datos, indent=2)}")
        print("-" * 50)
        
        # Realizar la petición POST a BC
        response = requests.post(
            url,
            params=params,
            headers=headers,
            data=json.dumps(datos),
            timeout=BC_CONFIG['timeout']
        )
        
        print(f"📥 Respuesta recibida:")
        print(f"   Status Code: {response.status_code}")
        print(f"   Headers: {dict(response.headers)}")
        print(f"   Contenido: {response.text}")
        print("-" * 50)
        
        # Verificar si la petición fue exitosa
        if response.status_code in (200, 201, 204):
            print("✅ Conexión exitosa con Business Central!")
            return True
        else:
            print(f"❌ Error en la respuesta: {response.status_code}")
            return False
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Error de conexión: {str(e)}")
        return False
    except Exception as e:
        print(f"❌ Error interno: {str(e)}")
        return False

def test_with_real_image():
    """Prueba con una imagen real (archivo de prueba)"""
    try:
        print("\n🖼️  Probando con imagen real...")
        
        # Leer imagen de prueba si existe
        test_image_path = "test_frame.jpg"
        if not os.path.exists(test_image_path):
            print(f"⚠️  Archivo de imagen de prueba no encontrado: {test_image_path}")
            return False
        
        with open(test_image_path, 'rb') as f:
            image_bytes = f.read()
        
        # Convertir a base64
        image_base64 = base64.b64encode(image_bytes).decode('utf-8')
        
        # Crear datos con imagen real
        test_data = [{
            "qrtarea": "REAL_QR_TEST",
            "Id_Navision": "REAL_TEST_001",
            "document": [{
                "document": {
                    "url": f"data:image/jpeg;base64,{image_base64}",
                    "name": "real_test_image.jpg"
                }
            }]
        }]
        
        # Envolver en el formato que espera BC
        datos = {
            "jsonText": json.dumps(test_data)
        }
        
        # URL y parámetros para la petición
        url = get_bc_url()
        params = {"company": BC_CONFIG['company']}
        
        # Headers con autenticación
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": get_bc_auth_header()
        }
        
        print("📤 Enviando imagen real...")
        
        # Realizar la petición POST a BC
        response = requests.post(
            url,
            params=params,
            headers=headers,
            data=json.dumps(datos),
            timeout=BC_CONFIG['timeout']
        )
        
        print(f"📥 Respuesta con imagen real:")
        print(f"   Status Code: {response.status_code}")
        print(f"   Contenido: {response.text}")
        
        if response.status_code in (200, 201, 204):
            print("✅ Imagen enviada exitosamente a Business Central!")
            return True
        else:
            print(f"❌ Error al enviar imagen: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Error al probar con imagen real: {str(e)}")
        return False

if __name__ == "__main__":
    print("🚀 Iniciando pruebas de conexión con Business Central")
    print("=" * 60)
    
    # Prueba básica de conexión
    success1 = test_bc_connection()
    
    # Prueba con imagen real
    success2 = test_with_real_image()
    
    print("\n" + "=" * 60)
    print("📊 RESUMEN DE PRUEBAS:")
    print(f"   Conexión básica: {'✅ EXITOSA' if success1 else '❌ FALLIDA'}")
    print(f"   Envío de imagen: {'✅ EXITOSO' if success2 else '❌ FALLIDO'}")
    
    if success1 and success2:
        print("\n🎉 Todas las pruebas fueron exitosas!")
        print("   La aplicación está lista para usar con Business Central.")
    else:
        print("\n⚠️  Algunas pruebas fallaron.")
        print("   Revisa la configuración y la conectividad de red.")
