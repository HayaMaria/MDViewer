"""Проверка Microsoft Edge WebView2 до открытия окна.

Без WebView2 pywebview молча берёт движок Internet Explorer: тот не понимает
editor.bundle.js, показывает «Ошибка сценария» и оставляет окно висеть.
Записи в реестре те же, что смотрит pywebview, но код свой: его проверка приватная.
"""
import ctypes
import platform
import webbrowser
import winreg

# Evergreen Bootstrapper с сайта Microsoft: маленький установщик, докачивает остальное сам
DOWNLOAD_URL = 'https://go.microsoft.com/fwlink/p/?LinkId=2124703'
# Самая старая сборка, с которой работает pywebview
MIN_VERSION = (86, 0, 622, 0)
# Сам runtime и предварительные выпуски (Beta, Dev, Canary)
_CLIENT_KEYS = (
    '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
    '{2CD8A007-E189-409D-A2C8-9AF4EF3C72AA}',
    '{0D50BFEC-CD6A-4F9A-964C-C7416E3ACB10}',
    '{65C35B14-6C1D-4122-AC46-7148CC9D6497}',
)

MESSAGE = (
    'Для работы MD Viewer нужен компонент Microsoft Edge WebView2, '
    'а на этом компьютере его нет.\n\n'
    'Скачать установщик с сайта Microsoft?\n'
    'После установки запустите MD Viewer снова.'
)

_MB_YESNO = 0x04
_MB_ICONWARNING = 0x30
_MB_SETFOREGROUND = 0x10000
_IDYES = 6


def parse_version(text):
    """'120.0.2210.91' → (120, 0, 2210, 91). Мусор — None."""
    if not isinstance(text, str):
        return None
    try:
        return tuple(int(part) for part in text.strip().split('.'))
    except ValueError:
        return None


def version_ok(text):
    version = parse_version(text)
    return version is not None and version >= MIN_VERSION


def _installed_versions():
    # У 64-битной Windows машинная запись лежит в WOW6432Node, пользовательская — нет
    machine_base = r'SOFTWARE\Microsoft\EdgeUpdate\Clients'
    if platform.machine().endswith('64'):
        machine_base = r'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients'
    places = (
        (winreg.HKEY_LOCAL_MACHINE, machine_base),
        (winreg.HKEY_CURRENT_USER, r'SOFTWARE\Microsoft\EdgeUpdate\Clients'),
    )
    for root, base in places:
        for key in _CLIENT_KEYS:
            try:
                with winreg.OpenKey(root, rf'{base}\{key}') as handle:
                    value, _ = winreg.QueryValueEx(handle, 'pv')
            except OSError:
                continue
            yield value


def is_installed():
    return any(version_ok(value) for value in _installed_versions())


def ask_to_install():
    """Сообщение Windows. По «Да» открыть загрузку установщика в браузере."""
    answer = ctypes.windll.user32.MessageBoxW(
        None, MESSAGE, 'MD Viewer', _MB_YESNO | _MB_ICONWARNING | _MB_SETFOREGROUND,
    )
    if answer == _IDYES:
        webbrowser.open(DOWNLOAD_URL)
