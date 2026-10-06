// ===== Вкладки документов =====
// В редакторе всегда один документ — активная вкладка. Остальные держат
// свой текст, курсор и историю отмены, пока на них снова не переключатся.
(function () {
  var UNTITLED = 'Новый документ';
  var tabs = [];
  var active = -1;
  var switching = false;
  var closeBusy = false;
  var closeResolver = null;
  var switchChain = Promise.resolve();

  function welcomeTokenBump() {
    window.__welcomeToken = (window.__welcomeToken || 0) + 1;
  }

  function makeTab(spec) {
    spec = spec || {};
    var path = spec.path || null;
    return {
      html: !!spec.html,
      htmlContent: spec.htmlContent || '',
      path: path,
      pathKey: spec.pathKey || null,
      title: spec.title || UNTITLED,
      welcome: !!spec.welcome && !path && !spec.dirty && !spec.html,
      dirty: !!spec.dirty && !spec.html,
      content: spec.html ? '' : (spec.text || ''),
      editorState: null,
      anchor: spec.anchor || 0,
      head: spec.head || 0,
      scroll: spec.scroll || 0,
      previewScroll: spec.previewScroll || 0,
    };
  }

  function pristineWelcomeOnly() {
    return tabs.length === 1 && tabs[0].welcome && !tabs[0].dirty && !tabs[0].path;
  }

  function uniqueUntitled(title) {
    var base = title || UNTITLED;
    var used = {};
    tabs.forEach(function (tab) { used[tab.title] = true; });
    if (!used[base]) return base;
    var n = 2;
    while (used[base + ' ' + n]) n += 1;
    return base + ' ' + n;
  }

  function shouldPersist() {
    return tabs.some(function (tab) {
      return !tab.welcome || tab.dirty || !!tab.path;
    });
  }

  window.sessionHasDocuments = shouldPersist;

  window.autosaveAllowed = function () {
    return !switching;
  };

  function describeActive() {
    var tab = tabs[active] || {};
    return {
      path: tab.path || null,
      html: !!tab.html,
      title: tab.title || UNTITLED,
      persist: shouldPersist(),
    };
  }

  function snapshotActive() {
    var tab = tabs[active];
    if (!tab || tab.html || window.__htmlMode) return;
    var place = window.readEditorPlace ? window.readEditorPlace() : null;
    if (window.__cmView) tab.editorState = window.__cmView.state;
    if (place) {
      tab.content = place.content || '';
      tab.anchor = place.anchor || 0;
      tab.head = place.head || 0;
      tab.scroll = place.scroll || 0;
      tab.previewScroll = place.previewScroll || 0;
    }
    tab.dirty = !!(window.isDocumentDirty && window.isDocumentDirty());
    if (tab.dirty) tab.welcome = false;
  }

  function syncActive(live) {
    if (switching) return;
    var tab = tabs[active];
    if (!tab || tab.html || window.__htmlMode || !live) return;
    if (window.__cmView) tab.editorState = window.__cmView.state;
    tab.content = typeof live.content === 'string' ? live.content : tab.content;
    tab.anchor = live.anchor || 0;
    tab.head = live.head || 0;
    tab.scroll = live.scroll || 0;
    tab.previewScroll = live.previewScroll || 0;
    tab.dirty = !!live.dirty;
    if (tab.dirty) tab.welcome = false;
  }

  function serializeTab(tab) {
    var item = {
      html: !!tab.html,
      path: tab.path,
      title: tab.title,
      welcome: !!(tab.welcome && !tab.dirty && !tab.path),
      dirty: !!(tab.dirty && !tab.html),
      anchor: tab.anchor || 0,
      head: tab.head || 0,
      scroll: tab.scroll || 0,
      previewScroll: tab.previewScroll || 0,
    };
    if (item.dirty) item.content = tab.content || '';
    return item;
  }

  window.collectSessionState = function (live) {
    syncActive(live);
    return {
      epoch: live.epoch,
      active: active < 0 ? 0 : active,
      tabs: tabs.map(serializeTab),
    };
  };

  function paintDirty() {
    var tab = tabs[active];
    var el = document.querySelector('#tab-list .tab[data-index="' + active + '"]');
    if (!el || !tab) return;
    el.classList.toggle('dirty', !!tab.dirty && !tab.html);
  }

  function render() {
    var list = document.getElementById('tab-list');
    if (!list) return;
    list.innerHTML = '';
    tabs.forEach(function (tab, index) {
      var item = document.createElement('div');
      item.className = 'tab' + (index === active ? ' active' : '') + (tab.dirty && !tab.html ? ' dirty' : '');
      item.dataset.index = String(index);
      item.title = tab.path || tab.title;
      item.setAttribute('role', 'tab');
      item.setAttribute('aria-selected', index === active ? 'true' : 'false');

      var dot = document.createElement('span');
      dot.className = 'tab-dirty';
      dot.title = 'Есть несохранённые изменения';

      var name = document.createElement('span');
      name.className = 'tab-title';
      name.textContent = tab.title;

      var close = document.createElement('button');
      close.type = 'button';
      close.className = 'tab-close';
      close.title = 'Закрыть';
      close.setAttribute('aria-label', 'Закрыть ' + tab.title);
      close.textContent = '×';
      close.addEventListener('click', function (event) {
        event.stopPropagation();
        closeTab(index);
      });

      item.appendChild(dot);
      item.appendChild(name);
      item.appendChild(close);
      item.addEventListener('click', function () { switchTo(index); });
      item.addEventListener('auxclick', function (event) {
        if (event.button !== 1) return;
        event.preventDefault();
        closeTab(index);
      });
      list.appendChild(item);
    });
    var current = list.querySelector('.tab.active');
    if (current && current.scrollIntoView) {
      current.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    }
  }

  function showMarkdown(tab) {
    // Приветствие в фоновой вкладке подгружается, когда её открывают.
    if (tab.welcome && !tab.dirty && !tab.content && !tab.editorState) {
      var load = {};
      tab._welcomeLoad = load;
      if (window.setFileName) window.setFileName(tab.title);
      if (window.setEditorContent) window.setEditorContent('');
      if (window.markSaved) window.markSaved();
      if (window.disableSessionTracking) window.disableSessionTracking();
      fetch('texts/default.md')
        .then(function (response) { return response.text(); })
        .then(function (text) {
          if (tab._welcomeLoad !== load || tabs.indexOf(tab) < 0) return;
          if (tab.dirty || !tab.welcome) return;
          tab.content = text || '';
          if (tabs[active] !== tab) return;
          tab.editorState = null;
          showMarkdown(tab);
        })
        .catch(function () {});
      return;
    }
    // exitHtmlMode вызывает markSaved и затирает флаг уже выбранной вкладки.
    var dirty = !!tab.dirty;
    var welcome = !!tab.welcome;
    if (window.__htmlMode && window.exitHtmlMode) window.exitHtmlMode();
    tab.dirty = dirty;
    tab.welcome = welcome && !dirty;
    var keptHistory = !!(tab.editorState && window.swapEditorState);
    if (keptHistory) {
      tab.editorState = window.swapEditorState(tab.editorState);
    } else {
      window.setEditorContent(tab.content || '');
      if (window.__cmView) tab.editorState = window.__cmView.state;
    }
    if (window.__cmView) window.__cmView.focus();
    if (window.restoreEditorPlace) {
      window.restoreEditorPlace({
        scrollOnly: keptHistory,
        anchor: tab.anchor || 0,
        head: tab.head || 0,
        scroll: tab.scroll || 0,
        previewScroll: tab.previewScroll || 0,
      });
    }
    if (window.setFileName) window.setFileName(tab.title);
    if (dirty) {
      if (window.markUnsaved) window.markUnsaved();
      if (window.enableSessionTracking) window.enableSessionTracking();
    } else if (window.markSaved) {
      window.markSaved();
      if (tab.welcome) {
        if (window.disableSessionTracking) window.disableSessionTracking();
      } else if (window.enableSessionTracking) {
        window.enableSessionTracking();
      }
    }
  }

  function showHtml(tab) {
    window.loadHtmlPreview(tab.htmlContent || '', tab.title);
    if (window.disableSessionTracking) window.disableSessionTracking();
  }

  function applyTab(tab) {
    if (!tab) return;
    if (tab.html) showHtml(tab);
    else showMarkdown(tab);
  }

  function persistActive() {
    return callApi('bind_active_document', describeActive()).then(function (epoch) {
      if (typeof epoch === 'number' && window.setSessionEpoch) window.setSessionEpoch(epoch);
      if (window.resumeSessionPersistence) window.resumeSessionPersistence();
      if (shouldPersist() && window.captureSessionSnapshot) {
        return callApi('save_session', window.captureSessionSnapshot());
      }
    }, function () {
      if (window.resumeSessionPersistence) window.resumeSessionPersistence();
    });
  }

  function performSwitch(index) {
    if (index === active || index < 0 || index >= tabs.length) return Promise.resolve();
    switching = true;
    if (window.pauseSessionPersistence) window.pauseSessionPersistence();
    snapshotActive();
    active = index;
    try {
      applyTab(tabs[active]);
      render();
    } catch (error) {
      switching = false;
      if (window.resumeSessionPersistence) window.resumeSessionPersistence();
      throw error;
    }
    return persistActive().then(function () {
      switching = false;
    }, function () {
      switching = false;
    });
  }

  function switchTo(index) {
    var run = switchChain.then(function () {
      var tab = tabs[active];
      var autosave = tab && !tab.html && tab.dirty && tab.path
        && window.isAutosaveEnabled && window.isAutosaveEnabled();
      var pending = autosave ? callApi('autosave_document') : null;
      return Promise.resolve(pending).then(function () {
        return performSwitch(index);
      }, function () {
        return performSwitch(index);
      });
    });
    switchChain = run.then(function () {}, function () {});
    return run;
  }

  function removeTab(index) {
    if (index < 0 || index >= tabs.length) return;
    if (window.pauseSessionPersistence) window.pauseSessionPersistence();
    var closingActive = index === active;
    if (!closingActive) snapshotActive();
    tabs.splice(index, 1);
    if (!tabs.length) {
      active = -1;
      switching = false;
      render();
      callApi('show_welcome');
      return;
    }
    if (closingActive) {
      active = Math.min(index, tabs.length - 1);
      switching = true;
      applyTab(tabs[active]);
    } else if (index < active) {
      active -= 1;
    }
    render();
    persistActive().then(function () {
      switching = false;
    }, function () {
      switching = false;
    });
  }

  function askSave(title) {
    return new Promise(function (resolve) {
      var name = document.getElementById('close-tab-name');
      if (name) name.textContent = title || UNTITLED;
      window.openModal('close-tab-overlay');
      closeResolver = resolve;
    });
  }

  window.answerCloseTab = function (choice) {
    window.closeModal('close-tab-overlay');
    var resolve = closeResolver;
    closeResolver = null;
    if (resolve) resolve(choice || 'cancel');
  };

  function closeTab(index) {
    if (closeBusy || index < 0 || index >= tabs.length) return;
    var tab = tabs[index];
    if (tab.html || !tab.dirty) {
      removeTab(index);
      return;
    }
    closeBusy = true;
    askSave(tab.title).then(function (choice) {
      if (choice === 'cancel') {
        closeBusy = false;
        return;
      }
      if (choice !== 'save') {
        tab.dirty = false;
        removeTab(index);
        closeBusy = false;
        return;
      }
      switchTo(index).then(function () {
        return callApi('save_document');
      }).then(function (saved) {
        closeBusy = false;
        if (!saved || !tabs[index] || tabs[index].dirty) return;
        removeTab(index);
      }, function () {
        closeBusy = false;
      });
    });
  }

  window.closeActiveTab = function () {
    if (active >= 0) closeTab(active);
  };

  function tabIndexByPath(pathKey) {
    if (!pathKey) return -1;
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].pathKey === pathKey) return i;
    }
    return -1;
  }

  // Один файл — одна вкладка. Чужие вкладки с тем же путём убираем без диалога:
  // их текст уже не тот, что только что записан на диск, и сохранять его обратно нельзя.
  function dropOtherTabsWithPath(pathKey, kept) {
    if (!pathKey || !kept) return;
    var next = [];
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i] !== kept && tabs[i].pathKey === pathKey) continue;
      next.push(tabs[i]);
    }
    if (next.length === tabs.length) return;
    tabs = next;
    active = tabs.indexOf(kept);
  }

  function addTab(spec) {
    welcomeTokenBump();
    var tab = makeTab(spec);
    var existing = tabIndexByPath(tab.pathKey);
    if (existing >= 0) {
      if (existing !== active) switchTo(existing);
      render();
      return;
    }
    if (pristineWelcomeOnly()) {
      tabs[0] = tab;
      active = 0;
    } else {
      if (active >= 0) snapshotActive();
      if (!tab.path) tab.title = uniqueUntitled(tab.title);
      tabs.push(tab);
      active = tabs.length - 1;
    }
    applyTab(tab);
    render();
  }

  window.openMarkdownTab = function (spec) {
    addTab(spec || {});
  };

  window.openHtmlTab = function (spec) {
    addTab(spec || {});
  };

  window.installTabs = function (payload) {
    welcomeTokenBump();
    var list = payload && payload.tabs ? payload.tabs : [];
    var made = list.map(makeTab);
    var wanted = made.length ? Math.max(0, Math.min(payload.active || 0, made.length - 1)) : -1;
    var packed = [];
    var slotOf = {};
    var chosen = 0;
    made.forEach(function (tab, index) {
      var key = tab.pathKey;
      if (!key) {
        if (index === wanted) chosen = packed.length;
        packed.push(tab);
        return;
      }
      var slot = slotOf[key];
      if (slot == null) {
        slotOf[key] = packed.length;
        if (index === wanted) chosen = packed.length;
        packed.push(tab);
        return;
      }
      if (index === wanted) {
        packed[slot] = tab;
        chosen = slot;
      }
    });
    tabs = packed;
    active = tabs.length ? chosen : -1;
    render();
    if (active >= 0) applyTab(tabs[active]);
  };

  window.focusOpenPath = function (pathKey) {
    if (!pathKey) return false;
    var index = tabIndexByPath(pathKey);
    if (index < 0) return false;
    if (index !== active) switchTo(index);
    return true;
  };

  window.noteActivePath = function (path, title, pathKey) {
    var tab = tabs[active];
    if (!tab) return;
    dropOtherTabsWithPath(pathKey, tab);
    tab.path = path || null;
    tab.pathKey = pathKey || null;
    tab.title = title || tab.title;
    tab.welcome = false;
    tab.html = false;
    tab.dirty = false;
    if (window.setFileName) window.setFileName(tab.title);
    render();
  };

  window.welcomeTextReady = function (text) {
    var tab = tabs[active];
    if (!tab || !tab.welcome || tab.dirty || window.__htmlMode) return;
    tab.content = text || '';
    tab.editorState = null;
    showMarkdown(tab);
  };

  var prevWelcome = window.beginWelcomeDocument;
  window.beginWelcomeDocument = function (epoch) {
    var wasHtml = !!window.__htmlMode;
    tabs = [makeTab({ welcome: true, title: UNTITLED, text: '', html: false, dirty: false })];
    active = 0;
    render();
    if (wasHtml && window.exitHtmlMode) window.exitHtmlMode();
    if (window.setEditorContent) window.setEditorContent('');
    if (window.markSaved) window.markSaved();
    if (prevWelcome) prevWelcome(epoch);
  };

  var prevSaved = window.markSaved;
  window.markSaved = function () {
    if (prevSaved) prevSaved();
    var tab = tabs[active];
    if (!tab || tab.html || window.__suppressDirty) return;
    tab.dirty = false;
    paintDirty();
  };

  var prevUnsaved = window.markUnsaved;
  window.markUnsaved = function () {
    if (window.__suppressDirty) return;
    if (prevUnsaved) prevUnsaved();
    var tab = tabs[active];
    if (!tab || tab.html || window.__htmlMode) return;
    tab.dirty = true;
    tab.welcome = false;
    paintDirty();
  };

  function modalOpen() {
    return !!document.querySelector('.modal-overlay.open, .modal-popup.open');
  }

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && document.getElementById('close-tab-overlay').classList.contains('open')) {
      event.preventDefault();
      event.stopPropagation();
      window.answerCloseTab('cancel');
      return;
    }
    var mod = event.ctrlKey || event.metaKey;
    // Выход — даже поверх диалога. Остальные сочетания диалог не перехватывает.
    if (mod && !event.altKey && event.code === 'KeyQ' && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      if (window.quitApp) window.quitApp();
      return;
    }
    if (modalOpen()) return;
    if (!mod || event.altKey) return;
    // Эти сочетания раньше жили только в редакторе и молчали, если фокус был на превью или в поиске.
    if (event.code === 'KeyN' && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      callApi('new_document');
      return;
    }
    if (event.code === 'KeyO' && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      callApi('open_document');
      return;
    }
    if (event.code === 'KeyS' && event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      callApi('save_document_as');
      return;
    }
    if (event.code === 'KeyS' && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      callApi('save_document');
      return;
    }
    if (event.code === 'KeyW' && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      window.closeActiveTab();
      return;
    }
    if (event.code === 'KeyT' && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      callApi('new_document');
      return;
    }
    if (event.key === 'Tab' && tabs.length > 1) {
      event.preventDefault();
      event.stopPropagation();
      var next = event.shiftKey ? active - 1 : active + 1;
      if (next < 0) next = tabs.length - 1;
      if (next >= tabs.length) next = 0;
      switchTo(next);
    }
  }, true);

  var addButton = document.getElementById('tab-new');
  if (addButton) {
    addButton.addEventListener('click', function () {
      callApi('new_document');
    });
  }
})();
