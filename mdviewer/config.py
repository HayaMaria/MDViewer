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
    }


def save_ui_settings(settings):
    """Сохранить значения из диалога «Настройки»."""
    config = load_config()
    config['fontSize'] = int(settings['font_size'])
    config['export'] = {key: settings['export'].get(key, default) for key, default in EXPORT_DEFAULTS.items()}
    config['save'] = {'default_path': settings.get('md_save_dir', '')}
    save_config(config)
