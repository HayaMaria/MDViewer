"""Файловые операции: новый документ, открытие .md/.html, сохранение."""
import os

import webview

from . import APP_TITLE, UNTITLED, config
from .htmlfile import inject_fit_width_style, prepare_html_for_preview, read_html_text
from .state import alert, call_js, state

HTML_EXTS = ('.html', '.htm')
# «All files» первым — по умолчанию видны все файлы (.md/.html не серые);
# конкретные фильтры доступны в выпадающем списке «Тип файлов»
OPEN_FILE_TYPES = ('All files (*.*)', 'Markdown files (*.md)', 'HTML files (*.html;*.htm)')
SAVE_FILE_TYPES = ('Markdown files (*.md)', 'All files (*.*)')
READ_ONLY_MESSAGE = 'HTML-файл открыт в режиме только для чтения — сохранение недоступно'


def _show_document_name(name):
    state.window.title = f'{APP_TITLE} — {name}'
    call_js('setFileName', name)


def _load_markdown(text, path):
    call_js('exitHtmlMode')
    state.html_mode = False
    call_js('setEditorContent', text)
    state.current_file = path
    _show_document_name(os.path.basename(path) if path else UNTITLED)
    call_js('markSaved')


def new_document():
    _load_markdown('', None)


def open_path(path):
    """Открыть файл по пути: .html/.htm — превью только для чтения, остальное — Markdown."""
    if os.path.splitext(path)[1].lower() in HTML_EXTS:
        _open_html(path)
        return
    try:
        with open(path, 'r', encoding='utf-8') as f:
            text = f.read()
    except (OSError, UnicodeDecodeError) as e:
        alert(f'Ошибка открытия файла: {e}')
        return
    _load_markdown(text, path)


def _open_html(path):
    try:
        html = prepare_html_for_preview(path, read_html_text(path))
    except OSError as e:
        alert(f'Ошибка открытия HTML-файла: {e}')
        return
    name = os.path.basename(path)
    call_js('loadHtmlPreview', inject_fit_width_style(html), name)
    # current_file = None защищает HTML-файл от перезаписи через Ctrl+S
    state.current_file = None
    state.html_mode = True
    _show_document_name(name)


def open_file_dialog():
    result = state.window.create_file_dialog(webview.FileDialog.OPEN, file_types=OPEN_FILE_TYPES)
    if result:
        open_path(result[0])


def save():
    if state.html_mode:
        alert(READ_ONLY_MESSAGE)
        return
    if state.current_file:
        _write_editor_content(state.current_file)
    else:
        save_as(config.md_save_dir())


def save_as(initial_dir=''):
    if state.html_mode:
        alert(READ_ONLY_MESSAGE)
        return
    result = state.window.create_file_dialog(
        webview.FileDialog.SAVE,
        directory=initial_dir,
        save_filename=f'{UNTITLED}.md',
        file_types=SAVE_FILE_TYPES,
    )
    if result and _write_editor_content(result[0]):
        state.current_file = result[0]
        _show_document_name(os.path.basename(result[0]))


def _write_editor_content(path):
    content = call_js('getEditorContent')
    try:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
    except OSError as e:
        alert(f'Ошибка сохранения: {e}')
        return False
    call_js('markSaved')
    return True
