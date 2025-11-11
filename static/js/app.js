// Variables globales
let qrStream = null;
let photoStream = null;
let currentQRData = null;
let currentPhotoData = null; // Mantener para compatibilidad con código existente
let imagenia = null; // Foto principal capturada/importada con "Reportar Incidencia" - se envía a la IA (única, se sustituye)
let photoGallery = []; // Array para almacenar fotos adicionales (se envían con la incidencia pero NO a la IA)
let currentPhotoIndex = 0; // Índice de la foto actual en la galería
let photoMode = null; // 'reportar' o 'añadir' - indica desde dónde se abrió el modal de fotos
let qrDetectionInterval = null; // Para detección automática de QR
let nfcScanning = false; // Evitar múltiples lecturas simultáneas
let ndefReader = null; // Lector NFC para poder detenerlo

// Variables para grabación de audio
let mediaRecorder = null;
let audioStream = null; // Guardar referencia al stream para poder cerrarlo
let audioChunks = [];
let audioBlob = null;
let recordingStartTime = null;
let recordingInterval = null;
let audioContext = null; // Para detección de silencio
let analyser = null; // Para analizar el audio
let silenceDetectionInterval = null; // Intervalo para detectar silencio
let isAutoRecording = false; // Indica si la grabación es automática (con detección de silencio)
let lastSoundTime = null; // Última vez que se detectó sonido

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
        userIconBtn: document.getElementById('userIconBtn'),
        
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
        autoRecordingModal: document.getElementById('autoRecordingModal'),
        autoRecordingStatus: document.getElementById('autoRecordingStatus'),
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
        cancelAIResultsBtn: document.getElementById('cancelAIResultsBtn'),
        
        // Elementos de la galería de fotos
        addPhotosBtn: document.getElementById('addPhotosBtn'),
        multiplePhotosInput: document.getElementById('multiplePhotosInput'),
        photoGallery: document.getElementById('photoGallery'),
        prevPhotoBtn: document.getElementById('prevPhotoBtn'),
        nextPhotoBtn: document.getElementById('nextPhotoBtn'),
        photoCount: document.getElementById('photoCount')
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
        
        // Activar reconocimiento de voz automático si el usuario ya está autenticado
        // (se ejecutará después de verificar la autenticación)
        setTimeout(() => {
            if (isAuthenticated) {
                activateVoiceCommandOnLoad();
            }
        }, 3000); // Esperar 3 segundos para que se complete la verificación de autenticación
    } else {
        console.error('❌ Elementos críticos no encontrados');
    }
});

// Detectar shortcuts de Gemini/Google Assistant y activar acciones automáticamente
// Usar múltiples eventos para asegurar que se detecte correctamente
function handleActionFromURL() {
    // Detectar si viene de un shortcut de Gemini
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');
    
    console.log('🔍 Verificando parámetros de URL:', { action, url: window.location.href });
    
    // Solo activar si hay explícitamente el parámetro action=voice
    // No activar automáticamente cuando se abre la app normalmente
    if (action === 'voice') {
        console.log('🎤 Shortcut de voz detectado - Iniciando proceso de grabación...');
        
        // Función para intentar activar la grabación
        const tryActivateRecording = (attempt = 0) => {
            const maxAttempts = 15; // Intentar hasta 15 veces (15 segundos)
            
            console.log(`🎤 Intento ${attempt + 1}/${maxAttempts} - Verificando disponibilidad...`);
            
            // Verificar que el botón existe
            if (!elements.recordAudioBtn) {
                console.warn('⚠️ Botón recordAudioBtn no encontrado en elements');
                if (attempt < maxAttempts) {
                    setTimeout(() => tryActivateRecording(attempt + 1), 1000);
                } else {
                    console.error('❌ No se pudo encontrar el botón de grabación después de múltiples intentos');
                }
                return;
            }
            
            // Verificar que el botón está visible
            const isVisible = elements.recordAudioBtn.offsetParent !== null;
            const isNotDisabled = !elements.recordAudioBtn.disabled;
            const isDisplayed = window.getComputedStyle(elements.recordAudioBtn).display !== 'none';
            
            console.log('🎤 Estado del botón:', {
                existe: !!elements.recordAudioBtn,
                visible: isVisible,
                noDeshabilitado: isNotDisabled,
                display: window.getComputedStyle(elements.recordAudioBtn).display
            });
            
            // Si el botón está disponible, activar la grabación
            if (isVisible && isNotDisabled && isDisplayed) {
                console.log('✅ Botón disponible - Activando grabación...');
                
                // Intentar primero con click() para mantener la consistencia con el flujo normal
                try {
                    elements.recordAudioBtn.click();
                    console.log('✅ Click en botón ejecutado');
                    
                    // Verificar que el modal se abrió después de un breve delay
                    setTimeout(() => {
                        if (elements.audioModal && elements.audioModal.style.display !== 'none') {
                            console.log('✅ Modal de audio abierto correctamente');
                            
                            // Intentar iniciar la grabación automáticamente si el botón de inicio está disponible
                            setTimeout(() => {
                                if (elements.startRecordingBtn && 
                                    elements.startRecordingBtn.offsetParent !== null &&
                                    !elements.startRecordingBtn.disabled) {
                                    console.log('🎤 Iniciando grabación automáticamente...');
                                    elements.startRecordingBtn.click();
                                } else {
                                    console.log('ℹ️ El usuario debe iniciar la grabación manualmente desde el modal');
                                }
                            }, 500);
                        } else {
                            console.warn('⚠️ El modal de audio no se abrió después del click');
                        }
                    }, 500);
                    
                } catch (error) {
                    console.error('❌ Error al hacer click en el botón:', error);
                    // Si el click falla, intentar llamar directamente a la función
                    if (typeof startAudioRecording === 'function') {
                        console.log('🔄 Intentando llamar directamente a startAudioRecording()...');
                        try {
                            startAudioRecording();
                        } catch (funcError) {
                            console.error('❌ Error al llamar a startAudioRecording():', funcError);
                        }
                    }
                }
                return;
            }
            
            // Si no está disponible, intentar de nuevo
            if (attempt < maxAttempts) {
                console.log(`⏳ Esperando a que el botón esté disponible... (${attempt + 1}/${maxAttempts})`);
                setTimeout(() => tryActivateRecording(attempt + 1), 1000);
            } else {
                console.error('❌ No se pudo activar la grabación después de múltiples intentos');
                showStatus('No se pudo activar la grabación automáticamente. Por favor, haz click en "Grabar Audio" manualmente.', 'error');
            }
        };
        
        // Esperar un poco antes de intentar (para asegurar que todo esté inicializado)
        setTimeout(() => tryActivateRecording(), 1500);
    } else if (action === 'scan') {
        console.log('📷 Shortcut de escaneo QR detectado');
        // Aquí se puede añadir lógica para activar el escaneo QR automáticamente
    } else if (action === 'photo') {
        console.log('📸 Shortcut de foto detectado');
        // Aquí se puede añadir lógica para activar la cámara automáticamente
    }
}

// Ejecutar cuando la página se carga
window.addEventListener('load', handleActionFromURL);

// También ejecutar cuando la página se muestra (útil para PWAs)
window.addEventListener('pageshow', (event) => {
    // Si viene de caché, verificar de nuevo
    if (event.persisted) {
        console.log('🔄 Página restaurada desde caché - Verificando acciones...');
        setTimeout(handleActionFromURL, 500);
    }
});

// Detectar cuando la app se hace visible (solo verificar si hay parámetros en la URL)
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        // Solo verificar si hay parámetros de acción en la URL
        const urlParams = new URLSearchParams(window.location.search);
        const action = urlParams.get('action');
        if (action) {
            console.log('👁️ App visible - Verificando acciones...');
            setTimeout(handleActionFromURL, 1000);
        }
    }
});

// No activar automáticamente cuando se abre la app normalmente
// Solo activar cuando hay explícitamente el parámetro action=voice en la URL

