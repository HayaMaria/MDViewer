// ===== Общее для диалогов: открытие/закрытие и разбор вставленных данных =====
window.openModal = function (id) {
  document.getElementById(id).classList.add('open');
};

window.closeModal = function (id) {
  document.getElementById(id).classList.remove('open');
};

// Варианты разделителя значений; «\n» и «\t» хранятся экранированными (как в value <option>)
window.SEPARATOR_OPTIONS_HTML =
  '<option value="auto">Разделитель: авто</option>' +
  '<option value="\\n">Новая строка</option>' +
  '<option value=",">Запятая</option>' +
  '<option value=";">Точка с запятой</option>' +
  '<option value="/">Слэш</option>' +
  '<option value="\\t">Табуляция</option>' +
  '<option value="|">Вертикальная черта</option>' +
  '<option value=" ">Пробел</option>';

window.separatorSelectHtml = function (id) {
  return '<select id="' + id + '" class="input separator-select">' + window.SEPARATOR_OPTIONS_HTML + '</select>';
};

// Разделитель, встречающийся в тексте чаще всего (многострочный текст — по строкам).
// Пробел — только если других разделителей нет, иначе «Иван Петров, Анна» разобьётся по пробелам
window.detectSeparator = function (text) {
  var s = (text || '').trim();
  if (!s || s.indexOf('\n') > -1) return '\n';
  var best = null, bestCount = 0;
  [',', ';', '/', '|', '\t'].forEach(function (sep) {
    var count = s.split(sep).length - 1;
    if (count > bestCount) { bestCount = count; best = sep; }
  });
  return best || (s.indexOf(' ') > -1 ? ' ' : '\n');
};

window.splitValues = function (text, separator) {
  if (!text || !text.trim()) return [];
  var sep = !separator || separator === 'auto' ? window.detectSeparator(text) : separator;
  if (sep === '\\n') sep = '\n';
  if (sep === '\\t') sep = '\t';
  return text.trim().split(sep).map(function (v) { return v.trim(); }).filter(Boolean);
};

// Убрать пустые строки в начале и в конце многострочного текста
window.trimBlankLines = function (text) {
  var lines = text.split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines.join('\n');
};

// ===== Размеры медиа (изображения / схемы / диаграммы / графики) =====
window.MEDIA_SIZE_OPTIONS = [200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 850, 900, 950, 1000];
window.MEDIA_SIZE_DEFAULTS = { image: 500, mermaid: 600, uml: 450, chart: 600 };

window.mediaSizeOptionsHtml = function () {
  var html = '';
  window.MEDIA_SIZE_OPTIONS.forEach(function (n) {
    html += '<option value="' + n + '">' + n + '</option>';
  });
  return html;
};

window.fillMediaSizeSelect = function (selectId, selected) {
  var el = document.getElementById(selectId);
  if (!el) return;
  el.innerHTML = window.mediaSizeOptionsHtml();
  if (selected != null && selected !== '') el.value = String(selected);
};

window.getMediaSizeDefault = function (kind) {
  var defaults = window.__mediaSizeDefaults || window.MEDIA_SIZE_DEFAULTS;
  var n = defaults && defaults[kind];
  return window.MEDIA_SIZE_OPTIONS.indexOf(n) >= 0 ? n : window.MEDIA_SIZE_DEFAULTS[kind] || 600;
};

window.getMediaSizeSelectValue = function (selectId, fallbackKind) {
  var el = document.getElementById(selectId);
  if (el && el.value) {
    var n = parseInt(el.value, 10);
    if (window.MEDIA_SIZE_OPTIONS.indexOf(n) >= 0) return n;
  }
  return fallbackKind ? window.getMediaSizeDefault(fallbackKind) : null;
};

window.applyMediaSizeDefaults = function (sizes) {
  var merged = Object.assign({}, window.MEDIA_SIZE_DEFAULTS, sizes || {});
  window.__mediaSizeDefaults = merged;
  var preview = document.getElementById('preview');
  if (!preview) return;
  preview.style.setProperty('--mdv-default-image', merged.image + 'px');
  preview.style.setProperty('--mdv-default-mermaid', merged.mermaid + 'px');
  preview.style.setProperty('--mdv-default-uml', merged.uml + 'px');
  preview.style.setProperty('--mdv-default-chart', merged.chart + 'px');
  if (window.refreshPreviewMedia) window.refreshPreviewMedia();
};
