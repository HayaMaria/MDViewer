"""Экспорт текущего документа в автономный HTML-файл."""
import json
import os
import threading
import time
import uuid
from datetime import datetime

import webview

from . import config, durable, errors
from .paths import BUILD_DIR, CSS_DIR, LIB_DIR
from .state import alert, call_js, state

FILE_TYPES = ('HTML files (*.html)', 'All files (*.*)')
GENERIC_ERROR = 'Произошла ошибка экспорта. Попробуйте ещё раз.'
# Экспорт ждёт не общее время, а продвижение: столько секунд без единой отметки
# из страницы (картинка, схема) — и подготовка считается зависшей.
IDLE_TIMEOUT = 60
# Больше этого страница продлить ожидание не может, даже для долгого шага.
MAX_PATIENCE = 600
_TIMED_OUT = object()
_CANCELLED = object()

_jobs = {}
_jobs_lock = threading.Lock()


class _Job:
    def __init__(self):
        self.id = uuid.uuid4().hex
        self.last = time.monotonic()
        self.patience = IDLE_TIMEOUT
        self.cancelled = threading.Event()

    def touch(self, patience=0):
        try:
            wanted = int(patience or 0)
        except (TypeError, ValueError):
            wanted = 0
        self.last = time.monotonic()
        self.patience = min(max(IDLE_TIMEOUT, wanted), MAX_PATIENCE)

    def stalled(self):
        return time.monotonic() - self.last > self.patience


def note_progress(job_id, patience=0):
    """Страница продвинулась. patience — сколько ждать следующей отметки, секунд."""
    with _jobs_lock:
        job = _jobs.get(job_id)
    if job is not None:
        job.touch(patience)


def cancel(job_id):
    with _jobs_lock:
        job = _jobs.get(job_id)
    if job is not None:
        job.cancelled.set()


def export_with_saved_settings():
    settings = config.export_settings()
    export_html(settings['theme'], settings['save_path'], settings.get('embed_images', False))


def export_html(theme='current', save_path='', embed_images=None):
    """theme: 'dark' | 'light' | 'current'. save_path: папка; пусто — спросить диалогом.

    embed_images: встроить картинки в HTML. None — взять значение из настроек.
    """
    if state.html_mode:
        call_js('hideExportBusy')
        alert('Экспорт недоступен: HTML-файл открыт в режиме только для чтения')
        return
    call_js('showExportBusy')
    try:
        if theme == 'current':
            theme = call_js('getCurrentTheme') or 'dark'
        if theme not in ('dark', 'light'):
            theme = 'dark'
        if embed_images is None:
            embed_images = bool(config.export_settings().get('embed_images', False))
        else:
            embed_images = bool(embed_images)
        job = _Job()
        with _jobs_lock:
            _jobs[job.id] = job
        try:
            body_html = _await_js('prepareExportBody', theme, embed_images, job.id, job=job)
        finally:
            with _jobs_lock:
                _jobs.pop(job.id, None)
        if body_html is _CANCELLED or (isinstance(body_html, dict) and body_html.get('cancelled')):
            return
        if body_html is _TIMED_OUT:
            _fail_export(
                f'Ошибка экспорта: подготовка документа остановилась — {_stall_text(job.patience)} '
                'не было никакого продвижения. Попробуйте ещё раз.'
            )
            return
        if isinstance(body_html, dict) and body_html.get('error'):
            _fail_export(
                body_html.get('message') or GENERIC_ERROR,
                body_html.get('line'),
                body_html.get('endLine'),
            )
            return
        if not isinstance(body_html, str):
            _fail_export(GENERIC_ERROR)
            return
        try:
            html = build_html(body_html, theme, config.column_width())
        except FileNotFoundError as e:
            name = os.path.basename(e.filename or '')
            _fail_export(f'Ошибка экспорта: не найден файл программы «{name}». Переустановите MD Viewer.')
            return

        call_js('setExportProgress', 'Сохраняем файл…', False)
        path = _choose_target_path(save_path)
        if not path:
            return
        try:
            durable.write_text(path, html, backup=False, newline=None)
        except OSError as e:
            _fail_export(errors.message('сохранить файл', os.path.basename(path), e))
    finally:
        call_js('hideExportBusy')


def _fail_export(message, line=None, end_line=None):
    """Снять плашку до alert, иначе сообщение остаётся под затемнением.

    line, end_line: строки с ошибкой (с 1) — после alert выделить их в редакторе.
    """
    call_js('hideExportBusy')
    alert(message)
    if isinstance(line, int) and line > 0:
        last = end_line if isinstance(end_line, int) and end_line >= line else line
        call_js('selectEditorLine', line, last)


def _stall_text(seconds):
    minutes = max(1, round(seconds / 60))
    return 'больше минуты' if minutes == 1 else f'больше {minutes} мин'


def _await_js(function, *args, job):
    """Дождаться Promise из JS. evaluate_js сам по себе Promise не ждёт.

    Ждём, пока job получает отметки хода. Отменили — _CANCELLED,
    отметок слишком долго нет — _TIMED_OUT.
    """
    params = ', '.join(json.dumps(arg, ensure_ascii=False) for arg in args)
    done = threading.Event()
    box = {}

    def finish(value):
        box['value'] = value
        done.set()

    state.window.evaluate_js(f'{function}({params})', finish)
    while not done.wait(0.25):
        if job.cancelled.is_set():
            return _CANCELLED
        if job.stalled():
            return _TIMED_OUT
    return box.get('value')


def _choose_target_path(save_dir):
    if save_dir and os.path.isdir(save_dir):
        name = 'document-' + datetime.now().strftime('%Y%m%d-%H%M%S') + '.html'
        return os.path.join(save_dir, name)
    result = state.window.create_file_dialog(
        webview.FileDialog.SAVE, save_filename='document.html', file_types=FILE_TYPES
    )
    return result[0] if result else None


def build_html(body_html, theme, column='reading'):
    has_charts = 'data-chart-code="' in body_html
    if column not in ('reading', 'wide', 'full'):
        column = 'reading'
    styles = _read(CSS_DIR / 'preview.css') + _read(CSS_DIR / 'export.css')

    parts = [
        '<!DOCTYPE html>',
        f'<html lang="ru" data-theme="{theme}">',
        '<head>',
        '<meta charset="UTF-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
        f'<meta name="color-scheme" content="{theme}">',
        '<title>MD Viewer — Export</title>',
        f'<style>{styles}</style>',
    ]
    if has_charts:
        parts.append(_inline_script(_read(LIB_DIR / 'chart.umd.min.js')))
    parts += [
        '</head>', '<body>',
        f'<div id="preview" data-column="{column}"><div class="mdv-column">{body_html}</div></div>',
    ]
    if has_charts:
        parts.append(_inline_script(_read(BUILD_DIR / 'export-charts.js')))
    parts += ['</body>', '</html>']
    return '\n'.join(parts)


def _inline_script(code):
    # «</script» внутри кода закрыл бы тег раньше времени
    return '<script>' + code.replace('</script', '<\\/script') + '</script>'


def _read(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()
