"""Общая настройка тестов.

Тесты не должны трогать настоящие настройки и сессию в %APPDATA%\\MDViewer.
Поэтому APPDATA подменяется ещё до импорта mdviewer, а каждый тест вдобавок
получает свою пустую временную папку.
"""
import os
import sys
import tempfile
from pathlib import Path

import pytest

_SANDBOX = tempfile.mkdtemp(prefix='mdviewer-tests-')
os.environ['APPDATA'] = _SANDBOX

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from mdviewer import config, durable, images, session  # noqa: E402


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    """Все пути приложения — во временной папке теста, кэши модулей пустые."""
    monkeypatch.setattr(config, 'CONFIG_DIR', str(tmp_path))
    monkeypatch.setattr(config, 'CONFIG_PATH', str(tmp_path / 'config.json'))
    monkeypatch.setattr(config, 'USER_DICT_PATH', str(tmp_path / 'user-dictionary.txt'))
    monkeypatch.setattr(session, 'SESSION_PATH', str(tmp_path / 'session.json'))
    monkeypatch.setattr(session, '_last_written', None)
    durable._known_good.clear()
    durable._backup_at.clear()
    durable._swept_dirs.clear()
    images._preview_cache.clear()
    images._resolve_cache.clear()
    yield tmp_path


windows_only = pytest.mark.skipif(
    sys.platform != 'win32', reason='пути вида C:\\... есть только в Windows'
)
