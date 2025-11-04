"""
Módulo para manejar almacenamiento local en el móvil
"""

import json
import os
from datetime import datetime, timedelta

class MobileStorage:
    def __init__(self, storage_file='mobile_storage.json'):
        self.storage_file = storage_file
        self.data = self.load_data()
    
    def load_data(self):
        """Carga los datos del almacenamiento local"""
        try:
            if os.path.exists(self.storage_file):
                with open(self.storage_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    print(f"📱 Datos cargados del almacenamiento local: {self.storage_file}")
                    return data
            else:
                print(f"📱 Creando nuevo archivo de almacenamiento: {self.storage_file}")
                return self.get_default_data()
        except Exception as e:
            print(f"⚠️ Error al cargar almacenamiento local: {e}")
            return self.get_default_data()
    
    def get_default_data(self):
        """Retorna la estructura de datos por defecto"""
        return {
            'user_session': None,
            'last_login': None,
            'users_list': [],
            'app_settings': {
                'theme': 'light',
                'language': 'es',
                'notifications': True
            },
            'created_at': datetime.now().isoformat()
        }
    
    def save_data(self):
        """Guarda los datos en el almacenamiento local"""
        try:
            # Actualizar timestamp de modificación
            self.data['last_modified'] = datetime.now().isoformat()
            
            with open(self.storage_file, 'w', encoding='utf-8') as f:
                json.dump(self.data, f, indent=2, ensure_ascii=False)
            
            print(f"💾 Datos guardados en almacenamiento local: {self.storage_file}")
            return True
        except Exception as e:
            print(f"❌ Error al guardar almacenamiento local: {e}")
            return False
    
    def save_user_session(self, user_data, access_token, token_expiry):
        """
        Guarda la sesión del usuario
        
        Args:
            user_data (dict): Información del usuario
            access_token (str): Token de acceso
            token_expiry (datetime): Fecha de expiración del token
        """
        try:
            self.data['user_session'] = {
                'user': user_data,
                'access_token': access_token,
                'token_expiry': token_expiry.isoformat() if token_expiry else None,
                'login_timestamp': datetime.now().isoformat()
            }
            
            self.data['last_login'] = datetime.now().isoformat()
            
            if self.save_data():
                print(f"✅ Sesión de usuario guardada: {user_data.get('username', 'Usuario')}")
                return True
            else:
                return False
                
        except Exception as e:
            print(f"❌ Error al guardar sesión de usuario: {e}")
            return False
    
    def get_user_session(self):
        """
        Obtiene la sesión del usuario guardada
        
        Returns:
            dict: Sesión del usuario o None si no hay sesión válida
        """
        session = self.data.get('user_session')
        if not session:
            return None
        
        # Verificar si el token ha expirado
        if session.get('token_expiry'):
            try:
                expiry = datetime.fromisoformat(session['token_expiry'])
                if datetime.now() >= expiry:
                    print("⏰ Sesión expirada, eliminando del almacenamiento")
                    self.clear_user_session()
                    return None
            except Exception as e:
                print(f"⚠️ Error al verificar expiración: {e}")
        
        print(f"👤 Sesión de usuario recuperada: {session['user'].get('username', 'Usuario')}")
        return session
    
    def clear_user_session(self):
        """Limpia la sesión del usuario"""
        self.data['user_session'] = None
        self.save_data()
        print("🗑️ Sesión de usuario limpiada")
    
    def save_users_list(self, users_list):
        """
        Guarda la lista de usuarios
        
        Args:
            users_list (list): Lista de usuarios
        """
        self.data['users_list'] = users_list
        self.data['users_last_update'] = datetime.now().isoformat()
        
        if self.save_data():
            print(f"✅ Lista de usuarios guardada: {len(users_list)} usuarios")
            return True
        else:
            return False
    
    def get_users_list(self):
        """
        Obtiene la lista de usuarios guardada
        
        Returns:
            list: Lista de usuarios o lista vacía
        """
        users = self.data.get('users_list', [])
        last_update = self.data.get('users_last_update')
        
        if users and last_update:
            try:
                update_time = datetime.fromisoformat(last_update)
                # Verificar si la lista tiene menos de 1 hora
                if datetime.now() - update_time < timedelta(hours=1):
                    print(f"👥 Lista de usuarios recuperada del cache: {len(users)} usuarios")
                    return users
            except Exception as e:
                print(f"⚠️ Error al verificar timestamp de usuarios: {e}")
        
        print("👥 No hay lista de usuarios en cache o está desactualizada")
        return []
    
    def update_app_setting(self, key, value):
        """
        Actualiza una configuración de la aplicación
        
        Args:
            key (str): Clave de la configuración
            value: Valor de la configuración
        """
        self.data['app_settings'][key] = value
        self.save_data()
        print(f"⚙️ Configuración actualizada: {key} = {value}")
    
    def get_app_setting(self, key, default=None):
        """
        Obtiene una configuración de la aplicación
        
        Args:
            key (str): Clave de la configuración
            default: Valor por defecto si no existe
            
        Returns:
            Valor de la configuración o el valor por defecto
        """
        return self.data.get('app_settings', {}).get(key, default)
    
    def is_user_logged_in(self):
        """
        Verifica si hay un usuario logueado
        
        Returns:
            bool: True si hay usuario logueado, False en caso contrario
        """
        session = self.get_user_session()
        return session is not None
    
    def get_current_user_id(self):
        """
        Obtiene el ID del usuario actual
        
        Returns:
            str: ID del usuario o None si no hay usuario
        """
        session = self.get_user_session()
        if session and session.get('user'):
            return session['user'].get('_id')
        return None
    
    def get_current_user_info(self):
        """
        Obtiene información del usuario actual
        
        Returns:
            dict: Información del usuario o None si no hay usuario
        """
        session = self.get_user_session()
        if session and session.get('user'):
            return session['user']
        return None
    
    def get_storage_info(self):
        """
        Obtiene información del almacenamiento
        
        Returns:
            dict: Información del almacenamiento
        """
        return {
            'storage_file': self.storage_file,
            'file_size': os.path.getsize(self.storage_file) if os.path.exists(self.storage_file) else 0,
            'created_at': self.data.get('created_at'),
            'last_modified': self.data.get('last_modified'),
            'user_logged_in': self.is_user_logged_in(),
            'users_count': len(self.data.get('users_list', [])),
            'app_settings_count': len(self.data.get('app_settings', {}))
        }

# Instancia global del almacenamiento
mobile_storage = MobileStorage()
