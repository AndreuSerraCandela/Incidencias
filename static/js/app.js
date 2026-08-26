// Variables globales
let qrStream = null;
let photoStream = null;
let currentQRData = null;
let currentPhotoData = null; // Mantener para compatibilidad con código existente
let imagenia = null; // Foto principal capturada/importada con "Reportar Incidencia" - se envía a la IA (única, se sustituye)
let photoGallery = []; // Array para almacenar fotos adicionales (se envían con la incidencia pero NO a la IA)
let currentPhotoIndex = 0; // Índice de la foto actual en la galería
let photoMode = null; // 'reportar', 'añadir', 'cerrar' o 'guardar_local'
let pendingCloseIncidenceData = null; // Datos de incidencia para cerrar (state Cerrada + foto)
/** ID de foto local seleccionada en "Asignar foto" (antes de elegir elemento) */
let pendingAssignedLocalPhotoId = null;
/** ID de foto local usada en incidencia en curso (se marca asignada al enviar) */
let assignedLocalPhotoIdForIncidence = null;
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

// Variable para controlar el procesamiento de IA
let aiProcessingController = null; // AbortController para cancelar el fetch de IA
let manualEntryRequested = false; // Bandera para indicar que el usuario eligió entrada manual
let aiStopResourceLookupTimer = null;
let aiStopResourceLookupSeq = 0;

// Variables para almacenar datos de incidencia
let pendingIncidenceData = {
    stopNumber: null,
    description: null,
    fullText: null,
    hasAudio: false,
    hasAI: false,
    hasLocalDescription: false,
    isParadaBus: false,
    isMobiliario: false,
    elementData: null,
    resourceFromUrl: null,  // Parada o recurso llegado por URL (?parada= o ?recurso=) desde app Rutas
    /** 1 = solo EMT; 0 = EMT no permitido; null = aún sin dato GIS */
    emtGis: null,
    incidenceSubType: null
};

const INCIDENCE_SUBTYPES_FALLBACK = ['Mantenimiento', 'Limpieza', 'Electrico', 'Poda', 'Tip', 'Otras'];
const INCIDENCE_TYPE_FALLBACK = 'Mobiliario Urbano';
/** Enlace profundo ?id=INV… (WhatsApp / GMalla); se consume tras login */
const DEEP_LINK_INCIDENCE_STORAGE_KEY = 'incidencias_deep_link_no';
/** Enlace desde Rutas u otras apps: ?action=nearby o ?cerca=1 */
const PENDING_NEARBY_STORAGE_KEY = 'incidencias_pending_nearby';
let _deepLinkIncidenceInFlight = false;
let _lastAssignedIncidencePayload = null;

/** Subtipos permitidos según tipo: EMT sin Otras/Poda; no EMT sin Tip */
function filterSubtypesForIncidenceType(incidenceType, allSubtypes) {
    const t = (incidenceType || '').trim();
    const subs = (allSubtypes || []).slice();
    if (t === 'EMT') return subs.filter(s => s !== 'Otras' && s !== 'Poda');
    return subs.filter(s => s !== 'Tip');
}

let incidencePickerResolve = null;
let incidencePickerAllSubtypes = [];
let aiModalAllSubtypes = [];

function finishIncidencePicker(result) {
    if (elements.incidencePickerModal) elements.incidencePickerModal.style.display = 'none';
    const fn = incidencePickerResolve;
    incidencePickerResolve = null;
    if (fn) fn(result);
}

function refillPickerSubtypeSelect(incidenceType, allSubtypes) {
    if (!elements.pickerIncidenceSubType) return;
    const base = (allSubtypes && allSubtypes.length) ? allSubtypes : INCIDENCE_SUBTYPES_FALLBACK.slice();
    const filtered = filterSubtypesForIncidenceType(incidenceType, base);
    elements.pickerIncidenceSubType.innerHTML = '';
    filtered.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        elements.pickerIncidenceSubType.appendChild(opt);
    });
    if (filtered.length) elements.pickerIncidenceSubType.value = filtered[0];
}

function onAiIncidenceTypeChangeForSubtype() {
    if (!elements.aiIncidenceType || !elements.aiIncidenceSubType) return;
    const t = elements.aiIncidenceType.value;
    const base = aiModalAllSubtypes.length ? aiModalAllSubtypes : INCIDENCE_SUBTYPES_FALLBACK;
    const filtered = filterSubtypesForIncidenceType(t, base);
    const prev = elements.aiIncidenceSubType.value;
    elements.aiIncidenceSubType.innerHTML = '';
    filtered.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        elements.aiIncidenceSubType.appendChild(opt);
    });
    if (filtered.length) {
        elements.aiIncidenceSubType.value = filtered.includes(prev) ? prev : filtered[0];
    }
}

/** Tipo fijo para el modal IA/manual según contexto recurso/parada y flag EMT */
function resolveFixedIncidenceTypeForAi(availableTypes, defaultType) {
    const types = Array.isArray(availableTypes) ? availableTypes : [];
    const hasType = (t) => types.includes(t);
    const emt = pendingIncidenceData.emtGis;

    if (emt === 1 && hasType('EMT')) {
        return 'EMT';
    }
    if (pendingIncidenceData.isParadaBus && hasType('Mobiliario Urbano')) {
        return 'Mobiliario Urbano';
    }
    if (pendingIncidenceData.isMobiliario && hasType('Mobiliario Urbano')) {
        return 'Mobiliario Urbano';
    }

    const tipoElemento = String(
        (pendingIncidenceData.elementData && (
            pendingIncidenceData.elementData.TipoElemento ||
            pendingIncidenceData.elementData.tipoElemento ||
            pendingIncidenceData.elementData.Tipo ||
            pendingIncidenceData.elementData.tipo
        )) || ''
    ).toUpperCase();
    if (
        hasType('Vallas') &&
        (tipoElemento.includes('VALLA') || tipoElemento.includes('VPEATON'))
    ) {
        return 'Vallas';
    }

    if (emt !== 1 && hasType(INCIDENCE_TYPE_FALLBACK)) {
        return INCIDENCE_TYPE_FALLBACK;
    }
    if (defaultType && hasType(defaultType)) {
        return defaultType;
    }
    return types[0] || INCIDENCE_TYPE_FALLBACK;
}

function _normalizeResourceCodeForCompare(code) {
    const s = String(code || '').trim().toUpperCase();
    if (!s) return '';
    const parts = s.split('-').map(p => p.trim()).filter(Boolean);
    const norm = parts.map((p) => {
        if (/^\d+$/.test(p)) return String(parseInt(p, 10));
        return p;
    });
    return norm.join('-');
}

/**
 * Aplica respuesta de /api/resource-emt a pendingIncidenceData
 * (mismo criterio EMT que Elementos cerca).
 */
function applyEmtGisLookupToPending(data) {
    if (!data || !data.success || !data.found) return false;
    const emt = data.emt === 1 ? 1 : (data.emt === 0 ? 0 : null);
    pendingIncidenceData.emtGis = emt;
    pendingIncidenceData.elementData = {
        ...(pendingIncidenceData.elementData || {}),
        TipoElemento: data.tipoElemento || '',
        EMT: emt,
        TipoParada: data.tipoParada || '',
    };
    if (data.source === 'mobiliario') {
        const hasParada = !!(data.tipoParada && String(data.tipoParada).trim());
        pendingIncidenceData.isMobiliario = true;
        if (hasParada || pendingIncidenceData.isParadaBus) {
            pendingIncidenceData.isParadaBus = true;
        }
    } else if (data.source === 'recurso') {
        // Recurso publicitario: no forzar parada/mobiliario
        pendingIncidenceData.isParadaBus = false;
        pendingIncidenceData.isMobiliario = false;
    }
    return true;
}

/**
 * Si aún no hay emtGis, lo resuelve como en el mapa (GIS Recursos/Mobiliario).
 * Cubre URL ?recurso/?parada, QR con código recurso, etc.
 */
async function ensureEmtGisFromPendingContext() {
    if (pendingIncidenceData.emtGis === 0 || pendingIncidenceData.emtGis === 1) {
        return pendingIncidenceData.emtGis;
    }
    if (pendingIncidenceData.elementData) {
        const fromEl = normalizeEmtFromElement(pendingIncidenceData.elementData);
        if (fromEl === 0 || fromEl === 1) {
            pendingIncidenceData.emtGis = fromEl;
            return fromEl;
        }
    }

    let parada = null;
    let resource = null;
    if (pendingIncidenceData.isParadaBus && pendingIncidenceData.stopNumber) {
        parada = String(pendingIncidenceData.stopNumber).replace(/^PARADA_/i, '').trim();
    } else if (pendingIncidenceData.resourceFromUrl) {
        resource = String(pendingIncidenceData.resourceFromUrl).trim();
    } else if (pendingIncidenceData.stopNumber) {
        const sn = String(pendingIncidenceData.stopNumber).trim();
        if (sn.includes('-')) resource = sn;
        else parada = sn.replace(/^PARADA_/i, '').trim();
    } else if (currentQRData) {
        const qr = String(currentQRData).trim();
        if (qr.includes('-')) resource = qr;
    }

    if (!parada && !resource) return pendingIncidenceData.emtGis;

    try {
        const params = new URLSearchParams();
        if (parada) params.set('parada', parada);
        else params.set('resource', resource);
        const res = await fetch('/api/resource-emt?' + params.toString(), {
            headers: { 'X-Device-ID': deviceId }
        });
        const data = await res.json().catch(() => ({}));
        if (applyEmtGisLookupToPending(data)) {
            console.log('📌 EMT GIS unificado:', {
                emtGis: pendingIncidenceData.emtGis,
                source: data.source,
                resource: data.resource
            });
        }
    } catch (e) {
        console.warn('⚠️ No se pudo resolver EMT GIS del contexto:', e);
    }
    return pendingIncidenceData.emtGis;
}

async function refreshAiTypeFromStopOrResourceInput() {
    if (!elements.aiStopNumber) return;
    const raw = String(elements.aiStopNumber.value || '').trim();
    if (!raw || !raw.includes('-')) return;

    const requestId = ++aiStopResourceLookupSeq;
    try {
        const res = await fetch(
            '/api/resource-emt?resource=' + encodeURIComponent(raw),
            { headers: { 'X-Device-ID': deviceId } }
        );
        const data = await res.json().catch(() => ({}));
        if (requestId !== aiStopResourceLookupSeq) return;
        if (!data.success) return;

        const typedNorm = _normalizeResourceCodeForCompare(raw);
        const matchedNorm = _normalizeResourceCodeForCompare(data.resource || '');
        if (data.found && matchedNorm && typedNorm === matchedNorm) {
            applyEmtGisLookupToPending(data);
            await loadIncidenceTypesToSelect();
        }
    } catch (e) {
        console.warn('⚠️ No se pudo recalcular tipo por recurso:', e);
    }
}

function scheduleAiTypeRefreshFromInput() {
    if (aiStopResourceLookupTimer) {
        clearTimeout(aiStopResourceLookupTimer);
    }
    aiStopResourceLookupTimer = setTimeout(() => {
        refreshAiTypeFromStopOrResourceInput();
    }, 280);
}

function setupIncidencePickerModalListeners() {
    if (!elements.pickerIncidenceType || !elements.confirmIncidencePickerBtn) return;
    elements.pickerIncidenceType.addEventListener('change', () => {
        refillPickerSubtypeSelect(elements.pickerIncidenceType.value, incidencePickerAllSubtypes);
    });
    elements.confirmIncidencePickerBtn.addEventListener('click', () => {
        const t = elements.pickerIncidenceType.value;
        const st = elements.pickerIncidenceSubType.value;
        if (!t || !st) {
            showStatus('Selecciona tipo y subtipo de incidencia', 'warning');
            return;
        }
        const base = incidencePickerAllSubtypes.length ? incidencePickerAllSubtypes : INCIDENCE_SUBTYPES_FALLBACK.slice();
        const allowed = filterSubtypesForIncidenceType(t, base);
        if (!allowed.includes(st)) {
            showStatus('Subtipo no válido para el tipo elegido', 'error');
            return;
        }
        finishIncidencePicker({ type: t, subtype: st });
    });
    const cancelPick = () => finishIncidencePicker(null);
    if (elements.cancelIncidencePickerBtn) {
        elements.cancelIncidencePickerBtn.addEventListener('click', cancelPick);
    }
    if (elements.closeIncidencePickerModal) {
        elements.closeIncidencePickerModal.addEventListener('click', cancelPick);
    }
}

function hideAssignedIncidenceModal() {
    if (elements.assignedIncidenceModal) {
        elements.assignedIncidenceModal.style.display = 'none';
    }
    _lastAssignedIncidencePayload = null;
}

function _safeHttpUrlForImg(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    try {
        const u = new URL(s, window.location.origin);
        if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
    } catch (e) { /* ignore */ }
    return '';
}

function _escHtmlAttr(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

/**
 * Enlace a Google Maps a partir de PuntoX / PuntoY (WGS84).
 * Prueba Y=lat, X=lng y al revés; si no encaja en grados, usa búsqueda genérica.
 */
function buildGoogleMapsUrlFromPuntoXY(pxRaw, pyRaw) {
    if (pxRaw == null || pyRaw == null) return '';
    const normalizeNum = (v) => {
        const t = String(v).trim().replace(/\s/g, '').replace(',', '.');
        const n = parseFloat(t);
        return Number.isFinite(n) ? n : NaN;
    };
    const x = normalizeNum(pxRaw);
    const y = normalizeNum(pyRaw);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return '';
    const tryOrder = (lat, lng) => {
        if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
            return `https://www.google.com/maps?q=${encodeURIComponent(lat)},${encodeURIComponent(lng)}`;
        }
        return '';
    };
    let url = tryOrder(y, x);
    if (!url) url = tryOrder(x, y);
    if (!url) {
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${y},${x}`)}`;
    }
    return url;
}

function showAssignedIncidenceModal(incidence) {
    _lastAssignedIncidencePayload = incidence;
    if (!elements.assignedIncidenceModal || !elements.assignedIncidenceBody) return;
    const esc = (t) => {
        const d = document.createElement('div');
        d.textContent = t == null ? '' : String(t);
        return d.innerHTML;
    };
    const lines = [];
    lines.push(`<p><strong>Nº</strong> ${esc(incidence.documentNo)}</p>`);
    if (incidence.state) lines.push(`<p><strong>Estado</strong> ${esc(incidence.state)}</p>`);
    lines.push(`<p><strong>Recurso</strong> ${esc(incidence.resource)}</p>`);
    if (incidence.resourceName) {
        lines.push(`<p><strong>Nombre del recurso</strong><br>${esc(incidence.resourceName)}</p>`);
    }
    if (incidence.address) {
        lines.push(`<p><strong>Dirección</strong><br>${esc(incidence.address)}</p>`);
    }
    const px = incidence.puntoX;
    const py = incidence.puntoY;
    const mapsUrl = buildGoogleMapsUrlFromPuntoXY(px, py);
    if (mapsUrl && (String(px).trim() || String(py).trim())) {
        const label = [py, px].filter(Boolean).join(', ');
        lines.push(
            '<p class="assigned-incidence-maps-row">' +
            `<a href="${_escHtmlAttr(mapsUrl)}" target="_blank" rel="noopener noreferrer" class="assigned-incidence-maps-link">` +
            '<i class="fas fa-map-marker-alt" aria-hidden="true"></i> ' +
            `Ver en Google Maps${label ? ' (' + esc(label) + ')' : ''}</a></p>`
        );
    } else if (String(px || '').trim() || String(py || '').trim()) {
        lines.push(
            `<p><strong>Coordenadas</strong><br>${esc(py || '—')}, ${esc(px || '—')}</p>`
        );
    }
    lines.push(
        `<p><strong>Tipo</strong> ${esc(incidence.incidenceType)} — ` +
        `<strong>Subtipo</strong> ${esc(incidence.incidenceSubType)}</p>`
    );
    const photoUrl = _safeHttpUrlForImg(incidence.urlPrimeraImagen);
    if (photoUrl) {
        const safeAttr = photoUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        lines.push(
            '<div class="assigned-incidence-photo-wrap">' +
            `<img class="assigned-incidence-photo" src="${safeAttr}" alt="Primera imagen de la incidencia" ` +
            'loading="lazy" referrerpolicy="no-referrer" />' +
            '</div>'
        );
    }
    const descText = (incidence.description != null && String(incidence.description).trim())
        ? incidence.description
        : '';
    const obsText = (incidence.observation != null && String(incidence.observation).trim())
        ? incidence.observation
        : '';
    lines.push(
        `<p><strong>Descripción</strong><br>${descText ? esc(descText) : '<span class="assigned-incidence-empty">Sin descripción</span>'}</p>`
    );
    lines.push(
        `<p><strong>Observación</strong><br>${obsText ? esc(obsText) : '<span class="assigned-incidence-empty">Sin observación</span>'}</p>`
    );
    elements.assignedIncidenceBody.innerHTML = lines.join('');
    if (elements.assignedIncidenceContinueBtn) {
        const btn = elements.assignedIncidenceContinueBtn;
        btn.style.display = 'inline-flex';
        btn.disabled = false;
        btn.title = 'Foto de cierre';
        btn.setAttribute('aria-label', 'Continuar: foto de cierre');
    }
    if (elements.assignedIncidenceModalTitle) {
        elements.assignedIncidenceModalTitle.textContent =
            'Incidencia ' + (incidence.documentNo || '');
    }
    elements.assignedIncidenceModal.style.display = 'block';
}

function setupAssignedIncidenceModalListeners() {
    if (elements.assignedIncidenceContinueBtn) {
        elements.assignedIncidenceContinueBtn.addEventListener('click', async () => {
            const inc = _lastAssignedIncidencePayload;
            if (!inc || !inc.resource) return;
            const resource = inc.resource;
            const qrOverride = resource.startsWith('PARADA_')
                ? resource.replace(/^PARADA_/, '')
                : resource;
            hideAssignedIncidenceModal();
            await sendEnProgresoAndOpenCloseCamera(inc, resource, {
                closeNearbyModal: false,
                currentQrOverride: qrOverride
            });
        });
    }
    if (elements.closeAssignedIncidenceModal) {
        elements.closeAssignedIncidenceModal.addEventListener('click', hideAssignedIncidenceModal);
    }
}

function tryOpenPendingNearbyElements() {
    var pending = false;
    try {
        pending = sessionStorage.getItem(PENDING_NEARBY_STORAGE_KEY) === '1';
    } catch (e) {
        return;
    }
    if (!pending || !isAuthenticated) {
        return;
    }
    try {
        sessionStorage.removeItem(PENDING_NEARBY_STORAGE_KEY);
    } catch (e) { /* ignore */ }
    if (typeof stopNFCScanning === 'function') {
        stopNFCScanning();
    }
    if (typeof showNearbyElements === 'function') {
        showNearbyElements();
    }
}

