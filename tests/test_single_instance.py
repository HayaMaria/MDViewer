"""Одна копия программы: вторая копия отдаёт файлы первой по каналу."""
import threading
import uuid

import pytest

from mdviewer.win import single_instance


@pytest.fixture
def pipe(monkeypatch):
    # Свой канал, чтобы тест не задел запущенный MD Viewer
    name = rf'\\.\pipe\MDViewer-test-{uuid.uuid4().hex}'
    monkeypatch.setattr(single_instance, '_address', lambda: name)
    monkeypatch.setattr(single_instance, '_REPLY_TIMEOUT', 5)
    return name


def test_second_claim_is_refused(pipe):
    first = single_instance.claim()
    try:
        assert first is not None
        assert single_instance.claim() is None
    finally:
        first.close()


def test_files_reach_first_copy(pipe):
    received = []
    done = threading.Event()

    def handler(files):
        received.append(files)
        done.set()
        return True

    listener = single_instance.hand_over(['C:/a.md'])
    try:
        assert listener not in (None, True)
        single_instance.serve(listener, handler)
        assert single_instance.hand_over(['C:/b.md', 42]) is True
        assert done.wait(5)
        assert received == [['C:/b.md']]
    finally:
        listener.close()


def test_closing_copy_is_retried_then_given_up(pipe):
    listener = single_instance.claim()
    try:
        single_instance.serve(listener, lambda files: False)
        assert single_instance.hand_over([], attempts=2) is None
    finally:
        listener.close()


def test_nobody_listening_means_first(pipe):
    listener = single_instance.hand_over([])
    try:
        assert listener not in (None, True)
    finally:
        listener.close()
