// ===== Панель поиска и замены (Ctrl+F) =====
(function () {
  var panel = document.getElementById('search-panel');
  var searchInput = document.getElementById('search-input');
  var replaceInput = document.getElementById('replace-input');
  var countEl = document.getElementById('search-count');
  var searchDebounce = null;

  function isOpen() {
    return panel.style.display === 'flex';
  }

  function open() {
    panel.style.display = 'flex';
    searchInput.focus();
    searchInput.select();
    if (searchInput.value) window.setSearchMatchHighlight(searchInput.value);
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(updateCount, 50);
  }

  function close() {
    panel.style.display = 'none';
    countEl.textContent = '';
    window.setSearchMatchHighlight('');
  }

  // «номер текущего / всего» — текущим считается совпадение под курсором
  function updateCount() {
    var q = searchInput.value;
    if (!q) { countEl.textContent = ''; return; }
    var positions = window.getSearchMatchPositions(q);
    if (!positions.length) { countEl.textContent = '0 / 0'; return; }
    var head = window.getSearchCursorPos();
    var idx = 1;
    for (var i = 0; i < positions.length; i++) {
      if (head >= positions[i][0] && head <= positions[i][1]) { idx = i + 1; break; }
    }
    countEl.textContent = idx + ' / ' + positions.length;
  }

  function find(dir) {
    if (!searchInput.value) return;
    window.findText(searchInput.value, dir);
    updateCount();
  }

  function closeOnEscape(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  // Пункт меню «Правка → Поиск» (editor.js → searchEditor)
  document.addEventListener('mdv-search-open', open);

  searchInput.addEventListener('input', function () {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(function () {
      var q = searchInput.value;
      window.setSearchMatchHighlight(q);
      if (q) find('next');
      else countEl.textContent = '';
    }, 200);
  });

  searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      find(e.shiftKey ? 'prev' : 'next');
    }
    closeOnEscape(e);
  });
  replaceInput.addEventListener('keydown', closeOnEscape);

  document.getElementById('search-next').addEventListener('click', function () { find('next'); });
  document.getElementById('search-prev').addEventListener('click', function () { find('prev'); });
  document.getElementById('search-close').addEventListener('click', close);

  document.getElementById('replace-one').addEventListener('click', function () {
    if (!searchInput.value) return;
    window.replaceOne(searchInput.value, replaceInput.value);
    find('next');
  });

  document.getElementById('replace-all').addEventListener('click', function () {
    if (!searchInput.value) return;
    window.replaceAllSearch(searchInput.value, replaceInput.value);
    updateCount();
  });

  // Перехват Ctrl+F на фазе захвата — раньше CodeMirror
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && (e.code === 'KeyF' || (e.key && e.key.toLowerCase() === 'f'))) {
      e.preventDefault();
      e.stopPropagation();
      if (isOpen()) close();
      else open();
    }
  }, true);
})();
