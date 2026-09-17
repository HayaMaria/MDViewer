import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

Chart.defaults.color = '#d4d4d4';
Chart.defaults.backgroundColor = '#1e1e1e';
Chart.defaults.borderColor = '#444';
// Дополнительные цвета темы для заголовков и сетки (обновляются при смене темы)
Chart.defaults.headColor = '#e1e1e1';
Chart.defaults.gridColor = '#333';

window.Chart = Chart;

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
    if (typeMatch) type = typeMatch[1].trim().toLowerCase();
    else if (titleMatch) title = titleMatch[1].trim();
    else if (xlMatch) xlabel = xlMatch[1].trim();
    else if (ylMatch) ylabel = ylMatch[1].trim();
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

  const labels = [];
  const values = [];
  for (let i = 1; i < tableLines.length; i++) {
    const cells = tableLines[i].split('|').filter(c => c.trim()).map(c => c.trim());
    if (cells.length < 2) continue;
    const val = parseFloat(cells[1]);
    if (!isNaN(val)) {
      labels.push(cells[0]);
      values.push(val);
    }
  }
  if (labels.length === 0) {
    // Были строки таблицы, но ни одно значение не является числом
    if (tableLines.length > 2) {
      return { type, title, xlabel, ylabel, labels, values, error: 'nonumeric' };
    }
    return null;
  }
  return { type, title, xlabel, ylabel, labels, values };
}

// Экспортируем внутренности для использования в standalone HTML (экспорт)
window.__chartHelpers = { COLORS, parseChartDSL };

// Делаем renderChart доступным глобально для смены темы
window.renderChart = renderChart;

export function renderChart(codeText, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
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
        data: { labels: parsed.labels, datasets: [{
          label: parsed.title || 'Values', data: parsed.values,
          backgroundColor: COLORS.slice(0, parsed.labels.length),
          borderColor: COLORS.slice(0, parsed.labels.length), borderWidth: 1,
        }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { title: { display: !!parsed.title, text: parsed.title, color: Chart.defaults.headColor }, legend: { display: false } },
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
        data: { labels: parsed.labels, datasets: [{
          label: parsed.title || 'Values', data: parsed.values,
          borderColor: COLORS[0], backgroundColor: COLORS[0] + '33',
          fill: true, tension: 0.3,
          pointBackgroundColor: COLORS[0], pointBorderColor: Chart.defaults.backgroundColor,
        }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { title: { display: !!parsed.title, text: parsed.title, color: Chart.defaults.headColor }, legend: { display: false } },
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
        data: { labels: parsed.labels, datasets: [{
          data: parsed.values,
          backgroundColor: COLORS.slice(0, parsed.labels.length),
          borderColor: Chart.defaults.backgroundColor, borderWidth: 2,
        }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            title: { display: !!parsed.title, text: parsed.title, color: Chart.defaults.headColor },
            legend: { labels: { color: Chart.defaults.color } },
            tooltip: {
              callbacks: {
                label: function(ctx) {
                  const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
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
        data: { labels: parsed.labels, datasets: [{
          label: parsed.title || 'Values', data: parsed.values,
          backgroundColor: COLORS[0] + '33',
          borderColor: COLORS[0],
          pointBackgroundColor: COLORS[0],
          pointBorderColor: Chart.defaults.backgroundColor,
          pointRadius: 4,
        }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { title: { display: !!parsed.title, text: parsed.title, color: Chart.defaults.headColor }, legend: { display: false } },
          scales: {
            r: { grid: { color: Chart.defaults.gridColor }, angleLines: { color: Chart.defaults.gridColor }, pointLabels: { color: Chart.defaults.color }, beginAtZero: true, ticks: { display: false, stepSize: 1 } },
          },
        },
      };
      break;
  }

  if (config) {
    const chart = new Chart(canvas.getContext('2d'), config);
  }
}