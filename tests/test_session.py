"""Сессия: что бы ни лежало в session.json, программа не падает и не теряет текст."""
import json

import pytest

from mdviewer import session


def md_tab(**extra):
    tab = {'html': False}
    tab.update(extra)
    return tab


# ----- normalize_tab -----

@pytest.mark.parametrize('raw', [None, 42, 'text', [], {}, {'path': 'a.md'}])
def test_not_a_tab(raw):
    assert session.normalize_tab(raw) is None


def test_dirty_tab_keeps_draft():
    tab = session.normalize_tab(md_tab(path='C:/a.md', dirty=True, draft='черновик'))
    assert tab['dirty'] is True
    assert tab['draft'] == 'черновик'
    assert tab['title'] == 'a.md'


def test_dirty_without_draft_becomes_clean():
    tab = session.normalize_tab(md_tab(path='C:/a.md', dirty=True))
    assert tab['dirty'] is False
    assert 'draft' not in tab


def test_old_content_field_is_draft():
    tab = session.normalize_tab(md_tab(dirty=True, content='старый формат'))
    assert tab['draft'] == 'старый формат'


def test_clean_tab_does_not_store_draft():
    tab = session.normalize_tab(md_tab(path='C:/a.md', dirty=False, draft='лишнее'))
    assert 'draft' not in tab


@pytest.mark.parametrize('value, expected', [
    (-5, 0), ('abc', 0), (None, 0), (12, 12), ('7', 7),
])
def test_cursor_offsets(value, expected):
    tab = session.normalize_tab(md_tab(anchor=value, head=value))
    assert tab['anchor'] == expected
    assert tab['head'] == expected


@pytest.mark.parametrize('value, expected', [
    (-1, 0.0), (5, 1.0), ('x', 0.0), (float('nan'), 0.0), (0.5, 0.5),
])
def test_scroll_ratio(value, expected):
    assert session.normalize_tab(md_tab(scroll=value))['scroll'] == expected


def test_welcome_only_without_path_and_changes():
    assert session.normalize_tab(md_tab(welcome=True))['welcome'] is True
    assert session.normalize_tab(md_tab(welcome=True, path='C:/a.md'))['welcome'] is False
    assert session.normalize_tab(md_tab(welcome=True, dirty=True, draft='x'))['welcome'] is False


def test_html_tab():
    tab = session.normalize_tab({'html': True, 'path': 'C:/page.html', 'dirty': True})
    assert tab == {
        'html': True, 'path': 'C:/page.html', 'title': 'page.html',
        'welcome': False, 'dirty': False,
    }


def test_title_fallbacks():
    assert session.normalize_tab(md_tab(title='  Моё  '))['title'] == 'Моё'
    assert session.normalize_tab(md_tab(title='   '))['title'] == 'Новый документ'


# ----- normalize_bundle / normalize -----

@pytest.mark.parametrize('active', [5, -1, 'abc', None])
def test_bad_active_index_falls_back_to_first(active):
    bundle = session.normalize_bundle({'tabs': [md_tab(), md_tab()], 'active': active})
    assert bundle['active'] == 0


def test_bundle_skips_garbage_tabs():
    bundle = session.normalize_bundle({'tabs': [None, 'x', md_tab(title='ok')], 'active': 0})
    assert [t['title'] for t in bundle['tabs']] == ['ok']


def test_bundle_without_tabs_is_none():
    assert session.normalize_bundle({'tabs': []}) is None
    assert session.normalize_bundle({'tabs': [None]}) is None


def test_old_single_document_format():
    data = session.normalize({'html': False, 'path': 'C:/a.md'})
    expected_tab = session.normalize_tab(md_tab(path='C:/a.md'))
    assert data == {'windows': [{'tabs': [expected_tab], 'active': 0}]}


def test_windows_with_garbage():
    data = session.normalize({'windows': [None, {'tabs': []}, {'tabs': [md_tab()]}]})
    assert len(data['windows']) == 1


