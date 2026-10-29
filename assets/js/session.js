// ===== Сессия: курсор, прокрутка и несохранённый текст между запусками =====
// Путь к файлу знает Python. Здесь — снимок редактора и возврат на то же место.
(function () {
  var sessionEpoch = 0;
  var tracking = false;
  var paused = false;
  var textTimer = null;
  var placeTimer = null;
  var PLACE_SAVE_MS = 4000;

  function clearSessionTimers() {
    if (textTimer) {
      clearTimeout(textTimer);
      textTimer = null;
    }
    if (placeTimer) {
      clearTimeout(placeTimer);
      placeTimer = null;
    }
  }
  var restoreToken = 0;
  var applying = false;

  function clamp(value, len) {
    var n = Number(value);
    if (!isFinite(n) || n <= 0) return 0;
    n = Math.floor(n);
    return n > len ? len : n;
  }

  function readRatio(el) {
    if (!el) return 0;
    var max = el.scrollHeight - el.clientHeight;
    if (max <= 1) return 0;
    return el.scrollTop / max;
  }

  function editorScrollRatio() {
    var wrap = document.getElementById('editor');
    var wrapMax = wrap ? wrap.scrollHeight - wrap.clientHeight : 0;
    if (wrapMax > 1) return wrap.scrollTop / wrapMax;
    var view = window.__cmView;
    var inner = view && view.scrollDOM;
    var innerMax = inner ? inner.scrollHeight - inner.clientHeight : 0;
    if (innerMax > 1) return inner.scrollTop / innerMax;
    return 0;
  }

  function applyRatio(el, ratio) {
    if (!el) return;
    var value = Number(ratio);
    if (!isFinite(value) || value <= 0) {
      el.scrollTop = 0;
      return;
    }
    if (value > 1) value = 1;
    var max = el.scrollHeight - el.clientHeight;
    if (max <= 0) return;
    el.scrollTop = value * max;
  }

  function syncScrollOn() {
    var btn = document.getElementById('sync-scroll-btn');
    return !!(btn && btn.classList.contains('toggled-on'));
  }

  function layoutReady() {
    var editor = document.getElementById('editor');
    return !!(editor && editor.clientHeight > 0);
  }

  function applyEditorScroll(ratio) {
    applyRatio(document.getElementById('editor'), ratio);
    var view = window.__cmView;
    if (view && view.scrollDOM) applyRatio(view.scrollDOM, ratio);
  }

  function applyPlace(place, focus) {
    var view = window.__cmView;
    if (!view) return;
    // Состояние редактора уже содержит курсор — двигаем только прокрутку.
    if (!place.scrollOnly) {
      var len = view.state.doc.length;
      view.dispatch({
        selection: { anchor: clamp(place.anchor, len), head: clamp(place.head, len) },
        scrollIntoView: false,
      });
      if (focus) view.focus();
    }
    applyEditorScroll(place.scroll);
    var preview = document.getElementById('preview');
    if (!preview) return;
    // При синхронной прокрутке превью следует за редактором.
    applyRatio(preview, syncScrollOn() ? place.scroll : place.previewScroll);
  }

  // Текст документа копируем один раз на версию CodeMirror.
  // Движение курсора документ не меняет, строка остаётся прежней.
  var cachedDoc = null;
  var cachedText = '';

  function editorText() {
    var view = window.__cmView;
    var doc = view && view.state.doc;
    if (!doc) return '';
    if (doc !== cachedDoc) {
      cachedText = doc.toString();
      cachedDoc = doc;
    }
    return cachedText;
  }

  window.readEditorPlace = function (includeContent) {
    var view = window.__cmView;
    var anchor = 0;
    var head = 0;
    if (view) {
      var sel = view.state.selection.main;
      anchor = sel.anchor;
      head = sel.head;
    }
    return {
      anchor: anchor,
      head: head,
      scroll: editorScrollRatio(),
      previewScroll: readRatio(document.getElementById('preview')),
      content: includeContent === false ? '' : editorText(),
    };
  };

  window.captureSessionSnapshot = function (includeContent) {
    var withText = includeContent !== false;
    var place = window.readEditorPlace(withText);
    var live = {
      epoch: sessionEpoch,
      anchor: place.anchor,
      head: place.head,
      scroll: place.scroll,
      previewScroll: place.previewScroll,
      dirty: !!(window.isDocumentDirty && window.isDocumentDirty()),
      includeContent: withText,
      content: place.content,
    };
    if (window.collectSessionState) return window.collectSessionState(live);
    if (!live.dirty || !withText) live.content = '';
    return live;
  };

  // Сбросить уже поставленный снимок: он снят до сохранения или смены документа.
  window.setSessionEpoch = function (epoch) {
    clearSessionTimers();
    if (typeof epoch === 'number' && !isNaN(epoch)) sessionEpoch = epoch;
  };

  window.pauseSessionPersistence = function (epoch) {
    paused = true;
    clearSessionTimers();
    if (typeof epoch === 'number' && !isNaN(epoch)) sessionEpoch = epoch;
  };

  window.resumeSessionPersistence = function () {
    paused = false;
  };

  window.enableSessionTracking = function () {
    tracking = true;
  };

  window.disableSessionTracking = function () {
    tracking = false;
    clearSessionTimers();
  };

  function keepSession() {
    return !!(window.sessionHasDocuments && window.sessionHasDocuments());
  }

  function sessionSnapshotForDisk(includeContent) {
    clearSessionTimers();
    var canFlush = !paused && (keepSession() || (tracking && !window.__htmlMode && layoutReady()));
    if (!canFlush || (!window.__htmlMode && !layoutReady())) return null;
    return window.captureSessionSnapshot(includeContent !== false);
  }

  // Python вызывает это при закрытии окна и ждёт уже готовый снимок
  window.flushSessionNow = function () {
    return sessionSnapshotForDisk();
  };

  function flushSession(includeContent) {
    var snapshot = sessionSnapshotForDisk(includeContent);
    if (snapshot) callApi('save_session', snapshot);
  }

  // Текст — вскоре после правки. Курсор и прокрутка — раз в несколько секунд
  // и сразу, когда окно теряет фокус. Python оставляет уже записанный черновик.
  function scheduleSessionSave(kind) {
    if (paused) return;
    if (!keepSession() && (!tracking || window.__htmlMode)) return;
    if (kind === 'text') {
      if (placeTimer) {
        clearTimeout(placeTimer);
        placeTimer = null;
      }
      if (textTimer) clearTimeout(textTimer);
      textTimer = setTimeout(function () {
        textTimer = null;
        flushSession(true);
      }, 200);
      return;
    }
    if (textTimer) return;
    if (placeTimer) clearTimeout(placeTimer);
    placeTimer = setTimeout(function () {
      placeTimer = null;
      flushSession(false);
    }, PLACE_SAVE_MS);
  }

  function flushPendingSession() {
    var includeContent = !!textTimer;
    if (!textTimer && !placeTimer) return;
    clearSessionTimers();
    flushSession(includeContent);
  }

  window.addEventListener('blur', flushPendingSession);

  var prevCursor = window.updateStatusBarCursor;
  window.updateStatusBarCursor = function (line, col) {
    if (prevCursor) prevCursor(line, col);
    scheduleSessionSave('place');
  };

  var prevUnsaved = window.markUnsaved;
  window.markUnsaved = function () {
    if (window.__suppressDirty) return;
    if (prevUnsaved) prevUnsaved();
    if (!paused) tracking = true;
    scheduleSessionSave('text');
  };

  var editorEl = document.getElementById('editor');
  var previewEl = document.getElementById('preview');

  function onScroll() {
    scheduleSessionSave('place');
  }

  if (editorEl) editorEl.addEventListener('scroll', onScroll, { passive: true });
  if (previewEl) previewEl.addEventListener('scroll', onScroll, { passive: true });
  if (window.__cmView && window.__cmView.scrollDOM) {
    window.__cmView.scrollDOM.addEventListener('scroll', onScroll, { passive: true });
  }

  function cancelRestore() {
    if (applying) return;
    restoreToken += 1;
  }

  ['wheel', 'pointerdown', 'keydown'].forEach(function (type) {
    if (editorEl) editorEl.addEventListener(type, cancelRestore);
    if (previewEl) previewEl.addEventListener(type, cancelRestore);
  });

  window.restoreEditorPlace = function (place) {
    if (!place) return;
    restoreToken += 1;
    var my = restoreToken;

    function attempt(focus) {
      if (my !== restoreToken) return;
      applying = true;
      try {
        applyPlace(place, focus);
      } finally {
        applying = false;
      }
    }

    try {
      attempt(true);
    } catch (e) {}
    // Превью дорисовывается позже (диаграммы, картинки) — позицию повторяем,
    // пока пользователь сам не прокрутил документ.
    [100, 400, 1200].forEach(function (ms) {
      setTimeout(function () {
        if (my !== restoreToken) return;
        attempt(false);
        if (layoutReady()) scheduleSessionSave();
      }, ms);
    });
  };

  // Приветствие не считается местом, на котором остановились.
  // __welcomeToken отменяет загрузку, если за это время открыли другой документ.
  window.beginWelcomeDocument = function (epoch) {
    window.pauseSessionPersistence(epoch);
    window.disableSessionTracking();
    var token = (window.__welcomeToken || 0) + 1;
    window.__welcomeToken = token;
    fetch('texts/default.md')
      .then(function (response) { return response.text(); })
      .then(function (text) {
        if (token !== window.__welcomeToken) return;
        if (window.welcomeTextReady) window.welcomeTextReady(text);
        else {
          setEditorContent(text);
          markSaved();
        }
      })
      .catch(function () {})
      .then(function () {
        if (token !== window.__welcomeToken) return;
        window.resumeSessionPersistence();
      });
  };

  window.addEventListener('beforeunload', function () {
    clearSessionTimers();
    flushSession(true);
  });

  // Сначала записать сессию, потом закрыть окно. Иначе последний курсор
  // может не успеть дойти до диска.
  window.quitApp = function () {
    var snapshot = sessionSnapshotForDisk();
    var pending = snapshot ? callApi('save_session', snapshot) : null;
    Promise.resolve(pending).then(function () {
      callApi('quit');
    }, function () {
      callApi('quit');
    });
  };
})();
