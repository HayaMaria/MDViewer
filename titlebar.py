import ctypes
import ctypes.wintypes

# ===== Константы DwmSetWindowAttribute =====
DWMWA_USE_IMMERSIVE_DARK_MODE = 20  # Win10 1809+ — вкл/выкл тёмный заголовок
DWMWA_CAPTION_COLOR = 35            # Win11 22000+ — кастомный цвет фона заголовка (BGRA)
DWMWA_TEXT_COLOR = 36               # Win11 22000+ — кастомный цвет текста заголовка (BGRA)

# Цвета в формате BGRA (0xBBGGRRAA)
# Тулбар: тёмная тема #252526 → BGRA 0x262525FF
# Тулбар: светлая тема #f3f3f3 → BGRA 0xF3F3F3FF
COLOR_TOOLBAR_DARK  = 0x262525FF
COLOR_TOOLBAR_LIGHT = 0xF3F3F3FF
# Текст: тёмная тема #cccccc → BGRA 0xCCCCCCFF
# Текст: светлая тема #1e1e1e → BGRA 0x1E1E1EFF
COLOR_TEXT_DARK  = 0xCCCCCCFF
COLOR_TEXT_LIGHT = 0x1E1E1EFF

_dwmapi = ctypes.windll.dwmapi


def set_titlebar_theme(window, dark: bool):
    """
    Установить цвет заголовка окна в тон тулбара приложения.

    На Win11 (22000+) — кастомный цвет фона и текста.
    На Win10 (1809+) — системный тёмный режим (чёрный/белый).
    На старых версиях — игнорируется.
    """
    try:
        hwnd = _resolve_hwnd(window)
        if hwnd is None or hwnd == 0:
            return

        if dark:
            bg_color = COLOR_TOOLBAR_DARK
            text_color = COLOR_TEXT_DARK
        else:
            bg_color = COLOR_TOOLBAR_LIGHT
            text_color = COLOR_TEXT_LIGHT

        # Пробуем кастомный цвет (Win11 22000+)
        _try_set_attribute(hwnd, DWMWA_CAPTION_COLOR, bg_color)
        _try_set_attribute(hwnd, DWMWA_TEXT_COLOR, text_color)

        # На Win10 — хотя бы тёмный режим включим (на Win11 тоже сработает)
        value = ctypes.c_int(1 if dark else 0)
        _dwmapi.DwmSetWindowAttribute(
            ctypes.wintypes.HWND(hwnd),
            DWMWA_USE_IMMERSIVE_DARK_MODE,
            ctypes.byref(value),
            ctypes.sizeof(value),
        )
    except Exception:
        pass


def _try_set_attribute(hwnd, attribute, color_int):
    """Попробовать установить DwmSetWindowAttribute с uint32 значением."""
    try:
        val = ctypes.c_uint32(color_int)
        _dwmapi.DwmSetWindowAttribute(
            ctypes.wintypes.HWND(hwnd),
            attribute,
            ctypes.byref(val),
            ctypes.sizeof(val),
        )
    except Exception:
        pass


def _resolve_hwnd(window):
    """Извлечь HWND из объекта окна pywebview. Возвращает HWND как int или None."""
    # Способ 1: window.native — для Edge Chromium это HWND (int)
    if hasattr(window, 'native') and window.native is not None:
        native = window.native
        if isinstance(native, int):
            return native
        try:
            return int(native)
        except (TypeError, ValueError):
            pass

    # Способ 2: найти окно по заголовку
    title = getattr(window, 'title', None)
    if title:
        try:
            user32 = ctypes.windll.user32
            hwnd = user32.FindWindowW(None, title)
            if hwnd:
                return hwnd
        except Exception:
            pass

    # Способ 3: активное окно переднего плана
    try:
        user32 = ctypes.windll.user32
        return user32.GetForegroundWindow()
    except Exception:
        return None