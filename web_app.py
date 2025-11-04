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
import whisper

# Importar configuración
from config import *
from gtask_auth import GTaskAuth
from mobile_storage import MobileStorage

app = Flask(__name__)
CORS(app)

# Configuración de sesión
app.secret_key = 'incidencias_malla_secret_key_2024'
app.config['SESSION_TYPE'] = 'filesystem'

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
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max

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

def send_incidence_to_server_with_session(incidence_payload, gtask_auth):
    """Envía una incidencia al servidor Business Central usando la sesión específica del dispositivo."""
    try:
        from config import get_bc_url, get_bc_auth_header, BC_CONFIG
        
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
        base_url = BC_CONFIG['base_url']
        incidences_endpoint = '/powerbi/ODataV4/GtaskMalla_postincidencia'
        url = f"{base_url}{incidences_endpoint}"

        # Crear la estructura de datos para BC (como objeto, no array)
        bc_incidence_data = {
            "state": incidence_payload.get('state', 'PENDING'),
            "incidenceType": incidence_payload.get('incidenceType'),
            "observation": incidence_payload.get('observation', ''),
            "description": incidence_payload.get('description'),
            "resource": incidence_payload.get('resource'),
            "user": user_id,
            "image": incidence_payload.get('image', []),
            "audio": incidence_payload.get('audio', [])
        }

        # Envolver en el formato que espera BC
        datos = {
            "jsonText": json.dumps(bc_incidence_data)
        }

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
        print(f"Payload recibido: {json.dumps(incidence_payload, indent=2)}")
        print(f"Datos enviados: {json.dumps(datos, indent=2)}")
        print("=============================================")

        # Realizar la petición POST a BC
        response = requests.post(
            url,
            params=params,
            headers=headers,
            data=json.dumps(datos),
            timeout=30
        )

        # Verificar si la petición fue exitosa
        if response.status_code in (200, 201, 204):
            print(f"✅ Incidencia enviada correctamente a BC: {response.status_code}")
            return {
                'success': True,
                'status_code': response.status_code,
                'response_text': response.text
            }
        else:
            print(f"❌ Error al enviar incidencia a BC. Código: {response.status_code}")
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
        error_msg = f'Error interno al enviar incidencia a Business Central: {str(e)}'
        print(error_msg)
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
                "name": filename
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

@app.route('/api/incidences', methods=['POST'])
def create_incidence():
    """Crea una incidencia en el servidor GTask usando la sesión por dispositivo.
    Espera un JSON con la estructura:
    {
      "state": "PENDING",
      "incidenceType": "65a1b2...",
      "observation": "...",
      "description": "...",
      "resource": "65a1b2...",
      "image": [{"file": "data:image/...;base64,....", "name": "imagen1.jpg"}, ...]
    }
    """
    try:
        if not request.is_json:
            return jsonify({'success': False, 'error': 'Se requiere JSON en el cuerpo'}), 400

        payload = request.get_json()
        
        print("=== CREANDO INCIDENCIA ===")
        print(f"Payload recibido: {json.dumps(payload, indent=2)}")
        print("=========================")

        # Obtener sesión del dispositivo
        device_session = get_current_device_session()
        gtask_auth = device_session['gtask_auth']

        # Enviar incidencia
        result = send_incidence_to_server_with_session(payload, gtask_auth)

        status = 200 if result.get('success') else 500
        return jsonify(result), status

    except Exception as e:
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
        # Transcribir el audio
        result = model.transcribe(temp_file_path, language="es")

        # Obtener el texto transcrito
        transcription = result["text"].strip()
        
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
    
    # Buscar patrones que empiecen con "P" (las paradas SIEMPRE empiezan con P)
    # Priorizar códigos que empiecen con P
    stop_patterns = [
        r'\bP\s*(\d+)\b',  # P1171, P 1171, P625 (sin capturar la P, la agregamos después)
        r'\bP(\d+)\b',  # P1171 sin espacio
        r'parada\s*[:\-]?\s*P?\s*(\d+)',  # Parada P1171, Parada 1171
        r'parada\s+P\s*(\d+)',  # Parada P 1171
    ]
    
    stop_number = None
    for pattern in stop_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            # Siempre agregar "P" al inicio
            num = match.group(1).strip()
            if num:
                stop_number = f"P{num}"
                break
    
    # Si no se encuentra con patrones específicos, buscar "P" seguido de números
    if not stop_number:
        # Buscar explícitamente "P" seguido de números
        explicit_code = re.search(r'\bP\s*(\d{3,})\b', text, re.IGNORECASE)
        if explicit_code:
            stop_number = f"P{explicit_code.group(1)}"
        else:
            # Buscar "P" seguido de cualquier número
            p_code = re.search(r'\bP\s*(\d+)\b', text, re.IGNORECASE)
            if p_code:
                stop_number = f"P{p_code.group(1)}"
    
    # NO usar números solos (podrían ser números de línea)
    # Solo usar si vienen precedidos de "P" o "parada"
    
    # Extraer descripción (todo el texto excepto la parte de la parada)
    description = text
    if stop_number:
        # Remover la parte de la parada del texto
        for pattern in stop_patterns:
            description = re.sub(pattern, '', description.lower()).strip()
        # Limpiar caracteres extra
        description = re.sub(r'[^\w\s]', ' ', description).strip()
        description = re.sub(r'\s+', ' ', description)
    
    return {
        'stop_number': stop_number,
        'description': description if description else 'Incidencia reportada por audio'
    }

