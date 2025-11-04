#!/usr/bin/env python3
"""
Script de prueba para verificar la compresión de imágenes
"""

import os
import base64
from PIL import Image
import io

def test_image_compression():
    """Prueba la compresión de imágenes"""
    print("🧪 Probando compresión de imágenes...")
    print("=" * 50)
    
    # Crear una imagen de prueba grande
    test_image_path = "test_frame.jpg"
    
    if os.path.exists(test_image_path):
        print(f"📁 Imagen de prueba encontrada: {test_image_path}")
        
        # Leer la imagen
        with open(test_image_path, 'rb') as f:
            image_bytes = f.read()
        
        original_size_mb = len(image_bytes) / (1024 * 1024)
        print(f"📊 Tamaño original: {original_size_mb:.2f} MB")
        
        # Comprimir imagen
        compressed_bytes = compress_image(image_bytes, quality=85, max_size_mb=5)
        
        compressed_size_mb = len(compressed_bytes) / (1024 * 1024)
        compression_ratio = (1 - compressed_size_mb / original_size_mb) * 100
        
        print(f"🔄 Resultado de compresión:")
        print(f"   Original: {original_size_mb:.2f} MB")
        print(f"   Comprimida: {compressed_size_mb:.2f} MB")
        print(f"   Ratio: {compression_ratio:.1f}%")
        
        # Convertir a base64
        original_base64 = base64.b64encode(image_bytes).decode('utf-8')
        compressed_base64 = base64.b64encode(compressed_bytes).decode('utf-8')
        
        print(f"\n📊 Comparación de base64:")
        print(f"   Original: {len(original_base64)} caracteres")
        print(f"   Comprimida: {len(compressed_base64)} caracteres")
        print(f"   Reducción: {((1 - len(compressed_base64) / len(original_base64)) * 100):.1f}%")
        
        # Calcular timeouts
        from config import get_timeout_for_image
        
        original_timeout = get_timeout_for_image(original_size_mb)
        compressed_timeout = get_timeout_for_image(compressed_size_mb)
        
        print(f"\n⏱️  Timeouts calculados:")
        print(f"   Original: {original_timeout} segundos")
        print(f"   Comprimida: {compressed_timeout} segundos")
        
    else:
        print(f"⚠️  Imagen de prueba no encontrada: {test_image_path}")
        print("   Creando imagen de prueba...")
        
        # Crear una imagen de prueba grande (1000x1000 píxeles)
        test_image = Image.new('RGB', (1000, 1000), color='red')
        
        # Guardar con alta calidad
        output_buffer = io.BytesIO()
        test_image.save(output_buffer, format='JPEG', quality=95)
        image_bytes = output_buffer.getvalue()
        
        print(f"🖼️  Imagen de prueba creada: {len(image_bytes) / (1024 * 1024):.2f} MB")
        
        # Probar compresión
        compressed_bytes = compress_image(image_bytes, quality=85, max_size_mb=1)
        
        print(f"🔄 Resultado de compresión:")
        print(f"   Original: {len(image_bytes) / (1024 * 1024):.2f} MB")
        print(f"   Comprimida: {len(compressed_bytes) / (1024 * 1024):.2f} MB")

def compress_image(image_bytes, quality=85, max_size_mb=10):
    """Comprime la imagen si es muy grande"""
    try:
        # Calcular tamaño en MB
        size_mb = len(image_bytes) / (1024 * 1024)
        print(f"📊 Tamaño de imagen: {size_mb:.2f} MB")
        
        # Si la imagen es menor al tamaño máximo, no comprimir
        if size_mb <= max_size_mb:
            print(f"✅ Imagen dentro del límite, no se comprime")
            return image_bytes
        
        # Abrir imagen con PIL
        image = Image.open(io.BytesIO(image_bytes))
        
        # Convertir a RGB si es necesario
        if image.mode in ('RGBA', 'LA', 'P'):
            image = image.convert('RGB')
        
        # Comprimir imagen
        output_buffer = io.BytesIO()
        image.save(output_buffer, format='JPEG', quality=quality, optimize=True)
        compressed_bytes = output_buffer.getvalue()
        
        # Calcular tamaño comprimido
        compressed_size_mb = len(compressed_bytes) / (1024 * 1024)
        compression_ratio = (1 - compressed_size_mb / size_mb) * 100
        
        print(f"🔄 Imagen comprimida: {size_mb:.2f} MB → {compressed_size_mb:.2f} MB")
        print(f"📉 Ratio de compresión: {compression_ratio:.1f}%")
        
        return compressed_bytes
        
    except Exception as e:
        print(f"⚠️  Error al comprimir imagen: {str(e)}")
        print(f"   Usando imagen original sin comprimir")
        return image_bytes

def test_timeout_calculation():
    """Prueba el cálculo de timeouts"""
    print("\n" + "=" * 50)
    print("⏱️  Probando cálculo de timeouts...")
    
    from config import get_timeout_for_image, BC_CONFIG
    
    test_sizes = [1, 5, 10, 15, 20, 25]
    
    for size in test_sizes:
        timeout = get_timeout_for_image(size)
        print(f"   {size:2d} MB → {timeout:3d} segundos")
    
    print(f"\n📋 Configuración actual:")
    print(f"   Timeout normal: {BC_CONFIG['timeout']} segundos")
    print(f"   Timeout imágenes grandes: {BC_CONFIG['timeout_large_images']} segundos")
    print(f"   Umbral de compresión: {BC_CONFIG['max_image_size_mb']} MB")

if __name__ == "__main__":
    print("🚀 Iniciando pruebas de compresión de imágenes")
    
    # Probar compresión
    test_image_compression()
    
    # Probar cálculo de timeouts
    test_timeout_calculation()
    
    print("\n" + "=" * 50)
    print("📊 RESUMEN DE PRUEBAS:")
    print("   - Compresión automática de imágenes grandes")
    print("   - Cálculo dinámico de timeouts")
    print("   - Optimización para Business Central")
