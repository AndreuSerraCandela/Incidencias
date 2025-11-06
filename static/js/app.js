// Variables globales
let qrStream = null;
let photoStream = null;
let currentQRData = null;
let currentPhotoData = null;
let qrDetectionInterval = null; // Para detección automática de QR
let nfcScanning = false; // Evitar múltiples lecturas simultáneas
let ndefReader = null; // Lector NFC para poder detenerlo

// Variables para grabación de audio
let mediaRecorder = null;
let audioChunks = [];
let audioBlob = null;
let recordingStartTime = null;
let recordingInterval = null;

// Variables para almacenar datos de incidencia
let pendingIncidenceData = {
    stopNumber: null,
    description: null,
    fullText: null,
    hasAudio: false,
    hasAI: false
};

// Elementos del DOM
let elements = {};

// Inicialización
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Inicializando aplicación...');
    
    // Definir elementos del DOM después de que esté cargado
    elements = {
        // Elementos de login
        loginSection: document.getElementById('loginSection'),
        actionButtons: document.getElementById('actionButtons'),
        loginBtn: document.getElementById('loginBtn'),
        loginModal: document.getElementById('loginModal'),
        loginForm: document.getElementById('loginForm'),
        loginUsername: document.getElementById('loginUsername'),
        loginPassword: document.getElementById('loginPassword'),
        loginStatus: document.getElementById('loginStatus'),
        userIndicator: document.getElementById('userIndicator'),
        currentUsername: document.getElementById('currentUsername'),
        logoutBtn: document.getElementById('logoutBtn'),
        
        // Elementos existentes
        takePhotoBtn: document.getElementById('takePhotoBtn'),
        qrModal: document.getElementById('qrModal'),
        photoModal: document.getElementById('photoModal'),
        closeQRModal: document.getElementById('closeQRModal'),
        closePhotoModal: document.getElementById('closePhotoModal'),
        startCameraBtn: document.getElementById('startCameraBtn'),
        startPhotoCameraBtn: document.getElementById('startPhotoCameraBtn'),
        captureQRBtn: document.getElementById('captureQRBtn'),
        capturePhotoBtn: document.getElementById('capturePhotoBtn'),
        importPhotoBtn: document.getElementById('importPhotoBtn'),
        photoFileInput: document.getElementById('photoFileInput'),
        retakePhotoBtn: document.getElementById('retakePhotoBtn'),
        qrVideo: document.getElementById('qrVideo'),
        photoVideo: document.getElementById('photoVideo'),
        qrCanvas: document.getElementById('qrCanvas'),
        photoCanvas: document.getElementById('photoCanvas'),
        qrResults: document.getElementById('qrResults'),
        photoPreview: document.getElementById('photoPreview'),
        qrData: document.getElementById('qrData'),
        qrType: document.getElementById('qrType'),
        previewImage: document.getElementById('previewImage'),
        uploadBtn: document.getElementById('uploadBtn'),
        recordAudioBtn: document.getElementById('recordAudioBtn'),
        sendIncidenceBtn: document.getElementById('sendIncidenceBtn'),
        taskId: document.getElementById('taskId'),
        statusMessage: document.getElementById('statusMessage'),
        
        // Elementos del modal de audio
        audioModal: document.getElementById('audioModal'),
        closeAudioModal: document.getElementById('closeAudioModal'),
        startRecordingBtn: document.getElementById('startRecordingBtn'),
        stopRecordingBtn: document.getElementById('stopRecordingBtn'),
        playAudioBtn: document.getElementById('playAudioBtn'),
        deleteAudioBtn: document.getElementById('deleteAudioBtn'),
        useAudioBtn: document.getElementById('useAudioBtn'),
        cancelAudioBtn: document.getElementById('cancelAudioBtn'),
        recordingIndicator: document.getElementById('recordingIndicator'),
        audioDuration: document.getElementById('audioDuration'),
        audioPreview: document.getElementById('audioPreview'),
        audioPlayer: document.getElementById('audioPlayer'),
        
        // Elementos del modal de resultados de IA
        aiResultsModal: document.getElementById('aiResultsModal'),
        closeAIResultsModal: document.getElementById('closeAIResultsModal'),
        aiProcessingStatus: document.getElementById('aiProcessingStatus'),
        aiResultsForm: document.getElementById('aiResultsForm'),
        aiStopNumber: document.getElementById('aiStopNumber'),
        aiDescription: document.getElementById('aiDescription'),
        aiRawResponse: document.getElementById('aiRawResponse'),
        aiRawResponseText: document.getElementById('aiRawResponseText'),
        confirmAIResultsBtn: document.getElementById('confirmAIResultsBtn'),
        cancelAIResultsBtn: document.getElementById('cancelAIResultsBtn')
    };
    
    console.log('🔍 Elementos del DOM definidos');
    console.log('loginBtn:', elements.loginBtn);
    console.log('loginModal:', elements.loginModal);
    console.log('loginForm:', elements.loginForm);
    console.log('loginUsername:', elements.loginUsername);
    console.log('loginPassword:', elements.loginPassword);
    
    // Solo inicializar si los elementos críticos existen
    if (elements.loginBtn && elements.loginModal) {
        initializeEventListeners();
        checkDeviceCapabilities();
        checkCameraPermissions();
        initializeAuth(); // Inicializar autenticación
    } else {
        console.error('❌ Elementos críticos no encontrados');
    }
});

// Configurar event listeners
function initializeEventListeners() {
    // Botones principales
    if (elements.takePhotoBtn) {
        elements.takePhotoBtn.addEventListener('click', () => {
            stopNFCScanning(); // Detener NFC al pulsar reportar incidencia
            startPhotoAutoCapture();
        });
    }
    
    // Cerrar modales
    if (elements.closeQRModal) {
        elements.closeQRModal.addEventListener('click', closeQRModal);
    }
    if (elements.closePhotoModal) {
        elements.closePhotoModal.addEventListener('click', closePhotoModal);
    }
    if (elements.closeAudioModal) {
        elements.closeAudioModal.addEventListener('click', closeAudioModal);
    }
    
    // Event listeners para el modal de IA
    if (elements.closeAIResultsModal) {
        elements.closeAIResultsModal.addEventListener('click', closeAIResultsModal);
    }
    if (elements.confirmAIResultsBtn) {
        elements.confirmAIResultsBtn.addEventListener('click', confirmAIResults);
    }
    if (elements.cancelAIResultsBtn) {
        elements.cancelAIResultsBtn.addEventListener('click', closeAIResultsModal);
    }
    
    // Controles de cámara QR (ocultos por defecto)
    if (elements.startCameraBtn) {
        elements.startCameraBtn.style.display = 'none';
    }
    if (elements.captureQRBtn) {
        elements.captureQRBtn.style.display = 'none';
    }
    
    // Controles de cámara de foto (ocultos por defecto)
    if (elements.startPhotoCameraBtn) {
        elements.startPhotoCameraBtn.style.display = 'none';
    }
    if (elements.capturePhotoBtn) {
        elements.capturePhotoBtn.style.display = 'none';
    }
    if (elements.retakePhotoBtn) {
        elements.retakePhotoBtn.style.display = 'none';
    }
    
    // AGREGAR EVENT LISTENERS PARA LOS BOTONES DE FOTO
    if (elements.capturePhotoBtn) {
        elements.capturePhotoBtn.addEventListener('click', capturePhoto);
    }
    if (elements.importPhotoBtn) {
        elements.importPhotoBtn.addEventListener('click', () => {
            if (elements.photoFileInput) {
                elements.photoFileInput.click();
            }
        });
    }
    if (elements.photoFileInput) {
        elements.photoFileInput.addEventListener('change', handlePhotoImport);
    }
    if (elements.retakePhotoBtn) {
        elements.retakePhotoBtn.addEventListener('click', retakePhoto);
    }
    
    // Subir foto
    if (elements.uploadBtn) {
        elements.uploadBtn.addEventListener('click', uploadPhoto);
    }

    // Botones de acción
    if (elements.recordAudioBtn) {
        elements.recordAudioBtn.addEventListener('click', () => {
            stopNFCScanning(); // Detener NFC al pulsar grabar audio
            startAudioRecording();
        });
    }
    // Enviar incidencia
    if (elements.sendIncidenceBtn) {
        elements.sendIncidenceBtn.addEventListener('click', sendIncidenceFromPreview);
    }
    
    // Event listeners para el modal de audio
    if (elements.startRecordingBtn) {
        elements.startRecordingBtn.addEventListener('click', startRecording);
    }
    if (elements.stopRecordingBtn) {
        elements.stopRecordingBtn.addEventListener('click', stopRecording);
    }
    if (elements.playAudioBtn) {
        elements.playAudioBtn.addEventListener('click', playAudio);
    }
    if (elements.deleteAudioBtn) {
        elements.deleteAudioBtn.addEventListener('click', deleteAudio);
    }
    if (elements.useAudioBtn) {
        elements.useAudioBtn.addEventListener('click', useAudio);
    }
    if (elements.cancelAudioBtn) {
        elements.cancelAudioBtn.addEventListener('click', closeAudioModal);
    }
    
    // Cerrar modales con Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            if (elements.qrModal) {
                closeQRModal();
            }
            if (elements.photoModal) {
                closePhotoModal();
            }
        }
    });
    
    // Cerrar modales haciendo clic fuera
    window.addEventListener('click', function(event) {
        if (elements.qrModal && event.target === elements.qrModal) {
            closeQRModal();
        }
        if (elements.photoModal && event.target === elements.photoModal) {
            closePhotoModal();
        }
    });
}

// Verificar capacidades del dispositivo
function checkDeviceCapabilities() {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const hasGetUserMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    
    console.log('Dispositivo móvil:', isMobile);
    console.log('getUserMedia disponible:', hasGetUserMedia);
    
    if (!hasGetUserMedia) {
        showStatus('Tu navegador no soporta acceso a la cámara', 'error');
        if (elements.takePhotoBtn) {
            elements.takePhotoBtn.disabled = true;
        }
    }
    
    // Verificar si es móvil
    if (isMobile) {
        document.body.classList.add('mobile-device');
    }
}

// Verificar permisos de cámara
async function checkCameraPermissions() {
    try {
        if (navigator.permissions && navigator.permissions.query) {
            const permission = await navigator.permissions.query({ name: 'camera' });
            console.log('Estado de permisos de cámara:', permission.state);
            
            if (permission.state === 'denied') {
                showStatus('Permisos de cámara denegados. Habilítalos en la configuración del navegador.', 'warning');
            }
        }
    } catch (error) {
        console.log('No se pudieron verificar permisos:', error);
    }
}

// ESCANEO QR AUTOMÁTICO - UN SOLO CLIC
async function startQRAutoScan() {
    try {
        showStatus('Iniciando escáner QR automático...', 'info');
        
        // Abrir modal inmediatamente
        elements.qrModal.style.display = 'block';
        
        // Iniciar cámara automáticamente
        await startQRCamera();
        
        // Iniciar detección automática de QR
        startQRAutoDetection();
        
    } catch (error) {
        console.error('Error al iniciar escáner QR automático:', error);
        handleCameraError(error);
    }
}

