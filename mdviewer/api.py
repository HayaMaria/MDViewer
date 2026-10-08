"""Методы, доступные из JS как window.pywebview.api.*"""
import json
import threading
import webbrowser

import webview

from . import autosave, config, documents, export, session
from .state import state
from .win.titlebar import set_titlebar_theme


def _cursor_point():
    """Курсор в физических пикселях экрана. Координаты из страницы сюда не подходят:
    у них другой масштаб, и попадание во второе окно промахивается."""
    from System.Windows.Forms import Cursor

    point = Cursor.Position
    return int(point.X), int(point.Y)


def _hwnd(control):
    try:
        return int(control.Handle.ToInt64())
    except Exception:
        return 0


def _slot_by_root(root):
    if not root:
        return None
    for slot in state.iter_slots():
        window = slot.window
        native = getattr(window, 'native', None) if window is not None else None
        if native is None:
            continue
        if _hwnd(native) == root:
            return slot
    return None


def _slot_at_cursor():
    """Переднее окно редактора под курсором. Плашка переноса пропускается."""
    import ctypes

    from .drag_ghost import ghost_hwnd

    x, y = _cursor_point()
    user32 = ctypes.WinDLL('user32', use_last_error=True)
    user32.GetTopWindow.argtypes = [ctypes.c_void_p]
    user32.GetTopWindow.restype = ctypes.c_void_p
    user32.GetWindow.argtypes = [ctypes.c_void_p, ctypes.c_uint]
    user32.GetWindow.restype = ctypes.c_void_p
    user32.IsWindowVisible.argtypes = [ctypes.c_void_p]
    user32.IsWindowVisible.restype = ctypes.c_bool

    class RECT(ctypes.Structure):
        _fields_ = [
            ('l', ctypes.c_long), ('t', ctypes.c_long),
            ('r', ctypes.c_long), ('b', ctypes.c_long),
        ]

    user32.GetWindowRect.argtypes = [ctypes.c_void_p, ctypes.POINTER(RECT)]
    ghost = ghost_hwnd()
    hwnd = user32.GetTopWindow(None)
    while hwnd:
        current = int(hwnd)
        if current != ghost and user32.IsWindowVisible(hwnd):
            rect = RECT()
            if user32.GetWindowRect(hwnd, ctypes.byref(rect)):
                if rect.l <= x < rect.r and rect.t <= y < rect.b:
                    slot = _slot_by_root(current)
                    if slot is not None:
                        return slot
        hwnd = user32.GetWindow(hwnd, 2)  # GW_HWNDNEXT
    return None


def _client_point(slot):
    """Курсор в пикселях страницы этого окна. None — курсор вне страницы."""
    native = getattr(slot.window, 'native', None)
    web = getattr(native, 'webview', None) if native is not None else None
    if web is None:
        return None
    box = {}

    def read():
        from System.Drawing import Point

        origin = web.PointToScreen(Point(0, 0))
        scale = float(getattr(native, '_scale', 1) or 1)
        if scale <= 0:
            scale = 1.0
        box['x'] = int(origin.X)
        box['y'] = int(origin.Y)
        box['scale'] = scale
        box['w'] = int(web.Width)
        box['h'] = int(web.Height)

    try:
        from System import Action

        if native.InvokeRequired:
            native.Invoke(Action(read))
        else:
            read()
    except Exception:
        return None
    if 'x' not in box:
        return None
    cursor_x, cursor_y = _cursor_point()
    local_x = cursor_x - box['x']
    local_y = cursor_y - box['y']
    if local_x < 0 or local_y < 0 or local_x > box['w'] or local_y > box['h']:
        return None
    return local_x / box['scale'], local_y / box['scale']


_last_hit = {'key': None, 'info': None}


