"""Файл, с которым запустили MD Viewer (двойной щелчок или «Открыть с помощью»).

Сами записи «Открыть с помощью» для .md/.txt/.html делает установщик
(installer/MDViewer.iss) и убирает их при удалении. Программа в реестр
не пишет и программой по умолчанию себя не назначает: это выбор пользователя.
"""
import ctypes
import os
import sys


def get_startup_file_path():
    """Путь к файлу из аргументов командной строки (двойной щелчок в Проводнике)."""
    for arg in sys.argv[1:]:
        if not arg or arg.startswith('-'):
            continue
        path = os.path.abspath(os.path.expanduser(arg.strip('"')))
        if os.path.isfile(path):
            return _long_path(path)
    return None


def _long_path(path):
    buf = ctypes.create_unicode_buffer(32768)
    n = ctypes.windll.kernel32.GetLongPathNameW(path, buf, 32768)
    return buf.value if n else path
