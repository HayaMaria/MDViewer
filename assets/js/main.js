// ===== Запуск: настройки, файл из Проводника, прошлый сеанс или приветствие =====
onApiReady(function () {
  callApi('get_settings').then(function (s) {
    applyTheme(s.theme === 'dark');
    setEditorFontSize(s.font_size);
    applySyncScrollState(s.sync_scroll);
    applySplitterPos(s.splitter_pos);
    if (s.media_size_options && s.media_size_options.length) {
      window.MEDIA_SIZE_OPTIONS = s.media_size_options;
    }
    window.applyColumnWidth(s.column_width);
    window.applyMediaSizeDefaults(s.media_sizes);
    window.applyAutosaveSettings(s.autosave);
  });

  // Файл из Проводника важнее сессии. Иначе — документ, на котором остановились.
  callApi('open_startup_file').then(function (opened) {
    if (opened) return;
    return callApi('restore_last_session').then(function (restored) {
      if (!restored) callApi('show_welcome');
    });
  });
});
