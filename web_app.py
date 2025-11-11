from flask import Flask, render_template, request, jsonify, send_file, session
from flask_cors import CORS
import cv2
import numpy as np
from PIL import Image as PILImage
import base64
import requests
import json
import os
import io
from pyzbar.pyzbar import decode
import tempfile
from datetime import datetime
import uuid
from threading import Thread
import re

# Importar whisper de forma opcional (puede no estar instalado)
try:
    import whisper
    WHISPER_AVAILABLE = True
except ImportError:
    WHISPER_AVAILABLE = False
    print("⚠️ Whisper no está instalado. La funcionalidad de audio estará limitada.")

# Importar configuración
from config import *
from gtask_auth import GTaskAuth
from mobile_storage import MobileStorage

app = Flask(__name__)
CORS(app, resources={
    r"/api/*": {
        "origins": "*",
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "X-Device-ID"]
    }
})

# Configuración de sesión
app.secret_key = 'incidencias_malla_secret_key_2024'
app.config['SESSION_TYPE'] = 'filesystem'

# Middleware para logging de todas las peticiones
@app.before_request
def log_request_info():
    import sys
    print("=" * 50)
    print(f"🌐 Petición recibida: {request.method} {request.path}")
    print(f"🌐 URL completa: {request.url}")
    print(f"🌐 Headers: {dict(request.headers)}")
    print("=" * 50)
    sys.stdout.flush()
    sys.stderr.flush()

# ========================================
# SISTEMA DE GESTIÓN DE SESIONES POR DISPOSITIVO
# ========================================

class DeviceSessionManager:
    """Gestor de sesiones por dispositivo"""
    
    def __init__(self):
        self.sessions = {}  # {device_id: {user_data, gtask_auth, mobile_storage}}
    
    def create_device_session(self, device_id):
        """Crear una nueva sesión para un dispositivo"""
        if device_id not in self.sessions:
            self.sessions[device_id] = {
                'user_data': None,
                'gtask_auth': GTaskAuth(),
                'mobile_storage': MobileStorage(f'mobile_storage_{device_id}.json'),
                'created_at': datetime.now(),
                'last_activity': datetime.now()
            }
            print(f"📱 Nueva sesión creada para dispositivo: {device_id}")
        return self.sessions[device_id]
    
    def get_device_session(self, device_id):
        """Obtener la sesión de un dispositivo"""
        if device_id not in self.sessions:
            return self.create_device_session(device_id)
        return self.sessions[device_id]
    
    def update_activity(self, device_id):
        """Actualizar la última actividad de un dispositivo"""
        if device_id in self.sessions:
            self.sessions[device_id]['last_activity'] = datetime.now()
    
    def cleanup_expired_sessions(self, max_age_hours=24):
        """Limpiar sesiones expiradas"""
        now = datetime.now()
        expired_devices = []
        
        for device_id, session_data in self.sessions.items():
            age = now - session_data['last_activity']
            if age.total_seconds() > (max_age_hours * 3600):
                expired_devices.append(device_id)
        
        for device_id in expired_devices:
            del self.sessions[device_id]
            print(f"🗑️ Sesión expirada eliminada para dispositivo: {device_id}")
    
    def get_device_id_from_request(self, request):
        """Obtener el ID del dispositivo desde la petición"""
        # Intentar obtener desde header personalizado
        device_id = request.headers.get('X-Device-ID')
        if device_id:
            return device_id
        
        # Intentar obtener desde parámetros de la petición
        if request.is_json:
            data = request.get_json()
            device_id = data.get('device_id')
            if device_id:
                return device_id
        
        # Intentar obtener desde form data
        device_id = request.form.get('device_id')
        if device_id:
            return device_id
        
        # Generar un ID único si no se proporciona
        device_id = str(uuid.uuid4())
        print(f"🆔 ID de dispositivo generado: {device_id}")
        return device_id

# Instancia global del gestor de sesiones
session_manager = DeviceSessionManager()

def get_current_device_session():
    """Obtener la sesión del dispositivo actual"""
    device_id = session_manager.get_device_id_from_request(request)
    session_manager.update_activity(device_id)
    return session_manager.get_device_session(device_id)

def get_current_gtask_auth():
    """Obtener la instancia de GTaskAuth del dispositivo actual"""
    device_session = get_current_device_session()
    return device_session['gtask_auth']

def get_current_mobile_storage():
    """Obtener la instancia de MobileStorage del dispositivo actual"""
    device_session = get_current_device_session()
    return device_session['mobile_storage']

def get_current_user_id():
    """Obtener el ID del usuario actual del dispositivo actual"""
    gtask_auth = get_current_gtask_auth()
    return gtask_auth.get_current_user_id()

# Configuración para archivos temporales
UPLOAD_FOLDER = 'temp_uploads'
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max (aumentado para múltiples imágenes)

def compress_image(image_bytes, quality=85, max_size_mb=10):
    """Comprime la imagen si es muy grande"""
    try:
        from PIL import Image
        import io
        
        # Calcular tamaño en MB
        size_mb = len(image_bytes) / (1024 * 1024)
        print(f"📊 Tamaño original de imagen: {size_mb:.2f} MB")
        
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
        print(f"Error al comprimir imagen: {str(e)}")
        print(f"   Usando imagen original sin comprimir")
        return image_bytes

def clean_and_validate_base64(image_data):
    """Limpia y valida el base64 de la imagen"""
    try:
        # Si viene como data URL, extraer solo el base64
        if isinstance(image_data, str) and image_data.startswith('data:image'):
            # Extraer la parte después de la coma
            base64_part = image_data.split(',', 1)[1]
            print(f"Data URL detectada, extraído base64 de {len(image_data)} a {len(base64_part)} caracteres")
            return base64_part
        elif isinstance(image_data, str):
            # Si ya es base64 puro, validarlo
            base64.b64decode(image_data)
            print(f"✅ Base64 puro válido - Longitud: {len(image_data)} caracteres")
            return image_data
        else:
            # Si son bytes, convertirlos a base64
            base64_data = base64.b64encode(image_data).decode('utf-8')
            print(f"🔄 Bytes convertidos a base64 - Longitud: {len(base64_data)} caracteres")
            return base64_data
    except Exception as e:
        print(f"❌ Error al procesar base64: {str(e)}")
        raise ValueError(f"Formato de imagen inválido: {str(e)}")

def extract_qr_id(qr_data):
    """Extrae el ID del QR que viene después de 'IdQr/'"""
    if not qr_data:
        return qr_data
    
    # Buscar 'IdQr/' en el código QR
    if 'IdQr/' in qr_data:
        # Extraer la parte después de 'IdQr/'
        qr_id = qr_data.split('IdQr/')[-1]
        print(f"QR original: {qr_data}")
        print(f"ID extraído: {qr_id}")
        return qr_id
    else:
        # Si no contiene 'IdQr/', usar el valor completo
        print(f"QR no contiene 'IdQr/', usando valor completo: {qr_data}")
        return qr_data

@app.route('/')
def index():
    """Página principal de la aplicación"""
    return render_template('index.html')

@app.route('/api/scan-qr', methods=['POST'])
def scan_qr():
    """API para escanear códigos QR desde imágenes"""
    try:
        if 'image' not in request.files and 'image_data' not in request.form:
            return jsonify({'error': 'No se proporcionó imagen'}), 400
        
        # Obtener la imagen
        if 'image' in request.files:
            file = request.files['image']
            # Convertir a numpy array
            image_bytes = file.read()
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        else:
            # Imagen en base64
            image_data = request.form['image_data']
            if image_data.startswith('data:image'):
                image_data = image_data.split(',')[1]
            
            image_bytes = base64.b64decode(image_data)
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return jsonify({'error': 'No se pudo procesar la imagen'}), 400
        
        # Decodificar códigos QR
        decoded_objects = decode(img)
        
        if not decoded_objects:
            return jsonify({'error': 'No se encontraron códigos QR en la imagen'}), 404
        
        # Procesar resultados
        qr_results = []
        for obj in decoded_objects:
            qr_data = obj.data.decode('utf-8')
            qr_type = obj.type
            qr_id = extract_qr_id(qr_data)
            qr_results.append({
                'data': qr_data,
                'type': qr_type,
                'rect': obj.rect,
                'polygon': obj.polygon,
                'extracted_id': qr_id
            })
        
        return jsonify({
            'success': True,
            'qr_codes': qr_results,
            'count': len(qr_results)
        })
        
    except Exception as e:
        return jsonify({'error': f'Error al procesar imagen: {str(e)}'}), 500

@app.route('/api/process-photo', methods=['POST'])
def process_photo():
    """API para procesar fotos y enviarlas al servidor Business Central en segundo plano"""
    try:
        if 'image' not in request.files and 'image_data' not in request.form:
            return jsonify({'error': 'No se proporcionó imagen'}), 400
        
        qr_data = request.form.get('qr_data', '')
        
        # Extraer el ID del QR (parte después de 'IdQr/')
        qr_id = extract_qr_id(qr_data)
        
        # Obtener la imagen
        if 'image' in request.files:
            file = request.files['image']
            image_bytes = file.read()
        else:
            # Imagen en base64
            image_data = request.form['image_data']
            if image_data.startswith('data:image'):
                image_data = image_data.split(',')[1]
            image_bytes = base64.b64decode(image_data)
        
        # Comprimir imagen si es muy grande
        from config import BC_CONFIG
        compressed_image_bytes = compress_image(
            image_bytes, 
            quality=BC_CONFIG['compress_quality'],
            max_size_mb=BC_CONFIG['max_image_size_mb']
        )
        
        # Guardar imagen temporalmente (comprimida si fue necesario)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        unique_id = str(uuid.uuid4())[:8]
        filename = f"photo_{timestamp}_{unique_id}.jpg"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        
        with open(filepath, 'wb') as f:
            f.write(compressed_image_bytes)
        
        # Convertir a base64 para el procesamiento
        image_base64 = base64.b64encode(compressed_image_bytes).decode('utf-8')
        print(f"Imagen convertida a base64 - Longitud: {len(image_base64)} caracteres")
        
        # Primero consultar las tareas disponibles
        print(f"🔍 Consultando tareas para QR ID: {qr_id}")
        tasks_result = get_tasks_by_qr_id(qr_id)
        
        if not tasks_result['success']:
            return jsonify({
                'success': False,
                'error': f'Error al consultar tareas: {tasks_result["error"]}'
            }), 500
        
        # Procesar las tareas encontradas
        tasks = tasks_result.get('tasks', [])
        
        # Si no hay tareas, devolver error
        if not tasks or len(tasks) == 0:
            return jsonify({
                'success': False,
                'error': 'No se encontraron tareas para este QR ID',
                'requires_task_selection': False
            }), 404
        
        # Si hay más de una tarea, devolver para selección
        if len(tasks) > 1:
            return jsonify({
                'success': False,
                'error': 'Múltiples tareas encontradas',
                'requires_task_selection': True,
                'tasks': tasks,
                'message': 'Seleccione una tarea para continuar',
                'filename': filename,
                'qr_data': qr_data,
                'qr_id_extracted': qr_id
            }), 200  # 200 porque es una respuesta válida que requiere acción del usuario
        
        # Si hay exactamente una tarea, procesarla automáticamente
        selected_task = tasks[0]
        print(f"✅ Tarea única encontrada: {selected_task}")
        
        # Obtener device_id para pasarlo al hilo
        device_id = session_manager.get_device_id_from_request(request)
        
        # Iniciar proceso en segundo plano para enviar a Business Central
        thread = Thread(target=process_photo_async, args=(qr_id, filename, image_base64, qr_data, device_id))
        thread.daemon = True
        thread.start()
        
        print(f"Proceso iniciado en segundo plano para archivo: {filename}")
        
        return jsonify({
            'success': True,
            'message': 'Foto procesada. Se enviará a Business Central en segundo plano.',
            'filename': filename,
            'qr_data': qr_data,
            'qr_id_extracted': qr_id,
            'status': 'processing_in_background',
            'task_used': selected_task
        })
        
    except Exception as e:
        return jsonify({'error': f'Error al procesar foto: {str(e)}'}), 500

def process_photo_async(qr_id, filename, image_base64, qr_data, device_id, selected_task=None):
    """Función que se ejecuta en segundo plano para enviar la foto a Business Central"""
    try:
        print(f"Iniciando envío a Business Central en segundo plano para: {filename} (dispositivo: {device_id})")
        
        # Obtener la sesión del dispositivo específico
        device_session = session_manager.get_device_session(device_id)
        gtask_auth = device_session['gtask_auth']
        
        # Enviar al servidor Business Central usando la sesión del dispositivo
        bc_response = send_to_business_central_with_session(qr_id, filename, image_base64, selected_task, gtask_auth)
        
        if bc_response['success']:
            print(f"Enviado a BC exitosamente: {filename}")
        elif bc_response.get('requires_task_selection', False):
            print(f"Se requiere selección de tarea para: {filename}")
            print(f"Tareas disponibles: {bc_response.get('tasks', [])}")
            # En este caso, el proceso se detiene y requiere intervención del usuario
            # La lógica de selección se manejará en el frontend
        else:
            print(f"Error al enviar a BC: {filename} - {bc_response['error']}")
            
    except Exception as e:
        print(f"Error en proceso en segundo plano: {filename} - {str(e)}")

