// ===== Режим просмотра HTML-файла (только чтение) =====
// HTML-файл показывается на всю ширину окна в изолированном iframe (srcdoc);
// редактор, разделитель и панель форматирования при этом скрыты.
window.__htmlMode = false;

// В srcdoc родитель не видит drag. Скрипт только шлёт postMessage,
// чтобы окно показало рамку и забрало мышь у iframe.
function previewFrameFileDrop() {
  function isFiles(e) {
    var types = e.dataTransfer && e.dataTransfer.types;
    if (!types) return false;
    for (var i = 0; i < types.length; i++) {
      if (types[i] === 'Files') return true;
    }
    return false;
  }
  function tell(phase) {
    try {
      parent.postMessage({ source: 'mdv-file-drop', phase: phase }, '*');
    } catch (err) {}
  }
  window.addEventListener('dragenter', function (e) {
    if (isFiles(e)) tell('enter');
  }, true);
  window.addEventListener('dragover', function (e) {
    if (isFiles(e)) tell('over');
  }, true);
  window.addEventListener('dragleave', function (e) {
    if (!e.relatedTarget) tell('leave');
  }, true);
  window.addEventListener('drop', function (e) {
    if (isFiles(e)) tell('leave');
  }, true);
}

// Вызывается из Python (documents._open_html)
window.loadHtmlPreview = function (html, name) {
  window.__htmlMode = true;
  // Очищаем редактор, пока он ещё доступен для правок, затем блокируем
  window.setEditorContent('');
  window.setEditorReadOnly(true);
  document.body.classList.add('html-view');
  document.getElementById('fmt-bar').style.display = 'none';

  var previewEl = document.getElementById('preview');
  previewEl.classList.add('html-mode');
  previewEl.innerHTML = '';
  var frame = document.createElement('iframe');
  frame.className = 'html-view-frame';
  frame.setAttribute('title', name || 'HTML');
  // Без allow-same-origin: скрипты файла работают, но iframe получает
  // непрозрачный origin и не имеет доступа к родителю и pywebview API.
  // postMessage родителю при этом разрешён — так превью сообщает о броске файла.
  frame.setAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox');
  frame.srcdoc = '<script>(' + previewFrameFileDrop + ')();<\/script>' + html;
  previewEl.appendChild(frame);

  window.setFileName(name || 'document.html');
  window.setReadOnlyStatus();
};

// Вызывается из Python перед загрузкой Markdown; вне html-режима ничего не делает
window.exitHtmlMode = function () {
  if (!window.__htmlMode) return;
  window.__htmlMode = false;
  document.body.classList.remove('html-view');
  window.setEditorReadOnly(false);
  document.getElementById('fmt-bar').style.display = '';
  var previewEl = document.getElementById('preview');
  previewEl.classList.remove('html-mode');
  previewEl.innerHTML = '';
  // DOM превью очищен извне — перерисовываем без проверки «текст не менялся»
  window.forceUpdatePreview();
  window.__cmView.requestMeasure();
  window.markSaved();
};
