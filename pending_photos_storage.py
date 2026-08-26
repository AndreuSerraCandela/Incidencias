"""
Almacenamiento en servidor de fotos pendientes de asignar (por usuario GTask).
"""

import base64
import json
import os
import threading
import uuid
from datetime import datetime

_LOCK = threading.Lock()

PENDING_PHOTOS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pending_photos')
INDEX_FILE = os.path.join(PENDING_PHOTOS_DIR, 'index.json')


def _ensure_dirs():
    os.makedirs(PENDING_PHOTOS_DIR, exist_ok=True)


def _default_index():
    return {'photos': []}


def _load_index():
    _ensure_dirs()
    if not os.path.exists(INDEX_FILE):
        return _default_index()
    try:
        with open(INDEX_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if not isinstance(data, dict) or 'photos' not in data:
            return _default_index()
        if not isinstance(data['photos'], list):
            data['photos'] = []
        return data
    except Exception as e:
        print(f'⚠️ Error leyendo índice de fotos pendientes: {e}')
        return _default_index()


def _save_index(data):
    _ensure_dirs()
    with open(INDEX_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def _clean_base64(image_data):
    if not image_data or not isinstance(image_data, str):
        raise ValueError('Imagen no válida')
    raw = image_data.strip()
    if ',' in raw and raw.lower().startswith('data:'):
        raw = raw.split(',', 1)[1]
    return raw


def _disk_path_for_id(photo_id):
    # Solo jpg en disco; el id ya es seguro
    safe = ''.join(c for c in photo_id if c.isalnum() or c in ('_', '-'))
    return os.path.join(PENDING_PHOTOS_DIR, f'{safe}.jpg')


def create_pending_photo(
    image_data,
    user_id,
    username,
    latitude=None,
    longitude=None,
    accuracy=None,
    description='',
    filename=None,
):
    """Guarda imagen en disco y metadatos en el índice. Devuelve el registro (sin base64)."""
    b64 = _clean_base64(image_data)
    binary = base64.b64decode(b64)
    photo_id = f"pp_{datetime.now().strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:8]}"
    path = _disk_path_for_id(photo_id)

    with _LOCK:
        with open(path, 'wb') as f:
            f.write(binary)

        record = {
            'id': photo_id,
            'user_id': str(user_id or '').strip(),
            'username': str(username or 'Usuario').strip() or 'Usuario',
            'filename': filename or f'{photo_id}.jpg',
            'latitude': latitude,
            'longitude': longitude,
            'accuracy': accuracy,
            'description': (description or '').strip(),
            'createdAt': datetime.now().isoformat(),
            'file': os.path.basename(path),
        }

        index = _load_index()
        index['photos'].append(record)
        _save_index(index)

    return dict(record)


def list_pending_photos(scope='mine', current_user_id=None):
    """
    scope: 'mine' | 'all'
    Devuelve lista de registros (más recientes primero).
    """
    uid = str(current_user_id or '').strip()
    with _LOCK:
        index = _load_index()
        photos = list(index.get('photos') or [])

    if scope != 'all':
        photos = [p for p in photos if str(p.get('user_id') or '') == uid]

    photos.sort(key=lambda p: p.get('createdAt') or '', reverse=True)
    return photos


def get_pending_photo(photo_id):
    with _LOCK:
        index = _load_index()
        for p in index.get('photos') or []:
            if p.get('id') == photo_id:
                return dict(p)
    return None


def get_pending_photo_file_path(photo_id):
    record = get_pending_photo(photo_id)
    if not record:
        return None
    name = record.get('file') or f'{photo_id}.jpg'
    path = os.path.join(PENDING_PHOTOS_DIR, os.path.basename(name))
    if os.path.isfile(path):
        return path
    # Fallback por id
    alt = _disk_path_for_id(photo_id)
    if os.path.isfile(alt):
        return alt
    return None


def read_pending_photo_as_data_url(photo_id):
    path = get_pending_photo_file_path(photo_id)
    if not path:
        return None
    with open(path, 'rb') as f:
        raw = f.read()
    b64 = base64.b64encode(raw).decode('ascii')
    return f'data:image/jpeg;base64,{b64}'


def delete_pending_photo(photo_id):
    """Elimina metadatos y archivo. True si existía."""
    with _LOCK:
        index = _load_index()
        photos = index.get('photos') or []
        found = None
        remaining = []
        for p in photos:
            if p.get('id') == photo_id:
                found = p
            else:
                remaining.append(p)
        if not found:
            return False
        index['photos'] = remaining
        _save_index(index)

        name = found.get('file') or f'{photo_id}.jpg'
        path = os.path.join(PENDING_PHOTOS_DIR, os.path.basename(name))
        for candidate in (path, _disk_path_for_id(photo_id)):
            try:
                if os.path.isfile(candidate):
                    os.unlink(candidate)
            except Exception as e:
                print(f'⚠️ No se pudo borrar archivo {candidate}: {e}')
        return True