// CAPTURA DE FOTO AUTOMÁTICA - UN SOLO CLIC
async function startPhotoAutoCapture() {
    try {
        showStatus('Iniciando captura de foto automática...', 'info');
        
        // Restablecer estado del modal
        // Ocultar vista previa si existe
        if (elements.photoPreview) {
            elements.photoPreview.style.display = 'none';
        }
        
        // Ocultar botón de enviar incidencia
        if (elements.sendIncidenceBtn) {
            elements.sendIncidenceBtn.style.display = 'none';
        }
        // Ocultar botón de volver a tomar
        if (elements.retakePhotoBtn) {
            elements.retakePhotoBtn.style.display = 'none';
        }
        // Mostrar botones de captura e importar
        if (elements.capturePhotoBtn) {
            elements.capturePhotoBtn.style.display = 'flex';
        }
        if (elements.importPhotoBtn) {
            elements.importPhotoBtn.style.display = 'flex';
        }
        
        // Abrir modal inmediatamente
        elements.photoModal.style.display = 'block';
        
        // Iniciar cámara automáticamente
        await startPhotoCamera();
        
        showStatus('Cámara iniciada. Encuadra la imagen y toca "Capturar Foto".', 'success');
        
    } catch (error) {
        console.error('Error al iniciar captura de foto automática:', error);
        handleCameraError(error);
    }
}

// Cerrar modal QR
function closeQRModal() {
    stopQRCamera();
    stopQRAutoDetection();
    elements.qrModal.style.display = 'none';
    showStatus('Modal de escáner QR cerrado', 'info');
}

// Cerrar modal de foto
function closePhotoModal() {
    stopPhotoCamera();
    elements.photoModal.style.display = 'none';
    
    // Restablecer estado del modal para la próxima vez
    // NO ocultar la vista previa si hay una foto capturada - el usuario debe poder verla y enviarla
    // Solo ocultar la vista previa si no hay foto capturada
    if (elements.photoPreview && !currentPhotoData) {
        elements.photoPreview.style.display = 'none';
        
        // Ocultar botón de enviar incidencia
        if (elements.sendIncidenceBtn) {
            elements.sendIncidenceBtn.style.display = 'none';
        }
    }
    // Ocultar botón de volver a tomar
    if (elements.retakePhotoBtn) {
        elements.retakePhotoBtn.style.display = 'none';
    }
    // Mostrar botones de captura e importar para la próxima vez
    if (elements.capturePhotoBtn) {
        elements.capturePhotoBtn.style.display = 'flex';
    }
    if (elements.importPhotoBtn) {
        elements.importPhotoBtn.style.display = 'flex';
    }
    
    showStatus('Modal de captura de foto cerrado', 'info');
}

// Iniciar cámara para QR (automático)
async function startQRCamera() {
    try {
        showStatus('Iniciando cámara para escaneo QR...', 'info');
        
        const constraints = {
            video: {
                facingMode: 'environment', // Cámara trasera en móviles
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        };
        
        qrStream = await navigator.mediaDevices.getUserMedia(constraints);
        elements.qrVideo.srcObject = qrStream;
        
        showStatus('Cámara iniciada. Apunta al código QR.', 'success');
        
    } catch (error) {
        console.error('Error al iniciar cámara QR:', error);
        handleCameraError(error);
        throw error; // Re-lanzar para manejar en startQRAutoScan
    }
}

// Iniciar cámara para foto (automático)
async function startPhotoCamera() {
    try {
        showStatus('Iniciando cámara para captura de foto...', 'info');
        
        const constraints = {
            video: {
                facingMode: 'environment', // Cámara trasera en móviles
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            }
        };
        
        photoStream = await navigator.mediaDevices.getUserMedia(constraints);
        elements.photoVideo.srcObject = photoStream;
        
        showStatus('Cámara iniciada. Encuadra la imagen.', 'success');
        
    } catch (error) {
        console.error('Error al iniciar cámara de foto:', error);
        handleCameraError(error);
        throw error; // Re-lanzar para manejar en startPhotoAutoCapture
    }
}

// DETECCIÓN AUTOMÁTICA DE QR - FUNCIONA EN TIEMPO REAL
function startQRAutoDetection() {
    if (qrDetectionInterval) {
        clearInterval(qrDetectionInterval);
    }
    
    // Esperar a que el video esté listo
    elements.qrVideo.addEventListener('loadeddata', function() {
        showStatus('Escaneando códigos QR automáticamente...', 'info');
        
        // Detectar QR cada 500ms
        qrDetectionInterval = setInterval(async () => {
            if (qrStream && elements.qrVideo.videoWidth > 0) {
                try {
                    await detectQRInVideo();
                } catch (error) {
                    console.log('Error en detección automática:', error);
                }
            }
        }, 500);
    });
}

// Detectar QR en el video actual
async function detectQRInVideo() {
    try {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        canvas.width = elements.qrVideo.videoWidth;
        canvas.height = elements.qrVideo.videoHeight;
        
        context.drawImage(elements.qrVideo, 0, 0);
        
        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        
        // Procesar imagen para detectar QR
        const result = await processQRImage(imageData);
        
        if (result && result.success) {
            // QR detectado automáticamente
            showStatus('¡Código QR detectado automáticamente!', 'success');
            stopQRAutoDetection();
            closeQRModal();
        }
        
    } catch (error) {
        // Error silencioso para no interrumpir la detección
        console.log('Error en detección automática:', error);
    }
}

// Detener detección automática
function stopQRAutoDetection() {
    if (qrDetectionInterval) {
        clearInterval(qrDetectionInterval);
        qrDetectionInterval = null;
    }
}

// Capturar imagen para QR (manual - por si acaso)
function captureQRImage() {
    try {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        canvas.width = elements.qrVideo.videoWidth;
        canvas.height = elements.qrVideo.videoHeight;
        
        context.drawImage(elements.qrVideo, 0, 0);
        
        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        processQRImage(imageData);
        
        showStatus('Imagen capturada, procesando...', 'info');
        
    } catch (error) {
        console.error('Error al capturar imagen QR:', error);
        showStatus('Error al capturar imagen', 'error');
    }
}

// Capturar foto - FUNCIÓN PRINCIPAL
function capturePhoto() {
    try {
        console.log('Capturando foto...'); // Debug
        
        if (!elements.photoVideo.videoWidth || !elements.photoVideo.videoHeight) {
            showStatus('La cámara no está lista. Espera un momento.', 'error');
            return;
        }
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        canvas.width = elements.photoVideo.videoWidth;
        canvas.height = elements.photoVideo.videoHeight;
        
        context.drawImage(elements.photoVideo, 0, 0);
        
        const imageData = canvas.toDataURL('image/jpeg', 0.9);
        currentPhotoData = imageData;
        
        console.log('Foto capturada, datos:', imageData.substring(0, 100) + '...'); // Debug
        
        // Ocultar imagen por defecto
        const defaultImageContainer = document.querySelector('.default-image-container');
        if (defaultImageContainer) {
            defaultImageContainer.style.display = 'none';
        }
        
        // Mostrar vista previa
        elements.previewImage.src = imageData;
        elements.photoPreview.style.display = 'block';
        
        // Mostrar botón de enviar incidencia
        if (elements.sendIncidenceBtn) {
            elements.sendIncidenceBtn.style.display = 'flex';
        }
        
        // Cambiar botones
        elements.capturePhotoBtn.style.display = 'none';
        if (elements.importPhotoBtn) {
            elements.importPhotoBtn.style.display = 'none';
        }
        elements.retakePhotoBtn.style.display = 'flex';
        
        showStatus('Foto capturada. Revisa la vista previa.', 'success');
        
        // Detener cámara
        stopPhotoCamera();
        
        // Cerrar modal para mostrar la vista previa con el botón de enviar incidencia
        setTimeout(() => {
            closePhotoModal();
        }, 500);
        
    } catch (error) {
        console.error('Error al capturar foto:', error);
        showStatus('Error al capturar foto: ' + error.message, 'error');
    }
}

// Importar foto desde archivo
function handlePhotoImport(event) {
    try {
        const file = event.target.files[0];
        if (!file) {
            return;
        }
        
        // Validar que sea una imagen
        if (!file.type.startsWith('image/')) {
            showStatus('Por favor, selecciona un archivo de imagen', 'error');
            return;
        }
        
        console.log('Importando foto desde archivo:', file.name);
        
        // Crear FileReader para leer el archivo
        const reader = new FileReader();
        
        reader.onload = function(e) {
            const imageData = e.target.result;
            currentPhotoData = imageData;
            
            console.log('Foto importada, datos:', imageData.substring(0, 100) + '...');
            
            // Ocultar imagen por defecto
            const defaultImageContainer = document.querySelector('.default-image-container');
            if (defaultImageContainer) {
                defaultImageContainer.style.display = 'none';
            }
            
            // Mostrar vista previa
            elements.previewImage.src = imageData;
            elements.photoPreview.style.display = 'block';
            
            // Mostrar botón de enviar incidencia
            if (elements.sendIncidenceBtn) {
                elements.sendIncidenceBtn.style.display = 'flex';
            }
            
            // Cambiar botones
            elements.capturePhotoBtn.style.display = 'none';
            elements.importPhotoBtn.style.display = 'none';
            elements.retakePhotoBtn.style.display = 'flex';
            
            showStatus('Foto importada. Revisa la vista previa.', 'success');
            
            // Detener cámara si está activa
            stopPhotoCamera();
            
            // Cerrar modal para mostrar la vista previa con el botón de enviar incidencia
            setTimeout(() => {
                closePhotoModal();
            }, 500);
            
            // Limpiar el input para permitir seleccionar el mismo archivo de nuevo
            if (elements.photoFileInput) {
                elements.photoFileInput.value = '';
            }
        };
        
        reader.onerror = function() {
            showStatus('Error al leer el archivo de imagen', 'error');
            console.error('Error al leer archivo');
        };
        
        // Leer el archivo como Data URL (base64)
        reader.readAsDataURL(file);
        
    } catch (error) {
        console.error('Error al importar foto:', error);
        showStatus('Error al importar foto: ' + error.message, 'error');
    }
}

// Volver a tomar foto
function retakePhoto() {
    currentPhotoData = null;
    elements.photoPreview.style.display = 'none';
    
    // Ocultar botón de enviar incidencia
    if (elements.sendIncidenceBtn) {
        elements.sendIncidenceBtn.style.display = 'none';
    }
    
    elements.retakePhotoBtn.style.display = 'none';
    
    // Mostrar botones de captura e importar nuevamente
    elements.capturePhotoBtn.style.display = 'flex';
    if (elements.importPhotoBtn) {
        elements.importPhotoBtn.style.display = 'flex';
    }
    
    // Mostrar imagen por defecto nuevamente
    const defaultImageContainer = document.querySelector('.default-image-container');
    if (defaultImageContainer) {
        defaultImageContainer.style.display = 'block';
    }
    
    // Limpiar input de archivo
    if (elements.photoFileInput) {
        elements.photoFileInput.value = '';
    }
    
    // Volver a abrir cámara automáticamente
    startPhotoAutoCapture();
}

// Procesar imagen QR
async function processQRImage(imageData) {
    try {
        const response = await fetch('/api/scan-qr', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `image_data=${encodeURIComponent(imageData)}`
        });
        
        const result = await response.json();
        
        if (result.success) {
            displayQRResults(result.qr_codes[0]);
            showStatus('Código QR escaneado correctamente', 'success');
            return result; // Retornar resultado para detección automática
        } else {
            // No mostrar error en detección automática
            if (qrDetectionInterval) {
                return null; // Silencioso para detección automática
            } else {
                showStatus(result.error || 'No se pudo escanear el código QR', 'error');
            }
        }
        
    } catch (error) {
        console.error('Error al procesar imagen QR:', error);
        if (!qrDetectionInterval) {
            showStatus('Error de conexión con el servidor', 'error');
        }
        return null;
    }
}

