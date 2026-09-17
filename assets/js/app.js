
  

    // ===== Переключение темы (светлая/тёмная) с сохранением через Python =====
    var isDarkTheme = true;

    window.getCurrentTheme = function () {
      return isDarkTheme ? "dark" : "light";
    };

    window.toggleTheme = function () {
      isDarkTheme = !isDarkTheme;
      applyTheme(isDarkTheme);
    };

    function applyTheme(dark) {
      isDarkTheme = dark;
      var root = document.documentElement;
      root.setAttribute('data-theme', dark ? 'dark' : 'light');

      if (typeof Chart !== 'undefined') {
        if (dark) {
          Chart.defaults.color = '#d4d4d4';
          Chart.defaults.backgroundColor = '#1e1e1e';
          Chart.defaults.borderColor = '#444';
          Chart.defaults.headColor = '#e1e1e1';
          Chart.defaults.gridColor = '#333';
        } else {
          Chart.defaults.color = '#666';
          Chart.defaults.backgroundColor = '#ffffff';
          Chart.defaults.borderColor = '#ddd';
          Chart.defaults.headColor = '#1a1a1a';
          Chart.defaults.gridColor = '#e0e0e0';
        }
        // Перерендерим все существующие графики
        document.querySelectorAll("[id^='chart-']").forEach(function (el) {
          var code = decodeURIComponent(el.dataset.chartCode || '');
          if (code && typeof window.renderChart === 'function') {
            window.renderChart(code, el.id);
          }
        });
      }

      // Код Mermaid не трогаем — CSS делает фон прозрачным
    }

    // При загрузке страницы — применяем сохранённую тему из Python
    // Опрашиваем pywebview мост, пока он не появится
    (function checkTheme() {
      if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.get_theme().then(function (theme) {
          applyTheme(theme === 'dark');
        });
      } else {
        setTimeout(checkTheme, 100);
      }
    })();
  

    (function () {
      var panel = document.getElementById('search-panel');
      var searchInput = document.getElementById('search-input');
      var replaceInput = document.getElementById('replace-input');
      var countEl = document.getElementById('search-count');
      var searchDebounce = null;

      function isOpen() { return panel && panel.style.display !== 'none'; }

      window.openSearchBar = function () {
        if (!panel) return;
        panel.style.display = 'flex';
        searchInput.focus();
        searchInput.select();
        // При открытии — подсветка по текущему тексту
        if (searchInput.value && window.setSearchMatchHighlight) {
          window.setSearchMatchHighlight(searchInput.value);
        }
        updateCountDelayed();
      };

      window.closeSearchBar = function () {
        if (!panel) return;
        panel.style.display = 'none';
        countEl.textContent = '';
        if (window.clearSearch) window.clearSearch();
        if (window.setSearchMatchHighlight) window.setSearchMatchHighlight('');
      };

      function updateCountDelayed() {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(updateCount, 50);
      }

      function updateCount() {
        var q = searchInput.value;
        if (!q) { countEl.textContent = ''; return; }
        var positions = window.getSearchMatchPositions ? window.getSearchMatchPositions(q) : [];
        if (!positions || positions.length === 0) { countEl.textContent = '0 / 0'; return; }
        var head = window.getSearchCursorPos ? window.getSearchCursorPos() : 0;
        var idx = 0;
        for (var i = 0; i < positions.length; i++) {
          if (head >= positions[i][0] && head <= positions[i][1]) {
            idx = i + 1; break;
          }
        }
        if (idx === 0) idx = 1; // после replace или если курсор рядом
        countEl.textContent = idx + ' / ' + positions.length;
      }

      function doSearch(dir) {
        var q = searchInput.value;
        if (!q) return;
        if (window.findText) window.findText(q, dir);
        updateCount();
      }

      // Слушаем событие от editor.js
      document.addEventListener('mdv-search-open', function () {
        window.openSearchBar();
      });

      // Ввод с клавиатуры в поле поиска
      searchInput.addEventListener('input', function () {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(function () {
          var q = searchInput.value;
          if (q) {
            if (window.setSearchMatchHighlight) window.setSearchMatchHighlight(q);
            if (window.findText) {
              window.findText(q, 'next');
              updateCount();
            }
          } else {
            countEl.textContent = '';
            if (window.setSearchMatchHighlight) window.setSearchMatchHighlight('');
            if (window.clearSearch) window.clearSearch();
          }
        }, 200);
      });

      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          doSearch(e.shiftKey ? 'prev' : 'next');
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          window.closeSearchBar();
        }
      });

      replaceInput.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          window.closeSearchBar();
        }
      });

      // Кнопки
      document.getElementById('search-next').addEventListener('click', function () { doSearch('next'); });
      document.getElementById('search-prev').addEventListener('click', function () { doSearch('prev'); });
      document.getElementById('search-close').addEventListener('click', function () { window.closeSearchBar(); });

      document.getElementById('replace-one').addEventListener('click', function () {
        var q = searchInput.value;
        var r = replaceInput.value;
        if (q && window.replaceOne) {
          window.replaceOne(q, r);
          updateCount();
          doSearch('next');
        }
      });

      document.getElementById('replace-all').addEventListener('click', function () {
        var q = searchInput.value;
        var r = replaceInput.value;
        if (q && window.replaceAllSearch) {
          window.replaceAllSearch(q, r);
          updateCount();
        }
      });

      // Глобальный перехват Ctrl+F (срабатывает до CodeMirror)
      document.addEventListener('keydown', function (e) {
        if (e.ctrlKey && (e.code === 'KeyF' || (e.key && e.key.toLowerCase() === 'f'))) {
          e.preventDefault();
          e.stopPropagation();
          if (isOpen()) window.closeSearchBar();
          else window.openSearchBar();
        }
      }, true);
    })();
  

    (function () {
      var openDropdown = null;

      window.toggleThemeFromToolbar = function () {
        if (window.pywebview && window.pywebview.api) {
          window.pywebview.api.toggle_theme();
        }
      };

      function closeAllDropdowns() {
        document.querySelectorAll('.menu-dropdown.open').forEach(function (d) {
          d.classList.remove('open');
        });
        document.querySelectorAll('.menu-btn.active').forEach(function (b) {
          b.classList.remove('active');
        });
        openDropdown = null;
      }

      function toggleDropdown(menuId, btn) {
        var dropdown = document.getElementById(menuId);
        if (!dropdown) return;

        if (openDropdown && openDropdown !== dropdown) {
          openDropdown.classList.remove('open');
          var oldBtn = document.querySelector('.menu-btn.active');
          if (oldBtn) oldBtn.classList.remove('active');
        }

        var isOpen = dropdown.classList.contains('open');
        if (isOpen) {
          // Закрываем
          dropdown.classList.remove('open');
          if (btn) btn.classList.remove('active');
          openDropdown = null;
        } else {
          // Открываем
          dropdown.classList.add('open');
          if (btn) btn.classList.add('active');
          openDropdown = dropdown;
        }
      }

      // 1. Клик по .menu-btn — открыть/закрыть дропдаун (если есть data-menu),
      //    или выполнить действие сразу (если data-action без data-menu)
      document.addEventListener('click', function (e) {
        var btn = e.target.closest('.menu-btn');
        if (!btn) return;

        var menuId = btn.getAttribute('data-menu');
        if (menuId) {
          toggleDropdown('menu-' + menuId, btn);
          e.preventDefault();
        } else {
          var action = btn.getAttribute('data-action');
          if (action) {
            if (action.startsWith('js:')) {
              var fnName = action.substring(3);
              if (typeof window[fnName] === 'function') window[fnName]();
            } else {
              if (window.pywebview && window.pywebview.api && typeof window.pywebview.api[action] === 'function') {
                window.pywebview.api[action]();
              }
            }
          }
        }
      });

      // 2. Клик по .menu-item — выполнить действие и закрыть дропдауны
      document.addEventListener('click', function (e) {
        var item = e.target.closest('.menu-item');
        if (!item) return;

        var action = item.getAttribute('data-action');
        if (!action) return;

        closeAllDropdowns();

        if (action.startsWith('js:')) {
          var fnName = action.substring(3);
          if (typeof window[fnName] === 'function') window[fnName]();
        } else {
          if (window.pywebview && window.pywebview.api && typeof window.pywebview.api[action] === 'function') {
            window.pywebview.api[action]();
          }
        }
      });

      // 3. Клик вне любого .menu-group — закрыть дропдаун
      document.addEventListener('click', function (e) {
        if (openDropdown && !e.target.closest('.menu-group')) {
          closeAllDropdowns();
        }
      });

      // 4. Escape — закрыть дропдаун
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && openDropdown) {
          closeAllDropdowns();
        }
      });
    })();
  

    window.showHelp = function (title, text) {
      document.getElementById('help-title').textContent = title;
      // Экранируем HTML-сущности и конвертируем --подзаголовки-- в жирный текст
      var escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/^--\s+(.+?)\s+--$/gm, '<b>$1</b>');
      document.getElementById('help-body').innerHTML = escaped;
      document.getElementById('help-overlay').style.display = 'flex';
    };
    window.closeHelp = function () {
      document.getElementById('help-overlay').style.display = 'none';
    };
  

    window.openSettingsDialog = function (s, d) {
      var e = typeof s === "string" ? JSON.parse(s) : s;
      var v = typeof d === "string" ? JSON.parse(d) : d;
      var a = document.querySelectorAll("#settings-overlay input[name=settings-mode]");
      for (var i = 0; i < a.length; i++) a[i].checked = a[i].value === e.mode;
      var b = document.querySelectorAll("#settings-overlay input[name=settings-theme]");
      for (var i = 0; i < b.length; i++) b[i].checked = b[i].value === e.theme;
      document.getElementById("settings-export-path").value = e.save_path || "";
      document.getElementById("settings-md-path").value = (v && v.default_path) || "";
      document.getElementById("settings-overlay").style.display = "flex";
    };
    window.closeSettingsDialog = function () {
      document.getElementById("settings-overlay").style.display = "none";
    };
    window.pickExportFolder = function () {
      if (window.pywebview && window.pywebview.api)
        window.pywebview.api.pick_folder().then(function (p) { if (p) document.getElementById("settings-export-path").value = p; });
    };
    window.pickMDFolder = function () {
      if (window.pywebview && window.pywebview.api)
        window.pywebview.api.pick_folder().then(function (p) { if (p) document.getElementById("settings-md-path").value = p; });
    };
    window.saveSettings = function () {
      var m = document.querySelector("#settings-overlay input[name=settings-mode]:checked");
      var t = document.querySelector("#settings-overlay input[name=settings-theme]:checked");
      var themeVal = t ? t.value : "current";
      if (window.pywebview && window.pywebview.api)
        window.pywebview.api.save_export_settings(JSON.stringify({
          mode: m ? m.value : "full", theme: themeVal,
          save_path: document.getElementById("settings-export-path").value,
          md_path: document.getElementById("settings-md-path").value
        })).then(function () { closeSettingsDialog(); });
    };
    window.openExportAsDialog = function () {
      if (window.pywebview && window.pywebview.api)
        window.pywebview.api.get_export_settings().then(function (s) {
          var d = JSON.parse(s);
          var a = document.querySelectorAll("#export-as-overlay input[name=exportas-mode]");
          for (var i = 0; i < a.length; i++) a[i].checked = a[i].value === d.mode;
          var b = document.querySelectorAll("#export-as-overlay input[name=exportas-theme]");
          for (var i = 0; i < b.length; i++) b[i].checked = b[i].value === d.theme;
          document.getElementById("exportas-path").value = d.save_path || "";
        });
      document.getElementById("export-as-overlay").style.display = "block";
    };
    window.closeExportAsDialog = function () {
      document.getElementById("export-as-overlay").style.display = "none";
    };
    window.pickExportAsFolder = function () {
      if (window.pywebview && window.pywebview.api)
        window.pywebview.api.pick_folder().then(function (p) { if (p) document.getElementById("exportas-path").value = p; });
    };
    window.runExportAs = function () {
      var m = document.querySelector("#export-as-overlay input[name=exportas-mode]:checked");
      var t = document.querySelector("#export-as-overlay input[name=exportas-theme]:checked");
      var themeVal = t ? t.value : "current";
      if (themeVal === "current") themeVal = isDarkTheme ? "dark" : "light";
      var p = document.getElementById("exportas-path").value;
      if (window.pywebview && window.pywebview.api)
        window.pywebview.api.export_html_as(m ? m.value : "full", themeVal, p).then(function () { closeExportAsDialog(); });
    };
  