// Configurar event listeners
function initializeEventListeners() {
    // Botones principales
    if (elements.takePhotoBtn) {
        elements.takePhotoBtn.addEventListener('click', () => {
            stopNFCScanning(); // Detener NFC al pulsar reportar incidencia
            photoMode = 'reportar'; // Establecer modo "Reportar Incidencia"
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
            // Usar el input del modal (photoFileInput) que ahora permite múltiples fotos
            if (elements.photoFileInput) {
                elements.photoFileInput.click();
            } else if (elements.multiplePhotosInput) {
                // Fallback al input de múltiples fotos si no existe el del modal
                elements.multiplePhotosInput.click();
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
    
    // Botón para añadir múltiples fotos - abre modal de cámara
    if (elements.addPhotosBtn) {
        elements.addPhotosBtn.addEventListener('click', () => {
            stopNFCScanning(); // Detener NFC al pulsar añadir fotos
            photoMode = 'añadir'; // Establecer modo "Añadir Fotos"
            startPhotoAutoCapture(); // Abrir modal de cámara para capturar o importar
        });
    }
    
    // Input para múltiples fotos (usado desde el botón "Importar Foto" del modal)
    if (elements.multiplePhotosInput) {
        elements.multiplePhotosInput.addEventListener('change', handleMultiplePhotos);
    }
    
    // Navegación de la galería
    if (elements.prevPhotoBtn) {
        elements.prevPhotoBtn.addEventListener('click', () => navigateGallery(-1));
    }
    if (elements.nextPhotoBtn) {
        elements.nextPhotoBtn.addEventListener('click', () => navigateGallery(1));
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
        
        // Verificar el modo: 'reportar' o 'añadir'
        if (photoMode === 'reportar') {
            // Modo "Reportar Incidencia": establecer como imagenia
            imagenia = imageData;
            currentPhotoData = imageData; // Mantener para compatibilidad
            
            // Normalizar imagenia a objeto si es necesario
            const imageniaObj = typeof imageData === 'string' ? {
                base64: imageData,
                url: null,
                file_id: null,
                filename: `main_photo_${Date.now()}.jpg`,
                converted: false
            } : imageData;
            
            // Limpiar solo las fotos adicionales (mantener fotos adicionales existentes)
            // La galería mostrará: imagenia + fotos adicionales
            const hadAdditionalPhotos = photoGallery.length > 0 && 
                (typeof photoGallery[0] === 'string' ? photoGallery[0] !== imagenia : 
                 (typeof photoGallery[0] === 'object' ? photoGallery[0].base64 !== imagenia : true));
            const additionalPhotos = hadAdditionalPhotos ? photoGallery.slice(1) : [];
            
            // Establecer nueva galería: imagenia + fotos adicionales existentes
            photoGallery = [imageniaObj, ...additionalPhotos];
            
            // Generar URL para imagenia en segundo plano (sin añadir a la galería, ya está añadida)
            (async () => {
                try {
                    console.log('🔄 Convirtiendo imagenia a URL...');
                    const response = await fetch('/api/convert-photo-to-url', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Device-ID': deviceId
                        },
                        body: JSON.stringify({
                            image: imageniaObj.base64,
                            filename: imageniaObj.filename
                        })
                    });
                    
                    const result = await response.json();
                    
                    if (result.success) {
                        // Actualizar el objeto con la URL generada
                        if (photoGallery[0] === imageniaObj) {
                            photoGallery[0].url = result.url;
                            photoGallery[0].file_id = result.file_id;
                            photoGallery[0].converted = true;
                            console.log(`✅ URL generada para imagenia: ${result.url.substring(0, 50)}...`);
                            updatePhotoGallery();
                        }
                    } else {
                        console.error('❌ Error al generar URL para imagenia:', result.error);
                    }
                } catch (error) {
                    console.error('❌ Error al convertir imagenia a URL:', error);
                }
            })();
            
            console.log('📸 Imagenia capturada (para IA):', imageData.substring(0, 100) + '...'); // Debug
        } else if (photoMode === 'añadir') {
            // Modo "Añadir Fotos": solo añadir a la galería, NO tocar imagenia
            addPhotoToGallery(imageData);
            console.log('📸 Foto adicional capturada:', imageData.substring(0, 100) + '...'); // Debug
        } else {
            // Modo no definido: por defecto, establecer como imagenia
            imagenia = imageData;
            currentPhotoData = imageData;
            
            // Normalizar a objeto
            const imageniaObj = typeof imageData === 'string' ? {
                base64: imageData,
                url: null,
                file_id: null,
                filename: `main_photo_${Date.now()}.jpg`,
                converted: false
            } : imageData;
            
            photoGallery = [imageniaObj];
            
            // Generar URL en segundo plano (sin añadir a la galería, ya está añadida)
            (async () => {
                try {
                    console.log('🔄 Convirtiendo foto a URL...');
                    const response = await fetch('/api/convert-photo-to-url', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Device-ID': deviceId
                        },
                        body: JSON.stringify({
                            image: imageniaObj.base64,
                            filename: imageniaObj.filename
                        })
                    });
                    
                    const result = await response.json();
                    
                    if (result.success) {
                        // Actualizar el objeto con la URL generada
                        if (photoGallery[0] === imageniaObj) {
                            photoGallery[0].url = result.url;
                            photoGallery[0].file_id = result.file_id;
                            photoGallery[0].converted = true;
                            console.log(`✅ URL generada para foto: ${result.url.substring(0, 50)}...`);
                            updatePhotoGallery();
                        }
                    } else {
                        console.error('❌ Error al generar URL para foto:', result.error);
                    }
                } catch (error) {
                    console.error('❌ Error al convertir foto a URL:', error);
                }
            })();
            
            console.log('📸 Foto capturada (modo por defecto):', imageData.substring(0, 100) + '...'); // Debug
        }
        
        // Ocultar imagen por defecto
        const defaultImageContainer = document.querySelector('.default-image-container');
        if (defaultImageContainer) {
            defaultImageContainer.style.display = 'none';
        }
        
        // Mostrar vista previa con galería
        updatePhotoGallery();
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

// Importar foto desde archivo - funciona igual que capturePhoto
function handlePhotoImport(event) {
    try {
        const files = Array.from(event.target.files);
        if (files.length === 0) {
            return;
        }
        
        // Validar que todos sean imágenes
        const invalidFiles = files.filter(file => !file.type.startsWith('image/'));
        if (invalidFiles.length > 0) {
            showStatus('Algunos archivos no son imágenes válidas', 'error');
            return;
        }
        
        console.log(`Importando ${files.length} foto(s) desde archivo...`);
        
        // Procesar todas las fotos
        let processedCount = 0;
        const totalFiles = files.length;
        
        files.forEach((file, index) => {
            const reader = new FileReader();
            
            reader.onload = function(e) {
                const imageData = e.target.result;
                
                // Verificar el modo: 'reportar' o 'añadir'
                if (photoMode === 'reportar') {
                    // Modo "Reportar Incidencia": establecer como imagenia
                    if (index === 0) {
                        // Esta es imagenia - borrar la anterior y establecer la nueva
                        imagenia = imageData;
                        currentPhotoData = imageData; // Mantener para compatibilidad
                    }
                    
                    // Añadir a la galería solo si NO es la primera (la primera es imagenia)
                    if (index > 0) {
                        addPhotoToGallery(imageData);
                    }
                } else if (photoMode === 'añadir') {
                    // Modo "Añadir Fotos": solo añadir a la galería, NO tocar imagenia
                    addPhotoToGallery(imageData);
                } else {
                    // Modo no definido: por defecto, establecer como imagenia
                    if (index === 0) {
                        imagenia = imageData;
                        currentPhotoData = imageData;
                    }
                    if (index > 0) {
                        addPhotoToGallery(imageData);
                    }
                }
                
                processedCount++;
                
                // Cuando todas las fotos estén procesadas, hacer lo mismo que capturePhoto
                if (processedCount === totalFiles) {
                    if (photoMode === 'reportar') {
                        console.log('📸 Imagenia importada desde Reportar Incidencia');
                        
                        // Normalizar imagenia a objeto si es necesario
                        const imageniaObj = typeof imagenia === 'string' ? {
                            base64: imagenia,
                            url: null,
                            file_id: null,
                            filename: `main_photo_${Date.now()}.jpg`,
                            converted: false
                        } : imagenia;
                        
                        // Limpiar solo las fotos adicionales (mantener fotos adicionales existentes)
                        // La galería mostrará: imagenia + fotos adicionales
                        const hadAdditionalPhotos = photoGallery.length > 0 && 
                            (typeof photoGallery[0] === 'string' ? photoGallery[0] !== imagenia : 
                             (typeof photoGallery[0] === 'object' ? photoGallery[0].base64 !== imagenia : true));
                        const additionalPhotos = hadAdditionalPhotos ? photoGallery.slice(1) : [];
                        
                        // Establecer nueva galería: imagenia + fotos adicionales existentes
                        photoGallery = [imageniaObj, ...additionalPhotos];
                        
                        // Generar URL para imagenia en segundo plano
                        (async () => {
                            try {
                                console.log('🔄 Convirtiendo imagenia importada a URL...');
                                const response = await fetch('/api/convert-photo-to-url', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'X-Device-ID': deviceId
                                    },
                                    body: JSON.stringify({
                                        image: imageniaObj.base64,
                                        filename: imageniaObj.filename
                                    })
                                });
                                
                                const result = await response.json();
                                
                                if (result.success) {
                                    // Actualizar el objeto con la URL generada
                                    if (photoGallery[0] === imageniaObj) {
                                        photoGallery[0].url = result.url;
                                        photoGallery[0].file_id = result.file_id;
                                        photoGallery[0].converted = true;
                                        console.log(`✅ URL generada para imagenia importada: ${result.url.substring(0, 50)}...`);
                                        updatePhotoGallery();
                                    }
                                } else {
                                    console.error('❌ Error al generar URL para imagenia importada:', result.error);
                                }
                            } catch (error) {
                                console.error('❌ Error al convertir imagenia importada a URL:', error);
                            }
                        })();
                    } else if (photoMode === 'añadir') {
                        console.log('📸 Fotos adicionales importadas desde Añadir Fotos');
                    } else {
                        console.log('📸 Fotos importadas (modo por defecto)');
                        if (imagenia) {
                            // Normalizar imagenia a objeto si es necesario
                            const imageniaObj = typeof imagenia === 'string' ? {
                                base64: imagenia,
                                url: null,
                                file_id: null,
                                filename: `main_photo_${Date.now()}.jpg`,
                                converted: false
                            } : imagenia;
                            
                            if (photoGallery.length > 0 && 
                                (typeof photoGallery[0] === 'string' ? photoGallery[0] !== imagenia : 
                                 (typeof photoGallery[0] === 'object' ? photoGallery[0].base64 !== imagenia : true))) {
                                photoGallery = [imageniaObj, ...photoGallery];
                            } else if (photoGallery.length === 0) {
                                photoGallery = [imageniaObj];
                            }
                            
                            // Generar URL para imagenia en segundo plano
                            (async () => {
                                try {
                                    console.log('🔄 Convirtiendo imagenia importada a URL...');
                                    const response = await fetch('/api/convert-photo-to-url', {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json',
                                            'X-Device-ID': deviceId
                                        },
                                        body: JSON.stringify({
                                            image: imageniaObj.base64,
                                            filename: imageniaObj.filename
                                        })
                                    });
                                    
                                    const result = await response.json();
                                    
                                    if (result.success) {
                                        // Actualizar el objeto con la URL generada
                                        if (photoGallery[0] === imageniaObj) {
                                            photoGallery[0].url = result.url;
                                            photoGallery[0].file_id = result.file_id;
                                            photoGallery[0].converted = true;
                                            console.log(`✅ URL generada para imagenia importada: ${result.url.substring(0, 50)}...`);
                                            updatePhotoGallery();
                                        }
                                    } else {
                                        console.error('❌ Error al generar URL para imagenia importada:', result.error);
                                    }
                                } catch (error) {
                                    console.error('❌ Error al convertir imagenia importada a URL:', error);
                                }
                            })();
                        }
                    }
                    
                    // Ocultar imagen por defecto
                    const defaultImageContainer = document.querySelector('.default-image-container');
                    if (defaultImageContainer) {
                        defaultImageContainer.style.display = 'none';
                    }
                    
                    // Mostrar vista previa con galería
                    updatePhotoGallery();
                    elements.photoPreview.style.display = 'block';
                    
                    // Mostrar botón de enviar incidencia
                    if (elements.sendIncidenceBtn) {
                        elements.sendIncidenceBtn.style.display = 'flex';
                    }
                    
                    // Cambiar botones - igual que capturePhoto
                    elements.capturePhotoBtn.style.display = 'none';
                    if (elements.importPhotoBtn) {
                        elements.importPhotoBtn.style.display = 'none';
                    }
                    elements.retakePhotoBtn.style.display = 'flex';
                    
                    showStatus(`${totalFiles} foto(s) importada(s). Revisa la vista previa.`, 'success');
                    
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
                }
            };
            
            reader.onerror = function() {
                showStatus('Error al leer el archivo de imagen', 'error');
                console.error('Error al leer archivo');
            };
            
            // Leer el archivo como Data URL (base64)
            reader.readAsDataURL(file);
        });
        
    } catch (error) {
        console.error('Error al importar foto:', error);
        showStatus('Error al importar foto: ' + error.message, 'error');
    }
}