// Mostrar resultados del QR
function displayQRResults(qrCode) {
    currentQRData = qrCode.data;
    
    // Configurar qrData como enlace clickeable
    elements.qrData.textContent = qrCode.data;
    elements.qrData.href = qrCode.data;
    elements.qrData.title = `Hacer clic para abrir: ${qrCode.data}`;
    
    elements.qrType.textContent = qrCode.type;
    elements.qrResults.style.display = 'block';
}

// Subir foto al servidor
async function uploadPhoto() {
    console.log('📸 uploadPhoto ejecutada');
    console.log('📸 currentPhotoData existe:', !!currentPhotoData);
    console.log('📸 pendingIncidenceData:', pendingIncidenceData);
    
    // Verificar que tenemos los datos necesarios
    if (!currentPhotoData) {
        showStatus('No hay foto para enviar', 'error');
        return;
    }
    
    // Determinar si tenemos datos de QR o audio
    const hasQRData = currentQRData && currentQRData.length > 0;
    const hasAudioData = pendingIncidenceData.hasAudio;
    
    // Si no hay QR ni audio, procesar imagen con IA
    if (!hasQRData && !hasAudioData) {
        console.log('🤖 No hay QR ni audio, procesando imagen con IA...');
        await processImageWithAI();
        return;
    }
    
    try {
        showStatus('Enviando incidencia con foto...', 'info');
        
        // Crear payload de la incidencia con foto
        let incidencePayload;
        
        if (hasQRData) {
            // Usar datos de QR
            const qrId = extractQRId(currentQRData);
            incidencePayload = {
                state: 'PENDING',
                incidenceType: '65a1b2c3d4e5f6789012345',
                observation: currentQRData,
                description: 'Incidencia reportada con QR',
                resource: qrId,
                image: [{
                    file: currentPhotoData,
                    name: `incidencia_qr_${Date.now()}.jpg`
                }],
                audio: []
            };
        } else {
            // Usar datos de audio
            incidencePayload = {
                state: 'PENDING',
                incidenceType: '65a1b2c3d4e5f6789012345',
                observation: pendingIncidenceData.fullText || 'Incidencia reportada con audio',
                description: pendingIncidenceData.description || 'Incidencia reportada con audio',
                resource: `PARADA_${pendingIncidenceData.stopNumber}`,
                image: [{
                    file: currentPhotoData,
                    name: `incidencia_parada_${pendingIncidenceData.stopNumber}_${Date.now()}.jpg`
                }],
                audio: []
            };
        }
        
        console.log('📋 Enviando incidencia con foto:', incidencePayload);
        console.log('🔍 Datos de audio pendientes:', pendingIncidenceData);
        console.log('📸 Datos de foto:', currentPhotoData ? 'Foto disponible' : 'Sin foto');
        
        // Enviar incidencia
        const response = await fetch('/api/incidences', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Device-ID': deviceId
            },
            body: JSON.stringify(incidencePayload)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showStatus(`Incidencia enviada: Parada ${pendingIncidenceData.stopNumber} - ${pendingIncidenceData.description}`, 'success');
            console.log('✅ Incidencia enviada exitosamente:', result);
            
            // Limpiar completamente la pantalla
            resetUIAfterIncidenceSent();
            
        } else {
            showStatus('Error al enviar incidencia: ' + result.error, 'error');
            console.error('❌ Error al enviar incidencia:', result);
        }
        
    } catch (error) {
        showStatus('Error al enviar incidencia: ' + error.message, 'error');
        console.error('❌ Error al enviar incidencia:', error);
    }
}

// Procesar imagen con IA cuando no hay QR ni audio
async function processImageWithAI() {
    try {
        if (!currentPhotoData) {
            showStatus('No hay foto para procesar', 'error');
            return;
        }
        
        console.log('🤖 Iniciando procesamiento de imagen con IA...');
        showStatus('Procesando imagen con IA...', 'info');
        
        // Mostrar modal de procesamiento
        showAIResultsModal();
        elements.aiProcessingStatus.style.display = 'block';
        elements.aiResultsForm.style.display = 'none';
        elements.confirmAIResultsBtn.style.display = 'none';
        
        // Verificar que tenemos la imagen
        if (!currentPhotoData) {
            showStatus('No hay foto para procesar', 'error');
            console.error('❌ currentPhotoData es null o undefined');
            return;
        }
        
        console.log('📸 Enviando imagen a IA...');
        console.log('📸 Tipo de imagen:', typeof currentPhotoData);
        console.log('📸 Longitud de imagen:', currentPhotoData ? currentPhotoData.length : 'N/A');
        console.log('📸 Primeros 100 caracteres:', currentPhotoData ? currentPhotoData.substring(0, 100) : 'N/A');
        
        // Enviar imagen al backend para procesar con LM Studio
        const response = await fetch('/api/process-image-ai', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Device-ID': deviceId
            },
            body: JSON.stringify({
                image: currentPhotoData
            })
        });
        
        console.log('📡 Respuesta recibida del servidor, status:', response.status);
        
        const result = await response.json();
        
        if (!result.success) {
            showStatus('Error al procesar imagen con IA: ' + result.error, 'error');
            console.error('❌ Error procesando imagen:', result.error);
            
            // Ocultar modal de procesamiento
            elements.aiProcessingStatus.style.display = 'none';
            
            // Mostrar mensaje de error
            alert('Error al procesar imagen con IA:\n' + result.error + '\n\nAsegúrate de que LM Studio esté corriendo en http://localhost:1234');
            closeAIResultsModal();
            return;
        }
        
        console.log('✅ Resultados de IA recibidos:', result);
        console.log('📋 stop_number recibido:', result.stop_number);
        console.log('📋 stop_number tipo:', typeof result.stop_number);
        console.log('📋 description recibida:', result.description);
        console.log('📋 description tipo:', typeof result.description);
        
        // Ocultar estado de procesamiento
        elements.aiProcessingStatus.style.display = 'none';
        
        // Mostrar formulario con resultados (siempre, incluso si los valores son null)
        if (elements.aiResultsForm) {
            elements.aiResultsForm.style.display = 'block';
        } else {
            console.error('❌ elements.aiResultsForm no encontrado');
        }
        
        if (elements.confirmAIResultsBtn) {
            elements.confirmAIResultsBtn.style.display = 'flex';
        } else {
            console.error('❌ elements.confirmAIResultsBtn no encontrado');
        }
        
        // Pre-rellenar campos con resultados de IA (incluso si son null)
        if (elements.aiStopNumber) {
            const stopNum = result.stop_number !== undefined && result.stop_number !== null ? String(result.stop_number) : '';
            console.log('📝 Pre-rellenando número de parada:', stopNum);
            elements.aiStopNumber.value = stopNum;
            console.log('✅ Valor establecido en aiStopNumber:', elements.aiStopNumber.value);
        } else {
            console.error('❌ elements.aiStopNumber no encontrado');
        }
        
        if (elements.aiDescription) {
            const desc = result.description !== undefined && result.description !== null ? String(result.description) : 'Sin incidencia visible';
            console.log('📝 Pre-rellenando descripción:', desc);
            elements.aiDescription.value = desc;
            console.log('✅ Valor establecido en aiDescription:', elements.aiDescription.value);
        } else {
            console.error('❌ elements.aiDescription no encontrado');
        }
        
        // Verificar que los valores se han establecido
        console.log('🔍 Verificación final:');
        console.log('  - aiStopNumber existe:', !!elements.aiStopNumber);
        console.log('  - aiStopNumber.value:', elements.aiStopNumber ? elements.aiStopNumber.value : 'elemento no encontrado');
        console.log('  - aiDescription existe:', !!elements.aiDescription);
        console.log('  - aiDescription.value:', elements.aiDescription ? elements.aiDescription.value : 'elemento no encontrado');
        
        // Mostrar respuesta completa si está disponible
        if (result.raw_response && elements.aiRawResponse && elements.aiRawResponseText) {
            elements.aiRawResponse.style.display = 'block';
            elements.aiRawResponseText.textContent = result.raw_response;
        }
        
        showStatus('Imagen procesada. Revisa y corrige los resultados si es necesario.', 'success');
        
    } catch (error) {
        console.error('❌ Error procesando imagen con IA:', error);
        showStatus('Error al procesar imagen con IA: ' + error.message, 'error');
        
        elements.aiProcessingStatus.style.display = 'none';
        alert('Error al procesar imagen con IA:\n' + error.message);
        closeAIResultsModal();
    }
}

// Mostrar modal de resultados de IA
function showAIResultsModal() {
    if (elements.aiResultsModal) {
        elements.aiResultsModal.style.display = 'block';
    }
}

// Cerrar modal de resultados de IA
function closeAIResultsModal() {
    if (elements.aiResultsModal) {
        elements.aiResultsModal.style.display = 'none';
        
        // Limpiar campos
        if (elements.aiStopNumber) {
            elements.aiStopNumber.value = '';
        }
        if (elements.aiDescription) {
            elements.aiDescription.value = '';
        }
        if (elements.aiRawResponse) {
            elements.aiRawResponse.style.display = 'none';
        }
        if (elements.aiRawResponseText) {
            elements.aiRawResponseText.textContent = '';
        }
        
        // Resetear estado
        elements.aiProcessingStatus.style.display = 'none';
        elements.aiResultsForm.style.display = 'none';
        elements.confirmAIResultsBtn.style.display = 'none';
    }
}