// ===== Общие утилиты для разделения данных =====
window.detectSeparator = function (text) {
  if (!text || !text.trim()) return '\n';
  var s = text.trim();
  if (s.indexOf('\n') > -1) return '\n';
  var counts = {};
  var seps = [',', ';', '/', '|', '\t', ' '];
  for (var i = 0; i < seps.length; i++) {
    var c = (s.split(seps[i]).length - 1);
    if (c > 1) counts[seps[i]] = c;
  }
  var best = null, bestCount = 0;
  for (var sep in counts) {
    if (counts[sep] > bestCount) { bestCount = counts[sep]; best = sep; }
  }
  return best || '\n';
};

window.splitValues = function (text, separator) {
  if (!text || !text.trim()) return [];
  var sep = separator || 'auto';
  if (sep === 'auto') sep = window.detectSeparator(text);
  var actualSep = sep;
  if (sep === '\\n') actualSep = '\n';
  if (sep === '\\t') actualSep = '\t';
  return text.trim().split(actualSep).map(function (v) { return v.trim(); }).filter(function (v) { return v; });
};

// ===== Диалог настройки таблицы =====
var TABLE_COLUMN_INDEX = 0;

window.switchTableMode = function () {
  var mode = document.querySelector('input[name="table-mode"]:checked');
  var tpl = mode && mode.value === 'template';
  document.getElementById('table-template-mode').style.display = tpl ? '' : 'none';
  document.getElementById('table-data-mode').style.display = tpl ? 'none' : '';
  document.getElementById('table-data-msg').style.display = tpl ? 'none' : 'block';
};

