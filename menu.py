import os,json,webview
from config import load_config,save_config
api=None

def new_document():
    """Новый документ — очищает редактор, сбрасывает current_file, обновляет заголовок"""
    window = webview.active_window()
    window.evaluate_js('setEditorContent("")')
    global api
    api.current_file = None
    window.title = 'MD Viewer — Новый документ'



def open_file():
    """Открыть файл — диалог → читаем .md → устанавливаем в редактор"""
    window = webview.active_window()
    result = window.create_file_dialog(
        webview.FileDialog.OPEN,
        file_types=['Markdown files (*.md)', 'All files (*.*)']
    )
    if result:
        filepath = result[0]
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            escaped = json.dumps(content)
            window.evaluate_js(f'setEditorContent({escaped})')
            api.current_file = filepath
            window.title = f'MD Viewer — {os.path.basename(filepath)}'
        except Exception as e:
            window.evaluate_js(f'alert("Ошибка открытия файла: {str(e)}")')



def save_file():
    """Сохранить — перезаписать текущий файл или автосохранить в папку по умолчанию из конфига"""
    window = webview.active_window()
    content = window.evaluate_js('getEditorContent()')
    if api.current_file:
        try:
            with open(api.current_file, 'w', encoding='utf-8') as f:
                f.write(content)
        except Exception as e:
            window.evaluate_js(f'alert("Ошибка сохранения: {str(e)}")')
    else:
        config = load_config()
        save_cfg = config.get('save', {})
        save_dir = save_cfg.get('default_path', '') or os.path.join(os.path.expanduser('~'), 'Downloads')
        name = 'Новый документ.md'
        filepath = os.path.join(save_dir, name)
        counter = 1
        while os.path.exists(filepath):
            filepath = os.path.join(save_dir, f'Новый документ ({counter}).md')
            counter += 1
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            api.current_file = filepath
            window.title = f'MD Viewer — {os.path.basename(filepath)}'
        except Exception as e:
            window.evaluate_js(f'alert("Ошибка сохранения: {str(e)}")')



def save_file_as():
    """Сохранить как — диалог выбора места сохранения"""
    window = webview.active_window()
    content = window.evaluate_js('getEditorContent()')
    result = window.create_file_dialog(
        webview.FileDialog.SAVE,
        save_filename='Новый документ.md',
        file_types=['Markdown files (*.md)', 'All files (*.*)']
    )
    if result:
        filepath = result[0]
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            api.current_file = filepath
            window.title = f'MD Viewer — {os.path.basename(filepath)}'
        except Exception as e:
            window.evaluate_js(f'alert("Ошибка сохранения: {str(e)}")')



def exit_app():
    """Выход — закрыть окно приложения"""
    window = webview.active_window()
    window.destroy()



def undo_action():
    """Отменить последнее действие в редакторе"""
    window = webview.active_window()
    window.evaluate_js('undoEditor()')



def redo_action():
    """Повторить отменённое действие"""
    window = webview.active_window()
    window.evaluate_js('redoEditor()')



def cut_action():
    """Вырезать выделенный текст"""
    window = webview.active_window()
    window.evaluate_js('cutText()')



def copy_action():
    """Копировать выделенный текст"""
    window = webview.active_window()
    window.evaluate_js('copyText()')



def paste_action():
    """Вставить текст из буфера обмена"""
    window = webview.active_window()
    window.evaluate_js('pasteText()')



def change_theme():
    """Смена темы — переключение между светлой и тёмной с сохранением в конфиг"""
    config = load_config()
    current_dark = config.get('theme', 'dark') == 'dark'
    new_dark = not current_dark
    theme_name = 'dark' if new_dark else 'light'
    config['theme'] = theme_name
    save_config(config)
    window = webview.active_window()
    window.evaluate_js(f'applyTheme({str(new_dark).lower()})')



def show_about():
    """О программе"""
    window = webview.active_window()
    window.evaluate_js(
        'showHelp("О программе", "MD Viewer v1.0\\n\\nРедактор Markdown с предпросмотром в реальном времени.")'
    )



