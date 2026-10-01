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
