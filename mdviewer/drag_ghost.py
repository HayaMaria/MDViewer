"""Одна плашка перетаскиваемой вкладки.

Страница не может нарисовать её за краем своего окна, поэтому это отдельное
окно без рамки. Оно одного вида и над редактором, и снаружи, едет за курсором
само и не забирает мышь. Показ и скрытие — по номеру: опоздавшее скрытие
предыдущего переноса уже показанную плашку не гасит.
"""
import ctypes
import logging
import threading

_log = logging.getLogger(__name__)

_GWL_EXSTYLE = -20
_WS_EX_LAYERED = 0x00080000
_WS_EX_TOOLWINDOW = 0x00000080
_WS_EX_TRANSPARENT = 0x00000020
_WS_EX_NOACTIVATE = 0x08000000
_WS_EX_TOPMOST = 0x00000008
_SW_SHOWNOACTIVATE = 4
_SW_HIDE = 0
_SWP_NOSIZE = 0x0001
_SWP_NOMOVE = 0x0002
_SWP_NOACTIVATE = 0x0010

_user32 = ctypes.WinDLL('user32', use_last_error=True)
_user32.GetWindowLongPtrW.restype = ctypes.c_ssize_t
_user32.GetWindowLongPtrW.argtypes = [ctypes.c_void_p, ctypes.c_int]
_user32.SetWindowLongPtrW.restype = ctypes.c_ssize_t
_user32.SetWindowLongPtrW.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_ssize_t]
_user32.SetWindowPos.argtypes = [
    ctypes.c_void_p, ctypes.c_void_p,
    ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_uint,
]
_user32.ShowWindow.argtypes = [ctypes.c_void_p, ctypes.c_int]

_HWND_TOPMOST = ctypes.c_void_p(-1)

_lock = threading.Lock()
_seq = 0
_shown = 0
_title = ''
_dark = True
_form = None
_timer = None
_paint_handler = None


def ghost_hwnd():
    """Окно плашки, чтобы попадание курсора не путало его с окном редактора."""
    if _form is None:
        return 0
    try:
        return int(_form.Handle.ToInt64())
    except Exception:
        return 0


def prewarm():
    """Создать окно заранее, чтобы первая вкладка не ждала его появления."""
    try:
        _ui(_ensure)
    except Exception:
        _log.warning('Плашка вкладки не подготовилась', exc_info=True)


def show(title, dark):
    """Показать плашку и вернуть её номер. Следующий показ сменяет предыдущий."""
    global _seq, _shown, _title, _dark
    with _lock:
        _seq += 1
        token = _seq
        _shown = token
        _title = '' if title is None else str(title)
        _dark = bool(dark)
    if not _ui(_sync):
        with _lock:
            if _shown == token:
                _shown = 0
        return 0
    return token


def hide(token):
    """Скрыть плашку, только если на экране всё ещё именно этот показ."""
    global _shown
    try:
        token = int(token)
    except (TypeError, ValueError):
        return
    if token <= 0:
        return
    with _lock:
        if token != _shown:
            return
        _shown = 0
    _ui(_sync)


def _ui(action):
    """Выполнить действие на потоке интерфейса. False — живого окна редактора нет."""
    from webview.platforms.winforms import BrowserView

    host = None
    for form in list(BrowserView.instances.values()):
        try:
            if not form.IsDisposed and form.IsHandleCreated:
                host = form
                break
        except Exception:
            continue
    if host is None:
        return False
    try:
        if host.InvokeRequired:
            from System import Action
            host.Invoke(Action(action))
        else:
            action()
    except Exception:
        _log.warning('Плашка вкладки не дошла до окна', exc_info=True)
        return False
    return True


def _ensure():
    global _form, _timer, _paint_handler
    if _form is not None:
        return
    from System.Drawing import Font
    from System.Windows.Forms import (
        AutoScaleMode, Form, FormBorderStyle, FormStartPosition, PaintEventHandler, Timer,
    )

    form = Form()
    form.AutoScaleMode = getattr(AutoScaleMode, 'None')
    form.FormBorderStyle = getattr(FormBorderStyle, 'None')
    form.ShowInTaskbar = False
    form.StartPosition = FormStartPosition.Manual
    form.TopMost = True
    form.ControlBox = False
    form.Font = Font('Segoe UI', 9)

    def paint(sender, event):
        _paint(sender, event)

    _paint_handler = PaintEventHandler(paint)
    form.Paint += _paint_handler

    # Handle до стилей, иначе окно пересоздастся и флаги пропадут.
    hwnd = int(form.Handle.ToInt64())
    # Слоистое окно и рисуется, и пропускает мышь. Без слоя окно для кликов
    # просто не появляется.
    form.Opacity = 0.99
    _click_through(hwnd)

    timer = Timer()
    timer.Interval = 16
    timer.Tick += _on_tick

    _form = form
    _timer = timer