def convert_base64_to_url(base64_data, filename):
    """
    Convierte un base64 a URL usando el servicio de Malla
    Similar a la función AL FormBase64ToUrl
    """
    try:
        import os
        
        # Extraer la extensión del archivo
        file_ext = os.path.splitext(filename)[1].lower().lstrip('.')
        
        # Añadir el prefijo según el tipo de archivo
        if file_ext in ['jpg', 'jpeg', 'png', 'bmp', 'tif', 'tiff', 'gif']:
            base64_with_prefix = f'image/{file_ext};base64,{base64_data}'
        else:
            base64_with_prefix = f'application/{file_ext};base64,{base64_data}'
        
        # Preparar el JSON para la petición
        payload = {
            'base64': base64_with_prefix,
            'filename': filename
        }
        
        # URL del servicio de conversión
        url = 'https://base64-api.deploy.malla.es/save'
        
        # Hacer la petición POST con reintentos
        max_retries = 3
        retry_delay = 5  # segundos
        
        for attempt in range(max_retries):
            try:
                response = requests.post(
                    url,
                    json=payload,
                    timeout=30,
                    headers={'Content-Type': 'application/json'}
                )
                
                if response.status_code == 400:
                    error_msg = 'Request failed with status code 400'
                    print(f"⚠️ Error al guardar archivo (intento {attempt + 1}/{max_retries}): {error_msg}")
                    if attempt < max_retries - 1:
                        import time
                        time.sleep(retry_delay)
                        continue
                    else:
                        raise Exception('Error al guardar el archivo después de varios intentos')
                
                response.raise_for_status()
                result = response.json()
                
                # Extraer la URL y el ID
                url_result = result.get('url', '')
                file_id = result.get('_id', None)
                
                print(f"✅ Archivo convertido a URL: {url_result} (ID: {file_id})")
                return url_result, file_id
                
            except requests.exceptions.RequestException as e:
                print(f"⚠️ Error en intento {attempt + 1}/{max_retries}: {str(e)}")
                if attempt < max_retries - 1:
                    import time
                    time.sleep(retry_delay)
                else:
                    error_msg = f'Error al convertir base64 a URL después de {max_retries} intentos: {str(e)}'
                    print(f"❌ {error_msg}")
                    raise Exception(error_msg)
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"❌ Error al convertir base64 a URL: {str(e)}")
        print(f"📋 Traceback completo:\n{error_trace}")
        raise

def send_incidence_to_server_with_session(incidence_payload, gtask_auth):
    """Envía una incidencia al servidor Business Central usando la sesión específica del dispositivo."""
    print("=" * 50)
    print("🟢 send_incidence_to_server_with_session() LLAMADA")
    print(f"🟢 Payload keys: {list(incidence_payload.keys()) if incidence_payload else 'None'}")
    print("=" * 50)
    try:
        from config import get_bc_url, get_bc_incidences_url, get_bc_auth_header, BC_CONFIG
        
        # Validar payload mínimo
        required_fields = ['state', 'incidenceType', 'description']
        missing = [f for f in required_fields if f not in incidence_payload or incidence_payload.get(f) in (None, '')]
        if missing:
            return {
                'success': False,
                'error': f"Faltan campos requeridos en la incidencia: {', '.join(missing)}"
            }

        # Obtener ID del usuario actual de la sesión específica
        user_id = gtask_auth.get_current_user_id()
        if not user_id:
            return {
                'success': False,
                'error': 'No hay usuario autenticado'
            }

        # URL del endpoint de incidencias en Business Central
        # Intentar primero con endpoint específico de incidencias, si no existe, usar el de fijaciones
        url = get_bc_incidences_url()  # Intenta usar GtaskMalla_PostIncidencia, si no existe usa GtaskMalla_PostFijacion
        print(f"🟢 Usando endpoint de incidencias: {url}")

        # Convertir imágenes base64 a URLs antes de enviar a BC
        images = incidence_payload.get('image', [])
        images_with_urls = []
        
        print(f"📸 Convirtiendo {len(images)} imagen(es) de base64 a URL...")
        for img in images:
            try:
                img_data = img.get('file', '')
                img_name = img.get('name', 'image.jpg')
                file_id = img.get('file_id', '')
                
                # Si ya es una URL, usarla directamente
                if isinstance(img_data, str) and (img_data.startswith('http://') or img_data.startswith('https://')):
                    print(f"✅ Imagen ya es URL: {img_name}")
                    images_with_urls.append({
                        'file': img_data,
                        'name': img_name,
                        'file_id': file_id
                    })
                elif isinstance(img_data, str) and img_data.startswith('data:image'):
                    # Extraer el base64 del data URL
                    # Formato: data:image/jpeg;base64,/9j/4AAQ...
                    if ',' in img_data:
                        base64_data = img_data.split(',')[1]
                    else:
                        # Si no hay coma, intentar extraer después de base64,
                        base64_data = img_data.split('base64,')[1] if 'base64,' in img_data else img_data
                    # Convertir a URL
                    url, file_id = convert_base64_to_url(base64_data, img_name)
                    images_with_urls.append({
                        'file': url,
                        'name': img_name,
                        'file_id': file_id
                    })
                elif isinstance(img_data, str):
                    # Asumir que es base64 puro
                    url, file_id = convert_base64_to_url(img_data, img_name)
                    images_with_urls.append({
                        'file': url,
                        'name': img_name,
                        'file_id': file_id
                    })
                else:
                    print(f"⚠️ Formato de imagen no reconocido para {img_name}, enviando tal cual")
                    images_with_urls.append(img)
            except Exception as e:
                import traceback
                error_trace = traceback.format_exc()
                print(f"❌ Error al convertir imagen {img.get('name', 'desconocida')}: {str(e)}")
                print(f"📋 Traceback completo:\n{error_trace}")
                # En caso de error, enviar la imagen original
                images_with_urls.append(img)
        
        # Convertir audios base64 a URLs si los hay
        audios = incidence_payload.get('audio', [])
        audios_with_urls = []
        
        if audios:
            print(f"🎤 Convirtiendo {len(audios)} audio(s) de base64 a URL...")
            for audio in audios:
                try:
                    audio_data = audio.get('file', '') if isinstance(audio, dict) else audio
                    audio_name = audio.get('name', 'audio.mp3') if isinstance(audio, dict) else 'audio.mp3'
                    
                    # Si ya es una URL, usarla directamente
                    if isinstance(audio_data, str) and (audio_data.startswith('http://') or audio_data.startswith('https://')):
                        print(f"✅ Audio ya es URL: {audio_name}")
                        audios_with_urls.append(audio if isinstance(audio, dict) else {'file': audio_data, 'name': audio_name})
                    elif isinstance(audio_data, str):
                        # Si es data URL, extraer el base64
                        if audio_data.startswith('data:audio') or audio_data.startswith('data:application'):
                            if ',' in audio_data:
                                base64_data = audio_data.split(',')[1]
                            else:
                                base64_data = audio_data.split('base64,')[1] if 'base64,' in audio_data else audio_data
                        else:
                            base64_data = audio_data
                        # Convertir a URL
                        url, file_id = convert_base64_to_url(base64_data, audio_name)
                        audios_with_urls.append({
                            'file': url,
                            'name': audio_name,
                            'file_id': file_id
                        })
                    else:
                        print(f"⚠️ Formato de audio no reconocido, enviando tal cual")
                        audios_with_urls.append(audio if isinstance(audio, dict) else {'file': audio_data, 'name': audio_name})
                except Exception as e:
                    print(f"❌ Error al convertir audio: {str(e)}")
                    # En caso de error, enviar el audio original
                    audios_with_urls.append(audio if isinstance(audio, dict) else {'file': audio_data, 'name': audio_name})
        else:
            audios_with_urls = audios
        
        # Extraer el ID del resource (ej: "PARADA_P1171" -> "P1171")
        resource_id = incidence_payload.get('resource', '')
        if resource_id.startswith('PARADA_'):
            resource_id = resource_id.replace('PARADA_', '')
        
        # Crear documentos en el formato esperado por BC (similar a fijaciones)
        documents = [
        {
                "document": {
                    "file": img.get('file', ''),
                    "name": img.get('name', 'image.jpg'),
                    "file_id": img.get('file_id', '')
                }
            }
            for img in images_with_urls
        ]
        # Crear la estructura de datos para BC en formato de fijaciones
        # Si el endpoint de incidencias no existe, usar el formato de fijaciones
        bc_incidence_data = {
            "state": incidence_payload.get('state', 'PENDING'),
            "incidenceType": incidence_payload.get('incidenceType'),
            "observation": incidence_payload.get('observation', ''),
            "description": incidence_payload.get('description'),
            "resource": incidence_payload.get('resource'),
            "image": documents,
            "audio": audios_with_urls
        }

        # Envolver en el formato que espera BC
        try:
            json_text = json.dumps(bc_incidence_data, ensure_ascii=False)
        except (TypeError, ValueError) as e:
            print(f"❌ Error al serializar JSON para BC: {str(e)}")
            # Intentar serializar sin las imágenes si hay problema
            bc_incidence_data_safe = bc_incidence_data.copy()
            if bc_incidence_data_safe and 'document' in bc_incidence_data_safe[0]:
                bc_incidence_data_safe[0]['document'] = [{'document': {'url': '[imagen omitida]', 'name': 'image.jpg'}}]
            json_text = json.dumps(bc_incidence_data_safe, ensure_ascii=False)
            print(f"⚠️ Serializado sin imágenes para debugging")
        
        datos = {
            "jsonText": json_text
        }
        
        print(f"🟢 Formato de datos (primeros 300 chars): {json_text[:300]}...")

        # Parámetros para la petición (usar empresa por defecto o la del resource si está disponible)
        params = {"company": BC_CONFIG['company']}

        # Headers con autenticación BC
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": get_bc_auth_header()
        }

        print("=== Enviando incidencia a Business Central ===")
        print(f"URL: {url}")
        print(f"Params: {params}")
        print(f"User ID: {user_id}")
        try:
            print(f"Payload recibido: {json.dumps(incidence_payload, indent=2)}")
        except Exception as e:
            print(f"⚠️ No se pudo serializar payload para logging: {str(e)}")
            print(f"📊 Payload keys: {list(incidence_payload.keys()) if incidence_payload else 'None'}")
        try:
            print(f"Datos enviados (primeros 500 chars): {json.dumps(datos, indent=2)[:500]}...")
        except Exception as e:
            print(f"⚠️ No se pudo serializar datos para logging: {str(e)}")
        print("=============================================")

        # Realizar la petición POST a BC
        # Business Central puede requerir data=json.dumps() en lugar de json=
        # Intentar primero con data=json.dumps() como en get_tasks_by_qr_id
        print(f"🟢 Enviando petición POST a BC...")
        print(f"🟢 URL completa: {url}")
        print(f"🟢 Parámetros: {params}")
        print(f"🟢 Headers: {headers}")
        print(f"🟢 Datos (primeros 200 chars): {json.dumps(datos)[:200]}...")
        url = get_bc_incidences_url()  # Intenta usar GtaskMalla_PostIncidencia, si no existe usa GtaskMalla_PostFijacion
        print(f"🟢 Usando endpoint de incidencias: {url}")
        try:
            response = requests.post(
                url,
                params=params,
                headers=headers,
                data=json.dumps(datos),
                timeout=30
            )
            
            print(f"🟢 Respuesta de BC recibida:")
            print(f"🟢 Status code: {response.status_code}")
            print(f"🟢 Headers de respuesta: {dict(response.headers)}")
            print(f"🟢 Respuesta completa: {response.text}")
            import sys
            sys.stdout.flush()
            
        except requests.exceptions.RequestException as e:
            print(f"❌ Error de conexión con BC: {str(e)}")
            import traceback
            traceback.print_exc()
            raise

        # Verificar si la petición fue exitosa
        if response.status_code in (200, 201, 204):
            print(f"✅ Incidencia enviada correctamente a BC: {response.text}")
            return {
                'success': True,
                'status_code': response.status_code,
                'response_text': response.text
            }
        else:
            print(f"❌ Error al enviar incidencia a BC. Código: {response.status_code}")
            print(f"❌ Respuesta completa: {response.text}")
            print(f"❌ URL que falló: {url}")
            return {
                'success': False,
                'error': f'Error del servidor: {response.status_code}',
                'response_text': response.text
            }
            
    except requests.exceptions.RequestException as e:
        error_msg = f'Error de conexión con Business Central: {str(e)}'
        print("=" * 50)
        print("❌❌❌ ERROR DE CONEXIÓN CON BC ❌❌❌")
        print(f"❌ Error: {error_msg}")
        print(f"❌ Tipo: {type(e).__name__}")
        import traceback
        print(f"📋 Traceback:\n{traceback.format_exc()}")
        print("=" * 50)
        import sys
        sys.stdout.flush()
        return {
            'success': False,
            'error': error_msg
        }
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        error_msg = f'Error interno al enviar incidencia a Business Central: {str(e)}'
        print("=" * 50)
        print("❌❌❌ ERROR INTERNO EN send_incidence_to_server_with_session() ❌❌❌")
        print(f"❌ Error: {error_msg}")
        print(f"❌ Tipo: {type(e).__name__}")
        print(f"📋 Traceback completo:\n{error_trace}")
        print("=" * 50)
        import sys
        sys.stdout.flush()
        return {
            'success': False,
            'error': error_msg
        }