window.openTableConfig = function () {
  document.getElementById('table-config-overlay').style.display = 'block';
  TABLE_COLUMN_INDEX = 0;
  document.getElementById('table-columns-list').innerHTML = '';
  document.getElementById('table-data-preview').value = '';
  document.getElementById('table-data-msg').style.display = 'block';
  addTableColumn();
  addTableColumn();
  switchTableMode();
  document.getElementById('table-cols').focus();
};

window.closeTableConfig = function () {
  document.getElementById('table-config-overlay').style.display = 'none';
};

window.addTableColumn = function () {
  TABLE_COLUMN_INDEX++;
  var n = TABLE_COLUMN_INDEX;
  var div = document.createElement('div');
  div.id = 'table-col-' + n;
  div.style.cssText = 'border:1px solid var(--border);border-radius:4px;padding:6px;position:relative;';
  div.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
    '<input id="table-col-name-' + n + '" placeholder="Назв. столбца ' + n + '" style="flex:1;padding:3px 6px;border:1px solid var(--border);border-radius:3px;background:var(--bg);color:var(--fg);font-size:12px;">' +
    '<button onclick="removeTableColumn(' + n + ')" style="margin-left:4px;background:none;border:none;color:var(--fg);cursor:pointer;font-size:14px;line-height:1;padding:0 4px;">&times;</button></div>' +
    '<textarea id="table-col-data-' + n + '" rows="2" style="width:100%;padding:3px 6px;border:1px solid var(--border);border-radius:3px;background:var(--bg);color:var(--fg);font-family:Consolas,monospace;font-size:11px;resize:vertical;"></textarea>' +
    '<select id="table-col-sep-' + n + '" style="margin-top:2px;width:100%;padding:2px 4px;border:1px solid var(--border);border-radius:3px;background:var(--bg);color:var(--fg);font-size:11px;" onchange="updateTablePreview()">' +
    '  <option value="auto">Разделитель: авто</option>' +
    '  <option value="\\n">Новая строка</option>' +
    '  <option value=",">Запятая</option>' +
    '  <option value=";">Точка с запятой</option>' +
    '  <option value="/">Слэш</option>' +
    '  <option value="\\t">Табуляция</option>' +
    '  <option value="|">Вертикальная черта</option>' +
    '  <option value=" ">Пробел</option></select>';
  document.getElementById('table-columns-list').appendChild(div);
  var ta = document.getElementById('table-col-data-' + n);
  var ni = document.getElementById('table-col-name-' + n);
  ta.addEventListener('input', updateTablePreview);
  ni.addEventListener('input', updateTablePreview);
};

