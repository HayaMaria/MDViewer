import logging
import os
import wsgiref.simple_server

import bottle
import webview

from mdviewer import APP_TITLE, UNTITLED
from mdviewer.api import Api
from mdviewer.paths import ICON_PATH, INDEX_HTML
from mdviewer.state import state
from mdviewer.win.associate import get_startup_file_path, register_file_associations


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
    webview.start(debug=True)


if __name__ == '__main__':
    main()
