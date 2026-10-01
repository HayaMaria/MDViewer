// ===== Диалог «Настройка таблицы» =====
(function () {
  var MAX_COLS = 100;
  var MAX_ROWS = 500;
  var columnIndex = 0;

  function isTemplateMode() {
    var mode = document.querySelector('input[name="table-mode"]:checked');
    return !mode || mode.value === 'template';
  }

  function markdownRow(cells) {
    return '| ' + cells.join(' | ') + ' |';
  }

  window.switchTableMode = function () {
    var tpl = isTemplateMode();
    document.getElementById('table-template-mode').style.display = tpl ? '' : 'none';
    document.getElementById('table-data-mode').style.display = tpl ? 'none' : '';
    document.getElementById('table-data-msg').style.display = tpl ? 'none' : 'block';
  };

  window.openTableConfig = function () {
    columnIndex = 0;
    document.getElementById('table-columns-list').innerHTML = '';
    document.getElementById('table-data-preview').value = '';
    window.addTableColumn();
    window.addTableColumn();
    window.switchTableMode();
    openModal('table-config-overlay');
    document.getElementById('table-cols').focus();
  };

  window.addTableColumn = function () {
    var n = ++columnIndex;
    var div = document.createElement('div');
    div.id = 'table-col-' + n;
    div.className = 'data-block';
    div.innerHTML =
      '<div class="data-block-header">' +
      '<input id="table-col-name-' + n + '" class="input input-sm" placeholder="Назв. столбца ' + n + '">' +
      '<button class="btn-remove" onclick="removeTableColumn(' + n + ')">&times;</button>' +
      '</div>' +
      '<textarea id="table-col-data-' + n + '" rows="2" class="input input-sm input-mono"></textarea>' +
      separatorSelectHtml('table-col-sep-' + n);
    document.getElementById('table-columns-list').appendChild(div);
    div.addEventListener('input', updateTablePreview);
    div.addEventListener('change', updateTablePreview);
  };

  window.removeTableColumn = function (n) {
    document.getElementById('table-col-' + n).remove();
    updateTablePreview();
  };

  function updateTablePreview() {
    var markdown = buildDataTable();
    document.getElementById('table-data-preview').value = markdown;
    document.getElementById('table-data-msg').style.display = markdown ? 'none' : 'block';
  }

  // Таблица из вставленных значений. Заголовок столбца — его название; если оно пустое,
  // то первое значение (при галочке «Первая строка — заголовки») или «Столбец N»
  function buildDataTable() {
    var headerRow = document.getElementById('table-header-row').checked;
    var cols = [];
    document.querySelectorAll('#table-columns-list .data-block').forEach(function (block, i) {
      var n = block.id.replace('table-col-', '');
      var values = splitValues(
        document.getElementById('table-col-data-' + n).value,
        document.getElementById('table-col-sep-' + n).value
      );
      var firstValue = headerRow ? values.shift() : '';
      var name = document.getElementById('table-col-name-' + n).value.trim() || firstValue || 'Столбец ' + (i + 1);
      cols.push({ name: name, values: values });
    });

    var maxRows = cols.reduce(function (max, c) { return Math.max(max, c.values.length); }, 0);
    if (maxRows === 0) return '';

    var lines = [
      markdownRow(cols.map(function (c) { return c.name; })),
      markdownRow(cols.map(function () { return '---'; })),
    ];
    for (var r = 0; r < maxRows; r++) {
      lines.push(markdownRow(cols.map(function (c) { return c.values[r] || ''; })));
    }
    return '\n' + lines.join('\n') + '\n';
  }

  function buildTableTemplate(cols, rows) {
    var header = [], sep = [], row = [];
    for (var c = 1; c <= cols; c++) {
      header.push('Заголовок ' + c);
      sep.push('-------------');
      row.push('Текст');
    }
    var lines = [markdownRow(header), markdownRow(sep)];
    for (var r = 0; r < rows; r++) lines.push(markdownRow(row));
    return '\n' + lines.join('\n') + '\n';
  }

  document.getElementById('table-header-row').addEventListener('change', updateTablePreview);

  window.runInsertTable = function () {
    if (isTemplateMode()) {
      var cols = parseInt(document.getElementById('table-cols').value, 10) || 3;
      var rows = parseInt(document.getElementById('table-rows').value, 10) || 3;
      insertText(buildTableTemplate(Math.max(1, Math.min(MAX_COLS, cols)), Math.max(1, Math.min(MAX_ROWS, rows))));
    } else {
      var markdown = buildDataTable();
      if (markdown) insertText(markdown);
    }
    closeModal('table-config-overlay');
  };
})();
