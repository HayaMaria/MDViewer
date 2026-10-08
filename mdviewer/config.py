"""Настройки пользователя: %APPDATA%/MDViewer/config.json."""
import json
import os

CONFIG_DIR = os.path.join(os.environ.get('APPDATA', os.path.expanduser('~')), 'MDViewer')
CONFIG_PATH = os.path.join(CONFIG_DIR, 'config.json')

DEFAULTS = {
    'theme': 'dark',
    'fontSize': 15,
    'splitterPos': 50,
    'syncScroll': True,
}
EXPORT_DEFAULTS = {
    'mode': 'full',
    'theme': 'current',
    'save_path': '',
}
# Доступные ширины медиа (изображения, схемы, диаграммы, графики), в px
MEDIA_SIZE_OPTIONS = tuple(range(200, 1001, 50))
MEDIA_SIZE_DEFAULTS = {
    'image': 500,
    'mermaid': 600,
    'uml': 450,
    'chart': 600,
}
# Периодичность автосохранения, в секундах. 0 в настройках не хранится:
# выключение — отдельный флаг enabled.
AUTOSAVE_INTERVALS = (
    (5, '5 секунд'),
    (10, '10 секунд'),
    (15, '15 секунд'),
    (30, '30 секунд'),
    (60, '1 минута'),
    (120, '2 минуты'),
    (300, '5 минут'),
    (600, '10 минут'),
)
AUTOSAVE_DEFAULT_INTERVAL = 30
# Ширина колонки просмотра и экспорта. Редактор этой мерой не ограничен.
COLUMN_WIDTHS = ('reading', 'wide', 'full')
COLUMN_WIDTH_DEFAULT = 'reading'


def load_config():
    try:
        with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_config(config):
    os.makedirs(CONFIG_DIR, exist_ok=True)
    with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2)


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


def _clamp_media_size(value, fallback):
    try:
        size = int(value)
    except (TypeError, ValueError):
        return fallback
    return size if size in MEDIA_SIZE_OPTIONS else fallback


def media_size_defaults(config=None):
    """Ширины по умолчанию для изображений / Mermaid / UML / графиков."""
    config = load_config() if config is None else config
    saved = config.get('mediaSizes', {})
    return {
        key: _clamp_media_size(saved.get(key), default)
        for key, default in MEDIA_SIZE_DEFAULTS.items()
    }


def _clamp_autosave_interval(value):
    try:
        seconds = int(value)
    except (TypeError, ValueError):
        return AUTOSAVE_DEFAULT_INTERVAL
    allowed = {item[0] for item in AUTOSAVE_INTERVALS}
    return seconds if seconds in allowed else AUTOSAVE_DEFAULT_INTERVAL


def column_width(config=None):
    """reading — около 72 знаков, wide — около 100, full — на всю ширину."""
    config = load_config() if config is None else config
    value = config.get('columnWidth', COLUMN_WIDTH_DEFAULT)
    return value if value in COLUMN_WIDTHS else COLUMN_WIDTH_DEFAULT


def autosave_settings(config=None):
    """Включено ли автосохранение и как часто, в секундах."""
    config = load_config() if config is None else config
    saved = config.get('autosave', {})
    return {
        'enabled': bool(saved.get('enabled', False)),
        'interval': _clamp_autosave_interval(saved.get('interval', AUTOSAVE_DEFAULT_INTERVAL)),
    }


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
        'autosave': autosave_settings(config),
        'autosave_intervals': [
            {'value': seconds, 'label': label} for seconds, label in AUTOSAVE_INTERVALS
        ],
    }


def save_ui_settings(settings):
    """Сохранить значения из диалога «Настройки»."""
    config = load_config()
    config['fontSize'] = int(settings['font_size'])
    config['export'] = {key: settings['export'].get(key, default) for key, default in EXPORT_DEFAULTS.items()}
    config['save'] = {'default_path': settings.get('md_save_dir', '')}
    incoming = settings.get('media_sizes') or {}
    config['mediaSizes'] = {
        key: _clamp_media_size(incoming.get(key), default)
        for key, default in MEDIA_SIZE_DEFAULTS.items()
    }
    config['columnWidth'] = column_width({'columnWidth': settings.get('column_width')})
    incoming_autosave = settings.get('autosave') or {}
    config['autosave'] = {
        'enabled': bool(incoming_autosave.get('enabled', False)),
        'interval': _clamp_autosave_interval(incoming_autosave.get('interval')),
    }
    save_config(config)
