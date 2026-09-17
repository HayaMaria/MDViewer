import os
import json

# Путь к файлу конфигурации (%APPDATA%/MDViewer/config.json — сохраняется между запусками)
CONFIG_DIR = os.path.join(os.environ.get('APPDATA', os.path.expanduser('~')), 'MDViewer')
CONFIG_PATH = os.path.join(CONFIG_DIR, 'config.json')


def load_config():
    """Загрузить настройки из JSON-файла"""
    try:
        with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_config(config):
    """Сохранить настройки в JSON-файл"""
    os.makedirs(CONFIG_DIR, exist_ok=True)
    with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2)

def load_export_config():
    """Загрузить настройки экспорта из конфига"""
    config = load_config()
    return {
        'mode': config.get('export', {}).get('mode', 'full'),
        'theme': config.get('export', {}).get('theme', 'current'),
        'save_path': config.get('export', {}).get('save_path', ''),
    }


def save_export_config(mode, theme, save_path, md_path=None):
    """Сохранить настройки экспорта и .md в конфиг"""
    config = load_config()
    config['export'] = {
        'mode': mode,
        'theme': theme,
        'save_path': save_path,
    }
    # Сохраняем md_path только если он не пустой
    if md_path:
        config['save'] = {'default_path': md_path}
    elif 'save' not in config:
        config['save'] = {'default_path': ''}
    save_config(config)


def get_downloads_folder():
    """Получить путь к папке Downloads"""
    return os.path.join(os.path.expanduser('~'), 'Downloads')

# Ссылка на API (заполняется при запуске)
api = None
# ===== Общая конфигурация Mermaid для экспорта =====
# Светлая тема (ч/б палитра)
MERMAID_INIT_ARGS_LIGHT = (
    '''{theme:"base",startOnLoad:false,themeVariables:{'''
    '''background:"#ffffff",primaryColor:"#ffffff",primaryBorderColor:"#000000",'''
    '''primaryTextColor:"#000000",secondaryColor:"#ffffff",secondaryBorderColor:"#000000",'''
    '''secondaryTextColor:"#000000",tertiaryColor:"#ffffff",tertiaryBorderColor:"#000000",'''
    '''tertiaryTextColor:"#000000",lineColor:"#000000",arrowheadColor:"#000000",'''
    '''textColor:"#000000",titleColor:"#000000",nodeBkg:"#ffffff",nodeBorder:"#000000",'''
    '''nodeTextColor:"#000000",clusterBkg:"#ffffff",clusterBorder:"#000000",'''
    '''defaultLinkColor:"#000000",edgeLabelBackground:"#ffffff",mainBkg:"#ffffff",'''
    '''secondBkg:"#ffffff",actorBorder:"#000000",actorBkg:"#ffffff",actorTextColor:"#000000",'''
    '''actorLineColor:"#000000",signalColor:"#000000",signalTextColor:"#000000",'''
    '''labelBoxBkgColor:"#ffffff",labelBoxBorderColor:"#000000",labelTextColor:"#000000",'''
    '''loopTextColor:"#000000",noteBorderColor:"#000000",noteBkgColor:"#ffffff",'''
    '''noteTextColor:"#000000",activationBorderColor:"#000000",activationBkgColor:"#ffffff",'''
    '''sequenceNumberColor:"#000000",sectionBkgColor:"#ffffff",taskBorderColor:"#000000",'''
    '''taskTextColor:"#000000",taskTextOutsideColor:"#000000",taskTextLightColor:"#000000",'''
    '''gridColor:"#000000",stateBorder:"#000000",stateBkg:"#ffffff",classText:"#000000",'''
    '''pieStrokeColor:"#000000",pieSectionTextColor:"#000000",pieLegendTextColor:"#000000",'''
    '''useGradient:false,dropShadow:"none"'''
    '''}}'''
)

# Тёмная тема (тёмный фон, светлый текст для экспорта)
MERMAID_INIT_ARGS_DARK = (
    '''{theme:"base",startOnLoad:false,themeVariables:{'''
    '''background:"#1e1e1e",primaryColor:"#1e1e1e",primaryBorderColor:"#d4d4d4",'''
    '''primaryTextColor:"#d4d4d4",secondaryColor:"#1e1e1e",secondaryBorderColor:"#d4d4d4",'''
    '''secondaryTextColor:"#d4d4d4",tertiaryColor:"#1e1e1e",tertiaryBorderColor:"#d4d4d4",'''
    '''tertiaryTextColor:"#d4d4d4",lineColor:"#d4d4d4",arrowheadColor:"#d4d4d4",'''
    '''textColor:"#d4d4d4",titleColor:"#e1e1e1",nodeBkg:"#1e1e1e",nodeBorder:"#d4d4d4",'''
    '''nodeTextColor:"#d4d4d4",clusterBkg:"#1e1e1e",clusterBorder:"#d4d4d4",'''
    '''defaultLinkColor:"#d4d4d4",edgeLabelBackground:"#1e1e1e",mainBkg:"#1e1e1e",'''
    '''secondBkg:"#1e1e1e",actorBorder:"#d4d4d4",actorBkg:"#1e1e1e",actorTextColor:"#d4d4d4",'''
    '''actorLineColor:"#d4d4d4",signalColor:"#d4d4d4",signalTextColor:"#d4d4d4",'''
    '''labelBoxBkgColor:"#1e1e1e",labelBoxBorderColor:"#d4d4d4",labelTextColor:"#d4d4d4",'''
    '''loopTextColor:"#d4d4d4",noteBorderColor:"#d4d4d4",noteBkgColor:"#1e1e1e",'''
    '''noteTextColor:"#d4d4d4",activationBorderColor:"#d4d4d4",activationBkgColor:"#1e1e1e",'''
    '''sequenceNumberColor:"#d4d4d4",sectionBkgColor:"#1e1e1e",taskBorderColor:"#d4d4d4",'''
    '''taskTextColor:"#d4d4d4",taskTextOutsideColor:"#d4d4d4",taskTextLightColor:"#999999",'''
    '''gridColor:"#555555",stateBorder:"#d4d4d4",stateBkg:"#1e1e1e",classText:"#d4d4d4",'''
    '''pieStrokeColor:"#555555",pieSectionTextColor:"#d4d4d4",pieLegendTextColor:"#d4d4d4",'''
    '''useGradient:false,dropShadow:"none"'''
    '''}}'''
)