@pytest.mark.parametrize('raw', [None, [], 'text', {}, {'windows': []}, {'windows': [None]}])
def test_not_a_session(raw):
    assert session.normalize(raw) is None


# ----- merge_windows -----

def test_merge_keeps_order_and_drops_duplicates():
    data = {'windows': [
        {'tabs': [md_tab(path='C:/a.md'), md_tab(path='C:/b.md')], 'active': 1},
        {'tabs': [md_tab(path='C:/a.md'), md_tab(path='C:/c.md')], 'active': 0},
    ]}
    merged = session.merge_windows(data)
    assert [t['path'] for t in merged['tabs']] == ['C:/a.md', 'C:/b.md', 'C:/c.md']
    assert merged['active'] == 1


def test_merge_prefers_unsaved_copy():
    data = {'windows': [
        {'tabs': [md_tab(path='C:/a.md')], 'active': 0},
        {'tabs': [md_tab(path='C:/a.md', dirty=True, draft='правки')], 'active': 0},
    ]}
    merged = session.merge_windows(data)
    assert len(merged['tabs']) == 1
    assert merged['tabs'][0]['draft'] == 'правки'


def test_merge_keeps_all_untitled_tabs():
    data = {'windows': [{'tabs': [md_tab(), md_tab()], 'active': 0}]}
    assert len(session.merge_windows(data)['tabs']) == 2


def test_merge_nothing():
    assert session.merge_windows({}) is None
    assert session.merge_windows({'windows': []}) is None


# ----- что стоит восстанавливать -----

def test_pristine_welcome_is_not_worth_restoring():
    welcome = session.normalize_tab(md_tab(welcome=True))
    assert session.is_pristine_welcome(welcome)
    assert session.tab_restorable(welcome)
    assert not session.bundle_restorable({'tabs': [welcome]})


def test_dirty_tab_restorable_without_file(tmp_path):
    tab = session.normalize_tab(md_tab(path=str(tmp_path / 'gone.md'), dirty=True, draft='x'))
    assert session.tab_restorable(tab)


def test_clean_tab_needs_file(tmp_path):
    existing = tmp_path / 'a.md'
    existing.write_text('x', encoding='utf-8')
    assert session.tab_restorable(md_tab(path=str(existing)))
    assert not session.tab_restorable(md_tab(path=str(tmp_path / 'gone.md')))


def test_html_tab_needs_file(tmp_path):
    assert not session.tab_restorable({'html': True, 'path': str(tmp_path / 'gone.html')})


def test_is_restorable_any_window():
    welcome = session.normalize_tab(md_tab(welcome=True))
    draft = session.normalize_tab(md_tab(dirty=True, draft='x'))
    assert session.is_restorable({'windows': [{'tabs': [welcome]}, {'tabs': [draft]}]})
    assert not session.is_restorable({'windows': [{'tabs': [welcome]}]})


# ----- файл session.json -----

def sample():
    tab = md_tab(path='C:/a.md', dirty=True, draft='текст')
    return {'windows': [{'tabs': [tab], 'active': 0}]}


def test_save_and_load_roundtrip():
    session.save_session(sample())
    assert session.load_session() == session.normalize(sample())


def test_load_absent_file():
    assert session.load_session() is None


def test_load_broken_file_uses_backup():
    session.save_session(sample())
    session.load_session()  # удачное чтение делает запасную копию
    with open(session.SESSION_PATH, 'w', encoding='utf-8') as handle:
        handle.write('{"windows": [обрыв')
    assert session.load_session() == session.normalize(sample())


def test_load_broken_file_without_backup():
    with open(session.SESSION_PATH, 'w', encoding='utf-8') as handle:
        handle.write('не json')
    assert session.load_session() is None


def test_load_json_that_is_not_a_session():
    with open(session.SESSION_PATH, 'w', encoding='utf-8') as handle:
        json.dump({'something': 'else'}, handle)
    assert session.load_session() is None


def test_save_garbage_does_not_write():
    session.save_session({'windows': []})
    assert session.load_session() is None


def test_clear_session():
    session.save_session(sample())
    session.clear_session()
    assert session.load_session() is None