// Confirmar resultados de IA y enviar incidencia
async function confirmAIResults() {
    try {
        // Obtener valores corregidos
        const stopNumber = elements.aiStopNumber ? elements.aiStopNumber.value.trim() : '';
        const description = elements.aiDescription ? elements.aiDescription.value.trim() : '';
        
        // Validar campos
        if (!description) {
            showStatus('La descripción es obligatoria', 'error');
            alert('Por favor, ingresa una descripción de la incidencia.');
            return;
        }
        
        if (!stopNumber) {
            showStatus('El número de parada es obligatorio', 'error');
            alert('Por favor, ingresa el número de parada.');
            return;
        }
        
        console.log('✅ Confirmando resultados de IA:', { stopNumber, description });
        
        // Almacenar datos en pendingIncidenceData (similar a audio)
        pendingIncidenceData = {
            stopNumber: stopNumber,
            description: description,
            fullText: `Parada ${stopNumber}, ${description}`,
            hasAudio: false,
            hasAI: true
        };
        
        // Cerrar modal de IA
        closeAIResultsModal();
        
        // Mostrar resultados en la sección de QR (unificar flujo)
        showAudioResults(`Parada ${stopNumber}, ${description}`, stopNumber, description);
        
        // Ahora enviar la incidencia con foto y datos de IA
        showStatus('Enviando incidencia con datos de IA...', 'info');
        
        // Crear payload de la incidencia
        const incidencePayload = {
            state: 'PENDING',
            incidenceType: '65a1b2c3d4e5f6789012345',
            observation: pendingIncidenceData.fullText,
            description: pendingIncidenceData.description,
            resource: `PARADA_${pendingIncidenceData.stopNumber}`,
            image: [{
                file: currentPhotoData,
                name: `incidencia_parada_${pendingIncidenceData.stopNumber}_${Date.now()}.jpg`
            }],
            audio: []
        };
        
        console.log('📋 Enviando incidencia con datos de IA:', incidencePayload);
        
        // Enviar incidencia
        const response = await fetch('/api/incidences', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Device-ID': deviceId
            },
            body: JSON.stringify(incidencePayload)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showStatus(`Incidencia enviada: Parada ${stopNumber} - ${description}`, 'success');
            console.log('✅ Incidencia enviada exitosamente:', result);
            
            // Limpiar completamente la pantalla
            resetUIAfterIncidenceSent();
            
        } else {
            showStatus('Error al enviar incidencia: ' + result.error, 'error');
            console.error('❌ Error al enviar incidencia:', result);
        }
        
    } catch (error) {
        console.error('❌ Error confirmando resultados de IA:', error);
        showStatus('Error al enviar incidencia: ' + error.message, 'error');
    }
}

// Extraer ID del QR (misma lógica que el backend)
function extractQRIdFromData(qrData) {
    if (!qrData) return qrData;
    
    // Buscar 'IdQr/' en el código QR
    if (qrData.includes('IdQr/')) {
        // Extraer la parte después de 'IdQr/'
        return qrData.split('IdQr/')[1];
    } else {
        // Si no contiene 'IdQr/', usar el valor completo
        return qrData;
    }
}

// Leer etiqueta NFC y reutilizar flujo de QR
// Función para iniciar escaneo NFC automático continuo
async function startNFCAutoScan() {
    try {
        if (!('NDEFReader' in window)) {
            console.log('⚠️ NFC no soportado por este navegador/dispositivo');
            return;
        }

        // Evitar múltiples lecturas simultáneas
        if (nfcScanning) {
            return;
        }
        
        nfcScanning = true;
        console.log('📱 Iniciando escaneo NFC automático...');
        
        // Crear nuevo lector NFC
        ndefReader = new NDEFReader();
        
        // Configurar manejadores de eventos
        ndefReader.onreadingerror = () => {
            // Error silencioso - continuar escaneando
            console.log('⚠️ Error leyendo NFC, continuando escaneo...');
            // Reiniciar escaneo después de un breve delay
            setTimeout(() => {
                if (nfcScanning) {
                    startNFCAutoScan();
                }
            }, 1000);
        };

        ndefReader.onreading = (event) => {
            try {
                let textPayload = null;
                for (const record of event.message.records) {
                    if (record.recordType === 'text') {
                        const textDecoder = new TextDecoder(record.encoding || 'utf-8');
                        textPayload = textDecoder.decode(record.data);
                        break;
                    } else if (record.recordType === 'url') {
                        const textDecoder = new TextDecoder('utf-8');
                        textPayload = textDecoder.decode(record.data);
                        break;
                    }
                }

                if (!textPayload) {
                    console.log('⚠️ Etiqueta NFC sin datos de texto/URL');
                    return;
                }

                // Detener escaneo temporalmente mientras procesamos
                stopNFCScanning();

                // Reutilizar flujo de QR: mostrar en UI y guardar currentQRData
                currentQRData = textPayload;
                elements.qrData.textContent = textPayload;
                elements.qrData.href = textPayload;
                elements.qrData.title = `Hacer clic para abrir: ${textPayload}`;
                elements.qrType.textContent = 'NFC';
                elements.qrResults.style.display = 'block';
                showStatus('Etiqueta NFC leída correctamente', 'success');
                
                // Beep corto si la función existe
                if (typeof playBeep === 'function') {
                    playBeep(880, 120);
                }
                
                // Abrir cámara automáticamente si no está abierta
                if (elements.photoModal && elements.photoModal.style.display !== 'block') {
                    startPhotoAutoCapture();
                }
                
                // NO reiniciar escaneo aquí - se reiniciará después de enviar la incidencia
                
            } catch (err) {
                console.error('❌ Error procesando datos NFC:', err);
                showStatus('Error procesando datos NFC: ' + err.message, 'error');
                // Reiniciar escaneo después del error
                setTimeout(() => {
                    if (nfcScanning) {
                        startNFCAutoScan();
                    }
                }, 1000);
            }
        };

        // Iniciar escaneo
        await ndefReader.scan();
        console.log('✅ Escaneo NFC activo');
        
    } catch (error) {
        console.error('❌ Error al iniciar lectura NFC:', error);
        nfcScanning = false;
        // Intentar reiniciar después de un delay
        setTimeout(() => {
            if (!nfcScanning && elements.actionButtons && elements.actionButtons.style.display !== 'none') {
                startNFCAutoScan();
            }
        }, 2000);
    }
}

// Función para detener escaneo NFC
function stopNFCScanning() {
    if (ndefReader) {
        try {
            // No hay método directo para detener, pero podemos marcar como detenido
            ndefReader = null;
        } catch (e) {
            console.log('⚠️ Error al detener NFC:', e);
        }
    }
    nfcScanning = false;
    console.log('🛑 Escaneo NFC detenido');
}

// ========================================
// FUNCIONES DE GRABACIÓN DE AUDIO
// ========================================

// Iniciar grabación de audio
function startAudioRecording() {
    console.log('🎤 Iniciando grabación de audio...');
    elements.audioModal.style.display = 'block';
    resetAudioUI();
}

// Cerrar modal de audio
function closeAudioModal() {
    elements.audioModal.style.display = 'none';
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        stopRecording();
    }
}

// Resetear UI de audio
function resetAudioUI() {
    elements.startRecordingBtn.style.display = 'flex';
    elements.stopRecordingBtn.style.display = 'none';
    elements.playAudioBtn.style.display = 'none';
    elements.deleteAudioBtn.style.display = 'none';
    elements.useAudioBtn.style.display = 'none';
    elements.recordingIndicator.style.display = 'none';
    elements.audioPreview.style.display = 'none';
    elements.audioDuration.textContent = '00:00';
    
    audioChunks = [];
    audioBlob = null;
    mediaRecorder = null;
}

// Iniciar grabación
async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = () => {
            audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            const audioUrl = URL.createObjectURL(audioBlob);
            elements.audioPlayer.src = audioUrl;
            
            // Mostrar controles de reproducción
            elements.playAudioBtn.style.display = 'flex';
            elements.deleteAudioBtn.style.display = 'flex';
            elements.useAudioBtn.style.display = 'flex';
            elements.audioPreview.style.display = 'block';
            
            // Detener el stream
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        recordingStartTime = Date.now();
        
        // Actualizar UI
        elements.startRecordingBtn.style.display = 'none';
        elements.stopRecordingBtn.style.display = 'flex';
        elements.recordingIndicator.style.display = 'block';
        
        // Actualizar duración cada segundo
        recordingInterval = setInterval(updateRecordingDuration, 1000);
        
        console.log('🎤 Grabación iniciada');
        
    } catch (error) {
        console.error('Error al iniciar grabación:', error);
        showStatus('Error al acceder al micrófono: ' + error.message, 'error');
    }
}

// Detener grabación
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        clearInterval(recordingInterval);
        
        // Actualizar UI
        elements.stopRecordingBtn.style.display = 'none';
        elements.recordingIndicator.style.display = 'none';
        
        console.log('🎤 Grabación detenida');
    }
}

