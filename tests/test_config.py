"""Настройки и свой словарь: битые данные заменяются значениями по умолчанию."""
import json

import pytest

from mdviewer import config


def write_config(data):
    with open(config.CONFIG_PATH, 'w', encoding='utf-8') as handle:
        handle.write(data if isinstance(data, str) else json.dumps(data))


def minimal_settings(**extra):
    settings = {'font_size': 15}
    settings.update(extra)
    return settings


# ----- загрузка -----

def test_no_config_gives_defaults():
    ui = config.ui_settings()
    assert ui['font_size'] == 15
    assert ui['theme'] == 'dark'
    assert ui['column_width'] == 'reading'
    assert ui['spellcheck'] == {'enabled': True}
    assert ui['media_sizes'] == config.MEDIA_SIZE_DEFAULTS


@pytest.mark.parametrize('content', ['не json', '[1, 2, 3]', '"строка"', ''])
def test_broken_config_gives_defaults(content):
    write_config(content)
    assert config.load_config() == {}
    assert config.ui_settings()['font_size'] == 15


def test_broken_config_uses_backup():
    config.save_config({'theme': 'light'})
    config.load_config()  # удачное чтение делает запасную копию
    write_config('{обрыв')
    assert config.load_config() == {'theme': 'light'}


# ----- размер шрифта -----

@pytest.mark.parametrize('value, expected', [
    (5, 10), (10, 10), (15, 15), (30, 30), (99, 30), (-3, 10),
    ('20', 20), (None, 15), ('abc', 15), (18.7, 18),
])
def test_clamp_font_size(value, expected):
    assert config.clamp_font_size(value) == expected


def test_set_font_size_saves_clamped():
    assert config.set_font_size(42) == 30
    assert config.ui_settings()['font_size'] == 30


def test_garbage_font_size_in_file():
    write_config({'fontSize': 'огромный'})
    assert config.ui_settings()['font_size'] == 15


def test_save_settings_clamps_font_size():
    config.save_ui_settings(minimal_settings(font_size=500))
    assert config.ui_settings()['font_size'] == 30


def test_save_settings_without_font_size():
    config.save_ui_settings({})
    assert config.ui_settings()['font_size'] == 15


# ----- размеры медиа и колонка -----

@pytest.mark.parametrize('key, value, expected', [
    ('image', 500, 500),
    ('image', 550, 550),
    ('image', 555, 500),      # не из списка вариантов
    ('image', 5000, 500),
    ('image', 'abc', 500),
    ('table', 0, 0),          # «По содержимому»
    ('image', 0, 500),        # у картинки 0 не бывает
])
def test_clamp_media_size(key, value, expected):
    assert config._clamp_media_size(key, value, 500) == expected


def test_media_sizes_from_settings():
    config.save_ui_settings(minimal_settings(media_sizes={'image': 700, 'chart': 'x'}))
    sizes = config.ui_settings()['media_sizes']
    assert sizes['image'] == 700
    assert sizes['chart'] == config.MEDIA_SIZE_DEFAULTS['chart']


@pytest.mark.parametrize('value, expected', [
    ('wide', 'wide'), ('full', 'full'), ('огромная', 'reading'), (None, 'reading'),
])
def test_column_width(value, expected):
    assert config.column_width({'columnWidth': value}) == expected


def test_export_settings_embed_is_bool():
    config.save_ui_settings(minimal_settings(export={'embed_images': 'yes', 'theme': 'dark'}))
    export = config.export_settings()
    assert export['embed_images'] is True
    assert export['theme'] == 'dark'


def test_save_settings_keeps_theme():
    config.set_value('theme', 'light')
    config.save_ui_settings(minimal_settings())
    assert config.ui_settings()['theme'] == 'light'


# ----- свой словарь -----

def words():
    return [entry['word'] for entry in config.user_dictionary()]


def test_dictionary_absent():
    assert config.user_dictionary() == []


def test_dictionary_cleanup():
    saved = config.save_user_dictionary([
        'Привет', 'привет', '', '   ', 'два слова', '123', 'кое-как', "rock'n'roll", 'abc_',
    ])
    assert [e['word'] for e in saved] == ['Привет', 'кое-как', "rock'n'roll"]
    assert words() == ['Привет', 'кое-как', "rock'n'roll"]


def test_dictionary_keeps_order_and_dates():
    config.save_user_dictionary([
        {'word': 'беркут', 'added': '2026-10-01T12:00:00'},
        {'word': 'аист', 'added': 'вчера'},
    ])
    entries = config.user_dictionary()
    assert [e['word'] for e in entries] == ['беркут', 'аист']
    assert entries[0]['added'] == '2026-10-01T12:00:00'
    assert entries[1]['added'] == ''


def test_old_dictionary_format():
    with open(config.USER_DICT_PATH, 'w', encoding='utf-8') as handle:
        handle.write('слово\nещё\tсегодня\n\n')
    assert words() == ['слово', 'ещё']


def test_add_user_word_no_duplicates():
    config.add_user_word('Markdown')
    config.add_user_word('markdown')
    config.add_user_word('превью')
    assert words() == ['Markdown', 'превью']


def test_add_bad_word_is_ignored():
    config.add_user_word('два слова')
    assert words() == []
