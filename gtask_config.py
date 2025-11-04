# Configuración para la API de GTask
GTASK_CONFIG = {
    'base_url': 'https://gtasks-api.deploy.malla.es',
    'endpoints': {
        'login': '/user/login',
        'users': '/Users'
    },
    'timeout': 30
}

def get_gtask_url(endpoint):
    """Construye la URL completa para un endpoint de GTask"""
    return f"{GTASK_CONFIG['base_url']}{GTASK_CONFIG['endpoints'][endpoint]}"

def get_gtask_headers(access_token=None):
    """Obtiene los headers para las peticiones a GTask"""
    headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
    
    if access_token:
        headers['Authorization'] = f'Bearer {access_token}'
    
    return headers
