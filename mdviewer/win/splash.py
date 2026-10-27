"""Заглушка поверх клиента окна, пока страница ещё не загрузилась.

WebView2 не даёт нарисовать обычный контрол поверх себя, поэтому это
отдельное окно без рамки ровно по клиентской области. Оно появляется
вместе с редактором: сплошной фон темы и иконка по центру.
"""
import ctypes
import logging

from ..paths import SPLASH_ICON

_log = logging.getLogger(__name__)

# Фон совпадает с background_color окна и с --bg в preview.css.
_BG = {
    'dark': (30, 30, 30),
    'light': (255, 255, 255),
}

_SWP_NOACTIVATE = 0x0010
_SWP_SHOWWINDOW = 0x0040
_HWND_TOP = ctypes.c_void_p(0)

_user32 = ctypes.WinDLL('user32', use_last_error=True)
_user32.SetWindowPos.argtypes = [
    ctypes.c_void_p, ctypes.c_void_p,
    ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_uint,
]

# uid окна → состояние. Ссылки держим: pythonnet иначе соберёт форму и делегаты.
_entries = {}
# Сторона иконки в физических пикселях → Bitmap.
_icons = {}


def _ensure_winforms():
    import clr

    clr.AddReference('System.Drawing')
    clr.AddReference('System.Windows.Forms')


def attach(window, theme):
    """Начать следить за окном ещё до его показа. Вызов с потока интерфейса."""
    form = getattr(window, 'native', None)
    if form is None:
        return
    try:
        _attach(window, form, theme)
    except Exception:
        _log.warning('Заглушка запуска не показалась', exc_info=True)


def dismiss(window):
    """Убрать заглушку. Страница к этому моменту уже открыта под ней."""
    entry = _entries.pop(getattr(window, 'uid', None), None)
    if entry is None:
        return
    editor = entry['editor']

    def hide():
        try:
            _hide(entry)
        except Exception:
            _log.warning('Заглушка запуска не снялась', exc_info=True)

    try:
        from System import Action

        if editor is not None and not editor.IsDisposed and editor.InvokeRequired:
            editor.BeginInvoke(Action(hide))
        else:
            hide()
    except Exception:
        _log.warning('Заглушка запуска не снялась', exc_info=True)


def _attach(window, form, theme):
    _ensure_winforms()
    from System.Drawing import Color
    from System.Windows.Forms import (
        Form, FormBorderStyle, FormStartPosition, PaintEventHandler, Timer,
    )

    red, green, blue = _BG.get(theme, _BG['dark'])
    color = Color.FromArgb(red, green, blue)
    splash = Form()
    splash.FormBorderStyle = getattr(FormBorderStyle, 'None')
    splash.ShowInTaskbar = False
    splash.StartPosition = FormStartPosition.Manual
    splash.ControlBox = False
    splash.BackColor = color
    splash.Owner = form
    # Ручка до показа, чтобы двигать окно, не активируя его.
    splash.Handle.ToInt64()

    side = _px(form, 128)
    icon = _icon(side)
    entry = {
        'editor': form,
        'splash': splash,
        'color': color,
        'icon': icon,
        'side': side,
        'shown': False,
        'timer': None,
        'paint': None,
        'tick': None,
    }

    def paint(sender, event):
        _paint(entry, event)

    def tick(sender, event):
        if _entries.get(window.uid) is entry:
            _follow(entry)

    from System import EventHandler

    paint_handler = PaintEventHandler(paint)
    tick_handler = EventHandler(tick)
    splash.Paint += paint_handler
    entry['paint'] = paint_handler
    entry['tick'] = tick_handler

    timer = Timer()
    timer.Interval = 16
    timer.Tick += tick_handler
    entry['timer'] = timer
    _entries[window.uid] = entry
    timer.Start()


def _follow(entry):
    editor = entry['editor']
    splash = entry['splash']
    if editor.IsDisposed or splash.IsDisposed or not editor.Visible:
        return
    try:
        from System.Drawing import Point

        origin = editor.PointToScreen(Point(0, 0))
        width = int(editor.ClientSize.Width)
        height = int(editor.ClientSize.Height)
        if width < 1 or height < 1:
            return
        hwnd = int(splash.Handle.ToInt64())
        _user32.SetWindowPos(
            hwnd, _HWND_TOP,
            int(origin.X), int(origin.Y), width, height,
            _SWP_NOACTIVATE | _SWP_SHOWWINDOW,
        )
        if not entry['shown']:
            entry['shown'] = True
            splash.Invalidate()
    except Exception:
        _log.warning('Заглушка запуска не встала на окно', exc_info=True)


def _hide(entry):
    timer = entry.get('timer')
    if timer is not None:
        timer.Stop()
        timer.Dispose()
        entry['timer'] = None
    splash = entry.get('splash')
    if splash is not None and not splash.IsDisposed:
        splash.Hide()
        splash.Dispose()


def _paint(entry, event):
    from System.Drawing import Rectangle
    from System.Drawing.Drawing2D import InterpolationMode

    graphics = event.Graphics
    graphics.Clear(entry['color'])
    icon = entry['icon']
    if icon is None:
        return
    side = entry['side']
    splash = entry['splash']
    x = (int(splash.ClientSize.Width) - side) // 2
    y = (int(splash.ClientSize.Height) - side) // 2
    graphics.InterpolationMode = InterpolationMode.HighQualityBicubic
    graphics.DrawImage(icon, Rectangle(x, y, side, side))


def _px(form, value):
    try:
        scale = float(form.DeviceDpi) / 96.0
    except Exception:
        scale = 1.0
    if scale < 1:
        scale = 1.0
    return max(1, int(round(value * scale)))


def _icon(size):
    ready = _icons.get(size)
    if ready is not None:
        return ready
    if not SPLASH_ICON.is_file():
        return None

    _ensure_winforms()
    from System.Drawing import Bitmap, Graphics, Rectangle
    from System.Drawing.Drawing2D import InterpolationMode, PixelOffsetMode
    from System.IO import FileAccess, FileMode, FileStream

    stream = FileStream(str(SPLASH_ICON), FileMode.Open, FileAccess.Read)
    source = Bitmap(stream)
    try:
        image = Bitmap(size, size)
        graphics = Graphics.FromImage(image)
        try:
            graphics.InterpolationMode = InterpolationMode.HighQualityBicubic
            graphics.PixelOffsetMode = PixelOffsetMode.HighQuality
            graphics.DrawImage(source, Rectangle(0, 0, size, size))
        finally:
            graphics.Dispose()
    finally:
        source.Dispose()
        stream.Dispose()
    _icons[size] = image
    return image