// Actualizar duración de grabación
function updateRecordingDuration() {
    if (recordingStartTime) {
        const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        elements.audioDuration.textContent = 
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

// Reproducir audio
function playAudio() {
    if (elements.audioPlayer) {
        elements.audioPlayer.play();
    }
}

// Eliminar audio
function deleteAudio() {
    resetAudioUI();
    console.log('🗑️ Audio eliminado');
}

// Usar audio (almacenar datos para envío posterior)
async function useAudio() {
    console.log('🎤 useAudio ejecutada');
    console.log('🎤 audioBlob existe:', !!audioBlob);
    
    if (audioBlob) {
        try {
            showStatus('Convirtiendo audio a texto...', 'info');
            console.log('🎤 Iniciando conversión de audio a texto...');
            
            // Convertir audio a texto usando Whisper (backend)
            const result = await convertAudioToText(audioBlob);
            console.log('🎤 Resultado de Whisper:', result);
            
            if (result && result.success) {
                let stopNumber = null;
                let description = '';
                let transcribedText = result.transcribed_text || '';
                
                // Verificar si description contiene un JSON string que necesita ser parseado
                if (result.description && typeof result.description === 'string') {
                    try {
                        // Intentar parsear el JSON dentro de description
                        const parsedDescription = JSON.parse(result.description);
                        console.log('✅ JSON parseado de description:', parsedDescription);
                        
                        // Extraer parada e incidencia del JSON parseado
                        if (parsedDescription.parada !== undefined && parsedDescription.parada !== null) {
                            stopNumber = String(parsedDescription.parada);
                            // Asegurar que empieza con P si no lo tiene
                            if (stopNumber && !stopNumber.toUpperCase().startsWith('P')) {
                                stopNumber = `P${stopNumber}`;
                            }
                        }
                        
                        if (parsedDescription.incidencia) {
                            description = String(parsedDescription.incidencia);
                        }
                    } catch (e) {
                        // Si no es JSON válido, usar description como texto normal
                        console.log('⚠️ description no es JSON válido, usando como texto:', e);
                        description = result.description;
                    }
                }
                
                // Si no se encontró stopNumber en el JSON, usar el del resultado o extraer del texto
                if (!stopNumber) {
                    if (result.stop_number !== undefined && result.stop_number !== null) {
                        stopNumber = String(result.stop_number);
                        if (!stopNumber.toUpperCase().startsWith('P')) {
                            stopNumber = `P${stopNumber}`;
                        }
                    } else if (transcribedText) {
                        // Intentar extraer del texto transcrito como fallback
                        const extracted = extractStopInfo(transcribedText);
                        stopNumber = extracted.stopNumber;
                        if (!description) {
                            description = extracted.description;
                        }
                    }
                }
                
                // Si no hay descripción, usar el texto transcrito o un valor por defecto
                if (!description || description.trim() === '') {
                    description = transcribedText || 'Incidencia reportada por audio';
                }
                
                console.log('📝 Texto transcrito:', transcribedText);
                console.log('🚌 Número de parada extraído:', stopNumber);
                console.log('📋 Descripción extraída:', description);
                
                // Mostrar resultados en la sección de QR (unificar flujo)
                showAudioResults(transcribedText, stopNumber, description);
                
                // Almacenar datos para envío posterior
                pendingIncidenceData = {
                    stopNumber: stopNumber || null,
                    description: description,
                    fullText: transcribedText || description,
                    hasAudio: true,
                    hasAI: false
                };
                
                showStatus(`Audio procesado: Parada ${stopNumber || 'N/A'} - ${description}`, 'success');
                console.log('✅ Datos de audio almacenados:', pendingIncidenceData);
                
                // Actualizar botón de reportar incidencia
                updateReportButton();
            } else {
                console.error('❌ No se pudo convertir el audio a texto');
                showStatus('No se pudo convertir el audio a texto', 'error');
            }
        } catch (error) {
            console.error('❌ Error al procesar audio:', error);
            showStatus('Error al procesar el audio: ' + error.message, 'error');
        }
    } else {
        console.error('❌ No hay audioBlob disponible');
        showStatus('No hay audio grabado', 'error');
    }
    
    closeAudioModal();
}

// Mostrar resultados del audio en la sección de QR (unificar flujo)
function showAudioResults(transcribedText, stopNumber, description) {
    if (elements.qrData && elements.qrType && elements.qrResults) {
        // Mostrar texto transcrito como datos
        elements.qrData.textContent = transcribedText;
        elements.qrData.href = '#';
        elements.qrData.onclick = (e) => {
            e.preventDefault();
            // No hacer nada al hacer clic, solo mostrar
        };
        
        // Mostrar tipo como "Audio"
        elements.qrType.textContent = 'Audio';
        
        // Mostrar la sección de resultados
        elements.qrResults.style.display = 'block';
        
        console.log('📱 Resultados de audio mostrados en sección QR');
    }
}

// Crear incidencia con audio
async function createIncidenceWithAudio(description, audioBase64) {
    console.log('🎤 createIncidenceWithAudio ejecutada');
    console.log('🎤 Description:', description);
    console.log('🎤 AudioBase64 length:', audioBase64 ? audioBase64.length : 'null');
    
    try {
        showStatus('Creando incidencia con audio...', 'info');
        
        // Obtener el QR ID actual (si existe)
        const qrId = currentQRData ? extractQRId(currentQRData) : 'PARADA_BUS';
        
        // Crear payload de la incidencia
        const incidencePayload = {
            state: 'PENDING',
            incidenceType: '65a1b2c3d4e5f6789012345', // ID del tipo de incidencia (ajustar según configuración)
            observation: description,
            description: description,
            resource: qrId, // Usar el QR ID como recurso
            image: [], // No hay imagen, solo audio
            audio: [{
                file: `data:audio/wav;base64,${audioBase64}`,
                name: `audio_incidencia_${Date.now()}.wav`
            }]
        };
        
        // Enviar incidencia
        const response = await fetch('/api/incidences', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Device-ID': deviceId
            },
            body: JSON.stringify(incidencePayload)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showStatus('Incidencia creada exitosamente con audio', 'success');
            console.log('✅ Incidencia creada:', result);
        } else {
            showStatus('Error al crear incidencia: ' + result.error, 'error');
            console.error('❌ Error al crear incidencia:', result);
        }
        
    } catch (error) {
        showStatus('Error al crear incidencia: ' + error.message, 'error');
        console.error('❌ Error al crear incidencia:', error);
    }
}

// Convertir audio a texto usando Web Speech API
// Convertir audio a texto usando Whisper (backend)
async function convertAudioToText(audioBlob) {
    try {
        console.log('🎤 Enviando audio a Whisper...');
        
        // Convertir audio a base64
        const base64Audio = await blobToBase64(audioBlob);
        
        // Enviar a backend para procesamiento con Whisper
        const response = await fetch('/api/process-audio', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Device-ID': deviceId
            },
            body: JSON.stringify({
                audio: base64Audio
            })
        });
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || 'Error en transcripción');
        }
        
        console.log('🎤 Whisper transcripción:', result);
        return result;
        
    } catch (error) {
        console.error('❌ Error en transcripción con Whisper:', error);
        throw error;
    }
}

// Convertir blob a base64
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// Extraer información de parada y descripción del texto transcrito
function extractStopInfo(text) {
    // Convertir a minúsculas para facilitar la búsqueda
    const lowerText = text.toLowerCase();
    
    // Patrones para encontrar números de parada
    const stopPatterns = [
        /parada\s+(\d+)/g,
        /parada\s+numero\s+(\d+)/g,
        /parada\s+número\s+(\d+)/g,
        /parada\s+(\d+)/g,
        /stop\s+(\d+)/g,
        /(\d+)\s+parada/g,
        /parada\s+(\d+)/g
    ];
    
    let stopNumber = null;
    
    // Buscar número de parada
    for (const pattern of stopPatterns) {
        const match = pattern.exec(lowerText);
        if (match) {
            stopNumber = match[1];
            break;
        }
    }
    
    // Si no se encuentra con patrones específicos, buscar cualquier número
    if (!stopNumber) {
        const numberMatch = lowerText.match(/(\d+)/);
        if (numberMatch) {
            stopNumber = numberMatch[1];
        }
    }
    
    // Crear descripción limpiando el texto
    let description = text.trim();
    
    // Remover referencias a "parada" y números si es necesario
    description = description.replace(/parada\s+\d+/gi, '').trim();
    description = description.replace(/parada\s+numero\s+\d+/gi, '').trim();
    description = description.replace(/parada\s+número\s+\d+/gi, '').trim();
    
    // Si la descripción queda muy corta, usar el texto original
    if (description.length < 10) {
        description = text.trim();
    }
    
    return {
        stopNumber: stopNumber || 'DESCONOCIDA',
        description: description || 'Incidencia reportada por audio'
    };
}

// Crear incidencia con texto transcrito
async function createIncidenceWithTranscribedText(stopNumber, description, fullText) {
    console.log('📝 createIncidenceWithTranscribedText ejecutada');
    console.log('📝 StopNumber:', stopNumber);
    console.log('📝 Description:', description);
    console.log('📝 FullText:', fullText);
    
    try {
        showStatus('Creando incidencia...', 'info');
        
        // Crear payload de la incidencia
        const incidencePayload = {
            state: 'PENDING',
            incidenceType: '65a1b2c3d4e5f6789012345', // ID del tipo de incidencia (ajustar según configuración)
            observation: fullText, // Texto completo transcrito
            description: description, // Descripción limpia
            resource: `PARADA_${stopNumber}`, // Recurso como número de parada
            image: [], // No hay imagen
            audio: [] // No enviamos el audio, solo el texto
        };
        
        console.log('📋 Payload de incidencia:', incidencePayload);
        console.log('🔗 URL de envío: /api/incidences');
        console.log('🆔 Device ID:', deviceId);
        
        // Enviar incidencia
        const response = await fetch('/api/incidences', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Device-ID': deviceId
            },
            body: JSON.stringify(incidencePayload)
        });
        
        console.log('📡 Respuesta del servidor:', response.status, response.statusText);
        
        const result = await response.json();
        console.log('📄 Resultado completo:', result);
        
        if (result.success) {
            showStatus(`Incidencia creada para parada ${stopNumber}: ${description}`, 'success');
            console.log('✅ Incidencia creada exitosamente:', result);
        } else {
            showStatus('Error al crear incidencia: ' + result.error, 'error');
            console.error('❌ Error al crear incidencia:', result);
        }
        
    } catch (error) {
        showStatus('Error al crear incidencia: ' + error.message, 'error');
        console.error('❌ Error al crear incidencia:', error);
    }
}

// Función de prueba para crear incidencia
async function testIncidenceCreation() {
    console.log('🧪 Probando creación de incidencia...');
    
    try {
        showStatus('Probando creación de incidencia...', 'info');
        
        // Crear payload de prueba
        const testPayload = {
            state: 'PENDING',
            incidenceType: '65a1b2c3d4e5f6789012345',
            observation: 'Prueba de incidencia desde audio - Parada 625, cristal roto',
            description: 'cristal roto',
            resource: 'PARADA_625',
            image: [],
            audio: []
        };
        
        console.log('🧪 Payload de prueba:', testPayload);
        
        // Enviar incidencia de prueba
        const response = await fetch('/api/incidences', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Device-ID': deviceId
            },
            body: JSON.stringify(testPayload)
        });
        
        console.log('🧪 Respuesta del servidor:', response.status, response.statusText);
        
        const result = await response.json();
        console.log('🧪 Resultado completo:', result);
        
        if (result.success) {
            showStatus('✅ Prueba exitosa: Incidencia creada', 'success');
        } else {
            showStatus('❌ Prueba fallida: ' + result.error, 'error');
        }
        
    } catch (error) {
        console.error('🧪 Error en prueba:', error);
        showStatus('❌ Error en prueba: ' + error.message, 'error');
    }
}

// Hacer función global
window.testIncidenceCreation = testIncidenceCreation;

// Función de prueba para el flujo completo
async function testFullFlow() {
    console.log('🧪 Probando flujo completo...');
    
    try {
        // Simular datos de audio
        pendingIncidenceData = {
            stopNumber: '625',
            description: 'cristal roto',
            fullText: 'Parada 625, cristal roto',
            hasAudio: true
        };
        
        console.log('🧪 Datos de audio simulados:', pendingIncidenceData);
        
        // Simular foto (usar una imagen de prueba)
        currentPhotoData = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';
        
        console.log('🧪 Foto simulada:', currentPhotoData ? 'Disponible' : 'No disponible');
        
        // Actualizar botón
        updateReportButton();
        
        showStatus('Datos simulados listos. Ahora puedes probar "Reportar Incidencia"', 'info');
        
    } catch (error) {
        console.error('🧪 Error en prueba de flujo completo:', error);
        showStatus('❌ Error en prueba: ' + error.message, 'error');
    }
}

// Hacer función global
window.testFullFlow = testFullFlow;

