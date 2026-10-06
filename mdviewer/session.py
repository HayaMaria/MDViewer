"""Сессия между запусками: %APPDATA%/MDViewer/session.json.

Хранит открытый документ и место в нём. Черновик пишется только пока текст
не сохранён на диск, чтобы не дублировать файл при каждом движении курсора.
"""
import json
import os
import threading

from .config import CONFIG_DIR

SESSION_PATH = os.path.join(CONFIG_DIR, 'session.json')
_lock = threading.Lock()
_last_written = None


def _offset(value):
    try:
        number = int(value)
    except (TypeError, ValueError):
        return 0
    return number if number > 0 else 0


def _ratio(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    if number != number or number < 0:
        return 0.0
    if number > 1:
        return 1.0
    return round(number, 6)


def normalize(raw):
    """Привести запись к известным полям. None — это не сессия."""
    if not isinstance(raw, dict) or 'html' not in raw:
        return None
    path = raw.get('path')
    if not isinstance(path, str) or not path:
        path = None
    if raw.get('html'):
        return {'html': True, 'path': path}
    dirty = bool(raw.get('dirty'))
    draft = raw.get('draft')
    if dirty and not isinstance(draft, str):
        dirty = False
    record = {
        'html': False,
        'path': path,
        'dirty': dirty,
        'anchor': _offset(raw.get('anchor')),
        'head': _offset(raw.get('head')),
        'scroll': _ratio(raw.get('scroll')),
        'previewScroll': _ratio(raw.get('previewScroll')),
    }
    if dirty:
        record['draft'] = draft
    return record


def is_restorable(data):
    """Можно ли открыть эту сессию. Файл на диске нужен, только если нет черновика."""
    if not data:
        return False
    if data.get('html'):
        path = data.get('path')
        return isinstance(path, str) and os.path.isfile(path)
    if data.get('dirty'):
        return isinstance(data.get('draft'), str)
    path = data.get('path')
    if path:
        return os.path.isfile(path)
    return True


def load_session(path=None):
    path = SESSION_PATH if path is None else path
    try:
        with _lock:
            with open(path, 'r', encoding='utf-8') as f:
                raw = json.load(f)
    except (OSError, json.JSONDecodeError, UnicodeError):
        return None
    return normalize(raw)


def save_session(record, path=None):
    normalized = normalize(record)
    if normalized is None:
        return
    payload = json.dumps(normalized, ensure_ascii=False, indent=2) + '\n'
    path = SESSION_PATH if path is None else path
    global _last_written
    with _lock:
        if path == SESSION_PATH and payload == _last_written:
            return
        os.makedirs(os.path.dirname(path), exist_ok=True)
        temporary = path + '.tmp'
        with open(temporary, 'w', encoding='utf-8', newline='\n') as f:
            f.write(payload)
        os.replace(temporary, path)
        if path == SESSION_PATH:
            _last_written = payload


def clear_session(path=None):
    path = SESSION_PATH if path is None else path
    global _last_written
    with _lock:
        if path == SESSION_PATH:
            _last_written = None
        try:
            os.remove(path)
        except FileNotFoundError:
            pass
        except OSError:
            return
