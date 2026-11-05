"""Картинки без сети: разбор путей и распознавание формата по содержимому."""
import os

import pytest

from mdviewer import images
from tests.conftest import windows_only

PNG = b'\x89PNG\r\n\x1a\n' + b'\x00' * 16
JPEG = b'\xff\xd8\xff\xe0' + b'\x00' * 16
GIF = b'GIF89a' + b'\x00' * 16
WEBP = b'RIFF\x00\x00\x00\x00WEBPVP8 '
SVG = b'  <svg xmlns="http://www.w3.org/2000/svg"></svg>'


# ----- адреса -----

@pytest.mark.parametrize('href', ['http://x/a.png', 'HTTPS://x/a.png'])
def test_is_remote(href):
    assert images.is_remote(href)


@pytest.mark.parametrize('href', ['C:/a.png', 'file:///C:/a.png', '', None, 'ftp://x'])
def test_is_not_remote(href):
    assert not images.is_remote(href)


@pytest.mark.parametrize('href, expected', [
    ('C:/Users/Мария/a b.png', 'C:/Users/Мария/a b.png'),
    ('C:\\Users\\Мария\\a.png', 'C:/Users/Мария/a.png'),
    ('  D:/pic.png  ', 'D:/pic.png'),
    ('file:///C:/Users/a%20b.png', 'C:/Users/a b.png'),
    ('file:///C:/%D0%9C%D0%B0%D1%80%D0%B8%D1%8F.png', 'C:/Мария.png'),
    ('//server/share/a.png', '//server/share/a.png'),
])
def test_local_path(href, expected):
    assert images.local_path(href) == os.path.normpath(expected)


@pytest.mark.parametrize('href', ['a.png', 'img/a.png', '../a.png', '/a.png', '', None])
def test_relative_path_is_not_expanded(href):
    assert images.local_path(href) is None


# ----- формат по содержимому -----

@pytest.mark.parametrize('data, kind', [
    (PNG, 'image/png'), (JPEG, 'image/jpeg'), (GIF, 'image/gif'),
    (WEBP, 'image/webp'), (b'BM' + b'\x00' * 16, 'image/bmp'), (SVG, 'image/svg+xml'),
    (b'<!doctype html><html>', None), (b'', None), (b'plain text', None),
])
def test_sniff(data, kind):
    assert images._sniff(data) == kind


@pytest.mark.parametrize('ctype, kind, ok', [
    ('image/png', 'image/png', True),
    ('image/jpg', 'image/jpeg', True),
    ('', 'image/png', True),
    ('application/octet-stream', 'image/gif', True),
    ('image/png', 'image/jpeg', False),
    ('text/html', 'image/png', False),
])
def test_type_matches(ctype, kind, ok):
    assert images._type_matches(ctype, kind) is ok


@pytest.mark.parametrize('ctype, data, ok', [
    ('text/html', b'', True),
    ('application/xhtml+xml', b'', True),
    ('', b'  <!DOCTYPE html><html>', True),
    ('', b'<html lang="ru">', True),
    ('image/png', PNG, False),
])
def test_looks_like_html(ctype, data, ok):
    assert images._looks_like_html(ctype, data) is ok


# ----- страница вместо картинки -----

def test_og_image():
    page = b'<head><meta property="og:image" content="/img/a.png?x=1&amp;y=2"></head>'
    assert images._og_image(page, 'https://site.ru/post/1') == 'https://site.ru/img/a.png?x=1&y=2'


def test_og_image_protocol_relative_and_twitter():
    page = b'<meta name="twitter:image" content="//cdn.ru/a.jpg">'
    assert images._og_image(page, 'https://site.ru/') == 'https://cdn.ru/a.jpg'


def test_og_image_skips_video_poster():
    page = b'<meta property="og:image" content="https://x.ru/clip.mp4">'
    assert images._og_image(page, 'https://x.ru/') is None


def test_og_image_absent():
    assert images._og_image('<html><body>нет</body></html>'.encode('utf-8'), 'https://x.ru/') is None


@pytest.mark.parametrize('page, poster', [
    (b'<meta property="og:video" content="https://x/v.mp4">', True),
    (b'<meta property="og:type" content="video.other">', True),
    (b'<meta name="twitter:card" content="player">', True),
    (b'<meta property="og:type" content="article">', False),
    (b'<div>StoryPinVideoBlock</div>', True),
    (b'<div>StoryPinVideoBlock StoryPinImageBlock</div>', False),
])
def test_declared_image_is_poster(page, poster):
    assert images._declared_image_is_poster(page) is poster


# ----- локальные файлы (только Windows: приложение понимает лишь пути C:\...) -----

@windows_only
def test_preview_local_png(tmp_path):
    path = tmp_path / 'картинка.png'
    path.write_bytes(PNG)
    first = images.preview_image(str(path))
    assert first['ok'] and first['uri'].startswith('data:image/png;base64,')
    again = images.preview_image(str(path), first['mtime'])
    assert again == {'ok': True, 'unchanged': True, 'mtime': first['mtime']}


@windows_only
def test_preview_rejects_fake_extension(tmp_path):
    path = tmp_path / 'not-really.png'
    path.write_bytes(b'<html>not an image</html>')
    assert images.preview_image(str(path)) == {'ok': False}


@windows_only
def test_embed_missing_file(tmp_path):
    assert images.embed_image(str(tmp_path / 'нет.png')) == {'ok': False, 'reason': 'missing'}


@windows_only
def test_embed_too_large(tmp_path, monkeypatch):
    path = tmp_path / 'big.png'
    path.write_bytes(PNG + b'\x00' * 64)
    monkeypatch.setattr(images, 'MAX_IMAGE_BYTES', 16)
    assert images.embed_image(str(path)) == {'ok': False, 'reason': 'too_large'}


@windows_only
def test_embed_fake_extension(tmp_path):
    path = tmp_path / 'not-really.png'
    path.write_bytes(b'<html>not an image</html>')
    assert images.embed_image(str(path)) == {'ok': False, 'reason': 'not_image'}


@windows_only
def test_embed_estimate(tmp_path):
    path = tmp_path / 'a.png'
    path.write_bytes(b'x' * 300)
    estimate = images.embed_estimate([str(path), str(path), 'https://example.com/a.png'])
    assert estimate == {'bytes': 400, 'unknown': 1}