// Actualizar botón de reportar incidencia
function updateReportButton() {
    if (elements.takePhotoBtn) {
        if (pendingIncidenceData.hasAudio) {
            elements.takePhotoBtn.innerHTML = '<i class="fas fa-camera"></i> Reportar Incidencia (Audio ✓)';
            elements.takePhotoBtn.style.backgroundColor = '#28a745'; // Verde
        } else {
            elements.takePhotoBtn.innerHTML = '<i class="fas fa-camera"></i> Reportar Incidencia';
            elements.takePhotoBtn.style.backgroundColor = ''; // Color original
        }
    }
}

// Extraer ID del QR (función auxiliar)
function extractQRId(qrData) {
    if (qrData && qrData.includes('IdQr/')) {
        return qrData.split('IdQr/')[1];
    }
    return qrData || 'PARADA_BUS';
}

// Beep simple con Web Audio API (fallback silencioso si no disponible)
function playBeep(frequency = 880, durationMs = 120) {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = frequency;
        o.connect(g);
        g.connect(ctx.destination);
        // Envolvente rápida para evitar clics
        const now = ctx.currentTime;
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.2, now + 0.01);
        g.gain.linearRampToValueAtTime(0.0, now + durationMs / 1000);
        o.start(now);
        o.stop(now + durationMs / 1000 + 0.02);
    } catch (_) {
        // ignorar errores de audio
    }
}

// Enviar incidencia al servidor desde la vista previa
async function sendIncidenceFromPreview() {
    try {
        console.log('📤 sendIncidenceFromPreview ejecutada');
        console.log('📸 currentPhotoData existe:', !!currentPhotoData);
        console.log('📸 currentQRData:', currentQRData);
        console.log('📸 pendingIncidenceData:', pendingIncidenceData);
        
        // Verificar que tenemos foto
        if (!currentPhotoData) {
            showStatus('No hay foto para enviar', 'error');
            return;
        }
        
        // Determinar si tenemos datos de QR o audio
        const hasQRData = currentQRData && currentQRData.length > 0;
        const hasAudioData = pendingIncidenceData && pendingIncidenceData.hasAudio === true;
        const hasAIData = pendingIncidenceData && pendingIncidenceData.hasAI === true;
        
        console.log('🔍 Verificación de datos:');
        console.log('  - hasQRData:', hasQRData);
        console.log('  - hasAudioData:', hasAudioData);
        console.log('  - hasAIData:', hasAIData);
        console.log('  - pendingIncidenceData completo:', JSON.stringify(pendingIncidenceData));
        
        // Si no hay QR ni audio ni IA, procesar imagen con IA primero
        if (!hasQRData && !hasAudioData && !hasAIData) {
            console.log('🤖 No hay QR, audio ni IA, procesando imagen con IA...');
            await processImageWithAI();
            return; // processImageWithAI() manejará el envío
        } else {
            console.log('⚠️ Hay datos de QR/audio/IA, saltando procesamiento con IA');
        }
        
        // Obtener tipos de incidencia disponibles
        const typesResponse = await fetch('/api/incidence-types');
        const typesData = await typesResponse.json();
        
        if (!typesData.success) {
            showStatus('Error al obtener tipos de incidencia: ' + typesData.error, 'error');
            return;
        }

        const incidenceTypes = typesData.types;
        const defaultType = typesData.default_type;
        
        // Si solo hay un tipo, usarlo automáticamente
        let selectedType = defaultType;
        if (incidenceTypes.length > 1) {
            // Si hay múltiples tipos, mostrar selector
            const typeOptions = incidenceTypes.map((type, index) => `${index + 1}. ${type}`).join('\n');
            const selection = prompt(`Selecciona el tipo de incidencia:\n${typeOptions}\n\nIngresa el número (1-${incidenceTypes.length}):`);
            
            if (!selection) {
                showStatus('Selección de tipo cancelada', 'info');
                return;
            }
            
            const typeIndex = parseInt(selection) - 1;
            if (typeIndex >= 0 && typeIndex < incidenceTypes.length) {
                selectedType = incidenceTypes[typeIndex];
            } else {
                showStatus('Selección inválida', 'error');
                return;
            }
        }

        // Mostrar prompt con descripción pre-rellenada si está disponible (audio o IA)
        let description;
        if (hasAudioData && pendingIncidenceData.description) {
            // Pre-rellenar con la descripción del audio para que el usuario pueda modificarla
            parada_bus=prompt('Ingresa el número de parada:',pendingIncidenceData.stopNumber);
            pendingIncidenceData.stopNumber=parada_bus;
            description = prompt('Describe la incidencia:', pendingIncidenceData.description);
            console.log('🎤 Descripción del audio pre-rellenada:', pendingIncidenceData.description);
        } else if (hasAIData && pendingIncidenceData.description) {
            // Pre-rellenar con la descripción de la IA para que el usuario pueda modificarla
            parada_bus=prompt('Ingresa el número de parada:',pendingIncidenceData.stopNumber);
            pendingIncidenceData.stopNumber=parada_bus;
            description = prompt('Describe la incidencia:', pendingIncidenceData.description);
            console.log('🤖 Descripción de la IA pre-rellenada:', pendingIncidenceData.description);
        } else {
            description = prompt('Describe la incidencia:');
        }
        
        if (!description || !description.trim()) {
            showStatus('La descripción es obligatoria para enviar la incidencia', 'warning');
            return;
        }

        // Componer imágenes: usar la vista previa si existe
        const images = [];
        if (elements.previewImage && elements.previewImage.src && elements.previewImage.src.startsWith('data:image')) {
            images.push({ file: elements.previewImage.src, name: 'incidence.jpg' });
        } else if (currentPhotoData && currentPhotoData.startsWith('data:image')) {
            images.push({ file: currentPhotoData, name: 'incidence.jpg' });
        }

        // Usar recurso del audio/IA si está disponible, sino del QR
        let resource;
        if ((hasAudioData || hasAIData) && pendingIncidenceData.stopNumber) {
            resource = `PARADA_${pendingIncidenceData.stopNumber}`;
            console.log('🚏 Usando recurso del audio/IA:', resource);
        } else if (currentQRData) {
            resource = extractQRIdFromData(currentQRData);
            console.log('📱 Usando recurso del QR:', resource);
        } else {
            resource = null;
        }

        const payload = {
            state: 'PENDING',
            incidenceType: selectedType,
            observation: (pendingIncidenceData.hasAudio || pendingIncidenceData.hasAI) ? pendingIncidenceData.fullText : '',
            description: description.trim(),
            resource: resource,
            image: images,
            audio: pendingIncidenceData.hasAudio ? [pendingIncidenceData.audioData] : []
        };
        
        console.log('📋 Payload de incidencia:', payload);

        const resp = await fetch('/api/incidences', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Device-ID': deviceId
            },
            body: JSON.stringify(payload)
        });

        const data = await resp.json();
        if (data.success) {
            showStatus(`Incidencia enviada correctamente (Tipo: ${selectedType})`, 'success');
            
            // Limpiar completamente la pantalla
            resetUIAfterIncidenceSent();
            
        } else {
            showStatus('Error al enviar incidencia: ' + (data.error || 'Desconocido'), 'error');
        }
    } catch (err) {
        showStatus('Error inesperado al enviar incidencia: ' + err.message, 'error');
    }
}

// Verificar estado de la subida en segundo plano
async function checkUploadStatus(filename) {
    let attempts = 0;
    const maxAttempts = 60; // Máximo 5 minutos (60 * 5 segundos)
    
    const checkStatus = async () => {
        try {
            const response = await fetch(`/api/upload-status/${filename}`);
            const result = await response.json();
            
            if (result.success && result.status === 'file_processed') {
                showStatus('Foto enviada a Business Central correctamente', 'success');
                
                // Limpiar datos
                currentPhotoData = null;
                currentQRData = null;
                elements.photoPreview.style.display = 'none';
                
                // Ocultar botón de enviar incidencia
                if (elements.sendIncidenceBtn) {
                    elements.sendIncidenceBtn.style.display = 'none';
                }
                
                elements.qrResults.style.display = 'none';
                elements.taskId.value = '';
                
                // Mostrar imagen por defecto nuevamente
                const defaultImageContainer = document.querySelector('.default-image-container');
                if (defaultImageContainer) {
                    defaultImageContainer.style.display = 'block';
                }
                
                return; // Salir del loop
            }
            
            attempts++;
            if (attempts >= maxAttempts) {
                showStatus('Tiempo de espera agotado. Verifica el estado manualmente.', 'warning');
                return;
            }
            
            // Verificar nuevamente en 5 segundos
            setTimeout(checkStatus, 5000);
            
        } catch (error) {
            console.error('Error al verificar estado:', error);
            attempts++;
            
            if (attempts < maxAttempts) {
                setTimeout(checkStatus, 5000);
            } else {
                showStatus('Error al verificar estado de la subida', 'error');
            }
        }
    };
    
    // Iniciar verificación
    checkStatus();
}

// Detener cámara QR
function stopQRCamera() {
    if (qrStream) {
        qrStream.getTracks().forEach(track => track.stop());
        qrStream = null;
    }
    elements.qrVideo.srcObject = null;
}

// Detener cámara de foto
function stopPhotoCamera() {
    if (photoStream) {
        photoStream.getTracks().forEach(track => track.stop());
        photoStream = null;
    }
    elements.photoVideo.srcObject = null;
    elements.capturePhotoBtn.style.display = 'none';
    elements.retakePhotoBtn.style.display = 'none';
}

// Función para limpiar completamente la pantalla después de enviar una incidencia
function resetUIAfterIncidenceSent() {
    console.log('🧹 Limpiando UI después de enviar incidencia...');
    
    // Limpiar datos globales
    currentPhotoData = null;
    currentQRData = null;
    pendingIncidenceData = {
        stopNumber: null,
        description: null,
        fullText: null,
        hasAudio: false,
        hasAI: false
    };
    
    // Restablecer botones del modal de foto
    if (elements.capturePhotoBtn) {
        elements.capturePhotoBtn.style.display = 'flex';
    }
    if (elements.importPhotoBtn) {
        elements.importPhotoBtn.style.display = 'flex';
    }
    if (elements.retakePhotoBtn) {
        elements.retakePhotoBtn.style.display = 'none';
    }
    
    // Cerrar modales
    if (elements.photoModal) {
        elements.photoModal.style.display = 'none';
    }
    if (elements.aiResultsModal) {
        closeAIResultsModal();
    }
    if (elements.qrModal) {
        elements.qrModal.style.display = 'none';
    }
    
    // Limpiar vista previa de foto
    if (elements.previewImage) {
        elements.previewImage.src = '';
    }
    if (elements.photoPreview) {
        elements.photoPreview.style.display = 'none';
    }
    
    // Ocultar botón de enviar incidencia
    if (elements.sendIncidenceBtn) {
        elements.sendIncidenceBtn.style.display = 'none';
    }
    
    // Ocultar resultados de QR
    if (elements.qrResults) {
        elements.qrResults.style.display = 'none';
    }
    if (elements.qrData) {
        elements.qrData.textContent = '';
        elements.qrData.href = '#';
    }
    if (elements.qrType) {
        elements.qrType.textContent = '';
    }
    
    // Mostrar imagen por defecto nuevamente
    const defaultImageContainer = document.querySelector('.default-image-container');
    if (defaultImageContainer) {
        defaultImageContainer.style.display = 'block';
    }
    
    // Restablecer botón de reportar incidencia
    updateReportButton();
    
    // Limpiar input de archivo si existe
    if (elements.photoFileInput) {
        elements.photoFileInput.value = '';
    }
    
    // Reiniciar escaneo NFC automático
    setTimeout(() => {
        if (elements.actionButtons && elements.actionButtons.style.display !== 'none') {
            startNFCAutoScan();
        }
    }, 500);
    
    console.log('✅ UI limpiada completamente');
}

