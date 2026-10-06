// ===== Запуск: применить сохранённые настройки и открыть первый документ =====
onApiReady(function () {
  callApi('get_settings').then(function (s) {
    applyTheme(s.theme === 'dark');
    setEditorFontSize(s.font_size);
    applySyncScrollState(s.sync_scroll);
    applySplitterPos(s.splitter_pos);
    if (s.media_size_options && s.media_size_options.length) {
      window.MEDIA_SIZE_OPTIONS = s.media_size_options;
    }
    window.applyMediaSizeDefaults(s.media_sizes);
    window.applyAutosaveSettings(s.autosave);
  });

  // Файл из Проводника (открывает Python) или приветственный документ
  callApi('open_startup_file').then(function (opened) {
    if (opened) return;
    fetch('texts/default.md')
      .then(function (response) { return response.text(); })
      .then(function (text) {
        setEditorContent(text);
        markSaved();
      });
  });
});
