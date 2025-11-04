import kivy
from kivy.app import App
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.button import Button
from kivy.uix.label import Label
from kivy.uix.image import Image
from kivy.uix.textinput import TextInput
from kivy.uix.popup import Popup
from kivy.core.window import Window
from kivy.clock import Clock
from kivy.graphics.texture import Texture
from kivy.uix.camera import Camera
from kivy.uix.screenmanager import ScreenManager, Screen
from kivy.uix.scrollview import ScrollView
from kivy.uix.gridlayout import GridLayout

import cv2
import numpy as np
from PIL import Image as PILImage
import base64
import requests
import json
import webbrowser
from pyzbar.pyzbar import decode
import os

# Importar configuración
from config import *

class MainScreen(Screen):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.layout = BoxLayout(orientation='vertical', padding=20, spacing=20)
        
        # Título
        title = Label(
            text='Aplicación de Incidencias',
            size_hint_y=None,
            height=60,
            font_size='24sp',
            bold=True
        )
        self.layout.add_widget(title)
        
        # Campo para ID de tarea
        self.task_id_input = TextInput(
            hint_text='Ingrese el ID de la tarea',
            multiline=False,
            size_hint_y=None,
            height=50,
            font_size='18sp'
        )
        self.layout.add_widget(self.task_id_input)
        
        # Botón para escanear QR
        scan_qr_btn = Button(
            text='Escanear Código QR',
            size_hint_y=None,
            height=60,
            font_size=UI_CONFIG['font_sizes']['body'],
            background_color=UI_CONFIG['colors']['primary']
        )
        scan_qr_btn.bind(on_press=self.show_qr_scanner)
        self.layout.add_widget(scan_qr_btn)
        
        # Botón para tomar/seleccionar foto
        photo_btn = Button(
            text='Tomar/Seleccionar Foto',
            size_hint_y=None,
            height=60,
            font_size=UI_CONFIG['font_sizes']['body'],
            background_color=UI_CONFIG['colors']['success']
        )
        photo_btn.bind(on_press=self.show_photo_options)
        self.layout.add_widget(photo_btn)
        
        # Área de información
        self.info_label = Label(
            text='Escanea un código QR o toma una foto para comenzar',
            size_hint_y=None,
            height=100,
            text_size=(Window.width - 40, None),
            halign='center',
            valign='middle'
        )
        self.layout.add_widget(self.info_label)
        
        # Imagen de vista previa
        self.preview_image = Image(
            size_hint_y=None,
            height=200
        )
        self.layout.add_widget(self.preview_image)
        
        self.add_widget(self.layout)
        
        # Variables de estado
        self.current_qr_data = None
        self.current_photo_base64 = None
        self.current_task_id = None

    def show_qr_scanner(self, instance):
        self.manager.current = 'qr_scanner'

    def show_photo_options(self, instance):
        self.manager.current = 'photo_options'

    def update_info(self, text):
        self.info_label.text = text

    def update_preview(self, image_path):
        if os.path.exists(image_path):
            self.preview_image.source = image_path
            self.preview_image.reload()