def _sync():
    try:
        _ensure()
        with _lock:
            visible = _shown != 0
        if not visible:
            _hide_now()
            return
        _apply_look()
        _place()
        _show_now()
        if _timer is not None and not _timer.Enabled:
            _timer.Start()
    except Exception:
        _log.warning('Плашка вкладки не показалась', exc_info=True)


def _px(value):
    # Размер в тех же пикселях, что и страница, иначе плашка сжимается и текст обрезается.
    try:
        scale = float(_form.DeviceDpi) / 96.0
    except Exception:
        scale = 1.0
    if scale < 1:
        scale = 1.0
    return max(1, int(round(value * scale)))


def _apply_look():
    from System.Drawing import Color

    with _lock:
        dark = _dark
    if dark:
        background = Color.FromArgb(37, 37, 38)
    else:
        background = Color.FromArgb(255, 255, 255)
    width = _px(220)
    height = _px(28)
    _form.BackColor = background
    hwnd = int(_form.Handle.ToInt64())
    _user32.SetWindowPos(
        hwnd, _HWND_TOPMOST, 0, 0, width, height,
        _SWP_NOMOVE | _SWP_NOACTIVATE,
    )
    _form.Invalidate()


def _paint(sender, event):
    from System.Drawing import Color, Pen, Rectangle
    from System.Windows.Forms import TextFormatFlags, TextRenderer

    # Текст рисуется здесь: у окна, которое пропускает мышь, дочерние подписи не появляются.
    with _lock:
        dark = _dark
        title = _title
    if dark:
        foreground = Color.FromArgb(212, 212, 212)
    else:
        foreground = Color.FromArgb(30, 30, 30)
    accent = Color.FromArgb(76, 154, 255)
    flags = (
        TextFormatFlags.EndEllipsis | TextFormatFlags.VerticalCenter
        | TextFormatFlags.Left | TextFormatFlags.NoPrefix
    )
    pad = _px(10)
    rect = Rectangle(pad, 0, max(1, sender.Width - pad * 2), sender.Height)
    TextRenderer.DrawText(event.Graphics, title or '', sender.Font, rect, foreground, flags)
    pen = Pen(accent, 1)
    try:
        event.Graphics.DrawRectangle(pen, Rectangle(0, 0, sender.Width - 1, sender.Height - 1))
    finally:
        pen.Dispose()


def _on_tick(sender, args):
    with _lock:
        visible = _shown != 0
    if not visible or _form is None:
        _hide_now()
        return
    try:
        _place()
    except Exception:
        _log.warning('Плашка вкладки не сдвинулась', exc_info=True)


def _place():
    from System.Windows.Forms import Cursor

    point = Cursor.Position
    try:
        gap = max(6, int(round(6 * _form.DeviceDpi / 96.0)))
    except Exception:
        gap = 8
    x = int(point.X) - _form.Width // 2
    y = int(point.Y) + gap
    hwnd = int(_form.Handle.ToInt64())
    _user32.SetWindowPos(
        hwnd, _HWND_TOPMOST, x, y, 0, 0,
        _SWP_NOSIZE | _SWP_NOACTIVATE,
    )
    _form.Invalidate()


def _show_now():
    hwnd = int(_form.Handle.ToInt64())
    _click_through(hwnd)
    _user32.ShowWindow(hwnd, _SW_SHOWNOACTIVATE)


def _hide_now():
    if _timer is not None and _timer.Enabled:
        _timer.Stop()
    if _form is None:
        return
    hwnd = int(_form.Handle.ToInt64())
    _user32.ShowWindow(hwnd, _SW_HIDE)


def _click_through(hwnd):
    # Плашка не забирает мышь и не становится активным окном.
    style = _user32.GetWindowLongPtrW(hwnd, _GWL_EXSTYLE)
    style |= (
        _WS_EX_LAYERED | _WS_EX_TRANSPARENT | _WS_EX_TOOLWINDOW
        | _WS_EX_NOACTIVATE | _WS_EX_TOPMOST
    )
    _user32.SetWindowLongPtrW(hwnd, _GWL_EXSTYLE, style)
