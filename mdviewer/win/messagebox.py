"""Сообщения Windows с заголовком и значком вместо alert() страницы.

У alert() в WebView2 пустой заголовок и нет значка: непонятно, ошибка это
или просто сообщение. MessageBoxW показывает «MD Viewer — Ошибка» и красный крестик.
"""
import ctypes

APP_NAME = 'MD Viewer'

_MB_OK = 0x0
_MB_ICONERROR = 0x10
_MB_ICONWARNING = 0x30
_MB_ICONINFORMATION = 0x40
_MB_SETFOREGROUND = 0x10000
_MB_TOPMOST = 0x40000

# kind → (подпись в заголовке, значок)
KINDS = {
    'error': ('Ошибка', _MB_ICONERROR),
    'warning': ('Предупреждение', _MB_ICONWARNING),
    'info': ('Сообщение', _MB_ICONINFORMATION),
}


def title_for(kind):
    label, _ = KINDS.get(kind, KINDS['error'])
    return f'{APP_NAME} — {label}'


def flags_for(kind, owner):
    _, icon = KINDS.get(kind, KINDS['error'])
    flags = _MB_OK | icon | _MB_SETFOREGROUND
    # Без окна-владельца сообщение может спрятаться за программой.
    if not owner:
        flags |= _MB_TOPMOST
    return flags


def show(message, kind='error', owner=None):
    """Показать сообщение и ждать «ОК». owner — HWND окна: пока сообщение открыто,
    окно недоступно, как с alert()."""
    ctypes.windll.user32.MessageBoxW(
        owner or None, str(message), title_for(kind), flags_for(kind, owner),
    )