class QRScannerScreen(Screen):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.layout = BoxLayout(orientation='vertical', padding=20, spacing=20)
        
        # Título
        title = Label(
            text='Escáner de Código QR',
            size_hint_y=None,
            height=60,
            font_size='24sp',
            bold=True
        )
        self.layout.add_widget(title)
        
        # Cámara
        self.camera = Camera(
            resolution=CAMERA_CONFIG['resolution'],
            play=True,
            size_hint_y=None,
            height=400
        )
        self.layout.add_widget(self.camera)
        
        # Botón para probar cámara
        test_camera_btn = Button(
            text='Probar Cámara',
            size_hint_y=None,
            height=50,
            font_size=UI_CONFIG['font_sizes']['small'],
            background_color=UI_CONFIG['colors']['warning']
        )
        test_camera_btn.bind(on_press=self.test_camera)
        self.layout.add_widget(test_camera_btn)
        
        # Botón para escanear
        scan_btn = Button(
            text='Escanear QR',
            size_hint_y=None,
            height=60,
            font_size=UI_CONFIG['font_sizes']['body'],
            background_color=UI_CONFIG['colors']['primary']
        )
        scan_btn.bind(on_press=self.scan_qr)
        self.layout.add_widget(scan_btn)
        
        # Botón para volver
        back_btn = Button(
            text='Volver',
            size_hint_y=None,
            height=60,
            font_size=UI_CONFIG['font_sizes']['body'],
            background_color=UI_CONFIG['colors']['danger']
        )
        back_btn.bind(on_press=self.go_back)
        self.layout.add_widget(back_btn)
        
        self.add_widget(self.layout)

    def test_camera(self, instance):
        """Probar si la cámara está funcionando correctamente"""
        try:
            texture = self.camera.texture
            if texture and hasattr(texture, 'pixels') and texture.pixels:
                self.show_popup('Cámara OK', 'La cámara está funcionando correctamente')
            else:
                self.show_popup('Error de Cámara', 'La cámara no está disponible o no ha inicializado correctamente')
        except Exception as e:
            self.show_popup('Error', f'Error al probar cámara: {str(e)}')

    def check_camera_ready(self, dt):
        """Verificar si la cámara está lista después de un delay"""
        try:
            texture = self.camera.texture
            if texture and hasattr(texture, 'pixels') and texture.pixels:
                print("Cámara QR lista")
            else:
                print("Cámara QR no está lista")
        except Exception as e:
            print(f"Error verificando cámara QR: {str(e)}")

    def scan_qr(self, instance):
        try:
            # Capturar frame de la cámara
            texture = self.camera.texture
            if texture and hasattr(texture, 'pixels') and texture.pixels:
                # Convertir a formato OpenCV
                size = texture.size
                buf = texture.pixels
                arr = np.frombuffer(buf, dtype=np.uint8)
                arr = arr.reshape(size[1], size[0], 4)
                arr = cv2.cvtColor(arr, cv2.COLOR_RGBA2BGR)
                
                # Decodificar códigos QR
                decoded_objects = decode(arr)
                
                if decoded_objects:
                    qr_data = decoded_objects[0].data.decode('utf-8')
                    self.process_qr_data(qr_data)
                else:
                    self.show_popup('No se detectó código QR', 'Intenta ajustar la posición de la cámara')
            else:
                self.show_popup('Error de Cámara', 'La cámara no está disponible o no ha inicializado correctamente')
        except Exception as e:
            self.show_popup('Error', f'Error al escanear QR: {str(e)}')

    def process_qr_data(self, qr_data):
        # Extraer ID de reserva del QR
        if 'IdQr' in qr_data:
            # Construir URL completa
            url = get_task_system_url(qr_data)
            
            # Guardar datos en la pantalla principal
            main_screen = self.manager.get_screen('main')
            main_screen.current_qr_data = qr_data
            main_screen.update_info(f'QR escaneado: {qr_data}\nURL: {url}')
            
            # Mostrar opciones
            self.show_qr_options(url)
        else:
            self.show_popup('QR inválido', 'El código QR no contiene información válida')

    def show_qr_options(self, url):
        content = BoxLayout(orientation='vertical', padding=20, spacing=20)
        
        # Botón para abrir URL
        open_url_btn = Button(
            text=f'Abrir URL: {url}',
            size_hint_y=None,
            height=60,
            font_size=UI_CONFIG['font_sizes']['small'],
            background_color=UI_CONFIG['colors']['success']
        )
        open_url_btn.bind(on_press=lambda x: self.open_url(url))
        content.add_widget(open_url_btn)
        
        # Botón para continuar
        continue_btn = Button(
            text='Continuar',
            size_hint_y=None,
            height=60,
            font_size=UI_CONFIG['font_sizes']['body'],
            background_color=UI_CONFIG['colors']['primary']
        )
        continue_btn.bind(on_press=self.go_back)
        content.add_widget(continue_btn)
        
        popup = Popup(
            title='QR Escaneado Exitosamente',
            content=content,
            size_hint=(0.9, 0.7)
        )
        popup.open()

    def open_url(self, url):
        try:
            webbrowser.open(url)
        except Exception as e:
            self.show_popup('Error', f'No se pudo abrir la URL: {str(e)}')

    def go_back(self, instance):
        self.manager.current = 'main'

    def show_popup(self, title, message):
        content = BoxLayout(orientation='vertical', padding=20)
        content.add_widget(Label(text=message))
        
        popup = Popup(
            title=title,
            content=content,
            size_hint=(0.8, 0.4)
        )
        popup.open()

