"""Запись файла, которую обрыв питания не превращает в обрезанный текст.

Новый текст сначала попадает во временный файл в той же папке. При sync=True
он сбрасывается на диск, затем имя цели атомарно переключается на него.
sync=False оставляет данные в кэше ОС: замена имени не подставляет обрезанный
файл вместо прежнего, но свежая копия может не пережить питание. Пока замена
не прошла, читатель видит прежний целый файл. Если основной файл потом
окажется битым, читается запасная копия .bak — но только когда основной файл
на месте: удалённый файл значит, что запись специально стёрли.
"""
import json
import logging
import os
import tempfile
import threading
import time

_log = logging.getLogger(__name__)
_lock = threading.Lock()
# Каталоги, где обломки прошлого запуска уже убраны. Повторный listdir
# на каждой записи сессии только тормозит.
_swept_dirs = set()
# Путь -> (размер, время). Совпадает — файл с той проверки не подменяли,
# и его можно копировать в .bak. Иначе битая версия затёрла бы запасную.
_known_good = {}
_backup_at = {}


def _stamp(path):
    st = os.stat(path)
    modified = getattr(st, 'st_mtime_ns', int(st.st_mtime * 1e9))
    return (st.st_size, modified)


def _remember_good(path):
    """Вызывается уже под _lock."""
    try:
        _known_good[path] = _stamp(path)
    except OSError:
        _known_good.pop(path, None)


def _still_good(path):
    stamp = _known_good.get(path)
    if stamp is None:
        return False
    try:
        return _stamp(path) == stamp
    except OSError:
        return False


def note_good(path):
    """Этот путь уже читался целиком. Его можно класть в .bak, пока он не изменился."""
    with _lock:
        _remember_good(os.path.abspath(path))


def ensure_backup(path):
    """Один раз скопировать целый файл в .bak, если запасной копии ещё нет."""
    path = os.path.abspath(path)
    with _lock:
        bak = path + '.bak'
        if not _still_good(path) or os.path.isfile(bak):
            return
        _backup_at[path] = time.monotonic()
        try:
            _copy_atomic(path, bak)
        except OSError:
            _log.warning('Не удалось сделать запасную копию %s', path, exc_info=True)


def parse_json(path):
    """('ok', data), ('absent', None) или ('broken', None). Запасную копию не открывает."""
    try:
        with open(path, 'r', encoding='utf-8') as handle:
            return 'ok', json.load(handle)
    except FileNotFoundError:
        return 'absent', None
    except (OSError, json.JSONDecodeError, UnicodeError):
        return 'broken', None


def read_text(path):
    """Текст файла. None — файла нет или не читаются ни он, ни .bak."""
    path = os.path.abspath(path)
    try:
        with open(path, 'r', encoding='utf-8') as handle:
            text = handle.read()
    except FileNotFoundError:
        return None
    except (OSError, UnicodeError):
        try:
            with open(path + '.bak', 'r', encoding='utf-8') as handle:
                return handle.read()
        except (OSError, UnicodeError):
            return None
    note_good(path)
    ensure_backup(path)
    return text


def write_text(path, text, backup=False, backup_interval=30, newline='\n', sync=True):
    """Записать текст целиком. backup — освежать path.bak не чаще interval секунд.

    interval 0 обновляет запасную копию при каждой записи. Копия снимается
    только с файла, который раньше успешно прочитан или записан: битый
    основной файл не затирает ещё живой .bak.

    sync=False не вызывает fsync: атомарная замена имени уже не оставляет
    обрезанный файл на месте прежнего. Так пишется сессия, которую обновляют
    часто. Сохранение документа оставляет sync=True.
    """
    if not isinstance(text, str):
        raise TypeError('text')
    path = os.path.abspath(path)
    directory = os.path.dirname(path)
    with _lock:
        os.makedirs(directory, exist_ok=True)
        _sweep_once(directory)
        fd, temporary = tempfile.mkstemp(prefix='.mdv-', suffix='.tmp', dir=directory)
        replaced = False
        try:
            with os.fdopen(fd, 'w', encoding='utf-8', newline=newline) as handle:
                handle.write(text)
                handle.flush()
                if sync:
                    os.fsync(handle.fileno())
            if backup:
                _backup_previous(path, backup_interval)
            os.replace(temporary, path)
            replaced = True
        finally:
            if not replaced:
                try:
                    os.remove(temporary)
                except OSError:
                    pass
        _remember_good(path)


def remove_file(path):
    """Убрать файл, его .bak и старый .tmp. Отдельная ошибка удаления не прячет остальные."""
    path = os.path.abspath(path)
    with _lock:
        _known_good.pop(path, None)
        _backup_at.pop(path, None)
    for candidate in (path, path + '.bak', path + '.tmp'):
        try:
            os.remove(candidate)
        except FileNotFoundError:
            pass
        except OSError:
            _log.warning('Не удалось удалить %s', candidate, exc_info=True)


def _backup_previous(path, interval):
    """Вызывается уже под _lock. Сбой копии не отменяет запись нового файла."""
    if not _still_good(path):
        return
    now = time.monotonic()
    last = _backup_at.get(path)
    bak = path + '.bak'
    if last is not None and interval > 0 and (now - last) < interval and os.path.isfile(bak):
        return
    _backup_at[path] = now
    try:
        _copy_atomic(path, bak)
    except OSError:
        _log.warning('Не удалось обновить запасную копию %s', bak, exc_info=True)


def _copy_atomic(src, dest):
    directory = os.path.dirname(dest) or '.'
    fd, temporary = tempfile.mkstemp(prefix='.mdv-', suffix='.tmp', dir=directory)
    replaced = False
    try:
        with os.fdopen(fd, 'wb') as out:
            with open(src, 'rb') as src_handle:
                while True:
                    chunk = src_handle.read(1024 * 1024)
                    if not chunk:
                        break
                    out.write(chunk)
            out.flush()
            os.fsync(out.fileno())
        os.replace(temporary, dest)
        replaced = True
    finally:
        if not replaced:
            try:
                os.remove(temporary)
            except OSError:
                pass


def _sweep_once(directory):
    """Вызывается уже под _lock. Каталог обходится один раз за запуск."""
    if directory in _swept_dirs:
        return
    if _sweep_temps(directory):
        _swept_dirs.add(directory)


def _sweep_temps(directory):
    """Временные файлы прошлого оборванного запуска. Живой записи в этот момент нет."""
    try:
        names = os.listdir(directory)
    except OSError:
        return False
    for name in names:
        if name.startswith('.mdv-') and name.endswith('.tmp'):
            try:
                os.remove(os.path.join(directory, name))
            except OSError:
                pass
    return True
