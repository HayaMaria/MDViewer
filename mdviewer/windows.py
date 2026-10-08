"""Окна редактора: первое и те, что открываются перетаскиванием вкладки."""
import itertools

import webview

from . import APP_TITLE, UNTITLED
from .paths import INDEX_HTML
from .state import bind_slot, state, unbind_slot

_ids = itertools.count(1)
# Вызываются после загрузки страницы, уже в контексте своего окна.
loaded_callbacks = []


def create_editor_window(launch=None, x=None, y=None):
    """Окно с тем же интерфейсом. launch — вкладки, которые надо открыть вместо сессии."""
    from .api import Api
    from .documents import request_close
    from .state import WindowSlot

    slot = WindowSlot(str(next(_ids)))
    state.slots[slot.id] = slot
    if state.primary is None:
        state.primary = slot
    slot.launch = launch

    options = {
        'title': f'{APP_TITLE} — {UNTITLED}',
        'url': str(INDEX_HTML),
        'js_api': Api(slot),
        'width': 1200,
        'height': 800,
        'resizable': True,
    }
    if x is not None and y is not None:
        options['x'] = int(x)
        options['y'] = int(y)
    try:
        window = webview.create_window(**options)
    except Exception:
        state.slots.pop(slot.id, None)
        if state.primary is slot:
            state.primary = None
        raise
    slot.window = window

    def on_closing(*args, **kwargs):
        token = bind_slot(slot)
        try:
            return request_close(*args, **kwargs)
        finally:
            unbind_slot(token)

    def on_loaded():
        token = bind_slot(slot)
        try:
            for callback in loaded_callbacks:
                callback()
        finally:
            unbind_slot(token)

    window.events.closing += on_closing
    window.events.loaded += on_loaded
    return slot
