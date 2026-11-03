"""Журнал ошибок: %APPDATA%/MDViewer/log.txt.

У собранного exe нет консоли, поэтому без файла сообщения logging просто пропадают.
"""
import logging
import logging.handlers
import os
import sys
import threading

from .config import CONFIG_DIR

LOG_PATH = os.path.join(CONFIG_DIR, 'log.txt')
# 1 МБ на файл и одна старая копия (log.txt.1)
_MAX_BYTES = 1024 * 1024
_BACKUPS = 1


def setup():
    """Писать предупреждения и ошибки в файл и ловить исключения, которые никто не поймал."""
    root = logging.getLogger()
    root.setLevel(logging.WARNING)
    try:
        os.makedirs(CONFIG_DIR, exist_ok=True)
        handler = logging.handlers.RotatingFileHandler(
            LOG_PATH, maxBytes=_MAX_BYTES, backupCount=_BACKUPS, encoding='utf-8', delay=True,
        )
    except OSError:
        return
    handler.setFormatter(logging.Formatter(
        '%(asctime)s %(levelname)s [%(threadName)s] %(name)s: %(message)s'
    ))
    root.addHandler(handler)

    def on_uncaught(exc_type, exc, tb):
        if issubclass(exc_type, KeyboardInterrupt):
            sys.__excepthook__(exc_type, exc, tb)
            return
        logging.getLogger('mdviewer').critical('Необработанная ошибка', exc_info=(exc_type, exc, tb))

    def on_thread_uncaught(args):
        if args.exc_type is SystemExit:
            return
        thread = args.thread.name if args.thread else '?'
        logging.getLogger('mdviewer').error(
            'Необработанная ошибка в потоке %s', thread,
            exc_info=(args.exc_type, args.exc_value, args.exc_traceback),
        )

    sys.excepthook = on_uncaught
    threading.excepthook = on_thread_uncaught
