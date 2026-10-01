// ===== Разделитель редактора и превью (перетаскивание мышью) =====
(function () {
  var MIN_PERCENT = 3;
  var MAX_PERCENT = 97;

  var splitter = document.getElementById('splitter');
  var editorPanel = document.getElementById('editor');
  var container = document.querySelector('.container');
  var currentPercent = 50;

  function clamp(percent) {
    return Math.max(MIN_PERCENT, Math.min(MAX_PERCENT, percent));
  }

  // Ширина редактора в процентах (вызывается и при старте из сохранённых настроек)
  window.applySplitterPos = function (percent) {
    currentPercent = clamp(percent);
    editorPanel.style.flex = '0 0 ' + currentPercent + '%';
    window.__cmView.requestMeasure();
  };

  splitter.addEventListener('mousedown', function (e) {
    e.preventDefault();
    var startX = e.clientX;
    var startPercent = currentPercent;
    // Ширина контейнера не меняется во время перетаскивания — берём один раз
    var totalWidth = container.getBoundingClientRect().width;

    // Блокируем pointer-events у iframe — иначе он перехватывает mousemove
    document.body.classList.add('splitter-drag');
    splitter.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMouseMove(e2) {
      window.applySplitterPos(startPercent + ((e2.clientX - startX) / totalWidth) * 100);
    }

    function onMouseUp() {
      document.body.classList.remove('splitter-drag');
      splitter.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      callApi('set_splitter_pos', Math.round(currentPercent));
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
})();
