import os,json,webview
from config import load_config,save_config
api=None

def new_document():
    """Новый документ — очищает редактор, сбрасывает current_file, обновляет заголовок"""
    window = webview.active_window()
    window.evaluate_js('setEditorContent("")')
    global api
    api.current_file = None
    window.title = 'MD Viewer — Новый документ'
    window.evaluate_js('setFileName("Новый документ")')
    window.evaluate_js('markSaved()')



def open_file():
    """Открыть файл — диалог → читаем .md → устанавливаем в редактор"""
    window = webview.active_window()
    result = window.create_file_dialog(
        webview.FileDialog.OPEN,
        file_types=['Markdown files (*.md)', 'All files (*.*)']
    )
    if result:
        filepath = result[0]
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            escaped = json.dumps(content)
            window.evaluate_js(f'setEditorContent({escaped})')
            api.current_file = filepath
            window.title = f'MD Viewer — {os.path.basename(filepath)}'
            window.evaluate_js(f'setFileName({json.dumps(os.path.basename(filepath))})')
            window.evaluate_js('markSaved()')
        except Exception as e:
            window.evaluate_js(f'alert("Ошибка открытия файла: {str(e)}")')



def save_file():
    """Сохранить — перезаписать текущий файл или автосохранить в папку по умолчанию из конфига"""
    window = webview.active_window()
    content = window.evaluate_js('getEditorContent()')
    if api.current_file:
        try:
            with open(api.current_file, 'w', encoding='utf-8') as f:
                f.write(content)
            window.evaluate_js('markSaved()')
        except Exception as e:
            window.evaluate_js(f'alert("Ошибка сохранения: {str(e)}")')
    else:
        config = load_config()
        save_cfg = config.get('save', {})
        save_dir = save_cfg.get('default_path', '') or os.path.join(os.path.expanduser('~'), 'Downloads')
        name = 'Новый документ.md'
        filepath = os.path.join(save_dir, name)
        counter = 1
        while os.path.exists(filepath):
            filepath = os.path.join(save_dir, f'Новый документ ({counter}).md')
            counter += 1
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            api.current_file = filepath
            window.title = f'MD Viewer — {os.path.basename(filepath)}'
            window.evaluate_js(f'setFileName({json.dumps(os.path.basename(filepath))})')
            window.evaluate_js('markSaved()')
        except Exception as e:
            window.evaluate_js(f'alert("Ошибка сохранения: {str(e)}")')



def save_file_as():
    """Сохранить как — диалог выбора места сохранения"""
    window = webview.active_window()
    content = window.evaluate_js('getEditorContent()')
    result = window.create_file_dialog(
        webview.FileDialog.SAVE,
        save_filename='Новый документ.md',
        file_types=['Markdown files (*.md)', 'All files (*.*)']
    )
    if result:
        filepath = result[0]
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            api.current_file = filepath
            window.title = f'MD Viewer — {os.path.basename(filepath)}'
            window.evaluate_js(f'setFileName({json.dumps(os.path.basename(filepath))})')
            window.evaluate_js('markSaved()')
        except Exception as e:
            window.evaluate_js(f'alert("Ошибка сохранения: {str(e)}")')



def exit_app():
    """Выход — закрыть окно приложения"""
    window = webview.active_window()
    window.destroy()



def undo_action():
    """Отменить последнее действие в редакторе"""
    window = webview.active_window()
    window.evaluate_js('undoEditor()')



def redo_action():
    """Повторить отменённое действие"""
    window = webview.active_window()
    window.evaluate_js('redoEditor()')



def cut_action():
    """Вырезать выделенный текст"""
    window = webview.active_window()
    window.evaluate_js('cutText()')



def copy_action():
    """Копировать выделенный текст"""
    window = webview.active_window()
    window.evaluate_js('copyText()')



def paste_action():
    """Вставить текст из буфера обмена"""
    window = webview.active_window()
    window.evaluate_js('pasteText()')



def change_theme():
    """Смена темы — переключение между светлой и тёмной с сохранением в конфиг"""
    config = load_config()
    current_dark = config.get('theme', 'dark') == 'dark'
    new_dark = not current_dark
    theme_name = 'dark' if new_dark else 'light'
    config['theme'] = theme_name
    save_config(config)
    window = webview.active_window()
    window.evaluate_js(f'applyTheme({str(new_dark).lower()})')



def _load_help_text(title, filename):
    """Загрузить текст из assets/texts/filename и показать в диалоге справки"""
    window = webview.active_window()
    texts_dir = os.path.join(os.path.dirname(__file__), 'assets', 'texts')
    filepath = os.path.join(texts_dir, filename)
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        escaped = json.dumps(content)
        window.evaluate_js(f'showHelp({json.dumps(title)}, {escaped})')
    except Exception as e:
        window.evaluate_js(f'alert("Ошибка загрузки справки: {str(e)}")')


def show_about():
    """О программе"""
    _load_help_text("О программе", "about.txt")



def show_shortcuts():
    """Горячие клавиши"""
    _load_help_text("Горячие клавиши", "shortcuts.txt")



def show_md_syntax():
    """Markdown-синтаксис"""
    _load_help_text("MD синтаксис", "md_syntax.txt")




def show_export_help():
    """Подсказка по экспорту HTML"""
    _load_help_text("Экспорт HTML", "export_help.txt")



def show_export_settings_dialog():
    """Открыть диалог настроек (загрузить конфиг и передать в JS)"""
    window = webview.active_window()
    config = load_config()
    export_cfg = config.get('export', {
        'mode': 'full',
        'theme': 'current',
        'save_path': ''
    })
    save_cfg = config.get('save', {
        'default_path': ''
    })
    font_size = config.get('fontSize', 15)
    # Если путь не задан — используем Downloads
    if not export_cfg.get('save_path'):
        export_cfg['save_path'] = get_downloads_folder()
    if not save_cfg.get('default_path'):
        save_cfg['default_path'] = get_downloads_folder()
    
    export_json = json.dumps(export_cfg)
    save_json = json.dumps(save_cfg)
    window.evaluate_js(
        'openSettingsDialog(' + export_json + ', ' + save_json + ', ' + str(font_size) + ')'
    )



