// ===== Диалоги «Настройки» и «Экспортировать HTML как...» =====
(function () {
  var DEFAULT_FONT_SIZE = 15;
  var COLUMN_WIDTHS = ['reading', 'wide', 'full'];
  var savedFontSize = DEFAULT_FONT_SIZE;
  var spellWordsDraft = [];
  var SIZE_SELECTS = {
    table: 'settings-size-table',
    image: 'settings-size-image',
    mermaid: 'settings-size-mermaid',
    uml: 'settings-size-uml',
    chart: 'settings-size-chart',
  };

  function setRadio(name, value) {
    document.querySelectorAll('input[name="' + name + '"]').forEach(function (r) {
      r.checked = r.value === value;
    });
  }

  function getRadio(name) {
    var checked = document.querySelector('input[name="' + name + '"]:checked');
    return checked ? checked.value : null;
  }

  function pickFolderInto(inputId) {
    callApi('pick_folder').then(function (path) {
      if (path) document.getElementById(inputId).value = path;
    });
  }

  window.applyColumnWidth = function (value) {
    var mode = COLUMN_WIDTHS.indexOf(value) >= 0 ? value : 'reading';
    var preview = document.getElementById('preview');
    if (preview) preview.setAttribute('data-column', mode);
  };

  function showFontSize(size) {
    document.getElementById('settings-font-size-value').textContent = size + 'px';
    window.setEditorFontSize(size);
  }

  function readMediaSizes() {
    var sizes = {};
    Object.keys(SIZE_SELECTS).forEach(function (key) {
      var n = parseInt(document.getElementById(SIZE_SELECTS[key]).value, 10);
      sizes[key] = window.MEDIA_SIZE_OPTIONS.indexOf(n) >= 0 ? n : window.MEDIA_SIZE_DEFAULTS[key];
    });
    return sizes;
  }

  function fillSettingsSizeSelects(sizes) {
    Object.keys(SIZE_SELECTS).forEach(function (key) {
      window.fillMediaSizeSelect(SIZE_SELECTS[key], (sizes && sizes[key]) || window.MEDIA_SIZE_DEFAULTS[key]);
    });
    var table = document.getElementById(SIZE_SELECTS.table);
    var width = parseInt(sizes && sizes.table, 10);
    table.insertAdjacentHTML('afterbegin', '<option value="0">' + window.TABLE_AUTO_LABEL + '</option>');
    table.value = window.MEDIA_SIZE_OPTIONS.indexOf(width) >= 0 ? String(width) : '0';
  }

  function spellKey(word) {
    return String(word || '').toLocaleLowerCase('ru-RU');
  }

  function asSpellEntry(item) {
    if (typeof item === 'string') return { word: item, added: '' };
    if (item && typeof item.word === 'string' && item.word) {
      return { word: item.word, added: item.added || '' };
    }
    return null;
  }

  function formatAdded(added) {
    var match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(added || '');
    if (!match) return '';
    return match[3] + '.' + match[2] + '.' + match[1] + ' ' + match[4] + ':' + match[5];
  }

  function stampNow() {
    var now = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate())
      + 'T' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
  }

  function renderSpellCount() {
    var node = document.getElementById('settings-spell-count');
    if (!node) return;
    var count = spellWordsDraft.length;
    node.textContent = count
      ? 'Слов: ' + count
      : 'Пока пусто. Слова добавляются из меню в редакторе.';
  }

  function compareSpellEntries(a, b, mode) {
    if (mode === 'date-asc' || mode === 'date-desc') {
      if (!a.added && !b.added) return a.word.localeCompare(b.word, 'ru');
      if (!a.added) return 1;
      if (!b.added) return -1;
      if (a.added !== b.added) {
        var olderFirst = a.added < b.added ? -1 : 1;
        return mode === 'date-asc' ? olderFirst : -olderFirst;
      }
    }
    return a.word.localeCompare(b.word, 'ru');
  }

  function visibleSpellWords() {
    var query = spellKey(document.getElementById('spell-dict-search').value.trim());
    var mode = document.getElementById('spell-dict-sort').value;
    var list = spellWordsDraft.filter(function (item) {
      return !query || spellKey(item.word).indexOf(query) !== -1;
    });
    list.sort(function (a, b) {
      if (query) {
        var aStart = spellKey(a.word).indexOf(query) === 0 ? 0 : 1;
        var bStart = spellKey(b.word).indexOf(query) === 0 ? 0 : 1;
        if (aStart !== bStart) return aStart - bStart;
      }
      return compareSpellEntries(a, b, mode);
    });
    return list;
  }

  function renderSpellDictionary() {
    var list = document.getElementById('spell-dict-list');
    var empty = document.getElementById('spell-dict-empty');
    var words = visibleSpellWords();
    list.innerHTML = '';
    if (!spellWordsDraft.length) {
      empty.hidden = false;
      empty.textContent = 'Пока пусто. Слова добавляются из меню в редакторе.';
      list.hidden = true;
      return;
    }
    if (!words.length) {
      empty.hidden = false;
      empty.textContent = 'Ничего не найдено.';
      list.hidden = true;
      return;
    }
    empty.hidden = true;
    list.hidden = false;
    words.forEach(function (entry) {
      var item = document.createElement('li');
      item.className = 'spell-dict-item';
      var label = document.createElement('span');
      label.textContent = entry.word;
      var date = document.createElement('span');
      date.className = 'spell-dict-date';
      date.textContent = formatAdded(entry.added);
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-small';
      button.textContent = 'Удалить';
      button.addEventListener('click', function () {
        var key = spellKey(entry.word);
        spellWordsDraft = spellWordsDraft.filter(function (item) {
          return spellKey(item.word) !== key;
        });
        renderSpellCount();
        renderSpellDictionary();
      });
      item.appendChild(label);
      item.appendChild(date);
      item.appendChild(button);
      list.appendChild(item);
    });
  }

  window.openSpellDictionary = function () {
    document.getElementById('spell-dict-search').value = '';
    renderSpellDictionary();
    openModal('spell-dict-overlay');
    document.getElementById('spell-dict-search').focus();
  };

  window.closeSpellDictionary = function () {
    closeModal('spell-dict-overlay');
  };

  // Слово, добавленное из редактора, пока диалог открыт, попадает в черновик.
  window.noteSpellUserWord = function (word) {
    if (!word) return;
    var settingsOpen = document.getElementById('settings-overlay').classList.contains('open');
    var dictOpen = document.getElementById('spell-dict-overlay').classList.contains('open');
    if (!settingsOpen && !dictOpen) return;
    var key = spellKey(word);
    var exists = spellWordsDraft.some(function (item) {
      return spellKey(item.word) === key;
    });
    if (exists) return;
    spellWordsDraft.push({ word: word, added: stampNow() });
    renderSpellCount();
    if (dictOpen) renderSpellDictionary();
  };

  // ----- Настройки -----
  window.openSettingsDialog = function () {
    callApi('get_settings').then(function (s) {
      setRadio('settings-mode', s.export.mode);
      setRadio('settings-theme', s.export.theme);
      document.getElementById('settings-export-path').value = s.export.save_path || s.downloads_dir;
      document.getElementById('settings-md-path').value = s.md_save_dir || s.downloads_dir;
      savedFontSize = s.font_size;
      document.getElementById('settings-font-size').value = s.font_size;
      showFontSize(s.font_size);
      if (s.media_size_options && s.media_size_options.length) {
        window.MEDIA_SIZE_OPTIONS = s.media_size_options;
      }
      fillSettingsSizeSelects(s.media_sizes);
      setRadio('settings-column', COLUMN_WIDTHS.indexOf(s.column_width) >= 0 ? s.column_width : 'reading');
      var spell = s.spellcheck || { enabled: true };
      document.getElementById('settings-spellcheck-enabled').checked = !!spell.enabled;
      spellWordsDraft = (s.user_words || []).map(asSpellEntry).filter(Boolean);
      renderSpellCount();
      openModal('settings-overlay');
    });
  };

  // Ползунок меняет шрифт сразу, поэтому при отмене возвращаем сохранённый размер
  window.cancelSettings = function () {
    window.setEditorFontSize(savedFontSize);
    closeModal('spell-dict-overlay');
    closeModal('settings-overlay');
  };

  window.pickExportFolder = function () { pickFolderInto('settings-export-path'); };
  window.pickMDFolder = function () { pickFolderInto('settings-md-path'); };

  window.saveSettings = function () {
    var mediaSizes = readMediaSizes();
    var spellOn = document.getElementById('settings-spellcheck-enabled').checked;
    var spellWords = spellWordsDraft.map(function (item) {
      return { word: item.word, added: item.added || '' };
    });
    callApi('save_settings', {
      font_size: parseInt(document.getElementById('settings-font-size').value, 10) || DEFAULT_FONT_SIZE,
      export: {
        mode: getRadio('settings-mode') || 'full',
        theme: getRadio('settings-theme') || 'current',
        save_path: document.getElementById('settings-export-path').value,
      },
      md_save_dir: document.getElementById('settings-md-path').value,
      media_sizes: mediaSizes,
      column_width: getRadio('settings-column') || 'reading',
      spellcheck: { enabled: spellOn },
      user_words: spellWords,
    }).then(function () {
      window.applyColumnWidth(getRadio('settings-column') || 'reading');
      window.applyMediaSizeDefaults(mediaSizes);
      if (window.setSpellUserWords) window.setSpellUserWords(spellWords);
      if (window.setSpellcheckEnabled) window.setSpellcheckEnabled(spellOn);
      closeModal('spell-dict-overlay');
      closeModal('settings-overlay');
    });
  };

  // Предпросмотр размера шрифта при перемещении ползунка
  document.getElementById('settings-font-size').addEventListener('input', function () {
    showFontSize(parseInt(this.value, 10) || DEFAULT_FONT_SIZE);
  });

  document.getElementById('settings-spell-open').addEventListener('click', function () {
    window.openSpellDictionary();
  });
  document.getElementById('spell-dict-search').addEventListener('input', renderSpellDictionary);
  document.getElementById('spell-dict-sort').addEventListener('change', renderSpellDictionary);

  // ----- Экспортировать HTML как... -----
  window.openExportAsDialog = function () {
    callApi('get_settings').then(function (s) {
      setRadio('exportas-mode', s.export.mode);
      setRadio('exportas-theme', s.export.theme);
      document.getElementById('exportas-path').value = s.export.save_path;
    });
    openModal('export-as-overlay');
  };

  window.pickExportAsFolder = function () { pickFolderInto('exportas-path'); };

  window.runExportAs = function () {
    callApi('export_html',
      getRadio('exportas-mode') || 'full',
      getRadio('exportas-theme') || 'current',
      document.getElementById('exportas-path').value
    ).then(function () {
      closeModal('export-as-overlay');
    });
  };
})();
