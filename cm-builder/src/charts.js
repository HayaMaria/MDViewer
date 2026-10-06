// Рендер блоков ```chart. Chart.js берётся из глобального window.Chart:
// в приложении его кладёт editor.js, в экспортированном HTML — chart.umd.min.js.

const THEME_COLORS = {
  dark: { color: '#d4d4d4', backgroundColor: '#1e1e1e', borderColor: '#444', headColor: '#e1e1e1', gridColor: '#333' },
  light: { color: '#666', backgroundColor: '#ffffff', borderColor: '#ddd', headColor: '#1a1a1a', gridColor: '#e0e0e0' },
};

// headColor и gridColor — собственные поля, читаются в renderChart
export function applyChartTheme(dark) {
  Object.assign(Chart.defaults, THEME_COLORS[dark ? 'dark' : 'light']);
}

const COLORS = [
  '#4c9aff', '#ff6b6b', '#51cf66', '#ffd43b', '#cc5de8',
  '#20c997', '#ff922b', '#748ffc', '#f06595', '#9775fa'
];

function parseChartDSL(text) {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(l => l);
  let type = 'column';
  let title = '';
  let xlabel = '';
  let ylabel = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const typeMatch = line.match(/^type:\s*(.+)/i);
    const titleMatch = line.match(/^title:\s*(.+)/i);
    const xlMatch = line.match(/^xlabel:\s*(.+)/i);
    const ylMatch = line.match(/^ylabel:\s*(.+)/i);
    const widthMatch = line.match(/^width:\s*(.+)/i);
    if (typeMatch) type = typeMatch[1].trim().toLowerCase();
    else if (titleMatch) title = titleMatch[1].trim();
    else if (xlMatch) xlabel = xlMatch[1].trim();
    else if (ylMatch) ylabel = ylMatch[1].trim();
    else if (widthMatch) { /* ширина контейнера — в editor.js */ }
    else break;
  }

  const tableLines = lines.filter(l => l.startsWith('|'));
  if (tableLines.length < 2) return null;

  if (type === 'scatter') {
    const dataMap = {};
    const categories = [];
    for (let i = 1; i < tableLines.length; i++) {
      const cells = tableLines[i].split('|').filter(c => c.trim()).map(c => c.trim());
      if (cells.length < 2) continue;
      const x = parseFloat(cells[0]);
      const y = parseFloat(cells[1]);
      if (isNaN(x) || isNaN(y)) continue;
      if (cells.length >= 3 && cells[2]) {
        const cat = cells[2];
        if (!dataMap[cat]) { dataMap[cat] = []; categories.push(cat); }
        dataMap[cat].push({ x, y });
      } else {
        if (!dataMap._default) dataMap._default = [];
        dataMap._default.push({ x, y });
      }
    }
    if (categories.length === 0) {
      const values = dataMap._default || [];
      if (values.length === 0) return null;
      return { type, title, xlabel, ylabel, labels: null, values, scatterMode: 'simple' };
    }
    const datasets = categories.map((cat, idx) => ({
      label: cat, data: dataMap[cat],
      backgroundColor: COLORS[idx % COLORS.length],
      borderColor: COLORS[idx % COLORS.length],
    }));
    return { type, title, xlabel, ylabel, labels: null, datasets, scatterMode: 'grouped' };
  }

  // Первый столбец — подписи, каждый следующий — свой ряд.
  // Раньше читался только второй столбец, и «добавить ряд» в диалоге не было видно на графике.
  const table = parseNumericTable(tableLines);
  if (!table) return null;
  if (table.error) return { type, title, xlabel, ylabel, labels: [], datasets: [], error: table.error };
  return { type, title, xlabel, ylabel, labels: table.labels, datasets: table.datasets };
}

function tableCells(line) {
  const parts = line.split("|");
  if (parts.length && parts[0].trim() === "") parts.shift();
  if (parts.length && parts[parts.length - 1].trim() === "") parts.pop();
  return parts.map((cell) => cell.trim());
}

