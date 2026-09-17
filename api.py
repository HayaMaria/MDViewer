import webview,webbrowser,threading,markdown,json
from config import load_config,load_export_config,save_export_config
from menu import new_document,open_file,save_file,save_file_as
from menu import exit_app,change_theme,show_about,show_shortcuts
from menu import show_md_syntax,show_export_help,show_export_settings_dialog
from export import export_html_full,export_html_minimal,export_html_default,export_html_custom

class Api:
    def __init__(self):
        self.current_file = None

    def get_theme(self):
        """Вернуть сохранённую тему ('dark' или 'light')"""
        config = load_config()
        return config.get('theme', 'dark')

    def open_external(self, url):
        webbrowser.open(url)

    def open_in_app_window(self, url):
        threading.Thread(target=self._create_browser_window, args=(url,), daemon=True).start()

    def _create_browser_window(self, url):
        webview.create_window(
            title='MD Viewer — Внешняя страница',
            url=url,
            width=900,
            height=700,
            resizable=True,
        )

    def get_editor_content(self):
        pass

    def set_editor_content(self, text):
        pass

    def open_file(self):
        pass

    def save_file(self, content, file_path=None):
        pass

    def convert_md_to_html(self, md_text):
        return markdown.markdown(md_text, extensions=['fenced_code', 'codehilite'])

    # ===== Обработчики горячих клавиш (вызываются из JS-биндингов CodeMirror) =====

    def new_document_shortcut(self):
        """Ctrl+N — новый документ"""
        new_document()

    def open_file_shortcut(self):
        """Ctrl+O — открыть файл"""
        open_file()

    def save_file_shortcut(self):
        """Ctrl+S — сохранить"""
        save_file()

    def save_file_as_shortcut(self):
        """Ctrl+Shift+S — сохранить как"""
        save_file_as()

    # ===== API-методы для вызова из HTML-тулбара =====

    def new_file(self):
        """Новый документ (вызов из тулбара)"""
        new_document()

    def open_file_dialog(self):
        """Открыть файл (вызов из тулбара)"""
        open_file()

    def save_current_file(self):
        """Сохранить (вызов из тулбара)"""
        save_file()

    def save_current_file_as(self):
        """Сохранить как (вызов из тулбара)"""
        save_file_as()

    def export_full(self):
        """Экспорт HTML полный"""
        export_html_full()

    def export_minimal(self):
        """Экспорт HTML минимальный"""
        export_html_minimal()

    def quit_app(self):
        """Выход из приложения"""
        exit_app()

    def toggle_theme(self):
        """Смена темы с сохранением в конфиг"""
        change_theme()

    def about_program(self):
        """О программе"""
        show_about()

    def show_shortcuts_help(self):
        """Горячие клавиши"""
        show_shortcuts()

    def show_md_syntax_help(self):
        """MD синтаксис"""
        show_md_syntax()

    def show_export_help_info(self):
        """Справка по экспорту"""
        show_export_help()

    def show_export_settings(self):
        """Настройки"""
        show_export_settings_dialog()

    def export_html_default_action(self):
        """Экспорт HTML по умолчанию"""
        export_html_default()

    def export_html_as(self, mode, theme, save_path):
        """Экспорт HTML как..."""
        export_html_custom(mode, theme, save_path)

    def get_export_settings(self):
        """Получить настройки экспорта (для JS)"""
        return json.dumps(load_export_config())

    def save_export_settings(self, data_json):
        """Сохранить настройки экспорта (из JS)"""
        import json
        data = json.loads(data_json)
        save_export_config(
            mode=data.get('mode', 'full'),
            theme=data.get('theme', 'current'),
            save_path=data.get('save_path', ''),
            md_path=data.get('md_path', None),
        )

    def pick_folder(self):
        """Открыть диалог выбора папки"""
        window = webview.active_window()
        result = window.create_file_dialog(webview.FileDialog.FOLDER)
        if result:
            return result[0]
        return ''

