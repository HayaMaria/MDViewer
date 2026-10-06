"""Состояние запущенного приложения и вызовы JS в главном окне."""
import json


class AppState:
    def __init__(self):
        self.window = None
        self.current_file = None
        # Путь документа на экране. У HTML current_file остаётся None,
        # чтобы Ctrl+S не перезаписал файл, но сессии путь всё равно нужен.
        self.opened_path = None
        # True, когда открыт HTML-файл (режим просмотра, только чтение)
        self.html_mode = False
        # Файл, переданный Проводником при запуске
        self.startup_file = None
        # Сессию пишем после того, как пользователь открыл документ или начал правку.
        # Приветственный текст сам по себе местом остановки не считается.
        self.persist_session = False
        # Пока документ подменяется, отложенные снимки из JS не должны затереть сессию
        self.session_paused = False
        self.session_epoch = 0


state = AppState()


def call_js(function, *args):
    """Вызвать глобальную JS-функцию главного окна; аргументы сериализуются в JSON."""
    params = ', '.join(json.dumps(arg) for arg in args)
    return state.window.evaluate_js(f'{function}({params})')


def alert(message):
    call_js('alert', message)
