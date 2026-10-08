"""Сессия между запусками: %APPDATA%/MDViewer/session.json.

Хранит открытые вкладки и место в активной. Черновик пишется только пока текст
не сохранён на диск, чтобы не дублировать файл при каждом движении курсора.
Старый файл с одним документом по-прежнему открывается — как одна вкладка.
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


def _title(raw, path):
    title = raw.get('title') if isinstance(raw, dict) else None
    if isinstance(title, str) and title.strip():
        return title.strip()
    if path:
        return os.path.basename(path)
    return 'Новый документ'


def normalize_tab(raw):
    """Одна вкладка. None — запись не про вкладку."""
    if not isinstance(raw, dict) or 'html' not in raw:
        return None
    path = raw.get('path')
    if not isinstance(path, str) or not path:
        path = None
    if raw.get('html'):
        return {
            'html': True,
            'path': path,
            'title': _title(raw, path),
            'welcome': False,
            'dirty': False,
        }
    dirty = bool(raw.get('dirty'))
    draft = raw.get('draft')
    if not isinstance(draft, str):
        draft = raw.get('content')
    if dirty and not isinstance(draft, str):
        dirty = False
    welcome = bool(raw.get('welcome')) and not path and not dirty
    record = {
        'html': False,
        'path': path,
        'title': _title(raw, path),
        'welcome': welcome,
        'dirty': dirty,
        'anchor': _offset(raw.get('anchor')),
        'head': _offset(raw.get('head')),
        'scroll': _ratio(raw.get('scroll')),
        'previewScroll': _ratio(raw.get('previewScroll')),
    }
    if dirty:
        record['draft'] = draft
    return record


def _active_index(value, count):
    try:
        number = int(value)
    except (TypeError, ValueError):
        return 0
    if number < 0 or number >= count:
        return 0
    return number


def normalize_bundle(raw):
    """Вкладки одного окна. None — это не пачка вкладок.

    Прежний формат (один документ без поля tabs) читается как одна вкладка.
    """
    if not isinstance(raw, dict):
        return None
    if 'tabs' not in raw:
        tab = normalize_tab(raw)
        if tab is None:
            return None
        return {'tabs': [tab], 'active': 0}
    tabs = []
    for item in raw.get('tabs') or []:
        tab = normalize_tab(item)
        if tab is not None:
            tabs.append(tab)
    if not tabs:
        return None
    return {'tabs': tabs, 'active': _active_index(raw.get('active'), len(tabs))}


def normalize(raw):
    """Сессия: одно или несколько окон. None — файл не про сессию.

    Старый файл без поля windows — это одно окно.
    """
    if not isinstance(raw, dict):
        return None
    if isinstance(raw.get('windows'), list):
        windows = []
        for item in raw['windows']:
            bundle = normalize_bundle(item)
            if bundle is not None:
                windows.append(bundle)
        if not windows:
            return None
        return {'windows': windows}
    bundle = normalize_bundle(raw)
    if bundle is None:
        return None
    return {'windows': [bundle]}


def iter_windows(data):
    """Список пачек вкладок. Пусто, если это не сессия."""
    if not isinstance(data, dict):
        return []
    windows = data.get('windows')
    if isinstance(windows, list):
        return [item for item in windows if isinstance(item, dict) and item.get('tabs')]
    if data.get('tabs'):
        return [data]
    return []


def merge_windows(data):
    """Все окна сессии — одна пачка вкладок. При запуске открывается одно окно."""
    bundles = iter_windows(data)
    tabs = []
    seen = set()
    for bundle in bundles:
        for tab in bundle.get('tabs') or []:
            if not isinstance(tab, dict):
                continue
            path = tab.get('path')
            key = os.path.normcase(path) if isinstance(path, str) and path else None
            if key and key in seen:
                continue
            if key:
                seen.add(key)
            tabs.append(tab)
    if not tabs:
        return None
    active = 0
    if bundles:
        try:
            active = int(bundles[0].get('active') or 0)
        except (TypeError, ValueError):
            active = 0
    if active < 0 or active >= len(tabs):
        active = 0
    return {'tabs': tabs, 'active': active}


def is_pristine_welcome(tab):
    """Приветственный текст, который пользователь ещё не менял и не сохранял."""
    return bool(
        isinstance(tab, dict)
        and tab.get('welcome')
        and not tab.get('html')
        and not tab.get('dirty')
        and not tab.get('path')
    )


def tab_restorable(tab):
    """Можно ли вернуть одну вкладку. Файл нужен, только если нет черновика."""
    if not isinstance(tab, dict):
        return False
    if is_pristine_welcome(tab):
        return True
    if tab.get('html'):
        path = tab.get('path')
        return isinstance(path, str) and os.path.isfile(path)
    if tab.get('dirty'):
        return isinstance(tab.get('draft'), str)
    path = tab.get('path')
    if path:
        return os.path.isfile(path)
    return True


def bundle_restorable(data):
    """Есть ли в одном окне что открывать, кроме нетронутого приветствия."""
    if not isinstance(data, dict) or not data.get('tabs'):
        return False
    return any(
        tab_restorable(tab) and not is_pristine_welcome(tab)
        for tab in data['tabs']
    )


def is_restorable(data):
    """Есть ли что открывать хотя бы в одном окне."""
    return any(bundle_restorable(bundle) for bundle in iter_windows(data))


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
