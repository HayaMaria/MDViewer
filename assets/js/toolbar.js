// ===== Тулбар: выпадающие меню и кнопки действий =====
// data-action="js:имя" — глобальная JS-функция, иначе — метод Python API.
// data-arg — необязательный аргумент действия.
(function () {
  var openDropdown = null;

  function runAction(el) {
    var action = el.getAttribute('data-action');
    if (!action) return;
    var arg = el.getAttribute('data-arg');
    if (action.indexOf('js:') === 0) window[action.substring(3)](arg, el);
    else callApi(action);
  }

  function closeAllDropdowns() {
    document.querySelectorAll('.menu-dropdown.open').forEach(function (d) { d.classList.remove('open'); });
    document.querySelectorAll('.menu-btn.active').forEach(function (b) { b.classList.remove('active'); });
    openDropdown = null;
  }

  function toggleDropdown(dropdown, btn) {
    var wasOpen = dropdown === openDropdown;
    closeAllDropdowns();
    if (!wasOpen) {
      dropdown.classList.add('open');
      btn.classList.add('active');
      openDropdown = dropdown;
    }
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.menu-btn');
    if (btn) {
      var menuId = btn.getAttribute('data-menu');
      if (menuId) toggleDropdown(document.getElementById('menu-' + menuId), btn);
      else runAction(btn);
      return;
    }
    var item = e.target.closest('.menu-item');
    if (item) {
      closeAllDropdowns();
      runAction(item);
      return;
    }
    if (openDropdown && !e.target.closest('.menu-group')) closeAllDropdowns();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && openDropdown) closeAllDropdowns();
  });

  // ===== Кнопка синхронной прокрутки =====
  var syncScrollOn = true;
  var syncScrollBtn = document.getElementById('sync-scroll-btn');

  window.applySyncScrollState = function (enabled) {
    syncScrollOn = !!enabled;
    window.setSyncScrollEnabled(syncScrollOn);
    syncScrollBtn.classList.toggle('toggled-on', syncScrollOn);
    syncScrollBtn.title = 'Синхронная прокрутка: ' + (syncScrollOn ? 'вкл' : 'выкл');
  };

  window.toggleSyncScroll = function () {
    window.applySyncScrollState(!syncScrollOn);
    callApi('set_sync_scroll', syncScrollOn);
  };
})();
