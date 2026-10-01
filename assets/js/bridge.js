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

  window.onApiReady = function (callback) {
    if (readyApi()) callback();
    else window.addEventListener('pywebviewready', callback, { once: true });
  };
})();
