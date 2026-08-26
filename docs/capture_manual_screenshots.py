"""
Captura pantallazos de la UI de Incidencias para el manual Word.
Muestra estados de la interfaz (sin login real) forzando visibilidad en el DOM.
"""
import os
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = Path(__file__).resolve().parent
OUT = BASE / "manual_screenshots"
OUT.mkdir(parents=True, exist_ok=True)
URL = os.environ.get("INCIDENCIAS_URL", "http://127.0.0.1:5000/")


def shot(page, name, full_page=False):
    path = OUT / f"{name}.png"
    page.screenshot(path=str(path), full_page=full_page)
    print(f"OK {path.name}")
    return path


def show_action_buttons(page):
    page.evaluate(
        """() => {
        const login = document.getElementById('loginSection');
        if (login) login.style.display = 'none';
        const actions = document.getElementById('actionButtons');
        if (actions) actions.style.display = 'block';
        const user = document.getElementById('userIconBtn');
        if (user) { user.style.display = 'flex'; user.title = 'Usuario: demo'; }
    }"""
    )


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 420, "height": 820},
            device_scale_factor=2,
            is_mobile=True,
            has_touch=True,
        )
        page = context.new_page()
        page.goto(URL, wait_until="networkidle", timeout=60000)
        time.sleep(0.8)

        # 01 - Pantalla de login
        page.evaluate(
            """() => {
            const login = document.getElementById('loginSection');
            if (login) login.style.display = 'block';
            const actions = document.getElementById('actionButtons');
            if (actions) actions.style.display = 'none';
        }"""
        )
        shot(page, "01_inicio_login")

        # Modal login
        page.evaluate(
            """() => {
            const m = document.getElementById('loginModal');
            if (m) m.style.display = 'block';
        }"""
        )
        time.sleep(0.3)
        shot(page, "02_modal_login")
        page.evaluate("() => { const m = document.getElementById('loginModal'); if (m) m.style.display='none'; }")

        # 03 - Botones principales
        show_action_buttons(page)
        shot(page, "03_botones_principales")

        # 04 - Modal cámara / reportar
        page.evaluate(
            """() => {
            const m = document.getElementById('photoModal');
            if (m) m.style.display = 'block';
            const cap = document.getElementById('capturePhotoBtn');
            if (cap) cap.style.display = 'flex';
            const imp = document.getElementById('importPhotoBtn');
            if (imp) imp.style.display = 'flex';
        }"""
        )
        time.sleep(0.3)
        shot(page, "04_modal_camara")
        page.evaluate("() => { const m = document.getElementById('photoModal'); if (m) m.style.display='none'; }")

        # 05 - Vista previa + enviar
        page.evaluate(
            """() => {
            const prev = document.getElementById('photoPreview');
            if (prev) prev.style.display = 'block';
            const def = document.querySelector('.default-image-container');
            if (def) def.style.display = 'none';
            const gal = document.getElementById('photoGallery');
            if (gal) {
                gal.innerHTML = '<div class="photo-gallery-item" style="min-height:120px;background:#ddd;display:flex;align-items:center;justify-content:center;border-radius:8px;"><span style="color:#666">Vista previa foto</span></div>';
            }
            const send = document.getElementById('sendIncidenceBtn');
            if (send) { send.style.display = 'flex'; send.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Enviar Incidencia'; }
            const hint = document.getElementById('assignedLocalPhotoDescription');
            if (hint) {
                hint.style.display = 'block';
                hint.innerHTML = '<i class="fas fa-align-left"></i> <strong>Descripción:</strong> Cristal roto';
            }
        }"""
        )
        time.sleep(0.3)
        shot(page, "05_vista_previa_enviar")
        page.evaluate(
            """() => {
            const prev = document.getElementById('photoPreview');
            if (prev) prev.style.display = 'none';
            const send = document.getElementById('sendIncidenceBtn');
            if (send) send.style.display = 'none';
            const hint = document.getElementById('assignedLocalPhotoDescription');
            if (hint) hint.style.display = 'none';
            const def = document.querySelector('.default-image-container');
            if (def) def.style.display = 'block';
        }"""
        )

        # 06 - Modal audio
        page.evaluate("() => { const m = document.getElementById('audioModal'); if (m) m.style.display='block'; }")
        time.sleep(0.3)
        shot(page, "06_modal_audio")
        page.evaluate("() => { const m = document.getElementById('audioModal'); if (m) m.style.display='none'; }")

        # 07 - Elementos cerca (mapa vacío con UI)
        page.evaluate(
            """() => {
            const m = document.getElementById('nearbyElementsModal');
            if (m) m.style.display = 'block';
            const title = document.getElementById('nearbyModalTitle');
            if (title) title.innerHTML = '<i class="fas fa-map-marker-alt"></i> Elementos Cerca (500 m)';
            const st = document.getElementById('mapStatus');
            if (st) st.innerHTML = '<i class="fas fa-check-circle"></i> 3 elemento(s) en 500 m · GPS ±25 m';
            const hint = document.getElementById('nearbyLocationHint');
            if (hint) {
                hint.style.display = 'flex';
                hint.classList.add('is-ok');
                document.getElementById('nearbyLocationHintText').innerHTML =
                    '<i class="fas fa-info-circle"></i> Arrastra el pin azul o toca el mapa para mover el centro.';
            }
            const map = document.getElementById('nearbyMap');
            if (map) {
                map.innerHTML = '<div style="height:100%;min-height:280px;background:linear-gradient(135deg,#dfe9f3,#c3d9ec);display:flex;align-items:center;justify-content:center;border-radius:5px;color:#335;font-size:14px;text-align:center;padding:16px;">Mapa de elementos cercanos<br><small>(marcadores de mobiliario y recursos)</small></div>';
            }
        }"""
        )
        time.sleep(0.3)
        shot(page, "07_elementos_cerca")
        page.evaluate("() => { const m = document.getElementById('nearbyElementsModal'); if (m) m.style.display='none'; }")

        # 08 - Descripción foto local
        page.evaluate(
            """() => {
            const m = document.getElementById('localPhotoDescModal');
            if (m) m.style.display = 'block';
            const thumb = document.getElementById('localPhotoDescThumb');
            if (thumb) {
                thumb.style.background = '#ccc';
                thumb.style.minHeight = '100px';
                thumb.style.width = '100%';
                thumb.removeAttribute('src');
            }
            const ta = document.getElementById('localPhotoDescText');
            if (ta) ta.value = 'Farola apagada junto a la parada';
        }"""
        )
        time.sleep(0.3)
        shot(page, "08_descripcion_foto_local")
        page.evaluate("() => { const m = document.getElementById('localPhotoDescModal'); if (m) m.style.display='none'; }")

        # 09 - Asignar fotos (solo mías)
        page.evaluate(
            """() => {
            const m = document.getElementById('assignPhotoModal');
            if (m) m.style.display = 'block';
            const mine = document.getElementById('assignPhotoScopeMineBtn');
            const all = document.getElementById('assignPhotoScopeAllBtn');
            if (mine) mine.classList.add('is-active');
            if (all) all.classList.remove('is-active');
            const list = document.getElementById('unassignedPhotosList');
            if (list) {
                list.innerHTML = `
                <div class="unassigned-photo-item">
                  <div style="width:72px;height:72px;background:#bbb;border-radius:6px;flex-shrink:0;"></div>
                  <div class="unassigned-photo-meta">
                    <strong>21/07/2026, 12:30</strong><br>
                    <small><i class="fas fa-map-marker-alt"></i> 39.57000, 2.65000</small>
                    <span class="unassigned-photo-desc">Cristal roto</span>
                  </div>
                </div>
                <div class="unassigned-photo-item">
                  <div style="width:72px;height:72px;background:#999;border-radius:6px;flex-shrink:0;"></div>
                  <div class="unassigned-photo-meta">
                    <strong>21/07/2026, 11:05</strong><br>
                    <small>Sin ubicación GPS</small>
                  </div>
                </div>`;
            }
            const empty = document.getElementById('noUnassignedPhotosMsg');
            if (empty) empty.style.display = 'none';
        }"""
        )
        time.sleep(0.3)
        shot(page, "09_asignar_fotos_mias")

        # 10 - Asignar fotos todos (acordeón)
        page.evaluate(
            """() => {
            const mine = document.getElementById('assignPhotoScopeMineBtn');
            const all = document.getElementById('assignPhotoScopeAllBtn');
            if (mine) mine.classList.remove('is-active');
            if (all) all.classList.add('is-active');
            const list = document.getElementById('unassignedPhotosList');
            if (list) {
                list.innerHTML = `
                <div class="pending-photo-user-group is-open">
                  <button type="button" class="pending-photo-user-header">
                    <span><i class="fas fa-user"></i> andres <small>(2)</small></span>
                    <i class="fas fa-chevron-right pending-photo-chevron"></i>
                  </button>
                  <div class="pending-photo-user-body" style="display:flex">
                    <div class="unassigned-photo-item">
                      <div style="width:72px;height:72px;background:#bbb;border-radius:6px;flex-shrink:0;"></div>
                      <div class="unassigned-photo-meta"><strong>21/07/2026, 12:30</strong><br><small>39.57, 2.65</small></div>
                    </div>
                  </div>
                </div>
                <div class="pending-photo-user-group">
                  <button type="button" class="pending-photo-user-header">
                    <span><i class="fas fa-user"></i> oficina <small>(1)</small></span>
                    <i class="fas fa-chevron-right pending-photo-chevron"></i>
                  </button>
                  <div class="pending-photo-user-body"></div>
                </div>`;
            }
        }"""
        )
        time.sleep(0.3)
        shot(page, "10_asignar_fotos_todos")
        page.evaluate("() => { const m = document.getElementById('assignPhotoModal'); if (m) m.style.display='none'; }")

        # 11 - Tipo/subtipo picker
        page.evaluate(
            """() => {
            const m = document.getElementById('incidencePickerModal');
            if (m) m.style.display = 'block';
            const t = document.getElementById('pickerIncidenceType');
            const s = document.getElementById('pickerIncidenceSubType');
            if (t) {
                t.innerHTML = '<option>Mobiliario Urbano</option><option>EMT</option>';
                t.disabled = true;
            }
            if (s) {
                s.innerHTML = '<option>Mantenimiento</option><option>Limpieza</option><option>Electrico</option>';
            }
        }"""
        )
        time.sleep(0.3)
        shot(page, "11_tipo_subtipo")
        page.evaluate("() => { const m = document.getElementById('incidencePickerModal'); if (m) m.style.display='none'; }")

        # 12 - Desktop wider for botones
        page.set_viewport_size({"width": 900, "height": 700})
        show_action_buttons(page)
        time.sleep(0.3)
        shot(page, "12_escritorio_botones")

        browser.close()
    print(f"Capturas en: {OUT}")


if __name__ == "__main__":
    main()
