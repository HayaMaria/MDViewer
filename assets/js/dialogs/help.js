// ===== Справка: текст из assets/texts, заголовок — подпись пункта меню =====
window.openHelp = function (fileName, menuItem) {
  var version = callApi('app_version').catch(function () { return ''; });
  fetch('texts/' + fileName)
    .then(function (response) { return response.text(); })
    .then(function (text) {
      return version.then(function (v) {
        // «{version}» в тексте — номер версии из mdviewer/__init__.py
        return text.replace(/\{version\}/g, v || '?');
      });
    })
    .then(function (text) {
      document.getElementById('help-title').textContent = menuItem.textContent.trim();
      var body = document.getElementById('help-body');
      // Строки вида «-- Подзаголовок --» выделяются жирным
      body.innerHTML = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/^--\s+(.+?)\s+--$/gm, '<b>$1</b>');
      openModal('help-overlay');
      // Окно справки одно на все пункты: без сброса новый текст открывался
      // с прокруткой предыдущего. Сбрасываем после показа: скрытому окну
      // прокрутку не задать.
      body.scrollTop = 0;
    });
};
