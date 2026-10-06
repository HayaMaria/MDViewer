"""Отсчёт автосохранения.

Интервал запускается заново после последней правки и ждётся в потоке Python.
Таймер страницы для этого не используется: в окне приложения он срабатывает
не через те секунды, которые выбраны в настройках.
"""
import threading

from . import config, documents
from .state import call_js, state

_lock = threading.Lock()
_timer = None
_enabled = False
_interval = float(config.AUTOSAVE_DEFAULT_INTERVAL)


def configure(enabled, interval):
    """Применить флажок и период. Текущий отсчёт сбрасывается."""
    global _enabled, _interval, _timer
    with _lock:
        _enabled = bool(enabled)
        _interval = float(config._clamp_autosave_interval(interval))
        if _timer is not None:
            _timer.cancel()
            _timer = None


def arm():
    """Начать период заново. Повторный вызов откладывает сохранение ещё на один период."""
    global _timer
    with _lock:
        if not _enabled:
            return
        if _timer is not None:
            _timer.cancel()
        _timer = threading.Timer(_interval, _fire)
        _timer.daemon = True
        _timer.start()


def disarm():
    global _timer
    with _lock:
        if _timer is not None:
            _timer.cancel()
            _timer = None


def _fire():
    global _timer
    with _lock:
        _timer = None
        if not _enabled:
            return
    try:
        documents.autosave()
        dirty = bool(call_js('isDocumentDirty'))
    except Exception:
        dirty = False
    if dirty and state.current_file and not state.html_mode:
        arm()
