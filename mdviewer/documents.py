"""Файловые операции: новый документ, открытие .md/.html, сохранение."""
import os
import threading

import webview

from . import APP_TITLE, UNTITLED, config, session
from .htmlfile import inject_fit_width_style, prepare_html_for_preview, read_html_text
from .state import alert, call_js, state

HTML_EXTS = ('.html', '.htm')
# «All files» первым — по умолчанию видны все файлы (.md/.html не серые);
# конкретные фильтры доступны в выпадающем списке «Тип файлов»
OPEN_FILE_TYPES = ('All files (*.*)', 'Markdown files (*.md)', 'HTML files (*.html;*.htm)')
SAVE_FILE_TYPES = ('Markdown files (*.md)', 'All files (*.*)')
READ_ONLY_MESSAGE = 'HTML-файл открыт в режиме только для чтения — сохранение недоступно'
_io_lock = threading.Lock()


def _show_document_name(name):
    state.window.title = f'{APP_TITLE} — {name}'
    call_js('setFileName', name)


def _suspend_session():
    """Пока документ подменяется, снимки прошлого текста не пишем."""
    state.session_epoch += 1
    state.session_paused = True
    try:
        call_js('pauseSessionPersistence', state.session_epoch)
    except Exception:
        pass


def _resume_session(remember):
    state.session_paused = False
    try:
        call_js('resumeSessionPersistence')
    except Exception:
        pass
    if remember:
        remember_session()


def _invalidate_editor_snapshots():
    """Снимки, уже отправленные из JS, относятся к тексту до записи на диск."""
    state.session_epoch += 1
    try:
        call_js('setSessionEpoch', state.session_epoch)
    except Exception:
        pass


def _place_payload(data):
    return {
        'anchor': data.get('anchor', 0),
        'head': data.get('head', 0),
        'scroll': data.get('scroll', 0),
        'previewScroll': data.get('previewScroll', 0),
    }


def _capture_editor_session():
    try:
        snapshot = call_js('captureSessionSnapshot')
    except Exception:
        return None
    return snapshot if isinstance(snapshot, dict) else None


def _session_record(snapshot):
    path = state.opened_path
    if not state.html_mode and not path:
        path = state.current_file
    if state.html_mode:
        return {'html': True, 'path': path}
    snap = snapshot if isinstance(snapshot, dict) else {}
    dirty = bool(snap.get('dirty'))
    record = {
        'html': False,
        'path': path,
        'dirty': dirty,
        'anchor': snap.get('anchor', 0),
        'head': snap.get('head', 0),
        'scroll': snap.get('scroll', 0),
        'previewScroll': snap.get('previewScroll', 0),
    }
    if dirty:
        content = snap.get('content')
        record['draft'] = content if isinstance(content, str) else ''
    return record


def remember_session(snapshot=None, from_js=False):
    """Записать текущее место. Снимок из JS отвергается, если документ уже сменился."""
    if from_js:
        if state.session_paused or state.html_mode or not isinstance(snapshot, dict):
            return
        try:
            epoch = int(snapshot.get('epoch'))
        except (TypeError, ValueError):
            return
        if epoch != state.session_epoch:
            return
        dirty = bool(snapshot.get('dirty'))
        if dirty and not isinstance(snapshot.get('content'), str):
            return
        if not state.persist_session and not dirty:
            return
        if dirty:
            state.persist_session = True
    elif not state.persist_session:
        return
    if not state.html_mode and not isinstance(snapshot, dict):
        snapshot = _capture_editor_session()
        if snapshot is None:
            return
    session.save_session(_session_record(snapshot))


def note_missing_session_file(data):
    """Сессия указывала на файл, которого больше нет. Один раз сообщить и забыть её."""
    path = data.get('path') if isinstance(data, dict) else None
    if not path or data.get('dirty') or os.path.isfile(path):
        return
    session.clear_session()
    alert(f'Файл из прошлого сеанса не найден:\n{path}')


def show_welcome():
    """Приветственный документ. Сам по себе он сессию не создаёт."""
    state.persist_session = False
    state.session_epoch += 1
    session.clear_session()
    call_js('beginWelcomeDocument', state.session_epoch)


def _load_markdown(text, path, place=None, dirty=False, remember=True):
    _suspend_session()
    try:
        call_js('exitHtmlMode')
        state.html_mode = False
        call_js('setEditorContent', text)
        state.current_file = path
        state.opened_path = path
        state.persist_session = True
        _show_document_name(os.path.basename(path) if path else UNTITLED)
        if dirty:
            call_js('markUnsaved')
        else:
            call_js('markSaved')
        call_js('enableSessionTracking')
        if place:
            try:
                call_js('restoreEditorPlace', _place_payload(place))
            except Exception:
                pass
    finally:
        _resume_session(remember)


