# Archivo de configuración para la Aplicación de incidencias

import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent / '.env')
except ImportError:
    pass


def _env(key, default=''):
    val = os.getenv(key)
    if val is None:
        return default
    return val


def _env_int(key, default):
    raw = os.getenv(key)
    if raw is None or str(raw).strip() == '':
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


def _env_bool(key, default=True):
    raw = os.getenv(key)
    if raw is None or str(raw).strip() == '':
        return default
    return str(raw).strip().lower() in ('1', 'true', 't', 'yes', 'y', 'on')


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

# Configuración de Business Central (credenciales desde .env)
BC_CONFIG = {
    'base_url': _env('BC_BASE_URL', 'https://bc220.malla.es').rstrip('/'),
    'endpoint': _env('BC_ENDPOINT', '/powerbi/ODataV4/GtaskMalla_PostFijacion'),
    'endpoint_incidences': _env(
        'BC_ENDPOINT_INCIDENCES',
        '/powerbi/ODataV4/GtaskMalla_PostIncidencia',
    ),
    'company': _env('BC_COMPANY', 'Malla Publicidad'),
    'credentials': {
        'username': _env('BC_USERNAME', ''),
        'password': _env('BC_PASSWORD', ''),
    },
    'timeout': _env_int('BC_TIMEOUT', 120),
    'timeout_large_images': _env_int('BC_TIMEOUT_LARGE_IMAGES', 300),
    'max_image_size_mb': _env_int('BC_MAX_IMAGE_SIZE_MB', 10),
    'compress_quality': _env_int('BC_COMPRESS_QUALITY', 85),
    'enable_compression': _env_bool('BC_ENABLE_COMPRESSION', True),
}

# SQL Server GIS — MobiliarioGis / RecursosGis (credenciales desde .env)
GIS_SQL_CONFIG = {
    'server': _env('GIS_SQL_SERVER', '192.168.10.190'),
    'database': _env('GIS_SQL_DATABASE', 'Malla2009'),
    'username': _env('GIS_SQL_USERNAME', ''),
    'password': _env('GIS_SQL_PASSWORD', ''),
}

# Flask / sesión
FLASK_SECRET_KEY = _env('FLASK_SECRET_KEY', 'cambiar_en_produccion')

# LM Studio (visión)
LM_STUDIO_URL = _env(
    'LM_STUDIO_URL',
    'http://192.168.10.238:1234/v1/chat/completions',
)

# Configuración de tipos de incidencia
INCIDENCE_CONFIG = {
    'types': 'EMT,Mobiliario Urbano,Vallas',  # Tipos separados por comas
    'default_type': 'Mobiliario Urbano'  # Tipo por defecto si no se especifica
}

# Mapeo de tipos de incidencia para Business Central
# "Mobiliario Urbano" se envía como "MTO" a Business Central
INCIDENCE_TYPE_MAPPING = {
    'Mobiliario Urbano': 'MTO',
    'EMT': 'EMT',
    'Vallas': 'VALLAS',
}

# Subtipos de incidencia (tras elegir el tipo)
INCIDENCE_SUBTYPES_CONFIG = {
    'subtypes': 'Mantenimiento,Limpieza,Electrico,Poda,Tip,Otras',
    'default_subtype': 'Mantenimiento',
}

# Mapeo opcional de subtipos para Business Central (si BC usa otros códigos)
INCIDENCE_SUBTYPE_MAPPING = {
    'Mantenimiento': 'MANTENIMIENTO',
    'Limpieza': 'LIMPIEZA',
    'Electrico': 'ELECTRICO',
    'Poda': 'PODA',
    'Tip': 'TIP',
    'Otras': 'OTRAS',
}

# Configuración de búsqueda de elementos cercanos
SEARCH_CONFIG = {
    'default_radius_meters': 500,  # Radio por defecto en metros (1km)
    'max_radius_meters': 5000,      # Radio máximo permitido en metros (5km)
    'min_radius_meters': 50         # Radio mínimo permitido en metros
}

# Función para obtener la URL completa de la API
def get_api_url():
    return f"{API_CONFIG['base_url']}{API_CONFIG['endpoint']}"


def get_gis_sql_connection(prefer_driver17=True):
    """
    Conexión ODBC a Malla2009 (GIS). Credenciales desde .env / GIS_SQL_CONFIG.
    """
    import pyodbc

    server = GIS_SQL_CONFIG['server']
    database = GIS_SQL_CONFIG['database']
    username = GIS_SQL_CONFIG['username']
    password = GIS_SQL_CONFIG['password']
    if not username or not password:
        raise ValueError(
            'Faltan GIS_SQL_USERNAME / GIS_SQL_PASSWORD en el archivo .env'
        )

    drivers = (
        ['ODBC Driver 17 for SQL Server', 'SQL Server']
        if prefer_driver17
        else ['SQL Server', 'ODBC Driver 17 for SQL Server']
    )
    last_err = None
    for driver in drivers:
        try:
            return pyodbc.connect(
                f'DRIVER={{{driver}}};'
                f'SERVER={server};'
                f'DATABASE={database};'
                f'UID={username};'
                f'PWD={password}'
            )
        except pyodbc.Error as e:
            last_err = e
            continue
    raise last_err


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
    types_str = INCIDENCE_CONFIG.get('types', 'Mobiliario Urbano')
    return [t.strip() for t in types_str.split(',') if t.strip()]

# Función para obtener el tipo de incidencia por defecto
def get_default_incidence_type():
    """Obtiene el tipo de incidencia por defecto"""
    types = get_incidence_types()
    if len(types) == 1:
        return types[0]
    return INCIDENCE_CONFIG.get('default_type', 'Mobiliario Urbano')

# Función para mapear tipo de incidencia para Business Central
def map_incidence_type_for_bc(incidence_type):
    """Mapea el tipo de incidencia para Business Central.
    'Mobiliario Urbano' se convierte en 'MTO'"""
    return INCIDENCE_TYPE_MAPPING.get(incidence_type, incidence_type)


def get_incidence_subtypes():
    """Lista de subtipos de incidencia disponibles."""
    s = INCIDENCE_SUBTYPES_CONFIG.get('subtypes', 'Mantenimiento')
    return [x.strip() for x in s.split(',') if x.strip()]


def get_allowed_subtypes_for_incidence_type(incidence_type: str) -> list:
    """
    Subtipos permitidos según el tipo de incidencia.
    EMT: no Otras ni Poda. No EMT: no Tip.
    """
    all_subs = get_incidence_subtypes()
    t = (incidence_type or '').strip()
    if t == 'EMT':
        return [s for s in all_subs if s not in ('Otras', 'Poda')]
    return [s for s in all_subs if s != 'Tip']


def get_default_incidence_subtype():
    """Subtipo por defecto."""
    subs = get_incidence_subtypes()
    default = INCIDENCE_SUBTYPES_CONFIG.get('default_subtype', 'Mantenimiento')
    if default in subs:
        return default
    return subs[0] if subs else 'Mantenimiento'


def map_incidence_subtype_for_bc(subtype):
    """Mapea el subtipo para Business Central."""
    return INCIDENCE_SUBTYPE_MAPPING.get(subtype, subtype)


def normalize_incidence_subtype_input(raw):
    """
    Convierte un subtipo recibido del cliente o de BC al valor UI canónico.
    Acepta nombres de pantalla o códigos ya mapeados para BC.
    """
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    ui_list = get_incidence_subtypes()
    if s in ui_list:
        return s
    reverse = {v: k for k, v in INCIDENCE_SUBTYPE_MAPPING.items()}
    if s in reverse:
        return reverse[s]
    return None

