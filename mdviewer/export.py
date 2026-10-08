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
# Те же версии, что лежат в assets/lib
GRAPHRE_CDN = 'https://cdn.jsdelivr.net/npm/graphre@0.1.2/dist/graphre.js'
NOMNOML_CDN = 'https://cdn.jsdelivr.net/npm/nomnoml@1.5.1/dist/nomnoml.js'
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
        html = build_html(body_html, theme, mode, config.column_width())
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


def build_html(body_html, theme, mode, column='reading'):
    has_mermaid = 'class="mermaid"' in body_html
    has_charts = 'data-chart-code="' in body_html
    has_nomnoml = 'data-nomnoml-code="' in body_html
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
    if has_mermaid:
        parts.append(_library_script('mermaid.min.js', MERMAID_CDN, mode))
    if has_charts:
        parts.append(_library_script('chart.umd.min.js', CHART_CDN, mode))
    if has_nomnoml:
        parts.append(_library_script('graphre.js', GRAPHRE_CDN, mode))
        parts.append(_library_script('nomnoml.min.js', NOMNOML_CDN, mode))
    parts += [
        '</head>', '<body>',
        f'<div id="preview" data-column="{column}"><div class="mdv-column">{body_html}</div></div>',
    ]

    if has_mermaid:
        with open(MERMAID_THEMES, 'r', encoding='utf-8') as f:
            mermaid_config = json.dumps(json.load(f)[theme])
        parts.append(
            f'<script>mermaid.initialize({mermaid_config});'
            'mermaid.run({querySelector:".mermaid"}).then(function(){'
            'document.querySelectorAll(".mermaid").forEach(function(box){'
            'var svg=box.querySelector("svg");if(!svg)return;'
            'var w=parseInt(box.getAttribute("data-mdv-width"),10)||box.clientWidth;if(!w)return;'
            'var vb=(svg.getAttribute("viewBox")||"").trim().split(/[\\s,]+/);'
            'var nw=parseFloat(vb[2])||0,nh=parseFloat(vb[3])||0;'
            'var BASE=600;'
            'var draw=nw?Math.max(1,Math.round(nw*w/BASE)):w;'
            'svg.setAttribute("width",draw);'
            'if(nw&&nh)svg.setAttribute("height",Math.max(1,Math.round(nh*w/BASE)));'
            'svg.style.width=draw+"px";svg.style.maxWidth="none";svg.style.height="auto";'
            'box.style.width=draw+"px";box.style.maxWidth="none";'
            '});});</script>'
        )
    if has_charts:
        parts.append(_inline_script(_read(BUILD_DIR / 'export-charts.js')))
    if has_nomnoml:
        parts.append(_nomnoml_boot(theme))

    parts += ['</body>', '</html>']
    return '\n'.join(parts)


def _nomnoml_boot(theme):
    """Отрисовать блоки nomnoml и подогнать SVG под ширину, как в превью."""
    stroke = '#d4d4d4' if theme == 'dark' else '#333333'
    line = '#aaaaaa' if theme == 'dark' else '#555555'
    code = (
        'document.querySelectorAll(".nomnoml-diagram").forEach(function(box){'
        'var code=decodeURIComponent(box.getAttribute("data-nomnoml-code")||"");'
        'if(!code||typeof nomnoml==="undefined")return;'
        f'var styled="#fill: transparent\\n#stroke: {stroke}\\n#lineColor: {line}\\n"+code;'
        'try{box.innerHTML=nomnoml.renderSvg(styled, document);}catch(e){'
        'box.textContent=e&&e.message?e.message:String(e);return;}'
        'var svg=box.querySelector("svg");if(!svg)return;'
        'var w=parseInt(box.getAttribute("data-mdv-width"),10)||box.clientWidth;if(!w)return;'
        'var vb=(svg.getAttribute("viewBox")||"").trim().split(/[\\s,]+/);'
        'var nw=parseFloat(vb[2])||0,nh=parseFloat(vb[3])||0;'
        'var zoom=w/600;'
        'var draw=nw?Math.max(1,Math.round(nw*zoom)):w;'
        'svg.setAttribute("width",String(draw));'
        'if(nw&&nh)svg.setAttribute("height",String(Math.max(1,Math.round(nh*zoom))));'
        'svg.style.width=draw+"px";svg.style.maxWidth="none";svg.style.height="auto";'
        'box.style.width=draw+"px";box.style.maxWidth="none";'
        '});'
    )
    return _inline_script(code)


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