window.removeTableColumn = function (n) {
  var el = document.getElementById('table-col-' + n);
  if (el) el.remove();
  updateTablePreview();
};

window.updateTablePreview = function () {
  var html = buildDataTable();
  document.getElementById('table-data-preview').value = html;
  document.getElementById('table-data-msg').style.display = html ? 'none' : 'block';
};
// ===== Диалог настройки Mermaid =====
window.buildDataTable = function () {
  var cols = [];
  var i = 1;
  while (document.getElementById('table-col-data-' + i)) {
    var ta = document.getElementById('table-col-data-' + i);
    var sepEl = document.getElementById('table-col-sep-' + i);
    var nameEl = document.getElementById('table-col-name-' + i);
    var sep = sepEl ? sepEl.value : 'auto';
    var values = window.splitValues(ta ? ta.value : '', sep);
    var name = nameEl ? nameEl.value.trim() : '';
    if (!name) name = 'Столбец ' + i;
    cols.push({ name: name, values: values });
    i++;
  }
  if (cols.length === 0) return '';
  var headerRow = document.getElementById('table-header-row').checked;
  var maxRows = 0;
  for (var c = 0; c < cols.length; c++) {
    if (cols[c].values.length > maxRows) maxRows = cols[c].values.length;
  }
  if (maxRows === 0) return '';
  var lines = [];
  for (var r = 0; r < maxRows; r++) {
    var row = [];
    for (var c = 0; c < cols.length; c++) {
      row.push(cols[c].values[r] || '');
    }
    lines.push('| ' + row.join(' | ') + ' |');
  }
  var sepLine = [];
  for (var c = 0; c < cols.length; c++) sepLine.push('---');
  if (headerRow) {
    var hdr = [];
    for (var c = 0; c < cols.length; c++) hdr.push(cols[c].name);
    lines.unshift('| ' + hdr.join(' | ') + ' |');
    lines.splice(1, 0, '| ' + sepLine.join(' | ') + ' |');
  } else {
    var hdr2 = [];
    for (var c = 0; c < cols.length; c++) hdr2.push(cols[c].name);
    lines.unshift('| ' + hdr2.join(' | ') + ' |', '| ' + sepLine.join(' | ') + ' |');
  }
  return '\n' + lines.join('\n') + '\n';
};

