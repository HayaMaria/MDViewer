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

  function fillTableWidth() {
    var select = document.getElementById('table-width');
    var fallback = window.getTableWidthDefault();
    var label = 'По умолчанию (' + (fallback ? fallback + ' px' : window.TABLE_AUTO_LABEL.toLowerCase()) + ')';
    select.innerHTML = '<option value="">' + label + '</option>' + window.mediaSizeOptionsHtml();
    select.value = '';
  }

  function tableWidthSuffix() {
    var n = parseInt(document.getElementById('table-width').value, 10);
    if (window.MEDIA_SIZE_OPTIONS.indexOf(n) < 0) return '';
    return '{width=' + n + 'px}\n';
  }

  window.openTableConfig = function () {
    columnIndex = 0;
    document.getElementById('table-columns-list').innerHTML = '';
    document.getElementById('table-data-preview').value = '';
    fillTableWidth();
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
    return tableWithWidth(lines);
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
    return tableWithWidth(lines);
  }

  // Пустая строка перед {width=…} обязательна: без неё Markdown
  // считает эту строку ещё одной ячейкой таблицы.
  function tableWithWidth(lines) {
    var suffix = tableWidthSuffix();
    return '\n' + lines.join('\n') + '\n' + (suffix ? '\n' + suffix : '');
  }

  document.getElementById('table-header-row').addEventListener('change', updateTablePreview);
  document.getElementById('table-width').addEventListener('change', updateTablePreview);

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
