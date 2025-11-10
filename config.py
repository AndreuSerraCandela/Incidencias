# Archivo de configuración para la Aplicación de incidencias

# Configuración de la API
API_CONFIG = {
    'base_url': 'http://localhost:8080',
    'endpoint': '/powerbi/ODataV4/Gtask_Registrarfoto',
    'timeout': 10,
    'headers': {
        'Content-Type': 'application/json'
    }
}

# Configuración de la URL del sistema de tareas
TASK_SYSTEM_CONFIG = {
    'base_url': 'https://gtasks-app.deploy.malla.es',
    'qr_path': '/IdQr'
}

# Configuración de la cámara
CAMERA_CONFIG = {
    'resolution': (640, 480),
    'fps': 30
}

# Configuración de la interfaz
UI_CONFIG = {
    'window_size': (400, 700),
    'colors': {
        'primary': (0.2, 0.6, 1, 1),      # Azul
        'success': (0.2, 0.8, 0.2, 1),    # Verde
        'danger': (0.8, 0.2, 0.2, 1),     # Rojo
        'warning': (1, 0.6, 0.2, 1),      # Naranja
        'info': (0.6, 0.6, 0.6, 1)        # Gris
    },
    'font_sizes': {
        'title': '24sp',
        'subtitle': '20sp',
        'body': '18sp',
        'small': '16sp'
    }
}

# Configuración de archivos
FILE_CONFIG = {
    'photo_filename': 'captured_photo.jpg',
    'supported_formats': ['.jpg', '.jpeg', '.png'],
    'max_file_size': 10 * 1024 * 1024  # 10MB
}

# Configuración de logging
LOGGING_CONFIG = {
    'level': 'INFO',
    'format': '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    'file': 'incidencias.log'
}

# Configuración de Business Central
BC_CONFIG = {
    'base_url': 'https://bc220.malla.es',
    'endpoint': '/powerbi/ODataV4/GtaskMalla_PostFijacion',  # Endpoint para fijaciones
    'endpoint_incidences': '/powerbi/ODataV4/GtaskMalla_PostIncidencia',  # Endpoint para incidencias (si existe)
    'company': 'Malla Publicidad',
    'credentials': {
        'username': 'debug',
        'password': 'Ib6343ds.'
    },
    'timeout': 120,  # Aumentado a 2 minutos para imágenes grandes
    'timeout_large_images': 300,  # 5 minutos para imágenes muy grandes
    'max_image_size_mb': 10,  # Tamaño máximo antes de comprimir
    'compress_quality': 85,  # Calidad de compresión JPEG (1-100)
    'enable_compression': True  # Habilitar compresión automática
}

# Configuración de tipos de incidencia
INCIDENCE_CONFIG = {
    'types': 'EMT',  # Tipos separados por comas: 'EMT,OTRO,TIPO'
    'default_type': 'EMT'  # Tipo por defecto si no se especifica
}

# Función para obtener la URL completa de la API
def get_api_url():
    return f"{API_CONFIG['base_url']}{API_CONFIG['endpoint']}"

# Función para obtener la URL completa del sistema de tareas
def get_task_system_url(qr_data):
    return f"{TASK_SYSTEM_CONFIG['base_url']}{TASK_SYSTEM_CONFIG['qr_path']}/{qr_data}"

# Función para validar el formato de la foto
def is_valid_photo_format(filename):
    return any(filename.lower().endswith(fmt) for fmt in FILE_CONFIG['supported_formats'])

# Función para validar el tamaño del archivo
def is_valid_file_size(file_size):
    return file_size <= FILE_CONFIG['max_file_size']

# Función para obtener la URL completa de Business Central
def get_bc_url():
    return f"{BC_CONFIG['base_url']}{BC_CONFIG['endpoint']}"

# Función para obtener la URL completa de Business Central para incidencias
def get_bc_incidences_url():
    endpoint = BC_CONFIG.get('endpoint_incidences', BC_CONFIG['endpoint'])  # Fallback a endpoint de fijaciones
    return f"{BC_CONFIG['base_url']}{endpoint}"

# Función para crear autenticación básica
def get_bc_auth_header():
    import base64
    credentials = f"{BC_CONFIG['credentials']['username']}:{BC_CONFIG['credentials']['password']}"
    encoded_credentials = base64.b64encode(credentials.encode()).decode()
    return f"Basic {encoded_credentials}"

# Función para calcular timeout basado en tamaño de imagen
def get_timeout_for_image(image_size_mb):
    if image_size_mb > BC_CONFIG['max_image_size_mb']:
        return BC_CONFIG['timeout_large_images']
    else:
        return BC_CONFIG['timeout']

# Función para obtener tipos de incidencia disponibles
def get_incidence_types():
    """Obtiene la lista de tipos de incidencia disponibles"""
    types_str = INCIDENCE_CONFIG.get('types', 'EMT')
    return [t.strip() for t in types_str.split(',') if t.strip()]

# Función para obtener el tipo de incidencia por defecto
def get_default_incidence_type():
    """Obtiene el tipo de incidencia por defecto"""
    types = get_incidence_types()
    if len(types) == 1:
        return types[0]
    return INCIDENCE_CONFIG.get('default_type', 'EMT')

