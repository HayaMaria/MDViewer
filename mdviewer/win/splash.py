"""Заглушка поверх клиента окна, пока страница ещё не загрузилась.

WebView2 не даёт нарисовать обычный контрол поверх себя, поэтому это
отдельное окно без рамки ровно по клиентской области. Оно появляется
вместе с редактором: сплошной фон темы, иконка по центру и полоска под ней.
Полоска заполняется по среднему времени прошлых запусков.
"""
import ctypes
import json
import logging
import math
import os
import time

from .. import durable
from ..config import CONFIG_DIR
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

# Первые запуски, пока своих замеров ещё нет.
_FALLBACK_MS = 1800
_HISTORY_KEEP = 5
_HISTORY_PATH = os.path.join(CONFIG_DIR, 'splash-load.json')
# Зависший старт не должен навсегда растянуть следующие полоски.
_MAX_SAMPLE_MS = 12000
# Короткий добор до конца, когда документ готов раньше оценки.
_FINISH_S = 0.18
# До этой доли оценки полоска идёт пропорционально времени.
# К концу оценки остаётся хвост, чтобы полоска не замирала на ста процентах.
_LINEAR_PART = 0.85
_AT_ESTIMATE = 0.92
_CREEP_LIMIT = 0.985


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
    """Довести полоску до конца и убрать заглушку. Документ уже нарисован под ней."""
    entry = _entries.get(getattr(window, 'uid', None))
    if entry is None:
        return
    editor = entry['editor']

    def start_finish():
        try:
            _start_finish(entry)
        except Exception:
            _log.warning('Заглушка запуска не снялась', exc_info=True)

    try:
        from System import Action

        if editor is not None and not editor.IsDisposed and editor.InvokeRequired:
            editor.BeginInvoke(Action(start_finish))
        else:
            start_finish()
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
    try:
        from System.Windows.Forms import ControlStyles

        splash.SetStyle(
            ControlStyles.OptimizedDoubleBuffer
            | ControlStyles.AllPaintingInWmPaint
            | ControlStyles.UserPaint,
            True,
        )
        splash.UpdateStyles()
    except Exception:
        _log.warning('Двойная буферизация заглушки недоступна', exc_info=True)
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
        'theme': theme,
        'estimate_ms': _estimate_ms(),
        'uid': window.uid,
        'shown': False,
        'shown_at': None,
        'closing': False,
        'done': False,
        'bar_rect': None,
        'client_size': None,
        'timer': None,
        'paint': None,
        'tick': None,
    }

    def paint(sender, event):
        _paint(entry, event)

    def tick(sender, event):
        if _entries.get(window.uid) is not entry:
            return
        _follow(entry)
        if entry.get('closing') and time.perf_counter() >= entry.get('finish_until', 0):
            if entry.get('finishing_paint'):
                return
            entry['finishing_paint'] = True
            splash = entry.get('splash')
            try:
                if splash is not None and not splash.IsDisposed:
                    splash.Invalidate()
                    splash.Update()
            except Exception:
                _log.warning('Полоска запуска не дорисовалась', exc_info=True)
            _finish_now(entry)
            return
        try:
            _pump(entry)
        except Exception:
            _log.warning('Полоска запуска не сдвинулась', exc_info=True)

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
        size = (width, height)
        if entry.get('client_size') != size:
            entry['client_size'] = size
            splash.Invalidate()
        if not entry['shown']:
            entry['shown'] = True
            entry['shown_at'] = time.perf_counter()
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
    icon_x, icon_y, bar = _layout(entry)
    icon = entry['icon']
    if icon is not None:
        side = entry['side']
        graphics.InterpolationMode = InterpolationMode.HighQualityBicubic
        graphics.DrawImage(icon, Rectangle(icon_x, icon_y, side, side))
    try:
        fraction = _visible_fraction(entry, time.perf_counter())
        _draw_bar(graphics, entry['theme'], bar, fraction)
        entry['bar_rect'] = Rectangle(bar.X - 2, bar.Y - 2, bar.Width + 4, bar.Height + 4)
    except Exception:
        _log.warning('Полоска запуска не нарисовалась', exc_info=True)