window.buildTableTemplate = function (cols, rows) {
  var header = [];
  var sep = [];
  for (var c = 1; c <= cols; c++) {
    header.push('Заголовок ' + c);
    sep.push('-------------');
  }
  var lines = ['| ' + header.join(' | ') + ' |', '| ' + sep.join(' | ') + ' |'];
  for (var r = 1; r <= rows; r++) {
    var row = [];
    for (var c = 1; c <= cols; c++) row.push('Текст');
    lines.push('| ' + row.join(' | ') + ' |');
  }
  return '\n' + lines.join('\n') + '\n';
};

window.runInsertTable = function () {
  var mode = document.querySelector('input[name="table-mode"]:checked');
  if (mode && mode.value === 'data') {
    var html = buildDataTable();
    if (html && window.insertText) window.insertText(html);
  } else {
    var cols = parseInt(document.getElementById('table-cols').value, 10) || 3;
    var rows = parseInt(document.getElementById('table-rows').value, 10) || 3;
    cols = Math.max(1, Math.min(100, cols));
    rows = Math.max(1, Math.min(500, rows));
    if (window.insertText) window.insertText(window.buildTableTemplate(cols, rows));
  }
  closeTableConfig();
};
    window.openMermaidConfig = function () {
      document.getElementById("mermaid-config-overlay").style.display = "block";
    };
    window.closeMermaidConfig = function () {
      document.getElementById("mermaid-config-overlay").style.display = "none";
    };

    var MERMAID_PRESETS = {
      "graph TD": "    A[Начало] --> B{Вопрос?}\n    B -->|Да| C[Конец]\n    B -->|Нет| A",
      "graph LR": "    A[Идея] --> B[Прототип]\n    B --> C[Готово]",
      "graph BT": "    A[1] --> B[2]\n    B --> C[3]",
      "graph RL": "    A[4] --> B[3]\n    B --> C[2]",
      "flowchart TD": "    A[Начало] --> B{Условие}\n    B -- Да --> C[Действие]\n    B -- Нет --> D[Отмена]",
      "flowchart LR": "    A[Вход] --> B[Обработка]\n    B --> C[Выход]",
      "sequenceDiagram": "    participant A как Пользователь\n    participant B как Сервер\n    A->>B: Запрос\n    B-->>A: Ответ",
      "pie": '    "Разработка": 50\n    "Дизайн": 30\n    "Тесты": 20',
      "timeline": '    title История\n    2020: Запуск\n    2021: Рост\n    2022: Лидер',
      "classDiagram": "    class Animal {\n      +String name\n      +eat()\n    }\n    class Dog {\n      +bark()\n    }\n    Dog <|-- Animal",
      "stateDiagram": "    [*] --> Ожидание\n    Ожидание --> Запуск\n    Запуск --> [*]"
    };

    window.runInsertTable = function () {
      var cols = parseInt(document.getElementById("table-cols").value, 10) || 3;
      var rows = parseInt(document.getElementById("table-rows").value, 10) || 3;
      cols = Math.max(1, Math.min(10, cols));
      rows = Math.max(1, Math.min(20, rows));
      if (window.insertText) window.insertText(buildTableTemplate(cols, rows));
      closeTableConfig();
    };
