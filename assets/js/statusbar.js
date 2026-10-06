// ===== Строка состояния =====
(function () {
  var saveEl = document.getElementById('status-save');
  var dirty = false;
  var revision = 0;

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

  window.isDocumentDirty = function () {
    return dirty && !window.__htmlMode;
  };

  // Снимок для сохранения: номер правки и текст читаются вместе,
  // чтобы запись на диск соответствовала этому номеру.
  window.captureEditorSnapshot = function () {
    return {
      revision: revision,
      content: window.getEditorContent ? window.getEditorContent() : '',
    };
  };

  window.markSaved = function () {
    dirty = false;
    if (window.noteAutosaveSaved) window.noteAutosaveSaved();
    if (window.__htmlMode) window.setReadOnlyStatus();
    else setSaveStatus('Сохранено', 'saved');
  };

  // Не затирать «Не сохранено», если после снимка документ уже изменился
  window.markSavedIfUnchanged = function (rev) {
    if (Number(revision) === Number(rev)) window.markSaved();
  };

  window.markUnsaved = function () {
    if (window.__suppressDirty) return;
    if (window.__htmlMode) {
      window.setReadOnlyStatus();
      return;
    }
    revision += 1;
    dirty = true;
    setSaveStatus('Не сохранено', 'unsaved');
    if (window.scheduleAutosave) window.scheduleAutosave();
  };
})();