// Manejar múltiples fotos seleccionadas
function handleMultiplePhotos(event) {
    try {
        console.log('📸 handleMultiplePhotos llamada', event);
        const files = Array.from(event.target.files);
        console.log('📸 Archivos seleccionados:', files.length);
        
        if (files.length === 0) {
            console.log('⚠️ No se seleccionaron archivos');
            return;
        }
        
        // Validar que todos sean imágenes
        const invalidFiles = files.filter(file => !file.type.startsWith('image/'));
        if (invalidFiles.length > 0) {
            showStatus('Algunos archivos no son imágenes válidas', 'error');
            return;
        }
        
        console.log(`📸 Añadiendo ${files.length} foto(s) a la galería...`);
        
        // Procesar cada archivo
        let processedCount = 0;
        let hasError = false;
        
        files.forEach((file, index) => {
            const reader = new FileReader();
            
            reader.onload = function(e) {
                try {
                    const imageData = e.target.result;
                    console.log(`📸 Foto ${index + 1}/${files.length} procesada correctamente`);
                    
                    // Verificar el modo: 'reportar' o 'añadir'
                    // handleMultiplePhotos se usa desde "Añadir Fotos", así que siempre añadir
                    addPhotoToGallery(imageData);
                    processedCount++;
                    
                    console.log(`📸 Procesadas: ${processedCount}/${files.length}`);
                    
                    if (processedCount === files.length && !hasError) {
                        console.log('📸 Todas las fotos adicionales procesadas, actualizando UI...');
                        
                        // Ocultar imagen por defecto
                        const defaultImageContainer = document.querySelector('.default-image-container');
                        if (defaultImageContainer) {
                            defaultImageContainer.style.display = 'none';
                        }
                        
                        // Mostrar vista previa con galería
                        updatePhotoGallery();
                        elements.photoPreview.style.display = 'block';
                        
                        // Mostrar botón de enviar incidencia
                        if (elements.sendIncidenceBtn) {
                            elements.sendIncidenceBtn.style.display = 'flex';
                        }
                        
                        showStatus(`${files.length} foto(s) adicional(es) añadida(s) a la galería`, 'success');
                        
                        // Detener cámara si está activa
                        stopPhotoCamera();
                        
                        // Cerrar modal para mostrar la vista previa con el botón de enviar incidencia
                        setTimeout(() => {
                            closePhotoModal();
                        }, 500);
                        
                        // Limpiar el input para permitir seleccionar las mismas fotos de nuevo
                        if (event.target === elements.photoFileInput) {
                            elements.photoFileInput.value = '';
                        } else if (event.target === elements.multiplePhotosInput) {
                            elements.multiplePhotosInput.value = '';
                        }
                    }
                } catch (error) {
                    console.error(`Error procesando foto ${index + 1}:`, error);
                    hasError = true;
                }
            };
            
            reader.onerror = function() {
                console.error(`Error al leer el archivo ${file.name}`);
                showStatus(`Error al leer ${file.name}`, 'error');
                hasError = true;
            };
            
            reader.readAsDataURL(file);
        });
        
    } catch (error) {
        console.error('Error al manejar múltiples fotos:', error);
        showStatus('Error al añadir fotos: ' + error.message, 'error');
    }
}

// Añadir una foto a la galería y generar URL inmediatamente
async function addPhotoToGallery(imageData) {
    try {
        // Normalizar: si es string, crear objeto; si ya es objeto, usarlo
        let photoObj;
        if (typeof imageData === 'string') {
            photoObj = {
                base64: imageData,
                url: null,
                file_id: null,
                filename: `photo_${Date.now()}_${photoGallery.length + 1}.jpg`,
                converted: false
            };
        } else {
            // Ya es objeto, usar directamente
            photoObj = imageData;
        }
        
        // Añadir a la galería primero (para mostrar inmediatamente)
        photoGallery.push(photoObj);
        console.log(`📸 Foto añadida. Total: ${photoGallery.length}`);
        
        // Actualizar visualización inmediatamente
        updatePhotoGallery();
        
        // Convertir a URL en segundo plano (no bloquea la UI)
        console.log('🔄 Convirtiendo foto a URL...');
        try {
            const response = await fetch('/api/convert-photo-to-url', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Device-ID': deviceId
                },
                body: JSON.stringify({
                    image: photoObj.base64,
                    filename: photoObj.filename
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                // Actualizar el objeto con la URL generada
                const index = photoGallery.length - 1;
                if (photoGallery[index] === photoObj) {
                    photoGallery[index].url = result.url;
                    photoGallery[index].file_id = result.file_id;
                    photoGallery[index].converted = true;
                    console.log(`✅ URL generada para foto ${index + 1}: ${result.url.substring(0, 50)}...`);
                    
                    // Actualizar visualización para mostrar el indicador de URL generada
                    updatePhotoGallery();
                }
            } else {
                console.error('❌ Error al generar URL:', result.error);
                // Marcar como no convertida pero mantener en la galería
                const index = photoGallery.length - 1;
                if (photoGallery[index] === photoObj) {
                    photoGallery[index].converted = false;
                }
            }
        } catch (error) {
            console.error('❌ Error al convertir foto a URL:', error);
            // Si falla, mantener la foto con base64 para convertirla después
            const index = photoGallery.length - 1;
            if (photoGallery[index] === photoObj) {
                photoGallery[index].converted = false;
            }
        }
        
    } catch (error) {
        console.error('❌ Error al añadir foto a galería:', error);
        // Si falla completamente, añadir como string para compatibilidad
        if (typeof imageData === 'string') {
            photoGallery.push(imageData);
        }
        updatePhotoGallery();
    }
}

// Actualizar la visualización de la galería
function updatePhotoGallery() {
    if (!elements.photoGallery) {
        return;
    }
    
    // Limpiar la galería
    elements.photoGallery.innerHTML = '';
    
    // Normalizar imagenia si es necesario
    if (imagenia && typeof imagenia === 'string') {
        // Convertir imagenia a objeto si es necesario
        const imageniaObj = {
            base64: imagenia,
            url: null,
            file_id: null,
            filename: `main_photo_${Date.now()}.jpg`,
            converted: false
        };
        
        // Si imagenia no está en la galería o está como string, normalizarla
        if (photoGallery.length === 0 || 
            (typeof photoGallery[0] === 'string' && photoGallery[0] === imagenia) ||
            (typeof photoGallery[0] === 'object' && photoGallery[0].base64 !== imagenia)) {
            photoGallery.unshift(imageniaObj);
        } else if (typeof photoGallery[0] === 'object' && photoGallery[0].base64 === imagenia) {
            // Ya está normalizada, no hacer nada
        }
    } else if (imagenia && typeof imagenia === 'object') {
        // imagenia ya es objeto, asegurarse de que esté al inicio
        if (photoGallery.length === 0 || photoGallery[0] !== imagenia) {
            photoGallery.unshift(imagenia);
        }
    }
    
    if (photoGallery.length === 0) {
        return;
    }
    
    // Crear elementos para cada foto
    photoGallery.forEach((photoItem, index) => {
        const galleryItem = document.createElement('div');
        galleryItem.className = 'photo-gallery-item';
        galleryItem.dataset.index = index;
        
        const img = document.createElement('img');
        // Usar base64 para mostrar (más rápido que cargar desde URL)
        const imageSrc = typeof photoItem === 'string' ? photoItem : photoItem.base64;
        img.src = imageSrc;
        img.alt = `Foto ${index + 1}`;
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-photo-btn';
        removeBtn.innerHTML = '<i class="fas fa-times"></i>';
        removeBtn.title = 'Eliminar foto';
        removeBtn.onclick = () => removePhotoFromGallery(index);
        
        galleryItem.appendChild(img);
        galleryItem.appendChild(removeBtn);
        
        // Indicador de estado de conversión (URL generada)
        if (typeof photoItem === 'object' && photoItem.converted && photoItem.url) {
            const statusBadge = document.createElement('div');
            statusBadge.className = 'url-status-badge';
            statusBadge.textContent = '✓';
            statusBadge.title = 'URL generada - Lista para enviar';
            statusBadge.style.cssText = 'position: absolute; top: 5px; right: 5px; background: #4CAF50; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; z-index: 10;';
            galleryItem.appendChild(statusBadge);
        } else if (typeof photoItem === 'object' && !photoItem.converted) {
            // Mostrar indicador de "convirtiendo..."
            const statusBadge = document.createElement('div');
            statusBadge.className = 'url-status-badge';
            statusBadge.textContent = '⏳';
            statusBadge.title = 'Generando URL...';
            statusBadge.style.cssText = 'position: absolute; top: 5px; right: 5px; background: #FF9800; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; z-index: 10;';
            galleryItem.appendChild(statusBadge);
        }
        
        // Añadir indicador "AI" a la primera foto (imagenia)
        if (index === 0 && imagenia) {
            const aiBadge = document.createElement('div');
            aiBadge.className = 'ai-badge';
            aiBadge.textContent = 'AI';
            aiBadge.title = 'Esta foto se enviará a la IA';
            galleryItem.appendChild(aiBadge);
        }
        
        elements.photoGallery.appendChild(galleryItem);
    });
    
    // Actualizar contador
    if (elements.photoCount) {
        elements.photoCount.textContent = photoGallery.length;
    }
    
    // Mostrar/ocultar botones de navegación
    if (elements.prevPhotoBtn && elements.nextPhotoBtn) {
        if (photoGallery.length > 1) {
            elements.prevPhotoBtn.style.display = 'flex';
            elements.nextPhotoBtn.style.display = 'flex';
        } else {
            elements.prevPhotoBtn.style.display = 'none';
            elements.nextPhotoBtn.style.display = 'none';
        }
    }
    
    // Scroll a la primera foto
    if (elements.photoGallery) {
        elements.photoGallery.scrollLeft = 0;
    }
    
    currentPhotoIndex = 0;
}

// Navegar por la galería
function navigateGallery(direction) {
    if (photoGallery.length === 0) {
        return;
    }
    
    currentPhotoIndex += direction;
    
    if (currentPhotoIndex < 0) {
        currentPhotoIndex = photoGallery.length - 1;
    } else if (currentPhotoIndex >= photoGallery.length) {
        currentPhotoIndex = 0;
    }
    
    // Scroll a la foto actual
    if (elements.photoGallery) {
        const galleryItem = elements.photoGallery.querySelector(`[data-index="${currentPhotoIndex}"]`);
        if (galleryItem) {
            galleryItem.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
        }
    }
}

// Eliminar una foto de la galería (con rollback si tiene URL generada)
async function removePhotoFromGallery(index) {
    if (index < 0 || index >= photoGallery.length) {
        return;
    }
    
    const photoObj = photoGallery[index];
    
    // Si tiene URL generada, hacer rollback (eliminarla del servidor)
    if (typeof photoObj === 'object' && photoObj.file_id) {
        try {
            console.log(`🗑️ Eliminando foto del servidor (rollback): ${photoObj.file_id}`);
            const response = await fetch('/api/delete-photo-url', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Device-ID': deviceId
                },
                body: JSON.stringify({
                    file_id: photoObj.file_id,
                    url: photoObj.url
                })
            });
            
            const result = await response.json();
            if (result.success) {
                console.log('✅ Rollback de foto completado');
            } else {
                console.warn('⚠️ Error en rollback de foto:', result.error);
            }
        } catch (error) {
            console.error('⚠️ Error al eliminar foto del servidor (rollback):', error);
            // Continuar aunque falle el rollback
        }
    }
    
    photoGallery.splice(index, 1);
    console.log(`📸 Foto eliminada. Total: ${photoGallery.length}`);
    
    // Actualizar la galería
    updatePhotoGallery();
    
    // Si no quedan fotos, ocultar la vista previa
    if (photoGallery.length === 0) {
        elements.photoPreview.style.display = 'none';
        
        // Ocultar botón de enviar incidencia
        if (elements.sendIncidenceBtn) {
            elements.sendIncidenceBtn.style.display = 'none';
        }
        
        // Mostrar imagen por defecto
        const defaultImageContainer = document.querySelector('.default-image-container');
        if (defaultImageContainer) {
            defaultImageContainer.style.display = 'block';
        }
        
        // Limpiar currentPhotoData para compatibilidad
        currentPhotoData = null;
    }
}

