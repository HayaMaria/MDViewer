"""Открытие HTML: локальные ресурсы встраиваются, всё остальное остаётся как было."""
import pytest

from mdviewer import htmlfile

PNG = b'\x89PNG\r\n\x1a\n' + b'\x00' * 16


@pytest.mark.parametrize('url', [
    'pic.png', 'img/pic.png', '../pic.png', 'картинка.png', 'a b.png',
])
def test_local_relative(url):
    assert htmlfile._is_local_relative(url)


@pytest.mark.parametrize('url', [
    '', '   ', '#anchor', 'http://x/a.png', 'HTTPS://x/a.png', 'data:image/png;base64,AA',
    'file:///C:/a.png', 'blob:x', 'mailto:a@b', 'javascript:void(0)', 'tel:123',
    '//cdn/a.js', '/root/a.png',
])
def test_not_local_relative(url):
    assert not htmlfile._is_local_relative(url)


def test_read_html_encodings(tmp_path):
    utf8 = tmp_path / 'u.html'
    utf8.write_bytes('\ufeffПривет'.encode('utf-8'))
    assert htmlfile.read_html_text(str(utf8)) == 'Привет'
    cp1251 = tmp_path / 'c.html'
    cp1251.write_bytes('Привет'.encode('cp1251'))
    assert htmlfile.read_html_text(str(cp1251)) == 'Привет'


def page(tmp_path, html):
    path = tmp_path / 'page.html'
    path.write_text(html, encoding='utf-8')
    return str(path)


def test_local_image_is_inlined(tmp_path):
    (tmp_path / 'картинка 1.png').write_bytes(PNG)
    html = '<img src="картинка%201.png?v=2#x">'
    result = htmlfile.prepare_html_for_preview(page(tmp_path, html), html)
    assert result.startswith('<img src="data:image/png;base64,')


def test_subfolder_and_single_quotes(tmp_path):
    (tmp_path / 'img').mkdir()
    (tmp_path / 'img' / 'a.png').write_bytes(PNG)
    html = "<img src='img/a.png'>"
    result = htmlfile.prepare_html_for_preview(page(tmp_path, html), html)
    assert "src='data:image/png;base64," in result


@pytest.mark.parametrize('html', [
    '<img src="нет.png">',                    # файла нет
    '<img src="https://example.com/a.png">',  # внешний адрес
    '<a href="#top">наверх</a>',
    '<a href="doc.pdf">pdf</a>',              # тип не встраивается
])
def test_left_as_is(tmp_path, html):
    (tmp_path / 'doc.pdf').write_bytes(b'%PDF')
    assert htmlfile.prepare_html_for_preview(page(tmp_path, html), html) == html


def test_too_big_resource_is_left(tmp_path, monkeypatch):
    monkeypatch.setattr(htmlfile, 'MAX_RESOURCE_BYTES', 10)
    (tmp_path / 'a.png').write_bytes(PNG)
    html = '<img src="a.png">'
    assert htmlfile.prepare_html_for_preview(page(tmp_path, html), html) == html


def test_inline_limit(tmp_path, monkeypatch):
    monkeypatch.setattr(htmlfile, 'MAX_INLINED_RESOURCES', 2)
    (tmp_path / 'a.png').write_bytes(PNG)
    html = '<img src="a.png">' * 3
    result = htmlfile.prepare_html_for_preview(page(tmp_path, html), html)
    assert result.count('data:image/png') == 2
    assert result.endswith('<img src="a.png">')


@pytest.mark.parametrize('html', [
    '<html><head><title>x</title></head><body></body></html>',
    '<html lang="ru"><body></body></html>',
    '<p>только текст</p>',
])
def test_fit_width_style_injected_once(html):
    result = htmlfile.inject_fit_width_style(html)
    assert result.count('data-mdv-fit') == 1
    assert result.replace(htmlfile._FIT_WIDTH_STYLE, '') == html
