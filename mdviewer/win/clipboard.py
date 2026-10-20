"""Текст из буфера обмена Windows.

Страница приложения открывается с http://127.0.0.1 и нового порта на каждый
запуск. Если читать буфер через navigator.clipboard, Edge снова спрашивает,
можно ли этому сайту смотреть скопированный текст.
"""
import ctypes
import logging

_log = logging.getLogger(__name__)
# Делегат события нельзя отпускать: pythonnet иначе его соберёт.
_permission_handlers = {}

_CF_UNICODETEXT = 13

_user32 = ctypes.WinDLL('user32', use_last_error=True)
_kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)

_user32.OpenClipboard.argtypes = [ctypes.c_void_p]
_user32.OpenClipboard.restype = ctypes.c_int
_user32.GetClipboardData.argtypes = [ctypes.c_uint]
_user32.GetClipboardData.restype = ctypes.c_void_p
_user32.CloseClipboard.argtypes = []
_user32.CloseClipboard.restype = ctypes.c_int
_kernel32.GlobalLock.argtypes = [ctypes.c_void_p]
_kernel32.GlobalLock.restype = ctypes.c_void_p
_kernel32.GlobalUnlock.argtypes = [ctypes.c_void_p]
_kernel32.GlobalUnlock.restype = ctypes.c_int


def read_text():
    """Обычный текст из буфера. Пустая строка — буфер пуст или занят."""
    if not _user32.OpenClipboard(None):
        return ''
    try:
        handle = _user32.GetClipboardData(_CF_UNICODETEXT)
        if not handle:
            return ''
        pointer = _kernel32.GlobalLock(handle)
        if not pointer:
            return ''
        try:
            text = ctypes.wstring_at(pointer)
        finally:
            _kernel32.GlobalUnlock(handle)
    finally:
        _user32.CloseClipboard()
    return text.replace('\r\n', '\n').replace('\r', '\n')


def allow_page_read():
    """Не показывать запрос буфера для нашей страницы.

    Срабатывает, только если чтение начал сам пользователь и адрес — локальный
    сервер приложения. Чужой кадр (просмотр HTML) по-прежнему спрашивает сам.
    """
    from ..state import state

    window = state.window
    native = getattr(window, 'native', None) if window is not None else None
    control = getattr(native, 'webview', None) if native is not None else None
    if control is None:
        return

    def attach():
        core = control.CoreWebView2
        if core is None:
            return
        key = id(core)
        if key in _permission_handlers:
            return
        from Microsoft.Web.WebView2.Core import (
            CoreWebView2PermissionKind,
            CoreWebView2PermissionState,
        )

        clipboard_read = int(CoreWebView2PermissionKind.ClipboardRead)
        allow = CoreWebView2PermissionState.Allow

        def on_permission(sender, args):
            try:
                if int(args.PermissionKind) != clipboard_read or not args.IsUserInitiated:
                    return
                uri = str(args.Uri or '')
                if '127.0.0.1' not in uri and 'localhost' not in uri:
                    return
                args.State = allow
                args.Handled = True
            except Exception:
                _log.warning('Не удалось разрешить буфер обмена', exc_info=True)

        core.PermissionRequested += on_permission
        _permission_handlers[key] = on_permission

    try:
        from System import Action

        if control.InvokeRequired:
            control.Invoke(Action(attach))
        else:
            attach()
    except Exception:
        _log.warning('Не удалось подписаться на запрос буфера', exc_info=True)