// Volver a tomar foto
function retakePhoto() {
    currentPhotoData = null;
    imagenia = null; // Limpiar también imagenia
    photoGallery = [];
    currentPhotoIndex = 0;
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
    
    // Verificar que tenemos fotos para enviar
    const photosToSend = photoGallery.length > 0 ? photoGallery : (currentPhotoData ? [currentPhotoData] : []);
    if (photosToSend.length === 0) {
        showStatus('No hay fotos para enviar', 'error');
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
        
        // Componer imágenes: usar URLs ya generadas si existen, sino usar base64 (fallback)
        const images = photosToSend.map((photoObj, index) => {
            // Si es objeto con URL, usar la URL; si no, usar base64 (fallback)
            if (typeof photoObj === 'object' && photoObj.url) {
                return {
                    file: photoObj.url, // Ya es URL, no necesita conversión
                    name: photoObj.filename || (hasQRData 
                        ? `incidencia_qr_${Date.now()}_${index + 1}.jpg`
                        : `incidencia_parada_${pendingIncidenceData.stopNumber}_${Date.now()}_${index + 1}.jpg`),
                    file_id: photoObj.file_id // Preservar file_id para rollback
                };
            } else {
                // Fallback: usar base64 (se convertirá en el backend)
                const base64Data = typeof photoObj === 'string' ? photoObj : photoObj.base64;
                return {
                    file: base64Data,
                    name: (typeof photoObj === 'object' && photoObj.filename) ? photoObj.filename : (hasQRData 
                        ? `incidencia_qr_${Date.now()}_${index + 1}.jpg`
                        : `incidencia_parada_${pendingIncidenceData.stopNumber}_${Date.now()}_${index + 1}.jpg`)
                };
            }
        });
        
        if (hasQRData) {
            // Usar datos de QR
            const qrId = extractQRId(currentQRData);
            incidencePayload = {
                state: 'PENDING',
                incidenceType: '65a1b2c3d4e5f6789012345',
                observation: currentQRData,
                description: 'Incidencia reportada con QR',
                resource: qrId,
                image: images,
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
                image: images,
                audio: []
            };
        }
        
        console.log('📋 Enviando incidencia con foto:', incidencePayload);
        console.log('🔍 Datos de audio pendientes:', pendingIncidenceData);
        console.log('📸 Total de fotos a enviar:', photosToSend.length);
        console.log('📸 Fotos en galería:', photoGallery.length);
        
        // Enviar incidencia en segundo plano (no bloquea la UI)
        const successMessage = hasQRData 
            ? 'Incidencia enviada con QR'
            : `Incidencia enviada: Parada ${pendingIncidenceData.stopNumber} - ${pendingIncidenceData.description}`;
        
        sendIncidenceInBackground(
            incidencePayload,
            successMessage,
            null,
            () => {
                // Limpiar completamente la pantalla después del envío exitoso
                resetUIAfterIncidenceSent();
            }
        );
        
    } catch (error) {
        showStatus('Error al enviar incidencia: ' + error.message, 'error');
        console.error('❌ Error al enviar incidencia:', error);
    }
}

// Procesar imagen con IA cuando no hay QR ni audio
async function processImageWithAI() {
    try {
        // Usar solo la foto principal para la IA
        const photoForAI = imagenia || currentPhotoData;
        
        if (!photoForAI) {
            showStatus('No hay foto para procesar', 'error');
            return;
        }
        
        console.log('🤖 Iniciando procesamiento de imagen con IA...');
        console.log('📸 Usando foto principal para IA');
        showStatus('Procesando imagen con IA...', 'info');
        
        // Mostrar modal de procesamiento
        showAIResultsModal();
        elements.aiProcessingStatus.style.display = 'block';
        elements.aiResultsForm.style.display = 'none';
        elements.confirmAIResultsBtn.style.display = 'none';
        
        console.log('📸 Enviando imagen principal a IA...');
        console.log('📸 Tipo de imagen:', typeof photoForAI);
        console.log('📸 Longitud de imagen:', photoForAI ? photoForAI.length : 'N/A');
        console.log('📸 Primeros 100 caracteres:', photoForAI ? photoForAI.substring(0, 100) : 'N/A');
        //const timeoutId = setTimeout(() => controller.abort(), 200000);
        // Enviar imagen principal al backend para procesar con LM Studio
        const response = await fetch('/api/process-image-ai', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Device-ID': deviceId
            },
            body: JSON.stringify({
                image: photoForAI
            })
        });
        //clearTimeout(timeoutId); // Limpiar timeout si la respuesta llega a tiempo
        
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
        
        // Obtener todas las fotos de la galería
        const photosToSend = photoGallery.length > 0 ? photoGallery : (currentPhotoData ? [currentPhotoData] : []);
        
        // Componer imágenes: usar URLs ya generadas si existen, sino usar base64 (fallback)
        const images = photosToSend.map((photoObj, index) => {
            // Si es objeto con URL, usar la URL; si no, usar base64 (fallback)
            if (typeof photoObj === 'object' && photoObj.url) {
                return {
                    file: photoObj.url, // Ya es URL, no necesita conversión
                    name: photoObj.filename || `incidencia_parada_${pendingIncidenceData.stopNumber}_${Date.now()}_${index + 1}.jpg`,
                    file_id: photoObj.file_id // Preservar file_id para rollback
                };
            } else {
                // Fallback: usar base64 (se convertirá en el backend)
                const base64Data = typeof photoObj === 'string' ? photoObj : photoObj.base64;
                return {
                    file: base64Data,
                    name: (typeof photoObj === 'object' && photoObj.filename) ? photoObj.filename : `incidencia_parada_${pendingIncidenceData.stopNumber}_${Date.now()}_${index + 1}.jpg`
                };
            }
        });
        
        // Crear payload de la incidencia
        const incidencePayload = {
            state: 'PENDING',
            incidenceType: '65a1b2c3d4e5f6789012345',
            observation: pendingIncidenceData.fullText,
            description: pendingIncidenceData.description,
            resource: `PARADA_${pendingIncidenceData.stopNumber}`,
            image: images,
            audio: []
        };
        
        console.log('📋 Enviando incidencia con datos de IA:', incidencePayload);
        
        // Enviar incidencia en segundo plano (no bloquea la UI)
        sendIncidenceInBackground(
            incidencePayload,
            `Incidencia enviada: Parada ${stopNumber} - ${description}`,
            null,
            () => {
                // Limpiar completamente la pantalla después del envío exitoso
                resetUIAfterIncidenceSent();
            }
        );
        
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
// WAKE LOCK - MANTENER PANTALLA ACTIVA
// ========================================

let wakeLock = null;

// Activar Wake Lock para mantener la pantalla activa
async function requestWakeLock() {
    try {
        // Verificar si el navegador soporta Wake Lock
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('✅ Wake Lock activado - Pantalla se mantendrá activa');
            
            // Manejar cuando el wake lock se libera (por ejemplo, cuando el usuario cambia de pestaña)
            wakeLock.addEventListener('release', async () => {
                console.log('⚠️ Wake Lock liberado');
                // Si hay grabación automática en curso, intentar reactivarlo
                if (isAutoRecording || (mediaRecorder && mediaRecorder.state === 'recording')) {
                    console.log('🔄 Intentando reactivar wake lock durante grabación...');
                    try {
                        wakeLock = null; // Resetear antes de reactivar
                        await requestWakeLock();
                    } catch (error) {
                        console.error('❌ No se pudo reactivar wake lock:', error);
                    }
                }
            });
        } else {
            console.log('⚠️ Wake Lock no soportado en este navegador');
        }
    } catch (error) {
        console.error('❌ Error al activar Wake Lock:', error);
        // Intentar activar la pantalla de otra manera
        try {
            // Vibrar para despertar el dispositivo
            if ('vibrate' in navigator) {
                navigator.vibrate([200, 100, 200]);
            }
        } catch (vibrateError) {
            console.log('No se pudo vibrar:', vibrateError);
        }
    }
}

// Liberar Wake Lock
async function releaseWakeLock() {
    if (wakeLock) {
        try {
            await wakeLock.release();
            wakeLock = null;
            console.log('✅ Wake Lock liberado');
        } catch (error) {
            console.error('❌ Error al liberar Wake Lock:', error);
        }
    }
}

// Manejar cuando la página se oculta (liberar wake lock solo si no hay grabación en curso)
document.addEventListener('visibilitychange', async () => {
    if (document.hidden && wakeLock) {
        // NO liberar wake lock si hay grabación automática en curso
        if (isAutoRecording || (mediaRecorder && mediaRecorder.state === 'recording')) {
            console.log('⚠️ Página oculta pero manteniendo wake lock durante grabación...');
            return;
        }
        await releaseWakeLock();
    } else if (!document.hidden && !wakeLock) {
        // Si la página vuelve a ser visible y no hay wake lock, reactivarlo si hay grabación en curso
        if (isAutoRecording || (mediaRecorder && mediaRecorder.state === 'recording')) {
            console.log('🔄 Reactivando wake lock después de volver a la página...');
            await requestWakeLock();
        }
    }
});

// ========================================
// RECONOCIMIENTO DE VOZ AUTOMÁTICO
// ========================================

let voiceRecognition = null;
let voiceRecognitionTimeout = null;
let isListeningForCommand = false;
let isManualRecording = false; // Flag para indicar que se está grabando manualmente
let voiceRecognitionDisabled = false; // Flag para deshabilitar completamente el reconocimiento de voz