def get_tasks_by_qr_id(qr_id):
    """Función para consultar tareas por QR ID usando DevuelveArrayTareasxIdQr"""
    try:
        from config import get_bc_url, get_bc_auth_header, BC_CONFIG
        
        # URL para el endpoint de consulta de tareas
        # Asumiendo que el endpoint es similar al de PostFijacion pero para consultar tareas
        base_url = BC_CONFIG['base_url']
        tasks_endpoint = '/powerbi/ODataV4/GtaskMalla_devuelveidqr'
        url = f"{base_url}{tasks_endpoint}"
        
        # Preparar datos para la consulta
        # El procedimiento espera un JSON con el QR ID
        query_data = [{
            "qrtarea": qr_id
        }]
        
        # Envolver en el formato que espera BC
        datos = {
            "jsonText": json.dumps(query_data)
        }
        
        # Parámetros para la petición
        params = {"company": BC_CONFIG['company']}
        
        # Headers con autenticación
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": get_bc_auth_header()
        }
        
        print("=== Consultando tareas por QR ID ===")
        print(f"URL: {url}")
        print(f"QR ID: {qr_id}")
        print(f"Datos enviados: {json.dumps(datos, indent=2)}")
        print("====================================")
        
        # Realizar la petición GET a BC
        response = requests.post(
            url,
            params=params,
            headers=headers,
            data=json.dumps(datos),
            timeout=30
        )
        
        
        # Verificar si la petición fue exitosa
        if response.status_code in (200, 201, 204):
            print(f"✅ Tareas consultadas correctamente: {response.status_code}")
            try:
                # Parsear la respuesta JSON
                response_data = response.json()
                print(f"📋 Datos de tareas recibidos: {json.dumps(response_data, indent=2)}")
                
                # El servidor devuelve los datos en el campo 'value' como string JSON
                if 'value' in response_data and response_data['value']:
                    # Parsear el JSON string dentro de 'value'
                    tasks_json = response_data['value']
                    tasks_data = json.loads(tasks_json)
                    print(f"📋 Tareas parseadas: {json.dumps(tasks_data, indent=2)}")
                    
                    # Extraer las tareas del primer elemento (que contiene el idqr y las tareas)
                    if tasks_data and len(tasks_data) > 0:
                        first_item = tasks_data[0]
                        tasks = first_item.get('tareas', [])
                        print(f"📋 Tareas extraídas: {json.dumps(tasks, indent=2)}")
                        
                        return {
                            'success': True,
                            'tasks': tasks,
                            'status_code': response.status_code
                        }
                    else:
                        return {
                            'success': True,
                            'tasks': [],
                            'status_code': response.status_code
                        }
                else:
                    print(f"⚠️ No se encontró campo 'value' en la respuesta")
                    return {
                        'success': True,
                        'tasks': [],
                        'raw_response': response_data,
                        'status_code': response.status_code
                    }
                    
            except json.JSONDecodeError as e:
                # Si no es JSON válido, intentar parsear como texto
                print(f"⚠️ Error al parsear JSON: {str(e)}")
                print(f"⚠️ Respuesta no es JSON válido, contenido: {response.text}")
                return {
                    'success': True,
                    'tasks': [],
                    'raw_response': response.text,
                    'status_code': response.status_code
                }
        else:
            print(f"❌ Error al consultar tareas. Código: {response.status_code}")
            print(f"Respuesta: {response.text}")
            return {
                'success': False,
                'error': f'Error del servidor: {response.status_code}',
                'response_text': response.text
            }
            
    except requests.exceptions.RequestException as e:
        error_msg = f'Error de conexión al consultar tareas: {str(e)}'
        print(error_msg)
        return {
            'success': False,
            'error': error_msg
        }
    except Exception as e:
        error_msg = f'Error interno al consultar tareas: {str(e)}'
        print(error_msg)
        return {
            'success': False,
            'error': error_msg
        }

def send_to_business_central_with_session(qr_id, filename, image_base64, selected_task, gtask_auth):
    """Función para enviar datos al servidor Business Central usando una sesión específica"""
    try:
        from config import get_bc_url, get_bc_auth_header, BC_CONFIG
        
        # Validar que el base64 sea válido
        try:
            # Verificar que sea base64 válido
            base64.b64decode(image_base64)
            file_id = ''
            print(f"✅ Base64 válido - Longitud: {len(image_base64)} caracteres")
        except Exception as e:
            print(f"❌ Base64 inválido: {str(e)}")
            return {
                'success': False,
                'error': f'Base64 inválido: {str(e)}'
            }
        
        # Si no se proporciona una tarea seleccionada, consultar las tareas disponibles
        if selected_task is None:
            print(f"🔍 Consultando tareas para QR ID: {qr_id}")
            tasks_result = get_tasks_by_qr_id(qr_id)
            
            if not tasks_result['success']:
                return {
                    'success': False,
                    'error': f'Error al consultar tareas: {tasks_result["error"]}'
                }
            
            # Procesar las tareas encontradas
            tasks = tasks_result.get('tasks', [])
            
            # Si no hay tareas, devolver error
            if not tasks or len(tasks) == 0:
                return {
                    'success': False,
                    'error': 'No se encontraron tareas para este QR ID',
                    'requires_task_selection': False
                }
            
            # Si hay más de una tarea, devolver para selección
            if len(tasks) > 1:
                return {
                    'success': False,
                    'error': 'Múltiples tareas encontradas',
                    'requires_task_selection': True,
                    'tasks': tasks,
                    'message': 'Seleccione una tarea para continuar'
                }
            
            # Si hay exactamente una tarea, usarla automáticamente
            selected_task = tasks[0]
            print(f"✅ Tarea única encontrada: {selected_task}")
        
        # Validar que la tarea seleccionada tenga los campos necesarios
        if not selected_task or 'idnavision' not in selected_task or 'empresa' not in selected_task:
            return {
                'success': False,
                'error': 'Tarea seleccionada no válida: faltan campos requeridos'
            }
        
        # Crear el documento en el formato esperado por BC
        document_data = {
            "document": {
                "url": image_base64,  # Solo el base64 puro
                "name": filename,
                "file_id": file_id
            }
        }
        
        # Obtener ID del usuario actual de la sesión específica
        user_id = gtask_auth.get_current_user_id()
        if not user_id:
            return {
                'success': False,
                'error': 'No hay usuario autenticado'
            }
        
        print(f"Enviando datos con usuario ID: {user_id}")
        print(f"Tarea seleccionada - ID Navision: {selected_task['idnavision']}, Empresa: {selected_task['empresa']}")
        
        # Crear la estructura de datos para BC usando la tarea seleccionada
        fijacion_data = [{
            "qrtarea": qr_id,  # Usar el ID extraído del QR
            "idnavision": selected_task['idnavision'],  # ID de la tarea en Navision
            "empresa": selected_task['empresa'],  # Empresa de la tarea
            "user": user_id,    # ID del usuario de GTask
            "document": [document_data]
        }]
        
        # Envolver en el formato que espera BC
        datos = {
            "jsonText": json.dumps(fijacion_data)
        }
        
        # URL y parámetros para la petición
        url = get_bc_url()
        params = {"company": selected_task['empresa']}  # Usar la empresa de la tarea seleccionada
        
        # Headers con autenticación
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": get_bc_auth_header()
        }
        
        # Print del JSON para verificar el formato
        print("=== JSON que se envía a Business Central ===")
        print(f"URL: {url}")
        print(f"Params: {params}")
        print(f"Headers: {headers}")
        print(f"QR ID extraído: {qr_id}")
        print(f"ID Navision: {selected_task['idnavision']}")
        print(f"Empresa: {selected_task['empresa']}")
        print(f"Base64 longitud: {len(image_base64)} caracteres")
        print(f"Base64 primeros 50 chars: {image_base64[:50]}...")
        print(f"Datos enviados: {json.dumps(datos, indent=2)}")
        print("=============================================")
        
        # Calcular timeout basado en el tamaño de la imagen
        from config import get_timeout_for_image
        image_size_mb = len(image_base64) * 0.75 / (1024 * 1024)  # Aproximación del tamaño
        dynamic_timeout = get_timeout_for_image(image_size_mb)
        
        #print(f"Timeout configurado: {dynamic_timeout} segundos (imagen: {image_size_mb:.2f} MB)")
        
        # Realizar la petición POST a BC
        response = requests.post(
            url,
            params=params,
            headers=headers,
            data=json.dumps(datos)
        )
        
        # Verificar si la petición fue exitosa
        if response.status_code in (200, 201, 204):
            print(f"Datos enviados correctamente a BC: {response.status_code}")
            return {
                'success': True,
                'status_code': response.status_code,
                'response_text': response.text,
                'task_used': selected_task
            }
        else:
            print(f"Error al enviar datos a BC. Código: {response.status_code}")
            print(f"Respuesta: {response.text}")
            return {
                'success': False,
                'error': f'Error del servidor: {response.status_code}',
                'response_text': response.text
            }
            
    except requests.exceptions.RequestException as e:
        error_msg = f'Error de conexión con Business Central: {str(e)}'
        print(error_msg)
        return {
            'success': False,
            'error': error_msg
        }
    except Exception as e:
        error_msg = f'Error interno al enviar a Business Central: {str(e)}'
        print(error_msg)
        return {
            'success': False,
            'error': error_msg
        }

@app.route('/api/upload-to-server', methods=['POST'])
def upload_to_server():
    """API para subir la foto al servidor principal (mantenido por compatibilidad)"""
    try:
        qr_data = request.form.get('qr_data')
        image_data = request.form.get('image_data')
        user_id = request.form.get('user_id')
        device_session = get_current_device_session()
        gtask_auth = device_session['gtask_auth']
        qr_id = extract_qr_id(qr_data)
        if user_id:
            class TempGTaskAuth:
                def get_current_user_id(self):
                    return user_id
            
            temp_auth = TempGTaskAuth()
            bc_response= send_to_business_central_with_session(qr_id, "uploaded_photo.jpg", image_data, None, temp_auth)
        else:
            # Usar la sesión del dispositivo actual
           bc_response = send_to_business_central_with_session(qr_id, "uploaded_photo.jpg", image_data, None, gtask_auth)
        
        if not all([qr_data, image_data]):
            return jsonify({'error': 'Faltan datos requeridos'}), 400
        
        
        if bc_response['success']:
            return jsonify({
                'success': True,
                'message': 'Datos enviados a Business Central correctamente',
                'bc_response': bc_response
            })
        else:
            return jsonify({
                'error': f'Error al enviar a Business Central: {bc_response["error"]}'
            }), 500
        
    except Exception as e:
        return jsonify({'error': f'Error interno: {str(e)}'}), 500

@app.route('/api/get-tasks-by-qr', methods=['POST'])
def get_tasks_by_qr():
    """API para consultar tareas por QR ID"""
    try:
        data = request.get_json()
        qr_id = data.get('qr_id')
        
        if not qr_id:
            return jsonify({'error': 'QR ID es requerido'}), 400
        
        # Consultar tareas
        tasks_result = get_tasks_by_qr_id(qr_id)
        
        if tasks_result['success']:
            return jsonify({
                'success': True,
                'tasks': tasks_result.get('tasks', []),
                'count': len(tasks_result.get('tasks', []))
            })
        else:
            return jsonify({
                'success': False,
                'error': tasks_result['error']
            }), 500
        
    except Exception as e:
        return jsonify({'error': f'Error interno: {str(e)}'}), 500

@app.route('/api/convert-photo-to-url', methods=['POST'])
def convert_photo_to_url():
    """
    Convierte una foto base64 a URL inmediatamente al subirla
    Retorna la URL y el file_id para poder hacer rollback si es necesario
    """
    try:
        if not request.is_json:
            return jsonify({'success': False, 'error': 'Se requiere JSON'}), 400
        
        data = request.get_json()
        image_data = data.get('image')
        filename = data.get('filename', f'photo_{datetime.now().strftime("%Y%m%d_%H%M%S")}.jpg')
        
        if not image_data:
            return jsonify({'success': False, 'error': 'No se proporcionó imagen'}), 400
        
        # Normalizar base64 usando la función helper
        base64_data = clean_and_validate_base64(image_data)
        
        # Convertir a URL
        url, file_id = convert_base64_to_url(base64_data, filename)
        
        return jsonify({
            'success': True,
            'url': url,
            'file_id': file_id,
            'filename': filename
        })
        
    except Exception as e:
        import traceback
        print(f"❌ Error al convertir foto a URL: {str(e)}")
        print(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': f'Error al convertir foto a URL: {str(e)}'
        }), 500