def _foreign_drop(fresh=False):
    """Другое окно под курсором. Над панелью вкладок — место вставки, иначе конец списка.

    None — курсор на своём окне или на пустом месте.
    """
    slot = _slot_at_cursor()
    me = state.active_slot()
    if slot is None or slot is me or slot.window is None:
        _last_hit['key'] = None
        _last_hit['info'] = None
        return None
    point = _client_point(slot)
    if point is None:
        key = (slot.id, None)
    else:
        key = (slot.id, int(point[0] // 12), int(point[1] // 8))
    if not fresh and key == _last_hit['key']:
        return _last_hit['info']
    info = None
    if point is not None:
        try:
            info = slot.window.evaluate_js(
                'tabDropInfo(%s,%s)' % (json.dumps(point[0]), json.dumps(point[1]))
            )
        except Exception:
            info = None
    if not isinstance(info, dict) or 'index' not in info:
        # Курсор точно на этом окне: вкладка добавляется в конец, а не в новое окно.
        info = {'index': 1000000, 'onBar': False}
    info['windowId'] = slot.id
    _last_hit['key'] = key
    _last_hit['info'] = info
    return info


class Api:
    def __init__(self, slot):
        object.__setattr__(self, '_slot', slot)

    def __getattribute__(self, name):
        # Пока выполняется метод, state.window и сессия относятся к этому окну.
        if name.startswith('_'):
            return object.__getattribute__(self, name)
        attr = object.__getattribute__(self, name)
        if not callable(attr):
            return attr
        slot = object.__getattribute__(self, '_slot')

        def call(*args, **kwargs):
            from .state import bind_slot, unbind_slot
            token = bind_slot(slot)
            try:
                return attr(*args, **kwargs)
            finally:
                unbind_slot(token)

        return call

    # ===== Настройки =====

    def get_settings(self):
        return config.ui_settings()

    def save_settings(self, settings):
        config.save_ui_settings(settings)
        saved = config.autosave_settings()
        autosave.configure(saved['enabled'], saved['interval'])

    def configure_autosave(self, enabled, interval):
        autosave.configure(enabled, interval)

    def arm_autosave(self):
        autosave.arm()

    def disarm_autosave(self):
        autosave.disarm()

    def set_theme(self, theme):
        config.set_value('theme', theme)

    def set_splitter_pos(self, percent):
        config.set_value('splitterPos', percent)

    def set_sync_scroll(self, enabled):
        config.set_value('syncScroll', bool(enabled))

    def pick_folder(self):
        result = state.window.create_file_dialog(webview.FileDialog.FOLDER)
        return result[0] if result else ''

    # ===== Документ =====

    def open_startup_file(self):
        """Открыть файл, переданный Проводником. False — файла нет.
        Чтение идёт в фоне, чтобы сразу вернуть управление JS."""
        path, state.startup_file = state.startup_file, None
        if not path:
            return False
        from .state import spawn
        spawn(state.active_slot(), documents.open_path, path)
        return True

    def restore_last_session(self):
        """Открыть документы прошлого запуска в этом окне. False — сессии нет."""
        data = session.load_session()
        if not session.is_restorable(data):
            documents.note_missing_session_file(data)
            return False
        bundle = session.merge_windows(data)
        if not bundle:
            return False
        from .state import spawn
        spawn(state.active_slot(), documents.restore_session, bundle)
        return True

    def claim_launch(self):
        """Вкладки, с которыми создано это окно. None — дальше обычная сессия.

        Данные возвращаются в страницу, она сама их открывает. Вставлять их
        из Python вторым вызовом нельзя: окно в этот момент ещё ждёт ответ
        и зависает пустым.
        """
        slot = state.active_slot()
        launch = slot.launch if slot is not None else None
        if slot is not None:
            slot.launch = None
        if not isinstance(launch, dict) or launch.get('kind') != 'tabs':
            return None
        tabs = launch.get('tabs') or []
        if not isinstance(tabs, list) or not tabs:
            return None
        try:
            active = int(launch.get('active') or 0)
        except (TypeError, ValueError):
            active = 0
        return {'tabs': tabs, 'active': active}

    def window_id(self):
        slot = state.active_slot()
        return slot.id if slot is not None else ''

    def show_welcome(self):
        documents.show_welcome()

    def save_session(self, snapshot):
        documents.remember_session(snapshot, from_js=True)

    def bind_active_document(self, info):
        """Активная вкладка сменилась на стороне страницы."""
        return documents.bind_active(info)

    def new_document(self):
        documents.new_document()

    def open_document(self):
        documents.open_file_dialog()

    def save_document(self):
        documents.save()

    def save_document_as(self):
        documents.save_as()

    def autosave_document(self):
        return documents.autosave()

    def quit(self):
        for slot in state.iter_slots():
            try:
                slot.force_close = True
                slot.window.destroy()
            except Exception:
                pass

    def close_this_window(self):
        """Закрыть окно, из которого уехала последняя вкладка."""
        slot = state.active_slot()
        if slot is None or slot.window is None:
            return
        slot.force_close = True
        try:
            slot.window.destroy()
        except Exception:
            slot.force_close = False

    def forget_window_session(self):
        documents.forget_window_session()

    def show_drag_ghost(self, title, dark):
        """Плашка вкладки за курсором. Один вид и над окном, и за его краем."""
        from .drag_ghost import show
        return show(title, dark)

    def hide_drag_ghost(self, token):
        from .drag_ghost import hide
        hide(token)

    def resolve_tab_drop(self, screen_x=None, screen_y=None):
        """Куда попадает курсор: другое окно или None, если это свободное место."""
        return _foreign_drop(fresh=True)

    def preview_foreign_drop(self, screen_x=None, screen_y=None):
        hit = _foreign_drop()
        me = state.active_slot()
        mark = None
        if hit and hit.get('onBar'):
            mark = (hit.get('windowId'), int(hit.get('index') or 0))
        previous = _last_hit.get('mark')
        if mark == previous:
            return
        _last_hit['mark'] = mark
        for slot in state.iter_slots():
            if slot is me or slot.window is None:
                continue
            if mark and slot.id == mark[0]:
                script = 'showTabDrop(%d)' % mark[1]
            else:
                script = 'clearTabDrop()'
            try:
                slot.window.evaluate_js(script)
            except Exception:
                pass

    def clear_foreign_drops(self):
        _last_hit['key'] = None
        _last_hit['info'] = None
        _last_hit['mark'] = None
        me = state.active_slot()
        for slot in state.iter_slots():
            if slot is me or slot.window is None:
                continue
            try:
                slot.window.evaluate_js('clearTabDrop()')
            except Exception:
                pass

    def deliver_tab(self, window_id, spec, index):
        return documents.deliver_tab(window_id, spec, index)

    def open_detached_window(self, spec, screen_x, screen_y):
        return documents.open_detached_window(spec, screen_x, screen_y)

    def detach_status(self, job_id):
        return documents.detach_status(job_id)

    # ===== Экспорт =====

    def export_html_default(self):
        export.export_with_saved_settings()

    def export_html(self, mode, theme, save_path):
        export.export_html(mode, theme, save_path)

    # ===== Окно и ссылки =====

    def apply_titlebar_theme(self, dark):
        set_titlebar_theme(state.window, dark)

    def open_external(self, url):
        webbrowser.open(url)

    def open_in_app_window(self, url):
        threading.Thread(target=self._create_browser_window, args=(url,), daemon=True).start()

    def _create_browser_window(self, url):
        webview.create_window(
            title='MD Viewer — Внешняя страница',
            url=url,
            width=900,
            height=700,
            resizable=True,
        )
