// ===== Диалоги «Настройки» и «Экспортировать HTML как...» =====
(function () {
  var DEFAULT_FONT_SIZE = 15;
  var savedFontSize = DEFAULT_FONT_SIZE;
  var SIZE_SELECTS = {
    image: 'settings-size-image',
    mermaid: 'settings-size-mermaid',
    uml: 'settings-size-uml',
    chart: 'settings-size-chart',
  };

  function setRadio(name, value) {
    document.querySelectorAll('input[name="' + name + '"]').forEach(function (r) {
      r.checked = r.value === value;
    });
  }

  function getRadio(name) {
    var checked = document.querySelector('input[name="' + name + '"]:checked');
    return checked ? checked.value : null;
  }

  function pickFolderInto(inputId) {
    callApi('pick_folder').then(function (path) {
      if (path) document.getElementById(inputId).value = path;
    });
  }

  function showFontSize(size) {
    document.getElementById('settings-font-size-value').textContent = size + 'px';
    window.setEditorFontSize(size);
  }

  function readMediaSizes() {
    var sizes = {};
    Object.keys(SIZE_SELECTS).forEach(function (key) {
      var n = parseInt(document.getElementById(SIZE_SELECTS[key]).value, 10);
      sizes[key] = window.MEDIA_SIZE_OPTIONS.indexOf(n) >= 0 ? n : window.MEDIA_SIZE_DEFAULTS[key];
    });
    return sizes;
  }

  function fillSettingsSizeSelects(sizes) {
    Object.keys(SIZE_SELECTS).forEach(function (key) {
      window.fillMediaSizeSelect(SIZE_SELECTS[key], (sizes && sizes[key]) || window.MEDIA_SIZE_DEFAULTS[key]);
    });
  }

  function fillAutosaveIntervals(intervals, selected) {
    var select = document.getElementById('settings-autosave-interval');
    select.innerHTML = '';
    (intervals || []).forEach(function (item) {
      var option = document.createElement('option');
      option.value = String(item.value);
      option.textContent = item.label;
      select.appendChild(option);
    });
    select.value = String(selected);
    if (!select.value && select.options.length) select.selectedIndex = 0;
  }

  function syncAutosaveIntervalState() {
    var on = document.getElementById('settings-autosave-enabled').checked;
    document.getElementById('settings-autosave-interval').disabled = !on;
  }

  function readAutosaveSettings() {
    return {
      enabled: document.getElementById('settings-autosave-enabled').checked,
      interval: parseInt(document.getElementById('settings-autosave-interval').value, 10) || 30,
    };
  }

  // ----- Настройки -----
  window.openSettingsDialog = function () {
    callApi('get_settings').then(function (s) {
      setRadio('settings-mode', s.export.mode);
      setRadio('settings-theme', s.export.theme);
      document.getElementById('settings-export-path').value = s.export.save_path || s.downloads_dir;
      document.getElementById('settings-md-path').value = s.md_save_dir || s.downloads_dir;
      savedFontSize = s.font_size;
      document.getElementById('settings-font-size').value = s.font_size;
      showFontSize(s.font_size);
      if (s.media_size_options && s.media_size_options.length) {
        window.MEDIA_SIZE_OPTIONS = s.media_size_options;
      }
      fillSettingsSizeSelects(s.media_sizes);
      var autosave = s.autosave || { enabled: false, interval: 30 };
      document.getElementById('settings-autosave-enabled').checked = !!autosave.enabled;
      fillAutosaveIntervals(s.autosave_intervals, autosave.interval);
      syncAutosaveIntervalState();
      openModal('settings-overlay');
    });
  };

  // Ползунок меняет шрифт сразу, поэтому при отмене возвращаем сохранённый размер
  window.cancelSettings = function () {
    window.setEditorFontSize(savedFontSize);
    closeModal('settings-overlay');
  };

  window.pickExportFolder = function () { pickFolderInto('settings-export-path'); };
  window.pickMDFolder = function () { pickFolderInto('settings-md-path'); };

  window.saveSettings = function () {
    var mediaSizes = readMediaSizes();
    var autosave = readAutosaveSettings();
    callApi('save_settings', {
      font_size: parseInt(document.getElementById('settings-font-size').value, 10) || DEFAULT_FONT_SIZE,
      export: {
        mode: getRadio('settings-mode') || 'full',
        theme: getRadio('settings-theme') || 'current',
        save_path: document.getElementById('settings-export-path').value,
      },
      md_save_dir: document.getElementById('settings-md-path').value,
      media_sizes: mediaSizes,
      autosave: autosave,
    }).then(function () {
      window.applyMediaSizeDefaults(mediaSizes);
      window.applyAutosaveSettings(autosave);
      closeModal('settings-overlay');
    });
  };

  // Предпросмотр размера шрифта при перемещении ползунка
  document.getElementById('settings-font-size').addEventListener('input', function () {
    showFontSize(parseInt(this.value, 10) || DEFAULT_FONT_SIZE);
  });

  document.getElementById('settings-autosave-enabled').addEventListener('change', syncAutosaveIntervalState);

  // ----- Экспортировать HTML как... -----
  window.openExportAsDialog = function () {
    callApi('get_settings').then(function (s) {
      setRadio('exportas-mode', s.export.mode);
      setRadio('exportas-theme', s.export.theme);
      document.getElementById('exportas-path').value = s.export.save_path;
    });
    openModal('export-as-overlay');
  };

  window.pickExportAsFolder = function () { pickFolderInto('exportas-path'); };

  window.runExportAs = function () {
    callApi('export_html',
      getRadio('exportas-mode') || 'full',
      getRadio('exportas-theme') || 'current',
      document.getElementById('exportas-path').value
    ).then(function () {
      closeModal('export-as-overlay');
    });
  };
})();