@app.route('/api/delete-photo-url', methods=['POST'])
def delete_photo_url():
    """
    Elimina una foto del servidor usando el file_id (rollback)
    Nota: El servicio de Malla puede no tener endpoint de delete, pero lo intentamos
    """
    try:
        if not request.is_json:
            return jsonify({'success': False, 'error': 'Se requiere JSON'}), 400
        
        data = request.get_json()
        file_id = data.get('file_id')
        url = data.get('url')  # URL opcional para logging
        
        if not file_id:
            return jsonify({'success': False, 'error': 'No se proporcionó file_id'}), 400
        
        print(f"🗑️ Rollback: Eliminando foto con ID: {file_id}")
        if url:
            print(f"🗑️ URL de la foto: {url}")
        
        # URL del servicio de eliminación
        delete_url = 'https://base64-api.deploy.malla.es/delete'
        
        # Preparar el payload con el file_id
        payload = {
            '_id': file_id
        }
        
        # Hacer la petición DELETE con reintentos
        max_retries = 3
        retry_delay = 5  # segundos
        
        for attempt in range(max_retries):
            try:
                response = requests.delete(
                    delete_url,
                    json=payload,
                    timeout=30,
                    headers={'Content-Type': 'application/json'}
                )
                
                if response.status_code == 200 or response.status_code == 204:
                    print(f"✅ Foto eliminada exitosamente del servidor (ID: {file_id})")
                    return jsonify({
                        'success': True,
                        'message': 'Foto eliminada exitosamente del servidor'
                    })
                elif response.status_code == 404:
                    # La foto ya no existe, considerar como éxito
                    print(f"⚠️ Foto no encontrada en el servidor (ID: {file_id}) - ya eliminada")
                    return jsonify({
                        'success': True,
                        'message': 'Foto no encontrada (ya eliminada)'
                    })
                else:
                    error_msg = f'Request failed with status code {response.status_code}'
                    print(f"⚠️ Error al eliminar foto (intento {attempt + 1}/{max_retries}): {error_msg}")
                    if attempt < max_retries - 1:
                        import time
                        time.sleep(retry_delay)
                        continue
                    else:
                        raise Exception(f'Error al eliminar el archivo después de {max_retries} intentos: {error_msg}')
                
            except requests.exceptions.RequestException as e:
                print(f"⚠️ Error en intento {attempt + 1}/{max_retries}: {str(e)}")
                if attempt < max_retries - 1:
                    import time
                    time.sleep(retry_delay)
                else:
                    error_msg = f'Error al eliminar foto después de {max_retries} intentos: {str(e)}'
                    print(f"❌ {error_msg}")
                    raise Exception(error_msg)
        
        # Si llegamos aquí, algo salió mal
        raise Exception('Error al eliminar foto: se agotaron los intentos')
        
    except Exception as e:
        print(f"❌ Error al eliminar foto (rollback): {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Error al eliminar foto: {str(e)}'
        }), 500

@app.route('/api/process-photo-with-task', methods=['POST'])
def process_photo_with_task():
    """API para procesar foto con tarea seleccionada"""
    try:
        qr_data = request.form.get('qr_data')
        image_data = request.form.get('image_data')
        selected_task_json = request.form.get('selected_task')
        
        if not all([qr_data, image_data, selected_task_json]):
            return jsonify({'error': 'Faltan datos requeridos'}), 400
        
        # Parsear la tarea seleccionada
        try:
            selected_task = json.loads(selected_task_json)
        except json.JSONDecodeError:
            return jsonify({'error': 'Formato de tarea seleccionada inválido'}), 400
        
        # Extraer el ID del QR
        qr_id = extract_qr_id(qr_data)
        
        # Procesar imagen
        image_base64 = clean_and_validate_base64(image_data)
        
        # Comprimir imagen si es necesario
        from config import BC_CONFIG
        image_bytes = base64.b64decode(image_base64)
        compressed_image_bytes = compress_image(
            image_bytes, 
            quality=BC_CONFIG['compress_quality'],
            max_size_mb=BC_CONFIG['max_image_size_mb']
        )
        image_base64 = base64.b64encode(compressed_image_bytes).decode('utf-8')
        
        # Generar nombre de archivo
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        unique_id = str(uuid.uuid4())[:8]
        filename = f"photo_{timestamp}_{unique_id}.jpg"
        
        # Guardar imagen temporalmente
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        with open(filepath, 'wb') as f:
            f.write(compressed_image_bytes)
        
        # Obtener la sesión del dispositivo actual
        device_session = get_current_device_session()
        gtask_auth = device_session['gtask_auth']
        
        # Enviar a Business Central con la tarea seleccionada
        bc_response = send_to_business_central_with_session(qr_id, filename, image_base64, selected_task, gtask_auth)
        
        if bc_response['success']:
            return jsonify({
                'success': True,
                'message': 'Foto procesada y enviada a Business Central correctamente',
                'filename': filename,
                'task_used': bc_response.get('task_used'),
                'bc_response': bc_response
            })
        else:
            return jsonify({
                'success': False,
                'error': bc_response['error'],
                'bc_response': bc_response
            }), 500
        
    except Exception as e:
        return jsonify({'error': f'Error interno: {str(e)}'}), 500

@app.route('/api/incidence-types', methods=['GET'])
def get_incidence_types():
    """API para obtener los tipos de incidencia disponibles"""
    try:
        from config import get_incidence_types, get_default_incidence_type
        
        types = get_incidence_types()
        default_type = get_default_incidence_type()
        
        return jsonify({
            'success': True,
            'types': types,
            'default_type': default_type,
            'count': len(types)
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Error interno: {str(e)}'
        }), 500

@app.route('/api/process-audio', methods=['POST'])
def process_audio():
    """
    Procesar audio con Whisper y extraer información de parada
    """
    try:
        if not request.is_json:
            return jsonify({'success': False, 'error': 'Se requiere JSON en el cuerpo'}), 400

        data = request.get_json()
        audio_base64 = data.get('audio')
        
        if not audio_base64:
            return jsonify({'success': False, 'error': 'No se proporcionó audio'}), 400

        print("🎤 Procesando audio con Whisper...")
        
        # Procesar audio con Whisper
        whisper_result = process_audio_with_whisper(audio_base64)
        
        if not whisper_result['success']:
            return jsonify({
                'success': False, 
                'error': f"Error en transcripción: {whisper_result['error']}"
            }), 500

        # Extraer información de parada
        transcribed_text = whisper_result['text']
        stop_info = extract_stop_info(transcribed_text)
        
        print(f"🎤 Texto transcrito: {transcribed_text}")
        print(f"🚏 Información extraída: {stop_info}")
        
        return jsonify({
            'success': True,
            'transcribed_text': transcribed_text,
            'stop_number': stop_info['stop_number'],
            'description': stop_info['description'],
            'language': whisper_result.get('language', 'es')
        })

    except Exception as e:
        print(f"❌ Error procesando audio: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/process-image-ai', methods=['POST'])
def process_image_ai():
    """
    Procesar imagen con LM Studio para extraer número de parada e incidencia
    """
    try:
        if not request.is_json:
            return jsonify({'success': False, 'error': 'Se requiere JSON en el cuerpo'}), 400

        data = request.get_json()
        image_base64 = data.get('image')
        
        if not image_base64:
            return jsonify({'success': False, 'error': 'No se proporcionó imagen'}), 400

        # Verificar que la imagen viene en el formato correcto
        if isinstance(image_base64, str):
            print(f"📸 Imagen recibida (tipo: string, longitud: {len(image_base64)} caracteres)")
            if image_base64.startswith('data:image'):
                print("✅ Imagen en formato data URL detectada")
            else:
                print("⚠️ Imagen no parece estar en formato data URL")
        else:
            print(f"⚠️ Imagen recibida en formato no esperado: {type(image_base64)}")

        print("🤖 Procesando imagen con LM Studio...")
        
        # Procesar imagen con LM Studio
        ai_result = process_image_with_lm_studio(image_base64)
        
        if not ai_result['success']:
            return jsonify({
                'success': False, 
                'error': f"Error en procesamiento IA: {ai_result['error']}"
            }), 500
        
        print(f"🤖 Resultados de IA: {ai_result}")
        print(f"📋 stop_number recibido: {ai_result.get('stop_number')}")
        print(f"📋 description recibida: {ai_result.get('description')}")
        
        # Asegurar que siempre tenemos valores válidos
        stop_num = ai_result.get('stop_number')
        desc = ai_result.get('description', 'Sin incidencia visible')
        
        if not desc or desc.strip() == '':
            desc = 'Sin incidencia visible'
        
        return jsonify({
            'success': True,
            'stop_number': stop_num,
            'description': desc,
            'raw_response': ai_result.get('raw_response', '')
        })

    except Exception as e:
        print(f"❌ Error procesando imagen con IA: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/test', methods=['GET'])
def test_endpoint():
    """Endpoint de prueba simple"""
    print("=" * 50)
    print("✅ TEST ENDPOINT LLAMADO")
    print("=" * 50)
    import sys
    sys.stdout.flush()
    return jsonify({'success': True, 'message': 'Test endpoint funciona'}), 200

@app.route('/api/incidences', methods=['POST', 'OPTIONS'])
def create_incidence():
    """Crea una incidencia en el servidor GTask usando la sesión por dispositivo.
    Espera un JSON con la estructura:
    {
      "state": "PENDING",
      "incidenceType": "65a1b2...",
      "observation": "...",
      "description": "...",
      "resource": "65a1b2...",
      "image": ["document":{"file": "data:image/...;base64,....", "name": "imagen1.jpg"}, ...]
    }
    """
    import sys
    print("=" * 50)
    print("🔵 create_incidence() LLAMADA")
    print(f"🔵 Método: {request.method}")
    print(f"🔵 URL: {request.url}")
    print(f"🔵 Headers: {dict(request.headers)}")
    print("=" * 50)
    sys.stdout.flush()
    sys.stderr.flush()
    
    # Manejar preflight de CORS
    if request.method == 'OPTIONS':
        print("🔵 Respondiendo a OPTIONS (preflight CORS)")
        response = jsonify({'status': 'ok'})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type, X-Device-ID')
        response.headers.add('Access-Control-Allow-Methods', 'POST, OPTIONS')
        return response
    
    print("🔵 Procesando petición POST...")
    try:
        print("🔵 Verificando si es JSON...")
        if not request.is_json:
            print("❌ No es JSON")
            return jsonify({'success': False, 'error': 'Se requiere JSON en el cuerpo'}), 400

        print("🔵 Obteniendo payload...")
        payload = request.get_json()
        print(f"🔵 Payload recibido (tipo: {type(payload)})")
        
        print("=== CREANDO INCIDENCIA ===")
        try:
            # Intentar serializar el payload para logging (puede fallar si es muy grande)
            payload_str = json.dumps(payload, indent=2)
            print(f"Payload recibido: {payload_str}")
        except Exception as e:
            print(f"⚠️ No se pudo serializar payload completo para logging: {str(e)}")
            print(f"📊 Payload keys: {list(payload.keys()) if payload else 'None'}")
            if payload:
                print(f"📊 Tamaño de imágenes: {len(payload.get('image', []))} imágenes")
                print(f"📊 Tamaño de audio: {len(payload.get('audio', []))} audios")
        print("=========================")
        
        # Validar que el payload no esté vacío
        if not payload:
            return jsonify({'success': False, 'error': 'El payload está vacío'}), 400
        
        # Obtener sesión del dispositivo
        try:
            device_session = get_current_device_session()
            if not device_session:
                return jsonify({'success': False, 'error': 'No se pudo obtener la sesión del dispositivo'}), 500
            gtask_auth = device_session.get('gtask_auth')
            if not gtask_auth:
                return jsonify({'success': False, 'error': 'No se pudo obtener la autenticación GTask'}), 500
        except Exception as e:
            import traceback
            error_trace = traceback.format_exc()
            print(f"❌ Error al obtener sesión del dispositivo: {str(e)}")
            print(f"📋 Traceback completo:\n{error_trace}")
            return jsonify({'success': False, 'error': f'Error al obtener sesión: {str(e)}'}), 500
        
        # Enviar incidencia
        try:
            result = send_incidence_to_server_with_session(payload, gtask_auth)
            status = 200 if result.get('success') else 500
            return jsonify(result), status
        except Exception as e:
            import traceback
            error_trace = traceback.format_exc()
            print("=" * 50)
            print("❌❌❌ ERROR EN create_incidence() ❌❌❌")
            print(f"❌ Error: {str(e)}")
            print(f"❌ Tipo de error: {type(e).__name__}")
            print(f"📋 Traceback completo:\n{error_trace}")
            print("=" * 50)
            return jsonify({'success': False, 'error': f'Error al enviar incidencia: {str(e)}'}), 500

    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print("=" * 50)
        print("❌❌❌ ERROR GLOBAL EN create_incidence() ❌❌❌")
        print(f"❌ Error: {str(e)}")
        print(f"❌ Tipo de error: {type(e).__name__}")
        print(f"📋 Traceback completo:\n{error_trace}")
        print("=" * 50)
        import sys
        sys.stdout.flush()
        return jsonify({'success': False, 'error': f'Error interno: {str(e)}'}), 500

@app.route('/api/test-bc-connection', methods=['GET'])
def test_bc_connection():
    """API para probar la conexión con Business Central"""
    try:
        from config import get_bc_url, get_bc_auth_header, BC_CONFIG
        
        # Crear datos de prueba (simulando un QR con formato IdQr/ID)
        test_data = [{
            "qrtarea": "TEST_001",  # Solo el ID extraído
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
        
        print("=== Probando conexión con Business Central ===")
        print(f"URL: {url}")
        print(f"Params: {params}")
        print(f"Headers: {headers}")
        print("=============================================")
        
        # Realizar la petición POST a BC
        response = requests.post(
            url,
            params=params,
            headers=headers,
            data=json.dumps(datos),
            timeout=BC_CONFIG['timeout']
        )
        
        return jsonify({
            'success': True,
            'test_url': url,
            'status_code': response.status_code,
            'response_text': response.text,
            'headers_sent': headers,
            'data_sent': datos
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Error al probar conexión: {str(e)}'
        }), 500

# ========================================
# RUTAS DE AUTENTICACIÓN GTASK
# ========================================

@app.route('/api/gtask/login', methods=['POST'])
def gtask_login():
    """API para login en GTask"""
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        device_id = data.get('device_id')
        
        if not username or not password:
            return jsonify({
                'success': False,
                'error': 'Usuario y contraseña son requeridos'
            }), 400
        
        # Obtener la sesión del dispositivo actual
        device_session = get_current_device_session()
        gtask_auth = device_session['gtask_auth']
        mobile_storage = device_session['mobile_storage']
        
        print(f"🔐 Intentando login para usuario: {username} en dispositivo: {device_id}")
        
        # Realizar login en GTask
        login_result = gtask_auth.login(username, password)
        
        if login_result['success']:
            # Guardar sesión en el dispositivo
            device_session['user_data'] = gtask_auth.current_user
            
            # Guardar en almacenamiento móvil del dispositivo
            mobile_storage.save_user_session(
                gtask_auth.current_user,
                gtask_auth.access_token,
                gtask_auth.token_expiry
            )
            
            print(f"✅ Login exitoso para: {username} en dispositivo: {device_id}")
            
            return jsonify({
                'success': True,
                'message': 'Login exitoso',
                'user': gtask_auth.current_user,
                'device_id': device_id
            })
        else:
            return jsonify(login_result), 401
            
    except Exception as e:
        print(f"💥 Error en login: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Error interno: {str(e)}'
        }), 500

@app.route('/api/gtask/users', methods=['GET'])
def gtask_get_users():
    """API para obtener lista de usuarios de GTask"""
    try:
        # Obtener la sesión del dispositivo actual
        device_session = get_current_device_session()
        gtask_auth = device_session['gtask_auth']
        mobile_storage = device_session['mobile_storage']
        
        # Verificar si hay sesión activa
        if not device_session['user_data']:
            return jsonify({
                'success': False,
                'error': 'No hay sesión activa'
            }), 401
        
        print(f"👥 Obteniendo lista de usuarios para: {device_session['user_data'].get('username')}")
        
        # Intentar obtener del cache local primero
        cached_users = mobile_storage.get_users_list()
        if cached_users:
            return jsonify({
                'success': True,
                'users': cached_users,
                'source': 'cache',
                'count': len(cached_users)
            })
        
        # Si no hay cache, obtener desde GTask
        users_result = gtask_auth.get_users_list()
        
        if users_result['success']:
            # Guardar en cache local
            mobile_storage.save_users_list(users_result['users'])
            
            return jsonify({
                'success': True,
                'users': users_result['users'],
                'source': 'gtask',
                'count': users_result['count']
            })
        else:
            return jsonify(users_result), 500
            
    except Exception as e:
        print(f"💥 Error al obtener usuarios: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Error interno: {str(e)}'
        }), 500

@app.route('/api/gtask/logout', methods=['POST'])
def gtask_logout():
    """API para logout de GTask"""
    try:
        # Obtener la sesión del dispositivo actual
        device_session = get_current_device_session()
        gtask_auth = device_session['gtask_auth']
        mobile_storage = device_session['mobile_storage']
        
        username = device_session['user_data'].get('username', 'Usuario') if device_session['user_data'] else 'Usuario'
        
        # Limpiar sesión del dispositivo
        device_session['user_data'] = None
        
        # Limpiar almacenamiento móvil del dispositivo
        mobile_storage.clear_user_session()
        
        # Limpiar autenticador del dispositivo
        gtask_auth.logout()
        
        print(f"👋 Logout exitoso para: {username}")
        
        return jsonify({
            'success': True,
            'message': 'Logout exitoso'
        })
        
    except Exception as e:
        print(f"💥 Error en logout: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Error interno: {str(e)}'
        }), 500

@app.route('/api/gtask/status', methods=['GET'])
def gtask_status():
    """API para verificar estado de la sesión"""
    try:
        # Obtener la sesión del dispositivo actual
        device_session = get_current_device_session()
        gtask_auth = device_session['gtask_auth']
        mobile_storage = device_session['mobile_storage']
        
        # Verificar si hay sesión activa en el dispositivo
        if device_session['user_data']:
            # Verificar si el token sigue siendo válido
            if gtask_auth.is_token_valid():
                return jsonify({
                    'success': True,
                    'is_authenticated': True,
                    'user': {
                        '_id': device_session['user_data']['_id'],
                        'username': device_session['user_data']['username']
                    },
                    'token_valid': True
                })
            else:
                # Token expirado, limpiar sesión del dispositivo
                device_session['user_data'] = None
                mobile_storage.clear_user_session()
                gtask_auth.logout()
                
                return jsonify({
                    'success': True,
                    'is_authenticated': False,
                    'message': 'Sesión expirada'
                })
        
        # Si no hay sesión activa, verificar en almacenamiento móvil del dispositivo
        user_session = mobile_storage.get_user_session()
        if user_session and user_session.get('user_id') and user_session.get('username'):
            # Verificar si la sesión móvil no ha expirado
            if mobile_storage.is_session_valid():
                # Restaurar sesión en el dispositivo
                device_session['user_data'] = user_session['user']
                
                # Restaurar en gtask_auth del dispositivo
                gtask_auth.current_user = user_session['user']
                gtask_auth.access_token = user_session['access_token']
                gtask_auth.token_expiry = datetime.fromisoformat(user_session['token_expiry'])
                
                return jsonify({
                    'success': True,
                    'is_authenticated': True,
                    'user': {
                        '_id': user_session['user_id'],
                        'username': user_session['username']
                    },
                    'token_valid': True,
                    'restored_from_storage': True
                })
            else:
                # Sesión móvil expirada, limpiar
                mobile_storage.clear_user_session()
                return jsonify({
                    'success': True,
                    'is_authenticated': False,
                    'message': 'Sesión móvil expirada'
                })
        
        # No hay sesión activa en ningún lugar
        return jsonify({
            'success': True,
            'is_authenticated': False,
            'message': 'No hay sesión activa'
        })
            
    except Exception as e:
        print(f"💥 Error al verificar estado: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Error interno: {str(e)}'
        }), 500