async function tryProcessDeepLinkIncidence() {
    let no;
    try {
        no = sessionStorage.getItem(DEEP_LINK_INCIDENCE_STORAGE_KEY);
    } catch (e) {
        return;
    }
    if (!no || !isAuthenticated || !deviceId) return;
    if (_deepLinkIncidenceInFlight) return;
    _deepLinkIncidenceInFlight = true;
    try {
        sessionStorage.removeItem(DEEP_LINK_INCIDENCE_STORAGE_KEY);
        const res = await fetch(
            '/api/assigned-incidence?no=' + encodeURIComponent(no),
            { headers: { 'X-Device-ID': deviceId } }
        );
        const data = await res.json().catch(() => ({}));
        if (!data.success || !data.incidence) {
            showStatus(data.error || 'No se pudo cargar la incidencia del enlace.', 'error');
            return;
        }
        showAssignedIncidenceModal(data.incidence);
    } catch (e) {
        console.error('tryProcessDeepLinkIncidence:', e);
        showStatus('Error de red al cargar la incidencia.', 'error');
    } finally {
        _deepLinkIncidenceInFlight = false;
    }
}

// Variable para almacenar la orientación capturada al presionar el botón de la cámara
let capturedOrientation = null;

// Variable para almacenar la orientación actual del dispositivo (se actualiza en tiempo real)
let currentDeviceOrientation = null;
let currentDeviceOrientationAngle = null;

// Variables para DeviceOrientationEvent (acelerómetro/giroscopio)
let deviceOrientationData = null;
let deviceOrientationPermissionGranted = false;

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
        aiIncidenceType: document.getElementById('aiIncidenceType'),
        aiIncidenceSubType: document.getElementById('aiIncidenceSubType'),
        aiStopNumber: document.getElementById('aiStopNumber'),
        aiDescription: document.getElementById('aiDescription'),
        aiRawResponse: document.getElementById('aiRawResponse'),
        aiRawResponseText: document.getElementById('aiRawResponseText'),
        confirmAIResultsBtn: document.getElementById('confirmAIResultsBtn'),
        cancelAIResultsBtn: document.getElementById('cancelAIResultsBtn'),
        manualEntryBtn: document.getElementById('manualEntryBtn'),
        incidencePickerModal: document.getElementById('incidencePickerModal'),
        pickerIncidenceTypeGroup: document.getElementById('pickerIncidenceTypeGroup'),
        pickerIncidenceType: document.getElementById('pickerIncidenceType'),
        pickerIncidenceSubType: document.getElementById('pickerIncidenceSubType'),
        confirmIncidencePickerBtn: document.getElementById('confirmIncidencePickerBtn'),
        cancelIncidencePickerBtn: document.getElementById('cancelIncidencePickerBtn'),
        closeIncidencePickerModal: document.getElementById('closeIncidencePickerModal'),
        
        // Elementos de la galería de fotos
        addPhotosBtn: document.getElementById('addPhotosBtn'),
        multiplePhotosInput: document.getElementById('multiplePhotosInput'),
        photoGallery: document.getElementById('photoGallery'),
        prevPhotoBtn: document.getElementById('prevPhotoBtn'),
        nextPhotoBtn: document.getElementById('nextPhotoBtn'),
        photoCount: document.getElementById('photoCount'),
        photoPreviewUploadHint: document.getElementById('photoPreviewUploadHint'),
        
        // Elementos del modal de elementos cercanos
        nearbyElementsBtn: document.getElementById('nearbyElementsBtn'),
        nearbyElementsModal: document.getElementById('nearbyElementsModal'),
        nearbyModalTitle: document.getElementById('nearbyModalTitle'),
        expandNearbyRadiusBtn: document.getElementById('expandNearbyRadiusBtn'),
        expandNearbyRadiusLabel: document.getElementById('expandNearbyRadiusLabel'),
        closeNearbyModal: document.getElementById('closeNearbyModal'),
        nearbyMap: document.getElementById('nearbyMap'),
        mapStatus: document.getElementById('mapStatus'),
        nearbyLocationHint: document.getElementById('nearbyLocationHint'),
        nearbyLocationHintText: document.getElementById('nearbyLocationHintText'),
        useLastNearbyLocationBtn: document.getElementById('useLastNearbyLocationBtn'),

        saveLocalPhotoBtn: document.getElementById('saveLocalPhotoBtn'),
        assignPhotoBtn: document.getElementById('assignPhotoBtn'),
        assignPhotoModal: document.getElementById('assignPhotoModal'),
        closeAssignPhotoModal: document.getElementById('closeAssignPhotoModal'),
        unassignedPhotosList: document.getElementById('unassignedPhotosList'),
        noUnassignedPhotosMsg: document.getElementById('noUnassignedPhotosMsg'),
        assignPhotoScopeMineBtn: document.getElementById('assignPhotoScopeMineBtn'),
        assignPhotoScopeAllBtn: document.getElementById('assignPhotoScopeAllBtn'),
        assignedLocalPhotoDescription: document.getElementById('assignedLocalPhotoDescription'),

        localPhotoDescModal: document.getElementById('localPhotoDescModal'),
        closeLocalPhotoDescModal: document.getElementById('closeLocalPhotoDescModal'),
        localPhotoDescThumb: document.getElementById('localPhotoDescThumb'),
        localPhotoDescText: document.getElementById('localPhotoDescText'),
        localPhotoDescRecordBtn: document.getElementById('localPhotoDescRecordBtn'),
        localPhotoDescRecordLabel: document.getElementById('localPhotoDescRecordLabel'),
        localPhotoDescAudioStatus: document.getElementById('localPhotoDescAudioStatus'),
        skipLocalPhotoDescBtn: document.getElementById('skipLocalPhotoDescBtn'),
        saveLocalPhotoDescBtn: document.getElementById('saveLocalPhotoDescBtn'),

        assignedIncidenceModal: document.getElementById('assignedIncidenceModal'),
        assignedIncidenceModalTitle: document.getElementById('assignedIncidenceModalTitle'),
        assignedIncidenceBody: document.getElementById('assignedIncidenceBody'),
        assignedIncidenceContinueBtn: document.getElementById('assignedIncidenceContinueBtn'),
        closeAssignedIncidenceModal: document.getElementById('closeAssignedIncidenceModal')
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

    // Enlace desde WhatsApp/GMalla: ?id=INV00028 (también ?Id=)
    const incidenceDocNo = (urlParams.get('id') || urlParams.get('Id') || '').trim();
    if (incidenceDocNo) {
        try {
            sessionStorage.setItem(DEEP_LINK_INCIDENCE_STORAGE_KEY, incidenceDocNo);
        } catch (e) {
            console.warn('No se pudo guardar deep link en sessionStorage:', e);
        }
        if (typeof history !== 'undefined' && history.replaceState) {
            const urlSinParams = window.location.pathname + window.location.hash;
            history.replaceState({}, document.title, urlSinParams);
        }
        setTimeout(() => {
            if (!isAuthenticated) {
                showLoginModal();
                if (elements.loginStatus) {
                    showLoginStatus(
                        'Te han enlazado a una incidencia. Inicia sesión con tu usuario GTask para verla.',
                        'info'
                    );
                }
            }
            tryProcessDeepLinkIncidence();
        }, 400);
        return;
    }

    // Desde Rutas (u otra app): abrir directamente el mapa «Elementos cerca»
    if (action === 'nearby' || urlParams.get('cerca') === '1') {
        try {
            sessionStorage.setItem(PENDING_NEARBY_STORAGE_KEY, '1');
        } catch (e) {
            console.warn('No se pudo guardar pending nearby en sessionStorage:', e);
        }
        if (typeof history !== 'undefined' && history.replaceState) {
            history.replaceState({}, document.title, window.location.pathname + window.location.hash);
        }
        if (!isAuthenticated) {
            showLoginModal();
            if (elements.loginStatus) {
                showLoginStatus(
                    'Inicia sesión con tu usuario GTask para ver elementos cercanos en el mapa.',
                    'info'
                );
            }
        }
        setTimeout(() => tryOpenPendingNearbyElements(), 800);
        return;
    }
    
    // Parámetros parada/recurso desde URL (?parada=788 o ?recurso=XXX): como si se hubiera seleccionado desde elementos cercanos y pulsado Crear incidencia
    const parada = urlParams.get('parada');
    const recurso = urlParams.get('recurso');
    if (parada || recurso) {
        const id = (parada || recurso).trim();
        currentQRData = id;
        if (parada) {
            pendingIncidenceData.stopNumber = id;
            pendingIncidenceData.resourceFromUrl = null;
            pendingIncidenceData.isParadaBus = true;
            pendingIncidenceData.elementData = null;
            pendingIncidenceData.isMobiliario = true;
            pendingIncidenceData.emtGis = null;
            console.log('📌 Parada desde URL:', id);
        }
        if (recurso) {
            pendingIncidenceData.resourceFromUrl = id;
            pendingIncidenceData.stopNumber = null;
            pendingIncidenceData.isParadaBus = false;
            pendingIncidenceData.elementData = null;
            pendingIncidenceData.isMobiliario = false;
            pendingIncidenceData.emtGis = null;
            console.log('📌 Recurso desde URL:', id);
        }
        if (elements.qrData && elements.qrType && elements.qrResults) {
            elements.qrData.textContent = id;
            elements.qrData.href = '#';
            elements.qrType.textContent = parada ? 'Parada' : 'Recurso';
            elements.qrResults.style.display = 'block';
        }
        showStatus(parada
            ? 'Incidencia preparada para parada ' + id + '. Toma o adjunta una foto y envía.'
            : 'Incidencia preparada para recurso ' + id + '. Toma o adjunta una foto y envía.', 'success');
        updateReportButton();
        photoMode = 'reportar';
        syncSendIncidenceBtnLabel();
        imagenia = null;
        currentPhotoData = null;
        photoGallery = [];
        // Mismo criterio EMT que Elementos cerca (GIS)
        ensureEmtGisFromPendingContext().catch((e) => {
            console.warn('⚠️ EMT GIS desde URL no disponible aún:', e);
        });
        startPhotoAutoCapture();
        if (typeof history !== 'undefined' && history.replaceState) {
            const urlSinParams = window.location.pathname + window.location.hash;
            history.replaceState({}, document.title, urlSinParams);
        }
    }
    
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

// Configurar listener de orientación del dispositivo usando DeviceOrientationEvent (acelerómetro)
function setupOrientationListener() {
    // Usar DeviceOrientationEvent que usa el acelerómetro/giroscopio del dispositivo
    // Esto funciona incluso si la app está bloqueada en una orientación
    if (window.DeviceOrientationEvent) {
        // Solicitar permiso si es necesario (iOS 13+)
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            console.log('📱 Solicitando permiso para DeviceOrientationEvent...');
            DeviceOrientationEvent.requestPermission()
                .then(response => {
                    if (response === 'granted') {
                        deviceOrientationPermissionGranted = true;
                        startDeviceOrientationListener();
                    } else {
                        console.warn('⚠️ Permiso para DeviceOrientationEvent denegado');
                    }
                })
                .catch(error => {
                    console.error('❌ Error solicitando permiso:', error);
                });
        } else {
            // No se requiere permiso, iniciar directamente
            startDeviceOrientationListener();
        }
    } else {
        console.warn('⚠️ DeviceOrientationEvent no está disponible');
    }
    
    function startDeviceOrientationListener() {
        window.addEventListener('deviceorientation', (event) => {
            // Guardar datos de orientación
            deviceOrientationData = {
                alpha: event.alpha, // Rotación Z (0-360)
                beta: event.beta,   // Inclinación frontal (-180 a 180)
                gamma: event.gamma  // Inclinación lateral (-90 a 90)
            };
            
            // Determinar orientación basado en beta y gamma
            // beta: -180 a 180 (0 = horizontal, 90 = vertical hacia arriba, -90 = vertical hacia abajo)
            // gamma: -90 a 90 (0 = vertical, positivo = inclinado a la derecha, negativo = inclinado a la izquierda)
            
            const beta = event.beta || 0;
            const gamma = event.gamma || 0;
            const absBeta = Math.abs(beta);
            const absGamma = Math.abs(gamma);
            
            // Lógica mejorada:
            // - Si beta está cerca de 0 (horizontal) y gamma es significativo = horizontal
            // - Si beta es significativo (vertical) y gamma está cerca de 0 = vertical
            // - Si ambos son significativos, usar el más grande
            
            if (absBeta < 30 && absGamma > 20) {
                // Horizontal (landscape) - dispositivo acostado
                currentDeviceOrientation = 1;
               // console.log('🔄 Orientación detectada (DeviceOrientation): LANDSCAPE/HORIZONTAL', `(beta: ${beta.toFixed(1)}°, gamma: ${gamma.toFixed(1)}°)`);
            } else if (absBeta > 50 && absGamma < 40) {
                // Vertical (portrait) - dispositivo de pie
                currentDeviceOrientation = 6;
               // console.log('🔄 Orientación detectada (DeviceOrientation): PORTRAIT/VERTICAL', `(beta: ${beta.toFixed(1)}°, gamma: ${gamma.toFixed(1)}°)`);
            } else if (absBeta > absGamma) {
                // beta domina = más vertical
                currentDeviceOrientation = 6;
              //  console.log('🔄 Orientación detectada (DeviceOrientation): PORTRAIT/VERTICAL (beta domina)', `(beta: ${beta.toFixed(1)}°, gamma: ${gamma.toFixed(1)}°)`);
            } else if (absGamma > absBeta) {
                // gamma domina = más horizontal
                currentDeviceOrientation = 1;
              //  console.log('🔄 Orientación detectada (DeviceOrientation): LANDSCAPE/HORIZONTAL (gamma domina)', `(beta: ${beta.toFixed(1)}°, gamma: ${gamma.toFixed(1)}°)`);
            }
        });
        
      //  console.log('✅ DeviceOrientationEvent listener iniciado');
    }
    
    // También escuchar cambios de window.orientation como respaldo
    if (window.orientation !== undefined) {
        window.addEventListener('orientationchange', () => {
            const angle = window.orientation;
            const absAngle = Math.abs(angle);
            
            // Solo usar si DeviceOrientationEvent no está disponible o no ha detectado nada
            if (!deviceOrientationData) {
                if (absAngle === 0 || absAngle === 180) {
                    currentDeviceOrientation = 1; // Landscape
                } else if (absAngle === 90) {
                    currentDeviceOrientation = 6; // Portrait
                }
                console.log('🔄 Orientación actualizada (window.orientation):', currentDeviceOrientation, `(${angle}°)`);
            }
        });
    }
}