// Inicializar reconocimiento de voz para escuchar comandos
function initVoiceCommandRecognition() {
    // NO iniciar si está deshabilitado
    if (voiceRecognitionDisabled) {
        console.log('🚫 Reconocimiento de voz deshabilitado');
        return;
    }
    
    // Verificar si el navegador soporta reconocimiento de voz
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        console.log('⚠️ El navegador no soporta reconocimiento de voz');
        return;
    }
    
    // Solo activar si el usuario está autenticado
    if (!isAuthenticated) {
        console.log('ℹ️ Usuario no autenticado - No se activa reconocimiento de voz');
        return;
    }
    
    // No activar si ya hay una grabación en curso
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        console.log('ℹ️ Ya hay una grabación en curso - No se activa reconocimiento de voz');
        return;
    }
    
    // No activar si se está grabando manualmente
    if (isManualRecording) {
        console.log('ℹ️ Grabación manual en curso - No se activa reconocimiento de voz');
        return;
    }
    
    // No activar si hay grabación automática en curso
    if (isAutoRecording) {
        console.log('ℹ️ Grabación automática en curso - No se activa reconocimiento de voz');
        return;
    }
    
    // No activar si el modal de audio está abierto
    if (elements.audioModal && elements.audioModal.style.display === 'block') {
        console.log('ℹ️ Modal de audio abierto - No se activa reconocimiento de voz');
        return;
    }
    
    // No activar si ya se está escuchando
    if (isListeningForCommand) {
        console.log('ℹ️ Ya se está escuchando un comando');
        return;
    }
    
    try {
        voiceRecognition = new SpeechRecognition();
        voiceRecognition.lang = 'es-ES'; // Español
        voiceRecognition.continuous = false; // No continuo, solo una vez
        voiceRecognition.interimResults = false; // Solo resultados finales
        
        // Comandos que activarán la grabación
        const commands = [
            'crear incidencia',
            'crear una incidencia',
            'crea incidencia',
            'crea una incidencia',
            'reportar incidencia',
            'reportar una incidencia',
            'nueva incidencia',
            'grabar incidencia',
            'grabar una incidencia'
        ];
        
        voiceRecognition.onstart = () => {
            console.log('🎤 Reconocimiento de voz iniciado - Escuchando comando...');
            isListeningForCommand = true;
            
            // Activar Wake Lock para mantener la pantalla activa
            requestWakeLock();
            
            // Mostrar indicador visual opcional
            showStatus('Escuchando... Di "Crear incidencia"', 'info');
        };
        
        voiceRecognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript.toLowerCase().trim();
            console.log('🎤 Comando detectado:', transcript);
            
            // Verificar si el comando coincide con alguno de los comandos esperados
            const commandDetected = commands.some(cmd => 
                transcript.includes(cmd.toLowerCase())
            );
            
            if (commandDetected) {
                console.log('✅ Comando reconocido - Iniciando grabación automática...');
                stopVoiceCommandRecognition();
                
                // Iniciar grabación automática directamente (sin abrir modal)
                setTimeout(() => {
                    if (isAuthenticated) {
                        console.log('🎤 Iniciando grabación automática con detección de silencio...');
                        startAutoRecording(); // Función para grabación automática
                    }
                }, 300);
            } else {
                console.log('ℹ️ Comando no reconocido:', transcript);
            }
        };
        
        voiceRecognition.onerror = (event) => {
            console.error('❌ Error en reconocimiento de voz:', event.error);
            stopVoiceCommandRecognition();
            
            // Liberar Wake Lock si no hay grabación en curso
            if (!mediaRecorder || mediaRecorder.state !== 'recording') {
                releaseWakeLock();
            }
            
            // No mostrar error si el usuario no habló (error común)
            if (event.error !== 'no-speech' && event.error !== 'aborted') {
                // showStatus('Error en reconocimiento de voz', 'error');
            }
        };
        
        voiceRecognition.onend = () => {
            console.log('🎤 Reconocimiento de voz finalizado');
            isListeningForCommand = false;
            
            // NO reactivar si está deshabilitado o hay condiciones que lo impiden
            if (voiceRecognitionDisabled || 
                isManualRecording || 
                isAutoRecording || // No reactivar si hay grabación automática en curso
                (elements.audioModal && elements.audioModal.style.display === 'block') ||
                (mediaRecorder && mediaRecorder.state === 'recording')) {
                console.log('🚫 No se reactiva reconocimiento de voz');
                // Liberar Wake Lock si no hay grabación en curso
                if (!mediaRecorder || mediaRecorder.state !== 'recording') {
                    releaseWakeLock();
                }
                return;
            }
            
            // Liberar Wake Lock si no hay grabación en curso
            if (!mediaRecorder || mediaRecorder.state !== 'recording') {
                releaseWakeLock();
            }
            
            // Solo reactivar si está habilitado y todas las condiciones son seguras
            setTimeout(() => {
                if (!voiceRecognitionDisabled &&
                    !isManualRecording && 
                    !isAutoRecording && // Asegurar que no hay grabación automática
                    (!elements.audioModal || elements.audioModal.style.display === 'none') &&
                    !isListeningForCommand &&
                    isAuthenticated &&
                    (!mediaRecorder || mediaRecorder.state !== 'recording')) {
                    console.log('🔄 Reactivando reconocimiento de voz...');
                    initVoiceCommandRecognition();
                }
            }, 2000); // Aumentar a 2 segundos para dar más tiempo
        };
        
        // Iniciar reconocimiento
        voiceRecognition.start();
        
        // Configurar timeout para detener después de X segundos
        const listenDuration = 5000; // 5 segundos
        voiceRecognitionTimeout = setTimeout(() => {
            console.log('⏱️ Tiempo de escucha agotado');
            stopVoiceCommandRecognition();
            
            // Liberar Wake Lock si no hay grabación en curso
            if (!mediaRecorder || mediaRecorder.state !== 'recording') {
                releaseWakeLock();
            }
        }, listenDuration);
        
    } catch (error) {
        console.error('❌ Error al inicializar reconocimiento de voz:', error);
        isListeningForCommand = false;
    }
}

// Detener reconocimiento de voz
function stopVoiceCommandRecognition() {
    console.log('🛑 Deteniendo reconocimiento de voz...');
    
    if (voiceRecognition) {
        try {
            // Intentar abortar primero (más agresivo) - esto libera el micrófono inmediatamente
            if (voiceRecognition.abort) {
                voiceRecognition.abort();
                console.log('✅ Reconocimiento de voz abortado');
            }
            // Luego detener
            try {
                voiceRecognition.stop();
                console.log('✅ Reconocimiento de voz detenido');
            } catch (stopError) {
                // Ignorar error si ya fue abortado
                console.log('ℹ️ Ya estaba detenido:', stopError);
            }
        } catch (error) {
            console.log('⚠️ Error al detener reconocimiento:', error);
        }
        
        // Eliminar todos los event listeners para evitar que se reactive
        try {
            voiceRecognition.onstart = null;
            voiceRecognition.onresult = null;
            voiceRecognition.onerror = null;
            voiceRecognition.onend = null;
        } catch (e) {
            console.log('⚠️ Error al limpiar listeners:', e);
        }
        
        voiceRecognition = null;
    }
    
    if (voiceRecognitionTimeout) {
        clearTimeout(voiceRecognitionTimeout);
        voiceRecognitionTimeout = null;
    }
    
    isListeningForCommand = false;
    
    // Liberar Wake Lock si no hay grabación en curso
    if (!mediaRecorder || mediaRecorder.state !== 'recording') {
        releaseWakeLock();
    }
    
    console.log('✅ Reconocimiento de voz completamente detenido');
}

// Activar reconocimiento de voz al cargar la app (solo si está autenticado)
function activateVoiceCommandOnLoad() {
    // Esperar a que la app esté completamente cargada
    setTimeout(() => {
        // Verificar múltiples condiciones antes de activar
        if (isAuthenticated && 
            !isListeningForCommand && 
            !isManualRecording &&
            !isAutoRecording &&
            !voiceRecognitionDisabled &&
            (!elements.audioModal || elements.audioModal.style.display === 'none') &&
            (!mediaRecorder || mediaRecorder.state !== 'recording')) {
            console.log('🚀 Activando reconocimiento de voz automático...');
            initVoiceCommandRecognition();
        } else {
            console.log('🚫 No se activa reconocimiento de voz:', {
                isAuthenticated,
                isListeningForCommand,
                isManualRecording,
                isAutoRecording,
                voiceRecognitionDisabled,
                audioModalOpen: elements.audioModal && elements.audioModal.style.display === 'block',
                recording: mediaRecorder && mediaRecorder.state === 'recording'
            });
        }
    }, 3000); // Esperar 3 segundos después de cargar para dar tiempo a que la app esté lista
}

// ========================================
// FUNCIONES DE GRABACIÓN DE AUDIO
// ========================================

// Función helper para obtener el mejor mimeType para MediaRecorder en el dispositivo
function getBestAudioMimeType() {
    const types = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg',
        'audio/mp4',
        'audio/wav'
    ];
    
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) {
            console.log(`✅ MimeType soportado: ${type}`);
            return type;
        }
    }
    
    console.log('⚠️ No se encontró mimeType específico, usando por defecto');
    return ''; // Usar el por defecto del navegador
}

// Iniciar grabación de audio
function startAudioRecording() {
    console.log('🎤 Abriendo modal de audio...');
    
    // DESHABILITAR COMPLETAMENTE el reconocimiento de voz ANTES de abrir el modal
    voiceRecognitionDisabled = true;
    
    // Detener reconocimiento de voz de forma agresiva
    stopVoiceCommandRecognition();
    
    // Marcar como grabación manual desde que se abre el modal
    isManualRecording = true;
    
    // Abrir el modal inmediatamente (sin esperas)
    elements.audioModal.style.display = 'block';
    resetAudioUI();
    
    console.log('✅ Modal de audio abierto - Reconocimiento de voz DESHABILITADO');
}

// Cerrar modal de audio
function closeAudioModal() {
    console.log('🚪 Cerrando modal de audio...');
    
    stopVoiceCommandRecognition(); // Detener reconocimiento de voz
    elements.audioModal.style.display = 'none';
    
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        stopRecording();
    }
    
    // Asegurarse de cerrar el stream si existe
    if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
    }
    
    // Resetear flags
    isManualRecording = false;
    
    // Esperar antes de reactivar el reconocimiento de voz
    setTimeout(() => {
        voiceRecognitionDisabled = false; // HABILITAR reconocimiento de voz de nuevo
        console.log('✅ Reconocimiento de voz HABILITADO de nuevo');
        
        // Reactivar solo si todas las condiciones son seguras
        if (isAuthenticated && 
            !isManualRecording && 
            (!elements.audioModal || elements.audioModal.style.display === 'none') &&
            (!mediaRecorder || mediaRecorder.state !== 'recording')) {
            console.log('🔄 Reactivando reconocimiento de voz después de cerrar modal...');
            setTimeout(() => {
                initVoiceCommandRecognition();
            }, 1000);
        }
    }, 1000);
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
    
    // Detener detección de silencio
    stopSilenceDetection();
    
    // Cerrar AudioContext
    if (audioContext) {
        audioContext.close().catch(e => console.log('⚠️ Error al cerrar audioContext:', e));
        audioContext = null;
        analyser = null;
    }
    
    // Resetear flags
    isAutoRecording = false;
    
    // Cerrar stream si existe
    if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
    }
}

