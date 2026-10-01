"""Экспорт текущего документа в автономный HTML-файл."""
import json
import os
from datetime import datetime

import webview

from . import config
from .paths import BUILD_DIR, CSS_DIR, LIB_DIR, MERMAID_THEMES
from .state import alert, call_js, state

MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js'
CHART_CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js'
FILE_TYPES = ('HTML files (*.html)', 'All files (*.*)')


def export_with_saved_settings():
    settings = config.export_settings()
    export_html(settings['mode'], settings['theme'], settings['save_path'])


def export_html(mode='full', theme='current', save_path=''):
    """mode: 'full' — библиотеки встроены (работает офлайн), 'minimal' — с CDN.
    theme: 'dark' | 'light' | 'current'. save_path: папка; пусто — спросить диалогом."""
    if state.html_mode:
        alert('Экспорт недоступен: HTML-файл открыт в режиме только для чтения')
        return
    if theme == 'current':
        theme = call_js('getCurrentTheme') or 'dark'
    body_html = call_js('getRenderedBodyHTMLExport')
    try:
        html = build_html(body_html, theme, mode)
    except FileNotFoundError as e:
        alert(f'Ошибка экспорта: не найден файл {e.filename}')
        return

    path = _choose_target_path(save_path)
    if not path:
        return
    try:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(html)
    except OSError as e:
        alert(f'Ошибка сохранения: {e}')


def _choose_target_path(save_dir):
    if save_dir and os.path.isdir(save_dir):
        name = 'document-' + datetime.now().strftime('%Y%m%d-%H%M%S') + '.html'
        return os.path.join(save_dir, name)
    result = state.window.create_file_dialog(
        webview.FileDialog.SAVE, save_filename='document.html', file_types=FILE_TYPES
    )
    return result[0] if result else None


def build_html(body_html, theme, mode):
    has_mermaid = 'class="mermaid"' in body_html
    has_charts = 'data-chart-code="' in body_html
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
    if has_mermaid:
        parts.append(_library_script('mermaid.min.js', MERMAID_CDN, mode))
    if has_charts:
        parts.append(_library_script('chart.umd.min.js', CHART_CDN, mode))
    parts += ['</head>', '<body>', f'<div id="preview">{body_html}</div>']

    if has_mermaid:
        with open(MERMAID_THEMES, 'r', encoding='utf-8') as f:
            mermaid_config = json.dumps(json.load(f)[theme])
        parts.append(
            f'<script>mermaid.initialize({mermaid_config});'
            'mermaid.run({querySelector:".mermaid"});</script>'
        )
    if has_charts:
        parts.append(_inline_script(_read(BUILD_DIR / 'export-charts.js')))

    parts += ['</body>', '</html>']
    return '\n'.join(parts)


def _library_script(filename, cdn_url, mode):
    if mode == 'minimal':
        return f'<script src="{cdn_url}"></script>'
    return _inline_script(_read(LIB_DIR / filename))


def _inline_script(code):
    # «</script» внутри кода закрыл бы тег раньше времени
    return '<script>' + code.replace('</script', '<\\/script') + '</script>'


def _read(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()
