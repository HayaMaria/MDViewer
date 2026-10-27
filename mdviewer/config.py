"""Настройки пользователя: %APPDATA%/MDViewer/config.json."""
import json
import os
import re
import threading
from datetime import datetime

from . import durable

CONFIG_DIR = os.path.join(os.environ.get('APPDATA', os.path.expanduser('~')), 'MDViewer')
CONFIG_PATH = os.path.join(CONFIG_DIR, 'config.json')
USER_DICT_PATH = os.path.join(CONFIG_DIR, 'user-dictionary.txt')
_user_dict_lock = threading.Lock()
# Буквы, внутри слова — дефис или апостроф. Цифры и подчёркивание не принимаем.
_USER_WORD_RE = re.compile(r"^[^\W\d_](?:[^\W\d_]|['’-](?=[^\W\d_])){0,63}$", re.UNICODE)
_ADDED_RE = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$')

DEFAULTS = {
    'theme': 'dark',
    'fontSize': 15,
    'splitterPos': 50,
    'syncScroll': True,
}
EXPORT_DEFAULTS = {
    'theme': 'current',
    'save_path': '',
    'embed_images': False,
}
# Доступные ширины медиа (изображения, схемы, диаграммы, графики), в px
MEDIA_SIZE_OPTIONS = tuple(range(200, 1001, 50))
# 0 у таблицы — «По содержимому»: ширина не задана.
MEDIA_SIZE_DEFAULTS = {
    'table': 0,
    'image': 500,
    'mermaid': 600,
    'uml': 450,
    'chart': 600,
}
# Ширина колонки просмотра и экспорта. Редактор этой мерой не ограничен.
COLUMN_WIDTHS = ('reading', 'wide', 'full')
COLUMN_WIDTH_DEFAULT = 'reading'


def load_config():
    status, raw = durable.parse_json(CONFIG_PATH)
    if status == 'absent':
        return {}
    if status == 'ok' and isinstance(raw, dict):
        durable.note_good(CONFIG_PATH)
        durable.ensure_backup(CONFIG_PATH)
        return raw
    _status, backup = durable.parse_json(CONFIG_PATH + '.bak')
    if isinstance(backup, dict):
        return backup
    return {}


def save_config(config):
    payload = json.dumps(config, indent=2)
    durable.write_text(CONFIG_PATH, payload, backup=True, backup_interval=0, newline='\n')


def set_value(key, value):
    config = load_config()
    config[key] = value
    save_config(config)


def downloads_dir():
    return os.path.join(os.path.expanduser('~'), 'Downloads')


def export_settings(config=None):
    config = load_config() if config is None else config
    return {**EXPORT_DEFAULTS, **config.get('export', {})}


def md_save_dir():
    """Папка по умолчанию для первого сохранения .md (Загрузки, если не задана или удалена)."""
    path = load_config().get('save', {}).get('default_path', '')
    return path if os.path.isdir(path) else downloads_dir()


def _clamp_media_size(key, value, fallback):
    try:
        size = int(value)
    except (TypeError, ValueError):
        return fallback
    if key == 'table' and size == 0:
        return 0
    return size if size in MEDIA_SIZE_OPTIONS else fallback


def media_size_defaults(config=None):
    """Ширины по умолчанию для таблиц / изображений / Mermaid / UML / графиков."""
    config = load_config() if config is None else config
    saved = config.get('mediaSizes', {})
    return {
        key: _clamp_media_size(key, saved.get(key), default)
        for key, default in MEDIA_SIZE_DEFAULTS.items()
    }


def column_width(config=None):
    """reading — около 72 знаков, wide — около 100, full — на всю ширину."""
    config = load_config() if config is None else config
    value = config.get('columnWidth', COLUMN_WIDTH_DEFAULT)
    return value if value in COLUMN_WIDTHS else COLUMN_WIDTH_DEFAULT


def spellcheck_settings(config=None):
    """Включена ли проверка орфографии. По умолчанию да."""
    config = load_config() if config is None else config
    saved = config.get('spellcheck') or {}
    return {'enabled': bool(saved.get('enabled', True))}


def _added_stamp():
    return datetime.now().isoformat(timespec='seconds')


