import os
import webview
from config import load_config

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

def export_html_full():
    """Экспорт HTML (полный) — библиотеки встроены, работает без интернета"""
    window = webview.active_window()
    body_html = window.evaluate_js('getRenderedBodyHTMLExport()')
    styles = window.evaluate_js('getEditorStyles()')

    has_mermaid = 'class="mermaid"' in body_html
    has_charts = 'data-chart-code="' in body_html

    export_styles = (
        styles +
        'blockquote{border-left:4px solid #4c9aff;padding-left:16px;margin:12px 0;color:#999;}'
        'table{border-collapse:collapse;margin:12px 0;width:100%;}'
        'th,td{border:1px solid #444;padding:8px 12px;text-align:left;}'
        'th{font-weight:bold;}'
    )

    parts = [
        '<!DOCTYPE html>',
        '<html lang="ru">',
        '<head>',
        '<meta charset="UTF-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
        '<title>MD Viewer — Export</title>',
        f'<style>{export_styles}</style>',
    ]

    lib_dir = os.path.join(os.path.dirname(__file__), 'assets', 'lib')

    try:
        if has_mermaid:
            with open(os.path.join(lib_dir, 'mermaid.min.js'), 'r', encoding='utf-8') as f:
                parts.append(f'<script>{f.read()}</script>')
        if has_charts:
            with open(os.path.join(lib_dir, 'chart.umd.min.js'), 'r', encoding='utf-8') as f:
                parts.append(f'<script>{f.read()}</script>')
    except FileNotFoundError:
        window.evaluate_js('alert("Ошибка: файлы библиотек не найдены в assets/lib/")')
        return

    parts.append('</head>')
    parts.append(f'<body style="background:{body_bg};color:{body_fg};margin:0;">')
    parts.append(f'<div id="preview" style="padding:24px 32px;line-height:1.6;">{body_html}</div>')

    # Инициализация mermaid/chart — в конце <body> (DOM уже готов)
    if has_mermaid or has_charts:
        try:
            if has_charts:
                with open(os.path.join(lib_dir, 'render.js'), 'r', encoding='utf-8') as f:
                    render_js = f.read()
                    parts.append(f'<script>document.addEventListener("DOMContentLoaded",function(){{{render_js}}});</script>')
            elif has_mermaid:
                parts.append(f'<script>document.addEventListener("DOMContentLoaded",function(){{mermaid.initialize({MERMAID_INIT_ARGS_LIGHT});mermaid.run({{querySelector:".mermaid"}});}});</script>')
        except FileNotFoundError:
            window.evaluate_js('alert("Ошибка: файл render.js не найден в assets/lib/")')
            return

    parts.append('</body>')
    parts.append('</html>')

    html = '\n'.join(parts)

    result = window.create_file_dialog(
        webview.FileDialog.SAVE,
        save_filename='document.html',
        file_types=['HTML files (*.html)', 'All files (*.*)']
    )
    if result:
        filepath = result[0]
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(html)
        except Exception as e:
            window.evaluate_js(f'alert("Ошибка экспорта: {str(e)}")')


def export_html_minimal():
    """Экспорт HTML (минимальный) — библиотеки с CDN, лёгкий файл, нужен интернет"""
    window = webview.active_window()
    body_html = window.evaluate_js('getRenderedBodyHTMLExport()')
    styles = window.evaluate_js('getEditorStyles()')

    has_mermaid = 'class="mermaid"' in body_html
    has_charts = 'data-chart-code="' in body_html

    export_styles = (
        styles +
        'blockquote{border-left:4px solid #4c9aff;padding-left:16px;margin:12px 0;color:#999;}'
        'table{border-collapse:collapse;margin:12px 0;width:100%;}'
        'th,td{border:1px solid #444;padding:8px 12px;text-align:left;}'
        'th{font-weight:bold;}'
    )

    parts = [
        '<!DOCTYPE html>',
        '<html lang="ru">',
        '<head>',
        '<meta charset="UTF-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
        '<title>MD Viewer — Export</title>',
        f'<style>{export_styles}</style>',
    ]

    lib_dir = os.path.join(os.path.dirname(__file__), 'assets', 'lib')

    if has_mermaid or has_charts:
        try:
            if has_mermaid:
                parts.append('<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>')
            if has_charts:
                parts.append('<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>')
                with open(os.path.join(lib_dir, 'render.js'), 'r', encoding='utf-8') as f:
                    parts.append(f'<script>{f.read()}</script>')
        except FileNotFoundError:
            window.evaluate_js('alert("Ошибка: файл render.js не найден в assets/lib/")')
            return

    parts.append('</head>')
    parts.append('<body>')
    parts.append(f'<div id="preview" style="padding:24px 32px;line-height:1.6;">{body_html}</div>')

    # Если есть mermaid, но нет chart — простая инициализация
    if has_mermaid and not has_charts:
        parts.append(f'<script>mermaid.initialize({MERMAID_INIT_ARGS_LIGHT});mermaid.run({{querySelector:".mermaid"}});</script>')

    parts.append('</body>')
    parts.append('</html>')

    html = '\n'.join(parts)

    result = window.create_file_dialog(
        webview.FileDialog.SAVE,
        save_filename='document.html',
        file_types=['HTML files (*.html)', 'All files (*.*)']
    )
    if result:
        filepath = result[0]
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(html)
        except Exception as e:
            window.evaluate_js(f'alert("Ошибка экспорта: {str(e)}")')


