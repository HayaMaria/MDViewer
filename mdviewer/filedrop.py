"""Файл из Проводника, брошенный в окно, открывается как через «Открыть».

Путь приходит из WebView2 только если страница слушает drop через API
pywebview: браузер прикладывает CoreWebView2File к сообщению FilesDropped.
Превью HTML — это iframe, его документ сам событие родителю не отдаёт.
Пока курсор над ним, страница просит не перехватывать мышь, и бросок
доходит до окна. Если iframe всё же успел начать переход на file://,
навигацию отменяем и открываем этот путь.
"""
import logging
import os
import threading
import time
import urllib.parse

from webview.dom import DOMEventHandler, _dnd_state

from . import documents
from .state import alert, bind_slot, call_js, spawn, state, unbind_slot

_log = logging.getLogger(__name__)
_open_lock = threading.Lock()
# Делегаты WinForms нельзя отпускать: pythonnet их иначе соберёт.
_nav_handlers = {}


def enable():
    """Подписать текущее окно. Вызывается после загрузки страницы."""
    slot = state.active_slot()
    window = slot.window if slot is not None else None
    if window is None or getattr(slot, '_file_drop_on', False):
        return
    slot._file_drop_on = True

    def on_drop(event):
        token = bind_slot(slot)
        try:
            _open_dropped(event)
        except Exception:
            _log.warning('Не удалось открыть перетащенный файл', exc_info=True)
        finally:
            unbind_slot(token)

    try:
        window.dom.document.on(
            'drop',
            DOMEventHandler(on_drop, prevent_default=True, stop_propagation=True),
        )
    except Exception:
        _log.warning('Страница не приняла перетаскивание файлов', exc_info=True)
    _hook_file_navigation(slot)


def _open_dropped(event):
    if not isinstance(event, dict):
        return
    files = (event.get('dataTransfer') or {}).get('files') or []
    if not isinstance(files, list):
        return
    ready = []
    pending = []
    for item in files:
        if not isinstance(item, dict):
            continue
        path = item.get('pywebviewFullPath')
        if path:
            ready.append(path)
            continue
        name = item.get('name')
        if name:
            pending.append(name)
    # Сообщение с путями иногда приходит сразу после события, не до него.
    if pending:
        time.sleep(0.15)
        ready.extend(_take_named_paths(pending))
    paths = _unique(ready)
    if not paths and (pending or files):
        _log.warning('Пути перетащенных файлов не пришли')
    _open_paths(paths)


def _take_named_paths(names):
    found = []
    for name in names:
        wanted = urllib.parse.unquote(name)
        match = None
        for item in _dnd_state['paths']:
            if urllib.parse.unquote(item[0]) == wanted:
                match = item
                break
        if match is None:
            continue
        try:
            _dnd_state['paths'].remove(match)
        except ValueError:
            continue
        found.append(urllib.parse.unquote(match[1]))
    return found


def _unique(paths):
    seen = set()
    result = []
    for path in paths:
        if not path or path in seen:
            continue
        seen.add(path)
        result.append(path)
    return result


def _open_paths(paths):
    with _open_lock:
        try:
            call_js('hideFileDrop')
        except Exception:
            pass
        files = []
        folders = False
        for path in paths:
            if os.path.isdir(path):
                folders = True
            elif os.path.isfile(path):
                files.append(path)
        if not files:
            if folders:
                alert('Перетащите файл, а не папку.')
            elif paths:
                alert('Не удалось открыть файл.')
            return
        for path in files:
            documents.open_path(path)


def _hook_file_navigation(slot):
    native = getattr(slot.window, 'native', None)
    control = getattr(native, 'webview', None) if native is not None else None
    if control is None:
        return

    def on_navigation(sender, args):
        try:
            path = _file_uri_path(_event_uri(args))
            if not path or not (os.path.isfile(path) or os.path.isdir(path)):
                return
            # Свой переход страницы (не бросок и не клик) не перехватываем.
            if getattr(args, 'IsUserInitiated', True) is False:
                return
            _cancel_navigation(args)
            spawn(slot, _open_paths, [path])
        except Exception:
            _log.warning('Не удалось перехватить переход к файлу', exc_info=True)

    def attach():
        core = control.CoreWebView2
        if core is None:
            return
        core.NavigationStarting += on_navigation
        try:
            core.FrameNavigationStarting += on_navigation
        except Exception:
            _log.warning('Превью HTML не отдаёт перетаскивание', exc_info=True)
        _nav_handlers[slot.id] = on_navigation

    try:
        from System import Action

        if control.InvokeRequired:
            control.Invoke(Action(attach))
        else:
            attach()
    except Exception:
        _log.warning('Не удалось подписаться на переход к файлу', exc_info=True)


def _event_uri(args):
    value = getattr(args, 'Uri', None)
    if value:
        return str(value)
    getter = getattr(args, 'get_Uri', None)
    if callable(getter):
        try:
            return str(getter())
        except Exception:
            return ''
    return ''


def _cancel_navigation(args):
    try:
        args.Cancel = True
        return
    except Exception:
        pass
    setter = getattr(args, 'set_Cancel', None)
    if callable(setter):
        setter(True)


def _file_uri_path(uri):
    """file:///C:/a.md и file://server/share/a.md → путь Windows."""
    if not isinstance(uri, str) or not uri.lower().startswith('file:'):
        return None
    parsed = urllib.parse.urlparse(uri)
    path = urllib.parse.unquote(parsed.path or '')
    host = (parsed.netloc or '').lower()
    if host and host != 'localhost':
        path = '//' + parsed.netloc + path
    if len(path) >= 3 and path[0] == '/' and path[2] == ':':
        path = path[1:]
    if not path:
        return None
    return os.path.normpath(path)
