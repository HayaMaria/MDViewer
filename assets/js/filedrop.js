// Файл из Проводника или с рабочего стола открывается броском в окно.
// Путь забирает Python: без preventDefault WebView2 ушёл бы на file://.
(function () {
  function isFileDrag(e) {
    var types = e.dataTransfer && e.dataTransfer.types;
    if (!types) return false;
    for (var i = 0; i < types.length; i++) {
      if (types[i] === 'Files') return true;
    }
    return false;
  }

  function show() {
    document.body.classList.add('file-drop');
  }

  function hide() {
    document.body.classList.remove('file-drop');
  }

  window.hideFileDrop = hide;

  window.addEventListener('dragenter', function (e) {
    if (isFileDrag(e)) show();
  }, true);

  window.addEventListener('dragover', function (e) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    show();
  }, true);

  window.addEventListener('dragleave', function (e) {
    // relatedTarget пустой, когда курсор ушёл за край окна, а не на соседний блок.
    if (!e.relatedTarget) hide();
  }, true);

  window.addEventListener('drop', function (e) {
    hide();
    if (!isFileDrag(e)) return;
    var files = e.dataTransfer && e.dataTransfer.files;
    if (!files || !files.length) return;
    e.preventDefault();
    e.stopPropagation();
    if (!window.pywebview || !window.pywebview._jsApiCallback) return;
    // Целиком событие не сериализуется: внутри него вся страница.
    // Пути WebView2 прикладывает отдельно, по настоящим File.
    var names = [];
    var list = [];
    for (var i = 0; i < files.length; i++) {
      names.push({ name: files[i].name });
      list.push(files[i]);
    }
    if (window.chrome && chrome.webview && chrome.webview.postMessageWithAdditionalObjects) {
      try {
        chrome.webview.postMessageWithAdditionalObjects('FilesDropped', list);
      } catch (err) {}
    }
    window.pywebview._jsApiCallback(
      'pywebviewEventHandler',
      { event: { type: 'drop', dataTransfer: { files: names } }, nodeId: 'document' },
      'eventHandler'
    );
  }, true);

  window.addEventListener('dragend', hide, true);

  // Превью HTML — чужой документ. Оно только просит показать рамку;
  // как только рамка есть, iframe перестаёт ловить мышь и бросок идёт сюда.
  window.addEventListener('message', function (e) {
    var data = e.data;
    if (!data || data.source !== 'mdv-file-drop' || e.source === window) return;
    if (data.phase === 'leave') hide();
    else show();
  });
})();