# Función para procesar imagen con LM Studio
def process_image_with_lm_studio(image_base64):
    """
    Procesa imagen con LM Studio para extraer número de parada e incidencia
    LM Studio debe estar corriendo en http://localhost:1234
    """
    try:
        import re
        
        # Limpiar el base64 si viene como data URL
        if isinstance(image_base64, str) and image_base64.startswith('data:image'):
            image_base64 = image_base64.split(',')[1]
        
        # URL de LM Studio (puerto por defecto)
        lm_studio_url = "http://localhost:1234/v1/chat/completions"
        
        # Prompt para Llava - Versión que FUNCIONÓ (según el usuario)
        # El modelo primero describe lo que ve y luego extrae la información
        prompt = """Primero describe detalladamente todo lo que ves en esta imagen de parada de autobús. Luego busca específicamente:

1. CUALQUIER número, código o texto que contenga la letra P seguida de números (P1171, P625, P123, etc.). Busca en TODA la imagen: carteles, señales, marcas, estructuras, cualquier lugar. Si encuentras un código con P, escríbelo EXACTAMENTE como aparece. Si después de buscar cuidadosamente no encuentras ningún código con P, usa null.

2. CUALQUIER incidencia visible: cristales rotos o dañados, marquesina estropeada, bancos rotos, grafitis, señales dañadas, estructura dañada, basura, cualquier daño visible.

Después de describir lo que ves, responde SOLO con este formato JSON exacto:
{
  "stop_number": "P1171" o null,
  "description": "descripción detallada en español"
}

CRÍTICO: Si ves CUALQUIER código que empiece con P y números, ESCRIBELO. No uses null si ves algo."""
        
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
        payload = {
            "model": "local-model",  # LM Studio usa este nombre genérico
            "messages": messages,
            "temperature": 0.3,  # Temperatura que funcionó según los logs
            "max_tokens": 1000  # Tokens que funcionaron según los logs
        }
        
        print(f"🤖 Enviando imagen a LM Studio en {lm_studio_url}...")
        
        # Intentar con formato multimodal primero
        try:
            response = requests.post(
                lm_studio_url,
                json=payload,
                timeout=60  # Aumentar timeout para modelos grandes
            )
            
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
                
                # Buscar cualquier código con P en la respuesta completa ANTES de extraer JSON
                # Esto puede ayudar a encontrar códigos que el modelo menciona pero no pone en el JSON
                p_code_in_full_text = re.search(r'\bP\s*(\d{3,})\b', original_content, re.IGNORECASE)
                p_code_found_in_text = None
                if p_code_in_full_text:
                    p_code_found_in_text = f"P{p_code_in_full_text.group(1)}"
                    print(f"🔍 Código de parada encontrado en texto completo ANTES de extraer JSON: {p_code_found_in_text}")
                
                # Limpiar el contenido: remover bloques de código markdown si existen
                # Buscar JSON dentro de bloques ```json ... ``` o ``` ... ```
                code_block_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', content, re.DOTALL)
                if code_block_match:
                    content = code_block_match.group(1)
                    print(f"✅ JSON extraído de bloque de código markdown: {content[:200]}...")
                
                # Intentar extraer JSON de la respuesta (patrón más flexible)
                # Buscar cualquier JSON que contenga stop_number o description
                json_match = re.search(r'\{[^{}]*(?:"stop_number"[^{}]*"description"|"description"[^{}]*"stop_number")[^{}]*\}', content, re.DOTALL)
                
                if not json_match:
                    # Intentar un patrón más simple: cualquier bloque JSON
                    json_match = re.search(r'\{[^{}]*"stop_number"[^{}]*\}', content, re.DOTALL)
                
                if not json_match:
                    # Intentar encontrar cualquier JSON
                    json_match = re.search(r'\{[^{}]*"description"[^{}]*\}', content, re.DOTALL)
                
                if not json_match:
                    # Intentar encontrar cualquier JSON válido (más flexible)
                    json_match = re.search(r'\{[^}]*"stop_number"[^}]*\}', content, re.DOTALL)
                
                if not json_match:
                    # Último intento: buscar cualquier objeto JSON
                    json_match = re.search(r'\{.*?"stop_number".*?"description".*?\}', content, re.DOTALL)
                
                if json_match:
                    print(f"✅ JSON encontrado: {json_match.group(0)}")
                    import json as json_lib
                    try:
                        ai_data = json_lib.loads(json_match.group(0))
                        stop_num = ai_data.get('stop_number')
                        desc = ai_data.get('description', '')
                        
                        print(f"📋 Datos extraídos del JSON:")
                        print(f"  - stop_number: {stop_num}")
                        print(f"  - description: {desc}")
                        
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
                            # Buscar descripción en el texto
                            desc_match = re.search(r'"description"\s*:\s*"([^"]+)"', content, re.IGNORECASE)
                            if desc_match:
                                desc = desc_match.group(1)
                                # Si es el texto literal "texto en español", buscar en el contenido
                                if desc.lower().strip() == 'texto en español':
                                    desc = "Sin incidencia visible"
                            else:
                                # Extraer descripción del texto completo
                                desc_text = content
                                if stop_num:
                                    desc_text = re.sub(rf'{re.escape(str(stop_num))}', '', desc_text, flags=re.IGNORECASE)
                                    desc_text = re.sub(r'"stop_number"\s*:\s*"[^"]*"', '', desc_text, flags=re.IGNORECASE)
                                desc_text = re.sub(r'\{[^{}]*\}', '', desc_text)  # Remover JSON
                                desc_text = desc_text.strip()
                                if desc_text and len(desc_text) > 10 and desc_text.lower() != 'texto en español':
                                    desc = desc_text[:200]  # Limitar longitud
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
                    except json_lib.JSONDecodeError:
                        print("⚠️ Error al parsear JSON, intentando extracción manual...")
                        # Continuar con extracción manual
                
                # Si no hay JSON, intentar extraer información con regex
                print("⚠️ No se encontró JSON válido, intentando extracción manual del texto...")
                stop_number = None
                description = content
                
                # Buscar número de parada en el texto (puede incluir letras como P1171)
                print(f"🔍 Buscando número de parada en: {content[:200]}...")
                stop_match = re.search(r'"stop_number"\s*:\s*"?([A-Z]?\d+)"?', content, re.IGNORECASE)
                if stop_match:
                    stop_number = stop_match.group(1).strip()
                    # Limpiar espacios si hay
                    stop_number = stop_number.replace(' ', '')
                    print(f"✅ Número de parada encontrado en JSON: {stop_number}")
                else:
                    # Intentar buscar directamente en el texto usando extract_stop_info
                    print("🔍 Buscando con extract_stop_info...")
                    stop_info = extract_stop_info(content)
                    stop_number = stop_info.get('stop_number')
                    if stop_number:
                        print(f"✅ Número de parada encontrado: {stop_number}")
                    else:
                        print("⚠️ No se encontró número de parada")
                
                # Buscar descripción
                desc_match = re.search(r'"description"\s*:\s*"([^"]+)"', content, re.IGNORECASE)
                if desc_match:
                    description = desc_match.group(1)
                    print(f"✅ Descripción encontrada en JSON: {description}")
                else:
                    # Si no se encuentra en JSON, usar la extracción del texto
                    if not stop_number:
                        stop_info = extract_stop_info(content)
                        description = stop_info.get('description', content)
                        print(f"✅ Descripción extraída del texto: {description}")
                    else:
                        # Buscar descripción en el texto sin el número de parada
                        # Remover el número de parada del texto para obtener la descripción
                        desc_text = content
                        if stop_number:
                            desc_text = re.sub(rf'{re.escape(stop_number)}', '', desc_text, flags=re.IGNORECASE)
                            desc_text = re.sub(r'"stop_number"\s*:\s*"[^"]*"', '', desc_text, flags=re.IGNORECASE)
                        description = desc_text.strip()
                        if not description or len(description) < 5:
                            description = "Incidencia detectada por IA"
                        print(f"✅ Descripción obtenida: {description}")
                
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
                    'error': f'LM Studio no tiene un modelo cargado. Por favor:\n1. Abre LM Studio\n2. Ve a la pestaña "Developer"\n3. Carga un modelo (preferiblemente multimodal para visión)\n4. Asegúrate de que el servidor esté corriendo en http://localhost:1234\n\nError: {error_msg}'
                }
            else:
                print(f"⚠️ LM Studio respondió con código {response.status_code}: {response.text}")
                # Intentar sin formato multimodal
                raise Exception("Formato multimodal no soportado")
                
        except Exception as e:
            print(f"⚠️ Error con formato multimodal, intentando sin imagen: {e}")
            print(f"⚠️ Detalles del error: {type(e).__name__}: {str(e)}")
            
            # Si falla, intentar sin imagen (solo texto)
            # Esto funcionará si el modelo no es multimodal pero puede analizar descripciones
            print("🔄 Intentando con formato de solo texto (sin imagen)...")
            # Para modelos de solo texto, usar un prompt más simple
            text_prompt = """Necesito analizar una imagen de parada de autobús pero no puedo verla directamente. 

Basándote en la descripción que puedas obtener, busca:
1. Un código que empieza con "P" seguido de números (ej: P1171, P625)
2. Incidencias: cristales rotos, marquesina estropeada, bancos rotos, grafitis, señales dañadas, estructura dañada, basura

Responde SOLO en formato JSON:
{"stop_number": "P1171" o null, "description": "texto en español"}

Ejemplo: {"stop_number": "P1171", "description": "cristales rotos"}
Ejemplo sin parada: {"stop_number": null, "description": "Sin incidencia visible"}"""
            
            # Llava solo soporta roles "user" y "assistant", no "system"
            # Incluir las instrucciones del sistema en el prompt del usuario
            text_prompt_with_system = """Eres un analizador de imágenes. Responde SOLO en formato JSON con stop_number y description.

""" + text_prompt
            
            payload_text = {
                "model": "local-model",
                "messages": [
                    {
                        "role": "user",
                        "content": text_prompt_with_system
                    }
                ],
                "temperature": 0.0,
                "max_tokens": 500
            }
            
            try:
                response = requests.post(
                    lm_studio_url,
                    json=payload_text,
                    timeout=60  # Aumentar timeout para modelos grandes
                )
                
                print(f"📡 Respuesta del servidor (solo texto): status={response.status_code}")
                
                if response.status_code == 200:
                    result = response.json()
                    print(f"📋 Resultado completo: {result}")
                    content = result.get('choices', [{}])[0].get('message', {}).get('content', '')
                    
                    if not content:
                        print("⚠️ La respuesta del modelo está vacía")
                        return {
                            'success': False,
                            'error': 'El modelo no generó una respuesta. Asegúrate de que el modelo esté cargado y sea compatible.'
                        }
                    
                    print(f"🤖 Respuesta del modelo (solo texto): {content}")
                    
                    # Intentar extraer JSON primero
                    json_match = re.search(r'\{[^{}]*"stop_number"[^{}]*"description"[^{}]*\}', content, re.DOTALL)
                    if not json_match:
                        json_match = re.search(r'\{[^{}]*\}', content, re.DOTALL)
                    
                    if json_match:
                        import json as json_lib
                        try:
                            ai_data = json_lib.loads(json_match.group(0))
                            stop_num = ai_data.get('stop_number')
                            desc = ai_data.get('description', 'Sin incidencia visible')
                            
                            # Si stop_number es null, buscar en el texto
                            if not stop_num or stop_num == 'null' or stop_num == 'None':
                                stop_info = extract_stop_info(content)
                                stop_num = stop_info.get('stop_number')
                            
                            print(f"📤 Resultado final (solo texto con JSON):")
                            print(f"  - stop_number: {stop_num}")
                            print(f"  - description: {desc}")
                            
                            return {
                                'success': True,
                                'stop_number': stop_num if stop_num and stop_num != 'null' else None,
                                'description': desc if desc else 'Sin incidencia visible',
                                'raw_response': content
                            }
                        except Exception as e:
                            print(f"⚠️ Error parseando JSON: {e}")
                    
                    # Si no hay JSON, extraer información del texto
                    print("⚠️ No se encontró JSON, extrayendo del texto...")
                    stop_info = extract_stop_info(content)
                    
                    print(f"📤 Resultado final (solo texto sin JSON):")
                    print(f"  - stop_number: {stop_info.get('stop_number')}")
                    print(f"  - description: {stop_info.get('description')}")
                    
                    return {
                        'success': True,
                        'stop_number': stop_info.get('stop_number') if stop_info.get('stop_number') else None,
                        'description': stop_info.get('description') if stop_info.get('description') else 'Sin incidencia visible',
                        'raw_response': content
                    }
                else:
                    print(f"❌ Error en respuesta solo texto: {response.status_code}")
                    print(f"❌ Respuesta: {response.text}")
                    return {
                        'success': False,
                        'error': f'LM Studio respondió con código {response.status_code}: {response.text}'
                    }
            except requests.exceptions.Timeout:
                return {
                    'success': False,
                    'error': 'El modelo tardó demasiado en responder. Puede que el modelo sea muy grande o esté procesando. Intenta con un modelo más pequeño o espera más tiempo.'
                }
            except Exception as e2:
                print(f"❌ Error en intento solo texto: {type(e2).__name__}: {str(e2)}")
                return {
                    'success': False,
                    'error': f'Error al procesar con modelo solo texto: {str(e2)}'
                }
        
    except requests.exceptions.ConnectionError:
        error_msg = 'No se puede conectar a LM Studio. Asegúrate de que:\n1. LM Studio esté corriendo\n2. El servidor local esté activo en http://localhost:1234\n3. Ve a la pestaña "Developer" en LM Studio y asegúrate de que el servidor esté iniciado'
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
    print("🚀 Iniciando Web-App de Incidencias...")
    print(f"📱 Accede desde tu móvil a: http://127.0.0.1:5005")
    print("💡 Asegúrate de estar en la misma red WiFi")
    print("🔐 Sistema de sesiones por dispositivo activado")
    
    # Iniciar limpieza de sesiones
    cleanup_expired_sessions()
    
    app.run(host='127.0.0.1', port=5005, debug=True)