// ===== Диалог настройки Mermaid =====
    window.openMermaidConfig = function () {
      document.getElementById("mermaid-config-overlay").style.display = "block";
    };
    window.closeMermaidConfig = function () {
      document.getElementById("mermaid-config-overlay").style.display = "none";
    };

    var MERMAID_PRESETS = {
      "graph TD": "    A[Начало] --> B{Вопрос?}\n    B -->|Да| C[Конец]\n    B -->|Нет| A",
      "graph LR": "    A[Идея] --> B[Прототип]\n    B --> C[Готово]",
      "graph BT": "    A[1] --> B[2]\n    B --> C[3]",
      "graph RL": "    A[4] --> B[3]\n    B --> C[2]",
      "flowchart TD": "    A[Начало] --> B{Условие}\n    B -- Да --> C[Действие]\n    B -- Нет --> D[Отмена]",
      "flowchart LR": "    A[Вход] --> B[Обработка]\n    B --> C[Выход]",
      "sequenceDiagram": "    participant A как Пользователь\n    participant B как Сервер\n    A->>B: Запрос\n    B-->>A: Ответ",
      "pie": '    "Разработка": 50\n    "Дизайн": 30\n    "Тесты": 20',
      "timeline": '    title История\n    2020: Запуск\n    2021: Рост\n    2022: Лидер',
      "classDiagram": "    class Animal {\n      +String name\n      +eat()\n    }\n    class Dog {\n      +bark()\n    }\n    Dog <|-- Animal",
      "stateDiagram": "    [*] --> Ожидание\n    Ожидание --> Запуск\n    Запуск --> [*]"
    };

    window.syncMermaidContent = function () {
      var sel = document.getElementById("mermaid-type");
      var type = sel ? sel.value : "graph TD";
      var ta = document.getElementById("mermaid-content");
      if (ta && MERMAID_PRESETS[type]) ta.value = MERMAID_PRESETS[type];
    };
    var mmSel = document.getElementById("mermaid-type");
    if (mmSel) mmSel.addEventListener("change", window.syncMermaidContent);

    window.runInsertMermaid = function () {
      var mtypeEl = document.getElementById("mermaid-type");
      var contentEl = document.getElementById("mermaid-content");
      var type = mtypeEl ? mtypeEl.value : "graph TD";
      var content = contentEl ? contentEl.value : "";
      var parts = content.split("\n");
      while (parts.length && !parts[0].trim()) parts.shift();
      while (parts.length && !parts[parts.length - 1].trim()) parts.pop();
      var dsl = "```mermaid\n" + type + "\n" + parts.join("\n") + "\n```\n";
      if (window.insertText) window.insertText("\n" + dsl);
      closeMermaidConfig();
    };
