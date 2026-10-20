"""Меню WebView2: в редакторе своё, остальное — системное без лишнего.

Системное меню не красится в тему приложения и добавляет свои варианты
орфографии плюс «Направление письма». В редакторе его закрываем и показываем
меню страницы. Голосовой ввод остаётся пунктом этого меню (Win+H).
«Проверить» — инспектор: debug включает его вместе с Tab, окно инструментов
при этом открываться не должно.
"""
import ctypes
import logging

from ..config import load_config
from ..state import state

_log = logging.getLogger(__name__)
# Делегаты WinForms нельзя отпускать: pythonnet их иначе соберёт.
_menu_handlers = {}
_dark = True

_INSPECT_LABELS = {
    'проверить',
    'inspect',
    'инспектировать',
}
# Пункты браузера, которые дублируют нашу орфографию или ничего не делают
# в русском и английском тексте.
_DROP_NAME_PARTS = (
    'inspect',
    'spellcheck',
    'spellsuggestion',
    'addtodictionary',
    'writingdirection',
)
_DROP_LABELS = {
    'проверить',
    'inspect',
    'инспектировать',
    'направление письма',
    'writing direction',
}


def configure(dark=None):
    """Выключить инспектор и запомнить тему. Повторный вызов только меняет тему."""
    global _dark
    window = state.window
    native = getattr(window, 'native', None) if window is not None else None
    control = getattr(native, 'webview', None) if native is not None else None
    if control is None:
        return
    if dark is None:
        dark = load_config().get('theme', 'dark') != 'light'
    _dark = bool(dark)

    def attach():
        core = control.CoreWebView2
        if core is None:
            return
        try:
            core.Settings.AreDevToolsEnabled = False
        except Exception:
            _log.warning('Не удалось выключить инспектор', exc_info=True)
        _apply_scheme(core, _dark)
        key = id(core)
        if key in _menu_handlers:
            return

        def on_menu(sender, args):
            _on_context_menu(control, sender, args)

        core.ContextMenuRequested += on_menu
        _menu_handlers[key] = on_menu

    _ui(control, attach)


def start_voice_typing():
    """Системный голосовой ввод. Тот же Win+H, что был пунктом меню WebView2."""
    user32 = ctypes.windll.user32
    key_up = 0x0002
    win, letter = 0x5B, 0x48
    user32.keybd_event(win, 0, 0, 0)
    user32.keybd_event(letter, 0, 0, 0)
    user32.keybd_event(letter, 0, key_up, 0)
    user32.keybd_event(win, 0, key_up, 0)


def _apply_scheme(core, dark):
    try:
        from Microsoft.Web.WebView2.Core import CoreWebView2PreferredColorScheme

        core.Profile.PreferredColorScheme = (
            CoreWebView2PreferredColorScheme.Dark
            if dark else CoreWebView2PreferredColorScheme.Light
        )
    except Exception:
        _log.warning('Не удалось покрасить системное меню', exc_info=True)


def _on_context_menu(control, sender, args):
    _remove_browser_extras(args)
    try:
        deferral = args.GetDeferral()
    except Exception:
        _log.warning('Меню не дождалось редактора', exc_info=True)
        return
    point = args.Location
    x, y = int(point.X), int(point.Y)
    script = '(window.editorContextMenu?window.editorContextMenu(%d,%d):false)' % (x, y)
    try:
        task = sender.ExecuteScriptAsync(script)
    except Exception:
        _log.warning('Не удалось спросить редактор о меню', exc_info=True)
        deferral.Complete()
        return

    def done(completed):
        def apply():
            handled = False
            try:
                handled = _parse_flag(completed.Result)
            except Exception:
                _log.warning('Редактор не ответил про меню', exc_info=True)
            if handled:
                try:
                    args.Handled = True
                except Exception:
                    _log.warning('Системное меню не закрылось', exc_info=True)
            try:
                deferral.Complete()
            except Exception:
                _log.warning('Меню не закрыло ожидание', exc_info=True)

        try:
            _ui(control, apply)
        except Exception:
            _log.warning('Меню редактора не собралось', exc_info=True)
            try:
                deferral.Complete()
            except Exception:
                pass

    try:
        from System import Action
        from System.Threading.Tasks import Task

        task.ContinueWith(Action[Task](done))
    except Exception:
        _log.warning('Не удалось дождаться ответа редактора', exc_info=True)
        deferral.Complete()


def _parse_flag(raw):
    return str(raw or '').strip().strip('"') == 'true'


def _remove_browser_extras(args):
    items = args.MenuItems
    index = items.Count - 1
    while index >= 0:
        if _should_drop(items[index]):
            items.RemoveAt(index)
        index -= 1
    _tidy_separators(items)


def _should_drop(item):
    name = str(item.Name or '').casefold().replace('_', '')
    label = str(item.Label or '').strip().casefold()
    if any(part in name for part in _DROP_NAME_PARTS):
        return True
    if label in _DROP_LABELS or label in _INSPECT_LABELS:
        return True
    return label.startswith('просмотреть код')


def _tidy_separators(items):
    index = items.Count - 1
    while index >= 0:
        drop = False
        if _is_separator(items[index]):
            at_edge = index == 0 or index == items.Count - 1
            doubled = index > 0 and _is_separator(items[index - 1])
            drop = at_edge or doubled
        if drop:
            items.RemoveAt(index)
        index -= 1


def _is_separator(item):
    return 'Separator' in str(item.Kind)


def _ui(control, action):
    from System import Action

    if control.InvokeRequired:
        control.Invoke(Action(action))
    else:
        action()