def _layout(entry):
    from System.Drawing import Rectangle

    splash = entry['splash']
    width = int(splash.ClientSize.Width)
    height = int(splash.ClientSize.Height)
    side = entry['side'] if entry.get('icon') is not None else 0
    gap = _px(splash, 18) if side else 0
    bar_h = max(4, _px(splash, 6))
    bar_w = _px(splash, 168)
    if width > bar_h + 8:
        bar_w = min(bar_w, width - _px(splash, 48))
    bar_w = max(bar_w, bar_h)
    group = side + gap + bar_h
    icon_x = (width - side) // 2
    icon_y = max(0, (height - group) // 2)
    bar_x = (width - bar_w) // 2
    bar_y = icon_y + side + gap
    return icon_x, icon_y, Rectangle(bar_x, bar_y, bar_w, bar_h)


def _pump(entry):
    if not entry.get('shown') or entry.get('done'):
        return
    splash = entry['splash']
    if splash.IsDisposed:
        _finish_now(entry)
        return
    rect = entry.get('bar_rect')
    if rect is not None:
        splash.Invalidate(rect)
    else:
        splash.Invalidate()


def _start_finish(entry):
    if entry.get('done') or entry.get('closing'):
        return
    if _entries.get(entry.get('uid')) is not entry:
        return
    splash = entry.get('splash')
    shown_at = entry.get('shown_at')
    if splash is None or splash.IsDisposed or not entry.get('shown') or shown_at is None:
        _finish_now(entry)
        return
    now = time.perf_counter()
    elapsed_ms = (now - shown_at) * 1000
    entry['duration_ms'] = int(round(elapsed_ms))
    entry['finish_from'] = _load_fraction(elapsed_ms, entry['estimate_ms'])
    entry['finish_started'] = now
    entry['finish_until'] = now + _FINISH_S
    entry['closing'] = True
    splash.Invalidate()


def _finish_now(entry):
    if entry.get('done'):
        return
    entry['done'] = True
    uid = entry.get('uid')
    if _entries.get(uid) is entry:
        _entries.pop(uid, None)
    duration = entry.get('duration_ms')
    try:
        _hide(entry)
    finally:
        if duration:
            try:
                _remember_load(duration)
            except Exception:
                _log.warning('Не удалось запомнить время запуска', exc_info=True)


def _visible_fraction(entry, now):
    if entry.get('closing'):
        return _finish_fraction(entry, now)
    shown_at = entry.get('shown_at')
    if shown_at is None:
        return 0.0
    return _load_fraction((now - shown_at) * 1000, entry['estimate_ms'])


def _finish_fraction(entry, now):
    started = entry.get('finish_started', now)
    span = entry.get('finish_until', now) - started
    if span <= 0:
        return 1.0
    t = (now - started) / span
    if t >= 1:
        return 1.0
    if t < 0:
        t = 0.0
    t = t * t * (3 - 2 * t)
    origin = entry.get('finish_from', 0.0)
    return origin + (1.0 - origin) * t


def _load_fraction(elapsed_ms, estimate_ms):
    """Доля полоски: пропорционально оценке, с хвостом если запуск затянулся."""
    estimate = estimate_ms if estimate_ms and estimate_ms > 0 else _FALLBACK_MS
    if elapsed_ms <= 0:
        return 0.0
    linear_until = estimate * _LINEAR_PART
    if elapsed_ms < linear_until:
        return elapsed_ms / estimate
    if elapsed_ms <= estimate:
        t = (elapsed_ms - linear_until) / (estimate - linear_until)
        return _LINEAR_PART + t * (_AT_ESTIMATE - _LINEAR_PART)
    extra = elapsed_ms - estimate
    tau = max(estimate * 0.8, 700)
    tail = 1 - math.exp(-extra / tau)
    return _AT_ESTIMATE + (_CREEP_LIMIT - _AT_ESTIMATE) * tail


def _estimate_ms():
    samples = _load_samples()
    if not samples:
        return _FALLBACK_MS
    return int(round(sum(samples) / len(samples)))


def _load_samples():
    try:
        status, raw = durable.parse_json(_HISTORY_PATH)
    except Exception:
        _log.warning('Не удалось прочитать время запусков', exc_info=True)
        return []
    if status != 'ok' or not isinstance(raw, list):
        return []
    samples = []
    for item in raw:
        try:
            value = int(item)
        except (TypeError, ValueError):
            continue
        if 50 <= value <= _MAX_SAMPLE_MS:
            samples.append(value)
    return samples[-_HISTORY_KEEP:]


def _remember_load(duration_ms):
    value = int(duration_ms)
    if value < 50:
        return
    if value > _MAX_SAMPLE_MS:
        value = _MAX_SAMPLE_MS
    samples = _load_samples()
    samples.append(value)
    durable.write_text(
        _HISTORY_PATH,
        json.dumps(samples[-_HISTORY_KEEP:]),
        newline='\n',
    )


def _draw_bar(graphics, theme, rect, fraction):
    from System.Drawing import Color, Rectangle, SolidBrush
    from System.Drawing.Drawing2D import GraphicsPath, SmoothingMode

    if theme == 'light':
        track = Color.FromArgb(220, 220, 220)
    else:
        track = Color.FromArgb(68, 68, 68)
    # Тот же зелёный, что фон иконки запуска.
    fill = Color.FromArgb(2, 157, 52)
    path = _capsule(rect)
    track_brush = SolidBrush(track)
    fill_brush = SolidBrush(fill)
    state = graphics.Save()
    try:
        graphics.SmoothingMode = SmoothingMode.AntiAlias
        graphics.FillPath(track_brush, path)
        if fraction > 0 and rect.Width > 0:
            width = int(round(rect.Width * min(fraction, 1.0)))
            width = min(rect.Width, max(1, width))
            graphics.SetClip(path)
            graphics.FillRectangle(
                fill_brush, Rectangle(rect.X, rect.Y, width, rect.Height),
            )
    finally:
        graphics.Restore(state)
        track_brush.Dispose()
        fill_brush.Dispose()
        path.Dispose()


def _capsule(rect):
    from System.Drawing.Drawing2D import GraphicsPath

    path = GraphicsPath()
    radius = min(rect.Width, rect.Height) / 2.0
    if radius < 1:
        path.AddRectangle(rect)
        return path
    diameter = radius * 2
    x = float(rect.X)
    y = float(rect.Y)
    width = float(rect.Width)
    height = float(rect.Height)
    path.AddArc(x, y, diameter, diameter, 180, 90)
    path.AddArc(x + width - diameter, y, diameter, diameter, 270, 90)
    path.AddArc(x + width - diameter, y + height - diameter, diameter, diameter, 0, 90)
    path.AddArc(x, y + height - diameter, diameter, diameter, 90, 90)
    path.CloseFigure()
    return path


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
