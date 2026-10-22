// ===== Диалог «Настройка таблицы» =====
(function () {
  var MAX_COLS = 100;
  var MAX_ROWS = 500;
  var columnIndex = 0;
  var rowIndex = 0;

  function isTemplateMode() {
    var mode = document.querySelector('input[name="table-mode"]:checked');
    return !mode || mode.value === 'template';
  }

  function isColumnFill() {
    var mode = document.querySelector('input[name="table-fill"]:checked');
    return !mode || mode.value === 'columns';
  }

  function markdownRow(cells) {
    return '| ' + cells.join(' | ') + ' |';
  }

  function dataHint() {
    return isColumnFill()
      ? 'Вставьте данные в поля столбцов'
      : 'Вставьте данные в поля строк';
  }

  window.switchTableMode = function () {
    var tpl = isTemplateMode();
    document.getElementById('table-template-mode').style.display = tpl ? '' : 'none';
    document.getElementById('table-data-mode').style.display = tpl ? 'none' : '';
    updateTablePreview();
  };

  window.switchTableFill = function () {
    var columns = isColumnFill();
    document.getElementById('table-columns-pane').style.display = columns ? '' : 'none';
    document.getElementById('table-rows-pane').style.display = columns ? 'none' : '';
    document.getElementById('table-fill-hint').textContent = columns
      ? 'Каждое поле — один столбец. Значения идут сверху вниз.'
      : 'Каждое поле — одна строка. Значения идут слева направо.';
    updateTablePreview();
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
    rowIndex = 0;
    document.getElementById('table-columns-list').innerHTML = '';
    document.getElementById('table-rows-list').innerHTML = '';
    document.getElementById('table-data-preview').value = '';
    fillTableWidth();
    window.addTableColumn();
    window.addTableColumn();
    window.addTableRow();
    window.addTableRow();
    window.switchTableFill();
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

  window.addTableRow = function () {
    var n = ++rowIndex;
    var div = document.createElement('div');
    div.id = 'table-row-' + n;
    div.className = 'data-block';
    div.innerHTML =
      '<div class="data-block-header">' +
      '<label class="field-label field-label-sm">Строка ' + n + '</label>' +
      '<button class="btn-remove" onclick="removeTableRow(' + n + ')">&times;</button>' +
      '</div>' +
      '<textarea id="table-row-data-' + n + '" rows="2" class="input input-sm input-mono" placeholder="Ячейка 1, ячейка 2, ячейка 3"></textarea>' +
      separatorSelectHtml('table-row-sep-' + n);
    document.getElementById('table-rows-list').appendChild(div);
    div.addEventListener('input', updateTablePreview);
    div.addEventListener('change', updateTablePreview);
  };

  window.removeTableRow = function (n) {
    document.getElementById('table-row-' + n).remove();
    updateTablePreview();
  };

  function updateTablePreview() {
    var markdown = isTemplateMode() ? '' : buildDataTable();
    document.getElementById('table-data-preview').value = markdown;
    var msg = document.getElementById('table-data-msg');
    msg.textContent = dataHint();
    msg.style.display = (!isTemplateMode() && !markdown) ? 'block' : 'none';
  }

  function buildDataTable() {
    return isColumnFill() ? buildColumnTable() : buildRowTable();
  }

  // Таблица из вставленных столбцов. Заголовок столбца — его название; если оно пустое,
  // то первое значение (при галочке «Первая строка — заголовки») или «Столбец N»
  function buildColumnTable() {
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

  // Таблица из вставленных строк: каждое поле — ячейки слева направо.
  // При галочке первая строка становится заголовками, иначе «Столбец N».
  function buildRowTable() {
    var headerFromFirst = document.getElementById('table-header-row').checked;
    var rows = [];
    document.querySelectorAll('#table-rows-list .data-block').forEach(function (block) {
      var n = block.id.replace('table-row-', '');
      var values = splitValues(
        document.getElementById('table-row-data-' + n).value,
        document.getElementById('table-row-sep-' + n).value
      );
      if (values.length) rows.push(values);
    });
    if (!rows.length) return '';

    var headers = headerFromFirst ? rows.shift() : null;
    if (headerFromFirst && !rows.length) return '';

    var width = rows.reduce(function (max, row) {
      return Math.max(max, row.length);
    }, headers ? headers.length : 0);
    if (!headers) headers = [];
    for (var c = headers.length + 1; c <= width; c++) headers.push('Столбец ' + c);

    var lines = [
      markdownRow(headers),
      markdownRow(headers.map(function () { return '---'; })),
    ];
    rows.forEach(function (row) {
      lines.push(markdownRow(headers.map(function (_, i) { return row[i] || ''; })));
    });
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
