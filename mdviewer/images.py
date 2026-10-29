"""Чтение локальных картинок и скачивание адресов для превью и экспорта.

Превью и встраивание получают data URI. Приложение файл никуда не копирует.
Относительный путь не ищем: в тексте лежит полный путь с обычными слэшами.
"""
import html
import os
import re
import threading
import urllib.error
import urllib.parse
import urllib.request

MAX_IMAGE_BYTES = 25 * 1024 * 1024
DOWNLOAD_TIMEOUT = 20
MAX_REDIRECTS = 5

_EXT_MIME = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
}
_MIME_ALIASES = {
    'image/jpeg': {'jpeg', 'jpg', 'pjpeg'},
    'image/png': {'png'},
    'image/gif': {'gif'},
    'image/webp': {'webp'},
    'image/bmp': {'bmp'},
    'image/svg+xml': {'svg+xml', 'svg'},
}

_cache_lock = threading.Lock()
# path -> (mtime_ns, size, data_uri)
_preview_cache = {}
# исходный адрес -> (прямой адрес, data_uri уже скачанных байт)
_resolve_cache = {}


def _local_stamp(path):
    try:
        stat = os.stat(path)
    except OSError:
        return None
    return stat.st_mtime_ns, stat.st_size


def _cached_local_uri(path, stamp):
    with _cache_lock:
        cached = _preview_cache.get(path)
    if cached and cached[0] == stamp[0] and cached[1] == stamp[1]:
        return cached[2]
    return None


def _store_local(path, stamp, uri):
    with _cache_lock:
        _preview_cache[path] = (stamp[0], stamp[1], uri)


def _cached_remote(href):
    with _cache_lock:
        cached = _resolve_cache.get(href)
    if not cached or not cached[1]:
        return None
    return cached


def _store_remote(href, loaded):
    """Запомнить байты, чтобы превью и экспорт не качали тот же адрес снова."""
    kind, data, final = loaded
    uri = _data_uri(kind, data)
    with _cache_lock:
        _resolve_cache[href] = (final, uri)
        if final and final != href:
            _resolve_cache[final] = (final, uri)
    return uri


def preview_image(href, known_mtime=''):
    """Картинка для превью. Большую строку не шлём повторно, пока файл не изменился."""
    path = local_path(href)
    if not path or not os.path.isfile(path):
        return {'ok': False}
    stamp = _local_stamp(path)
    if stamp is None:
        return {'ok': False}
    stamp_text = str(stamp[0])
    uri = _cached_local_uri(path, stamp)
    if uri is not None:
        if str(known_mtime or '') == stamp_text:
            return {'ok': True, 'unchanged': True, 'mtime': stamp_text}
        return {'ok': True, 'unchanged': False, 'mtime': stamp_text, 'uri': uri}
    loaded = _read_file(path)
    if loaded is None:
        return {'ok': False}
    uri = _data_uri(loaded[0], loaded[1])
    _store_local(path, stamp, uri)
    return {'ok': True, 'unchanged': False, 'mtime': stamp_text, 'uri': uri}


def embed_image(href):
    """Байты картинки для HTML. ok=False — экспорт надо остановить."""
    if is_remote(href):
        href = href.strip()
        cached = _cached_remote(href)
        if cached:
            return {'ok': True, 'uri': cached[1]}
        loaded = _load_remote(href)
        if loaded is None:
            return {'ok': False}
        return {'ok': True, 'uri': _store_remote(href, loaded)}
    path = local_path(href)
    if not path:
        return {'ok': False}
    stamp = _local_stamp(path)
    if stamp is not None:
        uri = _cached_local_uri(path, stamp)
        if uri is not None:
            return {'ok': True, 'uri': uri}
    loaded = _read_file(path)
    if loaded is None:
        return {'ok': False}
    uri = _data_uri(loaded[0], loaded[1])
    if stamp is not None:
        _store_local(path, stamp, uri)
    return {'ok': True, 'uri': uri}


def resolve_image(href):
    """Прямой адрес картинки и её байты. Короткая ссылка раскрывается через og:image."""
    href = str(href or '').strip()
    if not is_remote(href):
        return {'ok': False}
    cached = _cached_remote(href)
    if cached:
        return {'ok': True, 'url': cached[0], 'uri': cached[1]}
    loaded = _load_remote(href)
    if loaded is None:
        return {'ok': False}
    uri = _store_remote(href, loaded)
    return {'ok': True, 'url': loaded[2], 'uri': uri}


def is_remote(href):
    return str(href or '').lower().startswith(('http://', 'https://'))


def local_path(href):
    """Полный путь Windows из адреса Markdown. Относительный путь не раскрываем."""
    text = str(href or '').strip()
    if text.lower().startswith('file:'):
        parsed = urllib.parse.urlparse(text)
        path = urllib.parse.unquote(parsed.path or '')
        if re.match(r'^/[A-Za-z]:', path):
            path = path[1:]
        text = path
    text = text.replace('\\', '/')
    if not re.match(r'^[A-Za-z]:/', text) and not text.startswith('//'):
        return None
    return os.path.normpath(text)


def _read_file(path):
    if not path or not os.path.isfile(path):
        return None
    ext = os.path.splitext(path)[1].lower()
    if ext not in _EXT_MIME:
        return None
    try:
        if os.path.getsize(path) > MAX_IMAGE_BYTES:
            return None
        with open(path, 'rb') as handle:
            data = handle.read()
    except OSError:
        return None
    kind = _sniff(data)
    if kind != _EXT_MIME[ext]:
        return None
    return kind, data


