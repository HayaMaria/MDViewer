"""Состояние запущенного приложения и вызовы JS в текущем окне.

Каждое окно редактора — свой слот (файл, вкладки, эпоха сессии). Пока метод API
выполняется, текущим считается окно, из которого его вызвали.
"""
import contextvars
import json
import threading

_current_slot = contextvars.ContextVar('mdviewer_slot', default=None)

# Поля, которые живут в слоте окна, а снаружи читаются как state.имя.
_SLOT_FIELDS = frozenset({
    'window',
    'current_file',
    'opened_path',
    'html_mode',
    'startup_file',
    'persist_session',
    'session_paused',
    'session_epoch',
    'force_close',
})


class WindowSlot:
    def __init__(self, slot_id):
        self.id = slot_id
        self.window = None
        self.current_file = None
        # Путь документа на экране. У HTML current_file остаётся None,
        # чтобы Ctrl+S не перезаписал файл, но сессии путь всё равно нужен.
        self.opened_path = None
        self.html_mode = False
        self.startup_file = None
        self.persist_session = False
        self.session_paused = False
        self.session_epoch = 0
        self.force_close = False
        self.close_started = False
        # Что это окно должно открыть вместо сессии с диска: вкладка с другого окна.
        self.launch = None
        # Последний снимок вкладок для общего файла сессии.
        self.last_snapshot = None


class AppState:
    def __init__(self):
        self.slots = {}
        self.primary = None

    def active_slot(self):
        slot = _current_slot.get()
        if slot is not None:
            return slot
        return self.primary

    def iter_slots(self):
        return list(self.slots.values())

    def __getattr__(self, name):
        if name in _SLOT_FIELDS:
            slot = self.active_slot()
            if slot is None:
                raise AttributeError(name)
            return getattr(slot, name)
        raise AttributeError(name)

    def __setattr__(self, name, value):
        if name in _SLOT_FIELDS:
            slot = self.active_slot()
            if slot is None:
                raise AttributeError(name)
            setattr(slot, name, value)
            return
        object.__setattr__(self, name, value)


state = AppState()


def bind_slot(slot):
    return _current_slot.set(slot)


def unbind_slot(token):
    _current_slot.reset(token)


def spawn(slot, target, *args):
    """Фоновый поток с явным окном.

    Новый поток не наследует текущее окно, поэтому без слота любой вызов
    state.window попадает в первое окно.
    """
    def run():
        token = bind_slot(slot)
        try:
            target(*args)
        finally:
            unbind_slot(token)

    threading.Thread(target=run, daemon=True).start()


def call_js(function, *args):
    """Вызвать глобальную JS-функцию текущего окна; аргументы сериализуются в JSON."""
    params = ', '.join(json.dumps(arg) for arg in args)
    return state.window.evaluate_js(f'{function}({params})')


def alert(message):
    call_js('alert', message)