def new_document():
    _load_markdown('', None)


def open_path(path):
    """Открыть файл по пути: .html/.htm — превью только для чтения, остальное — Markdown."""
    if os.path.splitext(path)[1].lower() in HTML_EXTS:
        return _open_html(path)
    try:
        with open(path, 'r', encoding='utf-8') as f:
            text = f.read()
    except (OSError, UnicodeDecodeError) as e:
        alert(f'Ошибка открытия файла: {e}')
        return False
    _load_markdown(text, path)
    return True


def _open_html(path):
    try:
        html = prepare_html_for_preview(path, read_html_text(path))
    except OSError as e:
        alert(f'Ошибка открытия HTML-файла: {e}')
        return False
    _suspend_session()
    try:
        name = os.path.basename(path)
        call_js('loadHtmlPreview', inject_fit_width_style(html), name)
        # current_file = None защищает HTML-файл от перезаписи через Ctrl+S
        state.current_file = None
        state.opened_path = path
        state.html_mode = True
        state.persist_session = True
        _show_document_name(name)
    finally:
        _resume_session(True)
    return True


def restore_session(data):
    """Вернуть документ прошлого запуска. False — вместо него показывается приветствие."""
    try:
        restored = _restore_session(data)
    except Exception as e:
        alert(f'Не удалось восстановить прошлый сеанс: {e}')
        restored = False
    if not restored:
        show_welcome()
    return restored


def _restore_session(data):
    if not session.is_restorable(data):
        return False
    if data.get('html'):
        return open_path(data['path'])
    if data.get('dirty'):
        _load_markdown(
            data.get('draft') or '',
            data.get('path'),
            place=data,
            dirty=True,
            remember=False,
        )
        return True
    path = data.get('path')
    if not path:
        new_document()
        return True
    try:
        with open(path, 'r', encoding='utf-8') as f:
            text = f.read()
    except (OSError, UnicodeDecodeError) as e:
        alert(f'Ошибка открытия файла: {e}')
        session.clear_session()
        return False
    _load_markdown(text, path, place=data, dirty=False, remember=False)
    return True


def open_file_dialog():
    result = state.window.create_file_dialog(webview.FileDialog.OPEN, file_types=OPEN_FILE_TYPES)
    if result:
        open_path(result[0])


def save():
    if state.html_mode:
        alert(READ_ONLY_MESSAGE)
        return
    if state.current_file:
        _write_editor_content(state.current_file)
    else:
        save_as(config.md_save_dir())


def autosave():
    """Сохранить открытый файл без диалога. Новый документ и HTML пропускаются."""
    if state.html_mode or not state.current_file:
        return False
    return _write_editor_content(state.current_file)


def save_as(initial_dir=''):
    if state.html_mode:
        alert(READ_ONLY_MESSAGE)
        return
    result = state.window.create_file_dialog(
        webview.FileDialog.SAVE,
        directory=initial_dir,
        save_filename=f'{UNTITLED}.md',
        file_types=SAVE_FILE_TYPES,
    )
    if not result or not _write_editor_content(result[0], remember=False):
        return
    state.current_file = result[0]
    state.opened_path = result[0]
    state.persist_session = True
    _show_document_name(os.path.basename(result[0]))
    remember_session()


def _editor_snapshot():
    """Текст и номер правки на момент чтения. Номер нужен, чтобы не сбросить
    флаг «не сохранено», если пользователь успел набрать текст во время записи."""
    snapshot = call_js('captureEditorSnapshot')
    if isinstance(snapshot, dict):
        return snapshot.get('content', ''), snapshot.get('revision')
    content = snapshot if isinstance(snapshot, str) else call_js('getEditorContent')
    return content or '', None


def _write_editor_content(path, remember=True):
    with _io_lock:
        ok = _write_editor_content_unlocked(path)
    if not ok:
        return False
    _invalidate_editor_snapshots()
    if remember:
        remember_session()
    return True


def _write_editor_content_unlocked(path):
    content, revision = _editor_snapshot()
    try:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
    except OSError as e:
        alert(f'Ошибка сохранения: {e}')
        return False
    if revision is None:
        call_js('markSaved')
    else:
        call_js('markSavedIfUnchanged', revision)
    return True
