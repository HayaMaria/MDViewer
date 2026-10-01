// ===== Строка состояния =====
(function () {
  var saveEl = document.getElementById('status-save');

  function setSaveStatus(text, state) {
    saveEl.textContent = text;
    saveEl.className = 'status-item status-save ' + state;
  }

  window.updateStatusBarCursor = function (line, col) {
    document.getElementById('status-line').textContent = line;
    document.getElementById('status-col').textContent = col;
  };

  window.setFileName = function (name) {
    document.getElementById('status-filename').textContent = name || 'Новый документ';
  };

  // В режиме просмотра HTML-файла «Сохранено/Не сохранено» не имеют смысла
  window.setReadOnlyStatus = function () {
    setSaveStatus('Только чтение', 'readonly');
  };

  window.markSaved = function () {
    if (window.__htmlMode) window.setReadOnlyStatus();
    else setSaveStatus('Сохранено', 'saved');
  };

  window.markUnsaved = function () {
    if (window.__htmlMode) window.setReadOnlyStatus();
    else setSaveStatus('Не сохранено', 'unsaved');
  };
})();
