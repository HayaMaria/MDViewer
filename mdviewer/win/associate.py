"""Ассоциации .md / .html с MD Viewer в Проводнике Windows.

Регистрация в HKCU (без прав администратора). Команда открытия всегда
указывает на текущий исполняемый файл: MDViewer.exe в сборке PyInstaller
или интерпретатор + app.py при запуске из исходников.
"""
import ctypes
import os
import sys
import winreg

from .. import APP_TITLE
from ..paths import ENTRY_SCRIPT

APP_KEY = 'MDViewer'
PROG_MD = 'MDViewer.markdown'
PROG_HTML = 'MDViewer.html'
MD_EXTS = ('.md', '.markdown')
HTML_EXTS = ('.html', '.htm')
ALL_EXTS = MD_EXTS + HTML_EXTS


def get_startup_file_path():
    """Путь к файлу из аргументов командной строки (двойной щелчок в Проводнике)."""
    for arg in sys.argv[1:]:
        if not arg or arg.startswith('-'):
            continue
        path = os.path.abspath(os.path.expanduser(arg.strip('"')))
        if os.path.isfile(path):
            return _long_path(path)
    return None


def register_file_associations():
    """Прописать MD Viewer как программу для .md и в «Открыть с помощью» для .html."""
    _write_progid(PROG_MD, 'Документ Markdown')
    _write_progid(PROG_HTML, 'Документ HTML')

    for ext in MD_EXTS:
        with _create(rf'Software\Classes\{ext}') as k:
            _set_sz(k, None, PROG_MD)
        with _create(rf'Software\Classes\{ext}\OpenWithProgids') as k:
            _set_sz(k, PROG_MD, '')
        _write_openwith_list(ext)
        _write_context_menu(ext)

    for ext in HTML_EXTS:
        # Не затираем браузер как программу по умолчанию — только «Открыть с помощью»
        with _create(rf'Software\Classes\{ext}\OpenWithProgids') as k:
            _set_sz(k, PROG_HTML, '')
        _write_openwith_list(ext)
        _write_context_menu(ext)

    exe_name = os.path.basename(_exe_path())
    with _create(rf'Software\Classes\Applications\{exe_name}') as k:
        _set_sz(k, 'FriendlyAppName', APP_TITLE)
    with _create(rf'Software\Classes\Applications\{exe_name}\shell\open\command') as k:
        _set_sz(k, None, _open_command())
    with _create(rf'Software\Classes\Applications\{exe_name}\SupportedTypes') as k:
        for ext in ALL_EXTS:
            _set_sz(k, ext, '')

    cap = rf'Software\{APP_KEY}\Capabilities'
    with _create(cap) as k:
        _set_sz(k, 'ApplicationName', APP_TITLE)
        _set_sz(k, 'ApplicationDescription', 'Редактор Markdown с предпросмотром')
        _set_sz(k, 'ApplicationIcon', _icon_spec())
    with _create(cap + r'\FileAssociations') as k:
        for ext in MD_EXTS:
            _set_sz(k, ext, PROG_MD)
        for ext in HTML_EXTS:
            _set_sz(k, ext, PROG_HTML)
    with _create(r'Software\RegisteredApplications') as k:
        _set_sz(k, APP_KEY, cap)

    _notify_shell()


def _exe_path():
    return os.path.abspath(sys.executable)


def _open_command():
    """Команда для shell\\open\\command: exe \"%1\" или python app.py \"%1\"."""
    if getattr(sys, 'frozen', False):
        return f'"{_exe_path()}" "%1"'
    return f'"{_exe_path()}" "{ENTRY_SCRIPT}" "%1"'


def _icon_spec():
    return f'{_exe_path()},0'


def _long_path(path):
    buf = ctypes.create_unicode_buffer(32768)
    n = ctypes.windll.kernel32.GetLongPathNameW(path, buf, 32768)
    return buf.value if n else path


def _create(path):
    return winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, path, 0, winreg.KEY_SET_VALUE | winreg.KEY_READ)


def _set_sz(key, name, value):
    winreg.SetValueEx(key, name, 0, winreg.REG_SZ, value)


def _write_progid(prog, description):
    with _create(rf'Software\Classes\{prog}') as k:
        _set_sz(k, None, description)
    with _create(rf'Software\Classes\{prog}\DefaultIcon') as k:
        _set_sz(k, None, _icon_spec())
    with _create(rf'Software\Classes\{prog}\shell') as k:
        _set_sz(k, None, 'open')
    with _create(rf'Software\Classes\{prog}\shell\open') as k:
        _set_sz(k, None, 'Открыть')
    with _create(rf'Software\Classes\{prog}\shell\open\command') as k:
        _set_sz(k, None, _open_command())


def _write_openwith_list(ext):
    exe_name = os.path.basename(_exe_path())
    base = rf'Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\{ext}'
    with _create(base + r'\OpenWithList') as k:
        _set_sz(k, 'a', exe_name)
        _set_sz(k, 'MRUList', 'a')
    with _create(base + r'\OpenWithProgids') as k:
        winreg.SetValueEx(k, PROG_MD if ext in MD_EXTS else PROG_HTML, 0, winreg.REG_NONE, b'')


def _write_context_menu(ext):
    base = rf'Software\Classes\SystemFileAssociations\{ext}\shell\MDViewer'
    with _create(base) as k:
        _set_sz(k, None, f'Открыть в {APP_TITLE}')
        _set_sz(k, 'Icon', _icon_spec())
    with _create(base + r'\command') as k:
        _set_sz(k, None, _open_command())


def _notify_shell():
    SHCNE_ASSOCCHANGED = 0x08000000
    ctypes.windll.shell32.SHChangeNotify(SHCNE_ASSOCCHANGED, 0, None, None)