// Configurar event listeners
function initializeEventListeners() {
    // Configurar listener de orientación primero
    setupOrientationListener();
    // Botones principales
    if (elements.takePhotoBtn) {
        elements.takePhotoBtn.addEventListener('click', () => {
            if (!ensureAuthenticatedForAction('report')) return;
            stopNFCScanning(); // Detener NFC al pulsar reportar incidencia
            photoMode = 'reportar'; // Establecer modo "Reportar Incidencia"
            syncSendIncidenceBtnLabel();
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
    
    if (elements.manualEntryBtn) {
        elements.manualEntryBtn.addEventListener('click', handleManualEntry);
    }
    if (elements.aiStopNumber) {
        elements.aiStopNumber.addEventListener('input', scheduleAiTypeRefreshFromInput);
        elements.aiStopNumber.addEventListener('blur', refreshAiTypeFromStopOrResourceInput);
    }

    setupIncidencePickerModalListeners();
    setupAssignedIncidenceModalListeners();
    
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
        elements.capturePhotoBtn.addEventListener('click', () => {
            // Capturar la orientación del dispositivo en el momento exacto de presionar el botón
            console.log('📱 Capturando orientación al presionar botón de cámara...');
            console.log('   DeviceOrientationData disponible:', deviceOrientationData !== null);
            console.log('   currentDeviceOrientation:', currentDeviceOrientation);
            
            // Usar la orientación detectada por DeviceOrientationEvent si está disponible
            if (currentDeviceOrientation !== null) {
                capturedOrientation = currentDeviceOrientation;
                console.log('✅ Orientación capturada desde DeviceOrientationEvent:', capturedOrientation, capturedOrientation === 1 ? 'LANDSCAPE/HORIZONTAL' : 'PORTRAIT/VERTICAL');
            } else {
                // Si no está disponible, detectarla ahora
                capturedOrientation = detectDeviceOrientation();
                console.log('✅ Orientación capturada mediante detección:', capturedOrientation, capturedOrientation === 1 ? 'LANDSCAPE/HORIZONTAL' : 'PORTRAIT/VERTICAL');
            }
            
            // Llamar a capturePhoto después de capturar la orientación
            capturePhoto();
        });
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
            if (!ensureAuthenticatedForAction('record_audio')) return;
            stopNFCScanning(); // Detener NFC al pulsar grabar audio
            startAudioRecording();
        });
    }
    
    // Botón para añadir múltiples fotos - abre modal de cámara
    if (elements.addPhotosBtn) {
        elements.addPhotosBtn.addEventListener('click', () => {
            if (!ensureAuthenticatedForAction('add_photos')) return;
            stopNFCScanning(); // Detener NFC al pulsar añadir fotos
            photoMode = 'añadir'; // Establecer modo "Añadir Fotos"
            syncSendIncidenceBtnLabel();
            startPhotoAutoCapture(); // Abrir modal de cámara para capturar o importar
        });
    }
    
    // Botón de elementos cercanos
    if (elements.nearbyElementsBtn) {
        elements.nearbyElementsBtn.addEventListener('click', () => {
            if (!ensureAuthenticatedForAction('nearby')) return;
            stopNFCScanning();
            showNearbyElements();
        });
    }

    if (elements.saveLocalPhotoBtn) {
        elements.saveLocalPhotoBtn.addEventListener('click', () => {
            if (!ensureAuthenticatedForAction('save_local_photo')) return;
            stopNFCScanning();
            photoMode = 'guardar_local';
            startPhotoAutoCapture();
        });
    }

    if (elements.assignPhotoBtn) {
        elements.assignPhotoBtn.addEventListener('click', () => {
            if (!ensureAuthenticatedForAction('assign_photo')) return;
            stopNFCScanning();
            openAssignPhotoModal();
        });
    }

    if (elements.closeAssignPhotoModal) {
        elements.closeAssignPhotoModal.addEventListener('click', closeAssignPhotoModal);
    }
    if (elements.assignPhotoModal) {
        elements.assignPhotoModal.addEventListener('click', (event) => {
            if (event.target === elements.assignPhotoModal) {
                closeAssignPhotoModal();
            }
        });
    }
    if (elements.assignPhotoScopeMineBtn) {
        elements.assignPhotoScopeMineBtn.addEventListener('click', async () => {
            assignPhotoScope = 'mine';
            syncAssignPhotoScopeButtons();
            await refreshAssignPhotoList();
        });
    }
    if (elements.assignPhotoScopeAllBtn) {
        elements.assignPhotoScopeAllBtn.addEventListener('click', async () => {
            assignPhotoScope = 'all';
            syncAssignPhotoScopeButtons();
            await refreshAssignPhotoList();
        });
    }

    if (elements.closeLocalPhotoDescModal) {
        elements.closeLocalPhotoDescModal.addEventListener('click', () => finishLocalPhotoDescription(''));
    }
    if (elements.skipLocalPhotoDescBtn) {
        elements.skipLocalPhotoDescBtn.addEventListener('click', () => finishLocalPhotoDescription(''));
    }
    if (elements.saveLocalPhotoDescBtn) {
        elements.saveLocalPhotoDescBtn.addEventListener('click', () => {
            const text = elements.localPhotoDescText
                ? elements.localPhotoDescText.value.trim()
                : '';
            finishLocalPhotoDescription(text);
        });
    }
    if (elements.localPhotoDescRecordBtn) {
        elements.localPhotoDescRecordBtn.addEventListener('click', toggleLocalPhotoDescRecording);
    }
    if (elements.localPhotoDescModal) {
        elements.localPhotoDescModal.addEventListener('click', (event) => {
            if (event.target === elements.localPhotoDescModal) {
                finishLocalPhotoDescription(
                    elements.localPhotoDescText ? elements.localPhotoDescText.value.trim() : ''
                );
            }
        });
    }
    
    // Cerrar modal de elementos cercanos
    if (elements.closeNearbyModal) {
        elements.closeNearbyModal.addEventListener('click', closeNearbyElementsModal);
    }
    if (elements.expandNearbyRadiusBtn) {
        elements.expandNearbyRadiusBtn.addEventListener('click', () => {
            expandNearbySearchRadius();
        });
    }
    if (elements.useLastNearbyLocationBtn) {
        elements.useLastNearbyLocationBtn.addEventListener('click', () => {
            useLastGoodNearbyLocation();
        });
    }
    
    // Cerrar modal de elementos cercanos haciendo clic fuera
    if (elements.nearbyElementsModal) {
        elements.nearbyElementsModal.addEventListener('click', function(event) {
            if (event.target === elements.nearbyElementsModal) {
                closeNearbyElementsModal();
            }
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
        elements.sendIncidenceBtn.addEventListener('click', () => {
            if (!ensureAuthenticatedForAction('send_incidence')) return;
            sendIncidenceFromPreview();
        });
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
    // NO ocultar la vista previa si hay foto o flujo de cierre activo
    const hasPreviewPhotos = photoGallery.length > 0 || !!currentPhotoData;
    if (elements.photoPreview && !hasPreviewPhotos && !pendingCloseIncidenceData) {
        elements.photoPreview.style.display = 'none';
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

// Función para detectar la orientación del dispositivo
// Esta función se llama cuando se presiona el botón de la cámara para capturar la orientación en tiempo real
function detectDeviceOrientation() {
    let orientation = 1; // Por defecto, normal (landscape/horizontal)
    
    try {
        let detectionMethod = 'none';
        
        // DEBUG: Mostrar información de orientación disponible
       // IMPORTANTE: Usar DeviceOrientationEvent (acelerómetro) como método principal
        // porque funciona incluso si la app está bloqueada en una orientación
        
        // MÉTODO PRINCIPAL: DeviceOrientationEvent (acelerómetro/giroscopio - más confiable)
        // Esta es la forma más precisa de detectar la orientación física del dispositivo
        if (deviceOrientationData && currentDeviceOrientation !== null) {
            orientation = currentDeviceOrientation;
            detectionMethod = 'DeviceOrientationEvent (acelerómetro) - PRINCIPAL';
            //console.log('📱 Orientación detectada por DeviceOrientationEvent:', orientation === 1 ? 'LANDSCAPE/HORIZONTAL' : 'PORTRAIT/VERTICAL');
            //console.log('   Datos del acelerómetro:', deviceOrientationData);
            //console.log('   Esta orientación se guardará en el EXIF de la foto');
        }
        // Método secundario: window.orientation (puede no cambiar si la app está bloqueada)
        else if (window.orientation !== undefined && window.orientation !== null) {
            const absAngle = Math.abs(window.orientation);
            
            console.log('🔍 DEBUG: window.orientation ACTUAL:', window.orientation, '° (abs:', absAngle, '°)');
            
            // 0° o 180° = landscape, 90° o -90° = portrait
            if (absAngle === 0 || absAngle === 180) {
                orientation = 1; // Landscape
                detectionMethod = 'window.orientation (landscape) - FALLBACK';
                //console.log('📱 Orientación detectada por window.orientation (FALLBACK): LANDSCAPE/HORIZONTAL');
            } else if (absAngle === 90) {
                orientation = 6; // Portrait
                detectionMethod = 'window.orientation (portrait) - FALLBACK';
                //console.log('📱 Orientación detectada por window.orientation (FALLBACK): PORTRAIT/VERTICAL');
            }
        }
        // Método terciario: screen.orientation.angle (puede no cambiar si la app está bloqueada)
        else if (screen.orientation && screen.orientation.angle !== undefined) {
            const angle = screen.orientation.angle;
            const normalizedAngle = ((angle % 360) + 360) % 360;
            
            //console.log('🔍 DEBUG: Ángulo actual de Screen Orientation API:', angle, '° (normalizado:', normalizedAngle, '°)');
            
            if (normalizedAngle === 0 || normalizedAngle === 180) {
                orientation = 1; // Landscape
                detectionMethod = 'Screen Orientation API angle (landscape) - FALLBACK';
                //console.log('📱 Orientación detectada por ángulo (FALLBACK): LANDSCAPE/HORIZONTAL');
            } else if (normalizedAngle === 90 || normalizedAngle === 270) {
                orientation = 6; // Portrait
                detectionMethod = 'Screen Orientation API angle (portrait) - FALLBACK';
                //console.log('📱 Orientación detectada por ángulo (FALLBACK): PORTRAIT/VERTICAL');
            }
        }
        
        // Verificación: Mostrar dimensiones del video (solo para debug)
        if (elements.photoVideo && elements.photoVideo.videoWidth && elements.photoVideo.videoHeight) {
            //console.log('🔍 DEBUG: Dimensiones de video (cámara):', elements.photoVideo.videoWidth, 'x', elements.photoVideo.videoHeight);
        }
        
        // Mostrar resultado final
        //console.log('✅ Orientación EXIF:', orientation, orientation === 1 ? '(LANDSCAPE/HORIZONTAL)' : '(PORTRAIT/VERTICAL)');
        //console.log('🎯 ORIENTACIÓN FINAL DETECTADA:', orientation, `(${detectionMethod})`);
        return orientation;
        
    } catch (error) {
        console.error('Error al detectar orientación:', error);
        return 1; // Por defecto, normal (landscape)
    }
}

// Obtener prefijo de nombre de archivo según la orientación actual/capturada
function getOrientationFilenamePrefix() {
    // Priorizar la orientación capturada en el momento de pulsar el botón de cámara
    let orientation = capturedOrientation;
    if (orientation === null || orientation === undefined) {
        orientation = currentDeviceOrientation;
    }
    
    // 1 = horizontal, 6 = vertical (según EXIF estándar que ya usamos)
    if (orientation === 6) {
        return 'V_'; // Vertical
    }
    if (orientation === 1) {
        return 'H_'; // Horizontal
    }
    // Si no sabemos la orientación, no añadimos prefijo
    return '';
}

// Función para añadir metadatos EXIF básicos a una imagen
// AVISO: piexif se ha eliminado; esta función ahora solo devuelve la imagen original.
async function addBasicEXIFToImage(imageDataUrl, orientationOverride = null) {
    console.log('ℹ️ addBasicEXIFToImage() llamado pero piexif está deshabilitado; se devuelve la imagen sin modificar.');
    return imageDataUrl;
}

// Capturar foto - FUNCIÓN PRINCIPAL (ahora con soporte para ImageCapture API y EXIF)
async function capturePhoto() {
    try {
        console.log('Capturando foto...'); // Debug
        
        let imageData;
        let hasEXIF = false;
        
        // Intentar usar ImageCapture API si está disponible (mejor calidad y posiblemente EXIF)
        if (photoStream && photoStream.getVideoTracks().length > 0 && typeof ImageCapture !== 'undefined') {
            try {
                console.log('📸 Intentando capturar con ImageCapture API...');
                const videoTrack = photoStream.getVideoTracks()[0];
                const imageCapture = new ImageCapture(videoTrack);
                
                // Intentar capturar como JPEG a resolución máxima disponible del sensor
                // IMPORTANTE: NO forzar imageWidth/imageHeight para no limitar la resolución
                let blob;
                try {
                    blob = await imageCapture.takePhoto();
                    console.log('✅ Foto capturada con ImageCapture API (sin restricciones de tamaño)');
                    console.log('📸 Tipo de blob:', blob.type, 'Tamaño:', blob.size, 'bytes');
                } catch (error) {
                    console.log('⚠️ Error al capturar foto con ImageCapture():', error);
                    // Como último recurso, intentar con opciones basadas en el vídeo
                    try {
                        blob = await imageCapture.takePhoto({
                            imageWidth: elements.photoVideo.videoWidth,
                            imageHeight: elements.photoVideo.videoHeight,
                            fillLightMode: 'auto',
                            redEyeReduction: false
                        });
                        console.log('✅ Foto capturada con ImageCapture API usando dimensiones del vídeo');
                    } catch (errorOptions) {
                        console.log('❌ Falló también la captura con opciones:', errorOptions);
                        throw errorOptions;
                    }
                }
                
                // Si el blob es PNG, convertirlo a JPEG para mejor soporte EXIF
                if (blob.type === 'image/png' || blob.type === '') {
                    console.log('🔄 Convirtiendo PNG a JPEG para soporte EXIF...');
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    const img = new Image();
                    
                    const imageUrl = URL.createObjectURL(blob);
                    blob = await new Promise((resolve, reject) => {
                        img.onload = () => {
                            canvas.width = img.width;
                            canvas.height = img.height;
                            ctx.drawImage(img, 0, 0);
                            canvas.toBlob((jpegBlob) => {
                                URL.revokeObjectURL(imageUrl);
                                if (jpegBlob) {
                                    resolve(jpegBlob);
                                } else {
                                    reject(new Error('Error al convertir a JPEG'));
                                }
                            }, 'image/jpeg', 0.9);
                        };
                        img.onerror = reject;
                        img.src = imageUrl;
                    });
                    console.log('✅ Convertido a JPEG:', blob.type, 'Tamaño:', blob.size, 'bytes');
                }
                
                // Convertir blob a data URL
                const reader = new FileReader();
                imageData = await new Promise((resolve, reject) => {
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
                
                // Verificar que la imagen sea JPEG antes de añadir EXIF
                if (!imageData.startsWith('data:image/jpeg')) {
                    console.log('🔄 La imagen no es JPEG, convirtiendo...');
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    const img = new Image();
                    
                    imageData = await new Promise((resolve, reject) => {
                        img.onload = () => {
                            canvas.width = img.width;
                            canvas.height = img.height;
                            ctx.drawImage(img, 0, 0);
                            resolve(canvas.toDataURL('image/jpeg', 0.9));
                        };
                        img.onerror = reject;
                        img.src = imageData;
                    });
                    console.log('✅ Convertido a JPEG');
                }
                
                // Intentar leer EXIF de la foto capturada
                try {
                    await new Promise((resolve) => {
                        // Crear un nuevo blob desde el imageData para leer EXIF
                        const base64Data = imageData.split(',')[1];
                        const byteString = atob(base64Data);
                        const mimeString = 'image/jpeg';
                        const ab = new ArrayBuffer(byteString.length);
                        const ia = new Uint8Array(ab);
                        for (let i = 0; i < byteString.length; i++) {
                            ia[i] = byteString.charCodeAt(i);
                        }
                        const blobForEXIF = new Blob([ab], { type: mimeString });
                        const fileForEXIF = new File([blobForEXIF], 'photo.jpg', { type: mimeString });
                        
                        readEXIFFromFile(fileForEXIF, (exifData) => {
                            if (exifData && exifData.Orientation) {
                                hasEXIF = true;
                                console.log('✅ EXIF nativo encontrado en foto capturada:', exifData);
                                resolve();
                            } else {
                                // Si no tiene EXIF nativo o no tiene orientación, añadirlo
                                console.log('📝 Añadiendo EXIF con orientación a foto de ImageCapture...');
                                // Usar la orientación capturada al presionar el botón, o detectarla ahora si no está disponible
                                const detectedOrientation = capturedOrientation !== null ? capturedOrientation : detectDeviceOrientation();
                                console.log('📐 Usando orientación:', detectedOrientation, capturedOrientation !== null ? '(capturada al presionar botón)' : '(detectada ahora)');
                                addBasicEXIFToImage(imageData, detectedOrientation).then((newImageData) => {
                                    imageData = newImageData;
                                    hasEXIF = true;
                                    resolve();
                                }).catch((error) => {
                                    console.error('Error al añadir EXIF:', error);
                                    resolve(); // Continuar aunque falle
                                });
                            }
                        });
                    });
                } catch (exifError) {
                    console.log('⚠️ No se pudo leer EXIF de la foto capturada, añadiendo EXIF básico:', exifError);
                    // Añadir EXIF básico si no se pudo leer
                    // Usar la orientación capturada al presionar el botón, o detectarla ahora si no está disponible
                    const detectedOrientation = capturedOrientation !== null ? capturedOrientation : detectDeviceOrientation();
                    console.log('📐 Usando orientación:', detectedOrientation, capturedOrientation !== null ? '(capturada al presionar botón)' : '(detectada ahora)');
                    imageData = await addBasicEXIFToImage(imageData, detectedOrientation);
                    hasEXIF = true;
                }
                
            } catch (imageCaptureError) {
                console.log('⚠️ ImageCapture API no disponible o falló, usando método alternativo:', imageCaptureError);
                // Continuar con el método alternativo
            }
        }
        
        // Método alternativo: capturar desde canvas (si ImageCapture no funcionó)
        if (!imageData) {
            if (!elements.photoVideo.videoWidth || !elements.photoVideo.videoHeight) {
                showStatus('La cámara no está lista. Espera un momento.', 'error');
                return;
            }
            
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            
            canvas.width = elements.photoVideo.videoWidth;
            canvas.height = elements.photoVideo.videoHeight;
            
            context.drawImage(elements.photoVideo, 0, 0);
            
            imageData = canvas.toDataURL('image/jpeg', 0.9);
            
            // Usar la orientación capturada al presionar el botón, o detectarla ahora si no está disponible
            console.log('🔍 DEBUG: Usando orientación capturada al presionar botón...');
            console.log('🔍 DEBUG: videoWidth x videoHeight:', elements.photoVideo.videoWidth, 'x', elements.photoVideo.videoHeight);
            const detectedOrientation = capturedOrientation !== null ? capturedOrientation : detectDeviceOrientation();
            console.log('📐 Orientación para EXIF:', detectedOrientation, capturedOrientation !== null ? '(capturada al presionar botón)' : '(detectada ahora)');
            
            // Añadir metadatos EXIF básicos manualmente con orientación correcta
            console.log('📝 Añadiendo metadatos EXIF básicos con orientación:', detectedOrientation);
            imageData = await addBasicEXIFToImage(imageData, detectedOrientation);
            hasEXIF = true; // Ahora tiene EXIF básico
            
            // Leer EXIF añadido para debug (sin mostrar alertas)
            setTimeout(() => {
                readEXIFFromBase64(imageData, (exifData) => {
                    if (exifData) {
                        console.log('✅ EXIF básico añadido:', exifData);
                        console.log('🔍 DEBUG: Orientación en EXIF leído:', exifData.Orientation);
                    }
                });
            }, 500);
        }
        
        // Limpiar la orientación capturada después de usarla
        capturedOrientation = null;

        if (photoMode === 'guardar_local') {
            await persistLocalPhotoFromCapture(imageData);
            stopPhotoCamera();
            closePhotoModal();
            photoMode = null;
            return;
        }
        
        // Verificar el modo: 'reportar', 'cerrar' o 'añadir'
        if (photoMode === 'reportar' || photoMode === 'cerrar') {
            // Modo "Reportar Incidencia" o "Cerrar incidencia": establecer como imagenia
            imagenia = imageData;
            currentPhotoData = imageData; // Mantener para compatibilidad
            
            // Normalizar imagenia a objeto si es necesario
            const orientationPrefix = getOrientationFilenamePrefix();
            const imageniaObj = typeof imageData === 'string' ? {
                base64: imageData,
                url: null,
                file_id: null,
                filename: `${orientationPrefix}main_photo_${Date.now()}.jpg`,
                converted: false
            } : imageData;
            
            // Limpiar solo las fotos adicionales (mantener fotos adicionales existentes)
            // La galería mostrará: imagenia + fotos adicionales existentes
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
            
            const imgDbg = typeof imageData === 'string' ? imageData.substring(0, 100) : '[objeto]';
            console.log('📸 Imagenia capturada (para IA):', imgDbg + '...');
        } else if (photoMode === 'añadir') {
            // Modo "Añadir Fotos": solo añadir a la galería, NO tocar imagenia
            addPhotoToGallery(imageData);
            console.log('📸 Foto adicional capturada:', imageData.substring(0, 100) + '...'); // Debug
        } else {
            // Modo no definido: por defecto, establecer como imagenia
            imagenia = imageData;
            currentPhotoData = imageData;
            
            // Normalizar a objeto
            const orientationPrefix = getOrientationFilenamePrefix();
            const imageniaObj = typeof imageData === 'string' ? {
                base64: imageData,
                url: null,
                file_id: null,
                filename: `${orientationPrefix}main_photo_${Date.now()}.jpg`,
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
            syncSendIncidenceBtnLabel();
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
            
            // Aviso provisional de EXIF eliminado: ya no mostramos EXIF ni alertas al importar
            
            reader.onload = async function(e) {
                const imageData = e.target.result;

                if (photoMode === 'guardar_local') {
                    if (index === 0) {
                        await persistLocalPhotoFromCapture(imageData);
                        stopPhotoCamera();
                        closePhotoModal();
                        photoMode = null;
                    }
                    return;
                }
                
                // Verificar el modo: 'reportar', 'cerrar' o 'añadir'
                if (photoMode === 'reportar' || photoMode === 'cerrar') {
                    // Modo "Reportar Incidencia" o "Cerrar incidencia": establecer como imagenia
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
                    if (photoMode === 'reportar' || photoMode === 'cerrar') {
                        console.log('📸 Imagenia importada desde Reportar/Cerrar Incidencia');
                        
                        // Normalizar imagenia a objeto si es necesario
                        const orientationPrefix = getOrientationFilenamePrefix();
                        const imageniaObj = typeof imagenia === 'string' ? {
                            base64: imagenia,
                            url: null,
                            file_id: null,
                            filename: `${orientationPrefix}main_photo_${Date.now()}.jpg`,
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
                        syncSendIncidenceBtnLabel();
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
                            syncSendIncidenceBtnLabel();
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
            const orientationPrefix = getOrientationFilenamePrefix();
            photoObj = {
                base64: imageData,
                url: null,
                file_id: null,
                filename: `${orientationPrefix}photo_${Date.now()}_${photoGallery.length + 1}.jpg`,
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

/** Texto bajo la galería (solo aplica a flujos donde el envío es inmediato al pulsar Enviar) */
const PHOTO_PREVIEW_UPLOAD_HINT_DEFAULT =
    '<i class="fas fa-info-circle"></i> La incidencia se enviará al sistema. Puedes seguir usando la aplicación.';

const SEND_INCIDENCE_BTN_HTML_REPORT =
    '<i class="fas fa-exclamation-triangle"></i> Enviar Incidencia';
const SEND_INCIDENCE_BTN_HTML_CLOSE =
    '<i class="fas fa-check-circle"></i> Cerrar incidencia';

/** Etiqueta del botón principal según flujo: nueva incidencia vs cierre de existente */
function syncSendIncidenceBtnLabel() {
    if (!elements.sendIncidenceBtn) return;
    elements.sendIncidenceBtn.innerHTML =
        isCloseIncidenceFlow() ? SEND_INCIDENCE_BTN_HTML_CLOSE : SEND_INCIDENCE_BTN_HTML_REPORT;
}

function setSendIncidenceBtnBusy(busy) {
    if (!elements.sendIncidenceBtn) return;
    elements.sendIncidenceBtn.disabled = !!busy;
    elements.sendIncidenceBtn.style.opacity = busy ? '0.65' : '1';
    elements.sendIncidenceBtn.style.pointerEvents = busy ? 'none' : '';
}

/** Construye payload de imágenes para BC (URL o base64). */
function buildIncidenceImagesPayload(photosToSend, namePrefix) {
    const out = [];
    photosToSend.forEach((photoObj, index) => {
        if (typeof photoObj === 'object' && photoObj && photoObj.url) {
            out.push({
                file: photoObj.url,
                name: photoObj.filename || `${namePrefix}_${index + 1}.jpg`,
                file_id: photoObj.file_id
            });
            return;
        }
        const base64Data = typeof photoObj === 'string' ? photoObj : (photoObj && photoObj.base64);
        if (!base64Data) return;
        out.push({
            file: base64Data,
            name: (typeof photoObj === 'object' && photoObj && photoObj.filename)
                ? photoObj.filename
                : `${namePrefix}_${index + 1}.jpg`
        });
    });
    return out;
}

/** True si el usuario está cerrando una incidencia existente (mapa, enlace, etc.). */
function isCloseIncidenceFlow() {
    return photoMode === 'cerrar' || !!pendingCloseIncidenceData;
}

/** POST /api/incidences y espera respuesta (cierre y envíos que deben confirmarse). */
async function postIncidenceApi(payload) {
    console.log('📡 POST /api/incidences', {
        state: payload.state,
        documentNo: payload.documentNo,
        resource: payload.resource,
        images: (payload.image || []).length
    });
    const response = await fetch('/api/incidences', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Device-ID': deviceId
        },
        body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!result.success) {
        const msg = result.error || `Error HTTP ${response.status}`;
        throw new Error(msg);
    }
    return result;
}

function closeIncidenceDescription(p) {
    const d = String(p.description || '').trim();
    if (d) return d;
    const o = String(p.observation || '').trim();
    if (o) return o;
    const doc = String(p.documentNo || '').trim();
    return doc ? `Cierre incidencia ${doc}` : 'Cierre de incidencia';
}

/** Espera a que las fotos tengan URL o base64 (p. ej. conversión en curso). */
async function waitForPhotosReady(photos, maxMs = 12000) {
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
        const ready = buildIncidenceImagesPayload(photos, 'cierre');
        if (ready.length > 0) return ready;
        await new Promise((r) => setTimeout(r, 250));
    }
    return buildIncidenceImagesPayload(photos, 'cierre');
}

/** EnProgreso (si aplica) + Cerrada con foto para incidencia ya identificada. */
async function submitCloseIncidenceWithPhotos(photosToSend) {
    const p = pendingCloseIncidenceData;
    if (!p) {
        throw new Error('No hay datos de la incidencia a cerrar.');
    }

    const docNo = String(p.documentNo || '').trim();
    if (!docNo) {
        throw new Error('Falta el número de incidencia (documentNo) para cerrar.');
    }

    showStatus('Preparando foto de cierre...', 'info');
    const closeImages = await waitForPhotosReady(photosToSend);
    if (!closeImages.length) {
        throw new Error('No hay fotos válidas para cerrar la incidencia.');
    }

    const desc = closeIncidenceDescription(p);
    const baseFields = {
        incidenceType: p.incidenceType || INCIDENCE_TYPE_FALLBACK,
        incidenceSubType: p.incidenceSubType,
        observation: p.observation || '',
        description: desc,
        resource: p.resource,
        documentNo: docNo
    };

    if (p.needsEnProgresoBeforeClose) {
        showStatus('Poniendo incidencia en progreso...', 'info');
        try {
            await postIncidenceApi({
                state: 'EnProgreso',
                ...baseFields,
                image: [],
                audio: []
            });
        } catch (e) {
            console.warn('EnProgreso antes de cerrar:', e.message);
            // Continuar con Cerrada: en algunos entornos la incidencia ya está en progreso
        }
    }

    showStatus('Cerrando incidencia...', 'info');
    await postIncidenceApi({
        state: 'Cerrada',
        ...baseFields,
        image: closeImages,
        audio: []
    });
    showStatus('Incidencia cerrada y enviada', 'success');
}

/** En cierre con foto el envío real ocurre al pulsar Enviar: no mostrar el mensaje hasta entonces */
function syncPhotoPreviewUploadHint() {
    if (!elements.photoPreviewUploadHint) return;
    if (isCloseIncidenceFlow()) {
        elements.photoPreviewUploadHint.style.display = 'none';
    } else {
        elements.photoPreviewUploadHint.style.display = '';
        elements.photoPreviewUploadHint.innerHTML = PHOTO_PREVIEW_UPLOAD_HINT_DEFAULT;
    }
    syncSendIncidenceBtnLabel();
}

function showPhotoPreviewUploadHintSending() {
    if (!elements.photoPreviewUploadHint) return;
    elements.photoPreviewUploadHint.style.display = '';
    elements.photoPreviewUploadHint.innerHTML = PHOTO_PREVIEW_UPLOAD_HINT_DEFAULT;
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
    syncPhotoPreviewUploadHint();
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
    pendingIncidenceData.emtGis = null;
    
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
        
        const pickTs = await openIncidenceTypeSubtypePicker({});
        if (!pickTs) {
            showStatus('Debes elegir tipo y subtipo de incidencia', 'warning');
            return;
        }
        const defaultType = pickTs.type;
        const incidenceSubType = pickTs.subtype;
        
        if (hasQRData) {
            // Usar datos de QR
            const qrId = extractQRId(currentQRData);
            incidencePayload = {
                state: 'PENDING',
                incidenceType: defaultType,
                incidenceSubType: incidenceSubType,
                observation: currentQRData,
                description: 'Incidencia reportada con QR',
                resource: qrId,
                image: images,
                audio: []
            };
        } else {
            // Usar datos de audio o parada/recurso desde URL (Rutas)
            const resource = pendingIncidenceData.resourceFromUrl != null
                ? pendingIncidenceData.resourceFromUrl
                : (pendingIncidenceData.stopNumber ? `PARADA_${pendingIncidenceData.stopNumber}` : null);
            incidencePayload = {
                state: 'PENDING',
                incidenceType: defaultType,
                incidenceSubType: incidenceSubType,
                observation: pendingIncidenceData.fullText || 'Incidencia reportada con audio',
                description: pendingIncidenceData.description || 'Incidencia reportada con audio',
                resource: resource,
                image: images,
                audio: []
            };
        }
        
        console.log('📋 Enviando incidencia con foto:', incidencePayload);
        console.log('🔍 Datos de audio pendientes:', pendingIncidenceData);
        console.log('📸 Total de fotos a enviar:', photosToSend.length);
        console.log('📸 Fotos en galería:', photoGallery.length);
        
        // Enviar incidencia en segundo plano (no bloquea la UI)
        const resourceLabel = pendingIncidenceData.resourceFromUrl != null
            ? pendingIncidenceData.resourceFromUrl
            : (pendingIncidenceData.stopNumber ? `Parada ${pendingIncidenceData.stopNumber}` : '');
        const successMessage = hasQRData 
            ? 'Incidencia enviada con QR'
            : (resourceLabel ? `Incidencia enviada: ${resourceLabel} - ${pendingIncidenceData.description}` : 'Incidencia enviada.');
        
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
        
        // Resetear bandera de entrada manual
        manualEntryRequested = false;
        
        // Mostrar modal de procesamiento
        showAIResultsModal();
        elements.aiProcessingStatus.style.display = 'block';
        elements.aiResultsForm.style.display = 'none';
        elements.confirmAIResultsBtn.style.display = 'none';
        // Mostrar botón de entrada manual durante el procesamiento
        if (elements.manualEntryBtn) {
            elements.manualEntryBtn.style.display = 'flex';
        }
        
        // Crear AbortController para poder cancelar el fetch
        aiProcessingController = new AbortController();
        
        console.log('📸 Enviando imagen principal a IA...');
        console.log('📸 Tipo de imagen:', typeof photoForAI);
        console.log('📸 Longitud de imagen:', photoForAI ? photoForAI.length : 'N/A');
        console.log('📸 Primeros 100 caracteres:', photoForAI ? photoForAI.substring(0, 100) : 'N/A');
        
        // Enviar imagen principal al backend para procesar con LM Studio
        const response = await fetch('/api/process-image-ai', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Device-ID': deviceId
            },
            body: JSON.stringify({
                image: photoForAI
            }),
            signal: aiProcessingController.signal
        });
        
        console.log('📡 Respuesta recibida del servidor, status:', response.status);
        
        const result = await response.json();
        
        if (!result.success) {
            showStatus('Error al procesar imagen con IA: ' + result.error, 'error');
            console.error('❌ Error procesando imagen:', result.error);
            
            // Ocultar modal de procesamiento
            elements.aiProcessingStatus.style.display = 'none';
            // Ocultar botón de entrada manual
            if (elements.manualEntryBtn) {
                elements.manualEntryBtn.style.display = 'none';
            }
            
            // Limpiar el controller
            aiProcessingController = null;
            
            // Mostrar mensaje de error
            alert('Error al procesar imagen con IA:\n' + result.error + '\n\nAsegúrate de que LM Studio esté corriendo en http://192.168.10.238:1234');
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
        // Ocultar botón de entrada manual
        if (elements.manualEntryBtn) {
            elements.manualEntryBtn.style.display = 'none';
        }
        
        // Limpiar el controller ya que el procesamiento terminó
        aiProcessingController = null;
        
        // Cargar tipos de incidencia antes de mostrar el formulario
        await loadIncidenceTypesToSelect();
        
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
        // Si el error es por abort, no mostrar mensaje de error
        if (error.name === 'AbortError' || error.message === 'The user aborted a request.') {
            console.log('🛑 Procesamiento de IA cancelado por el usuario');
            // Ocultar estado de procesamiento
            if (elements.aiProcessingStatus) {
                elements.aiProcessingStatus.style.display = 'none';
            }
            // Ocultar botón de entrada manual
            if (elements.manualEntryBtn) {
                elements.manualEntryBtn.style.display = 'none';
            }
            // Limpiar el controller
            aiProcessingController = null;
            // No cerrar el modal aquí, ya que handleManualEntry lo hará
            return;
        }
        
        console.error('❌ Error procesando imagen con IA:', error);
        showStatus('Error al procesar imagen con IA: ' + error.message, 'error');
        
        elements.aiProcessingStatus.style.display = 'none';
        // Ocultar botón de entrada manual
        if (elements.manualEntryBtn) {
            elements.manualEntryBtn.style.display = 'none';
        }
        
        // Limpiar el controller
        aiProcessingController = null;
        
        alert('Error al procesar imagen con IA:\n' + error.message);
        closeAIResultsModal();
    }
}

/** Normaliza campo EMT de MobiliarioGis / RecursosGis: 1, 0 o null si no aplica */
function normalizeEmtFromElement(element) {
    if (!element || element.EMT === undefined || element.EMT === null) {
        return null;
    }
    const v = element.EMT;
    const s = String(v).trim().toLowerCase();
    if (v === true || v === 1 || v === '1') return 1;
    if (s === 'true') return 1;
    if (v === false || v === 0 || v === '0') return 0;
    if (s === 'false') return 0;
    return null;
}

/** Tipos permitidos en el picker según GIS / mobiliario (misma lógica que envío desde preview) */
async function computeAllowedTypesForPickerFromPending() {
    await ensureEmtGisFromPendingContext();
    const emtGis = pendingIncidenceData.emtGis;
    if (emtGis === 1) return ['EMT'];
    const res = await fetch('/api/incidence-types');
    const typesData = await res.json();
    if (!typesData.success) return [];
    let incidenceTypes = (typesData.types || []).slice();
    if (emtGis !== 1) incidenceTypes = incidenceTypes.filter(t => t !== 'EMT');
    if (pendingIncidenceData.isMobiliario && !pendingIncidenceData.isParadaBus) {
        incidenceTypes = incidenceTypes.filter(type =>
            ['EMT', 'Mobiliario Urbano', 'Vallas'].includes(type));
    }
    return incidenceTypes;
}

async function getIncidencePickerOptionsFromPending() {
    await ensureEmtGisFromPendingContext();
    const emtGis = pendingIncidenceData.emtGis;
    if (emtGis === 1) {
        return { forcedType: 'EMT', allowedTypes: null };
    }
    const allowedTypes = await computeAllowedTypesForPickerFromPending();
    return { forcedType: null, allowedTypes };
}

/**
 * Modal con listas desplegables para tipo y subtipo.
 * Si no pasas opciones, usa el contexto de pendingIncidenceData (GIS, parada, etc.).
 */
async function openIncidenceTypeSubtypePicker(options = {}) {
    if (!elements.incidencePickerModal || !elements.pickerIncidenceType || !elements.pickerIncidenceSubType) {
        showStatus('Interfaz de selección no disponible', 'error');
        return null;
    }

    let { forcedType = null, allowedTypes = null } = options;
    const dataRes = await fetch('/api/incidence-types');
    const data = await dataRes.json();
    incidencePickerAllSubtypes = (data.success && data.subtypes && data.subtypes.length)
        ? data.subtypes.slice()
        : INCIDENCE_SUBTYPES_FALLBACK.slice();

    if (!forcedType && (!allowedTypes || !allowedTypes.length)) {
        const o = await getIncidencePickerOptionsFromPending();
        forcedType = o.forcedType;
        allowedTypes = o.allowedTypes;
    }

    let typesForPicker;
    if (forcedType) {
        typesForPicker = [forcedType];
        elements.pickerIncidenceType.disabled = true;
        if (elements.pickerIncidenceTypeGroup) elements.pickerIncidenceTypeGroup.style.opacity = '0.9';
    } else {
        elements.pickerIncidenceType.disabled = false;
        if (elements.pickerIncidenceTypeGroup) elements.pickerIncidenceTypeGroup.style.opacity = '1';
        typesForPicker = (allowedTypes || []).slice();
    }

    if (!typesForPicker.length) {
        showStatus('No hay tipos de incidencia disponibles', 'error');
        return null;
    }

    elements.pickerIncidenceType.innerHTML = '';
    typesForPicker.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        elements.pickerIncidenceType.appendChild(opt);
    });
    elements.pickerIncidenceType.value = typesForPicker[0];
    refillPickerSubtypeSelect(elements.pickerIncidenceType.value, incidencePickerAllSubtypes);

    return new Promise((resolve) => {
        incidencePickerResolve = resolve;
        elements.incidencePickerModal.style.display = 'block';
    });
}

/** Subtipo por defecto según tipo (audio/pruebas) */
async function resolveIncidenceSubtypeForPayload() {
    if (pendingIncidenceData.incidenceSubType) {
        return pendingIncidenceData.incidenceSubType;
    }
    const incType = pendingIncidenceData.incidenceType || await getDefaultIncidenceType();
    try {
        const r = await fetch('/api/incidence-types?incidenceType=' + encodeURIComponent(incType));
        const d = await r.json();
        if (d.success && d.subtypes && d.subtypes.length) return d.subtypes[0];
    } catch (e) { /* ignore */ }
    const loc = filterSubtypesForIncidenceType(incType, INCIDENCE_SUBTYPES_FALLBACK);
    return loc[0] || 'Mantenimiento';
}

// Función para cargar tipos de incidencia en el select
async function loadIncidenceTypesToSelect() {
    try {
        await ensureEmtGisFromPendingContext();
        const typesResponse = await fetch('/api/incidence-types');
        const typesData = await typesResponse.json();
        
        if (!typesData.success || !elements.aiIncidenceType) {
            console.warn('⚠️ No se pudieron cargar los tipos de incidencia');
            aiModalAllSubtypes = INCIDENCE_SUBTYPES_FALLBACK.slice();
            if (elements.aiIncidenceSubType) {
                elements.aiIncidenceSubType.innerHTML = '';
                filterSubtypesForIncidenceType(INCIDENCE_TYPE_FALLBACK, aiModalAllSubtypes).forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s;
                    opt.textContent = s;
                    elements.aiIncidenceSubType.appendChild(opt);
                });
                elements.aiIncidenceSubType.value = elements.aiIncidenceSubType.options[0]
                    ? elements.aiIncidenceSubType.options[0].value
                    : 'Mantenimiento';
            }
            return INCIDENCE_TYPE_FALLBACK; // Fallback
        }
        
        const emt = pendingIncidenceData.emtGis;
        let types = (typesData.types || []).slice();
        if (emt === 1) {
            types = ['EMT'];
        } else {
            types = types.filter(t => t !== 'EMT');
        }
        if (types.length === 0) {
            types = emt === 1 ? ['EMT'] : [INCIDENCE_TYPE_FALLBACK];
        }
        
        // En esta pantalla el tipo va fijado por recurso/parada (no editable).
        const configuredDefaultType = typesData.default_type || INCIDENCE_TYPE_FALLBACK;
        const fixedType = resolveFixedIncidenceTypeForAi(types, configuredDefaultType);

        // Limpiar opciones existentes
        elements.aiIncidenceType.innerHTML = '';
        const option = document.createElement('option');
        option.value = fixedType;
        option.textContent = fixedType;
        elements.aiIncidenceType.appendChild(option);
        elements.aiIncidenceType.value = fixedType;
        elements.aiIncidenceType.disabled = true;
        if (emt === 1) {
            elements.aiIncidenceType.title = 'Tipo fijado: este elemento solo admite incidencias EMT';
        } else {
            elements.aiIncidenceType.title = 'Tipo fijado automáticamente según recurso/parada';
        }

        aiModalAllSubtypes = (typesData.subtypes && typesData.subtypes.length)
            ? typesData.subtypes.slice()
            : INCIDENCE_SUBTYPES_FALLBACK.slice();

        if (elements.aiIncidenceSubType && elements.aiIncidenceType) {
            elements.aiIncidenceType.removeEventListener('change', onAiIncidenceTypeChangeForSubtype);
            elements.aiIncidenceType.addEventListener('change', onAiIncidenceTypeChangeForSubtype);
            onAiIncidenceTypeChangeForSubtype();
            const defSub = typesData.default_subtype;
            const curType = elements.aiIncidenceType.value;
            const allowed = filterSubtypesForIncidenceType(curType, aiModalAllSubtypes);
            if (defSub && allowed.includes(defSub)) elements.aiIncidenceSubType.value = defSub;
            elements.aiIncidenceSubType.disabled = false;
        }
        
        return fixedType;
    } catch (error) {
        console.error('❌ Error al cargar tipos de incidencia:', error);
        return INCIDENCE_TYPE_FALLBACK; // Fallback
    }
}

// Mostrar modal de resultados de IA
async function showAIResultsModal(isManualEntry = false) {
    if (elements.aiResultsModal) {
        // Cargar tipos de incidencia antes de mostrar el modal
        await loadIncidenceTypesToSelect();
        
        // Cambiar título según el modo
        const modalTitle = document.getElementById('aiResultsModalTitle');
        if (modalTitle) {
            if (isManualEntry) {
                modalTitle.innerHTML = '<i class="fas fa-keyboard"></i> Ingresar Datos de Incidencia';
            } else {
                modalTitle.innerHTML = '<i class="fas fa-robot"></i> Resultados de IA - Revisar y Corregir';
            }
        }
        
        elements.aiResultsModal.style.display = 'block';
    }
}

// Cerrar modal de resultados de IA
function closeAIResultsModal() {
    // Cancelar procesamiento de IA si está en curso
    if (aiProcessingController) {
        aiProcessingController.abort();
        aiProcessingController = null;
    }
    
    if (elements.aiResultsModal) {
        elements.aiResultsModal.style.display = 'none';
        
        // Restaurar título original del modal
        const modalTitle = document.getElementById('aiResultsModalTitle');
        if (modalTitle) {
            modalTitle.innerHTML = '<i class="fas fa-robot"></i> Resultados de IA - Revisar y Corregir';
        }
        
        // Limpiar campos
        if (elements.aiIncidenceType) {
            elements.aiIncidenceType.value = INCIDENCE_TYPE_FALLBACK;
            elements.aiIncidenceType.disabled = false;
            elements.aiIncidenceType.title = '';
        }
        if (elements.aiIncidenceSubType) {
            elements.aiIncidenceSubType.innerHTML = '';
            elements.aiIncidenceSubType.disabled = false;
        }
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
    
    // Ocultar botón de entrada manual
    if (elements.manualEntryBtn) {
        elements.manualEntryBtn.style.display = 'none';
    }
    
    // Resetear bandera de entrada manual
    manualEntryRequested = false;
}

// Función para manejar la entrada manual de datos
async function handleManualEntry() {
    console.log('⌨️ Usuario eligió ingresar datos manualmente');
    
    // Marcar que el usuario eligió entrada manual
    manualEntryRequested = true;
    
    // Cancelar procesamiento de IA si está en curso
    if (aiProcessingController) {
        aiProcessingController.abort();
        aiProcessingController = null;
        console.log('🛑 Procesamiento de IA cancelado');
    }
    
    // Ocultar estado de procesamiento inmediatamente
    if (elements.aiProcessingStatus) {
        elements.aiProcessingStatus.style.display = 'none';
    }
    
    // Ocultar botón de entrada manual
    if (elements.manualEntryBtn) {
        elements.manualEntryBtn.style.display = 'none';
    }
    
    // Cerrar modal de IA
    closeAIResultsModal();
    
    // Limpiar datos de IA
    pendingIncidenceData.hasAI = false;
    pendingIncidenceData.description = null;
    pendingIncidenceData.stopNumber = null;
    pendingIncidenceData.fullText = null;
    
    // Pequeño delay para asegurar que el modal se cierre completamente
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Mostrar el modal de IA con campos vacíos para entrada manual
    console.log('📝 Abriendo modal de entrada manual...');
    
    // Cargar tipos de incidencia y establecer EMT por defecto
    await loadIncidenceTypesToSelect();
    
    // Limpiar campos
    if (elements.aiStopNumber) {
        elements.aiStopNumber.value = '';
    }
    if (elements.aiDescription) {
        elements.aiDescription.value = '';
    }
    
    // Ocultar estado de procesamiento
    if (elements.aiProcessingStatus) {
        elements.aiProcessingStatus.style.display = 'none';
    }
    
    // Mostrar formulario
    if (elements.aiResultsForm) {
        elements.aiResultsForm.style.display = 'block';
    }
    
    // Mostrar botón de confirmar
    if (elements.confirmAIResultsBtn) {
        elements.confirmAIResultsBtn.style.display = 'flex';
    }
    
    // Ocultar botón de entrada manual (ya no es necesario)
    if (elements.manualEntryBtn) {
        elements.manualEntryBtn.style.display = 'none';
    }
    
    // Ocultar respuesta completa de IA
    if (elements.aiRawResponse) {
        elements.aiRawResponse.style.display = 'none';
    }
    
    // Cambiar título del modal para entrada manual
    const modalTitle = document.getElementById('aiResultsModalTitle');
    if (modalTitle) {
        modalTitle.innerHTML = '<i class="fas fa-keyboard"></i> Ingresar Datos de Incidencia';
    }
    
    // Mostrar el modal
    if (elements.aiResultsModal) {
        elements.aiResultsModal.style.display = 'block';
    }
}

// Confirmar resultados de IA y enviar incidencia
async function confirmAIResults() {
    try {
        await ensureEmtGisFromPendingContext();
        let incidenceType = elements.aiIncidenceType ? elements.aiIncidenceType.value : await getDefaultIncidenceType();
        const emt = pendingIncidenceData.emtGis;
        if (emt === 1) incidenceType = 'EMT';
        if (emt !== 1 && incidenceType === 'EMT') {
            showStatus('Este elemento no admite incidencias tipo EMT', 'error');
            alert('Este elemento no admite incidencias tipo EMT. Elige otro tipo.');
            return;
        }
        const incidenceSubType = elements.aiIncidenceSubType ? elements.aiIncidenceSubType.value.trim() : '';
        if (!incidenceSubType) {
            showStatus('El subtipo de incidencia es obligatorio', 'error');
            alert('Selecciona un subtipo de incidencia.');
            return;
        }
        const allowedSubAi = filterSubtypesForIncidenceType(
            incidenceType,
            aiModalAllSubtypes.length ? aiModalAllSubtypes : INCIDENCE_SUBTYPES_FALLBACK
        );
        if (!allowedSubAi.includes(incidenceSubType)) {
            showStatus('El subtipo no es válido para el tipo seleccionado', 'error');
            alert('EMT no admite Poda ni Otras; otros tipos no admiten Tip. Elige un subtipo de la lista.');
            return;
        }
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
        
        console.log('✅ Confirmando resultados de IA:', { incidenceType, incidenceSubType, stopNumber, description });
        
        // Almacenar datos en pendingIncidenceData (preservar emtGis, URL Rutas, etc.)
        pendingIncidenceData = {
            ...pendingIncidenceData,
            stopNumber: stopNumber,
            description: description,
            fullText: `Parada ${stopNumber}, ${description}`,
            hasAudio: false,
            hasAI: true,
            incidenceType: incidenceType,
            incidenceSubType: incidenceSubType
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
        
        // Crear payload de la incidencia usando el tipo seleccionado
        const resource = pendingIncidenceData.resourceFromUrl != null
            ? pendingIncidenceData.resourceFromUrl
            : (pendingIncidenceData.stopNumber ? `PARADA_${pendingIncidenceData.stopNumber}` : null);
        const incidencePayload = {
            state: 'PENDING',
            incidenceType: incidenceType,
            incidenceSubType: incidenceSubType,
            observation: pendingIncidenceData.fullText,
            description: pendingIncidenceData.description,
            resource: resource,
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
            
            // Mostrar alert si el error es de autenticación
            if (result.error && (result.error.includes('usuario autenticado') || result.error.includes('No hay usuario autenticado'))) {
                alert('❌ Error de autenticación\n\n' + result.error + '\n\nPor favor, inicia sesión nuevamente.');
            }
            
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
        
        // Obtener tipo de incidencia por defecto
        const defaultType = await getDefaultIncidenceType();
        const defaultSub = await resolveIncidenceSubtypeForPayload();
        
        // Crear payload de la incidencia
        const incidencePayload = {
            state: 'PENDING',
            incidenceType: defaultType,
            incidenceSubType: defaultSub,
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
        
        // Obtener tipo de incidencia por defecto
        const defaultType = await getDefaultIncidenceType();
        const defaultSub = await resolveIncidenceSubtypeForPayload();
        
        // Crear payload de la incidencia
        const incidencePayload = {
            state: 'PENDING',
            incidenceType: defaultType,
            incidenceSubType: defaultSub,
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
        
        // Obtener tipo de incidencia por defecto
        const defaultType = await getDefaultIncidenceType();
        const defaultSub = await resolveIncidenceSubtypeForPayload();
        
        // Crear payload de prueba
        const testPayload = {
            state: 'PENDING',
            incidenceType: defaultType,
            incidenceSubType: defaultSub,
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
        console.log('📸 photoMode:', photoMode, 'pendingClose:', !!pendingCloseIncidenceData);
        console.log('📸 currentPhotoData existe:', !!currentPhotoData);
        console.log('📸 photoGallery.length:', photoGallery.length);
        console.log('📸 currentQRData:', currentQRData);
        
        // Verificar que tenemos fotos en la galería
        if (photoGallery.length === 0 && !currentPhotoData) {
            showStatus('No hay fotos para enviar', 'error');
            return;
        }
        
        // Si hay fotos en la galería, usarlas; si no, usar currentPhotoData para compatibilidad
        const photosToSend = photoGallery.length > 0 ? photoGallery : (currentPhotoData ? [currentPhotoData] : []);
        
        // Modo "Cerrar incidencia": POST Cerrada + documentNo + foto (no flujo de nueva incidencia)
        if (isCloseIncidenceFlow()) {
            if (!pendingCloseIncidenceData) {
                showStatus(
                    'No se encontraron los datos de cierre. Vuelve a pulsar "Cerrar incidencia" en el mapa.',
                    'error'
                );
                return;
            }
            if (photoMode !== 'cerrar') {
                photoMode = 'cerrar';
                syncSendIncidenceBtnLabel();
            }
            console.log('🔒 Cierre de incidencia:', {
                documentNo: pendingCloseIncidenceData.documentNo,
                photos: photosToSend.length
            });
            setSendIncidenceBtnBusy(true);
            try {
                showPhotoPreviewUploadHintSending();
                await submitCloseIncidenceWithPhotos(photosToSend);
                pendingCloseIncidenceData = null;
                photoMode = null;
                resetUIAfterIncidenceSent();
            } catch (e) {
                console.error('Error al cerrar incidencia:', e);
                showStatus(e.message || 'Error al cerrar la incidencia', 'error');
            } finally {
                setSendIncidenceBtnBusy(false);
            }
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
        // PERO solo si el usuario NO eligió entrada manual
        if (!hasQRData && !hasAudioData && !hasAIData && !manualEntryRequested) {
            console.log('🤖 No hay QR, audio ni IA, procesando imagen con IA...');
            await processImageWithAI();
            return; // processImageWithAI() manejará el envío
        } else {
            if (manualEntryRequested) {
                console.log('⌨️ Usuario eligió entrada manual, saltando procesamiento con IA');
                // Resetear la bandera después de usarla
                manualEntryRequested = false;
            } else {
                console.log('⚠️ Hay datos de QR/audio/IA, saltando procesamiento con IA');
            }
        }
        
        await ensureEmtGisFromPendingContext();
        const emtGis = pendingIncidenceData.emtGis;
        const pickTs = await openIncidenceTypeSubtypePicker({});
        if (!pickTs) {
            showStatus('Selección de tipo cancelada', 'info');
            return;
        }
        const selectedType = pickTs.type;
        const selectedSubType = pickTs.subtype;
        if (emtGis !== 1 && selectedType === 'EMT') {
            showStatus('Este elemento no admite incidencias tipo EMT', 'error');
            return;
        }
        pendingIncidenceData.incidenceSubType = selectedSubType;

        // Mostrar prompt con descripción pre-rellenada si está disponible
        let description;
        const prefillDescription = (pendingIncidenceData && pendingIncidenceData.description)
            ? String(pendingIncidenceData.description).trim()
            : '';

        if (hasAudioData && pendingIncidenceData.description) {
            parada_bus = prompt('Ingresa el número de parada:', pendingIncidenceData.stopNumber);
            pendingIncidenceData.stopNumber = parada_bus;
            description = prompt('Describe la incidencia:', prefillDescription);
            console.log('🎤 Descripción del audio pre-rellenada:', pendingIncidenceData.description);
        } else if (hasAIData && pendingIncidenceData.description) {
            parada_bus = prompt('Ingresa el número de parada:', pendingIncidenceData.stopNumber);
            pendingIncidenceData.stopNumber = parada_bus;
            description = prompt('Describe la incidencia:', prefillDescription);
            console.log('🤖 Descripción de la IA pre-rellenada:', pendingIncidenceData.description);
        } else if (prefillDescription) {
            description = prompt('Describe la incidencia:', prefillDescription);
            console.log('📷 Descripción de foto local pre-rellenada:', prefillDescription);
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

        // Usar recurso: desde URL (Rutas), audio/IA (parada), o QR
        let resource;
        if (pendingIncidenceData.resourceFromUrl != null && pendingIncidenceData.resourceFromUrl !== '') {
            resource = pendingIncidenceData.resourceFromUrl;
            console.log('🔗 Usando recurso desde URL (Rutas):', resource);
        } else if (pendingIncidenceData.stopNumber) {
            resource = `PARADA_${pendingIncidenceData.stopNumber}`;
            console.log('🚏 Usando recurso (parada desde URL o audio/IA):', resource);
        } else if (currentQRData) {
            resource = extractQRIdFromData(currentQRData);
            console.log('📱 Usando recurso del QR:', resource);
        } else {
            resource = null;
        }

        const payload = {
            state: 'PENDING',
            incidenceType: selectedType,
            incidenceSubType: selectedSubType,
            observation: (pendingIncidenceData.hasAudio || pendingIncidenceData.hasAI || pendingIncidenceData.hasLocalDescription)
                ? pendingIncidenceData.fullText
                : '',
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

    if (assignedLocalPhotoIdForIncidence) {
        const photoId = assignedLocalPhotoIdForIncidence;
        assignedLocalPhotoIdForIncidence = null;
        deletePendingPhotoAfterIncidenceSent(photoId);
    }
    
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
        hasAI: false,
        hasLocalDescription: false,
        isParadaBus: false,
        isMobiliario: false,
        elementData: null,
        resourceFromUrl: null,
        emtGis: null,
        incidenceSubType: null
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
    if (elements.photoPreviewUploadHint) {
        elements.photoPreviewUploadHint.style.display = '';
        elements.photoPreviewUploadHint.innerHTML = PHOTO_PREVIEW_UPLOAD_HINT_DEFAULT;
    }
    setAssignedLocalPhotoDescriptionVisible('');
    
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
        elements.sendIncidenceBtn.innerHTML = SEND_INCIDENCE_BTN_HTML_REPORT;
    }
    photoMode = null;
    pendingCloseIncidenceData = null;
    
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

// Función para añadir mensaje a la consola de debug en pantalla
function addDebugToScreen(message, type = 'log') {
    if (window.addDebugMessage) {
        window.addDebugMessage(type.toUpperCase(), message);
    }
}

// Función para leer EXIF de una imagen (archivo o base64)
function readEXIFFromFile(file, callback) {
    if (typeof EXIF === 'undefined') {
        console.warn('⚠️ Librería EXIF no disponible');
        callback(null);
        return;
    }
    
    EXIF.getData(file, function() {
        try {
            const exifData = {};
            
            // Información básica
            const make = EXIF.getTag(this, 'Make');
            const model = EXIF.getTag(this, 'Model');
            const orientation = EXIF.getTag(this, 'Orientation');
            const dateTime = EXIF.getTag(this, 'DateTime');
            const dateTimeOriginal = EXIF.getTag(this, 'DateTimeOriginal');
            
            // Información de la cámara
            if (make) exifData.Make = make;
            if (model) exifData.Model = model;
            if (orientation) exifData.Orientation = orientation;
            if (dateTime) exifData.DateTime = dateTime;
            if (dateTimeOriginal) exifData.DateTimeOriginal = dateTimeOriginal;
            
            // Configuración de la cámara
            const fNumber = EXIF.getTag(this, 'FNumber');
            const exposureTime = EXIF.getTag(this, 'ExposureTime');
            const isoSpeedRatings = EXIF.getTag(this, 'ISOSpeedRatings');
            const focalLength = EXIF.getTag(this, 'FocalLength');
            
            if (fNumber) exifData.FNumber = fNumber;
            if (exposureTime) exifData.ExposureTime = exposureTime;
            if (isoSpeedRatings) exifData.ISO = isoSpeedRatings;
            if (focalLength) exifData.FocalLength = focalLength;
            
            // GPS
            const gpsLatitude = EXIF.getTag(this, 'GPSLatitude');
            const gpsLongitude = EXIF.getTag(this, 'GPSLongitude');
            const gpsLatitudeRef = EXIF.getTag(this, 'GPSLatitudeRef');
            const gpsLongitudeRef = EXIF.getTag(this, 'GPSLongitudeRef');
            
            if (gpsLatitude && gpsLongitude) {
                let lat = gpsLatitude;
                let lon = gpsLongitude;
                
                if (gpsLatitudeRef === 'S') lat = -lat;
                if (gpsLongitudeRef === 'W') lon = -lon;
                
                exifData.GPS = {
                    latitude: lat,
                    longitude: lon
                };
            }
            
            // Dimensiones
            const pixelXDimension = EXIF.getTag(this, 'PixelXDimension');
            const pixelYDimension = EXIF.getTag(this, 'PixelYDimension');
            
            if (pixelXDimension) exifData.Width = pixelXDimension;
            if (pixelYDimension) exifData.Height = pixelYDimension;
            
            callback(Object.keys(exifData).length > 0 ? exifData : null);
        } catch (error) {
            console.error('Error al leer EXIF:', error);
            callback(null);
        }
    });
}

// Función para leer EXIF desde base64
function readEXIFFromBase64(base64Data, callback) {
    if (typeof EXIF === 'undefined') {
        console.warn('⚠️ Librería EXIF no disponible');
        callback(null);
        return;
    }
    
    // Convertir base64 a blob
    const byteString = atob(base64Data.split(',')[1] || base64Data);
    const mimeString = base64Data.split(',')[0].match(/:(.*?);/)[1];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: mimeString });
    
    // Crear un objeto File-like para EXIF.js
    const file = new File([blob], 'photo.jpg', { type: mimeString });
    readEXIFFromFile(file, callback);
}

// Función helper para obtener el tipo de incidencia por defecto
let cachedDefaultIncidenceType = null; // Cache para evitar múltiples llamadas
async function getDefaultIncidenceType() {
    // Si ya tenemos el tipo en cache, devolverlo
    if (cachedDefaultIncidenceType) {
        return cachedDefaultIncidenceType;
    }
    
    try {
        const typesResponse = await fetch('/api/incidence-types');
        const typesData = await typesResponse.json();
        
        if (typesData.success && typesData.default_type) {
            cachedDefaultIncidenceType = typesData.default_type;
            return cachedDefaultIncidenceType;
        } else {
            // Fallback si hay error de configuración/servidor
            console.warn('⚠️ No se pudo obtener el tipo por defecto, usando Mobiliario Urbano');
            return INCIDENCE_TYPE_FALLBACK;
        }
    } catch (error) {
        console.error('❌ Error al obtener tipo de incidencia por defecto:', error);
        // Fallback si hay error de red
        return INCIDENCE_TYPE_FALLBACK;
    }
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
        syncSendIncidenceBtnLabel();
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

// Verificar que el usuario esté autenticado antes de ejecutar una acción
function ensureAuthenticatedForAction(actionName = '') {
    if (isAuthenticated) {
        return true;
    }
    
    let actionText = 'usar esta función';
    switch (actionName) {
        case 'report':
            actionText = 'reportar una incidencia';
            break;
        case 'add_photos':
            actionText = 'añadir fotos';
            break;
        case 'record_audio':
            actionText = 'grabar audio';
            break;
        case 'nearby':
            actionText = 'ver elementos cercanos';
            break;
        case 'send_incidence':
            actionText = 'enviar la incidencia';
            break;
        case 'save_local_photo':
            actionText = 'guardar fotos localmente';
            break;
        case 'assign_photo':
            actionText = 'asignar fotos guardadas';
            break;
    }
    
    showStatus(`Debes iniciar sesión para ${actionText}.`, 'error');
    
    // Mostrar sección de login de forma visible
    if (elements.loginSection) {
        elements.loginSection.style.display = 'block';
    }
    
    // Abrir modal de login si está disponible
    if (elements.loginModal) {
        elements.loginModal.style.display = 'block';
    }
    
    return false;
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
    
    // Actualizar icono de usuario - mostrar tooltip con nombre de usuario y color verde
    if (elements.userIconBtn) {
        elements.userIconBtn.title = `Usuario: ${currentUser.username} - Clic para cerrar sesión`;
        elements.userIconBtn.style.display = 'flex';
        elements.userIconBtn.style.backgroundColor = '#28a745'; // verde validado
        elements.userIconBtn.style.color = '#ffffff';
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

    setTimeout(() => tryProcessDeepLinkIncidence(), 350);
    setTimeout(() => tryOpenPendingNearbyElements(), 500);
    
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
    
    // Actualizar icono de usuario - mostrar tooltip para login y color rojo (Malla)
    if (elements.userIconBtn) {
        elements.userIconBtn.title = 'Clic para iniciar sesión';
        elements.userIconBtn.style.display = 'flex';
        elements.userIconBtn.style.backgroundColor = '#dc3545'; // rojo
        elements.userIconBtn.style.color = '#ffffff';
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
        // Cerrar modal de elementos cercanos
        if (elements.nearbyElementsModal && elements.nearbyElementsModal.style.display === 'block') {
            closeNearbyElementsModal();
        }
        if (elements.assignPhotoModal && elements.assignPhotoModal.style.display === 'block') {
            closeAssignPhotoModal();
        }
    }
});

// ========================================
// FOTOS PENDIENTES (servidor) — Tomar Foto / Asignar foto
// ========================================

let assignPhotoScope = 'mine'; // 'mine' | 'all'
let assignPhotoCache = [];

function pendingPhotoImageSrc(photo) {
    const base = photo.imageUrl || `/api/pending-photos/${photo.id}/image`;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}device_id=${encodeURIComponent(deviceId || '')}`;
}

function formatLocalPhotoDate(iso) {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleString('es-ES', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch (e) {
        return iso;
    }
}

async function fetchPendingPhotos(scope) {
    const response = await fetch(`/api/pending-photos?scope=${encodeURIComponent(scope || 'mine')}`, {
        headers: { 'X-Device-ID': deviceId }
    });
    const result = await response.json().catch(() => ({}));
    if (!result.success) {
        throw new Error(result.error || 'Error al listar fotos pendientes');
    }
    return result.photos || [];
}

async function uploadPendingPhotoToServer(payload) {
    const response = await fetch('/api/pending-photos', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Device-ID': deviceId
        },
        body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!result.success) {
        throw new Error(result.error || 'Error al guardar la foto en el servidor');
    }
    return result.photo;
}

async function getLocalPhotoById(id) {
    const response = await fetch(`/api/pending-photos/${encodeURIComponent(id)}/data`, {
        headers: { 'X-Device-ID': deviceId }
    });
    const result = await response.json().catch(() => ({}));
    if (!result.success || !result.photo) {
        throw new Error(result.error || 'No se encontró la foto');
    }
    return result.photo;
}

async function deleteLocalPhoto(id) {
    const response = await fetch(`/api/pending-photos/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'X-Device-ID': deviceId }
    });
    const result = await response.json().catch(() => ({}));
    if (!result.success && response.status !== 404) {
        throw new Error(result.error || 'Error al eliminar la foto');
    }
}

/** Tras enviar incidencia: borrar del servidor (ya no “marcar asignada”). */
async function deletePendingPhotoAfterIncidenceSent(id) {
    try {
        await deleteLocalPhoto(id);
        console.log('🗑️ Foto pendiente eliminada del servidor:', id);
    } catch (e) {
        console.warn('No se pudo eliminar foto pendiente:', e);
    }
}

async function persistLocalPhotoFromCapture(imageData) {
    showStatus('Obteniendo ubicación...', 'info');
    let position = null;
    try {
        position = await getCurrentPosition();
    } catch (e) {
        console.warn('Geolocalización no disponible al guardar foto:', e);
    }

    const base64 = typeof imageData === 'string'
        ? imageData
        : (imageData && imageData.base64) || '';

    if (!base64) {
        showStatus('No se pudo leer la imagen capturada', 'error');
        return;
    }

    const description = await askLocalPhotoDescription(base64);

    showStatus('Guardando foto en el servidor...', 'info');
    try {
        await uploadPendingPhotoToServer({
            image: base64,
            latitude: position ? position.latitude : null,
            longitude: position ? position.longitude : null,
            accuracy: position ? position.accuracy : null,
            description: description || '',
            filename: `local_${Date.now()}.jpg`
        });
    } catch (e) {
        console.error(e);
        showStatus(e.message || 'Error al guardar la foto en el servidor', 'error');
        return;
    }

    if (position && !isNearbyAccuracyPoor(position.accuracy)) {
        saveLastGoodNearbyLocation(position.latitude, position.longitude, position.accuracy);
    }

    if (position) {
        showStatus(
            description
                ? 'Foto guardada en el servidor (con descripción y ubicación)'
                : `Foto guardada en el servidor (${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)})`,
            'success'
        );
    } else {
        showStatus(
            description
                ? 'Foto guardada en el servidor (con descripción, sin GPS)'
                : 'Foto guardada en el servidor (sin geolocalización)',
            description ? 'success' : 'warning'
        );
    }
}

/** Estado del modal de descripción al guardar foto local */
let _localPhotoDescResolve = null;
let _localPhotoDescSpeech = null;
let _localPhotoDescListening = false;

function askLocalPhotoDescription(base64Preview) {
    return new Promise((resolve) => {
        if (!elements.localPhotoDescModal) {
            resolve('');
            return;
        }
        _localPhotoDescResolve = resolve;
        if (elements.localPhotoDescThumb) {
            elements.localPhotoDescThumb.src = base64Preview;
        }
        if (elements.localPhotoDescText) {
            elements.localPhotoDescText.value = '';
        }
        setLocalPhotoDescAudioStatus('');
        setLocalPhotoDescRecordUi(false);
        elements.localPhotoDescModal.style.display = 'block';
        if (elements.localPhotoDescText) {
            setTimeout(() => elements.localPhotoDescText.focus(), 100);
        }
    });
}

function finishLocalPhotoDescription(text) {
    stopLocalPhotoDescSpeech();
    if (elements.localPhotoDescModal) {
        elements.localPhotoDescModal.style.display = 'none';
    }
    const resolve = _localPhotoDescResolve;
    _localPhotoDescResolve = null;
    if (resolve) {
        resolve(String(text || '').trim());
    }
}

function setLocalPhotoDescAudioStatus(msg) {
    if (elements.localPhotoDescAudioStatus) {
        elements.localPhotoDescAudioStatus.textContent = msg || '';
    }
}

function setLocalPhotoDescRecordUi(listening) {
    _localPhotoDescListening = !!listening;
    if (elements.localPhotoDescRecordLabel) {
        elements.localPhotoDescRecordLabel.textContent = listening ? 'Detener' : 'Dictar';
    }
    if (elements.localPhotoDescRecordBtn) {
        elements.localPhotoDescRecordBtn.classList.toggle('btn-danger', listening);
        elements.localPhotoDescRecordBtn.classList.toggle('btn-secondary', !listening);
        const icon = elements.localPhotoDescRecordBtn.querySelector('i');
        if (icon) {
            icon.className = listening ? 'fas fa-stop' : 'fas fa-microphone';
        }
    }
}

function stopLocalPhotoDescSpeech() {
    if (_localPhotoDescSpeech) {
        try {
            _localPhotoDescSpeech.onend = null;
            _localPhotoDescSpeech.onerror = null;
            _localPhotoDescSpeech.onresult = null;
            _localPhotoDescSpeech.stop();
        } catch (e) {
            /* ignore */
        }
        _localPhotoDescSpeech = null;
    }
    setLocalPhotoDescRecordUi(false);
}

function toggleLocalPhotoDescRecording() {
    if (_localPhotoDescListening) {
        stopLocalPhotoDescSpeech();
        setLocalPhotoDescAudioStatus('Escucha detenida');
        return;
    }
    startLocalPhotoDescSpeech();
}

function startLocalPhotoDescSpeech() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        showStatus(
            'Este navegador no soporta dictado por voz. Escribe la descripción o usa Chrome/Edge.',
            'warning'
        );
        return;
    }

    stopLocalPhotoDescSpeech();

    try {
        const rec = new SpeechRecognition();
        _localPhotoDescSpeech = rec;
        rec.lang = 'es-ES';
        rec.continuous = false;
        rec.interimResults = true;
        rec.maxAlternatives = 1;

        rec.onstart = () => {
            setLocalPhotoDescRecordUi(true);
            setLocalPhotoDescAudioStatus('Escuchando… habla ahora');
        };

        rec.onresult = (event) => {
            let interim = '';
            let finalText = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const t = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalText += t;
                } else {
                    interim += t;
                }
            }
            if (finalText && elements.localPhotoDescText) {
                const prev = elements.localPhotoDescText.value.trim();
                elements.localPhotoDescText.value = prev
                    ? `${prev} ${finalText.trim()}`.trim()
                    : finalText.trim();
                setLocalPhotoDescAudioStatus('Texto añadido desde audio');
            } else if (interim) {
                setLocalPhotoDescAudioStatus(`Escuchando… ${interim}`);
            }
        };

        rec.onerror = (event) => {
            console.warn('SpeechRecognition error:', event.error);
            const msg = event.error === 'not-allowed'
                ? 'Permiso de micrófono denegado'
                : (event.error === 'no-speech'
                    ? 'No se detectó voz. Prueba otra vez.'
                    : `Error de voz: ${event.error}`);
            setLocalPhotoDescAudioStatus(msg);
            setLocalPhotoDescRecordUi(false);
            _localPhotoDescSpeech = null;
        };

        rec.onend = () => {
            setLocalPhotoDescRecordUi(false);
            _localPhotoDescSpeech = null;
            if (elements.localPhotoDescAudioStatus &&
                elements.localPhotoDescAudioStatus.textContent.indexOf('Escuchando') === 0) {
                setLocalPhotoDescAudioStatus('Listo');
            }
        };

        rec.start();
    } catch (e) {
        console.error('Error al iniciar dictado:', e);
        showStatus('No se pudo iniciar el micrófono: ' + e.message, 'error');
        setLocalPhotoDescRecordUi(false);
        setLocalPhotoDescAudioStatus('');
    }
}

function closeAssignPhotoModal() {
    if (elements.assignPhotoModal) {
        elements.assignPhotoModal.style.display = 'none';
    }
}

function syncAssignPhotoScopeButtons() {
    if (elements.assignPhotoScopeMineBtn) {
        elements.assignPhotoScopeMineBtn.classList.toggle('is-active', assignPhotoScope === 'mine');
    }
    if (elements.assignPhotoScopeAllBtn) {
        elements.assignPhotoScopeAllBtn.classList.toggle('is-active', assignPhotoScope === 'all');
    }
}

async function openAssignPhotoModal() {
    if (!elements.assignPhotoModal) return;
    assignPhotoScope = 'mine';
    syncAssignPhotoScopeButtons();
    elements.assignPhotoModal.style.display = 'block';
    await refreshAssignPhotoList();
}

async function refreshAssignPhotoList() {
    try {
        if (elements.noUnassignedPhotosMsg) {
            elements.noUnassignedPhotosMsg.style.display = 'none';
        }
        if (elements.unassignedPhotosList) {
            elements.unassignedPhotosList.innerHTML =
                '<p style="text-align:center;color:#666;padding:16px;"><i class="fas fa-spinner fa-spin"></i> Cargando…</p>';
        }
        assignPhotoCache = await fetchPendingPhotos(assignPhotoScope);
        renderUnassignedPhotosList(assignPhotoCache, assignPhotoScope);
    } catch (e) {
        console.error('Error al abrir fotos sin asignar:', e);
        showStatus('Error al cargar fotos: ' + e.message, 'error');
        if (elements.unassignedPhotosList) {
            elements.unassignedPhotosList.innerHTML = '';
        }
        if (elements.noUnassignedPhotosMsg) {
            elements.noUnassignedPhotosMsg.style.display = 'block';
            elements.noUnassignedPhotosMsg.innerHTML =
                `<i class="fas fa-exclamation-triangle"></i> ${escapeHtmlBasic(e.message || 'Error')}`;
        }
    }
}

function createPendingPhotoListItem(photo) {
    const item = document.createElement('div');
    item.className = 'unassigned-photo-item';
    item.dataset.photoId = photo.id;

    const img = document.createElement('img');
    img.src = pendingPhotoImageSrc(photo);
    img.alt = 'Foto sin asignar';

    const meta = document.createElement('div');
    meta.className = 'unassigned-photo-meta';
    const hasGeo = photo.latitude != null && photo.longitude != null;
    const desc = (photo.description && String(photo.description).trim()) || '';
    const descHtml = desc
        ? `<span class="unassigned-photo-desc">${escapeHtmlBasic(desc)}</span>`
        : '';
    meta.innerHTML = hasGeo
        ? `<strong>${formatLocalPhotoDate(photo.createdAt)}</strong><br>
           <small><i class="fas fa-map-marker-alt"></i> ${Number(photo.latitude).toFixed(5)}, ${Number(photo.longitude).toFixed(5)}</small>
           ${descHtml}`
        : `<strong>${formatLocalPhotoDate(photo.createdAt)}</strong><br>
           <small>Sin ubicación GPS</small>
           ${descHtml}`;

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'unassigned-photo-delete';
    delBtn.title = 'Eliminar foto';
    delBtn.innerHTML = '<i class="fas fa-trash"></i>';
    delBtn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        if (!confirm('¿Eliminar esta foto del servidor?')) return;
        try {
            await deleteLocalPhoto(photo.id);
            showStatus('Foto eliminada', 'info');
            await refreshAssignPhotoList();
        } catch (e) {
            showStatus(e.message || 'Error al eliminar', 'error');
        }
    });

    item.appendChild(img);
    item.appendChild(meta);
    item.appendChild(delBtn);
    item.addEventListener('click', () => selectUnassignedPhotoForAssign(photo.id));
    return item;
}

function renderUnassignedPhotosList(photos, scope) {
    if (!elements.unassignedPhotosList) return;

    const list = photos || [];
    if (elements.noUnassignedPhotosMsg) {
        elements.noUnassignedPhotosMsg.style.display = list.length ? 'none' : 'block';
        elements.noUnassignedPhotosMsg.innerHTML = list.length
            ? ''
            : '<i class="fas fa-info-circle"></i> No hay fotos guardadas sin asignar.';
    }
    elements.unassignedPhotosList.innerHTML = '';

    if (!list.length) return;

    if (scope === 'all') {
        const byUser = {};
        list.forEach((p) => {
            const key = String(p.user_id || p.username || 'unknown');
            if (!byUser[key]) {
                byUser[key] = {
                    user_id: p.user_id,
                    username: p.username || 'Usuario',
                    photos: []
                };
            }
            byUser[key].photos.push(p);
        });

        Object.values(byUser)
            .sort((a, b) => a.username.localeCompare(b.username, 'es'))
            .forEach((group) => {
                const wrap = document.createElement('div');
                wrap.className = 'pending-photo-user-group';

                const header = document.createElement('button');
                header.type = 'button';
                header.className = 'pending-photo-user-header';
                header.innerHTML =
                    `<span><i class="fas fa-user"></i> ${escapeHtmlBasic(group.username)} ` +
                    `<small>(${group.photos.length})</small></span>` +
                    `<i class="fas fa-chevron-right pending-photo-chevron"></i>`;
                header.addEventListener('click', () => {
                    wrap.classList.toggle('is-open');
                });

                const body = document.createElement('div');
                body.className = 'pending-photo-user-body';
                group.photos.forEach((photo) => {
                    body.appendChild(createPendingPhotoListItem(photo));
                });

                wrap.appendChild(header);
                wrap.appendChild(body);
                elements.unassignedPhotosList.appendChild(wrap);
            });
        return;
    }

    list.forEach((photo) => {
        elements.unassignedPhotosList.appendChild(createPendingPhotoListItem(photo));
    });
}

function escapeHtmlBasic(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function setAssignedLocalPhotoDescriptionVisible(text) {
    if (!elements.assignedLocalPhotoDescription) return;
    const t = (text && String(text).trim()) || '';
    if (!t) {
        elements.assignedLocalPhotoDescription.style.display = 'none';
        elements.assignedLocalPhotoDescription.textContent = '';
        return;
    }
    elements.assignedLocalPhotoDescription.style.display = 'block';
    elements.assignedLocalPhotoDescription.innerHTML =
        `<i class="fas fa-align-left"></i> <strong>Descripción:</strong> ${escapeHtmlBasic(t)}`;
}

async function selectUnassignedPhotoForAssign(photoId) {
    let photo;
    try {
        photo = await getLocalPhotoById(photoId);
    } catch (e) {
        showStatus(e.message || 'La foto ya no está disponible', 'warning');
        return;
    }
    if (!photo || !photo.base64) {
        showStatus('La foto ya no está disponible', 'warning');
        return;
    }
    if (photo.latitude == null || photo.longitude == null) {
        showStatus('Esta foto no tiene geolocalización. No se pueden buscar elementos cerca.', 'error');
        return;
    }

    pendingAssignedLocalPhotoId = photoId;
    closeAssignPhotoModal();

    await showNearbyElements({
        latitude: photo.latitude,
        longitude: photo.longitude,
        title: 'Elementos cerca de la foto',
        referenceLabel: 'Ubicación de la foto'
    });
}

/** Carga la foto local en la galería y muestra vista previa (flujo normal de incidencia). */
async function loadAssignedLocalPhotoIntoIncidenceFlow(photoId) {
    const photo = await getLocalPhotoById(photoId);
    if (!photo || !photo.base64) {
        throw new Error('No se encontró la foto local');
    }

    assignedLocalPhotoIdForIncidence = photoId;

    const photoObj = {
        base64: photo.base64,
        url: null,
        file_id: null,
        filename: photo.filename || `assigned_${Date.now()}.jpg`,
        converted: false
    };

    imagenia = photo.base64;
    currentPhotoData = photo.base64;
    photoGallery = [photoObj];
    currentPhotoIndex = 0;
    photoMode = 'reportar';
    syncSendIncidenceBtnLabel();

    const localDesc = (photo.description && String(photo.description).trim()) || '';
    if (localDesc) {
        pendingIncidenceData.description = localDesc;
        pendingIncidenceData.fullText = localDesc;
        pendingIncidenceData.hasLocalDescription = true;
    }

    const defaultImageContainer = document.querySelector('.default-image-container');
    if (defaultImageContainer) {
        defaultImageContainer.style.display = 'none';
    }

    updatePhotoGallery();
    setAssignedLocalPhotoDescriptionVisible(localDesc);
    if (elements.photoPreview) {
        elements.photoPreview.style.display = 'block';
    }
    if (elements.sendIncidenceBtn) {
        elements.sendIncidenceBtn.style.display = 'flex';
        syncSendIncidenceBtnLabel();
    }

    (async () => {
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
            if (result.success && photoGallery[0] === photoObj) {
                photoGallery[0].url = result.url;
                photoGallery[0].file_id = result.file_id;
                photoGallery[0].converted = true;
                updatePhotoGallery();
            }
        } catch (e) {
            console.warn('No se pudo convertir foto local a URL:', e);
        }
    })();
}

function setupElementForIncidenceFromMap(element) {
    const isMobiliario = element.Tipo === 'Mobiliario' || element.tipo === 'Mobiliario' ||
        element.NombreVista === 'MobiliarioGis' || element.nombreVista === 'MobiliarioGis';
    const tipoParada = element.TipoParada || element.tipoParada || element['Tipo Parada'] || '';
    const isParadaBus = isMobiliario && tipoParada && tipoParada.toString().trim().length > 0;

    let elementId = '';
    let elementName = '';

    if (isMobiliario) {
        elementId = element.NumeroEmplazamiento || element['Nº Emplazamiento'] ||
            element.numeroEmplazamiento || element['nº emplazamiento'] || 'ELEMENTO';
        elementName = element.Descripcion || element.Descripción ||
            element.descripcion || element.descripción || elementId;
    } else {
        elementId = element.NumeroRecurso || element.No_ ||
            element.numeroRecurso || element.no_ ||
            element.Codigo || element.codigo || 'ELEMENTO';
        elementName = element.Name || element.name ||
            element.Descripcion || element.Descripción ||
            element.descripcion || element.descripción ||
            element.Nombre || element.nombre || elementId;
    }

    currentQRData = elementId;
    pendingIncidenceData.emtGis = normalizeEmtFromElement(element);

    if (isParadaBus) {
        pendingIncidenceData.isParadaBus = true;
        pendingIncidenceData.isMobiliario = true;
        pendingIncidenceData.stopNumber = elementId;
    } else {
        pendingIncidenceData.isParadaBus = false;
        pendingIncidenceData.elementData = element;
        pendingIncidenceData.isMobiliario = isMobiliario;
    }

    if (elements.qrData && elements.qrType && elements.qrResults) {
        elements.qrData.textContent = elementId;
        elements.qrData.href = '#';
        elements.qrType.textContent = isMobiliario ? 'Mobiliario Cercano' : 'Recurso Cercano';
        elements.qrResults.style.display = 'block';
    }

    return { elementId, elementName };
}

// ========================================
// ELEMENTOS CERCANOS - MAPA
// ========================================

let nearbyMapInstance = null; // Instancia del mapa Leaflet
let userMarker = null; // Marcador del usuario (arrastrable)
let nearbyRadiusCircle = null; // Círculo del radio de búsqueda
let nearbyAccuracyCircle = null; // Círculo de precisión GPS
let nearbyMarkers = []; // Marcadores de elementos cercanos
/** Estado de la búsqueda abierta en el modal (para ampliar radio sin reubicar) */
let nearbySearchState = null;
let nearbyExpandInFlight = false;
let nearbyRelocateInFlight = false;

const NEARBY_ACCURACY_WARN_METERS = 500;
const NEARBY_LAST_LOCATION_KEY = 'incidencias_last_good_nearby_location';

function formatNearbyRadiusText(meters) {
    const m = Number(meters) || 0;
    if (m >= 1000) {
        const km = m / 1000;
        const text = Number.isInteger(km) ? String(km) : km.toFixed(1);
        return `${text} km`;
    }
    return `${Math.round(m)} m`;
}

function getNextNearbyRadius(current, maxRadius) {
    const cur = Number(current) || 0;
    const max = Number(maxRadius) || 5000;
    if (cur >= max) return max;
    return Math.min(Math.max(cur * 2, cur + 100), max);
}

function isNearbyAccuracyPoor(accuracy) {
    if (accuracy == null || accuracy === 0) return false; // 0 = coords fijas (foto / manual)
    return Number(accuracy) > NEARBY_ACCURACY_WARN_METERS;
}

function loadLastGoodNearbyLocation() {
    try {
        const raw = localStorage.getItem(NEARBY_LAST_LOCATION_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (data && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
            return data;
        }
    } catch (e) {
        /* ignore */
    }
    return null;
}

function saveLastGoodNearbyLocation(latitude, longitude, accuracy) {
    try {
        localStorage.setItem(NEARBY_LAST_LOCATION_KEY, JSON.stringify({
            latitude,
            longitude,
            accuracy: accuracy == null ? null : Number(accuracy),
            savedAt: new Date().toISOString()
        }));
    } catch (e) {
        console.warn('No se pudo guardar última ubicación:', e);
    }
}

function updateNearbyModalTitle() {
    if (!elements.nearbyModalTitle || !nearbySearchState) return;
    const base = nearbySearchState.titleBase || 'Elementos Cerca';
    const radiusText = formatNearbyRadiusText(nearbySearchState.radius);
    elements.nearbyModalTitle.innerHTML =
        `<i class="fas fa-map-marker-alt"></i> ${base} (${radiusText})`;
}

function updateExpandNearbyRadiusButton() {
    if (!elements.expandNearbyRadiusBtn) return;
    if (!nearbySearchState) {
        elements.expandNearbyRadiusBtn.disabled = true;
        if (elements.expandNearbyRadiusLabel) {
            elements.expandNearbyRadiusLabel.textContent = 'Ampliar';
        }
        return;
    }
    const next = getNextNearbyRadius(nearbySearchState.radius, nearbySearchState.maxRadius);
    const atMax = nearbySearchState.radius >= nearbySearchState.maxRadius;
    elements.expandNearbyRadiusBtn.disabled = atMax || nearbyExpandInFlight || nearbyRelocateInFlight;
    if (elements.expandNearbyRadiusLabel) {
        elements.expandNearbyRadiusLabel.textContent = atMax
            ? `Máx. ${formatNearbyRadiusText(nearbySearchState.maxRadius)}`
            : `Ampliar a ${formatNearbyRadiusText(next)}`;
    }
    elements.expandNearbyRadiusBtn.title = atMax
        ? `Radio máximo alcanzado (${formatNearbyRadiusText(nearbySearchState.maxRadius)})`
        : `Ampliar radio a ${formatNearbyRadiusText(next)}`;
}

function setNearbyMapStatus(html) {
    if (elements.mapStatus) {
        elements.mapStatus.innerHTML = html;
    }
}

function updateNearbyLocationHint() {
    if (!elements.nearbyLocationHint || !elements.nearbyLocationHintText) return;
    if (!nearbySearchState) {
        elements.nearbyLocationHint.style.display = 'none';
        return;
    }

    const acc = nearbySearchState.accuracy;
    const poor = isNearbyAccuracyPoor(acc);
    const last = loadLastGoodNearbyLocation();
    const hasLast = !!(last && (
        Math.abs(last.latitude - nearbySearchState.latitude) > 0.00005 ||
        Math.abs(last.longitude - nearbySearchState.longitude) > 0.00005
    ));

    elements.nearbyLocationHint.style.display = 'flex';
    elements.nearbyLocationHint.classList.toggle('is-ok', !poor);

    if (poor) {
        elements.nearbyLocationHintText.innerHTML =
            `<i class="fas fa-exclamation-triangle"></i> Ubicación poco precisa (±${formatNearbyRadiusText(acc)}). ` +
            `Arrastra el pin azul o toca el mapa para corregir el centro.`;
    } else if (nearbySearchState.manuallySet) {
        elements.nearbyLocationHintText.innerHTML =
            `<i class="fas fa-hand-pointer"></i> Centro ajustado manualmente. Puedes arrastrar el pin o tocar el mapa otra vez.`;
    } else {
        const accText = (acc != null && acc > 0)
            ? ` Precisión ±${formatNearbyRadiusText(acc)}.`
            : '';
        elements.nearbyLocationHintText.innerHTML =
            `<i class="fas fa-info-circle"></i> Arrastra el pin azul o toca el mapa para mover el centro de búsqueda.${accText}`;
    }

    if (elements.useLastNearbyLocationBtn) {
        elements.useLastNearbyLocationBtn.style.display = (poor && hasLast) ? 'inline-flex' : 'none';
    }
}

async function fetchNearbySearchConfig() {
    let searchRadius = 500;
    let maxRadius = 5000;
    let minRadius = 50;
    try {
        const configResponse = await fetch('/api/search-config', {
            method: 'GET',
            headers: { 'X-Device-ID': deviceId }
        });
        if (configResponse.ok) {
            const configData = await configResponse.json();
            if (configData.success && configData.config) {
                searchRadius = configData.config.default_radius_meters || searchRadius;
                maxRadius = configData.config.max_radius_meters || maxRadius;
                minRadius = configData.config.min_radius_meters || minRadius;
            }
        }
    } catch (error) {
        console.warn('⚠️ No se pudo obtener la configuración, usando valores por defecto:', error);
    }
    return { searchRadius, maxRadius, minRadius };
}

function updateNearbyAccuracyCircle(latitude, longitude, accuracy) {
    if (!nearbyMapInstance) return;
    if (nearbyAccuracyCircle) {
        nearbyMapInstance.removeLayer(nearbyAccuracyCircle);
        nearbyAccuracyCircle = null;
    }
    if (accuracy == null || accuracy <= 0 || !isNearbyAccuracyPoor(accuracy)) {
        return;
    }
    nearbyAccuracyCircle = L.circle([latitude, longitude], {
        color: '#e67e22',
        fillColor: '#f39c12',
        fillOpacity: 0.08,
        weight: 1,
        dashArray: '4 4',
        radius: accuracy
    }).addTo(nearbyMapInstance);
}

async function runNearbyElementsSearch(latitude, longitude, searchRadius) {
    setNearbyMapStatus('<i class="fas fa-spinner fa-spin"></i> Buscando elementos cercanos...');
    const nearbyElements = await getNearbyElements(latitude, longitude, searchRadius);
    const radiusText = formatNearbyRadiusText(searchRadius);
    const acc = nearbySearchState && nearbySearchState.accuracy;
    const accNote = (acc != null && acc > 0)
        ? ` · GPS ±${formatNearbyRadiusText(acc)}`
        : '';

    if (nearbyElements && nearbyElements.success) {
        console.log(`✅ Encontrados ${nearbyElements.elements.length} elementos cercanos`);
        displayElementsOnMap(nearbyElements.elements);
        setNearbyMapStatus(
            `<i class="fas fa-check-circle"></i> ${nearbyElements.elements.length} elemento(s) en ${radiusText}${accNote}`
        );
    } else {
        displayElementsOnMap([]);
        setNearbyMapStatus(
            `<i class="fas fa-info-circle"></i> Sin elementos en ${radiusText}${accNote}`
        );
    }
    updateNearbyLocationHint();
    return nearbyElements;
}

/** Mueve el centro de búsqueda (pin / clic en mapa / última ubicación). */
async function relocateNearbySearch(latitude, longitude, options = {}) {
    if (!nearbySearchState || nearbyRelocateInFlight) return;
    const {
        accuracy = 0,
        manuallySet = true,
        saveAsGood = true,
        fitBounds = true
    } = options;

    nearbyRelocateInFlight = true;
    updateExpandNearbyRadiusButton();

    try {
        nearbySearchState.latitude = latitude;
        nearbySearchState.longitude = longitude;
        nearbySearchState.accuracy = accuracy;
        nearbySearchState.manuallySet = !!manuallySet;

        if (userMarker) {
            userMarker.setLatLng([latitude, longitude]);
        }
        if (nearbyRadiusCircle) {
            nearbyRadiusCircle.setLatLng([latitude, longitude]);
            if (fitBounds) {
                try {
                    nearbyMapInstance.fitBounds(nearbyRadiusCircle.getBounds(), { padding: [24, 24] });
                } catch (e) {
                    /* ignore */
                }
            }
        }
        updateNearbyAccuracyCircle(latitude, longitude, accuracy);

        if (saveAsGood) {
            saveLastGoodNearbyLocation(latitude, longitude, accuracy);
        }

        await runNearbyElementsSearch(latitude, longitude, nearbySearchState.radius);
        showStatus('Centro de búsqueda actualizado', 'success');
    } catch (error) {
        console.error('❌ Error al mover el centro de búsqueda:', error);
        setNearbyMapStatus(`<i class="fas fa-exclamation-triangle"></i> Error: ${error.message}`);
        showStatus('Error al mover el centro: ' + error.message, 'error');
    } finally {
        nearbyRelocateInFlight = false;
        updateExpandNearbyRadiusButton();
    }
}

async function useLastGoodNearbyLocation() {
    const last = loadLastGoodNearbyLocation();
    if (!last) {
        showStatus('No hay una ubicación buena guardada todavía', 'info');
        return;
    }
    await relocateNearbySearch(last.latitude, last.longitude, {
        accuracy: last.accuracy != null ? last.accuracy : 0,
        manuallySet: true,
        saveAsGood: true
    });
}

async function expandNearbySearchRadius() {
    if (!nearbySearchState || nearbyExpandInFlight) return;
    if (nearbySearchState.radius >= nearbySearchState.maxRadius) {
        showStatus(`Ya estás en el radio máximo (${formatNearbyRadiusText(nearbySearchState.maxRadius)})`, 'info');
        return;
    }

    const nextRadius = getNextNearbyRadius(nearbySearchState.radius, nearbySearchState.maxRadius);
    nearbyExpandInFlight = true;
    updateExpandNearbyRadiusButton();

    try {
        nearbySearchState.radius = nextRadius;
        updateNearbyModalTitle();
        updateExpandNearbyRadiusButton();

        if (nearbyRadiusCircle) {
            nearbyRadiusCircle.setRadius(nextRadius);
            try {
                nearbyMapInstance.fitBounds(nearbyRadiusCircle.getBounds(), { padding: [24, 24] });
            } catch (e) {
                /* ignore */
            }
        }

        await runNearbyElementsSearch(
            nearbySearchState.latitude,
            nearbySearchState.longitude,
            nextRadius
        );
        showStatus(`Radio ampliado a ${formatNearbyRadiusText(nextRadius)}`, 'success');
    } catch (error) {
        console.error('❌ Error al ampliar radio:', error);
        setNearbyMapStatus(`<i class="fas fa-exclamation-triangle"></i> Error: ${error.message}`);
        showStatus('Error al ampliar el radio: ' + error.message, 'error');
    } finally {
        nearbyExpandInFlight = false;
        updateExpandNearbyRadiusButton();
    }
}

// Mostrar modal de elementos cercanos
async function showNearbyElements(options = {}) {
    const {
        latitude: latOpt,
        longitude: lonOpt,
        title,
        referenceLabel
    } = options;

    try {
        console.log('🗺️ Abriendo modal de elementos cercanos...');
        
        if (elements.nearbyElementsModal) {
            elements.nearbyElementsModal.style.display = 'block';
        }

        const titleBase = title || 'Elementos Cerca';
        if (elements.nearbyModalTitle) {
            elements.nearbyModalTitle.innerHTML =
                `<i class="fas fa-map-marker-alt"></i> ${titleBase}`;
        }
        updateExpandNearbyRadiusButton();
        if (elements.nearbyLocationHint) {
            elements.nearbyLocationHint.style.display = 'none';
        }
        
        setNearbyMapStatus(
            latOpt != null && lonOpt != null
                ? '<i class="fas fa-spinner fa-spin"></i> Buscando elementos cercanos...'
                : '<i class="fas fa-spinner fa-spin"></i> Obteniendo ubicación...'
        );
        
        let position;
        if (latOpt != null && lonOpt != null) {
            position = { latitude: latOpt, longitude: lonOpt, accuracy: 0 };
        } else {
            position = await getCurrentPosition();
        }
        
        if (!position) {
            setNearbyMapStatus('<i class="fas fa-exclamation-triangle"></i> No se pudo obtener la ubicación. Verifica los permisos de geolocalización.');
            return;
        }
        
        const { latitude, longitude, accuracy } = position;
        console.log(`📍 Ubicación: Lat=${latitude}, Lon=${longitude}, accuracy=${accuracy}`);
        
        const { searchRadius, maxRadius } = await fetchNearbySearchConfig();
        console.log(`🔍 Buscando elementos en radio de ${searchRadius}m`);

        nearbySearchState = {
            latitude,
            longitude,
            accuracy: accuracy != null ? accuracy : null,
            radius: searchRadius,
            maxRadius,
            titleBase,
            referenceLabel: referenceLabel || 'Tu ubicación',
            manuallySet: false
        };
        updateNearbyModalTitle();
        updateExpandNearbyRadiusButton();

        // Guardar ubicaciones buenas (GPS móvil o coords de foto) para reutilizar en PC
        if (!isNearbyAccuracyPoor(accuracy)) {
            saveLastGoodNearbyLocation(latitude, longitude, accuracy == null ? 0 : accuracy);
        }
        
        initializeMap(latitude, longitude, searchRadius, nearbySearchState.referenceLabel, accuracy);
        await runNearbyElementsSearch(latitude, longitude, searchRadius);

        if (isNearbyAccuracyPoor(accuracy)) {
            showStatus(
                `Ubicación poco precisa (±${formatNearbyRadiusText(accuracy)}). Arrastra el pin o toca el mapa.`,
                'warning'
            );
        }
        
    } catch (error) {
        console.error('❌ Error al mostrar elementos cercanos:', error);
        setNearbyMapStatus(`<i class="fas fa-exclamation-triangle"></i> Error: ${error.message}`);
        showStatus('Error al obtener elementos cercanos: ' + error.message, 'error');
    }
}

// Obtener posición actual del usuario (en PC prueba Wi‑Fi si el GPS es muy impreciso)
function getCurrentPosition() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocalización no soportada por este navegador'));
            return;
        }

        const readOnce = (enableHighAccuracy, timeout) => new Promise((res, rej) => {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    res({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy
                    });
                },
                (error) => rej(error),
                {
                    enableHighAccuracy,
                    timeout,
                    maximumAge: 0
                }
            );
        });

        (async () => {
            try {
                // En escritorio, Wi‑Fi suele ser mejor que "alta precisión" sin GPS
                const preferWifiFirst = !('ontouchstart' in window) && !navigator.maxTouchPoints;
                let first;
                try {
                    first = await readOnce(preferWifiFirst ? false : true, preferWifiFirst ? 8000 : 10000);
                } catch (e1) {
                    first = await readOnce(!preferWifiFirst ? false : true, 10000);
                }

                if (isNearbyAccuracyPoor(first.accuracy)) {
                    try {
                        const second = await readOnce(!preferWifiFirst, 8000);
                        if (!isNearbyAccuracyPoor(second.accuracy) ||
                            (second.accuracy != null && first.accuracy != null && second.accuracy < first.accuracy)) {
                            resolve(second);
                            return;
                        }
                    } catch (e2) {
                        /* quedarse con first */
                    }
                }
                resolve(first);
            } catch (error) {
                console.error('Error de geolocalización:', error);
                reject(new Error('No se pudo obtener la ubicación: ' + (error.message || error)));
            }
        })();
    });
}

// Inicializar mapa Leaflet
function initializeMap(latitude, longitude, radius = 1000, referenceLabel, accuracy) {
    // Limpiar mapa anterior si existe
    if (nearbyMapInstance) {
        nearbyMapInstance.remove();
        nearbyMapInstance = null;
    }
    nearbyRadiusCircle = null;
    nearbyAccuracyCircle = null;
    
    // Crear nuevo mapa
    nearbyMapInstance = L.map('nearbyMap').setView([latitude, longitude], 17);
    
    // Añadir capa de OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(nearbyMapInstance);
    
    // Marcador arrastrable: en PC permite corregir ubicación mala
    userMarker = L.marker([latitude, longitude], {
        draggable: true,
        autoPan: true,
        title: 'Arrastra para mover el centro de búsqueda',
        icon: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        })
    }).addTo(nearbyMapInstance);
    
    const popupLabel = referenceLabel || 'Tu ubicación';
    userMarker.bindPopup(
        `<b>${popupLabel}</b><br><small>Arrastra el pin o toca el mapa</small>`
    ).openPopup();

    userMarker.on('dragend', () => {
        const ll = userMarker.getLatLng();
        relocateNearbySearch(ll.lat, ll.lng, {
            accuracy: 0,
            manuallySet: true,
            saveAsGood: true,
            fitBounds: false
        });
    });

    nearbyMapInstance.on('click', (e) => {
        if (nearbyRelocateInFlight) return;
        relocateNearbySearch(e.latlng.lat, e.latlng.lng, {
            accuracy: 0,
            manuallySet: true,
            saveAsGood: true,
            fitBounds: false
        });
    });
    
    // Círculo del radio (se reutiliza al ampliar sin recrear el mapa)
    nearbyRadiusCircle = L.circle([latitude, longitude], {
        color: 'blue',
        fillColor: '#3388ff',
        fillOpacity: 0.2,
        radius: radius
    }).addTo(nearbyMapInstance);

    updateNearbyAccuracyCircle(latitude, longitude, accuracy);

    try {
        const boundsTarget = (nearbyAccuracyCircle && isNearbyAccuracyPoor(accuracy))
            ? nearbyAccuracyCircle
            : nearbyRadiusCircle;
        nearbyMapInstance.fitBounds(boundsTarget.getBounds(), { padding: [24, 24] });
    } catch (e) {
        /* ignore */
    }
}

