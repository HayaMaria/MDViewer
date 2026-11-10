// ===== Мост к Python (window.pywebview.api) =====
(function () {
  // До события pywebviewready api существует, но это пустой объект
  function readyApi() {
    var pv = window.pywebview;
    return pv && pv.api && typeof pv.api.get_settings === 'function' ? pv.api : null;
  }

  // Вызвать метод Python API; до готовности моста — пустой Promise
  window.callApi = function (method) {
    var api = readyApi();
    var args = Array.prototype.slice.call(arguments, 1);
    return api ? api[method].apply(api, args) : Promise.resolve();
  };

  // Сообщение Windows с заголовком «MD Viewer — Ошибка» вместо безымянного alert().
  // kind: 'error' (по умолчанию), 'warning' или 'info'.
  window.showMessage = function (message, kind) {
    var api = readyApi();
    if (!api || typeof api.show_message !== 'function') {
      window.alert(message);
      return Promise.resolve();
    }
    return Promise.resolve(api.show_message(String(message), kind || 'error')).catch(function () {
      window.alert(message);
    });
  };

  window.onApiReady = function (callback) {
    if (readyApi()) callback();
    else window.addEventListener('pywebviewready', callback, { once: true });
  };
})();
