# Integración con Business Central

## Descripción

Esta aplicación web ahora incluye funcionalidad completa para enviar fotos y datos de incidencias directamente al servidor Business Central, siguiendo el procedimiento `PostFijacion`.

## 🔍 Procesamiento del Código QR

### Extracción del ID del QR

La aplicación procesa automáticamente el código QR para extraer solo la parte relevante:

- **Formato esperado**: `https://ejemplo.com/IdQr/ID_REAL`
- **ID extraído**: Solo la parte después de `IdQr/`
- **Ejemplo**: 
  - QR: `https://bc220.malla.es/incidencias/IdQr/FIJ001`
  - ID enviado a BC: `FIJ001`

### Función de Extracción

```python
def extract_qr_id(qr_data):
    """Extrae el ID del QR que viene después de 'IdQr/'"""
    if 'IdQr/' in qr_data:
        qr_id = qr_data.split('IdQr/')[-1]
        return qr_id
    else:
        return qr_data  # Usar valor completo si no contiene 'IdQr/'
```

### Ejemplos de Procesamiento

| Código QR Original | ID Extraído | Enviado a BC |
|-------------------|-------------|--------------|
| `https://ejemplo.com/IdQr/12345` | `12345` | ✅ |
| `https://bc220.malla.es/IdQr/FIJ001` | `FIJ001` | ✅ |
| `QR_SIMPLE_SIN_URL` | `QR_SIMPLE_SIN_URL` | ✅ |
| `https://ejemplo.com/IdQr/` | `` (vacío) | ⚠️ |

## Configuración

### 1. Configuración de Business Central

La configuración se encuentra en `config.py`:

```python
BC_CONFIG = {
    'base_url': 'https://bc220.malla.es',
    'endpoint': '/powerbi/ODataV4/Personal_PostFijacion',
    'company': 'Malla Publicidad',
    'credentials': {
        'username': 'debug',
        'password': 'Ib6343ds.'
    },
    'timeout': 30,
    'enable_compression': True         # Habilitar compresión
}
```

**⚠️ IMPORTANTE**: Cambia las credenciales por las reales de tu servidor Business Central.

### 2. Endpoint del Servidor

El endpoint debe coincidir con el procedimiento `PostFijacion` en tu servidor BC. Verifica que la ruta sea correcta.

## Funcionalidades Implementadas

### 1. API Principal: `/api/process-photo`

**Método**: POST  
**Descripción**: Procesa una foto y la envía automáticamente a Business Central

**Parámetros**:
- `image` o `image_data`: La imagen (archivo o base64)
- `qr_data`: Código QR escaneado (se extrae automáticamente el ID)

**Respuesta exitosa**:
```json
{
    "success": true,
    "message": "Foto procesada y enviada a Business Central correctamente",
    "filename": "photo_20241201_143022_a1b2c3d4.jpg",
    "qr_data": "https://ejemplo.com/IdQr/12345",
    "qr_id_extracted": "12345",
    "bc_response": {
        "success": true,
        "status_code": 200,
        "response_text": "OK"
    }
}
```

### 2. API de Compatibilidad: `/api/upload-to-server`

**Método**: POST  
**Descripción**: Mantiene compatibilidad con código existente, pero ahora envía a BC

### 3. API de Prueba: `/api/test-bc-connection`

**Método**: GET  
**Descripción**: Prueba la conexión con Business Central sin enviar datos reales

## Formato de Datos para Business Central

La aplicación envía los datos en el formato exacto que espera el procedimiento `PostFijacion`:

```json
{
    "jsonText": "[{\"qrtarea\":\"ID_EXTRAIDO_DEL_QR\",\"document\":[{\"document\":{\"url\":\"data:image/jpeg;base64,IMAGE_BASE64\",\"name\":\"filename.jpg\"}}]}]"
}
```

### Estructura de los Datos:

1. **qrtarea**: El ID extraído del código QR (después de 'IdQr/')
2. **document**: Array con la información del documento adjunto
   - **url**: Imagen en formato base64 con prefijo data URL
   - **name**: Nombre del archivo

## Flujo de Trabajo