def show_shortcuts():
    """Горячие клавиши"""
    window = webview.active_window()
    window.evaluate_js(
        'showHelp(\"Горячие клавиши\", '
        '"-- Редактирование --\\n'
        'Ctrl+Z / Cmd+Z — Отмена\\n'
        'Ctrl+Y / Cmd+Y — Повтор\\n'
        'Ctrl+X / Cmd+X — Вырезать\\n'
        'Ctrl+C / Cmd+C — Копировать\\n'
        'Ctrl+V / Cmd+V — Вставить\\n'
        'Tab — Увеличить отступ\\n'
        'Shift+Tab — Уменьшить отступ\\n\\n'
        '-- Файловые операции --\\n'
        'Ctrl+N / Cmd+N — Новый документ\\n'
        'Ctrl+O / Cmd+O — Открыть файл\\n'
        'Ctrl+S / Cmd+S — Сохранить\\n'
        'Ctrl+Shift+S / Cmd+Shift+S — Сохранить как\\n\\n'
        '-- Навигация --\\n'
        'Home / End — В начало / конец строки\\n'
        'Ctrl+Home / Cmd+Home — В начало документа\\n'
        'Ctrl+End / Cmd+End — В конец документа\\n'
        'Ctrl+стрелки / Cmd+стрелки — Переход по словам\\n\\n'
        '-- Выделение --\\n'
        'Shift+Стрелки — Выделение текста\\n'
        'Ctrl+A / Cmd+A — Выделить всё\\n'
        'Ctrl+D / Cmd+D — Следующее совпадение\\n'
        'Ctrl+F / Cmd+F — Поиск\\n")'
    )



def show_md_syntax():
    """Markdown-синтаксис"""
    window = webview.active_window()
    window.evaluate_js(
        'showHelp(\"MD синтаксис\", '
        '"-- Форматирование текста --\\n'
        '**текст** — жирный шрифт\\n'
        '*текст* — курсив (наклонный)\\n'
        '`код` — моноширинный (для команд, имён функций)\\n'
        '~~текст~~ — зачёркнутый\\n\\n'
        '-- Заголовки --\\n'
        '# H1 — самый большой заголовок\\n'
        '## H2 — раздел поменьше\\n'
        '### H3 — ещё меньше\\n'
        'и так до ###### H6\\n\\n'
        '-- Списки --\\n'
        '* текст  — маркированный список (звёздочка)\\n'
        '- текст  — то же самое (минус)\\n'
        '1. текст — нумерованный список\\n'
        '  отступ — вложенный пункт (два пробела)\\n\\n'
        '-- Ссылки --\\n'
        '[текст](https://site.com)\\n'
        '  Текст станет ссылкой, откроется в браузере.\\n\\n'
        '[текст](https://site.com+)\\n'
        '  Если в конце адреса поставить плюсик (+),\\n'
        '  ссылка откроется в отдельном окне приложения.\\n'
        '  Удобно для документации или внешних страниц.\\n\\n'
        '-- Изображения --\\n'
        '![подпись](путь_к_файлу)\\n\\n'
        '  Вставляет картинку в документ.\\n'
        '  Указывайте путь относительно .md-файла.\\n'
        '  Поддерживаемые форматы: PNG, JPG/JPEG, GIF, SVG, WEBP, BMP.\\n\\n'
        '  Примеры:\\n'
        '    ![Рисунок](photo.png)          — картинка в той же папке\\n'
        '    ![Иконка](images/icon.svg)     — картинка в подпапке\\n'
        '    ![Схема](../assets/diag.png)   — картинка уровнем выше\\n'
        '    ![Лого](https://site.com/logo.jpg) — картинка из интернета\\n\\n'
        '  Подпись в квадратных скобках видна, когда\\n'
        '  изображение не загрузилось (например, нет файла).\\n\\n'

        '-- Цитаты --\\n'
        '> текст — цитата с полосой слева\\n'
        '>> текст — вложенная цитата (две полосы)\\n\\n'
        '-- Блоки кода --\\n'
        '```\\nкод\\n``` — блок кода без подсветки\\n\\n'
        '```python\\nкод\\n``` — блок кода с подсветкой\\n'
        '  Язык можно указать любой: python, javascript,\\n'
        '  html, css, bash, sql, json и т.д.\\n\\n'
        '-- Разделитель --\\n'
        '--- — горизонтальная черта во всю ширину\\n\\n'
        '-- Схемы и диаграммы Mermaid --\\n'
        '```mermaid\\nкод диаграммы\\n```\\n\\n'
        '  Позволяет рисовать прямо в документе:\\n'
        '    • блок-схемы      — graph TD; A-->B;\\n'
        '    • диаграммы       — sequenceDiagram\\n'
        '    • графы           — flowchart\\n'
        '    • круговые        — pie\\n'
        '    • временные линии — timeline\\n\\n'
        '  Пример простой блок-схемы:\\n'
        '    ```mermaid\\n'
        '    graph TD;\\n'
        '      A[Начало] --> B{Выбор};\\n'
        '      B -->|Да| C[Конец];\\n'
        '      B -->|Нет| A;\\n'
        '    ```\\n'
        '  (каждая строка — элемент диаграммы на языке Mermaid)\\n\\n'
        '-- Графики Chart.js --\\n'
        '```chart\\nнастройки и таблица\\n```\\n\\n'
        '  Строит графики на основе таблицы с данными.\\n'
        '  Первая строка — type: тип_графика.\\n'
        '  Затем идёт таблица: первый столбец — подписи,\\n'
        '  остальные — числовые значения.\\n\\n'
        '  Типы графиков:\\n'
        '    • bar       — столбчатый\\n'
        '    • line      — линейный (тренд)\\n'
        '    • pie       — круговой (доли)\\n'
        '    • doughnut  — кольцевой\\n'
        '    • radar     — лепестковый\\n'
        '    • polarArea — полярный\\n\\n'
        '  Пример — столбчатый график:\\n'
        '    ```chart\\n'
        '    type: bar\\n'
        '    | Месяц | Продажи |\\n'
        '    |-------|---------|\\n'
        '    | Янв   | 30      |\\n'
        '    | Фев   | 50      |\\n'
        '    | Мар   | 70      |\\n'
        '    ```\\n'
        '  Таблица рисуется чёрточками и палками:\\n'
        '  | заголовок | заголовок | — строка шапки\\n'
        '  |-----------|-----------| — разделитель\\n'
        '  | значение  | число     | — строка данных\\n")'
    )



