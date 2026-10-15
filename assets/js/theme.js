// ===== Тема (светлая/тёмная) =====
(function () {
  var isDark = document.documentElement.getAttribute('data-theme') !== 'light';

  window.getCurrentTheme = function () {
    return isDark ? 'dark' : 'light';
  };

  window.applyTheme = function (dark) {
    isDark = dark;
    document.documentElement.setAttribute('data-theme', window.getCurrentTheme());

    window.applyChartTheme(dark);
    if (window.rerenderMermaidTheme) window.rerenderMermaidTheme();
    document.querySelectorAll("#preview [id^='chart-']").forEach(function (el) {
      var code = decodeURIComponent(el.dataset.chartCode || '');
      if (code && window.Chart) window.renderChart(code, el.id);
    });
    document.querySelectorAll('#preview .nomnoml-diagram').forEach(function (el) {
      var code = decodeURIComponent(el.dataset.nomnomlCode || '');
      if (code && window.nomnoml) {
        window.renderNomnoml(el, code);
        if (window.noteNomnomlSvg) window.noteNomnomlSvg(el, code);
        if (window.scaleDiagramSvg) window.scaleDiagramSvg(el);
      }
    });

    callApi('apply_titlebar_theme', dark);
  };

  window.toggleTheme = function () {
    window.applyTheme(!isDark);
    callApi('set_theme', window.getCurrentTheme());
  };

  // nomnoml не поддерживает темы — цвета передаются директивами в начале кода
  window.renderNomnoml = function (el, code) {
    if (!window.nomnoml) return;
    var stroke = isDark ? '#d4d4d4' : '#333333';
    var lineColor = isDark ? '#aaaaaa' : '#555555';
    var styledCode = '#fill: transparent\n#stroke: ' + stroke + '\n#lineColor: ' + lineColor + '\n' + code;
    el.innerHTML = nomnoml.renderSvg(styledCode, document);
  };
})();