def _entry_from_parts(word, added):
    word = str(word).strip()
    added = str(added or '').strip()
    if not _USER_WORD_RE.fullmatch(word):
        return None
    if not _ADDED_RE.fullmatch(added):
        added = ''
    return {'word': word, 'added': added}


def _clean_user_entries(words):
    """Уникальные записи без сортировки: порядок в файле — порядок добавления."""
    seen = set()
    cleaned = []
    for raw in words or []:
        if isinstance(raw, dict):
            entry = _entry_from_parts(raw.get('word', ''), raw.get('added', ''))
        else:
            text = str(raw).strip()
            if '\t' in text:
                word, _, added = text.partition('\t')
            else:
                word, added = text, ''
            entry = _entry_from_parts(word, added)
        if entry is None:
            continue
        key = entry['word'].casefold()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(entry)
    return cleaned


def _read_user_entries():
    """Читать под замком. Старые файлы — слово на строке, без даты."""
    text = durable.read_text(USER_DICT_PATH)
    if not text:
        return []
    return _clean_user_entries(text.splitlines())


def _write_user_entries(entries):
    lines = []
    for entry in entries:
        line = entry['word']
        if entry.get('added'):
            line += '\t' + entry['added']
        lines.append(line)
    payload = ('\n'.join(lines) + '\n') if lines else ''
    durable.write_text(USER_DICT_PATH, payload, backup=True, backup_interval=0, newline='\n')


def user_dictionary():
    """Слова, которые пользователь добавил сам. Файл может отсутствовать."""
    with _user_dict_lock:
        return _read_user_entries()


def save_user_dictionary(words):
    """Записать свой словарь целиком. Возвращает то, что реально легло в файл."""
    cleaned = _clean_user_entries(words)
    with _user_dict_lock:
        _write_user_entries(cleaned)
    return cleaned


def add_user_word(word):
    """Дописать слово к своему словарю и вернуть полный список."""
    with _user_dict_lock:
        entries = _read_user_entries()
        fresh = _entry_from_parts(word, _added_stamp())
        if fresh is not None:
            key = fresh['word'].casefold()
            if not any(item['word'].casefold() == key for item in entries):
                entries.append(fresh)
        _write_user_entries(entries)
    return entries


def ui_settings():
    """Все настройки, нужные интерфейсу, одним словарём."""
    config = load_config()
    return {
        'theme': config.get('theme', DEFAULTS['theme']),
        'font_size': config.get('fontSize', DEFAULTS['fontSize']),
        'splitter_pos': config.get('splitterPos', DEFAULTS['splitterPos']),
        'sync_scroll': config.get('syncScroll', DEFAULTS['syncScroll']),
        'export': export_settings(config),
        'md_save_dir': config.get('save', {}).get('default_path', ''),
        'downloads_dir': downloads_dir(),
        'media_sizes': media_size_defaults(config),
        'media_size_options': list(MEDIA_SIZE_OPTIONS),
        'column_width': column_width(config),
        'spellcheck': spellcheck_settings(config),
        'user_words': user_dictionary(),
    }


def save_ui_settings(settings):
    """Сохранить значения из диалога «Настройки»."""
    config = load_config()
    config['fontSize'] = int(settings['font_size'])
    incoming_export = settings.get('export') or {}
    saved_export = {}
    for key, default in EXPORT_DEFAULTS.items():
        value = incoming_export.get(key, default)
        if key == 'embed_images':
            value = bool(value)
        saved_export[key] = value
    config['export'] = saved_export
    config['save'] = {'default_path': settings.get('md_save_dir', '')}
    incoming = settings.get('media_sizes') or {}
    config['mediaSizes'] = {
        key: _clamp_media_size(key, incoming.get(key), default)
        for key, default in MEDIA_SIZE_DEFAULTS.items()
    }
    config['columnWidth'] = column_width({'columnWidth': settings.get('column_width')})
    config.pop('autosave', None)
    if 'spellcheck' in settings:
        incoming_spell = settings.get('spellcheck') or {}
        config['spellcheck'] = {'enabled': bool(incoming_spell.get('enabled', False))}
    save_config(config)
    if 'user_words' in settings:
        save_user_dictionary(settings.get('user_words') or [])
