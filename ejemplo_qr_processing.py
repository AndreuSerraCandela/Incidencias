#!/usr/bin/env python3
"""
Ejemplo de cómo se procesa el código QR para extraer el ID
"""

def extract_qr_id(qr_data):
    """Extrae el ID del QR que viene después de 'IdQr/'"""
    if not qr_data:
        return qr_data
    
    # Buscar 'IdQr/' en el código QR
    if 'IdQr/' in qr_data:
        # Extraer la parte después de 'IdQr/'
        qr_id = qr_data.split('IdQr/')[-1]
        print(f"🔍 QR original: {qr_data}")
        print(f"🆔 ID extraído: {qr_id}")
        return qr_id
    else:
        # Si no contiene 'IdQr/', usar el valor completo
        print(f"⚠️  QR no contiene 'IdQr/', usando valor completo: {qr_data}")
        return qr_data

def main():
    """Ejemplos de procesamiento de códigos QR"""
    print("🚀 Ejemplos de procesamiento de códigos QR")
    print("=" * 50)
    
    # Ejemplos de códigos QR
    ejemplos_qr = [
        "https://ejemplo.com/IdQr/12345",
        "https://bc220.malla.es/fijaciones/IdQr/FIJ001",
        "https://app.malla.es/tareas/IdQr/TASK2024",
        "QR_SIMPLE_SIN_URL",  # QR sin formato IdQr/
        "https://ejemplo.com/IdQr/",  # QR que termina en IdQr/
        "https://ejemplo.com/IdQr/ABC123/DEF456"  # QR con múltiples niveles
    ]
    
    print("📋 Procesando ejemplos de códigos QR:")
    print("-" * 50)
    
    for i, qr in enumerate(ejemplos_qr, 1):
        print(f"\n{i}. Procesando: {qr}")
        id_extraido = extract_qr_id(qr)
        print(f"   ✅ Resultado: {id_extraido}")
    
    print("\n" + "=" * 50)
    print("💡 Resumen del procesamiento:")
    print("   - Si el QR contiene 'IdQr/', se extrae la parte después")
    print("   - Si no contiene 'IdQr/', se usa el valor completo")
    print("   - El ID extraído se envía a Business Central como 'qrtarea'")
    
    # Ejemplo de cómo se vería en Business Central
    print("\n📤 Ejemplo de datos enviados a BC:")
    ejemplo_bc = {
        "jsonText": "[{\"qrtarea\":\"12345\",\"document\":[{\"document\":{\"url\":\"data:image/jpeg;base64,...\",\"name\":\"foto.jpg\"}}]}]"
    }
    print(f"   {ejemplo_bc}")

if __name__ == "__main__":
    main()