// Detectar silencio en el audio
function startSilenceDetection() {
    if (!audioStream || !audioContext || !analyser) {
        console.log('⚠️ No se puede iniciar detección de silencio: falta stream o audioContext');
        return;
    }
    
    console.log('🔇 Iniciando detección de silencio...');
    
    // Configuración de detección de silencio (ajustada para móviles)
    // Umbral más bajo y duración más larga para evitar detenciones prematuras
    const SILENCE_THRESHOLD = 20; // Umbral de volumen más bajo (ajustable)
    const SILENCE_DURATION = 3000; // 3 segundos de silencio para detener (más tiempo)
    const MIN_RECORDING_TIME = 1000; // Mínimo 1 segundo de grabación antes de detectar silencio
    const CHECK_INTERVAL = 100; // Verificar cada 100ms
    
    lastSoundTime = Date.now();
    const recordingStartTime = Date.now();
    
    silenceDetectionInterval = setInterval(() => {
        if (!analyser || !mediaRecorder || mediaRecorder.state !== 'recording') {
            stopSilenceDetection();
            return;
        }
        
        // No detectar silencio hasta que haya pasado el tiempo mínimo de grabación
        const elapsedTime = Date.now() - recordingStartTime;
        if (elapsedTime < MIN_RECORDING_TIME) {
            return; // Continuar grabando sin detectar silencio
        }
        
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        
        // Calcular el volumen promedio
        const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
        
        // Si hay sonido (volumen por encima del umbral)
        if (average > SILENCE_THRESHOLD) {
            lastSoundTime = Date.now();
        } else {
            // Verificar si ha pasado suficiente tiempo sin sonido
            const silenceDuration = Date.now() - lastSoundTime;
            if (silenceDuration >= SILENCE_DURATION && lastSoundTime !== null) {
                console.log('🔇 Silencio detectado durante', silenceDuration, 'ms - Deteniendo grabación...');
                
                // Actualizar estado en el modal
                if (elements.autoRecordingStatus) {
                    elements.autoRecordingStatus.innerHTML = '<i class="fas fa-check-circle"></i> Procesando audio...';
                }
                
                stopSilenceDetection();
                stopRecording();
                
                // Procesar el audio automáticamente después de un breve delay
                setTimeout(() => {
                    processAutoRecordedAudio();
                }, 500);
            }
        }
    }, CHECK_INTERVAL);
}

// Detener detección de silencio
function stopSilenceDetection() {
    if (silenceDetectionInterval) {
        clearInterval(silenceDetectionInterval);
        silenceDetectionInterval = null;
        console.log('🛑 Detección de silencio detenida');
    }
    lastSoundTime = null;
}

// Procesar audio grabado automáticamente
async function processAutoRecordedAudio() {
    if (!audioBlob) {
        console.log('⚠️ No hay audio para procesar');
        return;
    }
    
    try {
        console.log('🤖 Procesando audio automáticamente...');
        
        // Actualizar estado en el modal
        if (elements.autoRecordingStatus) {
            elements.autoRecordingStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando audio...';
        }
        
        showStatus('Procesando audio...', 'info');
        
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
                        if (stopNumber && !stopNumber.toUpperCase().startsWith('P')) {
                            stopNumber = `P${stopNumber}`;
                        }
                    } else if (parsedDescription.numero_parada !== undefined && parsedDescription.numero_parada !== null) {
                        stopNumber = String(parsedDescription.numero_parada);
                        if (stopNumber && !stopNumber.toUpperCase().startsWith('P')) {
                            stopNumber = `P${stopNumber}`;
                        }
                    }
                    
                    // Extraer la incidencia del JSON parseado
                    if (parsedDescription.incidencia) {
                        description = String(parsedDescription.incidencia).trim();
                    }
                    
                    if (!description || description.trim() === '') {
                        console.log('⚠️ No se encontró "incidencia" en el JSON parseado');
                        description = '';
                    }
                } catch (e) {
                    // Si no es JSON válido, intentar extraer "incidencia" del string directamente
                    console.log('⚠️ description no es JSON válido, intentando extraer incidencia del string:', e);
                    
                    const incidenciaMatch = result.description.match(/"incidencia"\s*:\s*"([^"]+)"/i);
                    if (incidenciaMatch && incidenciaMatch[1]) {
                        description = incidenciaMatch[1].trim();
                        console.log('✅ Incidencia extraída del string JSON:', description);
                    } else {
                        if (!result.description.trim().startsWith('{')) {
                            description = result.description.trim();
                        } else {
                            description = '';
                        }
                    }
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
            
            showStatus('✅ Audio procesado correctamente. Puedes enviar la incidencia.', 'success');
            console.log('✅ Datos de audio almacenados:', pendingIncidenceData);
            
            // Actualizar botón de reportar incidencia
            updateReportButton();
            
            // Ocultar modal de grabación automática
            if (elements.autoRecordingModal) {
                elements.autoRecordingModal.style.display = 'none';
            }
            
        } else {
            console.error('❌ No se pudo convertir el audio a texto');
            showStatus('No se pudo convertir el audio a texto', 'error');
            
            // Ocultar modal de grabación automática
            if (elements.autoRecordingModal) {
                elements.autoRecordingModal.style.display = 'none';
            }
        }
        
        // Resetear flag de grabación automática
        isAutoRecording = false;
        
        // Liberar Wake Lock después de procesar el audio (solo en modo automático)
        releaseWakeLock();
        
        // Habilitar reconocimiento de voz de nuevo
        voiceRecognitionDisabled = false;
        
        // Reactivar reconocimiento de voz después de un tiempo
        setTimeout(() => {
            if (isAuthenticated && !isManualRecording && 
                (!mediaRecorder || mediaRecorder.state !== 'recording') &&
                (!elements.audioModal || elements.audioModal.style.display === 'none')) {
                console.log('🔄 Reactivando reconocimiento de voz después de procesar audio...');
                initVoiceCommandRecognition();
            }
        }, 3000);
        
    } catch (error) {
        console.error('❌ Error al procesar audio automáticamente:', error);
        showStatus('Error al procesar el audio: ' + error.message, 'error');
        
        // Ocultar modal de grabación automática
        if (elements.autoRecordingModal) {
            elements.autoRecordingModal.style.display = 'none';
        }
        
        isAutoRecording = false;
        voiceRecognitionDisabled = false;
        
        // Liberar Wake Lock después de procesar el audio (incluso si hay error)
        releaseWakeLock();
        
        // Reactivar reconocimiento de voz incluso si hay error
        setTimeout(() => {
            if (isAuthenticated && !isManualRecording && 
                (!mediaRecorder || mediaRecorder.state !== 'recording') &&
                (!elements.audioModal || elements.audioModal.style.display === 'none')) {
                console.log('🔄 Reactivando reconocimiento de voz después de error...');
                initVoiceCommandRecognition();
            }
        }, 3000);
    }
}

