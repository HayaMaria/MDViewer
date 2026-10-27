"""Экспорт текущего документа в автономный HTML-файл."""
import json
import os
import threading
from datetime import datetime

import webview

from . import config, durable
from .paths import BUILD_DIR, CSS_DIR, LIB_DIR
from .state import alert, call_js, state

FILE_TYPES = ('HTML files (*.html)', 'All files (*.*)')


def export_with_saved_settings():
    settings = config.export_settings()
    export_html(settings['theme'], settings['save_path'])


def export_html(theme='current', save_path=''):
    """theme: 'dark' | 'light' | 'current'. save_path: папка; пусто — спросить диалогом."""
    if state.html_mode:
        alert('Экспорт недоступен: HTML-файл открыт в режиме только для чтения')
        return
    if theme == 'current':
        theme = call_js('getCurrentTheme') or 'dark'
    if theme not in ('dark', 'light'):
        theme = 'dark'
    body_html = _await_js('prepareExportBody', theme)
    if not isinstance(body_html, str):
        alert('Ошибка экспорта: не удалось подготовить схемы')
        return
    try:
        html = build_html(body_html, theme, config.column_width())
    except FileNotFoundError as e:
        alert(f'Ошибка экспорта: не найден файл {e.filename}')
        return

    path = _choose_target_path(save_path)
    if not path:
        return
    try:
        durable.write_text(path, html, backup=False, newline=None)
    except OSError as e:
        alert(f'Ошибка сохранения: {e}')


def _await_js(function, *args, timeout=120):
    """Дождаться Promise из JS. evaluate_js сам по себе Promise не ждёт."""
    params = ', '.join(json.dumps(arg, ensure_ascii=False) for arg in args)
    done = threading.Event()
    box = {}

    def finish(value):
        box['value'] = value
        done.set()

    state.window.evaluate_js(f'{function}({params})', finish)
    if not done.wait(timeout):
        return None
    return box.get('value')


def _choose_target_path(save_dir):
    if save_dir and os.path.isdir(save_dir):
        name = 'document-' + datetime.now().strftime('%Y%m%d-%H%M%S') + '.html'
        return os.path.join(save_dir, name)
    result = state.window.create_file_dialog(
        webview.FileDialog.SAVE, save_filename='document.html', file_types=FILE_TYPES
    )
    return result[0] if result else None


def build_html(body_html, theme, column='reading'):
    has_charts = 'data-chart-code="' in body_html
    if column not in ('reading', 'wide', 'full'):
        column = 'reading'
    styles = _read(CSS_DIR / 'preview.css') + _read(CSS_DIR / 'export.css')

    parts = [
        '<!DOCTYPE html>',
        f'<html lang="ru" data-theme="{theme}">',
        '<head>',
        '<meta charset="UTF-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
        f'<meta name="color-scheme" content="{theme}">',
        '<title>MD Viewer — Export</title>',
        f'<style>{styles}</style>',
    ]
    if has_charts:
        parts.append(_inline_script(_read(LIB_DIR / 'chart.umd.min.js')))
    parts += [
        '</head>', '<body>',
        f'<div id="preview" data-column="{column}"><div class="mdv-column">{body_html}</div></div>',
    ]
    if has_charts:
        parts.append(_inline_script(_read(BUILD_DIR / 'export-charts.js')))
    parts += ['</body>', '</html>']
    return '\n'.join(parts)


def _inline_script(code):
    # «</script» внутри кода закрыл бы тег раньше времени
    return '<script>' + code.replace('</script', '<\\/script') + '</script>'


def _read(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()
