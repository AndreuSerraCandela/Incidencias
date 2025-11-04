#!/usr/bin/env python3
"""
Script de prueba para verificar la validación del base64
"""

import base64
import os

def test_base64_validation():
    """Prueba la validación del base64"""
    print("🧪 Probando validación de base64...")
    print("=" * 50)
    
    # Crear una imagen de prueba simple
    test_image_path = "test_frame.jpg"
    
    if os.path.exists(test_image_path):
        print(f"📁 Imagen de prueba encontrada: {test_image_path}")
        
        # Leer la imagen
        with open(test_image_path, 'rb') as f:
            image_bytes = f.read()
        
        print(f"📊 Tamaño de imagen: {len(image_bytes)} bytes")
        
        # Convertir a base64
        image_base64 = base64.b64encode(image_bytes).decode('utf-8')
        print(f"🔄 Convertido a base64: {len(image_base64)} caracteres")
        
        # Verificar que sea base64 válido
        try:
            decoded_bytes = base64.b64decode(image_base64)
            print(f"✅ Base64 válido - Decodificado: {len(decoded_bytes)} bytes")
            
            # Verificar que coincida con el original
            if decoded_bytes == image_bytes:
                print("✅ Los bytes coinciden perfectamente")
            else:
                print("❌ Los bytes no coinciden")
                
        except Exception as e:
            print(f"❌ Error al decodificar base64: {str(e)}")
        
        # Probar diferentes formatos
        print("\n🔍 Probando diferentes formatos:")
        
        # 1. Base64 puro
        print("1. Base64 puro:")
        print(f"   Longitud: {len(image_base64)}")
        print(f"   Primeros 50 chars: {image_base64[:50]}...")
        
        # 2. Data URL
        data_url = f"data:image/jpeg;base64,{image_base64}"
        print("2. Data URL:")
        print(f"   Longitud: {len(data_url)}")
        print(f"   Primeros 100 chars: {data_url[:100]}...")
        
        # 3. Verificar que se puede extraer correctamente
        if data_url.startswith('data:image'):
            extracted_base64 = data_url.split(',', 1)[1]
            print("3. Extracción de Data URL:")
            print(f"   Longitud extraída: {len(extracted_base64)}")
            print(f"   ¿Coincide con original? {extracted_base64 == image_base64}")
        
    else:
        print(f"⚠️  Imagen de prueba no encontrada: {test_image_path}")
        print("   Creando imagen de prueba simple...")
        
        # Crear una imagen de prueba simple (1x1 pixel negro)
        test_image_bytes = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.\' ",#\x1c\x1c(7),01444\x1f\'9=82<.342\xff\xc0\x00\x11\x08\x00\x01\x00\x01\x01\x01\x11\x00\x02\x11\x01\x03\x11\x01\xff\xc4\x00\x14\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x08\xff\xc4\x00\x14\x10\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xda\x00\x0c\x03\x01\x00\x02\x11\x03\x11\x00\x3f\x00\xaa\xff\xd9'
        
        # Convertir a base64
        image_base64 = base64.b64encode(test_image_bytes).decode('utf-8')
        print(f"🔄 Imagen de prueba creada y convertida a base64: {len(image_base64)} caracteres")
        
        # Verificar que sea válido
        try:
            decoded_bytes = base64.b64decode(image_base64)
            print(f"✅ Base64 válido - Decodificado: {len(decoded_bytes)} bytes")
        except Exception as e:
            print(f"❌ Error al decodificar base64: {str(e)}")

def test_base64_formats():
    """Prueba diferentes formatos de base64"""
    print("\n" + "=" * 50)
    print("🔍 Probando diferentes formatos de base64...")
    
    # Base64 válido
    valid_base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
    
    print(f"✅ Base64 válido: {len(valid_base64)} caracteres")
    
    # Verificar que se puede decodificar
    try:
        decoded = base64.b64decode(valid_base64)
        print(f"   Decodificado: {len(decoded)} bytes")
    except Exception as e:
        print(f"   ❌ Error: {str(e)}")
    
    # Base64 inválido
    invalid_base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kg=="
    
    print(f"❌ Base64 inválido: {len(invalid_base64)} caracteres")
    
    # Verificar que NO se puede decodificar
    try:
        decoded = base64.b64decode(invalid_base64)
        print(f"   ⚠️  Se pudo decodificar (no debería): {len(decoded)} bytes")
    except Exception as e:
        print(f"   ✅ Correcto - Error al decodificar: {str(e)}")

if __name__ == "__main__":
    print("🚀 Iniciando pruebas de validación de base64")
    
    # Probar con imagen real
    test_base64_validation()
    
    # Probar diferentes formatos
    test_base64_formats()
    
    print("\n" + "=" * 50)
    print("📊 RESUMEN DE PRUEBAS:")
    print("   - Verificación de base64 válido")
    print("   - Conversión de bytes a base64")
    print("   - Validación de formato data URL")
    print("   - Pruebas de base64 inválido")
