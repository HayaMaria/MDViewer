"""Понятные сообщения об ошибках файлов и метка версии файла."""
import errno

import pytest

from mdviewer import documents, errors


def _win_error(code, cls=OSError):
    error = cls(errno.EACCES, 'system text')
    error.winerror = code
    return error


@pytest.mark.parametrize('error, expected', [
    (UnicodeDecodeError('utf-8', b'\xcf', 0, 1, 'bad'), 'не в кодировке UTF-8'),
    (FileNotFoundError(errno.ENOENT, 'x'), 'не найдены'),
    (PermissionError(errno.EACCES, 'x'), 'нет доступа'),
    (_win_error(32, PermissionError), 'занят другой программой'),
    (_win_error(112), 'не хватает места'),
    (OSError(errno.ENOSPC, 'x'), 'не хватает места'),
    (_win_error(53), 'сетевая папка недоступна'),
    (OSError(errno.EIO, 'Input/output error'), 'системная ошибка (Input/output error)'), (IsADirectoryError(errno.EISDIR, 'x'), 'указана папка, а не файл'),
    (OSError(errno.ENAMETOOLONG, 'x'), 'слишком длинный путь'),
    (_win_error(21), 'диск недоступен'),
])
def test_describe(error, expected):
    assert expected in errors.describe(error)


def test_message_adds_advice():
    text = errors.message('открыть файл', 'a.md', UnicodeDecodeError('utf-8', b'\xcf', 0, 1, 'bad'))
    assert text.startswith('Не удалось открыть файл «a.md»: файл сохранён не в кодировке UTF-8.')
    assert 'UTF-8' in text.split('\n\n', 1)[1]


def test_message_without_advice():
    text = errors.message('открыть файл', 'a.md', FileNotFoundError(errno.ENOENT, 'x'))
    assert '\n' not in text


def test_file_stamp_changes_with_content(tmp_path):
    path = tmp_path / 'a.md'
    path.write_text('one', encoding='utf-8')
    first = documents.file_stamp(str(path))
    path.write_text('one more', encoding='utf-8')
    assert first and documents.file_stamp(str(path)) != first


def test_file_stamp_missing(tmp_path):
    assert documents.file_stamp(str(tmp_path / 'nope.md')) == ''
    assert documents.file_stamp('') is None


def test_reload_file_reports_encoding(tmp_path):
    path = tmp_path / 'cp1251.md'
    path.write_bytes('Привет'.encode('cp1251'))
    result = documents.reload_file(str(path))
    assert result['ok'] is False
    assert 'UTF-8' in result['message']


def test_reload_file_returns_text_and_stamp(tmp_path):
    path = tmp_path / 'a.md'
    path.write_text('# Заголовок', encoding='utf-8')
    result = documents.reload_file(str(path))
    assert result == {'ok': True, 'content': '# Заголовок', 'stamp': documents.file_stamp(str(path))}
