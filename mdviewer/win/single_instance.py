"""Одна копия программы на пользователя Windows.

Первая копия занимает именованный канал и слушает его. Повторный запуск
(двойной щелчок по файлу, ярлык) передаёт ей файлы по этому каналу и выходит.
Раньше каждый запуск был отдельной копией: тот же файл открывался вторым окном,
и все копии по очереди переписывали общий session.json.
"""
import ctypes
import getpass
import logging
import threading
import time
from multiprocessing import AuthenticationError
from multiprocessing.connection import Client, Listener

_log = logging.getLogger(__name__)
_AUTHKEY = b'MDViewer single instance'
_REPLY_TIMEOUT = 60
_ASFW_ANY = -1
_SW_RESTORE = 9


def _address():
    try:
        user = getpass.getuser()
    except Exception:
        user = 'user'
    return rf'\\.\pipe\MDViewer-{user}'


def claim():
    """Listener, если эта копия первая. None — канал уже занят другой копией."""
    try:
        return Listener(_address(), family='AF_PIPE', authkey=_AUTHKEY)
    except PermissionError:
        return None
    except OSError:
        _log.warning('Не удалось занять канал одной копии', exc_info=True)
        return None


def send(files):
    """Передать файлы первой копии. True — она их приняла, этой копии можно выйти."""
    # Окно открывает другой процесс, а Windows не даёт фоновому процессу
    # выйти на передний план. Разрешаем это явно: запуск сделал пользователь.
    ctypes.windll.user32.AllowSetForegroundWindow(_ASFW_ANY)
    try:
        with Client(_address(), family='AF_PIPE', authkey=_AUTHKEY) as conn:
            conn.send({'files': list(files)})
            if not conn.poll(_REPLY_TIMEOUT):
                return False
            return conn.recv() == 'ok'
    except (OSError, EOFError):
        return False
    except Exception:
        _log.warning('Не удалось передать файлы запущенной копии', exc_info=True)
        return False


def hand_over(files, attempts=3):
    """Занять канал или отдать файлы уже запущенной копии.

    Возвращает Listener (эта копия первая), True (файлы переданы, надо выйти)
    или None (связаться не вышло — работать самостоятельно, без канала).
    Если первая копия как раз закрывается, она ответит отказом — тогда пробуем снова.
    """
    for attempt in range(attempts):
        listener = claim()
        if listener is not None:
            return listener
        if send(files):
            return True
        time.sleep(0.5 * (attempt + 1))
    return None


def serve(listener, handler):
    """Принимать повторные запуски в фоне. handler(files) → True, если файлы открыты."""
    def loop():
        while True:
            try:
                conn = listener.accept()
            except (AuthenticationError, ConnectionError, EOFError):
                # Чужой клиент без ключа или обрыв на рукопожатии — ждём следующего
                _log.warning('Канал одной копии: отклонено подключение', exc_info=True)
                continue
            except Exception:
                # Канал закрыт: программа завершается
                return
            try:
                with conn:
                    message = conn.recv()
                    files = message.get('files') if isinstance(message, dict) else None
                    if not isinstance(files, list):
                        files = []
                    files = [path for path in files if isinstance(path, str) and path]
                    try:
                        ok = handler(files)
                    except Exception:
                        _log.warning('Канал одной копии: не удалось открыть файлы', exc_info=True)
                        ok = False
                    conn.send('ok' if ok else 'gone')
            except Exception:
                _log.warning('Канал одной копии: обрыв связи', exc_info=True)

    threading.Thread(target=loop, name='single-instance', daemon=True).start()


def bring_to_front(window):
    """Развернуть окно, если свёрнуто, и вывести его вперёд."""
    try:
        hwnd = int(window.native.Handle.ToInt64())
    except Exception:
        return
    user32 = ctypes.windll.user32
    if user32.IsIconic(hwnd):
        user32.ShowWindow(hwnd, _SW_RESTORE)
    user32.SetForegroundWindow(hwnd)
