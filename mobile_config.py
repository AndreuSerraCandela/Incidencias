# Configuración específica para dispositivos móviles
# Web-App de Incidencias

import os
import platform

# Detección del sistema operativo
SYSTEM = platform.system().lower()
IS_MOBILE = False

# Configuración de cámara para móviles
MOBILE_CAMERA_CONFIG = {
    'constraints': {
        'video': {
            'facingMode': 'environment',  # Cámara trasera por defecto
            'width': { 'ideal': 1280, 'min': 640 },
            'height': { 'ideal': 720, 'min': 480 },
            'aspectRatio': { 'ideal': 16/9 }
        }
    },
    'fallback_constraints': {
        'video': {
            'facingMode': 'user',  # Cámara frontal como respaldo
            'width': { 'ideal': 640, 'min': 320 },
            'height': { 'ideal': 480, 'min': 240 }
        }
    }
}

# Configuración de permisos
PERMISSIONS_CONFIG = {
    'camera': True,
    'microphone': False,  # No necesario para esta app
    'geolocation': False,  # No necesario para esta app
    'notifications': False  # No necesario para esta app
}

# Configuración de navegadores móviles
MOBILE_BROWSER_CONFIG = {
    'chrome_android': {
        'user_agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36',
        'supports_camera': True,
        'requires_https': True,
        'permission_api': True
    },
    'safari_ios': {
        'user_agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
        'supports_camera': True,
        'requires_https': True,
        'permission_api': False  # iOS Safari no tiene API de permisos
    },
    'firefox_mobile': {
        'user_agent': 'Mozilla/5.0 (Android 10; Mobile; rv:68.0) Gecko/68.0',
        'supports_camera': True,
        'requires_https': False,
        'permission_api': True
    }
}

# Configuración de resolución para diferentes dispositivos
RESOLUTION_CONFIG = {
    'low_end': {
        'width': 640,
        'height': 480,
        'quality': 0.7
    },
    'mid_range': {
        'width': 1280,
        'height': 720,
        'quality': 0.8
    },
    'high_end': {
        'width': 1920,
        'height': 1080,
        'quality': 0.9
    }
}

# Configuración de orientación
ORIENTATION_CONFIG = {
    'lock_orientation': False,  # Permitir rotación
    'preferred_orientation': 'portrait',  # Preferir vertical
    'support_landscape': True
}

# Configuración de gestos táctiles
TOUCH_CONFIG = {
    'enable_swipe': True,
    'enable_pinch_zoom': True,
    'enable_double_tap': True,
    'vibration_feedback': True
}

# Configuración de rendimiento móvil
PERFORMANCE_CONFIG = {
    'enable_compression': True,
    'max_image_size': 5 * 1024 * 1024,  # 5MB máximo para móviles
    'enable_caching': True,
    'cache_timeout': 300,  # 5 minutos
    'enable_lazy_loading': True
}

# Configuración de red móvil
NETWORK_CONFIG = {
    'timeout': 30,  # Timeout más largo para conexiones móviles
    'retry_attempts': 3,
    'enable_offline_support': False,
    'sync_when_online': True
}

# Configuración de almacenamiento
STORAGE_CONFIG = {
    'max_local_storage': 50 * 1024 * 1024,  # 50MB máximo
    'cleanup_interval': 1800,  # Limpiar cada 30 minutos
    'enable_compression': True
}

# Función para detectar dispositivo móvil
def detect_mobile_device(user_agent=None):
    """Detectar si el dispositivo es móvil basado en User-Agent"""
    if user_agent is None:
        return False
    
    mobile_keywords = [
        'Android', 'iPhone', 'iPad', 'iPod', 'BlackBerry',
        'Windows Phone', 'Mobile', 'Tablet'
    ]
    
    return any(keyword.lower() in user_agent.lower() for keyword in mobile_keywords)

# Función para obtener configuración optimizada para el dispositivo
def get_optimized_config(user_agent=None, device_info=None):
    """Obtener configuración optimizada para el dispositivo específico"""
    
    is_mobile = detect_mobile_device(user_agent)
    
    if is_mobile:
        # Configuración para móviles
        return {
            'camera': MOBILE_CAMERA_CONFIG,
            'permissions': PERMISSIONS_CONFIG,
            'resolution': RESOLUTION_CONFIG['mid_range'],
            'orientation': ORIENTATION_CONFIG,
            'touch': TOUCH_CONFIG,
            'performance': PERFORMANCE_CONFIG,
            'network': NETWORK_CONFIG,
            'storage': STORAGE_CONFIG,
            'optimizations': {
                'enable_mobile_ui': True,
                'enable_touch_gestures': True,
                'enable_camera_optimization': True,
                'enable_battery_optimization': True
            }
        }
    else:
        # Configuración para escritorio
        return {
            'camera': {
                'constraints': {
                    'video': {
                        'width': { 'ideal': 1920, 'min': 1280 },
                        'height': { 'ideal': 1080, 'min': 720 }
                    }
                }
            },
            'permissions': PERMISSIONS_CONFIG,
            'resolution': RESOLUTION_CONFIG['high_end'],
            'orientation': {'lock_orientation': False},
            'touch': {'enable_swipe': False, 'enable_pinch_zoom': False},
            'performance': {
                'enable_compression': False,
                'max_image_size': 16 * 1024 * 1024,  # 16MB para escritorio
                'enable_caching': True,
                'cache_timeout': 600
            },
            'network': {'timeout': 15, 'retry_attempts': 2},
            'storage': {'max_local_storage': 100 * 1024 * 1024},  # 100MB para escritorio
            'optimizations': {
                'enable_mobile_ui': False,
                'enable_touch_gestures': False,
                'enable_camera_optimization': False,
                'enable_battery_optimization': False
            }
        }

