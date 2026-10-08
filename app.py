import logging
import os
import wsgiref.simple_server

import bottle
import webview

from mdviewer import APP_TITLE, UNTITLED
from mdviewer.api import Api
from mdviewer.documents import request_close
from mdviewer.paths import ICON_PATH, INDEX_HTML
from mdviewer.state import state
from mdviewer.win.associate import get_startup_file_path, register_file_associations


# Ссылка на обработчик, иначе pythonnet соберёт его сборщиком мусора.
_accelerator_handlers = []


def _keep_ctrl_u_for_editor():
    # debug=True включает браузерные сочетания WebView, и Ctrl+U открывает исходный код
    # страницы, не доходя до редактора. Отменяем только это сочетание и вызываем подчёркивание.
    if _accelerator_handlers:
        return
    native = getattr(state.window, 'native', None)
    control = getattr(native, 'webview', None) if native else None
    if control is None:
        return
    try:
        controller = control.CoreWebView2Controller
        from System.Windows.Forms import Control, Keys
    except Exception:
        logging.getLogger(__name__).warning('Ctrl+U: нет CoreWebView2Controller', exc_info=True)
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
            logging.getLogger(__name__).warning('Ctrl+U: не удалось вставить подчёркивание', exc_info=True)

    _accelerator_handlers.append(on_accelerator)
    controller.AcceleratorKeyPressed += on_accelerator


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

    state.startup_file = get_startup_file_path()
    try:
        register_file_associations()
    except OSError:
        pass

    if ICON_PATH.is_file():
        webview._state['icon'] = str(ICON_PATH)

    state.window = webview.create_window(
        title=f'{APP_TITLE} — {UNTITLED}',
        url=str(INDEX_HTML),
        js_api=Api(),
        width=1200,
        height=800,
        resizable=True,
    )
    # Крестик иначе закрывает окно раньше, чем страница успевает записать сессию
    state.window.events.closing += request_close
    state.window.events.loaded += _keep_ctrl_u_for_editor
    webview.start(debug=True)


if __name__ == '__main__':
    main()
