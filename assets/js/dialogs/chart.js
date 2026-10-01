// ===== Диалог «Настройка Chart.js графика» =====
(function () {
  var FALLBACK_CHART = '```chart\ntype: column\ntitle: Пример\n| Категория | Значение |\n|-----------|----------|\n| A         | 10       |\n| B         | 20       |\n```';
  var seriesIndex = 0;

  function value(id) {
    return document.getElementById(id).value.trim();
  }

  window.openChartConfig = function () {
    seriesIndex = 0;
    document.getElementById('chart-series-list').innerHTML = '';
    window.addChartSeries();
    generateChartTemplate();
    openModal('chart-config-overlay');
  };

  window.addChartSeries = function () {
    var n = ++seriesIndex;
    var div = document.createElement('div');
    div.id = 'chart-series-' + n;
    div.className = 'data-block';
    div.innerHTML =
      '<div class="data-block-header">' +
      '<label class="field-label field-label-sm">Ряд ' + n + '</label>' +
      (n > 1 ? '<button class="btn-remove" onclick="removeChartSeries(' + n + ')">&times;</button>' : '') +
      '</div>' +
      '<textarea id="chart-series-data-' + n + '" rows="2" class="input input-sm input-mono" placeholder="Значения ряда ' + n + '"></textarea>' +
      separatorSelectHtml('chart-series-sep-' + n);
    document.getElementById('chart-series-list').appendChild(div);
    div.addEventListener('input', generateChartTemplate);
    div.addEventListener('change', generateChartTemplate);
  };

  window.removeChartSeries = function (n) {
    document.getElementById('chart-series-' + n).remove();
    generateChartTemplate();
  };

  // При галочке «Первая строка — заголовки» первое значение уходит в заголовок
  function takeHeader(values, headerRow, fallback) {
    return (headerRow && values.shift()) || fallback;
  }

  function collectSeries(headerRow) {
    var series = [];
    document.querySelectorAll('#chart-series-list .data-block').forEach(function (block) {
      var n = block.id.replace('chart-series-', '');
      var values = splitValues(
        document.getElementById('chart-series-data-' + n).value,
        document.getElementById('chart-series-sep-' + n).value
      );
      var name = takeHeader(values, headerRow, 'Ряд ' + (series.length + 1));
      if (values.length) series.push({ name: name, values: values });
    });
    return series;
  }

  // Собрать блок ```chart из полей диалога и показать его в поле «Шаблон»
  function generateChartTemplate() {
    var output = document.getElementById('chart-template');
    var warn = document.getElementById('chart-warning');
    var headerRow = document.getElementById('chart-header-row').checked;
    var categories = splitValues(document.getElementById('chart-categories').value, document.getElementById('chart-sep-categories').value);
    var categoryHeader = takeHeader(categories, headerRow, 'Категория');
    var series = collectSeries(headerRow);
    var points = series.reduce(function (max, s) { return Math.max(max, s.values.length); }, categories.length);
    if (!series.length || !points) {
      output.value = '';
      warn.style.display = 'none';
      return;
    }

    var lines = ['```chart', 'type: ' + document.getElementById('chart-type').value];
    if (value('chart-title')) lines.push('title: ' + value('chart-title'));
    if (value('chart-xlabel')) lines.push('xlabel: ' + value('chart-xlabel'));
    if (value('chart-ylabel')) lines.push('ylabel: ' + value('chart-ylabel'));

    var header = [categoryHeader].concat(series.map(function (s) { return s.name; }));
    lines.push('| ' + header.join(' | ') + ' |');
    lines.push('| ' + header.map(function () { return '---------'; }).join(' | ') + ' |');
    for (var p = 0; p < points; p++) {
      var row = [categories[p] || 'Точка ' + (p + 1)].concat(series.map(function (s) { return s.values[p] || '0'; }));
      lines.push('| ' + row.join(' | ') + ' |');
    }
    lines.push('```');
    output.value = lines.join('\n');

    var badSeries = [];
    series.forEach(function (s, i) {
      if (s.values.some(function (v) { return isNaN(parseFloat(v)); })) badSeries.push(i + 1);
    });
    warn.style.display = badSeries.length ? 'block' : 'none';
    warn.textContent = badSeries.length
      ? '⚠ Ряд(ы) ' + badSeries.join(', ') + ' содержат текст вместо чисел — график не отобразится'
      : '';
  }

  ['chart-type', 'chart-title', 'chart-xlabel', 'chart-ylabel', 'chart-categories', 'chart-sep-categories', 'chart-header-row'].forEach(function (id) {
    var el = document.getElementById(id);
    el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', generateChartTemplate);
  });
  document.getElementById('chart-sep-categories').innerHTML = SEPARATOR_OPTIONS_HTML;

  window.runInsertChart = function () {
    insertText('\n' + (document.getElementById('chart-template').value || FALLBACK_CHART) + '\n');
    closeModal('chart-config-overlay');
  };
})();
