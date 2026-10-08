import logging
import os
import wsgiref.simple_server

import bottle
import webview

from mdviewer.paths import ICON_PATH
from mdviewer.state import state
from mdviewer.win.associate import get_startup_file_path, register_file_associations
from mdviewer.drag_ghost import prewarm
from mdviewer.windows import create_editor_window, loaded_callbacks


# Ссылка на обработчик, иначе pythonnet соберёт его сборщиком мусора.
_accelerator_handlers = {}


def _webview_controller(control):
    # У WinForms WebView2 нет публичного CoreWebView2Controller (SDK 1.0.3856).
    # Контроллер хранится в приватном поле и нужен для AcceleratorKeyPressed.
    from System.Reflection import BindingFlags

    field = control.GetType().GetField(
        '_coreWebView2Controller',
        BindingFlags.Instance | BindingFlags.NonPublic,
    )
    if field is None:
        return None
    return field.GetValue(control)


def _keep_ctrl_u_for_editor():
    # debug=True включает браузерные сочетания WebView, и Ctrl+U открывает исходный код
    # страницы, не доходя до редактора. Отменяем только это сочетание и вызываем подчёркивание.
    # loaded срабатывает не в UI-потоке, а контроллер WebView2 можно трогать только оттуда.
    slot = state.active_slot()
    key = slot.id if slot is not None else id(state.window)
    if key in _accelerator_handlers:
        return
    _accelerator_handlers[key] = True
    native = getattr(state.window, 'native', None)
    control = getattr(native, 'webview', None) if native else None
    if control is None:
        return

    def attach():
        try:
            controller = _webview_controller(control)
            from System.Windows.Forms import Control, Keys
        except Exception:
            logging.getLogger(__name__).warning('Ctrl+U: нет CoreWebView2Controller', exc_info=True)
            return
        if controller is None:
            logging.getLogger(__name__).warning('Ctrl+U: нет CoreWebView2Controller')
            return

        def on_accelerator(sender, args):
            try:
                if int(args.KeyEventKind) != 0 or int(args.VirtualKey) != 0x55:
                    return
                mods = int(Control.ModifierKeys)
                if not (mods & int(Keys.Control)) or (mods & int(Keys.Alt)) or (mods & int(Keys.Shift)):
                    return
                args.Handled = True
                control.CoreWebView2.ExecuteScriptAsync(
                    'if(!window.__htmlMode&&window.toggleUnderline)window.toggleUnderline()'
                )
            except Exception:
                logging.getLogger(__name__).warning(
                    'Ctrl+U: не удалось вставить подчёркивание', exc_info=True
                )

        _accelerator_handlers[key] = on_accelerator
        controller.AcceleratorKeyPressed += on_accelerator

    try:
        from System import Action

        if control.InvokeRequired:
            control.Invoke(Action(attach))
        else:
            attach()
    except Exception:
        logging.getLogger(__name__).warning('Ctrl+U: нет CoreWebView2Controller', exc_info=True)


def silence_http_server_logs():
    # Bottle и wsgiref пишут прямо в stderr, а не через logging
    logging.getLogger('bottle').setLevel(logging.WARNING)
    wsgiref.simple_server.WSGIRequestHandler.log_message = lambda self, fmt, *args: None
    bottle._stderr = lambda *args: None


def main():
    # debug=True нужен, чтобы Tab/Shift+Tab доходили до JS (AreBrowserAcceleratorKeysEnabled),
    # но DevTools при этом открываться не должны
    webview.settings['OPEN_DEVTOOLS_IN_DEBUG'] = False
    # Иначе при debug=True pywebview поднимет уровень своих логов до DEBUG
    os.environ['PYWEBVIEW_LOG'] = 'WARNING'
    silence_http_server_logs()

    try:
        register_file_associations()
    except OSError:
        pass

    if ICON_PATH.is_file():
        webview._state['icon'] = str(ICON_PATH)

    loaded_callbacks.append(_keep_ctrl_u_for_editor)
    loaded_callbacks.append(prewarm)
    slot = create_editor_window()
    slot.startup_file = get_startup_file_path()
    webview.start(debug=True)


if __name__ == '__main__':
    main()
