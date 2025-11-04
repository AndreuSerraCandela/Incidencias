# Configuración específica para la Web-App de Incidencias

# Configuración del servidor Flask
FLASK_CONFIG = {
    'host': '0.0.0.0',  # Escuchar en todas las interfaces
    'port': 5000,        # Puerto por defecto
    'debug': True,        # Modo debug (cambiar a False en producción)
    'threaded': True,     # Soporte para múltiples hilos
    'max_content_length': 16 * 1024 * 1024  # 16MB máximo
}

# Configuración de la cámara
CAMERA_CONFIG = {
    'qr_resolution': {
        'width': 1280,
        'height': 720
    },
    'photo_resolution': {
        'width': 1920,
        'height': 1080
    },
    'facing_mode': 'environment',  # Cámara trasera en móviles
    'quality': {
        'qr': 0.8,    # Calidad para QR (balance calidad/tamaño)
        'photo': 0.9  # Calidad para fotos
    }
}

# Configuración de la API
API_CONFIG = {
    'timeout': 30,           # Timeout en segundos
    'max_retries': 3,        # Intentos máximos de reconexión
    'cors_origins': ['*'],   # Orígenes permitidos para CORS
    'rate_limit': {
        'requests_per_minute': 60,
        'burst': 10
    }
}

# Configuración de archivos
FILE_CONFIG = {
    'upload_folder': 'temp_uploads',
    'allowed_extensions': {'.jpg', '.jpeg', '.png', '.bmp'},
    'max_file_size': 16 * 1024 * 1024,  # 16MB
    'cleanup_interval': 3600,  # Limpiar archivos temporales cada hora
    'max_age': 86400  # Mantener archivos por máximo 24 horas
}

# Configuración de seguridad
SECURITY_CONFIG = {
    'enable_https': False,  # Cambiar a True en producción
    'secret_key': 'cambiar_en_produccion',  # Cambiar en producción
    'session_timeout': 3600,  # Timeout de sesión en segundos
    'max_login_attempts': 5
}

# Configuración de logging
LOGGING_CONFIG = {
    'level': 'INFO',
    'format': '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    'file': 'web_app.log',
    'max_size': 10 * 1024 * 1024,  # 10MB
    'backup_count': 5
}

# Configuración de notificaciones
NOTIFICATION_CONFIG = {
    'enable_push': False,  # Notificaciones push (requiere configuración adicional)
    'email_notifications': False,  # Notificaciones por email
    'webhook_url': None  # URL para webhooks
}

# Configuración de rendimiento
PERFORMANCE_CONFIG = {
    'enable_caching': True,
    'cache_timeout': 300,  # 5 minutos
    'enable_compression': True,
    'max_workers': 4,  # Número máximo de workers
    'worker_timeout': 30
}

# Configuración de desarrollo
DEV_CONFIG = {
    'enable_test_buttons': True,  # Botones de prueba en desarrollo
    'mock_camera': False,         # Simular cámara para pruebas
    'debug_info': True,           # Información de debug
    'auto_reload': True           # Recarga automática en desarrollo
}

# Configuración de móviles
MOBILE_CONFIG = {
    'touch_optimized': True,      # Optimización para pantallas táctiles
    'swipe_gestures': True,       # Gestos de deslizamiento
    'vibration_feedback': True,   # Vibración como feedback
    'orientation_lock': False,    # Bloquear orientación
    'fullscreen_mode': True       # Modo pantalla completa
}

# Función para obtener configuración según el entorno
def get_config(environment='development'):
    """Obtener configuración según el entorno"""
    if environment == 'production':
        # Configuración de producción
        FLASK_CONFIG['debug'] = False
        FLASK_CONFIG['host'] = '127.0.0.1'  # Solo localhost en producción
        SECURITY_CONFIG['enable_https'] = True
        SECURITY_CONFIG['secret_key'] = os.environ.get('SECRET_KEY', 'cambiar_en_produccion')
        DEV_CONFIG['enable_test_buttons'] = False
        DEV_CONFIG['debug_info'] = False
        LOGGING_CONFIG['level'] = 'WARNING'
    elif environment == 'testing':
        # Configuración para pruebas
        FLASK_CONFIG['debug'] = True
        FLASK_CONFIG['port'] = 5001  # Puerto diferente para pruebas
        DEV_CONFIG['mock_camera'] = True
        LOGGING_CONFIG['level'] = 'DEBUG'
    
    return {
        'flask': FLASK_CONFIG,
        'camera': CAMERA_CONFIG,
        'api': API_CONFIG,
        'file': FILE_CONFIG,
        'security': SECURITY_CONFIG,
        'logging': LOGGING_CONFIG,
        'notification': NOTIFICATION_CONFIG,
        'performance': PERFORMANCE_CONFIG,
        'dev': DEV_CONFIG,
        'mobile': MOBILE_CONFIG
    }

# Configuración por defecto
DEFAULT_CONFIG = get_config()

if __name__ == "__main__":
    # Mostrar configuración actual
    import json
    print("Configuración de la Web-App de Incidencias:")
    print(json.dumps(DEFAULT_CONFIG, indent=2, default=str))

