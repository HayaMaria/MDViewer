import webview,os,logging
import config,menu
from api import Api
from titlebar import set_titlebar_theme

assets_dir = os.path.join(os.path.dirname(__file__),"assets")

if __name__ == '__main__':
    # Отключаем автооткрытие DevTools (иначе при debug=True они будут открываться)
    webview.settings['OPEN_DEVTOOLS_IN_DEBUG'] = False

    # debug=True нужен, чтобы Tab/Shift+Tab работали (AreBrowserAcceleratorKeysEnabled).
    # Ставим PYWEBVIEW_LOG=WARNING, чтобы pywebview НЕ перезаписал уровень логов на DEBUG
    os.environ['PYWEBVIEW_LOG'] = 'WARNING'

    # Подавляем логи HTTP-сервера Bottle (он пишет напрямую в stderr, а не через logging)
    logging.getLogger('bottle').setLevel(logging.WARNING)
    import wsgiref.simple_server as _wsgiref_srv
    _wsgiref_srv.WSGIRequestHandler.log_message = lambda self, fmt, *args: None
    import bottle as _bottle
    _bottle._stderr = lambda *args: None

    assets_dir = os.path.join(os.path.dirname(__file__), 'assets')
    index_html = os.path.join(assets_dir, 'index.html')

    api = Api()
    # Устанавливаем глобальную ссылку для обработчиков меню
    globals()['api'] = api
    menu.api = api

    # Устанавливаем иконку окна
    icon_path = os.path.join(os.path.dirname(__file__), 'icon.ico')
    if os.path.isfile(icon_path):
        webview._state['icon'] = icon_path

    window = webview.create_window(
        title='MD Viewer — Новый документ',
        url=index_html,
        js_api=api,
        width=1200,
        height=800,
        resizable=True,
    )

    # startup-функция: применяем тему к заголовку окна после создания GUI
    def _apply_startup_theme():
        """Применить сохранённую тему к заголовку окна при запуске."""
        is_dark = config.load_config().get('theme', 'dark') == 'dark'
        set_titlebar_theme(window, is_dark)

    webview.start(
        func=_apply_startup_theme,
        debug=True,          # Включаем debug → AreBrowserAcceleratorKeysEnabled = True → Tab доходит до JS
    )