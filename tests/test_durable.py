"""Надёжная запись: обрыв или битый файл не стирают прежний текст."""
import os

import pytest

from mdviewer import durable


def leftovers(directory):
    return [n for n in os.listdir(directory) if n.startswith('.mdv-') and n.endswith('.tmp')]


def test_write_and_read(tmp_path):
    path = tmp_path / 'doc.md'
    durable.write_text(str(path), 'Привет\nмир')
    assert durable.read_text(str(path)) == 'Привет\nмир'
    assert leftovers(tmp_path) == []


def test_write_creates_missing_folder(tmp_path):
    path = tmp_path / 'новая папка' / 'doc.md'
    durable.write_text(str(path), 'x')
    assert path.read_text(encoding='utf-8') == 'x'


def test_write_rejects_non_text(tmp_path):
    with pytest.raises(TypeError):
        durable.write_text(str(tmp_path / 'a.md'), b'bytes')
    assert not (tmp_path / 'a.md').exists()
    assert leftovers(tmp_path) == []


def test_newline_mode(tmp_path):
    path = tmp_path / 'a.txt'
    durable.write_text(str(path), 'a\nb', newline='\r\n')
    assert path.read_bytes() == b'a\r\nb'


def test_read_absent(tmp_path):
    assert durable.read_text(str(tmp_path / 'нет.md')) is None


def test_broken_file_falls_back_to_backup(tmp_path):
    path = tmp_path / 'config.json'
    durable.write_text(str(path), 'первая версия')
    durable.write_text(str(path), 'вторая версия', backup=True, backup_interval=0)
    assert (tmp_path / 'config.json.bak').read_text(encoding='utf-8') == 'первая версия'
    path.write_bytes(b'\xff\xfe\x00 not utf-8 \xc3')
    assert durable.read_text(str(path)) == 'первая версия'


def test_broken_file_does_not_overwrite_backup(tmp_path):
    path = tmp_path / 'config.json'
    durable.write_text(str(path), 'хорошая')
    durable.write_text(str(path), 'тоже хорошая', backup=True, backup_interval=0)
    # Файл испортили снаружи — следующая запись не должна снять с него копию
    path.write_text('испорчено снаружи', encoding='utf-8')
    durable.write_text(str(path), 'новая', backup=True, backup_interval=0)
    assert (tmp_path / 'config.json.bak').read_text(encoding='utf-8') == 'хорошая'


def test_backup_interval(tmp_path):
    path = str(tmp_path / 's.json')
    durable.write_text(path, '1')
    durable.write_text(path, '2', backup=True, backup_interval=30)
    durable.write_text(path, '3', backup=True, backup_interval=30)
    # Вторая копия за 30 секунд не снимается
    assert (tmp_path / 's.json.bak').read_text(encoding='utf-8') == '1'


def test_ensure_backup_only_once(tmp_path):
    path = tmp_path / 'a.json'
    path.write_text('целый', encoding='utf-8')
    durable.note_good(str(path))
    durable.ensure_backup(str(path))
    path.write_text('другой', encoding='utf-8')
    durable.note_good(str(path))
    durable.ensure_backup(str(path))
    assert (tmp_path / 'a.json.bak').read_text(encoding='utf-8') == 'целый'


def test_ensure_backup_needs_known_good_file(tmp_path):
    path = tmp_path / 'a.json'
    path.write_text('не проверен', encoding='utf-8')
    durable.ensure_backup(str(path))
    assert not (tmp_path / 'a.json.bak').exists()


def test_old_temp_files_are_swept(tmp_path):
    (tmp_path / '.mdv-old.tmp').write_text('обломок', encoding='utf-8')
    (tmp_path / 'чужой.tmp').write_text('не наш', encoding='utf-8')
    durable.write_text(str(tmp_path / 'a.md'), 'x')
    assert leftovers(tmp_path) == []
    assert (tmp_path / 'чужой.tmp').exists()


def test_parse_json(tmp_path):
    path = tmp_path / 'a.json'
    assert durable.parse_json(str(path)) == ('absent', None)
    path.write_text('{"a": 1}', encoding='utf-8')
    assert durable.parse_json(str(path)) == ('ok', {'a': 1})
    path.write_text('{"a": ', encoding='utf-8')
    assert durable.parse_json(str(path)) == ('broken', None)


def test_remove_file(tmp_path):
    path = tmp_path / 'a.json'
    durable.write_text(str(path), '1')
    durable.write_text(str(path), '2', backup=True, backup_interval=0)
    durable.remove_file(str(path))
    assert not path.exists()
    assert not (tmp_path / 'a.json.bak').exists()
    durable.remove_file(str(path))  # повторно — без ошибки
