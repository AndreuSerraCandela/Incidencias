# Aplicación de Incidencias

Esta es una aplicación móvil desarrollada en Python usando Kivy para gestionar incidencias, escanear códigos QR y enviar fotos a una API.

## Funcionalidades

- **Escáner de Códigos QR**: Escanea códigos QR y genera URLs para el sistema de tareas
- **Captura de Fotos**: Toma fotos usando la cámara del dispositivo
- **Envío a API**: Envía fotos con ID de tarea a la API de PowerBI
- **Interfaz Móvil**: Interfaz optimizada para dispositivos móviles

## Requisitos del Sistema

- Python 3.7 o superior
- Cámara web o cámara de dispositivo móvil
- Conexión a internet para el envío de datos

## Instalación

1. **Clonar o descargar el proyecto**
   ```bash
   git clone <url-del-repositorio>
   cd Incidencias
   ```

2. **Crear entorno virtual (recomendado)**
   ```bash
   python -m venv venv
   
   # En Windows:
   venv\Scripts\activate
   
   # En macOS/Linux:
   source venv/bin/activate
   ```

3. **Instalar dependencias**
   ```bash
   pip install -r requirements.txt
   ```

## Uso

### Ejecutar la Aplicación Principal Corregida (RECOMENDADA)

```bash
python main_fixed.py
```

### Ejecutar la Aplicación Principal Original

```bash
python main.py
```

### Ejecutar la Aplicación de Prueba (Recomendado para empezar)

```bash
python test_app.py
```

**Nota:** La aplicación de prueba (`test_app.py`) es una versión simplificada que funciona sin cámara, ideal para probar la funcionalidad básica y verificar que la API funcione correctamente.

### Flujo de Trabajo

1. **Configurar ID de Tarea**
   - En la pantalla principal, ingresa el ID de la tarea en el campo correspondiente

2. **Escanear Código QR (Múltiples Opciones)**
   
   **Opción A: Escaneo Manual**
   - Presiona "Escanear Código QR"
   - La aplicación probará 7 métodos diferentes automáticamente
   - Se generará la URL: `https://gtasks-app.deploy.malla.es/IdQr/{idReserva}`
   
   **Opción B: Escaneo Automático (RECOMENDADO)**
   - Presiona "Escaneo Automático"
   - Mantén el QR visible en la cámara
   - La aplicación detectará automáticamente el código
   - Se detendrá automáticamente al detectar
   
   **Opción C: Prueba de Escaneo**
   - Presiona "Probar Escaneo" para debugging
   - Se guardarán 7 imágenes procesadas para análisis
   - Te mostrará qué métodos funcionan mejor

3. **Tomar y Enviar Foto**
   - Presiona "Tomar/Seleccionar Foto"
   - Selecciona "Tomar Foto con Cámara"
   - Captura la foto
   - La foto se convertirá automáticamente a formato base64
   - Envía la foto a la API con el ID de tarea

## Estructura del Proyecto

```
Incidencias/
├── main.py              # Aplicación principal con cámara (versión original)
├── main_fixed.py        # Aplicación principal corregida (RECOMENDADA)
├── test_app.py          # Aplicación de prueba sin cámara
├── config.py            # Archivo de configuración
├── requirements.txt     # Dependencias de Python
├── install.bat          # Script de instalación para Windows
├── install.sh           # Script de instalación para Unix/Linux
└── README.md            # Este archivo
```

## Configuración de la API

La aplicación está configurada para enviar fotos a:
```
http://localhost:8080/powerbi/ODataV4/Gtask_Registrarfoto
```

**Formato del JSON enviado:**
```json
{
  "idTarea": "ID_DE_LA_TAREA",
  "foto": "FOTO_EN_BASE64"
}
```

## Dependencias Principales

- **Kivy**: Framework para aplicaciones móviles multiplataforma
- **OpenCV**: Procesamiento de imágenes y detección de códigos QR
- **pyzbar**: Decodificación de códigos de barras y QR
- **Pillow**: Manipulación de imágenes
- **requests**: Envío de datos HTTP a la API

## Solución de Problemas

### Error de Cámara
- Asegúrate de que la cámara esté disponible y no esté siendo usada por otra aplicación
- Verifica los permisos de cámara en tu sistema

### Error de Conexión a la API
- Verifica que la API esté ejecutándose en `localhost:8080`
- Comprueba que no haya firewall bloqueando la conexión
- Asegúrate de que el formato del JSON sea correcto

### Problemas de Dependencias
- Si hay problemas con OpenCV, prueba instalando solo `opencv-python-headless`
- Para problemas con Kivy, asegúrate de tener las dependencias del sistema instaladas

### Problemas de Cámara
- **SOLUCIONADO**: La aplicación corregida (`main_fixed.py`) resuelve los problemas de cámara
- Si la aplicación original (`main.py`) da errores, usa `main_fixed.py` en su lugar
- La aplicación de prueba (`test_app.py`) simula todas las funcionalidades sin necesidad de cámara
- Verifica que tu sistema tenga permisos de cámara habilitados

### Mejoras en la Versión Corregida
- **Cámara estable**: Usa OpenCV directamente en lugar del widget Camera de Kivy
- **Hilos separados**: La cámara funciona en un hilo separado para evitar bloqueos
- **Manejo de errores**: Mejor gestión de errores y recuperación automática
- **Vista previa en tiempo real**: La cámara se mantiene abierta y funcional
- **Escaneo QR mejorado**: Escanea directamente del frame de la cámara
- **7 métodos de detección**: Múltiples algoritmos de procesamiento de imagen
- **Escaneo automático**: Detección continua sin necesidad de presionar botones
- **Debugging avanzado**: Botón de prueba que guarda imágenes procesadas

## Desarrollo

### Agregar Nuevas Funcionalidades
- La aplicación usa un sistema de pantallas (ScreenManager)
- Cada funcionalidad está en una clase separada
- Para agregar nuevas pantallas, crea una nueva clase que herede de `Screen`

### Personalización de la UI
- Los colores y estilos se pueden modificar en cada pantalla
- Kivy usa un sistema de layouts y widgets similar a HTML/CSS

## Licencia

Este proyecto está desarrollado para uso interno de la empresa de incidcencias.

## Soporte

Para soporte técnico o preguntas sobre la implementación, contacta al equipo de desarrollo.
