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


def _path_key(path):
    """Один и тот же файл не открываем второй вкладкой. На Windows регистр не важен."""
    if not isinstance(path, str) or not path:
        return None
    return os.path.normcase(os.path.abspath(path))


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


def _bundle_dirty(snapshot):
    tabs = snapshot.get('tabs') if isinstance(snapshot, dict) else None
    if not isinstance(tabs, list):
        return False
    return any(isinstance(tab, dict) and tab.get('dirty') and not tab.get('html') for tab in tabs)


def _bundle_ok(snapshot):
    tabs = snapshot.get('tabs') if isinstance(snapshot, dict) else None
    if not isinstance(tabs, list) or not tabs:
        return False
    for tab in tabs:
        if not isinstance(tab, dict):
            return False
        if tab.get('dirty') and not tab.get('html'):
            content = tab.get('content')
            draft = tab.get('draft')
            if not isinstance(content, str) and not isinstance(draft, str):
                return False
    return True


def remember_session(snapshot=None, from_js=False):
    """Записать вкладки. Снимок из JS отвергается, если документ уже сменился."""
    if from_js:
        if state.session_paused or not isinstance(snapshot, dict):
            return
        try:
            epoch = int(snapshot.get('epoch'))
        except (TypeError, ValueError):
            return
        if epoch != state.session_epoch:
            return
        if not _bundle_ok(snapshot):
            return
        dirty = _bundle_dirty(snapshot)
        if not state.persist_session and not dirty:
            return
        if dirty:
            state.persist_session = True
    elif not state.persist_session:
        return
    if not isinstance(snapshot, dict) or 'tabs' not in snapshot:
        snapshot = _capture_editor_session()
        if not _bundle_ok(snapshot):
            return
    session.save_session(snapshot)


def note_missing_session_file(data):
    """Сессия указывала на файлы, которых больше нет. Сообщить, если открывать нечего."""
    tabs = data.get('tabs') if isinstance(data, dict) else None
    if not isinstance(tabs, list):
        return
    missing = []
    for tab in tabs:
        if not isinstance(tab, dict) or tab.get('dirty'):
            continue
        path = tab.get('path')
        if isinstance(path, str) and path and not os.path.isfile(path):
            missing.append(path)
    if not missing or session.is_restorable(data):
        return
    session.clear_session()
    alert('Файл из прошлого сеанса не найден:\n' + '\n'.join(missing))


def show_welcome():
    """Приветственная вкладка. Сама по себе она сессию не создаёт."""
    state.persist_session = False
    state.session_epoch += 1
    state.current_file = None
    state.opened_path = None
    state.html_mode = False
    session.clear_session()
    _show_document_name(UNTITLED)
    call_js('beginWelcomeDocument', state.session_epoch)


def bind_active(info):
    """JS переключил вкладку: подстроить путь, режим и заголовок окна.

    Возвращает номер эпохи, чтобы снимок, снятый до переключения, не затёр новый.
    """
    if not isinstance(info, dict):
        return state.session_epoch
    state.session_epoch += 1
    html = bool(info.get('html'))
    path = info.get('path')
    if not isinstance(path, str) or not path:
        path = None
    state.html_mode = html
    state.opened_path = path
    state.current_file = None if html else path
    state.persist_session = bool(info.get('persist'))
    if not state.persist_session:
        session.clear_session()
    title = info.get('title')
    if not isinstance(title, str) or not title.strip():
        title = os.path.basename(path) if path else UNTITLED
    _show_document_name(title.strip())
    return state.session_epoch


def _markdown_spec(text, path, place=None, dirty=False, title=None):
    spec = {
        'text': text if isinstance(text, str) else '',
        'path': path,
        'pathKey': _path_key(path),
        'title': title or (os.path.basename(path) if path else UNTITLED),
        'dirty': bool(dirty),
        'html': False,
        'welcome': False,
    }
    if place:
        spec.update(_place_payload(place))
    return spec


def _focus_open_path(path):
    """Перейти на вкладку, если этот файл уже открыт."""
    key = _path_key(path)
    if not key:
        return False
    try:
        return bool(call_js('focusOpenPath', key))
    except Exception:
        return False


def _load_markdown(text, path, place=None, dirty=False, remember=True):
    _suspend_session()
    try:
        name = os.path.basename(path) if path else UNTITLED
        call_js('openMarkdownTab', _markdown_spec(text, path, place, dirty, name))
        state.html_mode = False
        state.current_file = path
        state.opened_path = path
        state.persist_session = True
        _show_document_name(name)
    finally:
        _resume_session(remember)


def new_document():
    _load_markdown('', None)


def open_path(path):
    """Открыть файл по пути: .html/.htm — превью только для чтения, остальное — Markdown."""
    if _focus_open_path(path):
        return True
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
        call_js('openHtmlTab', {
            'html': True,
            'htmlContent': inject_fit_width_style(html),
            'path': path,
            'pathKey': _path_key(path),
            'title': name,
            'dirty': False,
            'welcome': False,
        })
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


