// ===== Справка: текст из assets/texts, заголовок — подпись пункта меню =====
window.openHelp = function (fileName, menuItem) {
  fetch('texts/' + fileName)
    .then(function (response) { return response.text(); })
    .then(function (text) {
      document.getElementById('help-title').textContent = menuItem.textContent.trim();
      // Строки вида «-- Подзаголовок --» выделяются жирным
      document.getElementById('help-body').innerHTML = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/^--\s+(.+?)\s+--$/gm, '<b>$1</b>');
      openModal('help-overlay');
    });
};