// ===== Диалог настройки Chart.js =====
var CHART_SERIES_INDEX = 0;

window.openChartConfig = function () {
  document.getElementById('chart-config-overlay').style.display = 'block';
  CHART_SERIES_INDEX = 0;
  document.getElementById('chart-series-list').innerHTML = '';
  document.getElementById('chart-template').value = '';
  addChartSeries();
  generateChartTemplate();
};

window.closeChartConfig = function () {
  document.getElementById('chart-config-overlay').style.display = 'none';
};

window.addChartSeries = function () {
  CHART_SERIES_INDEX++;
  var n = CHART_SERIES_INDEX;
  var div = document.createElement('div');
  div.id = 'chart-series-' + n;
  div.style.cssText = 'display:flex;gap:6px;align-items:flex-start;';
  div.innerHTML = '<div style="flex:1;min-width:140px;">' +
    '<label style="font-weight:bold;display:block;margin-bottom:2px;font-size:12px;">Ряд ' + n + '</label>' +
    '<textarea id="chart-series-data-' + n + '" rows="2" placeholder="Значения ряда ' + n + '" style="width:100%;padding:3px 6px;border:1px solid var(--border);border-radius:3px;background:var(--bg);color:var(--fg);font-family:Consolas,monospace;font-size:11px;resize:vertical;"></textarea>' +
    '<select id="chart-series-sep-' + n + '" style="margin-top:2px;width:100%;padding:2px 4px;border:1px solid var(--border);border-radius:3px;background:var(--bg);color:var(--fg);font-size:11px;" onchange="generateChartTemplate()">' +
    '  <option value="auto">Разделитель: авто</option>' +
    '  <option value="\\n">Новая строка</option>' +
    '  <option value=",">Запятая</option>' +
    '  <option value=";">Точка с запятой</option>' +
    '  <option value="/">Слэш</option>' +
    '  <option value="\\t">Табуляция</option>' +
    '  <option value="|">Вертикальная черта</option>' +
    '  <option value=" ">Пробел</option></select>' +
    (n > 1 ? '<button onclick="removeChartSeries(' + n + ')" style="margin-top:2px;background:none;border:none;color:var(--fg);cursor:pointer;font-size:16px;padding:0 4px;">&times;</button>' : '') +
    '</div>';
  document.getElementById('chart-series-list').appendChild(div);
  var ta = document.getElementById('chart-series-data-' + n);
  ta.addEventListener('input', generateChartTemplate);
};

window.removeChartSeries = function (n) {
  var el = document.getElementById('chart-series-' + n);
  if (el) el.remove();
  generateChartTemplate();
};

