// ===== Тема (светлая/тёмная) =====
(function () {
  var isDark = true;

  window.getCurrentTheme = function () {
    return isDark ? 'dark' : 'light';
  };

  window.applyTheme = function (dark) {
    isDark = dark;
    document.documentElement.setAttribute('data-theme', window.getCurrentTheme());

    window.applyChartTheme(dark);
    document.querySelectorAll("#preview [id^='chart-']").forEach(function (el) {
      var code = decodeURIComponent(el.dataset.chartCode || '');
      if (code) window.renderChart(code, el.id);
    });
    document.querySelectorAll('#preview .nomnoml-diagram').forEach(function (el) {
      var code = decodeURIComponent(el.dataset.nomnomlCode || '');
      if (code) window.renderNomnoml(el, code);
    });

    callApi('apply_titlebar_theme', dark);
  };

  window.toggleTheme = function () {
    window.applyTheme(!isDark);
    callApi('set_theme', window.getCurrentTheme());
  };

  // nomnoml не поддерживает темы — цвета передаются директивами в начале кода
  window.renderNomnoml = function (el, code) {
    var stroke = isDark ? '#d4d4d4' : '#333333';
    var lineColor = isDark ? '#aaaaaa' : '#555555';
    var styledCode = '#fill: transparent\n#stroke: ' + stroke + '\n#lineColor: ' + lineColor + '\n' + code;
    el.innerHTML = nomnoml.renderSvg(styledCode, document);
  };
})();