@app.route('/api/gtask/storage-info', methods=['GET'])
def gtask_storage_info():
    """API para obtener información del almacenamiento móvil"""
    try:
        # Obtener la sesión del dispositivo actual
        device_session = get_current_device_session()
        mobile_storage = device_session['mobile_storage']
        
        storage_info = mobile_storage.get_storage_info()
        return jsonify({
            'success': True,
            'storage_info': storage_info
        })
        
    except Exception as e:
        print(f"💥 Error al obtener info de almacenamiento: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Error interno: {str(e)}'
        }), 500

@app.route('/health')
def health_check():
    """Endpoint de verificación de salud"""
    return jsonify({'status': 'OK', 'timestamp': datetime.now().isoformat()})

@app.route('/api/upload-status/<filename>', methods=['GET'])
def upload_status(filename):
    """API para verificar el estado de una subida en segundo plano"""
    try:
        # Por ahora, solo verificamos si el archivo existe
        # En una implementación más avanzada, podrías usar Redis o una base de datos
        # para rastrear el estado real de las subidas
        
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        if os.path.exists(filepath):
            return jsonify({
                'success': True,
                'filename': filename,
                'status': 'file_processed',
                'message': 'Archivo procesado y enviado a Business Central'
            })
        else:
            return jsonify({
                'success': False,
                'filename': filename,
                'status': 'file_not_found',
                'message': 'Archivo no encontrado'
            })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Error al verificar estado: {str(e)}'
        }), 500

# Función para limpiar sesiones expiradas periódicamente
def cleanup_expired_sessions():
    """Limpiar sesiones expiradas cada hora"""
    import threading
    import time
    
    def cleanup_loop():
        while True:
            try:
                session_manager.cleanup_expired_sessions()
                time.sleep(3600)  # Cada hora
            except Exception as e:
                print(f"Error en limpieza de sesiones: {e}")
                time.sleep(3600)
    
    # Iniciar hilo de limpieza en segundo plano
    cleanup_thread = threading.Thread(target=cleanup_loop, daemon=True)
    cleanup_thread.start()

# Función para procesar audio con Whisper (basada en el script funcional)
def process_audio_with_whisper(audio_base64):
    """
    Procesa audio usando Whisper para obtener transcripción
    Basado en el script funcional de transcribe_audio.py
    """
    if not WHISPER_AVAILABLE:
        return {
            'success': False,
            'error': 'Whisper no está instalado. Por favor, ejecuta install_whisper.bat para instalarlo.'
        }
    
    temp_file_path = None
    
    try:
        # Agregar FFmpeg al PATH si no está disponible (como en el script funcional)
        ffmpeg_path = os.path.join(os.getcwd(), "ffmpeg", "ffmpeg-master-latest-win64-gpl", "bin")
        if ffmpeg_path not in os.environ["PATH"]:
            os.environ["PATH"] = ffmpeg_path + os.pathsep + os.environ["PATH"]
            print(f"🔧 FFmpeg agregado al PATH: {ffmpeg_path}")
        
        # Decodificar audio base64
        audio_data = base64.b64decode(audio_base64.split(',')[1])
        
        # Crear archivo temporal con extensión .wav (formato que funciona con Whisper)
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_file:
            temp_file.write(audio_data)
            temp_file_path = temp_file.name
        
        # Verificar que el archivo existe
        if not os.path.exists(temp_file_path):
            print(f"❌ Error: El archivo '{temp_file_path}' no existe.")
            return {
                'success': False,
                'error': 'Archivo de audio no encontrado'
            }

        # Obtener información del archivo
        file_size = os.path.getsize(temp_file_path)
        print(f"📁 Archivo encontrado: {temp_file_path} ({file_size} bytes)")

        print(f"🔄 Cargando modelo Whisper 'base'...")
        # Cargar el modelo
        model = whisper.load_model("base")

        print(f"🎤 Transcribiendo '{temp_file_path}'...")
        # Transcribir el audio con initial_prompt para guiar la transcripción de números
        # El initial_prompt ayuda a Whisper a entender mejor el contexto y transcribir números como dígitos
        result = model.transcribe(
            temp_file_path, 
            language="es")

        # Obtener el texto transcrito
        transcription = result["text"].strip()
        
        # Post-procesar para convertir números escritos en palabras a dígitos
        #transcription = convert_numbers_to_digits(transcription)
        # remplazar , por espacios y guiones por espacios
        transcription = transcription.replace(',', ' ').replace('-', ' ')
        print(f"🎤 Whisper transcripción: {transcription}")
        
        return {
            'success': True,
            'text': transcription,
            'language': result.get('language', 'es')
        }
        
    except Exception as e:
        print(f"❌ Error durante la transcripción: {str(e)}")
        import traceback
        print("Traceback completo:")
        traceback.print_exc()
        return {
            'success': False,
            'error': str(e)
        }
    finally:
        # Limpiar archivo temporal
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
                print(f"🗑️ Archivo temporal eliminado: {temp_file_path}")
            except Exception as e:
                print(f"⚠️ Error eliminando archivo temporal {temp_file_path}: {e}")