def export_html_default():
    """Экспорт HTML по умолчанию — использует сохранённые настройки"""
    config = load_config()
    export_cfg = config.get('export', {})
    mode = export_cfg.get('mode', 'full')
    theme = export_cfg.get('theme', 'current')
    save_path = export_cfg.get('save_path', '')
    
    if mode == 'full':
        export_html(save_path=save_path, export_theme=theme, mode='full')
    else:
        export_html(save_path=save_path, export_theme=theme, mode='minimal')


def export_html_custom(mode, theme, save_path):
    """Экспорт HTML с указанными параметрами (из диалога 'Экспортировать HTML как…')"""
    export_html(save_path=save_path, export_theme=theme, mode=mode)


# ===== Меню — используется кастомный HTML-тулбар с иконками =====
def export_html(save_path='', export_theme='current', mode='full'):
    """Экспорт HTML — единая функция с поддержкой темы и пути сохранения"""
    window = webview.active_window()
    body_html = window.evaluate_js('getRenderedBodyHTMLExport()')
    styles = window.evaluate_js('getEditorStyles()')

    has_mermaid = 'class="mermaid"' in body_html
    has_charts = 'data-chart-code="' in body_html

    export_styles = (
        styles +
        'blockquote{border-left:4px solid #4c9aff;padding-left:16px;margin:12px 0;color:#999;}'
        'table{border-collapse:collapse;margin:12px 0;width:100%;}'
        'th,td{border:1px solid #444;padding:8px 12px;text-align:left;}'
        'th{font-weight:bold;}'
    )

    # Определяем тему — всегда передаётся конкретное значение из JS (dark/light/current)
    # Если тема 'current', берём из текущего документа, иначе используем переданную
    theme_attr = export_theme
    if theme_attr == 'current':
        try:
            theme_attr = window.evaluate_js('getCurrentTheme()') or 'dark'
        except:
            theme_attr = 'dark'

    # Цвета для явного указания в body (если CSS-переменные не сработают)
    if theme_attr == 'dark':
        body_bg = '#1e1e1e'
        body_fg = '#d4d4d4'
    else:
        body_bg = '#ffffff'
        body_fg = '#1e1e1e'

    parts = [
        '<!DOCTYPE html>',
        f'<html lang="ru" data-theme="{theme_attr}">',
        '<head>',
        '<meta charset="UTF-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
        '<title>MD Viewer — Export</title>',
    ]
    
    # Явно указываем color-scheme для браузера
    if theme_attr == 'dark':
        parts.append('<meta name="color-scheme" content="dark">')
    elif theme_attr == 'light':
        parts.append('<meta name="color-scheme" content="light">')
    
    parts.append(f'<style>{export_styles}</style>')

    lib_dir = os.path.join(os.path.dirname(__file__), 'assets', 'lib')

    if mode == 'full':
        # Полный экспорт — библиотеки встроены
        try:
            if has_mermaid:
                with open(os.path.join(lib_dir, 'mermaid.min.js'), 'r', encoding='utf-8') as f:
                    parts.append(f'<script>{f.read()}</script>')
            if has_charts:
                with open(os.path.join(lib_dir, 'chart.umd.min.js'), 'r', encoding='utf-8') as f:
                    parts.append(f'<script>{f.read()}</script>')
        except FileNotFoundError:
            window.evaluate_js('alert("Ошибка: файлы библиотек не найдены в assets/lib/")')
            return
    else:
        # Минимальный экспорт — библиотеки с CDN
        if has_mermaid or has_charts:
            try:
                if has_mermaid:
                    parts.append('<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>')
                if has_charts:
                    parts.append('<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>')
                    with open(os.path.join(lib_dir, 'render.js'), 'r', encoding='utf-8') as f:
                        parts.append(f'<script>{f.read()}</script>')
            except FileNotFoundError:
                window.evaluate_js('alert("Ошибка: файл render.js не найден в assets/lib/")')
                return

    parts.append('</head>')
    parts.append('<body>')
    parts.append(f'<div id="preview" style="padding:24px 32px;line-height:1.6;">{body_html}</div>')

    # Инициализация mermaid/chart после загрузки DOM
    mermaid_args = MERMAID_INIT_ARGS_DARK if theme_attr == 'dark' else MERMAID_INIT_ARGS_LIGHT
    if has_mermaid or has_charts:
        try:
            if has_charts:
                with open(os.path.join(lib_dir, 'render.js'), 'r', encoding='utf-8') as f:
                    render_js = f.read()
                    parts.append(f'<script>document.addEventListener("DOMContentLoaded",function(){{{render_js}}});</script>')
            elif has_mermaid:
                parts.append(f'<script>document.addEventListener("DOMContentLoaded",function(){{mermaid.initialize({mermaid_args});mermaid.run({{querySelector:".mermaid"}});}});</script>')
        except FileNotFoundError:
            window.evaluate_js('alert("Ошибка: файл render.js не найден в assets/lib/")')
            return

    parts.append('</body>')
    parts.append('</html>')

    html = '\n'.join(parts)

    # Сохранение
    if save_path and os.path.isdir(save_path):
        # Сохраняем в указанную папку со стандартным именем
        from datetime import datetime
        default_name = 'document-' + datetime.now().strftime('%Y%m%d-%H%M%S') + '.html'
        filepath = os.path.join(save_path, default_name)
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(html)
            # Успешно сохранено — ничего не делаем, пользователь видит файл в папке
        except Exception as e:
            window.evaluate_js(f'alert("Ошибка сохранения: {str(e)}")')
    else:
        # Показываем диалог сохранения
        result = window.create_file_dialog(
            webview.FileDialog.SAVE,
            save_filename='document.html',
            file_types=['HTML files (*.html)', 'All files (*.*)']
        )
        if result:
            filepath = result[0]
            try:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(html)
            except Exception as e:
                window.evaluate_js(f'alert("Ошибка сохранения: {str(e)}")')

