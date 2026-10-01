"""Состояние запущенного приложения и вызовы JS в главном окне."""
import json


class AppState:
    def __init__(self):
        self.window = None
        self.current_file = None
        # True, когда открыт HTML-файл (режим просмотра, только чтение)
        self.html_mode = False
        # Файл, переданный Проводником при запуске
        self.startup_file = None


state = AppState()


def call_js(function, *args):
    """Вызвать глобальную JS-функцию главного окна; аргументы сериализуются в JSON."""
    params = ', '.join(json.dumps(arg) for arg in args)
    return state.window.evaluate_js(f'{function}({params})')


def alert(message):
    call_js('alert', message)