// Manejar errores de cámara
function handleCameraError(error) {
    let errorMessage = 'Error desconocido al acceder a la cámara';
    
    if (error.name === 'NotAllowedError') {
        errorMessage = 'Permisos de cámara denegados. Habilítalos en la configuración del navegador.';
    } else if (error.name === 'NotFoundError') {
        errorMessage = 'No se encontró cámara en tu dispositivo.';
    } else if (error.name === 'NotReadableError') {
        errorMessage = 'La cámara está siendo usada por otra aplicación.';
    } else if (error.name === 'OverconstrainedError') {
        errorMessage = 'La cámara no soporta la resolución solicitada.';
    } else if (error.name === 'SecurityError') {
        errorMessage = 'Acceso a cámara bloqueado por políticas de seguridad.';
    } else if (error.name === 'AbortError') {
        errorMessage = 'Acceso a cámara abortado.';
    }
    
    showStatus(errorMessage, 'error');
    
    // Mostrar instrucciones de solución
    setTimeout(() => {
        showStatus('💡 Soluciones: 1) Usa navegador completo, 2) Habilita permisos, 3) Verifica HTTPS', 'info');
    }, 3000);
}

// Mostrar mensaje de estado
function showStatus(message, type = 'info') {
    const statusElement = elements.statusMessage;
    statusElement.textContent = message;
    statusElement.className = `status-message ${type}`;
    statusElement.style.display = 'block';
    
    // Ocultar después de 5 segundos
    setTimeout(() => {
        statusElement.style.display = 'none';
    }, 5000);
}

// Función para generar QR de prueba (desarrollo)
function generateTestQR() {
    const testData = {
        data: 'TEST_QR_' + Date.now(),
        type: 'QR_CODE'
    };
    displayQRResults(testData);
    showStatus('QR de prueba generado', 'success');
}

// Función para simular foto de prueba (desarrollo)
function generateTestPhoto() {
    // Crear imagen de prueba simple
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    canvas.width = 300;
    canvas.height = 200;
    
    // Dibujar rectángulo de prueba
    context.fillStyle = '#4CAF50';
    context.fillRect(0, 0, 300, 200);
    context.fillStyle = 'white';
    context.font = '24px Arial';
    context.fillText('Foto de Prueba', 50, 100);
    
    const imageData = canvas.toDataURL('image/jpeg', 0.9);
    currentPhotoData = imageData;
    
    // Mostrar vista previa
    elements.previewImage.src = imageData;
    elements.photoPreview.style.display = 'block';
    
    // Mostrar botón de enviar incidencia
    if (elements.sendIncidenceBtn) {
        elements.sendIncidenceBtn.style.display = 'flex';
    }
    
    showStatus('Foto de prueba generada', 'success');
}

// Agregar botones de prueba en desarrollo
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    const testButtons = `
        <div style="margin: 20px 0; padding: 15px; background: #f0f0f0; border-radius: 8px;">
            <h4>🧪 Botones de Prueba (Solo Desarrollo)</h4>
            <button onclick="generateTestQR()" style="margin: 5px; padding: 8px 16px; background: #2196F3; color: white; border: none; border-radius: 4px;">Generar QR de Prueba</button>
            <button onclick="generateTestPhoto()" style="margin: 5px; padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px;">Generar Foto de Prueba</button>
        </div>
    `;
    
    // Insertar después del header
    const header = document.querySelector('.header');
    header.insertAdjacentHTML('afterend', testButtons);
}

// Manejo de errores globales
window.addEventListener('error', function(e) {
    console.error('Error global:', e.error);
    showStatus('Error inesperado en la aplicación', 'error');
});

// Manejo de promesas rechazadas
window.addEventListener('unhandledrejection', function(e) {
    console.error('Promesa rechazada:', e.reason);
    showStatus('Error de promesa no manejada', 'error');
});

// ========================================
// FUNCIONALIDADES PWA (Progressive Web App)
// ========================================

// Variables PWA
let deferredPrompt = null;
let isPWAInstalled = false;

// Detectar evento de instalación PWA
window.addEventListener('beforeinstallprompt', (e) => {
    console.log('📱 Evento de instalación PWA detectado');
    e.preventDefault();
    deferredPrompt = e;
    
    // Mostrar botón de instalación si no está instalada
    showInstallButton();
});

// Detectar si la PWA ya está instalada
window.addEventListener('appinstalled', () => {
    console.log('✅ PWA instalada correctamente');
    isPWAInstalled = true;
    hideInstallButton();
    showStatus('¡Aplicación instalada! Ahora puedes acceder desde tu pantalla de inicio', 'success');
});