// Obtener elementos cercanos del servidor
async function getNearbyElements(latitude, longitude, radius) {
    try {
        const response = await fetch('/api/nearby-elements', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Device-ID': deviceId
            },
            body: JSON.stringify({
                latitude: latitude,
                longitude: longitude,
                radius: radius
            })
        });
        
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Error al obtener elementos cercanos:', error);
        throw error;
    }
}

// Función para obtener el icono según el tipo de elemento
function getElementIcon(element, isMobiliario) {
    if (isMobiliario) {
        // Icono de autobús para Mobiliario
        return L.divIcon({
            className: 'custom-marker-icon',
            html: '<div style="background-color: #ff4444; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"><i class="fas fa-bus" style="color: white; font-size: 16px;"></i></div>',
            iconSize: [30, 30],
            iconAnchor: [15, 15],
            popupAnchor: [0, -15]
        });
    } else {
        // Iconos diferentes según el tipo de recurso
        const tipoElemento = (element.TipoElemento || element.tipoElemento || '').toUpperCase().trim();
        
        // Mapeo de tipos a iconos Font Awesome
        const iconMap = {
            'APAR.OB.B': 'fa-building',
            'ASCENSOR': 'fa-arrow-up',
            'ASCENSORES': 'fa-arrow-up',
            'VALLA': 'fa-desktop',
            'MONOPOSTE': 'fa-sign',
            'OPIDIGITAL': 'fa-tv',
            'VPEATON': 'fa-walking',
            'OPI SMAP': 'fa-mobile-alt',
            'MEDIANERA': 'fa-building',
            'MINI OPI': 'fa-mobile-alt',
            'INDICADOR': 'fa-sign',
            'OPI': 'fa-mobile-alt',
            'V.PARKING': 'fa-parking',
            'V PARKING': 'fa-parking'
        };
        
        // Buscar icono en el mapa (con búsqueda flexible)
        let iconClass = 'fa-map-marker-alt'; // Icono por defecto
        for (const [key, value] of Object.entries(iconMap)) {
            if (tipoElemento.includes(key) || tipoElemento === key) {
                iconClass = value;
                break;
            }
        }
        
        // Color según el tipo (puedes personalizar)
        const color = '#4CAF50'; // Verde por defecto para recursos
        
        return L.divIcon({
            className: 'custom-marker-icon',
            html: `<div style="background-color: ${color}; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"><i class="fas ${iconClass}" style="color: white; font-size: 16px;"></i></div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
            popupAnchor: [0, -15]
        });
    }
}

function displayElementsOnMap(elements) {
    // Limpiar marcadores anteriores
    nearbyMarkers.forEach(marker => {
        nearbyMapInstance.removeLayer(marker);
    });
    nearbyMarkers = [];
    
    // Añadir marcadores para cada elemento
    elements.forEach((element, index) => {
        // Los campos se llaman PuntoY y PuntoX
        // IMPORTANTE: Verificar si están invertidos - probar ambas opciones
        let puntoX = parseFloat(element.PuntoX || element.puntoX || element.Punto_X || element.punto_x || 0);
        let puntoY = parseFloat(element.PuntoY || element.puntoY || element.Punto_Y || element.punto_y || 0);
        
        // Validar que las coordenadas sean números válidos
        if (isNaN(puntoX) || isNaN(puntoY) || puntoX === 0 || puntoY === 0) {
            console.warn(`⚠️ Elemento ${index} no tiene coordenadas válidas:`, {
                PuntoX: element.PuntoX,
                PuntoY: element.PuntoY,
                elemento: element
            });
            return;
        }
        
        // Determinar si PuntoX y PuntoY están en el orden correcto
        // En España, las coordenadas típicas son:
        // - Latitud: entre 35-44 grados (norte-sur)
        // - Longitud: entre -10 y 5 grados (este-oeste, negativos en España)
        // Si PuntoX está en ese rango de latitud, están invertidos
        
        let lat, lon;
        
        // Si PuntoX está en rango de latitud española (35-44) y PuntoY es negativo o pequeño, están invertidos
        if (puntoX >= 35 && puntoX <= 44 && (puntoY < 0 || puntoY < 10)) {
            // Están invertidos: PuntoX es latitud, PuntoY es longitud
            console.log(`🔄 Coordenadas invertidas detectadas para elemento ${index}: PuntoX=${puntoX}, PuntoY=${puntoY}`);
            lat = puntoX;
            lon = puntoY;
        } else if (puntoY >= 35 && puntoY <= 44 && (puntoX < 0 || puntoX < 10)) {
            // Orden correcto: PuntoY es latitud, PuntoX es longitud
            lat = puntoY;
            lon = puntoX;
        } else {
            // Por defecto, asumir: PuntoY = latitud, PuntoX = longitud
            // Pero si los valores no tienen sentido, probar invertidos
            if (Math.abs(puntoX) > 90 || Math.abs(puntoY) > 90) {
                // Valores fuera del rango normal de latitud, probar invertidos
                console.log(`🔄 Probando coordenadas invertidas para elemento ${index}: PuntoX=${puntoX}, PuntoY=${puntoY}`);
                lat = puntoX;
                lon = puntoY;
            } else {
                // Orden estándar
                lat = puntoY;
                lon = puntoX;
            }
        }
        
        console.log(`📍 Elemento ${index}: PuntoX=${puntoX}, PuntoY=${puntoY} → Lat=${lat}, Lon=${lon}`);
        
        // Validar que las coordenadas finales sean válidas
        if (isNaN(lat) || isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
            console.warn(`⚠️ Coordenadas finales inválidas para elemento ${index}: lat=${lat}, lon=${lon}`);
            return;
        }
        
        // Determinar tipo de elemento
        const isMobiliario = element.Tipo === 'Mobiliario' || element.tipo === 'Mobiliario' || 
                            element.NombreVista === 'MobiliarioGis' || element.nombreVista === 'MobiliarioGis';
        
        // Obtener icono personalizado según el tipo
        const icon = getElementIcon(element, isMobiliario);
        
        // Crear marcador
        const marker = L.marker([lat, lon], { icon: icon }).addTo(nearbyMapInstance);
        
        // Información del elemento para el popup
        // Para MobiliarioGis: usar Nº Emplazamiento, Descripción, Dirección, etc.
        // Para RecursosGIS: usar los campos que tenga esa vista
        let elementName = '';
        let elementId = '';
        let elementDescription = '';
        let elementAddress = '';
        let elementType = '';
        
        if (isMobiliario) {
            // MobiliarioGis tiene: Nº Emplazamiento, Descripción, Dirección, Tipo, etc.
            elementId = element.NumeroEmplazamiento || element['Nº Emplazamiento'] || 
                       element.numeroEmplazamiento || element['nº emplazamiento'] || 'N/A';
            elementName = element.Descripcion || element.Descripción || 
                         element.descripcion || element.descripción || 
                         elementId || `Emplazamiento ${index + 1}`;
            elementDescription = element.Descripcion || element.Descripción || 
                               element.descripcion || element.descripción || '';
            elementAddress = element.Direccion || element.Dirección || 
                           element.direccion || element.dirección || '';
            const tipoElemento = element.TipoElemento || element.Tipo || 
                               element.tipoElemento || element.tipo || '';
            elementType = tipoElemento ? `Mobiliario - ${tipoElemento}` : 'Mobiliario';
        } else {
            // RecursosGIS tiene: No_, Name, PuntoX, PuntoY, Incidencia, Campañas
            elementId = element.NumeroRecurso || element.No_ || 
                       element.numeroRecurso || element.no_ || 
                       element.Codigo || element.codigo || 'N/A';
            elementName = element.Name || element.name || 
                         element.Descripcion || element.Descripción || 
                         element.descripcion || element.descripción || 
                         elementId || `Recurso ${index + 1}`;
            elementDescription = element.Name || element.name || 
                                element.Descripcion || element.Descripción || 
                                element.descripcion || element.descripción || '';
            elementAddress = element.Direccion || element.Dirección || 
                            element.direccion || element.dirección || '';
            
            // Usar TipoElemento en lugar de "Recurso Publicitario"
            const tipoElemento = element.TipoElemento || element.tipoElemento || 
                               element.Tipo || element.tipo || '';
            elementType = tipoElemento || 'Recurso Publicitario';
            
            // Añadir información de campañas si existe
            if (element.Campanas || element.Campañas || element.campanas || element.campañas) {
                const campanas = element.Campanas || element.Campañas || 
                                element.campanas || element.campañas;
                if (campanas) {
                    elementDescription += (elementDescription ? ' - ' : '') + `Campañas: ${campanas}`;
                }
            }
        }
        
        // Crear contenido del popup con botones de incidencia
        let popupHtml = `<div style="min-width: 200px;">`;
        popupHtml += `<b>${elementName}</b><br>`;
        if (elementId && elementId !== 'N/A') {
            popupHtml += `<small><strong>Nº:</strong> ${elementId}</small><br>`;
        }
        popupHtml += `<small><strong>Tipo:</strong> ${elementType}</small><br>`;
        if (elementAddress) {
            popupHtml += `<small><strong>Dirección:</strong> ${elementAddress}</small><br>`;
        }
        if (elementDescription && elementDescription !== elementName) {
            popupHtml += `<small>${elementDescription}</small><br>`;
        }

        // Botón para crear incidencia
        popupHtml += `<button class="btn btn-primary" onclick="createIncidenceFromElement(${index})" 
                        style="margin-top: 10px; width: 100%; padding: 5px;">
                    <i class="fas fa-exclamation-triangle"></i> Crear Incidencia
                </button>`;

        // Botón para cerrar incidencia (solo si hay incidencias abiertas para este usuario)
        if (element.hasOpenIncidencesForUser) {
            popupHtml += `<button class="btn btn-secondary" onclick="closeIncidenceFromElement(${index})"
                            style="margin-top: 6px; width: 100%; padding: 5px;">
                        <i class="fas fa-check-circle"></i> Cerrar incidencia
                    </button>`;
        }

        popupHtml += `</div>`;
        
        const popupContent = popupHtml;
        
        marker.bindPopup(popupContent);
        
        // Guardar referencia al elemento en el marcador
        marker.elementData = element;
        marker.elementIndex = index;
        
        nearbyMarkers.push(marker);
    });
    
    // Ajustar vista del mapa para mostrar todos los marcadores
    if (nearbyMarkers.length > 0) {
        const group = new L.featureGroup([userMarker, ...nearbyMarkers]);
        nearbyMapInstance.fitBounds(group.getBounds().pad(0.1));
    }
}

// Crear incidencia desde un elemento del mapa
async function createIncidenceFromElement(elementIndex) {
    try {
        const marker = nearbyMarkers[elementIndex];
        
        if (!marker || !marker.elementData) {
            showStatus('Error: No se encontró el elemento seleccionado', 'error');
            return;
        }
        
        const element = marker.elementData;
        console.log('📝 Creando incidencia desde elemento:', element);

        // Guardar antes de cerrar el modal: closeNearbyElementsModal limpia pendingAssignedLocalPhotoId
        const localPhotoId = pendingAssignedLocalPhotoId;
        
        closeNearbyElementsModal({ clearAssignedPhoto: false });
        
        const { elementName } = setupElementForIncidenceFromMap(element);

        pendingAssignedLocalPhotoId = null;

        if (localPhotoId) {
            await loadAssignedLocalPhotoIntoIncidenceFlow(localPhotoId);
            showStatus(`Incidencia preparada para: ${elementName}. Revisa la foto y envía.`, 'success');
            return;
        }
        
        photoMode = 'reportar';
        syncSendIncidenceBtnLabel();
        startPhotoAutoCapture();
        
        showStatus(`Incidencia preparada para: ${elementName}`, 'success');
        
    } catch (error) {
        console.error('Error al crear incidencia desde elemento:', error);
        showStatus('Error al crear incidencia: ' + error.message, 'error');
    }
}

/**
 * Paso común: POST EnProgreso y abrir cámara para cerrar con foto (estado Cerrada).
 * @param {object} inc — { incidenceType, incidenceSubType, description, observation }
 * @param {string} resource — valor Recurso para BC
 * @param {{ closeNearbyModal?: boolean, currentQrOverride?: string }} options
 */
async function sendEnProgresoAndOpenCloseCamera(inc, resource, options = {}) {
    const { closeNearbyModal = false, currentQrOverride = null } = options;
    let subClose = inc.incidenceSubType;
    if (!subClose) {
        try {
            const r = await fetch('/api/incidence-types');
            const d = await r.json();
            subClose = (d.success && d.default_subtype) ? d.default_subtype : INCIDENCE_SUBTYPES_FALLBACK[0];
        } catch (e) {
            subClose = INCIDENCE_SUBTYPES_FALLBACK[0];
        }
    }
    const documentNo = String(inc.documentNo || '').trim();
    if (!documentNo) {
        showStatus(
            'No se pudo obtener el número de la incidencia abierta. No se puede cerrar desde aquí.',
            'error'
        );
        return;
    }

    // EnProgreso + Cerrada se encadenan al pulsar "Cerrar incidencia" en la vista previa.
    showStatus('Toma o adjunta una foto de cierre. Después pulsa Cerrar incidencia.', 'success');

    if (closeNearbyModal) {
        closeNearbyElementsModal();
    }

    pendingCloseIncidenceData = {
        state: 'Cerrada',
        incidenceType: inc.incidenceType || INCIDENCE_TYPE_FALLBACK,
        incidenceSubType: subClose,
        observation: inc.observation || '',
        description: inc.description || '',
        resource: resource,
        image: [],
        audio: [],
        documentNo: documentNo,
        /** Si true, sendIncidenceFromPreview envía EnProgreso y luego Cerrada (mismo Nº BC) */
        needsEnProgresoBeforeClose: true
    };
    currentQRData = currentQrOverride != null ? currentQrOverride : resource;
    photoMode = 'cerrar';
    syncSendIncidenceBtnLabel();
    imagenia = null;
    currentPhotoData = null;
    photoGallery = [];
    startPhotoAutoCapture();
}

// Cerrar incidencia desde un elemento del mapa: enviar EnProgreso (sin foto), luego abrir cámara y enviar Cerrada con foto
async function closeIncidenceFromElement(elementIndex) {
    try {
        const marker = nearbyMarkers[elementIndex];
        if (!marker || !marker.elementData) {
            showStatus('Error: No se encontró el elemento seleccionado', 'error');
            return;
        }
        const element = marker.elementData;

        const isMobiliario = element.Tipo === 'Mobiliario' || element.tipo === 'Mobiliario' ||
            element.NombreVista === 'MobiliarioGis' || element.nombreVista === 'MobiliarioGis';
        const tipoParada = element.TipoParada || element.tipoParada || element['Tipo Parada'] || '';
        const isParadaBus = isMobiliario && tipoParada && tipoParada.toString().trim().length > 0;

        let elementId = '';
        if (isMobiliario) {
            elementId = element.NumeroEmplazamiento || element['Nº Emplazamiento'] ||
                element.numeroEmplazamiento || element['nº emplazamiento'] || 'ELEMENTO';
        } else {
            elementId = element.NumeroRecurso || element.No_ ||
                element.numeroRecurso || element.no_ ||
                element.Codigo || element.codigo || 'ELEMENTO';
        }

        const resourceForApi = isParadaBus ? `PARADA_${elementId}` : elementId;
        let res = await fetch(`/api/open-incidences?resource=${encodeURIComponent(resourceForApi)}`, {
            headers: { 'X-Device-ID': deviceId }
        });
        let data = await res.json();
        if (!data.success || !data.incidences || data.incidences.length === 0) {
            if (isParadaBus) {
                res = await fetch(`/api/open-incidences?resource=${encodeURIComponent(elementId)}`, {
                    headers: { 'X-Device-ID': deviceId }
                });
                data = await res.json();
            }
            if (!data.success || !data.incidences || data.incidences.length === 0) {
                showStatus('No hay incidencias abiertas para este elemento', 'warning');
                return;
            }
        }

        const inc = data.incidences[0];
        if (!String(inc.documentNo || '').trim()) {
            showStatus(
                'La incidencia abierta no tiene número de documento en BC. No se puede cerrar.',
                'error'
            );
            return;
        }
        const resource = inc.resource || resourceForApi;
        await sendEnProgresoAndOpenCloseCamera(inc, resource, {
            closeNearbyModal: true,
            currentQrOverride: elementId
        });
    } catch (error) {
        console.error('Error al cerrar incidencia desde elemento:', error);
        showStatus('Error: ' + (error.message || 'Error al cerrar incidencia'), 'error');
    }
}

// Hacer función global para el botón del popup
window.createIncidenceFromElement = createIncidenceFromElement;
window.closeIncidenceFromElement = closeIncidenceFromElement;

// Cerrar modal de elementos cercanos
function closeNearbyElementsModal(options = {}) {
    const { clearAssignedPhoto = true } = options;

    if (elements.nearbyElementsModal) {
        elements.nearbyElementsModal.style.display = 'none';
    }

    // Solo al cancelar (× / Escape / clic fuera): no al crear incidencia con foto ya elegida
    if (clearAssignedPhoto && !assignedLocalPhotoIdForIncidence) {
        pendingAssignedLocalPhotoId = null;
    }
    
    // Limpiar mapa
    if (nearbyMapInstance) {
        nearbyMapInstance.remove();
        nearbyMapInstance = null;
    }
    
    nearbyMarkers = [];
    userMarker = null;
    nearbyRadiusCircle = null;
    nearbyAccuracyCircle = null;
    nearbySearchState = null;
    nearbyExpandInFlight = false;
    nearbyRelocateInFlight = false;
    updateExpandNearbyRadiusButton();
    if (elements.nearbyLocationHint) {
        elements.nearbyLocationHint.style.display = 'none';
    }
    
    console.log('🗺️ Modal de elementos cercanos cerrado');
}