class PhotoOptionsScreen(Screen):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.layout = BoxLayout(orientation='vertical', padding=20, spacing=20)
        
        # Título
        title = Label(
            text='Opciones de Foto',
            size_hint_y=None,
            height=60,
            font_size='24sp',
            bold=True
        )
        self.layout.add_widget(title)
        
        # Botón para tomar foto
        take_photo_btn = Button(
            text='Tomar Foto con Cámara',
            size_hint_y=None,
            height=60,
            font_size='18sp',
            background_color=(0.2, 0.6, 1, 1)
        )
        take_photo_btn.bind(on_press=self.take_photo)
        self.layout.add_widget(take_photo_btn)
        
        # Botón para seleccionar de galería
        select_photo_btn = Button(
            text='Seleccionar de Galería',
            size_hint_y=None,
            height=60,
            font_size='18sp',
            background_color=(0.2, 0.8, 0.2, 1)
        )
        select_photo_btn.bind(on_press=self.select_from_gallery)
        self.layout.add_widget(select_photo_btn)
        
        # Botón para volver
        back_btn = Button(
            text='Volver',
            size_hint_y=None,
            height=60,
            font_size='18sp',
            background_color=(0.8, 0.2, 0.2, 1)
        )
        back_btn.bind(on_press=self.go_back)
        self.layout.add_widget(back_btn)
        
        self.add_widget(self.layout)

    def take_photo(self, instance):
        self.manager.current = 'camera_photo'

    def select_from_gallery(self, instance):
        # Implementar selección de galería
        self.show_popup('Funcionalidad', 'Selección de galería implementada')

    def go_back(self, instance):
        self.manager.current = 'main'

    def show_popup(self, title, message):
        content = BoxLayout(orientation='vertical', padding=20)
        content.add_widget(Label(text=message))
        
        popup = Popup(
            title=title,
            content=content,
            size_hint=(0.8, 0.4)
        )
        popup.open()

