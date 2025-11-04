import kivy
from kivy.app import App
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.button import Button
from kivy.uix.label import Label
from kivy.uix.textinput import TextInput
from kivy.uix.popup import Popup
from kivy.core.window import Window
from kivy.uix.screenmanager import ScreenManager, Screen

import base64
import requests
import json
import webbrowser
import os

# Configuración simplificada
API_CONFIG = {
    'base_url': 'http://localhost:8080',
    'endpoint': '/powerbi/ODataV4/Gtask_Registrarfoto',
    'timeout': 10,
    'headers': {'Content-Type': 'application/json'}
}

TASK_SYSTEM_CONFIG = {
    'base_url': 'https://gtasks-app.deploy.malla.es',
    'qr_path': '/IdQr'
}

class MainScreen(Screen):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.layout = BoxLayout(orientation='vertical', padding=20, spacing=20)
        
        # Título
        title = Label(
            text='Aplicación de Incidencias (Modo Prueba)',
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
        
        # Campo para simular código QR
        self.qr_input = TextInput(
            hint_text='Simular código QR (ej: IdQr123)',
            multiline=False,
            size_hint_y=None,
            height=50,
            font_size='18sp'
        )
        self.layout.add_widget(self.qr_input)
        
        # Botón para simular escaneo QR
        scan_qr_btn = Button(
            text='Simular Escaneo QR',
            size_hint_y=None,
            height=60,
            font_size='18sp',
            background_color=(0.2, 0.6, 1, 1)
        )
        scan_qr_btn.bind(on_press=self.simulate_qr_scan)
        self.layout.add_widget(scan_qr_btn)
        
        # Botón para simular foto
        photo_btn = Button(
            text='Simular Captura de Foto',
            size_hint_y=None,
            height=60,
            font_size='18sp',
            background_color=(0.2, 0.8, 0.2, 1)
        )
        photo_btn.bind(on_press=self.simulate_photo_capture)
        self.layout.add_widget(photo_btn)
        
        # Área de información
        self.info_label = Label(
            text='Modo de prueba - Sin cámara\nIngresa datos manualmente para probar',
            size_hint_y=None,
            height=100,
            text_size=(Window.width - 40, None),
            halign='center',
            valign='middle'
        )
        self.layout.add_widget(self.info_label)
        
        self.add_widget(self.layout)
        
        # Variables de estado
        self.current_qr_data = None
        self.current_photo_base64 = None

    def simulate_qr_scan(self, instance):
        qr_data = self.qr_input.text.strip()
        if qr_data:
            self.process_qr_data(qr_data)
        else:
            self.show_popup('Error', 'Por favor ingresa un código QR simulado')

    def simulate_photo_capture(self, instance):
        # Crear una imagen de prueba simple
        self.create_test_image()
        
        # Convertir a base64
        try:
            with open('test_image.jpg', 'rb') as image_file:
                encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
            
            self.current_photo_base64 = encoded_string
            self.info_label.text = 'Foto simulada creada exitosamente.\nPuedes enviarla a la API.'
            
            # Mostrar opciones de envío
            self.show_send_options(encoded_string)
            
        except Exception as e:
            self.show_popup('Error', f'Error al crear imagen de prueba: {str(e)}')

    def create_test_image(self):
        """Crear una imagen de prueba simple"""
        try:
            from PIL import Image, ImageDraw, ImageFont
            
            # Crear imagen de prueba
            img = Image.new('RGB', (300, 200), color='lightblue')
            draw = ImageDraw.Draw(img)
            
            # Agregar texto
            try:
                font = ImageFont.load_default()
            except:
                font = None
            
            draw.text((10, 10), "IMAGEN DE PRUEBA", fill='black', font=font)
            draw.text((10, 50), "Aplicacion de incidencias", fill='black', font=font)
            draw.text((10, 90), "Modo de Prueba", fill='black', font=font)
            
            # Guardar imagen
            img.save('test_image.jpg')
            
        except ImportError:
            # Si PIL no está disponible, crear un archivo de texto como imagen
            with open('test_image.jpg', 'w') as f:
                f.write("IMAGEN DE PRUEBA\nAplicacion de incidencias\nModo de Prueba")

    def process_qr_data(self, qr_data):
        # Construir URL completa
        url = f"{TASK_SYSTEM_CONFIG['base_url']}{TASK_SYSTEM_CONFIG['qr_path']}/{qr_data}"
        
        # Guardar datos
        self.current_qr_data = qr_data
        self.info_label.text = f'QR simulado: {qr_data}\nURL: {url}'
        
        # Mostrar opciones
        self.show_qr_options(url)

    def show_qr_options(self, url):
        content = BoxLayout(orientation='vertical', padding=20, spacing=20)
        
        # Botón para abrir URL
        open_url_btn = Button(
            text=f'Abrir URL: {url}',
            size_hint_y=None,
            height=60,
            font_size='16sp',
            background_color=(0.2, 0.8, 0.2, 1)
        )
        open_url_btn.bind(on_press=lambda x: self.open_url(url))
        content.add_widget(open_url_btn)
        
        # Botón para continuar
        continue_btn = Button(
            text='Continuar',
            size_hint_y=None,
            height=60,
            font_size='18sp',
            background_color=(0.2, 0.6, 1, 1)
        )
        continue_btn.bind(on_press=lambda x: self.close_popup())
        content.add_widget(continue_btn)
        
        popup = Popup(
            title='QR Simulado Exitosamente',
            content=content,
            size_hint=(0.9, 0.7)
        )
        popup.open()

    def show_send_options(self, photo_base64):
        content = BoxLayout(orientation='vertical', padding=20, spacing=20)
        
        # Botón para enviar a API
        send_btn = Button(
            text='Enviar Foto a API',
            size_hint_y=None,
            height=60,
            font_size='18sp',
            background_color=(0.2, 0.8, 0.2, 1)
        )
        send_btn.bind(on_press=lambda x: self.send_to_api(photo_base64))
        content.add_widget(send_btn)
        
        # Botón para continuar
        continue_btn = Button(
            text='Continuar',
            size_hint_y=None,
            height=60,
            font_size='18sp',
            background_color=(0.2, 0.6, 1, 1)
        )
        continue_btn.bind(on_press=lambda x: self.close_popup())
        content.add_widget(continue_btn)
        
        popup = Popup(
            title='Foto Simulada',
            content=content,
            size_hint=(0.9, 0.7)
        )
        popup.open()

    def send_to_api(self, photo_base64):
        # Obtener ID de tarea
        task_id = self.task_id_input.text
        
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
                f"{API_CONFIG['base_url']}{API_CONFIG['endpoint']}",
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

    def open_url(self, url):
        try:
            webbrowser.open(url)
        except Exception as e:
            self.show_popup('Error', f'No se pudo abrir la URL: {str(e)}')

    def show_popup(self, title, message):
        content = BoxLayout(orientation='vertical', padding=20)
        content.add_widget(Label(text=message))
        
        popup = Popup(
            title=title,
            content=content,
            size_hint=(0.8, 0.4)
        )
        popup.open()

    def close_popup(self):
        # Cerrar popup actual si existe
        pass

class TestincidenciasApp(App):
    def build(self):
        # Configurar tamaño de ventana
        Window.size = (400, 700)
        
        # Crear gestor de pantallas
        sm = ScreenManager()
        sm.add_widget(MainScreen(name='main'))
        
        return sm

if __name__ == '__main__':
    TestincidenciasApp().run()
