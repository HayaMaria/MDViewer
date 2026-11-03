import logging
import os
import sys
import wsgiref.simple_server

import bottle
import webview

from mdviewer import logs
from mdviewer.paths import ICON_PATH
from mdviewer.documents import open_from_another_launch
from mdviewer.state import state
from mdviewer.win import single_instance, webview2
from mdviewer.win.associate import get_startup_file_path, register_file_associations
from mdviewer.drag_ghost import prewarm
from mdviewer.filedrop import enable as enable_file_drop
from mdviewer.win.clipboard import allow_page_read
from mdviewer.win.contextmenu import configure as configure_context_menu
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


# Виртуальные коды клавиш Windows
_VK_U = 0x55
_VK_ZERO = (0x30, 0x60)       # 0 в основном ряду и на цифровой клавиатуре
_VK_PLUS = (0xBB, 0x6B)       # =/+ в основном ряду и + на цифровой клавиатуре
_VK_MINUS = (0xBD, 0x6D)      # - в основном ряду и на цифровой клавиатуре


def _shortcut_script(vk, shift):
    """JS для перехваченного сочетания с Ctrl или None, если сочетание не наше."""
    if vk == _VK_U and not shift:
        return 'if(!window.__htmlMode&&window.toggleUnderline)window.toggleUnderline()'
    # Ctrl+плюс/минус/0 вместо масштаба страницы меняют шрифт редактора.
    # Shift допускаем: на основном ряду «+» набирается как Shift+=.
    if vk in _VK_PLUS:
        return 'if(window.stepEditorFontSize)window.stepEditorFontSize(1)'
    if vk in _VK_MINUS:
        return 'if(window.stepEditorFontSize)window.stepEditorFontSize(-1)'
    if vk in _VK_ZERO and not shift:
        return 'if(window.stepEditorFontSize)window.stepEditorFontSize(0)'
    return None


def _hook_editor_shortcuts():
    # debug=True включает браузерные сочетания WebView: Ctrl+U открывает исходный код страницы,
    # Ctrl+плюс/минус/0 меняют масштаб. Перехватываем их до браузера и отдаём редактору.
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
            logging.getLogger(__name__).warning('Горячие клавиши: нет CoreWebView2Controller', exc_info=True)
            return
        if controller is None:
            logging.getLogger(__name__).warning('Горячие клавиши: нет CoreWebView2Controller')
            return

        def on_accelerator(sender, args):
            try:
                if int(args.KeyEventKind) != 0:
                    return
                mods = int(Control.ModifierKeys)
                if not (mods & int(Keys.Control)) or (mods & int(Keys.Alt)):
                    return
                script = _shortcut_script(int(args.VirtualKey), bool(mods & int(Keys.Shift)))
                if script is None:
                    return
                args.Handled = True
                control.CoreWebView2.ExecuteScriptAsync(script)
            except Exception:
                logging.getLogger(__name__).warning(
                    'Горячие клавиши: не удалось обработать сочетание', exc_info=True
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
        logging.getLogger(__name__).warning('Горячие клавиши: нет CoreWebView2Controller', exc_info=True)


def silence_http_server_logs():
    # Bottle и wsgiref пишут прямо в stderr, а не через logging
    logging.getLogger('bottle').setLevel(logging.WARNING)
    wsgiref.simple_server.WSGIRequestHandler.log_message = lambda self, fmt, *args: None
    bottle._stderr = lambda *args: None


def main():
    logs.setup()
    if not webview2.is_installed():
        logging.getLogger(__name__).warning('WebView2 не найден, запуск отменён')
        webview2.ask_to_install()
        return

    startup_file = get_startup_file_path()
    # Программа уже запущена: отдать ей файл (или попросить новое окно) и выйти
    listener = single_instance.hand_over([startup_file] if startup_file else [])
    if listener is True:
        return

    # debug=True нужен, чтобы Tab/Shift+Tab доходили до JS (AreBrowserAcceleratorKeysEnabled),
    # но DevTools при этом открываться не должны
    webview.settings['OPEN_DEVTOOLS_IN_DEBUG'] = False
    # Иначе при debug=True pywebview поднимет уровень своих логов до DEBUG
    os.environ['PYWEBVIEW_LOG'] = 'WARNING'
    silence_http_server_logs()

    # Только из собранного exe: при запуске из исходников .md привязался бы к python.exe app.py
    if getattr(sys, 'frozen', False):
        try:
            register_file_associations()
        except OSError:
            logging.getLogger(__name__).warning('Не удалось записать ассоциации файлов', exc_info=True)

    if ICON_PATH.is_file():
        webview._state['icon'] = str(ICON_PATH)

    loaded_callbacks.append(_hook_editor_shortcuts)
    loaded_callbacks.append(prewarm)
    loaded_callbacks.append(enable_file_drop)
    loaded_callbacks.append(configure_context_menu)
    loaded_callbacks.append(allow_page_read)
    slot = create_editor_window()
    slot.startup_file = startup_file
    if listener is not None:
        single_instance.serve(listener, open_from_another_launch)
    webview.start(debug=True)


if __name__ == '__main__':
    main()
