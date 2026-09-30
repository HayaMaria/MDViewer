"""Ассоциации .md / .html с MD Viewer в Проводнике Windows.

Регистрация в HKCU (без прав администратора). Команда открытия всегда
указывает на текущий исполняемый файл: MDViewer.exe в сборке PyInstaller
или интерпретатор + app.py при запуске из исходников.
"""
import os
import sys
import ctypes
import winreg

APP_NAME = 'MD Viewer'
APP_KEY = 'MDViewer'
PROG_MD = 'MDViewer.markdown'
PROG_HTML = 'MDViewer.html'
MD_EXTS = ('.md', '.markdown')
HTML_EXTS = ('.html', '.htm')
ALL_EXTS = MD_EXTS + HTML_EXTS


def is_frozen():
    return getattr(sys, 'frozen', False)


def exe_path():
    return os.path.abspath(sys.executable)


def script_path():
    return os.path.abspath(os.path.join(os.path.dirname(__file__), 'app.py'))


def open_command():
    """Команда для shell\\open\\command: exe \"%1\" или python app.py \"%1\"."""
    if is_frozen():
        return f'"{exe_path()}" "%1"'
    return f'"{exe_path()}" "{script_path()}" "%1"'


def icon_spec():
    return f'{exe_path()},0'


def _long_path(path):
    buf = ctypes.create_unicode_buffer(32768)
    n = ctypes.windll.kernel32.GetLongPathNameW(path, buf, 32768)
    return buf.value if n else path


def get_startup_file_path():
    """Путь к файлу из аргументов командной строки (двойной щелчок в Проводнике)."""
    for arg in sys.argv[1:]:
        if not arg or arg.startswith('-'):
            continue
        path = os.path.abspath(os.path.expanduser(arg.strip('"')))
        if os.path.isfile(path):
            return _long_path(path)
    return None


def _set_sz(key, name, value):
    winreg.SetValueEx(key, name, 0, winreg.REG_SZ, value)


def _create(path):
    return winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, path, 0, winreg.KEY_SET_VALUE | winreg.KEY_READ)


def _delete_tree(path):
    try:
        winreg.DeleteKeyEx(winreg.HKEY_CURRENT_USER, path)
    except FileNotFoundError:
        pass
    except OSError:
        # Сначала удаляем вложенные ключи
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, path, 0, winreg.KEY_READ) as k:
                while True:
                    sub = winreg.EnumKey(k, 0)
                    _delete_tree(path + '\\' + sub)
        except (FileNotFoundError, OSError):
            pass
        try:
            winreg.DeleteKey(winreg.HKEY_CURRENT_USER, path)
        except OSError:
            pass


def _notify_shell():
    SHCNE_ASSOCCHANGED = 0x08000000
    ctypes.windll.shell32.SHChangeNotify(SHCNE_ASSOCCHANGED, 0, None, None)


def _write_progid(prog, description):
    cmd = open_command()
    icon = icon_spec()
    with _create(rf'Software\Classes\{prog}') as k:
        _set_sz(k, None, description)
    with _create(rf'Software\Classes\{prog}\DefaultIcon') as k:
        _set_sz(k, None, icon)
    with _create(rf'Software\Classes\{prog}\shell') as k:
        _set_sz(k, None, 'open')
    with _create(rf'Software\Classes\{prog}\shell\open') as k:
        _set_sz(k, None, 'Открыть')
    with _create(rf'Software\Classes\{prog}\shell\open\command') as k:
        _set_sz(k, None, cmd)


def _write_context_menu(ext):
    cmd = open_command()
    icon = icon_spec()
    base = rf'Software\Classes\SystemFileAssociations\{ext}\shell\MDViewer'
    with _create(base) as k:
        _set_sz(k, None, 'Открыть в MD Viewer')
        _set_sz(k, 'Icon', icon)
    with _create(base + r'\command') as k:
        _set_sz(k, None, cmd)


def register_file_associations():
    """Прописать MD Viewer как программу для .md и .html."""
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

    exe_name = os.path.basename(exe_path())
    with _create(rf'Software\Classes\Applications\{exe_name}') as k:
        _set_sz(k, 'FriendlyAppName', APP_NAME)
    with _create(rf'Software\Classes\Applications\{exe_name}\shell\open\command') as k:
        _set_sz(k, None, open_command())
    with _create(rf'Software\Classes\Applications\{exe_name}\SupportedTypes') as k:
        for ext in ALL_EXTS:
            _set_sz(k, ext, '')

    cap = rf'Software\{APP_KEY}\Capabilities'
    with _create(cap) as k:
        _set_sz(k, 'ApplicationName', APP_NAME)
        _set_sz(k, 'ApplicationDescription', 'Редактор Markdown с предпросмотром')
        _set_sz(k, 'ApplicationIcon', icon_spec())
    with _create(cap + r'\FileAssociations') as k:
        for ext in MD_EXTS:
            _set_sz(k, ext, PROG_MD)
        for ext in HTML_EXTS:
            _set_sz(k, ext, PROG_HTML)
    with _create(r'Software\RegisteredApplications') as k:
        _set_sz(k, APP_KEY, cap)

    _notify_shell()
    return True


def _write_openwith_list(ext):
    exe_name = os.path.basename(exe_path())
    base = rf'Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\{ext}'
    with _create(base + r'\OpenWithList') as k:
        _set_sz(k, 'a', exe_name)
        _set_sz(k, 'MRUList', 'a')
    with _create(base + r'\OpenWithProgids') as k:
        winreg.SetValueEx(k, PROG_MD if ext in MD_EXTS else PROG_HTML, 0, winreg.REG_NONE, b'')


def is_registered():
    """True, если команда открытия ProgID указывает на текущий exe/скрипт."""
    expected = open_command()
    try:
        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            rf'Software\Classes\{PROG_MD}\shell\open\command',
            0,
            winreg.KEY_READ,
        ) as k:
            value, _ = winreg.QueryValueEx(k, None)
            return value == expected
    except OSError:
        return False


def unregister_file_associations():
    """Убрать ProgID и пункт контекстного меню (расширения .html не трогаем)."""
    for prog in (PROG_MD, PROG_HTML):
        _delete_tree(rf'Software\Classes\{prog}')
    for ext in ALL_EXTS:
        _delete_tree(rf'Software\Classes\SystemFileAssociations\{ext}\shell\MDViewer')
        try:
            with winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                rf'Software\Classes\{ext}\OpenWithProgids',
                0,
                winreg.KEY_SET_VALUE,
            ) as k:
                for prog in (PROG_MD, PROG_HTML):
                    try:
                        winreg.DeleteValue(k, prog)
                    except FileNotFoundError:
                        pass
        except OSError:
            pass
        try:
            with winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                rf'Software\Classes\{ext}',
                0,
                winreg.KEY_SET_VALUE | winreg.KEY_READ,
            ) as k:
                try:
                    current, _ = winreg.QueryValueEx(k, None)
                    if current in (PROG_MD, PROG_HTML):
                        _set_sz(k, None, '')
                except FileNotFoundError:
                    pass
        except OSError:
            pass
    exe_name = os.path.basename(exe_path())
    _delete_tree(rf'Software\Classes\Applications\{exe_name}')
    _delete_tree(rf'Software\{APP_KEY}')
    try:
        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r'Software\RegisteredApplications',
            0,
            winreg.KEY_SET_VALUE,
        ) as k:
            winreg.DeleteValue(k, APP_KEY)
    except OSError:
        pass
    _notify_shell()
    return True
