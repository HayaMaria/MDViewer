"""Окна редактора: первое и те, что открываются перетаскиванием вкладки."""
import itertools
import threading

import webview

from . import APP_TITLE, UNTITLED
from .config import DEFAULTS, load_config
from .paths import INDEX_HTML
from .state import bind_slot, state, unbind_slot
from .win.titlebar import set_titlebar_theme

_ids = itertools.count(1)
_create_lock = threading.Lock()
# Вызываются после загрузки страницы, уже в контексте своего окна.
loaded_callbacks = []

# Фон страницы до загрузки HTML. Совпадает с --bg в preview.css.
_THEME_BG = {
    'dark': '#1e1e1e',
    'light': '#ffffff',
}


def saved_theme():
    theme = load_config().get('theme', DEFAULTS['theme'])
    return theme if theme in _THEME_BG else 'dark'


def _create_window(theme, options):
    """Окно с заголовком в цвет темы ещё до появления на экране.

    Второе окно pywebview показывает внутри create_window, поэтому
    подписаться на before_show после возврата уже поздно.
    """
    dark = theme == 'dark'
    original_init = webview.Window.__init__

    def init_with_titlebar(self, *args, **kwargs):
        original_init(self, *args, **kwargs)
        self.events.before_show += lambda: set_titlebar_theme(self, dark)

    with _create_lock:
        webview.Window.__init__ = init_with_titlebar
        try:
            return webview.create_window(**options)
        finally:
            webview.Window.__init__ = original_init


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

    theme = saved_theme()
    options = {
        'title': f'{APP_TITLE} — {UNTITLED}',
        'url': f'{INDEX_HTML}?theme={theme}',
        'js_api': Api(slot),
        'width': 1200,
        'height': 800,
        'resizable': True,
        'background_color': _THEME_BG[theme],
    }
    if x is not None and y is not None:
        options['x'] = int(x)
        options['y'] = int(y)
    try:
        window = _create_window(theme, options)
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
