// ===== Автосохранение: период отсчитывается от последней правки =====
// Ждёт поток Python (arm_autosave). setInterval страницы здесь не используется:
// в окне приложения он не держит выбранные секунды.
(function () {
  var enabled = false;
  var epoch = 0;
  var armTimer = null;

  function armLater() {
    if (!enabled) return;
    var ticket = epoch;
    if (armTimer) clearTimeout(armTimer);
    armTimer = setTimeout(function () {
      armTimer = null;
      if (ticket !== epoch || !enabled) return;
      if (!window.isDocumentDirty || !window.isDocumentDirty()) return;
      callApi('arm_autosave');
    }, 0);
  }

  // Вызов из markUnsaved: каждая правка начинает период заново
  window.scheduleAutosave = function () {
    armLater();
  };

  // Вызов из markSaved: отменить отсчёт, начатый до этой отметки
  window.noteAutosaveSaved = function () {
    epoch += 1;
    if (armTimer) {
      clearTimeout(armTimer);
      armTimer = null;
    }
    var ticket = epoch;
    setTimeout(function () {
      if (ticket !== epoch) return;
      if (window.isDocumentDirty && window.isDocumentDirty()) return;
      callApi('disarm_autosave');
    }, 0);
  };

  window.isAutosaveEnabled = function () {
    return enabled;
  };

  window.applyAutosaveSettings = function (autosave) {
    var seconds = parseInt(autosave && autosave.interval, 10);
    if (!seconds || seconds < 1) seconds = 30;
    enabled = !!(autosave && autosave.enabled);
    epoch += 1;
    if (armTimer) {
      clearTimeout(armTimer);
      armTimer = null;
    }
    callApi('configure_autosave', enabled, seconds).then(function () {
      if (enabled) armLater();
    });
  };
})();