// Función para mostrar botón de instalación
function showInstallButton() {
    // Crear botón de instalación si no existe
    if (!document.getElementById('installPWAButton')) {
        const installButton = document.createElement('button');
        installButton.id = 'installPWAButton';
        installButton.className = 'btn btn-success';
        installButton.innerHTML = '<i class="fas fa-download"></i> Instalar App';
        installButton.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1000;
            background: #28a745;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 25px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
            font-size: 14px;
            cursor: pointer;
        `;
        
        installButton.addEventListener('click', installPWA);
        document.body.appendChild(installButton);
        
        // Mostrar mensaje informativo
        showStatus('💡 Toca "Instalar App" para añadir a tu pantalla de inicio', 'info');
    }
}

// Función para ocultar botón de instalación
function hideInstallButton() {
    const installButton = document.getElementById('installPWAButton');
    if (installButton) {
        installButton.remove();
    }
}

// Función para instalar la PWA
async function installPWA() {
    if (!deferredPrompt) {
        showStatus('La aplicación ya está instalada o no es compatible', 'info');
        return;
    }
    
    try {
        // Mostrar prompt de instalación
        deferredPrompt.prompt();
        
        // Esperar respuesta del usuario
        const { outcome } = await deferredPrompt.userChoice;
        
        if (outcome === 'accepted') {
            console.log('✅ Usuario aceptó instalar la PWA');
            showStatus('Instalando aplicación...', 'info');
        } else {
            console.log('❌ Usuario rechazó instalar la PWA');
            showStatus('Instalación cancelada', 'info');
        }
        
        // Limpiar prompt
        deferredPrompt = null;
        hideInstallButton();
        
    } catch (error) {
        console.error('Error al instalar PWA:', error);
        showStatus('Error al instalar la aplicación', 'error');
    }
}

// Verificar si la app está en modo standalone (PWA)
function checkPWAMode() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                         window.navigator.standalone === true;
    
    if (isStandalone) {
        console.log('📱 Aplicación ejecutándose en modo PWA');
        isPWAInstalled = true;
        
        // Aplicar estilos específicos para PWA
        document.body.classList.add('pwa-mode');
        
        // Ocultar botón de instalación
        hideInstallButton();
        
        // Mostrar indicador de PWA
        showPWAModeIndicator();
        
        // Ocultar el indicador después de 2 segundos
        setTimeout(() => {
            const indicator = document.getElementById('pwaIndicator');
            if (indicator) {
                indicator.style.opacity = '0';
                indicator.style.transform = 'translateY(-20px)';
                setTimeout(() => indicator.remove(), 300);
            }
        }, 2000);
    } else {
        console.log('🌐 Aplicación ejecutándose en navegador');
    }
}

// Mostrar indicador de modo PWA
function showPWAModeIndicator() {
    if (!document.getElementById('pwaIndicator')) {
        const indicator = document.createElement('div');
        indicator.id = 'pwaIndicator';
        indicator.innerHTML = '<i class="fas fa-mobile-alt"></i> Modo App';
        indicator.style.cssText = `
            position: fixed;
            top: 20px;
            left: 20px;
            background: var(--malla-secondary);
            color: white;
            padding: 8px 16px;
            border-radius: 0;
            font-size: 12px;
            z-index: 1000;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            transition: all 0.3s ease;
        `;
        
        document.body.appendChild(indicator);
    }
}

// Inicializar funcionalidades PWA
function initializePWA() {
    console.log('🚀 Inicializando funcionalidades PWA...');
    
    // Verificar modo PWA
    checkPWAMode();
    
    // Verificar soporte de Service Worker
    if ('serviceWorker' in navigator) {
        console.log('✅ Service Worker soportado');
    } else {
        console.log('❌ Service Worker no soportado');
    }
    
    // Verificar soporte de instalación PWA
    if ('BeforeInstallPromptEvent' in window) {
        console.log('✅ Instalación PWA soportada');
    } else {
        console.log('❌ Instalación PWA no soportada');
    }
}

// Llamar inicialización PWA cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', initializePWA);

// Manejar cambios en el modo de visualización (PWA vs navegador)
window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
    if (e.matches) {
        console.log('🔄 Cambiando a modo PWA');
        checkPWAMode();
    } else {
        console.log('🔄 Cambiando a modo navegador');
        document.body.classList.remove('pwa-mode');
        const indicator = document.getElementById('pwaIndicator');
        if (indicator) indicator.remove();
    }
});

// ========================================
// SISTEMA DE AUTENTICACIÓN GTASK
// ========================================

// Variables para autenticación
let currentUser = null;
let isAuthenticated = false;
let deviceId = null;

// Inicializar sistema de autenticación
function initializeAuth() {
    console.log('🔐 Inicializando sistema de autenticación GTask...');
    
    // Generar o recuperar device_id
    initializeDeviceId();
    
    // Agregar event listeners para login
    if (elements.loginBtn) {
        elements.loginBtn.addEventListener('click', function(e) {
            e.preventDefault();
            showLoginModal();
        });
    }
    
    if (elements.logoutBtn) {
        elements.logoutBtn.addEventListener('click', handleLogout);
    }
    
    if (elements.loginForm) {
        elements.loginForm.addEventListener('submit', handleLogin);
        console.log('✅ Event listener agregado para loginForm');
    } else {
        console.error('❌ No se encontró loginForm');
    }
    
    // Verificar estado de autenticación al cargar
    checkAuthStatus();
}


// Inicializar device_id único para este dispositivo
function initializeDeviceId() {
    // Intentar recuperar device_id del localStorage
    deviceId = localStorage.getItem('incidencias_device_id');
    
    if (!deviceId) {
        // Generar nuevo device_id único
        deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('incidencias_device_id', deviceId);
        console.log('🆔 Nuevo device_id generado:', deviceId);
    } else {
        console.log('🆔 Device_id recuperado:', deviceId);
    }
}

// Verificar estado de autenticación
async function checkAuthStatus() {
    try {
        const response = await fetch('/api/gtask/status', {
            headers: {
                'X-Device-ID': deviceId
            }
        });
        const data = await response.json();
        
        if (data.success && data.is_authenticated) {
            // Usuario ya autenticado
            currentUser = data.user;
            isAuthenticated = true;
            updateUIForAuthenticatedUser();
            console.log('✅ Usuario autenticado:', currentUser.username);
        } else {
            // Usuario no autenticado
            updateUIForUnauthenticatedUser();
            console.log('❌ Usuario no autenticado');
        }
    } catch (error) {
        console.error('Error al verificar estado de autenticación:', error);
        updateUIForUnauthenticatedUser();
    }
}

// Mostrar modal de login
function showLoginModal() {
    if (elements.loginModal) {
        elements.loginModal.style.display = 'block';
        
        if (elements.loginUsername) {
            elements.loginUsername.focus();
        }
        
        // Limpiar estado anterior
        if (elements.loginStatus) {
            elements.loginStatus.textContent = '';
            elements.loginStatus.className = 'login-status';
        }
        
        if (elements.loginForm) {
            elements.loginForm.reset();
        }
    }
}

// Hacer la función global para el botón de prueba
window.showLoginModal = showLoginModal;

// Ocultar modal de login
function hideLoginModal() {
    elements.loginModal.style.display = 'none';
}

// Manejar envío del formulario de login
async function handleLogin(event) {
    console.log('🔐 handleLogin ejecutada');
    event.preventDefault();
    
    const username = elements.loginUsername.value.trim();
    const password = elements.loginPassword.value.trim();
    
    console.log('Usuario:', username);
    console.log('Password:', password ? '***' : 'vacío');
    
    if (!username || !password) {
        showLoginStatus('Por favor, completa todos los campos', 'error');
        return;
    }
    
    try {
        showLoginStatus('Iniciando sesión...', 'info');
        console.log('🚀 Llamando a /api/gtask/login...');
        
        const response = await fetch('/api/gtask/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Device-ID': deviceId
            },
            body: JSON.stringify({ username, password, device_id: deviceId })
        });
        
        console.log('📡 Respuesta recibida:', response.status);
        
        const data = await response.json();
        
        if (data.success) {
            // Login exitoso
            currentUser = data.user;
            isAuthenticated = true;
            
            showLoginStatus('¡Login exitoso!', 'success');
            
            // Ocultar modal después de un breve delay
            setTimeout(() => {
                hideLoginModal();
                updateUIForAuthenticatedUser();
            }, 1000);
            
            console.log('✅ Login exitoso:', currentUser.username);
        } else {
            // Error en login
            showLoginStatus(data.error || 'Error al iniciar sesión', 'error');
            console.error('❌ Error en login:', data.error);
        }
    } catch (error) {
        console.error('Error en login:', error);
        showLoginStatus('Error de conexión. Intenta de nuevo.', 'error');
    }
}

// Manejar logout
async function handleLogout() {
    try {
        const response = await fetch('/api/gtask/logout', {
            method: 'POST',
            headers: {
                'X-Device-ID': deviceId
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Logout exitoso
            currentUser = null;
            isAuthenticated = false;
            
            updateUIForUnauthenticatedUser();
            showStatus('Sesión cerrada correctamente', 'info');
            
            console.log('✅ Logout exitoso');
        } else {
            console.error('❌ Error en logout:', data.error);
        }
    } catch (error) {
        console.error('Error en logout:', error);
        // Aún así, limpiar el estado local
        currentUser = null;
        isAuthenticated = false;
        updateUIForUnauthenticatedUser();
    }
}

// Mostrar estado del login
function showLoginStatus(message, type) {
    elements.loginStatus.textContent = message;
    elements.loginStatus.className = `login-status ${type}`;
}

// Actualizar UI para usuario autenticado
function updateUIForAuthenticatedUser() {
    // Ocultar sección de login
    elements.loginSection.style.display = 'none';
    
    // Mostrar botones de acción
    elements.actionButtons.style.display = 'flex';
    
    // Mostrar indicador de usuario
    elements.userIndicator.style.display = 'flex';
    elements.currentUsername.textContent = currentUser.username;
    
    // Habilitar botones de acción
    if (elements.takePhotoBtn) {
        elements.takePhotoBtn.disabled = false;
    }
    
    // Iniciar escaneo NFC automático
    startNFCAutoScan();
    
    console.log('👤 UI actualizada para usuario autenticado');
}

// Actualizar UI para usuario no autenticado
function updateUIForUnauthenticatedUser() {
    // Mostrar sección de login
    elements.loginSection.style.display = 'block';
    
    // Ocultar botones de acción
    elements.actionButtons.style.display = 'none';
    
    // Ocultar indicador de usuario
    elements.userIndicator.style.display = 'none';
    
    // Deshabilitar botones de acción y detener NFC
    stopNFCScanning();
    if (elements.takePhotoBtn) {
        elements.takePhotoBtn.disabled = true;
    }
    
    console.log('🚫 UI actualizada para usuario no autenticado');
}

// Cerrar modal de login con Escape
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && elements.loginModal.style.display === 'block') {
        hideLoginModal();
    }
});

// Cerrar modal de login haciendo clic fuera
window.addEventListener('click', function(event) {
    if (event.target === elements.loginModal) {
        hideLoginModal();
    }
});

// ========================================
// SELECCIÓN DE TAREAS
// ========================================

// Variables para selección de tareas
let pendingTasks = null;
let pendingFilename = null;
let pendingQRData = null;
let pendingQRId = null;

// Mostrar modal de selección de tareas
function showTaskSelectionModal(tasks, filename, qrData, qrId) {
    // Guardar datos pendientes
    pendingTasks = tasks;
    pendingFilename = filename;
    pendingQRData = qrData;
    pendingQRId = qrId;
    
    // Crear modal si no existe
    if (!document.getElementById('taskSelectionModal')) {
        createTaskSelectionModal();
    }
    
    // Mostrar modal
    const modal = document.getElementById('taskSelectionModal');
    modal.style.display = 'block';
    
    // Llenar lista de tareas
    populateTaskList(tasks);
    
    showStatus('Selecciona una tarea para continuar', 'info');
}

// Crear modal de selección de tareas
function createTaskSelectionModal() {
    const modalHTML = `
        <div id="taskSelectionModal" class="modal" style="display: none;">
            <div class="modal-content">
                <div class="modal-header">
                    <h3><i class="fas fa-tasks"></i> Seleccionar Tarea</h3>
                    <button class="close-btn" id="closeTaskModal">&times;</button>
                </div>
                <div class="modal-body">
                    <p class="task-selection-info">
                        <i class="fas fa-info-circle"></i> 
                        Se encontraron múltiples tareas para este QR. Selecciona la tarea correcta:
                    </p>
                    <div id="taskList" class="task-list">
                        <!-- Las tareas se llenarán dinámicamente -->
                    </div>
                    <div class="task-actions">
                        <button id="cancelTaskSelection" class="btn btn-secondary">
                            <i class="fas fa-times"></i> Cancelar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Agregar event listeners
    document.getElementById('closeTaskModal').addEventListener('click', hideTaskSelectionModal);
    document.getElementById('cancelTaskSelection').addEventListener('click', hideTaskSelectionModal);
    
    // Cerrar modal haciendo clic fuera
    document.getElementById('taskSelectionModal').addEventListener('click', function(event) {
        if (event.target === this) {
            hideTaskSelectionModal();
        }
    });
}

// Llenar lista de tareas
function populateTaskList(tasks) {
    const taskList = document.getElementById('taskList');
    taskList.innerHTML = '';
    
    tasks.forEach((task, index) => {
        const taskItem = document.createElement('div');
        taskItem.className = 'task-item';
        taskItem.innerHTML = `
            <div class="task-info">
                <h4 class="task-title">${task.descripcion || 'Sin descripción'}</h4>
                <div class="task-details">
                    <span class="task-id"><i class="fas fa-hashtag"></i> ID: ${task.idnavision}</span>
                    <span class="task-company"><i class="fas fa-building"></i> ${task.empresa}</span>
                </div>
            </div>
            <button class="btn btn-primary select-task-btn" data-task-index="${index}">
                <i class="fas fa-check"></i> Seleccionar
            </button>
        `;
        
        // Agregar event listener para seleccionar tarea
        taskItem.querySelector('.select-task-btn').addEventListener('click', function() {
            selectTask(tasks[index]);
        });
        
        taskList.appendChild(taskItem);
    });
}

// Seleccionar tarea
async function selectTask(selectedTask) {
    try {
        showStatus('Procesando con la tarea seleccionada...', 'info');
        
        // Enviar foto con la tarea seleccionada
        const response = await fetch('/api/process-photo-with-task', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Device-ID': deviceId
            },
            body: `image_data=${encodeURIComponent(currentPhotoData)}&qr_data=${pendingQRData}&selected_task=${encodeURIComponent(JSON.stringify(selectedTask))}&device_id=${deviceId}`
        });
        
        const result = await response.json();
        
        if (result.success) {
            showStatus('Foto procesada correctamente con la tarea seleccionada', 'success');
            
            // Limpiar datos
            currentPhotoData = null;
            currentQRData = null;
            elements.photoPreview.style.display = 'none';
            
            // Ocultar botón de enviar incidencia
            if (elements.sendIncidenceBtn) {
                elements.sendIncidenceBtn.style.display = 'none';
            }
            
            elements.qrResults.style.display = 'none';
            
            // Mostrar imagen por defecto nuevamente
            const defaultImageContainer = document.querySelector('.default-image-container');
            if (defaultImageContainer) {
                defaultImageContainer.style.display = 'block';
            }
            
            // Ocultar modal
            hideTaskSelectionModal();
            
        } else {
            showStatus(result.error || 'Error al procesar con la tarea seleccionada', 'error');
        }
        
    } catch (error) {
        console.error('Error al seleccionar tarea:', error);
        showStatus('Error de conexión con el servidor', 'error');
    }
}

// Ocultar modal de selección de tareas
function hideTaskSelectionModal() {
    const modal = document.getElementById('taskSelectionModal');
    if (modal) {
        modal.style.display = 'none';
    }
    
    // Limpiar datos pendientes
    pendingTasks = null;
    pendingFilename = null;
    pendingQRData = null;
    pendingQRId = null;
    
    showStatus('Selección de tarea cancelada', 'info');
}

// Cerrar modal de selección de tareas con Escape
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const taskModal = document.getElementById('taskSelectionModal');
        if (taskModal && taskModal.style.display === 'block') {
            hideTaskSelectionModal();
        }
    }
});

