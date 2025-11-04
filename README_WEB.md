# 🚀 Web-App de Incidencias - Versión Móvil

Una aplicación web moderna y responsive que permite escanear códigos QR y tomar fotos directamente desde dispositivos móviles, reemplazando la aplicación de escritorio Kivy.

## ✨ Características Principales

- **📱 Interfaz Responsive**: Diseñada específicamente para móviles y tablets
- **🔍 Escáner de QR**: Acceso directo a la cámara del dispositivo para escanear códigos QR
- **📸 Captura de Fotos**: Toma fotos de alta calidad usando la cámara del móvil
- **🌐 Web-App**: Accesible desde cualquier navegador moderno
- **⚡ Tiempo Real**: Procesamiento instantáneo de imágenes y códigos QR
- **🔒 Seguro**: API REST con validación de datos

## 🛠️ Tecnologías Utilizadas

- **Backend**: Flask (Python)
- **Frontend**: HTML5, CSS3, JavaScript ES6+
- **Procesamiento de Imágenes**: OpenCV, PIL
- **Escaneo QR**: pyzbar
- **Diseño**: CSS Grid, Flexbox, Animaciones CSS
- **Responsive**: Mobile-first design

## 📋 Requisitos del Sistema

- Python 3.8 o superior
- Navegador web moderno (Chrome, Firefox, Safari, Edge)
- Dispositivo con cámara (para funcionalidad completa)
- Conexión a internet (para dependencias)

## 🚀 Instalación

### Opción 1: Instalación Automática (Windows)

1. Descarga o clona este repositorio
2. Ejecuta el archivo `install_web.bat` haciendo doble clic
3. Sigue las instrucciones en pantalla

### Opción 2: Instalación Manual

1. **Instalar dependencias de Python:**
   ```bash
   pip install -r requirements_web.txt
   ```

2. **Verificar instalación:**
   ```bash
   python -c "import flask, cv2, pyzbar; print('✅ Dependencias instaladas correctamente')"
   ```

## 🎯 Cómo Usar

### 1. Iniciar la Aplicación

```bash
python web_app.py
```

### 2. Acceder desde el PC

Abre tu navegador y ve a: `http://localhost:5000`

### 3. Acceder desde el Móvil

1. **Asegúrate de estar en la misma red WiFi** que tu PC
2. **Encuentra la IP de tu PC:**
   - Windows: `ipconfig` en CMD
   - Mac/Linux: `ifconfig` en Terminal
3. **Abre el navegador del móvil** y ve a: `http://[IP_DE_TU_PC]:5000`

### 4. Uso de la Aplicación

#### Escanear Código QR:
1. Toca "Escanear QR"
2. Permite acceso a la cámara
3. Apunta la cámara al código QR
4. La aplicación detectará automáticamente el código

#### Tomar Foto:
1. Toca "Tomar Foto"
2. Permite acceso a la cámara
3. Encuadra la imagen
4. Toca "Capturar Foto"
5. Revisa la vista previa
6. Toca "Subir al Servidor"

## 📱 Funcionalidades Móviles

### Cámara
- **Cámara Trasera**: Se activa automáticamente en móviles
- **Alta Resolución**: Soporte para fotos de hasta 1920x1080
- **Optimización**: Ajuste automático para diferentes dispositivos

### Escaneo QR
- **Detección Automática**: Escanea códigos QR en tiempo real
- **Múltiples Formatos**: Soporta QR_CODE, CODE128, EAN, etc.
- **Procesamiento Rápido**: Análisis instantáneo de imágenes

### Captura de Fotos
- **Vista Previa**: Revisa la foto antes de subir
- **Reintento**: Vuelve a tomar la foto si no te gusta
- **Calidad Optimizada**: Balance entre calidad y tamaño de archivo

## 🔧 Configuración Avanzada

### Variables de Entorno

Puedes configurar estas variables en tu sistema:

```bash
export FLASK_ENV=development
export FLASK_DEBUG=1
export UPLOAD_FOLDER=/ruta/personalizada
```

### Personalización del Servidor

Edita `web_app.py` para cambiar:

- Puerto del servidor (por defecto: 5000)
- Tamaño máximo de archivos (por defecto: 16MB)
- Configuración de CORS
- Endpoints de API

## 🐛 Solución de Problemas

### Error: "No se puede acceder a la cámara"

**Causas posibles:**
- El navegador no tiene permisos de cámara
- HTTPS requerido (en algunos navegadores)
- Dispositivo sin cámara

**Soluciones:**
1. Verifica permisos del navegador
2. Usa HTTPS en producción
3. Prueba en otro dispositivo

### Error: "No se encontró código QR"

**Causas posibles:**
- Código QR dañado o borroso
- Iluminación insuficiente
- Distancia incorrecta

**Soluciones:**
1. Asegura buena iluminación
2. Mantén la cámara estable
3. Acerca la cámara al código QR

### Error: "Error de conexión con el servidor"

**Causas posibles:**
- Servidor no está ejecutándose
- Firewall bloqueando conexiones
- IP incorrecta

**Soluciones:**
1. Verifica que `python web_app.py` esté ejecutándose
2. Desactiva temporalmente el firewall
3. Verifica la IP de tu PC

## 📊 Estructura del Proyecto

```
Incidencias/
├── web_app.py              # Servidor Flask principal
├── templates/
│   └── index.html          # Página principal HTML
├── static/
│   ├── css/
│   │   └── style.css       # Estilos CSS
│   └── js/
│       └── app.js          # Lógica JavaScript
├── requirements_web.txt     # Dependencias Python
├── install_web.bat         # Instalador Windows
└── README_WEB.md           # Este archivo
```

## 🔌 API Endpoints

### POST `/api/scan-qr`
Escanea códigos QR en imágenes.

**Parámetros:**
- `image_data`: Imagen en base64 o archivo

**Respuesta:**
```json
{
  "success": true,
  "qr_codes": [
    {
      "data": "contenido_del_qr",
      "type": "QR_CODE",
      "rect": [x, y, width, height],
      "polygon": [[x1,y1], [x2,y2], ...]
    }
  ],
  "count": 1
}
```

### POST `/api/process-photo`
Procesa y almacena fotos.

**Parámetros:**
- `image_data`: Foto en base64
- `task_id`: ID de la tarea
- `qr_data`: Datos del código QR escaneado

### POST `/api/upload-to-server`
Envía datos al servidor principal.

### GET `/health`
Verificación de estado del servidor.

## 🚀 Despliegue en Producción

### Usando Gunicorn

```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 web_app:app
```

### Usando Docker

```dockerfile
FROM python:3.9-slim
WORKDIR /app
COPY requirements_web.txt .
RUN pip install -r requirements_web.txt
COPY . .
EXPOSE 5000
CMD ["python", "web_app.py"]
```

### Configuración de Nginx

```nginx
server {
    listen 80;
    server_name tu-dominio.com;
    
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 🤝 Contribuciones

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Ver el archivo `LICENSE` para más detalles.

## 🆘 Soporte

Si tienes problemas o preguntas:

1. Revisa la sección de solución de problemas
2. Verifica que todas las dependencias estén instaladas
3. Comprueba que el servidor esté ejecutándose
4. Revisa los logs del servidor para errores

## 🔄 Actualizaciones

Para mantener la aplicación actualizada:

```bash
git pull origin main
pip install -r requirements_web.txt --upgrade
```

---

**¡Disfruta usando la Web-App de Incidencias! 🎉**

*Desarrollado con ❤️ para hacer el trabajo más eficiente y móvil.*

