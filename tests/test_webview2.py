"""Проверка WebView2: какие версии из реестра считаются годными."""
import pytest

from mdviewer.win import webview2


@pytest.mark.parametrize('text', ['86.0.622.0', '86.0.622.1', '120.0.2210.91', '86.1'])
def test_new_enough(text):
    assert webview2.version_ok(text)


@pytest.mark.parametrize('text', ['86.0.621.99', '85.9.9999.0', '0.0.0.0', '0'])
def test_too_old(text):
    assert not webview2.version_ok(text)


@pytest.mark.parametrize('text', [None, '', 'abc', '120.x.1', 42])
def test_garbage_is_not_installed(text):
    assert not webview2.version_ok(text)


def test_installed_on_this_machine():
    # Машина разработки без WebView2 программу и не запустит
    assert webview2.is_installed()