def _load_remote(url, depth=0):
    """Картинка по адресу. Если это страница, один раз берём с неё og:image."""
    opened = _open_remote(url)
    if opened is None:
        return None
    final, ctype, data = opened
    kind = _sniff(data)
    if kind and _type_matches(ctype, kind):
        return kind, data, final
    if ctype.startswith('video/'):
        return None
    if depth >= 1 or not _looks_like_html(ctype, data):
        return None
    # Кадр ролика не берём. Обычное фото на той же странице остаётся.
    if _declared_image_is_poster(data):
        return None
    page = _og_image(data, final)
    if not page:
        return None
    return _load_remote(page, depth + 1)


def _open_remote(url):
    if not is_remote(url):
        return None
    opener = urllib.request.build_opener(_SafeRedirect())
    request = urllib.request.Request(url, headers={'User-Agent': 'MDViewer'})
    try:
        response = opener.open(request, timeout=DOWNLOAD_TIMEOUT)
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError, ValueError):
        return None
    if response is None:
        return None
    with response:
        final = response.geturl()
        if not is_remote(final):
            return None
        header = response.headers.get('Content-Type') if response.headers else ''
        ctype = header.split(';', 1)[0].strip().lower() if header else ''
        try:
            data = response.read(MAX_IMAGE_BYTES + 1)
        except OSError:
            return None
    if len(data) > MAX_IMAGE_BYTES:
        return None
    return final, ctype, data


def _looks_like_html(ctype, data):
    if ctype.startswith('text/html') or ctype.startswith('application/xhtml'):
        return True
    head = data.lstrip()[:200].lower()
    return head.startswith(b'<!doctype html') or head.startswith(b'<html')


def _is_video_url(url):
    path = urllib.parse.urlparse(str(url or '')).path.lower()
    return path.endswith(('.mp4', '.m4v', '.webm', '.mov', '.ogv', '.ogg', '.mkv', '.avi'))


def _meta_content(tag):
    match = re.search(r'\bcontent\s*=\s*["\']([^"\']+)["\']', tag, flags=re.I)
    if not match:
        return ''
    return html.unescape(match.group(1)).strip()


def _declared_image_is_poster(data):
    """Картинка в шапке — кадр ролика, а не отдельное фото.

    Ролик где-то на странице сам по себе кадр не отменяет: фото рядом остаётся.
    Pinterest для ролика не ставит og:video. У такого пина в содержимом есть
    блок видео и нет блока картинки, а адрес в шапке — обложка ролика.
    """
    text = data.decode('utf-8', 'replace')
    if 'StoryPinVideoBlock' in text and 'StoryPinImageBlock' not in text:
        return True
    for tag in re.findall(r'<meta\b[^>]*>', text, flags=re.I):
        if re.search(
            r'(?:property|name)\s*=\s*["\']og:video(?::(?:url|secure_url|type))?["\']',
            tag,
            flags=re.I,
        ):
            return True
        kind = ''
        if re.search(r'(?:property|name)\s*=\s*["\']og:type["\']', tag, flags=re.I):
            kind = _meta_content(tag).lower()
        elif re.search(r'(?:property|name)\s*=\s*["\']twitter:card["\']', tag, flags=re.I):
            kind = _meta_content(tag).lower()
        if kind.startswith('video') or kind in ('player',):
            return True
    return False


def _is_poster_url(url):
    path = urllib.parse.urlparse(str(url or '')).path.lower()
    return '/videos/thumbnails/' in path or _is_video_url(url)


def _og_image(data, base):
    text = data.decode('utf-8', 'replace')
    for tag in re.findall(r'<meta\b[^>]*>', text, flags=re.I):
        if not re.search(
            r'(?:property|name)\s*=\s*["\'](?:og:image|twitter:image(?::src)?)["\']',
            tag,
            flags=re.I,
        ):
            continue
        match = re.search(r'\bcontent\s*=\s*["\']([^"\']+)["\']', tag, flags=re.I)
        if not match:
            continue
        raw = html.unescape(match.group(1)).strip()
        if raw.startswith('//'):
            raw = 'https:' + raw
        target = urllib.parse.urljoin(base, raw)
        if is_remote(target) and not _is_poster_url(target):
            return target
    return None


class _SafeRedirect(urllib.request.HTTPRedirectHandler):
    """Только http(s), без заголовков авторизации, не больше пяти переходов."""

    max_redirections = MAX_REDIRECTS

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if code not in (301, 302, 303, 307, 308):
            raise urllib.error.URLError('redirect refused')
        target = urllib.parse.urljoin(req.full_url, newurl)
        if not is_remote(target):
            raise urllib.error.URLError('redirect refused')
        return urllib.request.Request(target, headers={'User-Agent': 'MDViewer'})

    def http_error_308(self, req, fp, code, msg, headers):
        return self.http_error_302(req, fp, code, msg, headers)


def _type_matches(ctype, kind):
    if not ctype or ctype in ('application/octet-stream', 'binary/octet-stream'):
        return True
    if not ctype.startswith('image/'):
        return False
    subtype = ctype.split('/', 1)[1]
    return subtype in _MIME_ALIASES.get(kind, set())


def _sniff(data):
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png'
    if data.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg'
    if data.startswith((b'GIF87a', b'GIF89a')):
        return 'image/gif'
    if len(data) >= 12 and data.startswith(b'RIFF') and data[8:12] == b'WEBP':
        return 'image/webp'
    if data.startswith(b'BM'):
        return 'image/bmp'
    head = data.lstrip()[:300].lower()
    if head.startswith(b'<svg') or head.startswith(b'<?xml') or b'<svg' in head:
        return 'image/svg+xml'
    return None


def _data_uri(mime, data):
    import base64
    return 'data:' + mime + ';base64,' + base64.b64encode(data).decode('ascii')
