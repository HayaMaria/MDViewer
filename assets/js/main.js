// ===== Запуск: настройки, файл из Проводника, прошлый сеанс или приветствие =====
onApiReady(function () {
  var splashHidden = false;

  function hideSplash() {
    if (splashHidden) return;
    splashHidden = true;
    // Два кадра: документ уже в редакторе, браузер успевает его нарисовать под заглушкой.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        callApi('dismiss_splash');
      });
    });
  }

  // Файл и сессия дочитываются после ответа Python. Ждём, пока текст окажется в редакторе.
  // Пустое приветствие не считается: следом приходит default.md.
  function waitForDocument() {
    return new Promise(function (resolve) {
      var timer = setTimeout(finish, 12000);
      function finish() {
        clearTimeout(timer);
        document.removeEventListener('mdv-document-replaced', onReplace);
        resolve();
      }
      function onReplace() {
        // Пустой кадр приветствия не готовность: текст default.md приходит следом.
        if (window.__welcomePending && !(window.getEditorContent && window.getEditorContent())) return;
        finish();
      }
      document.addEventListener('mdv-document-replaced', onReplace);
    });
  }

  // Если старт завис, окно не должно остаться под заглушкой.
  setTimeout(hideSplash, 15000);

  var settingsApplied = callApi('get_settings').then(function (s) {
    applyTheme(s.theme === 'dark');
    setEditorFontSize(s.font_size);
    applySyncScrollState(s.sync_scroll);
    applySplitterPos(s.splitter_pos);
    if (s.media_size_options && s.media_size_options.length) {
      window.MEDIA_SIZE_OPTIONS = s.media_size_options;
    }
    window.applyColumnWidth(s.column_width);
    window.applyMediaSizeDefaults(s.media_sizes);
    if (window.setSpellUserWords) window.setSpellUserWords(s.user_words || []);
    if (window.setSpellcheckEnabled) {
      var spellOn = !s.spellcheck || !!s.spellcheck.enabled;
      window.setSpellcheckEnabled(spellOn);
    }
  });

  callApi('window_id').then(function (id) {
    if (id) window.__windowId = id;
  });

  // Файл из Проводника важнее сессии. Иначе — вкладка, перенесённая в это окно,
  // документ прошлого сеанса или приветствие.
  var documentShown = callApi('open_startup_file').then(function (opened) {
    if (opened) return waitForDocument();
    return callApi('claim_launch').then(function (launch) {
      if (launch && launch.tabs && launch.tabs.length && window.installTabs) {
        window.installTabs(launch);
        if (window.persistOpenTabs) window.persistOpenTabs();
        if (window.__welcomePending) return waitForDocument();
        return;
      }
      return callApi('restore_last_session').then(function (restored) {
        if (restored) return waitForDocument();
        return callApi('show_welcome').then(waitForDocument);
      });
    });
  });

  Promise.all([settingsApplied, documentShown]).then(hideSplash, hideSplash);
});