class CameraPhotoScreen(Screen):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.layout = BoxLayout(orientation='vertical', padding=20, spacing=20)
        
        # Título
        title = Label(
            text='Tomar Foto',
            size_hint_y=None,
            height=60,
            font_size='24sp',
            bold=True
        )
        self.layout.add_widget(title)
        
        # Cámara
        self.camera = Camera(
            resolution=CAMERA_CONFIG['resolution'],
            play=True,
            size_hint_y=None,
            height=400
        )
        self.layout.add_widget(self.camera)
        
        # Programar verificación de cámara después de un delay
        Clock.schedule_once(self.check_camera_ready, 2.0)
        
        # Botón para probar cámara
        test_camera_btn = Button(
            text='Probar Cámara',
            size_hint_y=None,
            height=50,
            font_size=UI_CONFIG['font_sizes']['small'],
            background_color=UI_CONFIG['colors']['warning']
        )
        test_camera_btn.bind(on_press=self.test_camera)
        self.layout.add_widget(test_camera_btn)
        
        # Botón para capturar
        capture_btn = Button(
            text='Capturar Foto',
            size_hint_y=None,
            height=60,
            font_size=UI_CONFIG['font_sizes']['body'],
            background_color=UI_CONFIG['colors']['primary']
        )
        capture_btn.bind(on_press=self.capture_photo)
        self.layout.add_widget(capture_btn)
        
        # Botón para volver
        back_btn = Button(
            text='Volver',
            size_hint_y=None,
            height=60,
            font_size=UI_CONFIG['font_sizes']['body'],
            background_color=UI_CONFIG['colors']['danger']
        )
        back_btn.bind(on_press=self.go_back)
        self.layout.add_widget(back_btn)
        
        self.add_widget(self.layout)

    def test_camera(self, instance):
        """Probar si la cámara está funcionando correctamente"""
        try:
            texture = self.camera.texture
            if texture and hasattr(texture, 'save'):
                self.show_popup('Cámara OK', 'La cámara está funcionando correctamente')
            else:
                self.show_popup('Error de Cámara', 'La cámara no está disponible o no ha inicializado correctamente')
        except Exception as e:
            self.show_popup('Error', f'Error al probar cámara: {str(e)}')

    def check_camera_ready(self, dt):
        """Verificar si la cámara está lista después de un delay"""
        try:
            texture = self.camera.texture
            if texture and hasattr(texture, 'save'):
                print("Cámara de fotos lista")
            else:
                print("Cámara de fotos no está lista")
        except Exception as e:
            print(f"Error verificando cámara de fotos: {str(e)}")

    def capture_photo(self, instance):
        try:
            # Capturar foto
            texture = self.camera.texture
            if texture and hasattr(texture, 'save'):
                # Guardar foto
                photo_path = FILE_CONFIG['photo_filename']
                texture.save(photo_path)
                
                # Convertir a base64
                with open(photo_path, 'rb') as image_file:
                    encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
                
                # Guardar en pantalla principal
                main_screen = self.manager.get_screen('main')
                main_screen.current_photo_base64 = encoded_string
                main_screen.update_preview(photo_path)
                main_screen.update_info('Foto capturada exitosamente. Puedes enviarla a la API.')
                
                # Mostrar opciones de envío
                self.show_send_options(encoded_string)
            else:
                self.show_popup('Error de Cámara', 'La cámara no está disponible o no ha inicializado correctamente')
        except Exception as e:
            self.show_popup('Error', f'Error al capturar foto: {str(e)}')

    def show_send_options(self, photo_base64):
        content = BoxLayout(orientation='vertical', padding=20, spacing=20)
        
        # Botón para enviar a API
        send_btn = Button(
            text='Enviar Foto a API',
            size_hint_y=None,
            height=60,
            font_size=UI_CONFIG['font_sizes']['body'],
            background_color=UI_CONFIG['colors']['success']
        )
        send_btn.bind(on_press=lambda x: self.send_to_api(photo_base64))
        content.add_widget(send_btn)
        
        # Botón para continuar
        continue_btn = Button(
            text='Continuar',
            size_hint_y=None,
            height=60,
            font_size=UI_CONFIG['font_sizes']['body'],
            background_color=UI_CONFIG['colors']['primary']
        )
        continue_btn.bind(on_press=self.go_back)
        content.add_widget(continue_btn)
        
        popup = Popup(
            title='Foto Capturada',
            content=content,
            size_hint=(0.9, 0.7)
        )
        popup.open()

    def send_to_api(self, photo_base64):
        # Obtener ID de tarea
        main_screen = self.manager.get_screen('main')
        task_id = main_screen.task_id_input.text
        
        if not task_id:
            self.show_popup('Error', 'Por favor ingresa un ID de tarea antes de enviar la foto')
            return
        
        # Preparar datos para la API
        api_data = {
            "idTarea": task_id,
            "foto": photo_base64
        }
        
        # Enviar a la API
        try:
            response = requests.post(
                get_api_url(),
                json=api_data,
                headers=API_CONFIG['headers'],
                timeout=API_CONFIG['timeout']
            )
            
            if response.status_code == 200:
                self.show_popup('Éxito', 'Foto enviada exitosamente a la API')
            else:
                self.show_popup('Error', f'Error al enviar foto: {response.status_code}')
                
        except Exception as e:
            self.show_popup('Error', f'Error de conexión: {str(e)}')

    def go_back(self, instance):
        self.manager.current = 'main'

    def show_popup(self, title, message):
        content = BoxLayout(orientation='vertical', padding=20)
        content.add_widget(Label(text=message))
        
        popup = Popup(
            title=title,
            content=content,
            size_hint=(0.8, 0.4)
        )
        popup.open()

class IncidenciasApp(App):
    def build(self):
        # Configurar tamaño de ventana
        Window.size = UI_CONFIG['window_size']
        
        # Crear gestor de pantallas
        sm = ScreenManager()
        sm.add_widget(MainScreen(name='main'))
        sm.add_widget(QRScannerScreen(name='qr_scanner'))
        sm.add_widget(PhotoOptionsScreen(name='photo_options'))
        sm.add_widget(CameraPhotoScreen(name='camera_photo'))
        
        return sm

if __name__ == '__main__':
    IncidenciasApp().run()