# Función para extraer información de parada del texto
def extract_stop_info(text):
    """
    Extrae el número de parada y descripción del texto transcrito
    """
    import re
     # URL de LM Studio (puerto por defecto)
    lm_studio_url = "http://192.168.10.253:1234/v1/chat/completions"
        
        # Prompt para Llava - Versión que FUNCIONÓ (según el usuario)
        # El modelo primero describe lo que ve y luego extrae la información
    prompt ='Puedes devolverme un json con el número de parada (sin espacios) y, la incidencia de este texto: ' + text
    prompt_with_system = prompt
        
    messages = [
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": prompt_with_system
                }
            ]
        }
    ]
        
    # Si el modelo no soporta imágenes, solo enviamos texto
    # (algunos modelos de LM Studio pueden no ser multimodales)
    # Ajustes para Gemma 3 27B: modelo más grande requiere más tokens y tiempo
    payload = {
        "model": "qwen/qwen3-4b-2507",  # LM Studio usa este nombre genérico
        "messages": messages,
        "temperature": 0.2,  # Temperatura más baja para respuestas más consistentes con Gemma
        "max_tokens": 800  # Aumentar tokens para Gemma 3 27B (modelo más grande)
    }
    
    print(f"🤖 Enviando texto a LM Studio en {lm_studio_url}...")
    print(f"📊 Parámetros: temperature={payload['temperature']}, max_tokens={payload['max_tokens']}")
    
    # Verificar el tamaño del payload
    import json as json_lib
    payload_str = json_lib.dumps(payload)
    payload_size_mb = len(payload_str.encode('utf-8')) / 1024 / 1024
    print(f"📦 Tamaño del payload: {payload_size_mb:.2f} MB")

    try:
        print(f"🚀 Enviando petición a LM Studio (timeout: 60s)...")
        import time
        start_time = time.time()
        
        response = requests.post(
            lm_studio_url,
            json=payload,
            timeout=60,  # Timeout aumentado a 60s para modelos grandes que pueden tardar más
            headers={'Content-Type': 'application/json'}
        )
        
        elapsed_time = time.time() - start_time
        print(f"⏱️ Tiempo transcurrido: {elapsed_time:.2f} segundos")
        
        print(f"📡 Respuesta del servidor (multimodal): status={response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"📋 Resultado completo de LM Studio (primeros 500 chars): {str(result)[:500]}")
            content = result.get('choices', [{}])[0].get('message', {}).get('content', '')
            
            if not content:
                print("⚠️ La respuesta del modelo está vacía")
                return {
                    'stop_number': None,
                    'description': 'Incidencia reportada por audio'
                }
            
            print(f"🤖 Respuesta completa de LM Studio (TEXT): {content}")
            print(f"📏 Longitud de la respuesta: {len(content)} caracteres")
            
            # Guardar el contenido original
            original_content = content
            #"content": "{\n  \"numero_de_parada\": 625,\n  \"incidencia\": \"Cristal roto\"\n}
            
            # Intentar extraer JSON del contenido
            # Buscar JSON dentro de bloques ```json ... ``` o ``` ... ```
            code_block_match = re.search(r'```(?:json)?\s*(\{[\s\S]*?)\s*```', content, re.DOTALL)
            if code_block_match:
                extracted_json = code_block_match.group(1)
                print(f"✅ JSON extraído de bloque de código markdown")
                content = extracted_json
            
            # Intentar encontrar JSON con stop_number y description
            json_match = re.search(r'\{[\s\S]*?"(?:stop_number|Numero de parada|numero de parada|Número de parada)"[\s\S]*?"(?:description|descripci[oó]n de la incidencia|descripcion de la incidencia)"[\s\S]*?\}', content, re.DOTALL)
            
            if not json_match:
                # Intentar encontrar JSON que empiece con stop_number
                json_match = re.search(r'\{[\s\S]*?"(?:stop_number|Numero de parada|numero de parada|Número de parada)"[\s\S]*?\}', content, re.DOTALL)
            
            if json_match:
                json_str = json_match.group(0)
                print(f"✅ JSON encontrado: {json_str[:500]}...")
                import json as json_lib
                ai_data = None
                try:
                    # Intentar parsear el JSON
                    ai_data = json_lib.loads(json_str)
                    print(f"✅ JSON parseado correctamente")
                except json_lib.JSONDecodeError as e:
                    print(f"⚠️ Error parseando JSON: {e}")
                    print(f"⚠️ Intentando extraer campos manualmente...")
                    # Extraer campos manualmente con regex
                    stop_num_match = re.search(r'"(?:stop_number|parada|Numero de parada|numero de parada|Número de parada)"\s*:\s*"([^"]+)"', json_str, re.IGNORECASE)
                    desc_match = re.search(r'"(?:description|incidencia|descripci[oó]n de la incidencia|descripcion de la incidencia|descripci[oó]n)"\s*:\s*"([^"]*)"', json_str, re.IGNORECASE | re.DOTALL)
                    
                    if stop_num_match or desc_match:
                        ai_data = {}
                        if stop_num_match:
                            ai_data['stop_number'] = stop_num_match.group(1)
                        if desc_match:
                            ai_data['description'] = desc_match.group(1).strip()
                        print(f"✅ Campos extraídos manualmente: {ai_data}")
                    else:
                        print(f"❌ No se pudieron extraer campos del JSON")
                        ai_data = None
                
                if ai_data:
                    # Buscar número de parada con diferentes nombres posibles
                    stop_num = (ai_data.get('stop_number') or 
                               ai_data.get('Numero de parada') or 
                               ai_data.get('numero de parada') or 
                               ai_data.get('Número de parada') or ai_data.get('numero_de_parada') or ai_data.get('parada'))
                    
                    # Buscar descripción de la incidencia con diferentes nombres posibles
                    desc = None
                    if isinstance(ai_data, dict):
                        # Buscar específicamente el campo de descripción de la incidencia
                        for key in ai_data.keys():
                            if key.lower() in ['descripción de la incidencia', 'descripcion de la incidencia', 'incidencia']:
                                desc = ai_data[key]
                                break
                        
                        # Si no se encontró, buscar con otros nombres
                        if not desc:
                            desc = (ai_data.get('description') or 
                                   ai_data.get('descripción') or 
                                   ai_data.get('descripcion') or 
                                   ai_data.get('incidencia') or 
                                   '')
                    
                    # Validar y limpiar valores
                    if stop_num and isinstance(stop_num, str):
                        stop_num = stop_num.strip()
                        # Asegurar que empieza con P si no lo tiene
                        if stop_num and not stop_num.upper().startswith('P'):
                            stop_num = f"P{stop_num}"
                    
                    if not desc or not isinstance(desc, str):
                        desc = ''
                    else:
                        desc = desc.strip()
                    
                    # Limpiar la descripción de campos JSON no deseados
                    if desc:
                        desc = re.sub(r'"(?:pasos seguidos|conclusi[oó]n)"\s*:\s*\[?[^\]]*\]?', '', desc, flags=re.IGNORECASE | re.DOTALL)
                        desc = re.sub(r'\s+', ' ', desc).strip()
                    
                    # Asegurar valores finales
                    if not stop_num or stop_num == 'null' or stop_num == 'None' or (isinstance(stop_num, str) and stop_num.lower().strip() == 'null'):
                        stop_num = None
                    
                    if not desc or desc == 'null' or desc == 'None' or desc.strip() == '':
                        desc = 'Incidencia reportada por audio'
                    
                    print(f"📤 Resultado extraído del JSON:")
                    print(f"  - stop_number: {stop_num}")
                    print(f"  - description: {desc[:100] if desc else 'vacía'}...")
                    
                    return {
                        'stop_number': stop_num,
                        'description': desc
                    }
            
            # Si no se encontró JSON, intentar extraer información con regex del texto original
            print("⚠️ No se encontró JSON válido, intentando extracción manual del texto...")
            return extract_stop_info_fallback(original_content)
    except requests.exceptions.Timeout:
            print("⚠️ Timeout al procesar con LM Studio")
            # Intentar extraer información del texto original si existe
            return {
                'stop_number': None,
                'description': 'Incidencia reportada por audio'
            }
    except Exception as e:
        print(f"❌ Error procesando texto con LM Studio: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        # Intentar extraer información del texto original si existe
        return {
            'stop_number': None,
            'description': 'Incidencia reportada por audio'
        }        
    # # Buscar patrones que empiecen con "P" (las paradas SIEMPRE empiezan con P)
    # # Priorizar códigos que empiecen con P
    # stop_patterns = [
    #     r'\bP\s*(\d+)\b',  # P1171, P 1171, P625 (sin capturar la P, la agregamos después)
    #     r'\bP(\d+)\b',  # P1171 sin espacio
    #     r'parada\s*[:\-]?\s*P?\s*(\d+)',  # Parada P1171, Parada 1171
    #     r'parada\s+P\s*(\d+)',  # Parada P 1171
    # ]
    
    # stop_number = None
    # for pattern in stop_patterns:
    #     match = re.search(pattern, text, re.IGNORECASE)
    #     if match:
    #         # Siempre agregar "P" al inicio
    #         num = match.group(1).strip()
    #         if num:
    #             stop_number = f"P{num}"
    #             break
    
    # # Si no se encuentra con patrones específicos, buscar "P" seguido de números
    # if not stop_number:
    #     # Buscar explícitamente "P" seguido de números
    #     explicit_code = re.search(r'\bP\s*(\d{3,})\b', text, re.IGNORECASE)
    #     if explicit_code:
    #         stop_number = f"P{explicit_code.group(1)}"
    #     else:
    #         # Buscar "P" seguido de cualquier número
    #         p_code = re.search(r'\bP\s*(\d+)\b', text, re.IGNORECASE)
    #         if p_code:
    #             stop_number = f"P{p_code.group(1)}"
    
    # # NO usar números solos (podrían ser números de línea)
    # # Solo usar si vienen precedidos de "P" o "parada"
    
    # # Extraer descripción (todo el texto excepto la parte de la parada)
    # description = text
    # if stop_number:
    #     # Remover la parte de la parada del texto
    #     for pattern in stop_patterns:
    #         description = re.sub(pattern, '', description.lower()).strip()
    #     # Limpiar caracteres extra
    #     description = re.sub(r'[^\w\s]', ' ', description).strip()
    #     description = re.sub(r'\s+', ' ', description)
    
    # return {
    #     'stop_number': stop_number,
    #     'description': description if description else 'Incidencia reportada por audio'
    # }

# Función de fallback para extraer información del texto cuando no hay JSON
def extract_stop_info_fallback(text):
    """
    Extrae el número de parada y descripción del texto usando regex
    Se usa como fallback cuando no se encuentra JSON válido
    """
    import re
    
    # Buscar patrones que empiecen con "P" (las paradas SIEMPRE empiezan con P)
    stop_patterns = [
        r'\bP\s*(\d+)\b',  # P1171, P 1171, P625
        r'\bP(\d+)\b',  # P1171 sin espacio
        r'parada\s*[:\-]?\s*P?\s*(\d+)',  # Parada P1171, Parada 1171
        r'parada\s+P\s*(\d+)',  # Parada P 1171
    ]
    
    stop_number = None
    for pattern in stop_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            num = match.group(1).strip()
            if num:
                stop_number = f"P{num}"
                break
    
    # Si no se encuentra con patrones específicos, buscar "P" seguido de números
    if not stop_number:
        explicit_code = re.search(r'\bP\s*(\d{3,})\b', text, re.IGNORECASE)
        if explicit_code:
            stop_number = f"P{explicit_code.group(1)}"
        else:
            p_code = re.search(r'\bP\s*(\d+)\b', text, re.IGNORECASE)
            if p_code:
                stop_number = f"P{p_code.group(1)}"
    
    # Extraer descripción (todo el texto excepto la parte de la parada)
    description = text
    if stop_number:
        # Remover la parte de la parada del texto
        for pattern in stop_patterns:
            description = re.sub(pattern, '', description, flags=re.IGNORECASE).strip()
        # Limpiar caracteres extra
        description = re.sub(r'[^\w\s]', ' ', description).strip()
        description = re.sub(r'\s+', ' ', description)
    print(f"📤 Resultado extraído del texto:")
    print(f"  - stop_number: {stop_number}")
    print(f"  - description: {description[:100] if description else 'vacía'}...")
    return {
        'stop_number': stop_number,
        'description': description if description else 'Incidencia reportada por audio'
    }

# Función para procesar imagen con LM Studio
def process_image_with_lm_studio(image_base64):
    """
    Procesa imagen con LM Studio para extraer número de parada e incidencia
    LM Studio debe estar corriendo en http://192.168.10.253:1234
    """
    try:
        import re
        
        # Limpiar el base64 si viene como data URL
        if isinstance(image_base64, str) and image_base64.startswith('data:image'):
            image_base64 = image_base64.split(',')[1]
        
        # Verificar tamaño de la imagen base64
        base64_size_mb = len(image_base64) * 3 / 4 / 1024 / 1024  # Tamaño aproximado en MB
        print(f"📸 Tamaño de imagen base64: {base64_size_mb:.2f} MB ({len(image_base64)} caracteres)")
        
        # Si la imagen es muy grande (>5MB), reducirla antes de enviar
        if base64_size_mb > 5:
            print(f"⚠️ Imagen muy grande ({base64_size_mb:.2f} MB), reduciendo tamaño...")
            try:
                from PIL import Image
                import io
                
                # Decodificar base64 a bytes
                image_bytes = base64.b64decode(image_base64)
                
                # Abrir imagen con PIL
                img = Image.open(io.BytesIO(image_bytes))
                
                # Reducir tamaño si es muy grande (max 1024px en el lado más largo)
                max_size = 1024
                if img.width > max_size or img.height > max_size:
                    img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
                    print(f"✅ Imagen redimensionada a {img.width}x{img.height}")
                
                # Convertir de nuevo a base64 con calidad reducida
                output = io.BytesIO()
                img.save(output, format='JPEG', quality=85, optimize=True)
                image_bytes = output.getvalue()
                image_base64 = base64.b64encode(image_bytes).decode('utf-8')
                
                new_size_mb =image_base64# len(image_base64) * 3 / 4 / 1024 / 1024
                print(f"✅ Imagen reducida a {new_size_mb:.2f} MB ({len(image_base64)} caracteres)")
            except Exception as e:
                print(f"⚠️ Error al reducir imagen: {e}, usando imagen original")
        
        # URL de LM Studio (puerto por defecto)
        lm_studio_url = "http://192.168.10.253:1234/v1/chat/completions"
        
        # Prompt para Llava - Versión que FUNCIONÓ (según el usuario)
        # El modelo primero describe lo que ve y luego extrae la información
        prompt ='En esta parada de autobús, me puedes indicar el número de parada que empieza por la letra P seguida de números , busca en toda la imagen, no confundir con el numero de linea que está en un cartel del color de la linea , y la descripción de la incidencia o pintada que ves en la imagen?. Devuelve un json, con Numero de parada, descripción de la incidencia, pasos seguidos y conclusió'
#         prompt = """Primero describe detalladamente todo lo que ves en esta imagen de parada de autobús. Luego busca específicamente:

# 1. CUALQUIER número, código o texto que contenga la letra P seguida de números (P1171, P625, P123, etc.). Busca en TODA la imagen: carteles, señales, marcas, estructuras, cualquier lugar. Si encuentras un código con P, escríbelo EXACTAMENTE como aparece. Si después de buscar cuidadosamente no encuentras ningún código con P, usa null.

# 2. CUALQUIER incidencia visible: cristales rotos o dañados, marquesina estropeada, bancos rotos, grafitis, señales dañadas, estructura dañada, basura, cualquier daño visible.

# Después de describir lo que ves, responde SOLO con este formato JSON exacto:
# {
#   "stop_number": "P1171" o null,
#   "description": "descripción detallada en español"
# }

# CRÍTICO: Si ves CUALQUIER código que empiece con P y números, ESCRIBELO. No uses null si ves algo."""
        
        # Preparar el mensaje con imagen (formato multimodal)
        # Si el modelo soporta imágenes, las enviamos en el formato correcto
        # Para Llava, el formato puede requerir que la imagen esté en PNG o JPEG
        # Intentar detectar el formato de la imagen
        image_format = "jpeg"  # Por defecto
        if isinstance(image_base64, str):
            # Si ya viene como data URL, extraer el formato
            if image_base64.startswith('data:image'):
                format_part = image_base64.split(';')[0].split('/')[1]
                if format_part in ['png', 'jpeg', 'jpg']:
                    image_format = format_part if format_part != 'jpg' else 'jpeg'
        
        # Llava solo soporta roles "user" y "assistant", no "system"
        # Incluir las instrucciones del sistema en el prompt del usuario
        # Usar el prompt exacto que funcionó según los logs
        prompt_with_system = prompt
        
        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": prompt_with_system
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/{image_format};base64,{image_base64}"
                        }
                    }
                ]
            }
        ]
        
        # Si el modelo no soporta imágenes, solo enviamos texto
        # (algunos modelos de LM Studio pueden no ser multimodales)
        # Ajustes para Gemma 3 27B: modelo más grande requiere más tokens y tiempo
        payload = {
            "model": "google/gemma-3-27b",  # LM Studio usa este nombre genérico
            "messages": messages,
            "temperature": 0.2,  # Temperatura más baja para respuestas más consistentes con Gemma
            "max_tokens": 800  # Aumentar tokens para Gemma 3 27B (modelo más grande)
        }
        
        print(f"🤖 Enviando imagen a LM Studio en {lm_studio_url}...")
        print(f"📊 Parámetros: temperature={payload['temperature']}, max_tokens={payload['max_tokens']}")
        
        # Verificar el tamaño del payload
        import json as json_lib
        payload_str = json_lib.dumps(payload)
        payload_size_mb = len(payload_str.encode('utf-8')) / 1024 / 1024
        print(f"📦 Tamaño del payload: {payload_size_mb:.2f} MB")
        
        # Verificar que la imagen esté en el payload
        if 'image_url' in payload_str:
            image_url_start = payload_str.find('data:image')
            if image_url_start > 0:
                print(f"✅ Imagen encontrada en payload (posición: {image_url_start})")
                print(f"📸 Primeros 100 caracteres del data URL: {payload_str[image_url_start:image_url_start+100]}...")
        
        # Intentar con formato multimodal primero
        try:
            print(f"🚀 Enviando petición a LM Studio (timeout: 180s)...")
            import time
            start_time = time.time()
            
            response = requests.post(
                lm_studio_url,
                json=payload,
                timeout=180,  # Timeout aumentado a 180s para modelos grandes que pueden tardar más
                headers={'Content-Type': 'application/json'}
            )
            
            elapsed_time = time.time() - start_time
            print(f"⏱️ Tiempo transcurrido: {elapsed_time:.2f} segundos")
            
            print(f"📡 Respuesta del servidor (multimodal): status={response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                print(f"📋 Resultado completo de LM Studio (primeros 500 chars): {str(result)[:500]}")
                content = result.get('choices', [{}])[0].get('message', {}).get('content', '')
                
                if not content:
                    print("⚠️ La respuesta del modelo está vacía")
                    print(f"⚠️ Respuesta completa: {result}")
                    # Intentar sin imagen
                    raise Exception("Respuesta vacía del modelo multimodal")
                
                print(f"🤖 Respuesta completa de LM Studio (RAW): {repr(content)}")
                print(f"🤖 Respuesta completa de LM Studio (TEXT): {content}")
                print(f"📏 Longitud de la respuesta: {len(content)} caracteres")
                
                # Guardar el contenido original antes de modificarlo
                original_content = content
                
                # Primero intentar extraer información útil (JSON o código de parada)
                # Antes de determinar si es un error real
                has_json = False
                has_stop_number = False
                
                # Buscar rápidamente si hay JSON válido
                json_quick_check = re.search(r'\{[^{}]*"stop_number"[^{}]*\}', content, re.DOTALL)
                if json_quick_check:
                    has_json = True
                
                # Buscar rápidamente si hay código de parada
                stop_quick_check = re.search(r'\bP\s*\d{3,}\b', content, re.IGNORECASE)
                if stop_quick_check:
                    has_stop_number = True
                
                # Solo validar como error si NO hay información útil Y además contiene frases de error
                if not has_json and not has_stop_number:
                    error_messages = [
                        "necesito una descripción de la imagen",
                        "necesito una descripción",
                        "no puedo ver la imagen",
                        "no tengo acceso a la imagen",
                        "la imagen no está disponible",
                        "no puedo analizar la imagen",
                        "proporciona la descripción",
                        "esperaré tu texto",
                        "sin información disponible"
                    ]
                    
                    content_lower = content.lower()
                    if any(error_msg in content_lower for error_msg in error_messages):
                        print(f"❌ El modelo indicó que no puede procesar la imagen y no hay información útil")
                        print(f"❌ Respuesta: {content[:200]}...")
                        return {
                            'success': False,
                            'error': 'El modelo Gemma 3 27B no es multimodal (no soporta imágenes directamente).\n\nOpciones:\n1. Usa un modelo multimodal como Llava (ej: llava1.6-mistral-7b-instruct)\n2. O usa un modelo de visión como Gemma 2B-IT o Qwen2-VL\n\nEl modelo actual solo puede procesar texto, no imágenes.'
                        }
                
                # Buscar cualquier código con P en la respuesta completa ANTES de extraer JSON
                # Esto puede ayudar a encontrar códigos que el modelo menciona pero no pone en el JSON
                p_code_in_full_text = re.search(r'\bP\s*(\d{3,})\b', original_content, re.IGNORECASE)
                p_code_found_in_text = None
                if p_code_in_full_text:
                    p_code_found_in_text = f"P{p_code_in_full_text.group(1)}"
                    print(f"🔍 Código de parada encontrado en texto completo ANTES de extraer JSON: {p_code_found_in_text}")
                
                # Limpiar el contenido: remover bloques de código markdown si existen
                # Buscar JSON dentro de bloques ```json ... ``` o ``` ... ```
                # Usar un patrón más robusto que maneje JSON multilínea y truncado
                code_block_match = re.search(r'```(?:json)?\s*(\{[\s\S]*?)\s*```', content, re.DOTALL)
                if code_block_match:
                    extracted_json = code_block_match.group(1)
                    print(f"✅ JSON extraído de bloque de código markdown (primeros 300 chars): {extracted_json[:300]}...")
                    content = extracted_json
                
                # Intentar extraer JSON de la respuesta (patrones más flexibles)
                # Primero intentar con JSON completo que contenga ambos campos
                json_match = re.search(r'\{[\s\S]*?"stop_number"[\s\S]*?"description"[\s\S]*?\}', content, re.DOTALL)
                
                if not json_match:
                    # Intentar encontrar JSON que empiece con stop_number (puede estar truncado)
                    json_match = re.search(r'\{[\s\S]*?"stop_number"[\s\S]*?\}', content, re.DOTALL)
                
                if not json_match:
                    # Intentar encontrar cualquier JSON que empiece con {
                    json_match = re.search(r'\{[\s\S]*?"stop_number"', content, re.DOTALL)
                    if json_match:
                        # El JSON está truncado, intentar extraerlo completo hasta donde termine
                        json_start_pos = json_match.start()
                        # Buscar hasta el final del contenido o hasta encontrar un cierre válido
                        json_candidate = content[json_start_pos:]
                        # Intentar encontrar stop_number y description aunque esté truncado
                        json_match = re.search(r'\{[\s\S]*?"stop_number"[\s\S]*?"description"[\s\S]*?[^"]"', json_candidate, re.DOTALL)
                        if not json_match:
                            # Si no encuentra description completo, tomar hasta donde esté
                            json_match = re.search(r'\{[\s\S]*?"stop_number"[\s\S]*?"description"[\s\S]*', json_candidate, re.DOTALL)
                
                if json_match:
                    json_str = json_match.group(0)
                    print(f"✅ JSON encontrado (longitud: {len(json_str)} chars): {json_str[:500]}...")
                    import json as json_lib
                    ai_data = None
                    try:
                        # Intentar parsear el JSON
                        ai_data = json_lib.loads(json_str)
                        print(f"✅ JSON parseado correctamente")
                    except json_lib.JSONDecodeError as e:
                        print(f"⚠️ Error parseando JSON completo: {e}")
                        print(f"⚠️ JSON problemático (puede estar truncado): {json_str}")
                        # Si el JSON está truncado, intentar extraer campos manualmente
                        print("🔄 Intentando extraer campos manualmente del JSON truncado...")
                        # Extraer stop_number - puede estar truncado, así que buscar hasta el final
                        # Buscar con diferentes nombres posibles (inglés y español)
                        stop_num_match = re.search(r'"(?:stop_number|Numero de parada|numero de parada|Número de parada)"\s*:\s*"([^"]+)"', json_str, re.IGNORECASE)
                        # Para description, buscar hasta el final del string (puede estar truncado)
                        # Buscar con diferentes nombres posibles (inglés y español)
                        desc_match = re.search(r'"(?:description|descripci[oó]n de la incidencia|descripcion de la incidencia|descripci[oó]n)"\s*:\s*"([^"]*)"', json_str, re.IGNORECASE)
                        if not desc_match:
                            # Si no encuentra comilla de cierre, buscar hasta el final del string (truncado)
                            desc_match = re.search(r'"(?:description|descripci[oó]n de la incidencia|descripcion de la incidencia|descripci[oó]n)"\s*:\s*"([^"]*)', json_str, re.IGNORECASE)
                        
                        if stop_num_match or desc_match:
                            # Crear un objeto parcial con los campos encontrados
                            ai_data = {}
                            if stop_num_match:
                                ai_data['stop_number'] = stop_num_match.group(1)
                            if desc_match:
                                ai_data['description'] = desc_match.group(1)
                            print(f"✅ Campos extraídos manualmente: {ai_data}")
                        else:
                            print(f"❌ No se pudieron extraer campos del JSON truncado")
                            # Continuar con el flujo normal para extraer del texto
                            ai_data = None
                    
                    if ai_data:
                        # Buscar número de parada con diferentes nombres posibles
                        stop_num = (ai_data.get('stop_number') or 
                                   ai_data.get('Numero de parada') or 
                                   ai_data.get('numero de parada') or 
                                   ai_data.get('Número de parada'))
                        
                        # Buscar descripción de la incidencia con diferentes nombres posibles
                        # Priorizar "descripción de la incidencia" para evitar confundir con otros campos
                        desc = None
                        if isinstance(ai_data, dict):
                            # Buscar específicamente el campo de descripción de la incidencia
                            for key in ai_data.keys():
                                if key.lower() in ['descripción de la incidencia', 'descripcion de la incidencia']:
                                    desc = ai_data[key]
                                    break
                            
                            # Si no se encontró, buscar con otros nombres
                            if not desc:
                                desc = (ai_data.get('description') or 
                                       ai_data.get('descripción') or 
                                       ai_data.get('descripcion') or 
                                       '')
                        
                        # Validar que la descripción no sea el JSON completo
                        if desc and isinstance(desc, str):
                            # Si la descripción contiene estructuras JSON o parece ser el JSON completo, limpiarla
                            if desc.strip().startswith('{') or '"pasos seguidos"' in desc or '"conclusión"' in desc or '"conclusion"' in desc:
                                print("⚠️ La descripción parece contener JSON completo, extrayendo solo el campo...")
                                # Intentar extraer solo el valor del campo "descripción de la incidencia"
                                desc_match = re.search(r'"(?:descripción de la incidencia|descripcion de la incidencia|description)"\s*:\s*"([^"]+)"', desc, re.IGNORECASE)
                                if desc_match:
                                    desc = desc_match.group(1)
                                else:
                                    # Si no se puede extraer, usar el valor del JSON parseado directamente
                                    desc = (ai_data.get('descripción de la incidencia') or 
                                           ai_data.get('descripcion de la incidencia') or 
                                           '')
                        
                        # Asegurar que desc es un string válido
                        if not desc or not isinstance(desc, str):
                            desc = ''
                        
                        print(f"📋 Datos extraídos del JSON:")
                        print(f"  - stop_number: {stop_num}")
                        print(f"  - description: {desc[:100] if desc else 'vacía'}...")
                        
                        # Si stop_number es null, "null" (string), o None, buscar manualmente en TODO el texto
                        if not stop_num or stop_num == 'null' or stop_num == 'None' or stop_num == 'null' or (isinstance(stop_num, str) and stop_num.lower().strip() == 'null'):
                            print("⚠️ stop_number es null en JSON, buscando en TODO el texto de la respuesta...")
                            
                            # Usar el código encontrado previamente si existe
                            if p_code_found_in_text:
                                print(f"✅ Usando código de parada encontrado previamente: {p_code_found_in_text}")
                                stop_num = p_code_found_in_text
                            else:
                                print(f"📝 Buscando códigos P en: {content[:500]}...")
                                
                                # Buscar directamente cualquier P seguido de números (más agresivo)
                                p_matches = re.findall(r'\bP\s*(\d{3,})\b', content, re.IGNORECASE)
                                if p_matches:
                                    # Tomar el primero encontrado
                                    stop_num = f"P{p_matches[0]}"
                                    print(f"✅ Número de parada encontrado directamente en texto: {stop_num}")
                                else:
                                    # Intentar con extract_stop_info
                                    stop_info = extract_stop_info(content)
                                    found_stop = stop_info.get('stop_number')
                                    if found_stop:
                                        print(f"✅ Número de parada encontrado con extract_stop_info: {found_stop}")
                                        stop_num = found_stop
                                    else:
                                        # Buscar cualquier P seguido de números (más flexible)
                                        p_match = re.search(r'P\s*(\d+)', content, re.IGNORECASE)
                                        if p_match:
                                            stop_num = f"P{p_match.group(1)}"
                                            print(f"✅ Número de parada encontrado con regex flexible: {stop_num}")
                                        else:
                                            print("❌ No se encontró número de parada en ningún lugar del texto")
                                            stop_num = None
                        
                        # Si description es literal "texto en español" o está vacía, buscar en el texto
                        if not desc or desc == 'null' or desc == 'None' or desc.strip() == '' or desc.lower().strip() == 'texto en español':
                            print("⚠️ description es inválida o literal, buscando en el texto...")
                            # Buscar descripción de la incidencia en el texto (priorizar campo en español)
                            desc_match = re.search(r'"(?:descripción de la incidencia|descripcion de la incidencia|description)"\s*:\s*"([^"]+)"', content, re.IGNORECASE)
                            if desc_match:
                                desc = desc_match.group(1)
                                # Si es el texto literal "texto en español", buscar en el contenido
                                if desc.lower().strip() == 'texto en español':
                                    desc = "Sin incidencia visible"
                            else:
                                # Buscar descripción en JSON multilínea (puede tener saltos de línea)
                                desc_match = re.search(r'"(?:descripción de la incidencia|descripcion de la incidencia|description)"\s*:\s*"([^"]*)"', content, re.IGNORECASE | re.DOTALL)
                                if desc_match:
                                    desc = desc_match.group(1).strip()
                                    # Limpiar saltos de línea múltiples
                                    desc = re.sub(r'\n+', ' ', desc)
                                    desc = re.sub(r'\s+', ' ', desc).strip()
                                else:
                                    desc = "Sin incidencia visible"
                        
                        # Asegurar valores finales
                        if not stop_num or stop_num == 'null' or stop_num == 'None' or (isinstance(stop_num, str) and stop_num.lower().strip() == 'null'):
                            stop_num = None
                        
                        if not desc or desc == 'null' or desc == 'None' or desc.strip() == '' or desc.lower().strip() == 'texto en español':
                            desc = 'Sin incidencia visible'
                        
                        print(f"📤 Resultado final (con JSON):")
                        print(f"  - stop_number: {stop_num}")
                        print(f"  - description: {desc}")
                        
                        return {
                            'success': True,
                            'stop_number': stop_num,
                            'description': desc,
                            'raw_response': content
                        }
                
                # Si no hay JSON, intentar extraer información con regex
                print("⚠️ No se encontró JSON válido, intentando extracción manual del texto...")
                stop_number = None
                description = None
                
                # Buscar formato estructurado con títulos markdown
                # Buscar "**Número de parada:**" seguido del número
                stop_section = re.search(r'\*\*Número de parada:\*\*\s*\n?\s*\*\*?([P]?\d+)\*\*?', content, re.IGNORECASE | re.MULTILINE)
                if stop_section:
                    stop_number = stop_section.group(1).strip()
                    # Asegurar que empieza con P si no lo tiene
                    if not stop_number.upper().startswith('P'):
                        stop_number = f"P{stop_number}"
                    print(f"✅ Número de parada encontrado en sección markdown: {stop_number}")
                
                # Buscar "**Descripción de la incidencia o pintada:**" seguido de la descripción
                desc_section = re.search(
                    r'\*\*Descripción de la incidencia o pintada:\*\*\s*\n?\s*(.+?)(?=\*\*|Nota adicional|$)', 
                    content, 
                    re.IGNORECASE | re.MULTILINE | re.DOTALL
                )
                if desc_section:
                    description = desc_section.group(1).strip()
                    # Limpiar saltos de línea múltiples y espacios extra
                    description = re.sub(r'\n+', ' ', description)
                    description = re.sub(r'\s+', ' ', description).strip()
                    print(f"✅ Descripción encontrada en sección markdown: {description[:100]}...")
                
                # Si no se encontró con el formato estructurado, buscar con los métodos anteriores
                if not stop_number:
                    # Buscar número de parada en el texto (puede incluir letras como P1171)
                    print(f"🔍 Buscando número de parada en: {content[:200]}...")
                    stop_match = re.search(r'"stop_number"\s*:\s*"?([A-Z]?\d+)"?', content, re.IGNORECASE)
                    if stop_match:
                        stop_number = stop_match.group(1).strip()
                        # Limpiar espacios si hay
                        stop_number = stop_number.replace(' ', '')
                        print(f"✅ Número de parada encontrado en JSON: {stop_number}")
                    else:
                        # Intentar buscar directamente en el texto con regex (sin volver a enviar a IA)
                        print("🔍 Buscando número de parada en el texto con regex...")
                        # Buscar código de parada con formato P seguido de números
                        stop_match_regex = re.search(r'\bP\s*\d{3,}\b', content, re.IGNORECASE)
                        if stop_match_regex:
                            stop_number = stop_match_regex.group(0).replace(' ', '').upper()
                            print(f"✅ Número de parada encontrado con regex: {stop_number}")
                        else:
                            print("⚠️ No se encontró número de parada")
                
                # Si no se encontró descripción con el formato estructurado, buscar con métodos anteriores
                if not description:
                    # Buscar descripción de la incidencia en el JSON (priorizar campo en español)
                    desc_match = re.search(r'"(?:descripción de la incidencia|descripcion de la incidencia|description)"\s*:\s*"([^"]+)"', content, re.IGNORECASE)
                    if desc_match:
                        description = desc_match.group(1)
                        print(f"✅ Descripción encontrada en JSON: {description}")
                    else:
                        # Buscar descripción en JSON multilínea (puede tener saltos de línea)
                        desc_match = re.search(r'"(?:descripción de la incidencia|descripcion de la incidencia|description)"\s*:\s*"([^"]*)"', content, re.IGNORECASE | re.DOTALL)
                        if desc_match:
                            description = desc_match.group(1).strip()
                            # Limpiar saltos de línea múltiples
                            description = re.sub(r'\n+', ' ', description)
                            description = re.sub(r'\s+', ' ', description).strip()
                            print(f"✅ Descripción encontrada en JSON multilínea: {description}")
                        else:
                            # Si no se encuentra en JSON, usar el texto completo como descripción (sin volver a enviar a IA)
                            if not stop_number:
                                # Usar el texto completo como descripción, limpiando campos JSON no deseados
                                description = content
                                # Remover campos JSON no deseados
                                description = re.sub(r'"(?:Numero de parada|numero de parada|stop_number)"\s*:\s*"[^"]*"', '', description, flags=re.IGNORECASE)
                                description = re.sub(r'"(?:pasos seguidos|conclusi[oó]n)"\s*:\s*[^}]*', '', description, flags=re.IGNORECASE | re.DOTALL)
                                # Limpiar saltos de línea múltiples
                                description = re.sub(r'\n+', ' ', description)
                                description = re.sub(r'\s+', ' ', description).strip()
                                print(f"✅ Descripción extraída del texto: {description[:100]}...")
                            else:
                                # Buscar descripción en el texto sin el número de parada
                                # Remover el número de parada del texto para obtener la descripción
                                desc_text = content
                                if stop_number:
                                    desc_text = re.sub(rf'{re.escape(stop_number)}', '', desc_text, flags=re.IGNORECASE)
                                    desc_text = re.sub(r'"(?:Numero de parada|numero de parada|stop_number)"\s*:\s*"[^"]*"', '', desc_text, flags=re.IGNORECASE)
                                # Remover secciones de notas adicionales y campos JSON no deseados
                                desc_text = re.sub(r'\*\*Nota adicional:\*\*.*', '', desc_text, flags=re.IGNORECASE | re.DOTALL)
                                desc_text = re.sub(r'Nota adicional.*', '', desc_text, flags=re.IGNORECASE | re.DOTALL)
                                # Remover campos JSON que no queremos (pasos seguidos, conclusión)
                                desc_text = re.sub(r'"(?:pasos seguidos|conclusi[oó]n)"\s*:\s*\[?[^\]]*\]?', '', desc_text, flags=re.IGNORECASE | re.DOTALL)
                                description = desc_text.strip()
                                if not description or len(description) < 5:
                                    description = "Incidencia detectada por IA"
                                print(f"✅ Descripción obtenida: {description}")
                
                # Limpiar la descripción de cualquier nota adicional que pueda quedar
                if description:
                    # Remover cualquier nota adicional que pueda estar al final
                    description = re.sub(r'Nota adicional:.*', '', description, flags=re.IGNORECASE | re.DOTALL)
                    description = re.sub(r'\*\*Nota adicional:\*\*.*', '', description, flags=re.IGNORECASE | re.DOTALL)
                    description = re.sub(r'El número.*que ves.*es.*número de línea.*', '', description, flags=re.IGNORECASE)
                    # Remover campos JSON no deseados si aún están presentes
                    description = re.sub(r'"(?:pasos seguidos|conclusi[oó]n)"\s*:\s*\[?[^\]]*\]?', '', description, flags=re.IGNORECASE | re.DOTALL)
                    description = re.sub(r'"(?:Numero de parada|numero de parada|stop_number)"\s*:\s*"[^"]*"', '', description, flags=re.IGNORECASE)
                    # Remover cualquier estructura JSON completa si está en la descripción
                    description = re.sub(r'\{[^{}]*"descripción de la incidencia"[^{}]*\}', '', description, flags=re.IGNORECASE | re.DOTALL)
                    description = description.strip()
                
                # Asegurar que siempre tenemos valores válidos
                if not stop_number:
                    stop_number = None
                
                if not description or description.strip() == '' or len(description) < 5:
                    description = 'Sin incidencia visible'
                
                print(f"📤 Resultado final (sin JSON):")
                print(f"  - stop_number: {stop_number}")
                print(f"  - description: {description}")
                
                return {
                    'success': True,
                    'stop_number': stop_number,
                    'description': description,
                    'raw_response': content
                }
            elif response.status_code == 404:
                error_data = response.json() if response.text else {}
                error_msg = error_data.get('error', {}).get('message', 'Modelo no encontrado')
                print(f"❌ LM Studio error 404: {error_msg}")
                return {
                    'success': False,
                    'error': f'LM Studio no tiene un modelo cargado. Por favor:\n1. Abre LM Studio\n2. Ve a la pestaña "Developer"\n3. Carga un modelo (preferiblemente multimodal para visión)\n4. Asegúrate de que el servidor esté corriendo en http://192.168.10.253:1234\n\nError: {error_msg}'
                }
            else:
                print(f"⚠️ LM Studio respondió con código {response.status_code}: {response.text}")
                return {
                    'success': False,
                    'error': f'LM Studio respondió con código {response.status_code}: {response.text}'
                }
                
        except requests.exceptions.Timeout:
            return {
                'success': False,
                'error': 'El modelo tardó demasiado en responder (timeout). Puede que el modelo sea muy grande o esté procesando. Intenta con un modelo más pequeño o espera más tiempo.'
            }
        except Exception as e:
            print(f"❌ Error procesando imagen con formato multimodal: {type(e).__name__}: {str(e)}")
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'error': f'Error al procesar imagen con el modelo: {str(e)}'
            }
        
    except requests.exceptions.ConnectionError:
        error_msg = 'No se puede conectar a LM Studio. Asegúrate de que:\n1. LM Studio esté corriendo\n2. El servidor local esté activo en http://192.168.10.253:1234\n3. Ve a la pestaña "Developer" en LM Studio y asegúrate de que el servidor esté iniciado'
        print(f"❌ {error_msg}")
        return {
            'success': False,
            'error': error_msg
        }
    except Exception as e:
        error_msg = f'Error procesando imagen con LM Studio: {str(e)}'
        print(f"❌ {error_msg}")
        import traceback
        traceback.print_exc()
        return {
            'success': False,
            'error': error_msg
        }

if __name__ == '__main__':
    # Configurar logging ANTES de cualquier print
    import logging
    import sys
    
    # Configurar logging para que se muestre en consola
    logging.basicConfig(
        level=logging.DEBUG,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler(sys.stdout)
        ]
    )
    
    # Forzar que print() se muestre inmediatamente
    sys.stdout.flush()
    sys.stderr.flush()
    
    print("=" * 50)
    print("🚀 Iniciando Web-App de Incidencias...")
    print(f"📱 Accede desde tu móvil a: http://127.0.0.1:5015")
    print("💡 Asegúrate de estar en la misma red WiFi")
    print("🔐 Sistema de sesiones por dispositivo activado")
    print("=" * 50)
    sys.stdout.flush()
    
    # Iniciar limpieza de sesiones
    cleanup_expired_sessions()
    
    print("=" * 50)
    print("🚀 SERVIDOR FLASK INICIADO")
    print("✅ Endpoints disponibles:")
    print("   - GET  /api/test (prueba)")
    print("   - POST /api/incidences (crear incidencia)")
    print("=" * 50)
    sys.stdout.flush()
    
    app.run(host='127.0.0.1', port=5015, debug=True, use_reloader=False)

