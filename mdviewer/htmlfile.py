"""Поддержка открытия HTML-файлов в режиме только чтения.

Чтение HTML с подбором кодировки и подготовка к показу в изолированном
iframe: локальные относительные ресурсы (картинки, css, js) заменяются
на data URI, поскольку WebView2 блокирует загрузку file:// с http-страницы,
а встроенный HTTP-сервер pywebview раздаёт только папку assets.
"""
import os
import re
import base64
import urllib.parse

# MIME-типы для инлайн-подстановки локальных ресурсов
MIME_TYPES = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
    '.avif': 'image/avif',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
}

# Ограничения инлайн-подстановки (чтобы не раздуть строку для evaluate_js)
MAX_RESOURCE_BYTES = 4 * 1024 * 1024  # не инлайним ресурсы больше 4 МБ
MAX_INLINED_RESOURCES = 64            # максимум ресурсов на один файл

# src="..." / href="..." с одинарными или двойными кавычками
_ATTR_RE = re.compile(r'\b(src|href)\s*=\s*([\'"])([^\'"]+)\2', re.IGNORECASE)


def read_html_text(path):
    """Прочитать HTML-файл, подобрав кодировку: utf-8-sig → cp1251 → замена ошибок."""
    with open(path, 'rb') as f:
        raw = f.read()
    for encoding in ('utf-8-sig', 'cp1251'):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode('utf-8', errors='replace')


def _is_local_relative(url):
    """True только для относительных путей по файловой системе (не URL)."""
    url = url.strip()
    if not url or url.startswith('#'):
        return False
    lower = url.lower()
    if lower.startswith(('http://', 'https://', 'data:', 'file:', 'blob:',
                         'mailto:', 'javascript:', 'tel:', '//')):
        return False
    if url.startswith('/'):
        # Корневой путь — нельзя осмысленно сопоставить с диском
        return False
    return True


def _to_data_uri(file_path):
    """Прочитать файл и вернуть data URI или None, если ресурс не встраивается."""
    ext = os.path.splitext(file_path)[1].lower()
    mime = MIME_TYPES.get(ext)
    if not mime:
        return None
    if os.path.getsize(file_path) > MAX_RESOURCE_BYTES:
        return None
    with open(file_path, 'rb') as f:
        data = f.read()
    return 'data:' + mime + ';base64,' + base64.b64encode(data).decode('ascii')


# CSS, который подмешивается в HTML-файл перед показом во iframe:
# убирает горизонтальный скролл — контент растягивается/обрезается по ширине панели
_FIT_WIDTH_STYLE = (
    '<style data-mdv-fit>html,body{overflow-x:hidden !important;max-width:100% !important}'
    'img,video,table,pre{max-width:100% !important}</style>'
)

_HEAD_OPEN_RE = re.compile(r'(<head\b[^>]*>)', re.IGNORECASE)


def inject_fit_width_style(html):
    """Вставить CSS «вписать по ширине» в <head> (или в начало, если head нет)."""
    if _HEAD_OPEN_RE.search(html):
        return _HEAD_OPEN_RE.sub(lambda m: m.group(1) + _FIT_WIDTH_STYLE, html, count=1)
    head_idx = html.lower().find('<html')
    if head_idx != -1:
        close_idx = html.find('>', head_idx)
        return html[:close_idx + 1] + _FIT_WIDTH_STYLE + html[close_idx + 1:]
    return _FIT_WIDTH_STYLE + html


def prepare_html_for_preview(html_path, raw_html):
    """Заменить локальные относительные src/href на data URI (best-effort).

    Ресурсы ищутся относительно папки HTML-файла. Всё, что не удаётся
    встроить (внешние URL, неизвестные типы, слишком большие файлы),
    остаётся как есть.
    """
    base_dir = os.path.dirname(os.path.abspath(html_path))
    inlined = 0

    def _repl(match):
        nonlocal inlined
        if inlined >= MAX_INLINED_RESOURCES:
            return match.group(0)
        attr, quote, url = match.group(1), match.group(2), match.group(3)
        if not _is_local_relative(url):
            return match.group(0)
        try:
            # Срезаем query/fragment — на диске их нет
            clean = urllib.parse.unquote(url.split('#')[0].split('?')[0])
            file_path = os.path.normpath(os.path.join(base_dir, clean))
            if not os.path.isfile(file_path):
                return match.group(0)
            data_uri = _to_data_uri(file_path)
            if data_uri is None:
                return match.group(0)
            inlined += 1
            return attr + '=' + quote + data_uri + quote
        except Exception:
            return match.group(0)

    return _ATTR_RE.sub(_repl, raw_html)