# Función para verificar compatibilidad del navegador
def check_browser_compatibility(user_agent):
    """Verificar compatibilidad del navegador con la aplicación"""
    
    compatibility = {
        'camera_support': False,
        'getusermedia_support': False,
        'canvas_support': False,
        'file_api_support': False,
        'https_required': False,
        'recommendations': []
    }
    
    # Verificar soporte de cámara
    if 'chrome' in user_agent.lower():
        compatibility['camera_support'] = True
        compatibility['getusermedia_support'] = True
        compatibility['https_required'] = True
    elif 'safari' in user_agent.lower():
        compatibility['camera_support'] = True
        compatibility['getusermedia_support'] = True
        compatibility['https_required'] = True
    elif 'firefox' in user_agent.lower():
        compatibility['camera_support'] = True
        compatibility['getusermedia_support'] = True
        compatibility['https_required'] = False
    elif 'edge' in user_agent.lower():
        compatibility['camera_support'] = True
        compatibility['getusermedia_support'] = True
        compatibility['https_required'] = True
    
    # Verificar soporte de canvas (asumimos que está disponible en navegadores modernos)
    compatibility['canvas_support'] = True
    
    # Verificar soporte de File API
    compatibility['file_api_support'] = True
    
    # Generar recomendaciones
    if not compatibility['camera_support']:
        compatibility['recommendations'].append('Actualiza tu navegador a una versión más reciente')
    
    if compatibility['https_required']:
        compatibility['recommendations'].append('Usa HTTPS para acceso completo a la cámara')
    
    if 'mobile' in user_agent.lower():
        compatibility['recommendations'].append('Asegúrate de usar el navegador completo, no la vista de aplicación')
    
    return compatibility

# Función para obtener instrucciones de solución de problemas
def get_troubleshooting_guide(error_type, user_agent=None):
    """Obtener guía de solución de problemas específica"""
    
    guides = {
        'camera_permission_denied': {
            'title': 'Permisos de Cámara Denegados',
            'steps': [
                'Ve a Configuración > Aplicaciones > [Tu Navegador]',
                'Permisos > Cámara debe estar Activado',
                'Si está desactivado, tócalo para activarlo',
                'Reinicia el navegador y prueba de nuevo'
            ],
            'mobile_specific': [
                'En Android: Configuración > Aplicaciones > [Navegador] > Permisos > Cámara',
                'En iOS: Configuración > [Navegador] > Cámara > Permitir'
            ]
        },
        'camera_not_found': {
            'title': 'Cámara No Encontrada',
            'steps': [
                'Verifica que tu dispositivo tenga cámara',
                'Asegúrate de que no esté siendo usada por otra aplicación',
                'Cierra otras apps que puedan estar usando la cámara',
                'Reinicia tu dispositivo si el problema persiste'
            ]
        },
        'browser_not_supported': {
            'title': 'Navegador No Soportado',
            'steps': [
                'Usa Chrome, Firefox, Safari o Edge',
                'Actualiza tu navegador a la versión más reciente',
                'Si usas un navegador antiguo, considera cambiarlo'
            ]
        },
        'https_required': {
            'title': 'HTTPS Requerido',
            'steps': [
                'Los navegadores modernos requieren HTTPS para acceso a cámara',
                'En desarrollo local, usa http://localhost',
                'En producción, asegúrate de tener un certificado SSL válido'
            ]
        }
    }
    
    return guides.get(error_type, {
        'title': 'Error Desconocido',
        'steps': ['Contacta al soporte técnico'],
        'mobile_specific': []
    })

# Configuración por defecto
DEFAULT_MOBILE_CONFIG = get_optimized_config()

if __name__ == "__main__":
    # Mostrar configuración actual
    import json
    print("Configuración Móvil de la Web-App de Incidencias:")
    print(json.dumps(DEFAULT_MOBILE_CONFIG, indent=2, default=str))
    
    # Ejemplo de detección
    test_user_agent = "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36"
    print(f"\nDetección de dispositivo móvil: {detect_mobile_device(test_user_agent)}")
    
    # Ejemplo de compatibilidad
    compatibility = check_browser_compatibility(test_user_agent)
    print(f"\nCompatibilidad del navegador:")
    print(json.dumps(compatibility, indent=2, default=str))