// Iniciar grabación automática (sin abrir modal)
async function startAutoRecording() {
    try {
        console.log('🎤 ===== INICIANDO GRABACIÓN AUTOMÁTICA =====');
        
        // Verificar si ya hay una grabación en curso
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            console.log('⚠️ Ya hay una grabación en curso');
            return;
        }
        
        // Establecer flag de grabación automática
        isAutoRecording = true;
        
        // Asegurarse de que el reconocimiento de voz esté completamente deshabilitado
        voiceRecognitionDisabled = true;
        stopVoiceCommandRecognition();
        
        // Cerrar cualquier stream anterior
        if (audioStream) {
            console.log('🔄 Cerrando stream anterior...');
            audioStream.getTracks().forEach(track => {
                track.stop();
            });
            audioStream = null;
        }
        
        // Cerrar AudioContext anterior si existe
        if (audioContext) {
            try {
                await audioContext.close();
            } catch (e) {
                console.log('⚠️ Error al cerrar audioContext anterior:', e);
            }
            audioContext = null;
        }
        
        console.log('🎤 Solicitando acceso al micrófono...');
        
        // Activar Wake Lock
        await requestWakeLock();
        
        // Solicitar acceso al micrófono
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });
        
        audioStream = stream;
        console.log('✅ Acceso al micrófono obtenido');
        
        // Crear AudioContext para detección de silencio
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            console.log('✅ AudioContext creado para detección de silencio');
        } catch (e) {
            console.error('⚠️ Error al crear AudioContext:', e);
            // Continuar sin detección de silencio
        }
        
        // Obtener el mejor mimeType para este dispositivo
        const mimeType = getBestAudioMimeType();
        const options = mimeType ? { mimeType: mimeType } : {};
        
        console.log('🎤 Creando MediaRecorder con opciones:', options);
        mediaRecorder = new MediaRecorder(stream, options);
        audioChunks = [];
        
        // Variable para almacenar el intervalo de verificación del wake lock
        let wakeLockCheckInterval = null;
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                console.log(`📦 Datos de audio recibidos: ${event.data.size} bytes`);
                audioChunks.push(event.data);
            } else {
                console.log('⚠️ Evento ondataavailable sin datos o tamaño 0');
            }
        };
        
        mediaRecorder.onstop = () => {
            console.log('🛑 MediaRecorder detenido');
            console.log(`📦 Total de chunks: ${audioChunks.length}, tamaño total: ${audioChunks.reduce((sum, chunk) => sum + chunk.size, 0)} bytes`);
            
            // Determinar el tipo de Blob basado en el mimeType usado
            let blobType = 'audio/webm'; // Por defecto
            if (mimeType) {
                if (mimeType.includes('webm')) {
                    blobType = 'audio/webm';
                } else if (mimeType.includes('ogg')) {
                    blobType = 'audio/ogg';
                } else if (mimeType.includes('mp4')) {
                    blobType = 'audio/mp4';
                } else if (mimeType.includes('wav')) {
                    blobType = 'audio/wav';
                }
            }
            
            audioBlob = new Blob(audioChunks, { type: blobType });
            console.log(`✅ Blob creado: tipo=${blobType}, tamaño=${audioBlob.size} bytes`);
            
            // Detener verificación periódica del wake lock
            if (wakeLockCheckInterval) {
                clearInterval(wakeLockCheckInterval);
                wakeLockCheckInterval = null;
            }
            
            // Detener detección de silencio
            stopSilenceDetection();
            
            // Cerrar AudioContext
            if (audioContext) {
                audioContext.close().catch(e => console.log('⚠️ Error al cerrar audioContext:', e));
                audioContext = null;
                analyser = null;
            }
            
            // Detener el stream
            if (audioStream) {
                audioStream.getTracks().forEach(track => track.stop());
                audioStream = null;
            }
            
            // Resetear flag de grabación manual
            isManualRecording = false;
            
            // NO liberar Wake Lock aquí en modo automático - se liberará después de procesar el audio
            // Solo liberar si NO es grabación automática
            if (!isAutoRecording) {
                releaseWakeLock();
            }
        };
        
        mediaRecorder.onerror = (event) => {
            console.error('❌ Error en MediaRecorder:', event.error);
            showStatus('Error durante la grabación: ' + (event.error?.message || 'Error desconocido'), 'error');
            stopSilenceDetection();
            isAutoRecording = false;
            voiceRecognitionDisabled = false;
            
            // Detener verificación periódica del wake lock
            if (wakeLockCheckInterval) {
                clearInterval(wakeLockCheckInterval);
                wakeLockCheckInterval = null;
            }
            
            // Liberar Wake Lock en caso de error
            releaseWakeLock();
        };
        
        // Iniciar grabación con timeslice para asegurar que se emitan eventos regularmente
        // En móviles, esto es crítico para capturar todos los datos
        const timeslice = 250; // Emitir datos cada 250ms
        mediaRecorder.start(timeslice);
        recordingStartTime = Date.now();
        
        console.log(`🎤 Grabación iniciada con timeslice de ${timeslice}ms`);
        
        // Verificar que el wake lock esté activo
        if (!wakeLock) {
            console.log('⚠️ Wake Lock no está activo, reactivando...');
            await requestWakeLock();
        }
        
        // Configurar verificación periódica del wake lock durante la grabación
        wakeLockCheckInterval = setInterval(async () => {
            if (isAutoRecording && mediaRecorder && mediaRecorder.state === 'recording') {
                // Verificar si el wake lock está activo
                // El wake lock puede liberarse automáticamente, así que verificamos si existe y no está liberado
                let wakeLockActive = false;
                try {
                    if (wakeLock) {
                        // Intentar acceder a la propiedad released (puede no existir en algunos navegadores)
                        wakeLockActive = wakeLock && !wakeLock.released;
                    }
                } catch (e) {
                    // Si hay error al verificar, asumir que no está activo
                    wakeLockActive = false;
                }
                
                if (!wakeLock || !wakeLockActive) {
                    console.log('⚠️ Wake Lock perdido durante grabación, reactivando...');
                    try {
                        wakeLock = null;
                        await requestWakeLock();
                        console.log('✅ Wake Lock reactivado correctamente');
                    } catch (error) {
                        console.error('❌ Error al reactivar wake lock:', error);
                    }
                }
            } else {
                // Detener verificación si ya no hay grabación automática
                if (wakeLockCheckInterval) {
                    clearInterval(wakeLockCheckInterval);
                    wakeLockCheckInterval = null;
                }
            }
        }, 2000); // Verificar cada 2 segundos
        
        // Mostrar modal de grabación automática
        if (elements.autoRecordingModal) {
            elements.autoRecordingModal.style.display = 'block';
            if (elements.autoRecordingStatus) {
                elements.autoRecordingStatus.innerHTML = '<i class="fas fa-circle" style="animation: blink 1s infinite;"></i> Escuchando...';
            }
        }
        
        // Mostrar indicador de grabación en el status
        showStatus('🎤 Grabando... Habla ahora. La grabación se detendrá automáticamente cuando dejes de hablar.', 'info');
        
        // Iniciar detección de silencio después de un breve delay
        if (audioContext && analyser) {
            setTimeout(() => {
                startSilenceDetection();
            }, 500);
        }
        
        console.log('🎤 Grabación automática iniciada correctamente');
        
    } catch (error) {
        console.error('❌ Error al iniciar grabación automática:', error);
        showStatus('Error al acceder al micrófono: ' + error.message, 'error');
        
        // Resetear flags
        isManualRecording = false;
        isAutoRecording = false;
        voiceRecognitionDisabled = false;
        
        // Ocultar modal de grabación automática
        if (elements.autoRecordingModal) {
            elements.autoRecordingModal.style.display = 'none';
        }
        
        // Detener detección de silencio
        stopSilenceDetection();
        
        // Liberar Wake Lock en caso de error
        releaseWakeLock();
        
        // Cerrar stream si se creó pero falló la grabación
        if (audioStream) {
            audioStream.getTracks().forEach(track => track.stop());
            audioStream = null;
        }
        
        // Cerrar AudioContext
        if (audioContext) {
            audioContext.close().catch(e => console.log('⚠️ Error al cerrar audioContext:', e));
            audioContext = null;
            analyser = null;
        }
        
        // Reactivar reconocimiento de voz después de un tiempo en caso de error
        setTimeout(() => {
            if (isAuthenticated && !isManualRecording && 
                (!mediaRecorder || mediaRecorder.state !== 'recording') &&
                (!elements.audioModal || elements.audioModal.style.display === 'none')) {
                console.log('🔄 Reactivando reconocimiento de voz después de error...');
                initVoiceCommandRecognition();
            }
        }, 2000);
    }
}

// Iniciar grabación
async function startRecording() {
    try {
        console.log('🎤 ===== INICIANDO GRABACIÓN =====');
        
        // Verificar si ya hay una grabación en curso
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            console.log('⚠️ Ya hay una grabación en curso');
            return;
        }
        
        // Asegurarse de que el reconocimiento de voz esté completamente deshabilitado
        voiceRecognitionDisabled = true;
        stopVoiceCommandRecognition();
        
        // Cerrar cualquier stream anterior
        if (audioStream) {
            console.log('🔄 Cerrando stream anterior...');
            audioStream.getTracks().forEach(track => {
                track.stop();
                console.log('✅ Track detenido:', track.kind);
            });
            audioStream = null;
        }
        
        console.log('🎤 Solicitando acceso al micrófono...');
        
        // Activar Wake Lock
        await requestWakeLock();
        
        // Solicitar acceso al micrófono directamente (sin esperas innecesarias)
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });
        
        audioStream = stream;
        console.log('✅ Acceso al micrófono obtenido');
        console.log('📊 Stream:', {
            active: stream.active,
            tracks: stream.getTracks().length,
            trackStates: stream.getTracks().map(t => ({
                kind: t.kind,
                enabled: t.enabled,
                readyState: t.readyState,
                muted: t.muted
            }))
        });
        
        // Obtener el mejor mimeType para este dispositivo
        const mimeType = getBestAudioMimeType();
        const options = mimeType ? { mimeType: mimeType } : {};
        
        console.log('🎤 Creando MediaRecorder con opciones:', options);
        mediaRecorder = new MediaRecorder(stream, options);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                console.log(`📦 Datos de audio recibidos: ${event.data.size} bytes`);
                audioChunks.push(event.data);
            } else {
                console.log('⚠️ Evento ondataavailable sin datos o tamaño 0');
            }
        };
        
        mediaRecorder.onstop = () => {
            console.log('🛑 MediaRecorder detenido');
            console.log(`📦 Total de chunks: ${audioChunks.length}, tamaño total: ${audioChunks.reduce((sum, chunk) => sum + chunk.size, 0)} bytes`);
            
            // Determinar el tipo de Blob basado en el mimeType usado
            let blobType = 'audio/webm'; // Por defecto
            if (mimeType) {
                if (mimeType.includes('webm')) {
                    blobType = 'audio/webm';
                } else if (mimeType.includes('ogg')) {
                    blobType = 'audio/ogg';
                } else if (mimeType.includes('mp4')) {
                    blobType = 'audio/mp4';
                } else if (mimeType.includes('wav')) {
                    blobType = 'audio/wav';
                }
            }
            
            audioBlob = new Blob(audioChunks, { type: blobType });
            console.log(`✅ Blob creado: tipo=${blobType}, tamaño=${audioBlob.size} bytes`);
            const audioUrl = URL.createObjectURL(audioBlob);
            elements.audioPlayer.src = audioUrl;
            
            // Mostrar controles de reproducción
            elements.playAudioBtn.style.display = 'flex';
            elements.deleteAudioBtn.style.display = 'flex';
            elements.useAudioBtn.style.display = 'flex';
            elements.audioPreview.style.display = 'block';
            
            // Detener el stream
            if (audioStream) {
                audioStream.getTracks().forEach(track => track.stop());
                audioStream = null;
            }
            
            // Resetear flag de grabación manual
            isManualRecording = false;
            
            // Liberar Wake Lock cuando se detiene la grabación
            releaseWakeLock();
        };
        
        mediaRecorder.onerror = (event) => {
            console.error('❌ Error en MediaRecorder:', event.error);
            showStatus('Error durante la grabación: ' + (event.error?.message || 'Error desconocido'), 'error');
        };
        
        // Iniciar grabación con timeslice para asegurar que se emitan eventos regularmente
        // En móviles, esto es crítico para capturar todos los datos
        const timeslice = 250; // Emitir datos cada 250ms
        mediaRecorder.start(timeslice);
        recordingStartTime = Date.now();
        
        console.log(`🎤 Grabación iniciada con timeslice de ${timeslice}ms`);
        
        // Actualizar UI
        elements.startRecordingBtn.style.display = 'none';
        elements.stopRecordingBtn.style.display = 'flex';
        elements.recordingIndicator.style.display = 'block';
        
        // Actualizar duración cada segundo
        recordingInterval = setInterval(updateRecordingDuration, 1000);
        
        console.log('🎤 Grabación iniciada correctamente');
        
    } catch (error) {
        console.error('❌ Error al iniciar grabación:', error);
        console.error('❌ Detalles del error:', {
            name: error.name,
            message: error.message,
            constraint: error.constraint,
            stack: error.stack
        });
        
        showStatus('Error al acceder al micrófono: ' + error.message, 'error');
        
        // Resetear flag de grabación manual
        isManualRecording = false;
        
        // Liberar Wake Lock en caso de error
        releaseWakeLock();
        
        // Cerrar stream si se creó pero falló la grabación
        if (audioStream) {
            audioStream.getTracks().forEach(track => track.stop());
            audioStream = null;
        }
        
        // Resetear UI en caso de error
        elements.startRecordingBtn.style.display = 'flex';
        elements.stopRecordingBtn.style.display = 'none';
        elements.recordingIndicator.style.display = 'none';
    }
}