window.generateChartTemplate = function () {
  var typeEl = document.getElementById('chart-type');
  var titleEl = document.getElementById('chart-title');
  var xlabelEl = document.getElementById('chart-xlabel');
  var ylabelEl = document.getElementById('chart-ylabel');
  var catTA = document.getElementById('chart-categories');
  var catSepEl = document.getElementById('chart-sep-categories');
  var ta = document.getElementById('chart-template');
  if (!ta) return;

  var type = typeEl ? typeEl.value : 'column';
  var title = titleEl ? titleEl.value.trim() : '';
  var xl = xlabelEl ? xlabelEl.value.trim() : '';
  var yl = ylabelEl ? ylabelEl.value.trim() : '';

  // Категории
  var catSep = catSepEl ? catSepEl.value : 'auto';
  var categories = window.splitValues(catTA ? catTA.value : '', catSep);

  // Собираем ряды
  var series = [];
  var si = 1;
  while (document.getElementById('chart-series-data-' + si)) {
    var sTA = document.getElementById('chart-series-data-' + si);
    var sSepEl = document.getElementById('chart-series-sep-' + si);
    var sSep = sSepEl ? sSepEl.value : 'auto';
    var values = window.splitValues(sTA ? sTA.value : '', sSep);
    if (values.length > 0) series.push(values);
    si++;
  }
  if (series.length === 0) { ta.value = ''; return; }

  var headerRow = document.getElementById('chart-header-row').checked;
  var maxPoints = Math.max(categories.length, series[0].length);
  for (var s = 0; s < series.length; s++) {
    if (series[s].length > maxPoints) maxPoints = series[s].length;
  }
  if (maxPoints === 0) { ta.value = ''; return; }

  var lines = ['```chart', 'type: ' + type];
  if (title) lines.push('title: ' + title);
  if (xl) lines.push('xlabel: ' + xl);
  if (yl) lines.push('ylabel: ' + yl);

  // Заголовок таблицы
  var hdr = ['Категория'];
  for (var s = 0; s < series.length; s++) hdr.push('Ряд ' + (s + 1));
  lines.push('| ' + hdr.join(' | ') + ' |');
  var sep = [];
  for (var c = 0; c < hdr.length; c++) sep.push('---------');
  lines.push('| ' + sep.join(' | ') + ' |');

  // Данные
  for (var p = 0; p < maxPoints; p++) {
    var row = [categories[p] || ('Точка ' + (p + 1))];
    for (var s = 0; s < series.length; s++) {
      row.push(series[s][p] || '0');
    }
    lines.push('| ' + row.join(' | ') + ' |');
  }
  lines.push('```');

  ta.value = lines.join('\n');

  // Валидация: проверяем что все значения рядов — числа
  var warn = document.getElementById('chart-warning');
  if (warn) {
    var badSeries = [];
    for (var si = 0; si < series.length; si++) {
      for (var vi = 0; vi < series[si].length; vi++) {
        if (isNaN(parseFloat(series[si][vi]))) {
          badSeries.push(si + 1);
          break;
        }
      }
    }
    if (badSeries.length > 0) {
      warn.style.display = 'block';
      warn.textContent = '⚠ Ряд(ы) ' + badSeries.join(', ') + ' содержат текст вместо чисел — график не отобразится';
    } else {
      warn.style.display = 'none';
    }
  }
};

function bindChartInputs() {
  var ids = ['chart-type', 'chart-title', 'chart-xlabel', 'chart-ylabel', 'chart-categories', 'chart-sep-categories'];
  for (var i = 0; i < ids.length; i++) {
    var el = document.getElementById(ids[i]);
    if (el) el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', generateChartTemplate);
  }
}
bindChartInputs();

window.runInsertChart = function () {
  var ta = document.getElementById('chart-template');
  if (ta && ta.value && window.insertText) {
    window.insertText('\n' + ta.value + '\n');
  } else {
    // Если шаблон пуст — вставляем простой шаблон с column
    var fallback = '\n```chart\ntype: column\ntitle: Пример\n| Категория | Значение |\n|-----------|----------|\n| A         | 10       |\n| B         | 20       |\n```\n';
    if (window.insertText) window.insertText(fallback);
  }
  closeChartConfig();
};