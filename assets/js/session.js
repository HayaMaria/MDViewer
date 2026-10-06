// ===== Сессия: курсор, прокрутка и несохранённый текст между запусками =====
// Путь к файлу знает Python. Здесь — снимок редактора и возврат на то же место.
(function () {
  var sessionEpoch = 0;
  var tracking = false;
  var paused = false;
  var timer = null;
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

  window.readEditorPlace = function () {
    var view = window.__cmView;
    var anchor = 0;
    var head = 0;
    var content = '';
    if (view) {
      var sel = view.state.selection.main;
      anchor = sel.anchor;
      head = sel.head;
      content = view.state.doc.toString();
    }
    return {
      anchor: anchor,
      head: head,
      scroll: editorScrollRatio(),
      previewScroll: readRatio(document.getElementById('preview')),
      content: content,
    };
  };

  window.captureSessionSnapshot = function () {
    var place = window.readEditorPlace();
    var live = {
      epoch: sessionEpoch,
      anchor: place.anchor,
      head: place.head,
      scroll: place.scroll,
      previewScroll: place.previewScroll,
      dirty: !!(window.isDocumentDirty && window.isDocumentDirty()),
      content: place.content,
    };
    if (window.collectSessionState) return window.collectSessionState(live);
    if (!live.dirty) live.content = '';
    return live;
  };

  // Сбросить уже поставленный снимок: он снят до сохранения или смены документа.
  window.setSessionEpoch = function (epoch) {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (typeof epoch === 'number' && !isNaN(epoch)) sessionEpoch = epoch;
  };

  window.pauseSessionPersistence = function (epoch) {
    paused = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
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
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  function keepSession() {
    return !!(window.sessionHasDocuments && window.sessionHasDocuments());
  }

  function flushSession() {
    if (paused) return;
    if (!keepSession() && (!tracking || window.__htmlMode)) return;
    if (!window.__htmlMode && !layoutReady()) return;
    callApi('save_session', window.captureSessionSnapshot());
  }

  function scheduleSessionSave() {
    if (paused) return;
    if (!keepSession() && (!tracking || window.__htmlMode)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      flushSession();
    }, 200);
  }

  window.scheduleSessionSave = scheduleSessionSave;

  var prevCursor = window.updateStatusBarCursor;
  window.updateStatusBarCursor = function (line, col) {
    if (prevCursor) prevCursor(line, col);
    scheduleSessionSave();
  };

  var prevUnsaved = window.markUnsaved;
  window.markUnsaved = function () {
    if (window.__suppressDirty) return;
    if (prevUnsaved) prevUnsaved();
    if (!paused) tracking = true;
    scheduleSessionSave();
  };

  var editorEl = document.getElementById('editor');
  var previewEl = document.getElementById('preview');

  function onScroll() {
    scheduleSessionSave();
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
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    flushSession();
  });

  // Сначала записать сессию, потом закрыть окно. Иначе последний курсор
  // может не успеть дойти до диска.
  window.quitApp = function () {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    var pending = null;
    var canFlush = !paused && (keepSession() || (tracking && !window.__htmlMode && layoutReady()));
    if (canFlush && (window.__htmlMode || layoutReady())) {
      pending = callApi('save_session', window.captureSessionSnapshot());
    }
    Promise.resolve(pending).then(function () {
      callApi('quit');
    }, function () {
      callApi('quit');
    });
  };
})();
