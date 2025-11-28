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
from PIL import Image as PILImage, ImageOps
import base64
import requests
import json
import webbrowser
from pyzbar.pyzbar import decode
import os
import threading
import time

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
        
        # Área de información del QR
        self.qr_info_label = Label(
            text='Escanea un código QR para comenzar',
            size_hint_y=None,
            height=60,
            text_size=(Window.width - 40, None),
            halign='center',
            valign='middle'
        )
        self.layout.add_widget(self.qr_info_label)
        
        # URL clickeable
        self.url_label = Label(
            text='',
            size_hint_y=None,
            height=80,  # Aumentar altura para múltiples líneas
            text_size=(Window.width - 40, None),
            halign='center',
            valign='middle',
            color=(0.2, 0.8, 1, 1),  # Azul claro para indicar que es clickeable
            bold=True
        )
        self.layout.add_widget(self.url_label)
        
        # Imagen de vista previa (solo mostrar cuando hay una foto)
        self.preview_image = Image(
            size_hint_y=None,
            height=0  # Altura 0 por defecto (oculto)
        )
        self.layout.add_widget(self.preview_image)
        
        self.add_widget(self.layout)
        
        # Variables de estado
        self.current_qr_data = None
        self.current_photo_base64 = None
        self.current_task_id = None
        self.current_url = None

    def show_qr_scanner(self, instance):
        self.manager.current = 'qr_scanner'

    def show_photo_options(self, instance):
        self.manager.current = 'photo_options'

    def update_info(self, text):
        self.qr_info_label.text = text

    def update_url(self, url):
        """Actualizar la URL clickeable"""
        self.current_url = url
        if url:
            # Formatear la URL para que se vea mejor
            # Dividir la URL en partes más manejables
            if len(url) > 50:
                # Dividir en múltiples líneas
                parts = []
                current_part = ""
                words = url.split('/')
                
                for word in words:
                    if len(current_part + '/' + word) > 40:
                        if current_part:
                            parts.append(current_part)
                        current_part = word
                    else:
                        if current_part:
                            current_part += '/' + word
                        else:
                            current_part = word
                
                if current_part:
                    parts.append(current_part)
                
                formatted_url = '\n'.join(parts)
            else:
                formatted_url = url
            
            self.url_label.text = f'🔗 {formatted_url}'
            # Hacer la URL clickeable
            self.url_label.bind(on_touch_down=self.on_url_touch)
        else:
            self.url_label.text = ''

    def on_url_touch(self, instance, touch):
        """Manejar el toque en la URL para abrirla"""
        if self.current_url and self.url_label.collide_point(touch.x, touch.y):
            try:
                webbrowser.open(self.current_url)
            except Exception as e:
                print(f"Error al abrir URL: {str(e)}")

    def update_preview(self, image_path):
        if os.path.exists(image_path):
            self.preview_image.source = image_path
            self.preview_image.reload()
            # Mostrar la imagen con altura apropiada
            self.preview_image.height = 200
        else:
            # Ocultar la imagen si no hay foto
            self.preview_image.height = 0

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
        
        # Área de vista previa de cámara
        self.camera_preview = Image(
            size_hint_y=None,
            height=400
        )
        self.layout.add_widget(self.camera_preview)
        
        self.add_widget(self.layout)
        
        # Variables de cámara
        self.camera = None
        self.camera_running = False
        self.current_frame = None
        self.auto_scanning = False

    def on_enter(self):
        """Llamado cuando se entra a la pantalla - iniciar cámara automáticamente"""
        Clock.schedule_once(self.auto_start_camera, 1.0)

    def auto_start_camera(self, dt):
        """Iniciar cámara automáticamente sin mostrar popup"""
        if not self.camera_running:
            try:
                # Inicializar cámara OpenCV
                self.camera = cv2.VideoCapture(0)
                if not self.camera.isOpened():
                    # Intentar con cámara secundaria
                    self.camera = cv2.VideoCapture(1)
                
                if self.camera.isOpened():
                    self.camera.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA_CONFIG['resolution'][0])
                    self.camera.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_CONFIG['resolution'][1])
                    self.camera_running = True
                    
                    # Iniciar hilo de cámara
                    self.camera_thread = threading.Thread(target=self.camera_loop, daemon=True)
                    self.camera_thread.start()
                    
                    # Iniciar escaneo automático inmediatamente
                    Clock.schedule_once(self.start_auto_scan, 2.0)
                    
            except Exception as e:
                print(f"Error al iniciar cámara automáticamente: {str(e)}")

    def start_auto_scan(self, dt):
        """Iniciar escaneo automático automáticamente"""
        if self.camera_running and not self.auto_scanning:
            self.auto_scanning = True
            Clock.schedule_once(self.auto_scan_loop, 1.0)

    def camera_loop(self):
        """Bucle principal de la cámara"""
        while self.camera_running:
            try:
                ret, frame = self.camera.read()
                if ret:
                    # Convertir frame a formato Kivy
                    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    self.current_frame = frame_rgb
                    
                    # Actualizar vista previa en el hilo principal
                    Clock.schedule_once(lambda dt: self.update_preview(frame_rgb), 0)
                    
                time.sleep(0.033)  # ~30 FPS
                
            except Exception as e:
                print(f"Error en bucle de cámara: {str(e)}")
                time.sleep(0.1)

    def update_preview(self, frame):
        """Actualizar vista previa de la cámara"""
        try:
            if frame is not None:
                # Convertir frame a textura Kivy
                height, width = frame.shape[:2]
                buffer = frame.tobytes()
                
                texture = Texture.create(size=(width, height), colorfmt='rgb')
                texture.blit_buffer(buffer, colorfmt='rgb', bufferfmt='ubyte')
                
                self.camera_preview.texture = texture
        except Exception as e:
            print(f"Error actualizando vista previa: {str(e)}")

    def auto_scan_loop(self, dt):
        """Bucle de escaneo automático"""
        if not self.auto_scanning or not self.camera_running:
            return
        
        try:
            # Intentar escanear con todos los métodos
            if self.try_all_scan_methods():
                return  # Si se detectó, parar el auto-escaneo
            
            # Continuar escaneando cada 2 segundos
            Clock.schedule_once(self.auto_scan_loop, 2.0)
            
        except Exception as e:
            print(f"Error en auto-escaneo: {str(e)}")
            Clock.schedule_once(self.auto_scan_loop, 2.0)

    def try_all_scan_methods(self):
        """Intentar todos los métodos de escaneo y retornar True si se detecta"""
        try:
            # Método 1: Frame original RGB
            decoded_objects = decode(self.current_frame)
            if decoded_objects:
                qr_data = decoded_objects[0].data.decode('utf-8')
                print(f"QR detectado automáticamente en RGB: {qr_data}")
                self.process_qr_data(qr_data)
                return True
            
            # Método 2: Escala de grises
            gray_frame = cv2.cvtColor(self.current_frame, cv2.COLOR_RGB2GRAY)
            decoded_objects = decode(gray_frame)
            if decoded_objects:
                qr_data = decoded_objects[0].data.decode('utf-8')
                print(f"QR detectado automáticamente en Gris: {qr_data}")
                self.process_qr_data(qr_data)
                return True
            
            # Método 3: CLAHE mejorado
            clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))
            enhanced_frame = clahe.apply(gray_frame)
            decoded_objects = decode(enhanced_frame)
            if decoded_objects:
                qr_data = decoded_objects[0].data.decode('utf-8')
                print(f"QR detectado automáticamente en CLAHE: {qr_data}")
                self.process_qr_data(qr_data)
                return True
            
            # Método 4: Reducción de ruido
            denoised = cv2.fastNlMeansDenoising(gray_frame)
            decoded_objects = decode(denoised)
            if decoded_objects:
                qr_data = decoded_objects[0].data.decode('utf-8')
                print(f"QR detectado automáticamente en Denoised: {qr_data}")
                self.process_qr_data(qr_data)
                return True
            
            # Método 5: Umbral adaptativo
            adaptive_thresh = cv2.adaptiveThreshold(gray_frame, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)
            decoded_objects = decode(adaptive_thresh)
            if decoded_objects:
                qr_data = decoded_objects[0].data.decode('utf-8')
                print(f"QR detectado automáticamente en Umbral: {qr_data}")
                self.process_qr_data(qr_data)
                return True
            
            # Método 6: Filtro bilateral
            bilateral = cv2.bilateralFilter(gray_frame, 9, 75, 75)
            decoded_objects = decode(bilateral)
            if decoded_objects:
                qr_data = decoded_objects[0].data.decode('utf-8')
                print(f"QR detectado automáticamente en Bilateral: {qr_data}")
                self.process_qr_data(qr_data)
                return True
            
            # Método 7: Combinado
            combined = cv2.bilateralFilter(enhanced_frame, 9, 75, 75)
            decoded_objects = decode(combined)
            if decoded_objects:
                qr_data = decoded_objects[0].data.decode('utf-8')
                print(f"QR detectado automáticamente en Combinado: {qr_data}")
                self.process_qr_data(qr_data)
                return True
            
            return False
            
        except Exception as e:
            print(f"Error en try_all_scan_methods: {str(e)}")
            return False

    def process_qr_data(self, qr_data):
        # Extraer ID de reserva del QR
        if 'IdQr' in qr_data:
            # Extraer el ID de la tarea (parte después de IdQr/)
            try:
                # Buscar la posición de IdQr/ y extraer lo que viene después
                id_start = qr_data.find('IdQr/')
                if id_start != -1:
                    task_id = qr_data[id_start + 6:]  # 6 es la longitud de "IdQr/"
                else:
                    task_id = qr_data
            except:
                task_id = qr_data
            
            # Construir URL completa
            url = get_task_system_url(qr_data)
            
            # Guardar datos en la pantalla principal
            main_screen = self.manager.get_screen('main')
            main_screen.current_qr_data = qr_data
            main_screen.current_task_id = task_id
            main_screen.update_url(url) # Actualizar la URL clickeable
            
            # Actualizar el campo de ID de tarea y la información
            main_screen.task_id_input.text = task_id
            main_screen.update_info(f'QR escaneado exitosamente!\n\nID de Tarea: {task_id}\n\nURL: {url}')
            
            # Mostrar popup de confirmación y volver automáticamente
            self.show_qr_success_popup(task_id)
        else:
            self.show_popup('QR inválido', 'El código QR no contiene información válida')

    def show_qr_success_popup(self, task_id):
        """Mostrar popup de éxito y volver automáticamente a la pantalla principal"""
        content = BoxLayout(orientation='vertical', padding=20, spacing=20)
        
        # Mensaje de éxito
        success_label = Label(
            text=f'QR escaneado exitosamente!\n\nID de Tarea: {task_id}\n\nVolviendo a la pantalla principal...',
            size_hint_y=None,
            height=120,
            text_size=(Window.width - 80, None),
            halign='center',
            valign='middle'
        )
        content.add_widget(success_label)
        
        popup = Popup(
            title='QR Escaneado Exitosamente',
            content=content,
            size_hint=(0.9, 0.7)
        )
        popup.open()
        
        # Cerrar popup y volver automáticamente después de 2 segundos
        Clock.schedule_once(lambda dt: self.auto_return_to_main(popup), 2.0)

    def auto_return_to_main(self, popup):
        """Volver automáticamente a la pantalla principal"""
        popup.dismiss()
        self.return_to_main()

    def return_to_main(self):
        """Volver a la pantalla principal"""
        # Detener cámara antes de salir
        self.stop_camera()
        self.manager.current = 'main'

    def stop_camera(self):
        """Detener la cámara"""
        self.camera_running = False
        if self.camera:
            self.camera.release()
            self.camera = None

    def show_popup(self, title, message):
        content = BoxLayout(orientation='vertical', padding=20)
        content.add_widget(Label(text=message))
        
        popup = Popup(
            title=title,
            content=content,
            size_hint=(0.8, 0.4)
        )
        popup.open()

    def on_leave(self):
        """Llamado cuando se sale de la pantalla"""
        self.stop_camera()

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
        
        # Área de vista previa de cámara
        self.camera_preview = Image(
            size_hint_y=None,
            height=400
        )
        self.layout.add_widget(self.camera_preview)
        
        # Botón para reiniciar cámara
        restart_camera_btn = Button(
            text='Reiniciar Cámara',
            size_hint_y=None,
            height=50,
            font_size=UI_CONFIG['font_sizes']['small'],
            background_color=UI_CONFIG['colors']['success']
        )
        restart_camera_btn.bind(on_press=self.restart_camera)
        self.layout.add_widget(restart_camera_btn)
        
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
        
        # Variables de cámara
        self.camera = None
        self.camera_running = False
        self.current_frame = None

    def on_enter(self):
        """Llamado cuando se entra a la pantalla - iniciar cámara automáticamente"""
        Clock.schedule_once(self.auto_start_camera, 1.0)

    def auto_start_camera(self, dt):
        """Iniciar cámara automáticamente sin mostrar popup"""
        if not self.camera_running:
            try:
                # Inicializar cámara OpenCV
                self.camera = cv2.VideoCapture(0)
                if not self.camera.isOpened():
                    # Intentar con cámara secundaria
                    self.camera = cv2.VideoCapture(1)
                
                if self.camera.isOpened():
                    self.camera.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA_CONFIG['resolution'][0])
                    self.camera.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_CONFIG['resolution'][1])
                    self.camera_running = True
                    
                    # Iniciar hilo de cámara
                    self.camera_thread = threading.Thread(target=self.camera_loop, daemon=True)
                    self.camera_thread.start()
                    
            except Exception as e:
                print(f"Error al iniciar cámara automáticamente: {str(e)}")

    def restart_camera(self, instance):
        """Reiniciar la cámara"""
        self.stop_camera()
        Clock.schedule_once(lambda dt: self.auto_start_camera(0), 0.5)

    def start_camera(self, instance):
        """Iniciar la cámara en un hilo separado"""
        if not self.camera_running:
            try:
                # Inicializar cámara OpenCV
                self.camera = cv2.VideoCapture(0)
                if not self.camera.isOpened():
                    # Intentar con cámara secundaria
                    self.camera = cv2.VideoCapture(1)
                
                if self.camera.isOpened():
                    self.camera.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA_CONFIG['resolution'][0])
                    self.camera.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_CONFIG['resolution'][1])
                    self.camera_running = True
                    
                    # Iniciar hilo de cámara
                    self.camera_thread = threading.Thread(target=self.camera_loop, daemon=True)
                    self.camera_thread.start()
                    
                    self.show_popup('Cámara Iniciada', 'La cámara está funcionando correctamente')
                else:
                    self.show_popup('Error', 'No se pudo acceder a la cámara')
                    
            except Exception as e:
                self.show_popup('Error', f'Error al iniciar cámara: {str(e)}')

    def camera_loop(self):
        """Bucle principal de la cámara"""
        while self.camera_running:
            try:
                ret, frame = self.camera.read()
                if ret:
                    # Convertir frame a formato Kivy
                    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    self.current_frame = frame_rgb
                    
                    # Actualizar vista previa en el hilo principal
                    Clock.schedule_once(lambda dt: self.update_preview(frame_rgb), 0)
                    
                time.sleep(0.033)  # ~30 FPS
                
            except Exception as e:
                print(f"Error en bucle de cámara: {str(e)}")
                time.sleep(0.1)

    def update_preview(self, frame):
        """Actualizar vista previa de la cámara"""
        try:
            if frame is not None:
                # Convertir frame a textura Kivy
                height, width = frame.shape[:2]
                buffer = frame.tobytes()
                
                texture = Texture.create(size=(width, height), colorfmt='rgb')
                texture.blit_buffer(buffer, colorfmt='rgb', bufferfmt='ubyte')
                
                self.camera_preview.texture = texture
        except Exception as e:
            print(f"Error actualizando vista previa: {str(e)}")

    def capture_photo(self, instance):
        """Capturar foto del frame actual"""
        if not self.camera_running or self.current_frame is None:
            self.show_popup('Error', 'La cámara no está funcionando o no hay frame disponible')
            return
        
        try:
            # Guardar foto
            photo_path = FILE_CONFIG['photo_filename']
            
            # Convertir de RGB a BGR para OpenCV
            frame_bgr = cv2.cvtColor(self.current_frame, cv2.COLOR_RGB2BGR)
            
            # Guardar temporalmente con OpenCV
            cv2.imwrite(photo_path, frame_bgr, [cv2.IMWRITE_JPEG_QUALITY, 95])
            
            # Verificar que se guardó correctamente
            if not os.path.exists(photo_path):
                raise Exception("No se pudo guardar la imagen")
            
            # Aplicar corrección EXIF usando PIL
            # Esto asegura que la orientación sea correcta incluso si la imagen tiene metadatos EXIF
            try:
                # Leer imagen con PIL
                image = PILImage.open(photo_path)
                
                # Aplicar orientación EXIF automáticamente
                # Esto corrige la rotación según los metadatos EXIF si existen
                image = ImageOps.exif_transpose(image)
                
                # Convertir a RGB si es necesario
                if image.mode in ('RGBA', 'LA', 'P'):
                    image = image.convert('RGB')
                
                # Guardar de nuevo sin información EXIF de orientación (ya aplicada en los píxeles)
                image.save(photo_path, format='JPEG', quality=95, optimize=True, exif=b'')
                print(f"🔄 Orientación EXIF aplicada en captura")
            except Exception as e:
                print(f"⚠️ No se pudo aplicar orientación EXIF en captura (puede que no tenga): {str(e)}")
                # Continuar sin aplicar orientación si no hay EXIF o hay error
            
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
            
        except Exception as e:
            self.show_popup('Error', f'Error al capturar foto: {str(e)}')
            print(f"Error capturando foto: {str(e)}")  # Debug

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
        # Detener cámara antes de salir
        self.stop_camera()
        self.manager.current = 'main'

    def stop_camera(self):
        """Detener la cámara"""
        self.camera_running = False
        if self.camera:
            self.camera.release()
            self.camera = None

    def show_popup(self, title, message):
        content = BoxLayout(orientation='vertical', padding=20)
        content.add_widget(Label(text=message))
        
        popup = Popup(
            title=title,
            content=content,
            size_hint=(0.8, 0.4)
        )
        popup.open()

    def on_leave(self):
        """Llamado cuando se sale de la pantalla"""
        self.stop_camera()

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