def show_export_help():
    """Подсказка по экспорту HTML"""
    window = webview.active_window()
    window.evaluate_js(
        'showHelp(\"Экспорт HTML\", '
        '"-- Полный экспорт --\\n'
        'Все библиотеки (стили, Mermaid, Chart.js)\\n'
        'встраиваются в HTML-файл. Работает без\\n'
        'интернета. Файл получается больше.\\n\\n'
        '-- Минимальный экспорт --\\n'
        'Библиотеки подключаются с CDN. Файл\\n'
        'лёгкий, но для открытия требуется\\n'
        'интернет.\\n\\n'
        'Выбор зависит от того, где будет\\n'
        'использоваться файл. Если нужна\\n'
        'автономность — выбирайте полный экспорт.\\n'
        'Если файл будут открывать онлайн —\\n'
        'достаточно минимального.\\n")'
    )


def show_export_settings_dialog():
    """Открыть диалог настроек (загрузить конфиг и передать в JS)"""
    window = webview.active_window()
    config = load_config()
    export_cfg = config.get('export', {
        'mode': 'full',
        'theme': 'current',
        'save_path': ''
    })
    save_cfg = config.get('save', {
        'default_path': ''
    })
    # Если путь не задан — используем Downloads
    if not export_cfg.get('save_path'):
        export_cfg['save_path'] = get_downloads_folder()
    if not save_cfg.get('default_path'):
        save_cfg['default_path'] = get_downloads_folder()
    
    export_json = json.dumps(export_cfg)
    save_json = json.dumps(save_cfg)
    window.evaluate_js(
        'openSettingsDialog(' + export_json + ', ' + save_json + ')'
    )



