import ctypes
import ctypes.wintypes

DWMWA_USE_IMMERSIVE_DARK_MODE = 20

# dwmapi.dll — часть Windows 10/11
_dwmapi = ctypes.windll.dwmapi


def set_titlebar_theme(window, dark: bool):
    """
    Установить тёмный/светлый заголовок окна через WinAPI DwmSetWindowAttribute.

    Аргументы:
        window: объект окна pywebview (webview.active_window() или результат webview.create_window)
        dark: True — тёмный заголовок, False — светлый

    Требуется Windows 10 1809 (build 17763) или новее.
    Если API недоступен, ошибка игнорируется.
    """
    try:
        hwnd = _resolve_hwnd(window)
        if hwnd is None or hwnd == 0:
            return

        value = ctypes.c_int(1 if dark else 0)
        _dwmapi.DwmSetWindowAttribute(
            ctypes.wintypes.HWND(hwnd),
            DWMWA_USE_IMMERSIVE_DARK_MODE,
            ctypes.byref(value),
            ctypes.sizeof(value),
        )
    except Exception:
        # Старые версии Windows (до 1809) или DwmApi недоступен — пропускаем
        pass


def _resolve_hwnd(window):
    """
    Извлечь HWND из объекта окна pywebview.

    Возвращает HWND как int или None.
    """
    # Способ 1: window.native — для Edge Chromium это HWND (int)
    if hasattr(window, 'native') and window.native is not None:
        native = window.native
        if isinstance(native, int):
            return native
        try:
            return int(native)
        except (TypeError, ValueError):
            pass

    # Способ 2: найти окно по заголовку (резервный вариант)
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