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
    if (window.refreshDiagramTheme) window.refreshDiagramTheme();
    else if (window.rerenderMermaidTheme) window.rerenderMermaidTheme();

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