function isRuleRow(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseNumericTable(tableLines) {
  if (!tableLines.length) return null;
  const header = tableCells(tableLines[0]);
  const rows = [];
  for (let i = 1; i < tableLines.length; i++) {
    const cells = tableCells(tableLines[i]);
    if (!cells.length || isRuleRow(cells)) continue;
    rows.push(cells);
  }
  const seriesCount = Math.max(0, header.length - 1);
  if (!seriesCount || !rows.length) return null;
  const labels = [];
  const datasets = [];
  for (let col = 1; col < header.length; col++) {
    datasets.push({ label: header[col] || ("Ряд " + col), data: [] });
  }
  rows.forEach((cells) => {
    const values = datasets.map((_, idx) => {
      const n = parseFloat(cells[idx + 1]);
      return Number.isFinite(n) ? n : null;
    });
    if (!values.some((n) => n !== null)) return;
    labels.push(cells[0] || "");
    values.forEach((n, idx) => datasets[idx].data.push(n));
  });
  if (!labels.length) return { error: "nonumeric" };
  return { labels, datasets };
}

// Один ряд рисуется как раньше (у столбцов — свой цвет на каждое значение, легенда скрыта).
// Несколько рядов — отдельный цвет и имя из шапки таблицы.
function styledDatasets(parsed, style) {
  const many = parsed.datasets.length > 1;
  return parsed.datasets.map((ds, idx) => {
    const color = COLORS[idx % COLORS.length];
    if (!many && style === "column") {
      return {
        label: parsed.title || ds.label || "Values",
        data: ds.data,
        backgroundColor: COLORS.slice(0, parsed.labels.length),
        borderColor: COLORS.slice(0, parsed.labels.length),
        borderWidth: 1,
      };
    }
    if (!many && style === "line") {
      return {
        label: parsed.title || ds.label || "Values",
        data: ds.data,
        borderColor: COLORS[0],
        backgroundColor: COLORS[0] + "33",
        fill: true,
        tension: 0.3,
        pointBackgroundColor: COLORS[0],
        pointBorderColor: Chart.defaults.backgroundColor,
      };
    }
    if (!many && style === "pie") {
      return {
        data: ds.data,
        backgroundColor: COLORS.slice(0, parsed.labels.length),
        borderColor: Chart.defaults.backgroundColor,
        borderWidth: 2,
      };
    }
    if (!many && style === "radar") {
      return {
        label: parsed.title || ds.label || "Values",
        data: ds.data,
        backgroundColor: COLORS[0] + "33",
        borderColor: COLORS[0],
        pointBackgroundColor: COLORS[0],
        pointBorderColor: Chart.defaults.backgroundColor,
        pointRadius: 4,
      };
    }
    const item = {
      label: ds.label,
      data: ds.data,
      backgroundColor: style === "line" || style === "radar" ? color + "33" : color,
      borderColor: color,
      borderWidth: style === "pie" ? 2 : 1,
    };
    if (style === "line") {
      item.fill = false;
      item.tension = 0.3;
      item.pointBackgroundColor = color;
      item.pointBorderColor = Chart.defaults.backgroundColor;
    }
    if (style === "radar") {
      item.pointBackgroundColor = color;
      item.pointRadius = 4;
      item.pointBorderColor = Chart.defaults.backgroundColor;
    }
    if (style === "pie") item.borderColor = Chart.defaults.backgroundColor;
    return item;
  });
}

function applyMediaScale(config, zoom) {
  const z = zoom > 0 ? zoom : 1;
  const size = Math.max(1, Math.round(16 * z));
  const titleSize = Math.max(1, Math.round(18 * z));
  const font = { size };
  const titleFont = { size: titleSize };
  const options = config.options || (config.options = {});
  const plugins = options.plugins || (options.plugins = {});
  if (plugins.title) plugins.title.font = titleFont;
  if (plugins.legend) {
    plugins.legend.labels = plugins.legend.labels || {};
    plugins.legend.labels.font = font;
  }
  if (options.scales) {
    Object.keys(options.scales).forEach((key) => {
      const scale = options.scales[key];
      scale.ticks = Object.assign({}, scale.ticks, { font });
      if (scale.title) scale.title.font = font;
      if (scale.pointLabels) scale.pointLabels.font = font;
    });
  }
  ((config.data && config.data.datasets) || []).forEach((ds) => {
    if (ds.pointRadius) ds.pointRadius = Math.max(0.5, ds.pointRadius * z);
    if (ds.pointHoverRadius) ds.pointHoverRadius = Math.max(1, ds.pointHoverRadius * z);
    if (ds.borderWidth) ds.borderWidth = Math.max(0.5, ds.borderWidth * z);
  });
}

export function renderChart(codeText, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  // Уничтожаем прежний инстанс графика на этом контейнере (иначе при каждой
  // перерисовке превью остаются «висящие» инстансы с ResizeObserver'ами)
  try {
    const oldCanvas = container.querySelector('canvas');
    const oldChart = oldCanvas ? Chart.getChart(oldCanvas) : null;
    if (oldChart) oldChart.destroy();
  } catch (e) { }
  const parsed = parseChartDSL(codeText);
  if (!parsed) {
    container.innerHTML = '<p style="color:#ff6b6b;">Ошибка: не удалось разобрать данные графика</p>';
    return;
  }
  if (parsed.error === 'nonumeric') {
    container.innerHTML = '<p style="color:#ff6b6b;">Ошибка: значения рядов должны быть числами</p>';
    return;
  }

  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);

  let config;

  switch (parsed.type) {
    case 'column':
      config = {
        type: 'bar',
        data: { labels: parsed.labels, datasets: styledDatasets(parsed, 'column') },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { title: { display: !!parsed.title, text: parsed.title, color: Chart.defaults.headColor }, legend: { display: parsed.datasets.length > 1, labels: { color: Chart.defaults.color } } },
          scales: {
            y: { beginAtZero: true, grid: { color: Chart.defaults.gridColor }, title: { display: !!parsed.ylabel, text: parsed.ylabel, color: Chart.defaults.color } },
            x: { grid: { display: false }, title: { display: !!parsed.xlabel, text: parsed.xlabel, color: Chart.defaults.color } },
          },
        },
      };
      break;

    case 'line':
      config = {
        type: 'line',
        data: { labels: parsed.labels, datasets: styledDatasets(parsed, 'line') },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { title: { display: !!parsed.title, text: parsed.title, color: Chart.defaults.headColor }, legend: { display: parsed.datasets.length > 1, labels: { color: Chart.defaults.color } } },
          scales: {
            y: { beginAtZero: true, grid: { color: Chart.defaults.gridColor }, title: { display: !!parsed.ylabel, text: parsed.ylabel, color: Chart.defaults.color } },
            x: { grid: { display: false }, title: { display: !!parsed.xlabel, text: parsed.xlabel, color: Chart.defaults.color } },
          },
        },
      };
      break;

    case 'pie':
      config = {
        type: 'pie',
        data: { labels: parsed.labels, datasets: styledDatasets(parsed, 'pie') },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            title: { display: !!parsed.title, text: parsed.title, color: Chart.defaults.headColor },
            legend: { labels: { color: Chart.defaults.color } },
            tooltip: {
              callbacks: {
                label: function(ctx) {
                  const total = ctx.dataset.data.reduce((a, b) => a + (Number(b) || 0), 0);
                  return ctx.label + ': ' + ctx.parsed + ' (' + ((ctx.parsed / total) * 100).toFixed(1) + '%)';
                }
              }
            }
          },
        },
      };
      break;

    case 'scatter':
      if (parsed.scatterMode === 'grouped') {
        config = {
          type: 'scatter',
          data: { datasets: parsed.datasets.map(ds => ({
            label: ds.label, data: ds.data,
            backgroundColor: ds.backgroundColor,
            borderColor: ds.borderColor,
            pointRadius: 3.5, pointHoverRadius: 6,
          })) },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { title: { display: !!parsed.title, text: parsed.title, color: Chart.defaults.headColor }, legend: { labels: { color: Chart.defaults.color } } },
            scales: {
              x: { grid: { color: Chart.defaults.gridColor }, title: { display: !!parsed.xlabel, text: parsed.xlabel || 'X', color: Chart.defaults.color } },
              y: { grid: { color: Chart.defaults.gridColor }, title: { display: !!parsed.ylabel, text: parsed.ylabel || 'Y', color: Chart.defaults.color } },
            },
          },
        };
      } else {
        config = {
          type: 'scatter',
          data: { datasets: [{ label: parsed.title || 'Data', data: parsed.values, backgroundColor: COLORS[0], borderColor: COLORS[0], pointRadius: 3.5, pointHoverRadius: 6 }] },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { title: { display: !!parsed.title, text: parsed.title, color: Chart.defaults.headColor }, legend: { display: false } },
            scales: {
              x: { grid: { color: Chart.defaults.gridColor }, title: { display: !!parsed.xlabel, text: parsed.xlabel || 'X', color: Chart.defaults.color } },
              y: { grid: { color: Chart.defaults.gridColor }, title: { display: !!parsed.ylabel, text: parsed.ylabel || 'Y', color: Chart.defaults.color } },
            },
          },
        };
      }
      break;

    case 'radar':
      config = {
        type: 'radar',
        data: { labels: parsed.labels, datasets: styledDatasets(parsed, 'radar') },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { title: { display: !!parsed.title, text: parsed.title, color: Chart.defaults.headColor }, legend: { display: parsed.datasets.length > 1, labels: { color: Chart.defaults.color } } },
          scales: {
            r: { grid: { color: Chart.defaults.gridColor }, angleLines: { color: Chart.defaults.gridColor }, pointLabels: { color: Chart.defaults.color }, beginAtZero: true, ticks: { display: false, stepSize: 1 } },
          },
        },
      };
      break;
  }

  if (config) {
    const w = parseInt(container.getAttribute("data-mdv-width"), 10) || 600;
    applyMediaScale(config, w / 600);
    new Chart(canvas.getContext('2d'), config);
  }
}