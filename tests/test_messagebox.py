"""Заголовок и значок сообщений Windows."""
from mdviewer.win import messagebox


def test_error_title():
    assert messagebox.title_for('error') == 'MD Viewer — Ошибка'


def test_warning_title():
    assert messagebox.title_for('warning') == 'MD Viewer — Предупреждение'


def test_unknown_kind_is_error():
    assert messagebox.title_for('что-то') == messagebox.title_for('error')


def test_error_icon_and_owner():
    flags = messagebox.flags_for('error', owner=123)
    assert flags & messagebox._MB_ICONERROR
    assert not flags & messagebox._MB_TOPMOST


def test_no_owner_stays_on_top():
    assert messagebox.flags_for('warning', owner=None) & messagebox._MB_TOPMOST
