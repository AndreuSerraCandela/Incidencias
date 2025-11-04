#!/usr/bin/env python3
"""
Script para generar iconos para la PWA de Incidencias Malla
"""

from PIL import Image, ImageDraw, ImageFont
import os

def create_icon(size, filename):
    """Crea un icono del tamaño especificado"""
    # Crear imagen con fondo azul
    img = Image.new('RGB', (size, size), color='#0066cc')
    draw = ImageDraw.Draw(img)
    
    # Calcular tamaño del texto
    text_size = size // 3
    try:
        # Intentar usar una fuente del sistema
        font = ImageFont.truetype("arial.ttf", text_size)
    except:
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", text_size)
        except:
            try:
                font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", text_size)
            except:
                # Usar fuente por defecto
                font = ImageFont.load_default()
    
    # Dibujar un círculo blanco en el centro
    circle_radius = size // 4
    circle_center = size // 2
    draw.ellipse([
        circle_center - circle_radius,
        circle_center - circle_radius,
        circle_center + circle_radius,
        circle_center + circle_radius
    ], fill='white')
    
    # Dibujar texto "F" en el centro
    text = "F"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    
    text_x = (size - text_width) // 2
    text_y = (size - text_height) // 2
    
    draw.text((text_x, text_y), text, fill='#0066cc', font=font)
    
    # Guardar icono
    img.save(filename, 'PNG')
    print(f"✅ Icono creado: {filename} ({size}x{size})")

def create_icons_directory():
    """Crea el directorio de iconos si no existe"""
    icons_dir = "static/icons"
    if not os.path.exists(icons_dir):
        os.makedirs(icons_dir)
        print(f"📁 Directorio creado: {icons_dir}")
    return icons_dir

def create_special_icons():
    """Crea iconos especiales para funcionalidades específicas"""
    icons_dir = "static/icons"
    
    # Icono para QR
    qr_icon = Image.new('RGB', (96, 96), color='#28a745')
    draw = ImageDraw.Draw(qr_icon)
    
    # Dibujar un cuadrado que simule un QR
    square_size = 60
    square_x = (96 - square_size) // 2
    square_y = (96 - square_size) // 2
    
    draw.rectangle([square_x, square_y, square_x + square_size, square_y + square_size], 
                  fill='white', outline='#28a745', width=3)
    
    # Agregar algunos puntos para simular QR
    for i in range(3):
        for j in range(3):
            if (i + j) % 2 == 0:
                dot_size = 8
                dot_x = square_x + 15 + i * 15
                dot_y = square_y + 15 + j * 15
                draw.ellipse([dot_x, dot_y, dot_x + dot_size, dot_y + dot_size], fill='#28a745')
    
    qr_icon.save(f"{icons_dir}/qr-icon-96x96.png", 'PNG')
    print(f"✅ Icono QR creado: {icons_dir}/qr-icon-96x96.png")
    
    # Icono para cámara
    camera_icon = Image.new('RGB', (96, 96), color='#17a2b8')
    draw = ImageDraw.Draw(camera_icon)
    
    # Dibujar un rectángulo que simule una cámara
    camera_width = 70
    camera_height = 50
    camera_x = (96 - camera_width) // 2
    camera_y = (96 - camera_height) // 2
    
    draw.rectangle([camera_x, camera_y, camera_x + camera_width, camera_y + camera_height], 
                  fill='white', outline='#17a2b8', width=3)
    
    # Agregar un círculo para el lente
    lens_radius = 15
    lens_center = 96 // 2
    draw.ellipse([
        lens_center - lens_radius,
        camera_y + 10,
        lens_center + lens_radius,
        camera_y + 10 + 2 * lens_radius
    ], fill='#17a2b8')
    
    camera_icon.save(f"{icons_dir}/camera-icon-96x96.png", 'PNG')
    print(f"✅ Icono cámara creado: {icons_dir}/camera-icon-96x96.png")

def main():
    """Función principal"""
    print("🎨 Generando iconos para la PWA de Incidencias Malla...")
    print("=" * 50)
    
    # Crear directorio de iconos
    icons_dir = create_icons_directory()
    
    # Tamaños de iconos requeridos
    icon_sizes = [16, 32, 57, 60, 72, 76, 96, 114, 120, 128, 144, 152, 180, 192, 384, 512]
    
    # Generar iconos principales
    for size in icon_sizes:
        filename = f"{icons_dir}/icon-{size}x{size}.png"
        create_icon(size, filename)
    
    # Crear iconos especiales
    create_special_icons()
    
    print("\n" + "=" * 50)
    print("🎯 Iconos generados correctamente!")
    print(f"📁 Ubicación: {icons_dir}/")
    print("📱 La PWA ahora tendrá iconos nativos en todos los dispositivos")
    print("\n💡 Para usar la PWA:")
    print("   1. Abre la app en tu móvil")
    print("   2. Toca 'Añadir a la Pantalla de Inicio'")
    print("   3. La app se instalará como una aplicación nativa")
    print("   4. Tendrá su propio icono y se abrirá en pantalla completa")

if __name__ == "__main__":
    main()