def _materialize_tab(tab):
    """Прочитать вкладку с диска. None — показать её нельзя."""
    if session.is_pristine_welcome(tab):
        return {
            'welcome': True,
            'html': False,
            'text': '',
            'path': None,
            'pathKey': None,
            'title': tab.get('title') or UNTITLED,
            'dirty': False,
        }
    if not session.tab_restorable(tab):
        return None
    if tab.get('html'):
        path = tab['path']
        try:
            html = prepare_html_for_preview(path, read_html_text(path))
        except OSError:
            return None
        return {
            'html': True,
            'htmlContent': inject_fit_width_style(html),
            'path': path,
            'pathKey': _path_key(path),
            'title': tab.get('title') or os.path.basename(path),
            'dirty': False,
            'welcome': False,
        }
    if tab.get('dirty'):
        return _markdown_spec(tab.get('draft') or '', tab.get('path'), tab, dirty=True, title=tab.get('title'))
    path = tab.get('path')
    if not path:
        return _markdown_spec('', None, tab, dirty=False, title=tab.get('title'))
    try:
        with open(path, 'r', encoding='utf-8') as f:
            text = f.read()
    except (OSError, UnicodeDecodeError):
        return None
    return _markdown_spec(text, path, tab, dirty=False, title=tab.get('title'))


def _restore_session(data):
    if not session.is_restorable(data):
        return False
    prepared = []
    missing = []
    chosen = 0
    active = data.get('active', 0)
    for index, tab in enumerate(data.get('tabs') or []):
        item = _materialize_tab(tab)
        if item is None:
            path = tab.get('path') if isinstance(tab, dict) else None
            if path:
                missing.append(path)
            continue
        if index == active:
            chosen = len(prepared)
        prepared.append(item)
    real = [item for item in prepared if not item.get('welcome')]
    if not real:
        return False
    if missing:
        alert('Файл из прошлого сеанса не найден:\n' + '\n'.join(missing))
    if chosen >= len(prepared):
        chosen = 0
    current = prepared[chosen]
    _suspend_session()
    try:
        call_js('installTabs', {'tabs': prepared, 'active': chosen})
        html = bool(current.get('html'))
        path = current.get('path')
        state.html_mode = html
        state.opened_path = path
        state.current_file = None if html else path
        state.persist_session = True
        _show_document_name(current.get('title') or UNTITLED)
    finally:
        _resume_session(False)
    return True


def open_file_dialog():
    result = state.window.create_file_dialog(webview.FileDialog.OPEN, file_types=OPEN_FILE_TYPES)
    if result:
        open_path(result[0])


def save():
    if state.html_mode:
        alert(READ_ONLY_MESSAGE)
        return False
    if state.current_file:
        return bool(_write_editor_content(state.current_file))
    return bool(save_as(config.md_save_dir()))


def autosave():
    """Сохранить открытый файл без диалога. Новый документ и HTML пропускаются."""
    if state.session_paused or state.html_mode or not state.current_file:
        return False
    try:
        if call_js('autosaveAllowed') is False:
            return False
    except Exception:
        return False
    return _write_editor_content(state.current_file)


def _suggested_save_name():
    """Имя в диалоге «Сохранить как»: файл вкладки или её заголовок.

    От него удобно сделать «Отчёт 2.md» или «Новый документ 2.md», не набирая всё заново.
    """
    if state.current_file:
        name = os.path.basename(state.current_file)
    else:
        title = getattr(state.window, 'title', '') or ''
        prefix = f'{APP_TITLE} — '
        name = title[len(prefix):] if title.startswith(prefix) else ''
        name = name.strip() or UNTITLED
    if not name.lower().endswith('.md'):
        name += '.md'
    return name


def save_as(initial_dir=''):
    if state.html_mode:
        alert(READ_ONLY_MESSAGE)
        return False
    directory = initial_dir
    if not directory and state.current_file:
        directory = os.path.dirname(state.current_file)
    result = state.window.create_file_dialog(
        webview.FileDialog.SAVE,
        directory=directory,
        save_filename=_suggested_save_name(),
        file_types=SAVE_FILE_TYPES,
    )
    if not result or not _write_editor_content(result[0], remember=False):
        return False
    state.current_file = result[0]
    state.opened_path = result[0]
    state.persist_session = True
    name = os.path.basename(result[0])
    _show_document_name(name)
    try:
        call_js('noteActivePath', result[0], name, _path_key(result[0]))
    except Exception:
        pass
    remember_session()
    return True


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


_close_lock = threading.Lock()
_close_started = False


def flush_session_now():
    """Снимок редактора в файл сессии. Страница отдаёт его синхронно, без своего таймера."""
    try:
        snapshot = call_js('flushSessionNow')
    except Exception:
        return
    if isinstance(snapshot, dict):
        remember_session(snapshot, from_js=True)


def request_close(*_args, **_kwargs):
    """Крестик и Alt+F4. False — это закрытие отменяется.

    evaluate_js прямо из обработчика closing на Windows ждёт тот же поток интерфейса
    и окно зависает. Поэтому закрытие откладывается: сначала сессия, потом destroy.
    """
    global _close_started
    if state.force_close:
        return True
    with _close_lock:
        if _close_started:
            return False
        _close_started = True
    threading.Thread(target=_close_after_flush, daemon=True).start()
    return False


def _close_after_flush():
    global _close_started
    try:
        flush_session_now()
    except Exception:
        pass
    state.force_close = True
    try:
        state.window.destroy()
    except Exception:
        state.force_close = False
        with _close_lock:
            _close_started = False
