"""Понятные пользователю причины ошибок чтения и записи файлов."""
import errno

# Коды Windows (e.winerror), для которых errno слишком общий.
_WIN_SHARING_VIOLATION = 32
_WIN_LOCK_VIOLATION = 33
_WIN_NOT_READY = 21
_WIN_WRITE_PROTECT = 19
_WIN_DISK_FULL = 112
_WIN_HANDLE_DISK_FULL = 39
_WIN_BAD_NETPATH = 53
_WIN_BAD_NET_NAME = 67
_WIN_NETNAME_DELETED = 64
_WIN_FILENAME_EXCED_RANGE = 206


def describe(error):
    """Причина ошибки одной фразой с маленькой буквы, без точки в конце."""
    if isinstance(error, UnicodeDecodeError):
        return 'файл сохранён не в кодировке UTF-8'
    if not isinstance(error, OSError):
        return f'внутренняя ошибка ({error})'
    winerror = getattr(error, 'winerror', None)
    if winerror in (_WIN_SHARING_VIOLATION, _WIN_LOCK_VIOLATION):
        return 'файл занят другой программой'
    if winerror == _WIN_WRITE_PROTECT or error.errno == errno.EROFS:
        return 'диск защищён от записи'
    if winerror in (_WIN_DISK_FULL, _WIN_HANDLE_DISK_FULL) or error.errno == errno.ENOSPC:
        return 'на диске не хватает места'
    if winerror == _WIN_NOT_READY:
        return 'диск недоступен'
    if winerror in (_WIN_BAD_NETPATH, _WIN_BAD_NET_NAME, _WIN_NETNAME_DELETED):
        return 'сетевая папка недоступна'
    if winerror == _WIN_FILENAME_EXCED_RANGE or error.errno == errno.ENAMETOOLONG:
        return 'слишком длинный путь к файлу'
    if isinstance(error, FileNotFoundError):
        return 'файл или папка не найдены'
    if isinstance(error, IsADirectoryError):
        return 'указана папка, а не файл'
    if isinstance(error, PermissionError):
        return 'нет доступа к файлу или папке'
    detail = error.strerror or str(error)
    return f'системная ошибка ({detail})'


def advice(error):
    """Подсказка, что сделать. Пустая строка — подсказки нет."""
    if isinstance(error, UnicodeDecodeError):
        return 'Пересохраните файл в кодировке UTF-8 (например, в Блокноте: «Сохранить как» → Кодировка UTF-8) и откройте снова.'
    winerror = getattr(error, 'winerror', None)
    if winerror in (_WIN_SHARING_VIOLATION, _WIN_LOCK_VIOLATION):
        return 'Закройте файл в другой программе и попробуйте ещё раз.'
    if isinstance(error, PermissionError):
        return 'Проверьте права доступа к файлу и папке или выберите другую папку.'
    if isinstance(error, OSError) and (
        winerror in (_WIN_DISK_FULL, _WIN_HANDLE_DISK_FULL) or error.errno == errno.ENOSPC
    ):
        return 'Освободите место на диске или выберите другую папку.'
    return ''


def message(action, name, error):
    """«Не удалось открыть файл «x.md»: причина.» и подсказка с новой строки."""
    text = f'Не удалось {action} «{name}»: {describe(error)}.'
    hint = advice(error)
    return f'{text}\n\n{hint}' if hint else text
