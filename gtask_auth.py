"""
Módulo para manejar autenticación y gestión de usuarios de GTask
"""

import json
import requests
import jwt
from datetime import datetime, timedelta
from gtask_config import get_gtask_url, get_gtask_headers, GTASK_CONFIG

class GTaskAuth:
    def __init__(self):
        self.current_user = None
        self.access_token = None
        self.token_expiry = None
        self.users_list = []
        
    def login(self, username, password):
        """
        Realiza login en GTask
        
        Args:
            username (str): Nombre de usuario
            password (str): Contraseña
            
        Returns:
            dict: Respuesta del login con éxito o error
        """
        try:
            login_data = {
                "username": username,
                "password": password
            }
            
            url = get_gtask_url('login')
            headers = get_gtask_headers()
            
            print(f"🔐 Intentando login en: {url}")
            print(f"👤 Usuario: {username}")
            
            response = requests.post(
                url,
                headers=headers,
                json=login_data,
                timeout=GTASK_CONFIG['timeout']
            )
            
            if response.status_code == 200:
                login_response = response.json()
                
                # Guardar información del usuario
                self.current_user = {
                    '_id': login_response['_id'],
                    'username': login_response['username'],
                    'email': login_response['email'],
                    'DOBLEFA': login_response['DOBLEFA']
                }
                
                self.access_token = login_response['access_token']
                
                # Calcular expiración del token (JWT exp está en segundos desde epoch)
                try:
                    decoded_token = jwt.decode(self.access_token, options={"verify_signature": False})
                    exp_timestamp = decoded_token.get('exp')
                    if exp_timestamp:
                        self.token_expiry = datetime.fromtimestamp(exp_timestamp)
                        print(f"⏰ Token expira: {self.token_expiry}")
                except Exception as e:
                    print(f"⚠️ No se pudo decodificar el token: {e}")
                    # Asumir 24 horas por defecto
                    self.token_expiry = datetime.now() + timedelta(hours=24)
                
                print(f"✅ Login exitoso para: {username}")
                print(f"🆔 ID de usuario: {self.current_user['_id']}")
                
                return {
                    'success': True,
                    'message': 'Login exitoso',
                    'user': self.current_user
                }
                
            else:
                error_msg = f"Error en login: {response.status_code}"
                try:
                    error_data = response.json()
                    error_msg = error_data.get('message', error_msg)
                except:
                    pass
                
                print(f"❌ {error_msg}")
                return {
                    'success': False,
                    'error': error_msg
                }
                
        except requests.exceptions.Timeout:
            error_msg = "Timeout en la conexión con GTask"
            print(f"⏰ {error_msg}")
            return {
                'success': False,
                'error': error_msg
            }
            
        except requests.exceptions.ConnectionError:
            error_msg = "Error de conexión con GTask"
            print(f"🌐 {error_msg}")
            return {
                'success': False,
                'error': error_msg
            }
            
        except Exception as e:
            error_msg = f"Error inesperado en login: {str(e)}"
            print(f"💥 {error_msg}")
            return {
                'success': False,
                'error': error_msg
            }
    
    def get_users_list(self):
        """
        Obtiene la lista de usuarios desde GTask
        
        Returns:
            dict: Lista de usuarios o error
        """
        if not self.access_token:
            return {
                'success': False,
                'error': 'No hay token de acceso válido'
            }
        
        try:
            url = get_gtask_url('users')
            headers = get_gtask_headers(self.access_token)
            
            print(f"👥 Obteniendo lista de usuarios desde: {url}")
            
            response = requests.get(
                url,
                headers=headers,
                timeout=GTASK_CONFIG['timeout']
            )
            
            if response.status_code == 200:
                users_data = response.json()
                self.users_list = users_data
                
                print(f"✅ Lista de usuarios obtenida: {len(users_data)} usuarios")
                
                return {
                    'success': True,
                    'users': users_data,
                    'count': len(users_data)
                }
                
            else:
                error_msg = f"Error al obtener usuarios: {response.status_code}"
                try:
                    error_data = response.json()
                    error_msg = error_data.get('message', error_msg)
                except:
                    pass
                
                print(f"❌ {error_msg}")
                return {
                    'success': False,
                    'error': error_msg
                }
                
        except Exception as e:
            error_msg = f"Error al obtener usuarios: {str(e)}"
            print(f"💥 {error_msg}")
            return {
                'success': False,
                'error': error_msg
            }
    
    def is_token_valid(self):
        """
        Verifica si el token actual es válido
        
        Returns:
            bool: True si el token es válido, False en caso contrario
        """
        if not self.access_token or not self.token_expiry:
            return False
        
        # Verificar si el token ha expirado
        if datetime.now() >= self.token_expiry:
            print("⏰ Token expirado")
            return False
        
        # Verificar si expira en menos de 5 minutos
        if datetime.now() >= (self.token_expiry - timedelta(minutes=5)):
            print("⚠️ Token expira pronto")
            return False
        
        return True
    
    def get_current_user_id(self):
        """
        Obtiene el ID del usuario actual
        
        Returns:
            str: ID del usuario o None si no hay usuario
        """
        if self.current_user and self.is_token_valid():
            return self.current_user['_id']
        return None
    
    def get_current_user_info(self):
        """
        Obtiene información del usuario actual
        
        Returns:
            dict: Información del usuario o None si no hay usuario
        """
        if self.current_user and self.is_token_valid():
            return self.current_user
        return None
    
    def logout(self):
        """
        Cierra la sesión del usuario actual
        """
        print(f"👋 Cerrando sesión de: {self.current_user.get('username', 'Usuario')}")
        self.current_user = None
        self.access_token = None
        self.token_expiry = None
        self.users_list = []
    
    def refresh_token_if_needed(self):
        """
        Refresca el token si es necesario
        
        Returns:
            bool: True si el token está válido, False si necesita refresh
        """
        if self.is_token_valid():
            return True
        
        print("🔄 Token expirado o próximo a expirar")
        return False

    def apply_sso_session(self, access_token: str, user_data: dict | None = None) -> None:
        """Establece sesión GTask tras intercambio SSO del portal."""
        token = (access_token or "").strip()
        if not token:
            raise ValueError("Token GTask requerido")
        user = dict(user_data or {})
        user_id = str(user.get("_id") or user.get("id") or "").strip()
        username = str(user.get("username") or "").strip()
        if not user_id and username:
            user_id = username
        if user_id and not user.get("_id"):
            user["_id"] = user_id
        self.access_token = token
        self.current_user = user or None
        self.token_expiry = self._read_token_expiry(token)

    @staticmethod
    def _read_token_expiry(access_token):
        if not access_token:
            return datetime.now() + timedelta(hours=24)
        try:
            decoded_token = jwt.decode(access_token, options={"verify_signature": False})
            exp_timestamp = decoded_token.get("exp")
            if exp_timestamp:
                return datetime.fromtimestamp(exp_timestamp)
        except Exception:
            pass
        return datetime.now() + timedelta(hours=24)

# Instancia global del autenticador
gtask_auth = GTaskAuth()