1. **Usuario escanea QR** → Se obtiene el código QR completo
2. **Extracción del ID** → Se extrae la parte después de 'IdQr/'
3. **Usuario toma foto** → Se captura la imagen
4. **Procesamiento** → La imagen se convierte a base64
5. **Envío a BC** → Se envían los datos al servidor Business Central
6. **Respuesta** → Se confirma el envío exitoso o se reporta el error

## Pruebas

### Script de Prueba Automática

Ejecuta el script de prueba para verificar la conectividad:

```bash
python test_bc_connection.py
```

Este script:
- Prueba la conexión básica con BC
- Envía una imagen de prueba
- Muestra el resumen de resultados

### Script de Ejemplo de Procesamiento QR

Ejecuta el script de ejemplo para ver cómo se procesan los códigos QR:

```bash
python ejemplo_qr_processing.py
```

### Script de Prueba de Compresión de Imágenes

Ejecuta el script para probar la compresión automática:

```bash
python test_image_compression.py
```

### Script de Validación de Base64

Ejecuta el script para verificar la validación del base64:

```bash
python test_base64_validation.py
```

### Prueba Manual desde el Navegador

1. Inicia la aplicación web: `python web_app.py`
2. Accede a: `http://127.0.0.1:5005/api/test-bc-connection`
3. Verifica la respuesta en la consola

## Logs y Debugging

La aplicación incluye logs detallados del procesamiento del QR:

```
🔍 QR original: https://bc220.malla.es/incidencias/IdQr/FIJ001
🆔 ID extraído: FIJ001
=== JSON que se envía a Business Central ===
URL: https://bc220.malla.es/powerbi/ODataV4/Personal_PostFijacion
Params: {'company': 'Malla Publicidad'}
Headers: {'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Basic ...'}
QR ID extraído: FIJ001
Datos enviados: {"jsonText": "[{\"qrtarea\":\"FIJ001\",\"document\":[{\"document\":{\"url\":\"data:image/jpeg;base64,...\",\"name\":\"photo.jpg\"}}]}]"}
=============================================
```

## Manejo de Errores

### Errores de Conexión
- Timeout de conexión
- Servidor no disponible
- Problemas de red

### Errores de Autenticación
- Credenciales incorrectas
- Usuario sin permisos
- Token expirado

### Errores del Servidor
- Códigos de estado HTTP de error
- Respuestas de error del procedimiento BC
- Problemas de formato de datos

### Errores de Procesamiento QR
- QR sin formato esperado
- QR vacío o inválido
- Problemas de codificación

## Requisitos del Sistema

- Python 3.7+
- Librerías: `requests`, `flask`, `flask-cors`
- Acceso de red al servidor Business Central
- Credenciales válidas para BC

## Solución de Problemas

### Error 401 (Unauthorized)
- Verifica las credenciales en `config.py`
- Confirma que el usuario tenga permisos en BC

### Error 404 (Not Found)
- Verifica la URL del endpoint
- Confirma que el procedimiento `PostFijacion` existe

### Error 500 (Internal Server Error)
- Revisa los logs del servidor BC
- Verifica el formato de los datos enviados

### Timeout de Conexión
- Aumenta el valor de `timeout` en la configuración
- Verifica la conectividad de red

### Problemas con el QR
- Verifica que el QR contenga el formato esperado
- Confirma que no esté corrupto o mal escaneado

## Seguridad

- Las credenciales se almacenan en texto plano en `config.py`
- Considera usar variables de entorno para producción
- La autenticación usa Basic Auth (considera usar OAuth para producción)

## Próximos Pasos

1. **Configurar credenciales reales** en `config.py`
2. **Probar la conexión** con el script de prueba
3. **Verificar el endpoint** en tu servidor BC
4. **Probar con códigos QR reales** desde la aplicación web
5. **Monitorear logs** para detectar problemas
6. **Implementar manejo de errores** más robusto si es necesario

## ⚠️ IMPORTANTE: Formato del Base64

**Antes (incorrecto):**
```json
"url": "data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
```

**Ahora (correcto):**
```json
"url": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
```

La aplicación ahora:
- ✅ Valida que el base64 sea válido antes de enviarlo
- ✅ Envía solo el base64 puro (sin prefijo data:image)
- ✅ Incluye logs detallados para debugging
- ✅ Maneja errores de base64 inválido
- ✅ Comprime imágenes grandes automáticamente
- ✅ Ajusta timeouts según el tamaño de la imagen

## Pruebas