// Detener grabación
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        clearInterval(recordingInterval);
        
        // Detener detección de silencio
        stopSilenceDetection();
        
        // Resetear flag de grabación manual
        isManualRecording = false;
        
        // Liberar Wake Lock cuando se detiene la grabación
        releaseWakeLock();
        
        // Actualizar UI solo si no es modo automático
        if (!isAutoRecording) {
            elements.stopRecordingBtn.style.display = 'none';
            elements.recordingIndicator.style.display = 'none';
        }
        
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
                        // Buscar tanto "parada" como "numero_parada"
                        if (parsedDescription.parada !== undefined && parsedDescription.parada !== null) {
                            stopNumber = String(parsedDescription.parada);
                            // Asegurar que empieza con P si no lo tiene
                            if (stopNumber && !stopNumber.toUpperCase().startsWith('P')) {
                                stopNumber = `P${stopNumber}`;
                            }
                        } else if (parsedDescription.numero_parada !== undefined && parsedDescription.numero_parada !== null) {
                            stopNumber = String(parsedDescription.numero_parada);
                            // Asegurar que empieza con P si no lo tiene
                            if (stopNumber && !stopNumber.toUpperCase().startsWith('P')) {
                                stopNumber = `P${stopNumber}`;
                            }
                        }
                        
                        // Extraer la incidencia del JSON parseado
                        if (parsedDescription.incidencia) {
                            description = String(parsedDescription.incidencia).trim();
                        }
                        
                        // Si después de parsear no tenemos descripción, NO usar el JSON completo
                        // En su lugar, dejaremos que se use el texto transcrito o el fallback
                        if (!description || description.trim() === '') {
                            console.log('⚠️ No se encontró "incidencia" en el JSON parseado');
                            description = ''; // Dejar vacío para que use el fallback
                        }
                    } catch (e) {
                        // Si no es JSON válido, intentar extraer "incidencia" del string directamente
                        console.log('⚠️ description no es JSON válido, intentando extraer incidencia del string:', e);
                        
                        // Intentar extraer el valor de "incidencia" usando regex
                        const incidenciaMatch = result.description.match(/"incidencia"\s*:\s*"([^"]+)"/i);
                        if (incidenciaMatch && incidenciaMatch[1]) {
                            description = incidenciaMatch[1].trim();
                            console.log('✅ Incidencia extraída del string JSON:', description);
                        } else {
                            // Si no se puede extraer, usar description como texto normal solo si no parece ser JSON
                            if (!result.description.trim().startsWith('{')) {
                                description = result.description.trim();
                            } else {
                                // Si parece JSON pero no se pudo parsear, dejar vacío para usar fallback
                                description = '';
                            }
                        }
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

// Función helper para enviar incidencias en segundo plano (no bloquea la UI)
// Función para hacer rollback de fotos (eliminar URLs del servidor)
async function rollbackPhotos(fileIds) {
    if (!fileIds || fileIds.length === 0) {
        return;
    }
    
    console.log(`🗑️ Iniciando rollback de ${fileIds.length} foto(s)...`);
    
    // Hacer rollback de todas las fotos en paralelo
    const rollbackPromises = fileIds.map(async (fileId) => {
        try {
            const response = await fetch('/api/delete-photo-url', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Device-ID': deviceId
                },
                body: JSON.stringify({
                    file_id: fileId
                })
            });
            
            const result = await response.json();
            if (result.success) {
                console.log(`✅ Rollback completado para foto: ${fileId}`);
            } else {
                console.warn(`⚠️ Error en rollback para foto ${fileId}:`, result.error);
            }
        } catch (error) {
            console.error(`❌ Error al hacer rollback de foto ${fileId}:`, error);
        }
    });
    
    await Promise.all(rollbackPromises);
    console.log('✅ Rollback de fotos completado');
}

function sendIncidenceInBackground(payload, successMessage, errorMessage, onSuccess, onError) {
    // Mostrar mensaje de envío inmediatamente
    if (successMessage) {
        showStatus(successMessage.replace('enviada', 'enviando...').replace('creada', 'creando...'), 'info');
    }
    
    // Extraer file_ids de las imágenes para rollback si falla
    const fileIds = [];
    if (payload.image && Array.isArray(payload.image)) {
        payload.image.forEach(img => {
            if (img.file_id) {
                fileIds.push(img.file_id);
            }
        });
    }
    
    // Ejecutar fetch en segundo plano sin bloquear la UI
    fetch('/api/incidences', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Device-ID': deviceId
        },
        body: JSON.stringify(payload)
    })
    .then(response => {
        console.log('📡 Respuesta del servidor:', response.status, response.statusText);
        return response.json();
    })
    .then(result => {
        console.log('📄 Resultado completo:', result);
        
        if (result.success) {
            if (successMessage) {
                showStatus(successMessage, 'success');
            }
            console.log('✅ Incidencia enviada exitosamente:', result);
            
            // Ejecutar callback de éxito si existe
            if (onSuccess && typeof onSuccess === 'function') {
                onSuccess(result);
            }
        } else {
            const errorMsg = errorMessage || 'Error al enviar incidencia: ' + (result.error || 'Error desconocido');
            showStatus(errorMsg, 'error');
            console.error('❌ Error al enviar incidencia:', result);
            
            // Hacer rollback de fotos si hay error
            if (fileIds.length > 0) {
                console.log('🔄 Haciendo rollback de fotos debido a error...');
                rollbackPhotos(fileIds).catch(err => {
                    console.error('❌ Error al hacer rollback de fotos:', err);
                });
            }
            
            // Ejecutar callback de error si existe
            if (onError && typeof onError === 'function') {
                onError(result);
            }
        }
    })
    .catch(error => {
        const errorMsg = errorMessage || 'Error al enviar incidencia: ' + error.message;
        showStatus(errorMsg, 'error');
        console.error('❌ Error al enviar incidencia:', error);
        
        // Hacer rollback de fotos si hay error
        if (fileIds.length > 0) {
            console.log('🔄 Haciendo rollback de fotos debido a error...');
            rollbackPhotos(fileIds).catch(err => {
                console.error('❌ Error al hacer rollback de fotos:', err);
            });
        }
        
        // Ejecutar callback de error si existe
        if (onError && typeof onError === 'function') {
            onError(error);
        }
    });
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
        
        // Enviar incidencia en segundo plano (no bloquea la UI)
        sendIncidenceInBackground(
            incidencePayload,
            'Incidencia creada exitosamente con audio',
            'Error al crear incidencia'
        );
        
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
        
        // Enviar incidencia en segundo plano (no bloquea la UI)
        sendIncidenceInBackground(
            incidencePayload,
            `Incidencia creada para parada ${stopNumber}: ${description}`,
            'Error al crear incidencia'
        );
        
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
        
        // Enviar incidencia de prueba en segundo plano (no bloquea la UI)
        sendIncidenceInBackground(
            testPayload,
            '✅ Prueba exitosa: Incidencia creada',
            '❌ Prueba fallida'
        );
        
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
        
        // Verificar que tenemos fotos en la galería
        if (photoGallery.length === 0 && !currentPhotoData) {
            showStatus('No hay fotos para enviar', 'error');
            return;
        }
        
        // Si hay fotos en la galería, usarlas; si no, usar currentPhotoData para compatibilidad
        const photosToSend = photoGallery.length > 0 ? photoGallery : (currentPhotoData ? [currentPhotoData] : []);
        
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

        // Componer imágenes: usar URLs ya generadas si existen, sino usar base64 (fallback)
        const images = photosToSend.map((photoObj, index) => {
            // Si es objeto con URL, usar la URL; si no, usar base64 (fallback)
            if (typeof photoObj === 'object' && photoObj.url) {
                return {
                    file: photoObj.url, // Ya es URL, no necesita conversión
                    name: photoObj.filename || `incidence_${index + 1}.jpg`,
                    file_id: photoObj.file_id // Preservar file_id para rollback
                };
            } else {
                // Fallback: usar base64 (se convertirá en el backend)
                const base64Data = typeof photoObj === 'string' ? photoObj : photoObj.base64;
                return {
                    file: base64Data,
                    name: (typeof photoObj === 'object' && photoObj.filename) ? photoObj.filename : `incidence_${index + 1}.jpg`
                };
            }
        });

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

        // Enviar incidencia en segundo plano (no bloquea la UI)
        sendIncidenceInBackground(
            payload,
            `Incidencia enviada correctamente (Tipo: ${selectedType})`,
            'Error al enviar incidencia',
            () => {
                // Limpiar completamente la pantalla después del envío exitoso
                resetUIAfterIncidenceSent();
            }
        );
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
    imagenia = null; // Limpiar también imagenia
    currentQRData = null;
    photoGallery = [];
    currentPhotoIndex = 0;
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
    
    // Limpiar vista previa de foto y galería
    if (elements.previewImage) {
        elements.previewImage.src = '';
    }
    if (elements.photoGallery) {
        elements.photoGallery.innerHTML = '';
    }
    if (elements.photoPreview) {
        elements.photoPreview.style.display = 'none';
    }
    
    // Ocultar botones de navegación de la galería
    if (elements.prevPhotoBtn) {
        elements.prevPhotoBtn.style.display = 'none';
    }
    if (elements.nextPhotoBtn) {
        elements.nextPhotoBtn.style.display = 'none';
    }
    
    // Actualizar contador de fotos
    if (elements.photoCount) {
        elements.photoCount.textContent = '0';
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
    
    // Icono de usuario - mostrar login o logout según corresponda
    if (elements.userIconBtn) {
        elements.userIconBtn.addEventListener('click', handleUserIconClick);
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

// Manejar click en el icono de usuario
function handleUserIconClick() {
    if (currentUser && currentUser.username) {
        // Usuario autenticado - hacer logout
        handleLogout();
    } else {
        // Usuario no autenticado - mostrar login
        if (elements.loginModal) {
            elements.loginModal.style.display = 'block';
        }
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
    
    // Actualizar icono de usuario - mostrar tooltip con nombre de usuario
    if (elements.userIconBtn) {
        elements.userIconBtn.title = `Usuario: ${currentUser.username} - Clic para cerrar sesión`;
        elements.userIconBtn.style.display = 'flex';
    }
    
    
    // Habilitar botones de acción
    if (elements.takePhotoBtn) {
        elements.takePhotoBtn.disabled = false;
    }
    
    // Iniciar escaneo NFC automático
    startNFCAutoScan();
    
    // Activar reconocimiento de voz automático después de autenticarse
    setTimeout(() => {
        activateVoiceCommandOnLoad();
    }, 1000);
    
    console.log('👤 UI actualizada para usuario autenticado');
}

// Actualizar UI para usuario no autenticado
function updateUIForUnauthenticatedUser() {
    // Detener reconocimiento de voz al cerrar sesión
    stopVoiceCommandRecognition();
    
    // Mostrar sección de login
    elements.loginSection.style.display = 'block';
    
    // Ocultar botones de acción
    elements.actionButtons.style.display = 'none';
    
    // Actualizar icono de usuario - mostrar tooltip para login
    if (elements.userIconBtn) {
        elements.userIconBtn.title = 'Clic para iniciar sesión';
        elements.userIconBtn.style.display = 'flex';
    }
    
    
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

