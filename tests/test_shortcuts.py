import pytest

from app import _is_blocked_browser_key, _shortcut_script

VK_F5, VK_F12 = 0x74, 0x7B
VK_R, VK_P, VK_I, VK_J, VK_C = 0x52, 0x50, 0x49, 0x4A, 0x43
VK_B, VK_U = 0x42, 0x55


@pytest.mark.parametrize('vk, ctrl, shift', [
    (VK_F5, False, False),      # перезагрузка
    (VK_F5, True, False),       # перезагрузка без кэша
    (VK_F5, False, True),
    (VK_R, True, False),
    (VK_R, True, True),
    (VK_P, True, False),        # печать
    (VK_P, True, True),         # печать через системное окно
    (VK_F12, False, False),     # инструменты разработчика
    (VK_I, True, True),
    (VK_J, True, True),
    (VK_C, True, True),
])
def test_browser_keys_blocked(vk, ctrl, shift):
    assert _is_blocked_browser_key(vk, ctrl, shift)


@pytest.mark.parametrize('vk, ctrl, shift', [
    (VK_R, False, False),       # обычная буква при наборе текста
    (VK_P, False, True),
    (VK_I, True, False),        # курсив
    (VK_C, True, False),        # копировать
    (VK_B, True, False),
    (VK_U, True, False),
])
def test_editor_keys_pass(vk, ctrl, shift):
    assert not _is_blocked_browser_key(vk, ctrl, shift)


def test_underline_still_handled():
    assert 'toggleUnderline' in _shortcut_script(VK_U, False)
