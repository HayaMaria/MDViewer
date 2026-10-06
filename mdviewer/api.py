"""Методы, доступные из JS как window.pywebview.api.*"""
import threading
import webbrowser

import webview

from . import autosave, config, documents, export, session
from .state import state
from .win.titlebar import set_titlebar_theme


class Api:
    # ===== Настройки =====

    def get_settings(self):
        return config.ui_settings()

    def save_settings(self, settings):
        config.save_ui_settings(settings)
        saved = config.autosave_settings()
        autosave.configure(saved['enabled'], saved['interval'])

    def configure_autosave(self, enabled, interval):
        autosave.configure(enabled, interval)

    def arm_autosave(self):
        autosave.arm()

    def disarm_autosave(self):
        autosave.disarm()

    def set_theme(self, theme):
        config.set_value('theme', theme)

    def set_splitter_pos(self, percent):
        config.set_value('splitterPos', percent)

    def set_sync_scroll(self, enabled):
        config.set_value('syncScroll', bool(enabled))

    def pick_folder(self):
        result = state.window.create_file_dialog(webview.FileDialog.FOLDER)
        return result[0] if result else ''

    # ===== Документ =====

    def open_startup_file(self):
        """Открыть файл, переданный Проводником. False — файла нет.
        Чтение идёт в фоне, чтобы сразу вернуть управление JS."""
        path, state.startup_file = state.startup_file, None
        if not path:
            return False
        threading.Thread(target=documents.open_path, args=(path,), daemon=True).start()
        return True

    def restore_last_session(self):
        """Открыть документ прошлого запуска. False — сессии нет."""
        data = session.load_session()
        if not session.is_restorable(data):
            documents.note_missing_session_file(data)
            return False
        threading.Thread(target=documents.restore_session, args=(data,), daemon=True).start()
        return True

    def show_welcome(self):
        documents.show_welcome()

    def save_session(self, snapshot):
        documents.remember_session(snapshot, from_js=True)

    def new_document(self):
        documents.new_document()

    def open_document(self):
        documents.open_file_dialog()

    def save_document(self):
        documents.save()

    def save_document_as(self):
        documents.save_as()

    def autosave_document(self):
        return documents.autosave()

    def quit(self):
        state.window.destroy()

    # ===== Экспорт =====

    def export_html_default(self):
        export.export_with_saved_settings()

    def export_html(self, mode, theme, save_path):
        export.export_html(mode, theme, save_path)

    # ===== Окно и ссылки =====

    def apply_titlebar_theme(self, dark):
        set_titlebar_theme(state.window, dark)

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
