import { EditorView, basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { ViewPlugin, Decoration, keymap } from "@codemirror/view";
import { StateField, StateEffect, RangeSetBuilder } from "@codemirror/state";
import { defaultKeymap, historyKeymap, undo, redo, indentMore, indentLess } from "@codemirror/commands";
import { marked } from "marked";
import mermaid from "mermaid";
import { renderChart } from "./charts.js";

// Настройка mermaid — классическая нейтральная палитра (чёрные текст/контуры, белый фон)
// независимо от темы всего приложения.
mermaid.initialize({
  theme: "base",
  startOnLoad: false,
  themeVariables: {
    background: "#ffffff",
    primaryColor: "#ffffff",
    primaryBorderColor: "#000000",
    primaryTextColor: "#000000",
    secondaryColor: "#ffffff",
    secondaryBorderColor: "#000000",
    secondaryTextColor: "#000000",
    tertiaryColor: "#ffffff",
    tertiaryBorderColor: "#000000",
    tertiaryTextColor: "#000000",
    lineColor: "#000000",
    arrowheadColor: "#000000",
    textColor: "#000000",
    titleColor: "#000000",
    nodeBkg: "#ffffff",
    nodeBorder: "#000000",
    nodeTextColor: "#000000",
    clusterBkg: "#ffffff",
    clusterBorder: "#000000",
    defaultLinkColor: "#000000",
    edgeLabelBackground: "#ffffff",
    border1: "#000000",
    border2: "#000000",
    mainBkg: "#ffffff",
    secondBkg: "#ffffff",
    actorBorder: "#000000",
    actorBkg: "#ffffff",
    actorTextColor: "#000000",
    actorLineColor: "#000000",
    signalColor: "#000000",
    signalTextColor: "#000000",
    labelBoxBkgColor: "#ffffff",
    labelBoxBorderColor: "#000000",
    labelTextColor: "#000000",
    loopTextColor: "#000000",
    noteBorderColor: "#000000",
    noteBkgColor: "#ffffff",
    noteTextColor: "#000000",
    activationBorderColor: "#000000",
    activationBkgColor: "#ffffff",
    sequenceNumberColor: "#000000",
    sectionBkgColor: "#ffffff",
    altSectionBkgColor: "#ffffff",
    sectionBkgColor2: "#ffffff",
    excludeBkgColor: "#ffffff",
    taskBorderColor: "#000000",
    taskBkgColor: "#ffffff",
    activeTaskBorderColor: "#000000",
    activeTaskBkgColor: "#ffffff",
    gridColor: "#000000",
    doneTaskBkgColor: "#ffffff",
    doneTaskBorderColor: "#000000",
    critBkgColor: "#ffffff",
    critBorderColor: "#000000",
    todayLineColor: "#000000",
    vertLineColor: "#000000",
    taskTextColor: "#000000",
    taskTextOutsideColor: "#000000",
    taskTextLightColor: "#000000",
    taskTextDarkColor: "#000000",
    taskTextClickableColor: "#000000",
    personBorder: "#000000",
    personBkg: "#ffffff",
    rowOdd: "#ffffff",
    rowEven: "#ffffff",
    labelColor: "#000000",
    errorBkgColor: "#ffffff",
    errorTextColor: "#000000",
    classText: "#000000",
    stateLabelColor: "#000000",
    stateBkg: "#ffffff",
    labelBackgroundColor: "#ffffff",
    compositeBackground: "#ffffff",
    altBackground: "#ffffff",
    compositeTitleBackground: "#ffffff",
    compositeBorder: "#000000",
    innerEndBackground: "#ffffff",
    stateBorder: "#000000",
    specialStateColor: "#000000",
    rectBkgColor: "#ffffff",
    transitionColor: "#000000",
    transitionLabelColor: "#000000",
    requirementBackground: "#ffffff",
    requirementBorderColor: "#000000",
    requirementTextColor: "#000000",
    relationColor: "#000000",
    relationLabelBackground: "#ffffff",
    relationLabelColor: "#000000",
    git0: "#ffffff",
    git1: "#dddddd",
    git2: "#ffffff",
    git3: "#dddddd",
    git4: "#ffffff",
    git5: "#dddddd",
    git6: "#ffffff",
    git7: "#dddddd",
    gitInv0: "#000000",
    gitInv1: "#222222",
    gitInv2: "#000000",
    gitInv3: "#222222",
    gitInv4: "#000000",
    gitInv5: "#222222",
    gitInv6: "#000000",
    gitInv7: "#222222",
    branchLabelColor: "#000000",
    gitBranchLabel0: "#ffffff",
    gitBranchLabel1: "#ffffff",
    gitBranchLabel2: "#ffffff",
    gitBranchLabel3: "#ffffff",
    gitBranchLabel4: "#ffffff",
    gitBranchLabel5: "#ffffff",
    gitBranchLabel6: "#ffffff",
    gitBranchLabel7: "#ffffff",
    tagLabelColor: "#000000",
    tagLabelBackground: "#ffffff",
    tagLabelBorder: "#000000",
    commitLabelColor: "#000000",
    commitLabelBackground: "#ffffff",
    pie1: "#ffffff",
    pie2: "#dddddd",
    pie3: "#bbbbbb",
    pie4: "#999999",
    pie5: "#777777",
    pie6: "#000000",
    pie7: "#ffffff",
    pie8: "#dddddd",
    pie9: "#bbbbbb",
    pie10: "#999999",
    pie11: "#777777",
    pie12: "#000000",
    pieTitleTextColor: "#000000",
    pieSectionTextColor: "#000000",
    pieLegendTextColor: "#000000",
    pieStrokeColor: "#000000",
    pieOuterStrokeColor: "#000000",
    useGradient: false,
    dropShadow: "none",
  },
});

// Счётчик для уникальных id графиков
let chartCounter = 0;

// Настройка marked:
// — [текст](url) — открывается в браузере
// — [текст](url+) — открывается в новом окне приложения
const renderer = {
  link({ href, title, text }) {
    const openInApp = href.endsWith("+");
    const cleanHref = openInApp ? href.slice(0, -1) : href;
    const titleAttr = title ? ` title="${title}"` : "";
    if (openInApp) {
      // Открыть в новом окне приложения
      return `<span class="app-link" data-url="${cleanHref}"${titleAttr} style="color:#4c9aff;text-decoration:underline;cursor:pointer;">${text}</span>`;
    }
    // Открыть в браузере
    return `<span class="external-link" data-url="${cleanHref}"${titleAttr} style="color:#4c9aff;text-decoration:underline;cursor:pointer;">${text} ↗</span>`;
  },
  // Кастомный рендер для блоков кода:
  // если язык "mermaid" — выводим <pre class="mermaid"> для дальнейшей отрисовки
  // если язык "chart" — выводим div-контейнер для Chart.js
  image({ href, title, text }) {
    return false;
  },
  code({ text, lang }) {
    if (lang === "mermaid") {
      return `<pre class="mermaid" data-code="${encodeURIComponent(text)}">${text}</pre>`;
    }
    if (lang === "chart") {
      const id = "chart-" + (chartCounter++);
      const escaped = encodeURIComponent(text);
      return `<div id="${id}" data-chart-code="${escaped}" style="min-height:300px;"></div>`;
    }
    if (lang === "nomnoml") {
      const id = "nomnoml-" + (chartCounter++);
      const escaped = encodeURIComponent(text);
      return `<div id="${id}" class="nomnoml-diagram" data-nomnoml-code="${escaped}" style="min-height:100px;"></div>`;
    }
    // Для остальных блоков — пусть marked обрабатывает стандартно (возвращаем null/false)
    return false;
  },
};
marked.use({ renderer });

// Функция обновления превью
function updatePreview() {
  const content = view.state.doc.toString();
  const html = marked.parse(content);
  document.getElementById("preview").innerHTML = html;

  // Рендерим схемы Mermaid
  if (document.querySelector(".mermaid")) {
    mermaid.run({ querySelector: ".mermaid" });
  }

  // Рендерим графики Chart.js
  document.querySelectorAll("#preview [id^='chart-']").forEach((el) => {
    const code = decodeURIComponent(el.dataset.chartCode || "");
    if (code) {
      renderChart(code, el.id);
    }
  });

  // Рендерим диаграммы nomnoml
  document.querySelectorAll("#preview .nomnoml-diagram").forEach((el) => {
    const code = decodeURIComponent(el.dataset.nomnomlCode || "");
    if (code && typeof nomnoml !== "undefined") {
      try {
        const svgString = nomnoml.renderSvg(code, document);
        el.innerHTML = svgString;
      } catch (e) {
        el.innerHTML = `<pre style="color:#ff6b6b;">Parse error: ${e.message}</pre>`;
      }
    }
  });

  // Обработчики для ссылок в браузер
  document.querySelectorAll("#preview .external-link").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const url = el.dataset.url;
      if (url && window.pywebview && window.pywebview.api) {
        window.pywebview.api.open_external(url);
      }
    });
  });

  // Обработчики для ссылок в окне приложения
  document.querySelectorAll("#preview .app-link").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const url = el.dataset.url;
      if (url && window.pywebview && window.pywebview.api) {
        window.pywebview.api.open_in_app_window(url);
      }
    });
  });
}

// ===== Горячие клавиши для файловых операций =====
// Эти функции вызываются из кастомных биндингов CodeMirror
// Они перекидывают вызовы в Python API, чтобы задействовать нативные диалоги

function callNewDocument() {
  if (window.pywebview && window.pywebview.api) {
    window.pywebview.api.new_document_shortcut();
  }
  return true;
}

function callOpenFile() {
  if (window.pywebview && window.pywebview.api) {
    window.pywebview.api.open_file_shortcut();
  }
  return true;
}

function callSaveFile() {
  if (window.pywebview && window.pywebview.api) {
    window.pywebview.api.save_file_shortcut();
  }
  return true;
}

function callSaveFileAs() {
  if (window.pywebview && window.pywebview.api) {
    window.pywebview.api.save_file_as_shortcut();
  }
  return true;
}

// Кастомные биндинги (Mod = Ctrl на Windows/Linux, Cmd на macOS)
// Должны идти ДО defaultKeymap, чтобы `Mod-s` переопределил стандартный save
const customKeyBindings = [
  { key: "Mod-n", run: callNewDocument },
  { key: "Mod-o", run: callOpenFile },
  { key: "Mod-s", run: callSaveFile },
  { key: "Mod-Shift-s", run: callSaveFileAs },
  {
    key: "Tab", run: () => {
      // Вставляем символ табуляции напрямую (надёжнее indentMore для markdown)
      const { state } = view;
      const sel = state.selection.main;
      view.dispatch({
        changes: { from: sel.from, insert: "\t" },
        selection: { anchor: sel.from + 1 },
      });
      return true;
    }
  },
  { key: "Shift-Tab", run: () => { indentLess(view); return true; } },
];

// ===== Собственный подсветчик совпадений поиска =====
// НЕ используем встроенный searchHighlighter (он требует открытую панель поиска).
// Вместо этого — свой StateField + ViewPlugin с декорациями.
const setSearchText = StateEffect.define();

// Хранит текущий запрос поиска (текст) в состоянии редактора
const searchTextField = StateField.define({
  create: () => "",
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setSearchText)) value = e.value;
    }
    return value;
  }
});

const searchMatchMark = Decoration.mark({ class: "cm-searchMatch" });
const searchMatchSelectedMark = Decoration.mark({ class: "cm-searchMatch cm-searchMatch-selected" });

function computeSearchMatches(view) {
  const text = view.state.field(searchTextField);
  if (!text || view.state.doc.length === 0) return Decoration.none;

  let re;
  try {
    re = new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  } catch (e) {
    return Decoration.none;
  }

  const builder = new RangeSetBuilder();
  const doc = view.state.doc;
  const sel = view.state.selection;

  for (const range of view.visibleRanges) {
    const from = range.from, to = range.to;
    const textSlice = doc.sliceString(from, to);
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(textSlice)) !== null) {
      const mFrom = from + m.index;
      const mTo = mFrom + m[0].length;
      if (mTo > to) break;
      const selected = sel.ranges.some(r => r.from === mFrom && r.to === mTo);
      builder.add(mFrom, mTo, selected ? searchMatchSelectedMark : searchMatchMark);
      if (m[0].length === 0) re.lastIndex++;
    }
  }

  return builder.finish();
}

const searchHighlightExt = [
  searchTextField,
  ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = computeSearchMatches(view);
      }
      update(update) {
        if (update.docChanged || update.viewportChanged || update.selectionSet ||
          update.startState.field(searchTextField) !== update.state.field(searchTextField)) {
          this.decorations = computeSearchMatches(update.view);
        }
      }
    },
    { decorations: v => v.decorations }
  )
];

// Установить текст подсветки (вызывается из панели поиска)
window.setSearchMatchHighlight = function (text) {
  view.dispatch({ effects: setSearchText.of(text || "") });
};

// Функция обновления позиции курсора в статус-баре
function updateCursorPosition(view) {
  const pos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);
  const lineNumber = line.number;       // 1-based
  const colNumber = pos - line.from + 1; // 1-based
  if (window.updateStatusBarCursor) {
    window.updateStatusBarCursor(lineNumber, colNumber);
  }
}
// Создаём редактор
// Светлая тема для CodeMirror — И selection, И active line через EditorView.theme()
let view = new EditorView({
  doc: window.INITIAL_TEXT || "# Новый документ",
  extensions: [
    basicSetup,
    markdown(),
    oneDark,
    keymap.of([...customKeyBindings, ...defaultKeymap, ...historyKeymap]),
    searchHighlightExt,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        updatePreview();
        // Помечаем как несохранённое при изменении документа
        if (window.markUnsaved) window.markUnsaved();
      }
      // Обновляем позицию курсора при любом изменении выделения или документа
      if (update.selectionSet || update.docChanged) {
        updateCursorPosition(update.view);
      }
    }),
  ],
  parent: document.getElementById("editor"),
});

// Если data-theme не совпадает с темой в config (например, после applyTheme),
// app.js вызовет setEditorTheme через checkTheme — это надёжно отработает.

// Сразу показываем превью при запуске
updatePreview();

// Функция для получения текста из редактора (вызывается из Python)
window.getEditorContent = () => view.state.doc.toString();

// Функция для установки текста в редактор (вызывается из Python)
window.setEditorContent = (text) => {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
  });
};
// ===== Функции для меню (вызываются из Python через evaluate_js) =====

// Отменить последнее действие
window.undoEditor = () => undo(view);

// Повторить отменённое действие
window.redoEditor = () => redo(view);

// Вырезать выделенный текст
window.cutText = () => {
  const sel = view.state.selection.main;
  if (!sel.empty) {
    const text = view.state.sliceDoc(sel.from, sel.to);
    navigator.clipboard.writeText(text).then(() => {
      view.dispatch({ changes: { from: sel.from, to: sel.to } });
    });
  }
};

// Копировать выделенный текст
window.copyText = () => {
  const sel = view.state.selection.main;
  if (!sel.empty) {
    const text = view.state.sliceDoc(sel.from, sel.to);
    navigator.clipboard.writeText(text);
  }
};

// Вставить текст из буфера обмена
window.pasteText = () => {
  view.focus();
  navigator.clipboard.readText().then(text => {
    view.dispatch({
      changes: { from: view.state.selection.main.from, insert: text },
      selection: { anchor: view.state.selection.main.from + text.length }
    });
  }).catch(() => { });
};

// ===== Кастомный поиск (панель в тулбаре, как в VS Code) =====

// Открыть панель поиска (вызывается из HTML)
window.searchEditor = function () {
  document.dispatchEvent(new CustomEvent("mdv-search-open"));
  return true;
};

// Все позиции совпадений [from, to] по всему документу (единая логика)
function getAllSearchMatches(text) {
  if (!text) return [];
  const doc = view.state.doc.toString();
  const positions = [];
  let re;
  try {
    re = new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  } catch (e) {
    return [];
  }
  let m;
  while ((m = re.exec(doc)) !== null) {
    positions.push([m.index, m.index + m[0].length]);
    if (m[0].length === 0) re.lastIndex++;
  }
  return positions;
}

// Перейти к следующему/предыдущему совпадению. dir: "next" | "prev"
window.findText = function (text, dir) {
  if (!text) return false;
  try {
    const positions = getAllSearchMatches(text);
    if (!positions.length) return false;

    const sel = view.state.selection.main;
    const head = sel.head;
    // Текущее выделение совпадает с каким-либо результатом?
    const onMatch = positions.some(p => p[0] === sel.from && p[1] === sel.to);

    let target = null;
    if (dir === "prev") {
      if (onMatch) {
        // ищем совпадение, которое заканчивается перед текущим
        for (let i = positions.length - 1; i >= 0; i--) {
          if (positions[i][1] < sel.from) { target = positions[i]; break; }
        }
        if (!target) target = positions[positions.length - 1]; // круговая
      } else {
        // последнее совпадение, которое начинается до курсора
        for (let i = positions.length - 1; i >= 0; i--) {
          if (positions[i][0] < head) { target = positions[i]; break; }
        }
        if (!target) target = positions[positions.length - 1];
      }
    } else {
      if (onMatch) {
        // ищем совпадение, которое начинается после текущего
        for (let i = 0; i < positions.length; i++) {
          if (positions[i][0] > sel.to) { target = positions[i]; break; }
        }
        if (!target) target = positions[0];
      } else {
        for (let i = 0; i < positions.length; i++) {
          if (positions[i][0] > head) { target = positions[i]; break; }
        }
        if (!target) target = positions[0];
      }
    }

    view.dispatch({
      selection: { anchor: target[0], head: target[1] },
      scrollIntoView: true,
      userEvent: "select.search"
    });
    return true;
  } catch (e) {
    console.error("findText error:", e);
    return false;
  }
};

// Заменить текущее (или следующее) совпадение
window.replaceOne = function (text, replacement) {
  if (!text) return false;
  try {
    const positions = getAllSearchMatches(text);
    if (!positions.length) return false;

    const sel = view.state.selection.main;
    // Если курсор уже на совпадении — заменяем его, иначе идём к следующему
    let target = positions.find(p => p[0] === sel.from && p[1] === sel.to);
    if (!target) {
      target = positions.find(p => p[0] > sel.head || p[1] > sel.head);
    }
    if (!target) target = positions[0];

    const rep = replacement || "";
    view.dispatch({
      changes: { from: target[0], to: target[1], insert: rep },
      selection: { anchor: target[0] + rep.length },
      userEvent: "input.replace"
    });
    return true;
  } catch (e) {
    console.error("replaceOne error:", e);
    return false;
  }
};

// Заменить все совпадения
window.replaceAllSearch = function (text, replacement) {
  if (!text) return false;
  try {
    const positions = getAllSearchMatches(text);
    if (!positions.length) return false;

    const rep = replacement || "";
    // КодМиррор сам корректно применяет неперекрывающиеся изменения
    const changes = positions.map(p => ({ from: p[0], to: p[1], insert: rep }));
    view.dispatch({ changes, userEvent: "input.replace" });
    return true;
  } catch (e) {
    console.error("replaceAllSearch error:", e);
    return false;
  }
};

// Очистить поиск (убрать подсветку) — управляется через setSearchMatchHighlight
window.clearSearch = function () { };

// Позиции всех совпадений: массив [from, to]
window.getSearchMatchPositions = function (text) {
  return getAllSearchMatches(text);
};

// Текущая позиция курсора в документе
window.getSearchCursorPos = function () {
  return view.state.selection.main.head;
};

window.getRenderedBodyHTML = function () {
  return marked.parse(view.state.doc.toString());
};
// ===== Функции форматирования Markdown (панель инструментов) =====
// ===== Режим форматирования (toggle/wrap/unwrap) =====
window.formatMode = 'toggle';

window.cycleFormatMode = function () {
  if (window.formatMode === 'toggle') window.formatMode = 'wrap';
  else if (window.formatMode === 'wrap') window.formatMode = 'unwrap';
  else window.formatMode = 'toggle';
  var btn = document.getElementById('fmt-mode-btn');
  if (btn) {
    var labels = {
      toggle: { icon: '\u21C4', title: '\u0421\u043C\u0435\u0448\u0430\u043D\u043D\u044B\u0439 \u0440\u0435\u0436\u0438\u043C \u0444\u043E\u0440\u043C\u0430\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F' },
      wrap: { icon: '\u2295', title: '\u0422\u043E\u043B\u044C\u043A\u043E \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0444\u043E\u0440\u043C\u0430\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435' },
      unwrap: { icon: '\u2296', title: '\u0422\u043E\u043B\u044C\u043A\u043E \u0441\u043D\u044F\u0442\u044C \u0444\u043E\u0440\u043C\u0430\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435' }
    };
    var info = labels[window.formatMode] || labels.toggle;
    btn.innerHTML = info.icon;
    btn.title = info.title;
    btn.className = 'fmt-btn' + (window.formatMode !== 'toggle' ? ' active' : '');
  }
};

function smartToggleFormat(text, before, after, mode) {
  if (typeof text !== 'string' || !text) return { toggled: false, text: text || '' };
  mode = mode || 'toggle';
  var bEsc = before.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var aEsc = after.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var pairRe = new RegExp(bEsc + '([\\s\\S]*?)' + aEsc, 'g');
  var parts = [], lastIdx = 0, foundPair = false, m;
  while ((m = pairRe.exec(text)) !== null) {
    foundPair = true;
    if (m && m.index > lastIdx) {
      var plain = text.slice(lastIdx, m.index);
      var ls = (plain && plain.match(/^(\s*)/) || ['', ''])[1];
      var rs = (plain && plain.match(/(\s*)$/) || ['', ''])[1];
      var mid = plain.slice(ls.length, plain.length - rs.length);
      if (mode === 'unwrap') {
        parts.push(plain); // не оборачиваем непарный текст
      } else {
        if (mid.length) { parts.push(ls + before + mid + after + rs); }
        else { parts.push(plain); }
      }
    }
    if (m && m[1] !== undefined) {
      if (mode === 'wrap') {
        parts.push(m[0]); // сохраняем оригинальную обёртку
      } else {
        parts.push(m[1]); // снимаем обёртку (toggle/unwrap)
      }
    }
    lastIdx = pairRe.lastIndex;
  }
  if (foundPair) {
    if (lastIdx < text.length) {
      var rest = text.slice(lastIdx);
      if (mode === 'unwrap') {
        parts.push(rest); // не оборачиваем
      } else {
        var ls = (rest && rest.match(/^(\s*)/) || ['', ''])[1];
        var rs = (rest && rest.match(/(\s*)$/) || ['', ''])[1];
        var mid = rest.slice(ls.length, rest.length - rs.length);
        if (mid.length) { parts.push(ls + before + mid + after + rs); }
        else { parts.push(rest); }
      }
    }
    return { toggled: true, text: parts.join('') };
  }
  // Нет ни одной пары
  if (mode === 'unwrap') return { toggled: false, text: text };
  if (mode === 'wrap') return { toggled: false, text: text };
  // toggle: проверим, обёрнут ли весь текст снаружи
  var outerRe = new RegExp('^' + bEsc + '([\\s\\S]*)' + aEsc + '$');
  var outerMatch = text.match(outerRe);
  if (outerMatch && outerMatch[1] !== undefined) {
    return { toggled: true, text: outerMatch[1] };
  }
  return { toggled: false, text: text };
}
  /**
 * Оборачивает выделенный текст в маркеры форматирования.
 * Работает построчно для многострочного выделения.
 */
function wrapSelection(before, after) {
  view.focus();
  var sel = view.state.selection.main;
  var from = sel.from, to = sel.to;
  var doc = view.state.doc;
  // Расширяем выделение на маркеры сразу за краями
  if (!sel.empty) {
    if (from >= before.length && doc.sliceString(from - before.length, from) === before) {
      from -= before.length;
    }
    if (to + after.length <= doc.length && doc.sliceString(to, to + after.length) === after) {
      to += after.length;
    }
  }
  var text = from === to ? '' : doc.sliceString(from, to);
  if (!text) {
    var insert = before + after;
    view.dispatch({
      changes: { from: from, to: to, insert: insert },
      selection: { anchor: from + before.length, head: from + before.length },
      scrollIntoView: true,
      userEvent: 'input.formatting'
    });
    view.focus();
    return;
  }
  var mode = window.formatMode || 'toggle';
  // Многострочный режим
  if (text.indexOf('\n') !== -1) {
    var lines = text.split('\n');
    var resultLines = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var st = smartToggleFormat(line, before, after, mode);
      if (mode === 'toggle') {
        if (st.toggled) { resultLines.push(st.text); }
        else if (line.length > 0) { resultLines.push(before + line + after); }
        else { resultLines.push(''); }
      } else if (mode === 'wrap') {
        if (st.toggled) { resultLines.push(st.text); }
        else if (line.length === 0) { resultLines.push(''); }
        else { resultLines.push(before + line + after); }
      } else if (mode === 'unwrap') {
        if (st.toggled) { resultLines.push(st.text); }
        else { resultLines.push(line); }
      }
    }
    var insert = resultLines.join('\n');
    view.dispatch({
      changes: { from: from, to: to, insert: insert },
      selection: { anchor: from, head: from + insert.length },
      scrollIntoView: true,
      userEvent: 'input.formatting'
    });
    view.focus();
    return;
  }
  // Однострочный
  var st = smartToggleFormat(text, before, after, mode);
  if (mode === 'toggle') {
    if (st.toggled) {
      view.dispatch({
        changes: { from: from, to: to, insert: st.text },
        selection: { anchor: from, head: from + st.text.length },
        scrollIntoView: true,
        userEvent: 'input.formatting'
      });
    } else {
      var insert = before + text + after;
      var anchor = from + before.length;
      var head = from + insert.length - after.length;
      view.dispatch({
        changes: { from: from, to: to, insert: insert },
        selection: { anchor: anchor, head: text ? head : anchor },
        scrollIntoView: true,
        userEvent: 'input.formatting'
      });
    }
  } else if (mode === 'wrap') {
    if (st.toggled) {
      view.dispatch({
        changes: { from: from, to: to, insert: st.text },
        selection: { anchor: from, head: from + st.text.length },
        scrollIntoView: true,
        userEvent: 'input.formatting'
      });
    } else if (text.length > 0) {
      var insert = before + text + after;
      var anchor = from + before.length;
      var head = from + insert.length - after.length;
      view.dispatch({
        changes: { from: from, to: to, insert: insert },
        selection: { anchor: anchor, head: text ? head : anchor },
        scrollIntoView: true,
        userEvent: 'input.formatting'
      });
    }
  } else if (mode === 'unwrap') {
    if (st.toggled) {
      view.dispatch({
        changes: { from: from, to: to, insert: st.text },
        selection: { anchor: from, head: from + st.text.length },
        scrollIntoView: true,
        userEvent: 'input.formatting'
      });
    }
  }
  view.focus();
}

function linePrefix(prefix) {
  view.focus();
  var sel = view.state.selection.main;
  var doc = view.state.doc;
  var fromLine = doc.lineAt(sel.from);
  var toLine = doc.lineAt(sel.to);
  var changes = [];
  for (var l = fromLine.number; l <= toLine.number; l++) {
    var line = doc.line(l);
    var text = line.text;
    if (text.startsWith(prefix)) {
      changes.push({ from: line.from, to: line.from + prefix.length, insert: '' });
    } else {
      changes.push({ from: line.from, insert: prefix });
    }
  }
  view.dispatch({ changes: changes, scrollIntoView: true, userEvent: 'input.formatting' });
  view.focus();
}

window.toggleBold = function () { view.focus(); wrapSelection('**', '**'); };
window.toggleItalic = function () { view.focus(); wrapSelection('*', '*'); };
window.toggleStrikethrough = function () { view.focus(); wrapSelection('~~', '~~'); };
window.toggleInlineCode = function () { view.focus(); wrapSelection('`', '`'); };
/**
 * Блок кода: оборачивает выделенный текст в ``` и обратно (toggle)
 */
window.toggleCodeBlock = function () {
  view.focus();
  var sel = view.state.selection.main;
  var text = sel.empty ? '' : view.state.sliceDoc(sel.from, sel.to);
  var trimmed = text.trim();
  var codeBlockPattern = /^```\n?([\s\S]*)\n?```$/;
  var match = trimmed.match(codeBlockPattern);
  if (match) {
    var inner = match[1];
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: inner },
      selection: { anchor: sel.from, head: sel.from + inner.length },
      scrollIntoView: true,
      userEvent: 'input.formatting'
    });
  } else {
    var innerText = text.trim() || 'текст';
    var insert = '```\n' + innerText + '\n```';
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: insert },
      selection: { anchor: sel.from, head: sel.from + insert.length },
      scrollIntoView: true,
      userEvent: 'input.formatting'
    });
  }
  view.focus();
};

/**
 * Заголовок: применяется ко всем выделенным строкам (toggle для каждой)
 */
window.toggleHeading = function (level) {
  if (level < 1 || level > 6) level = 1;
  var prefix = new Array(level + 1).join('#') + ' ';
  var sel = view.state.selection.main;
  var doc = view.state.doc;
  var fromLine = doc.lineAt(sel.from);
  var toLine = doc.lineAt(sel.to);
  var changes = [];
  for (var l = fromLine.number; l <= toLine.number; l++) {
    var line = doc.line(l);
    var text = line.text;
    var headingMatch = text.match(/^(#{1,6})\s/);
    if (headingMatch && headingMatch[1].length === level) {
      changes.push({ from: line.from, to: line.from + headingMatch[0].length, insert: '' });
    } else if (headingMatch) {
      changes.push({ from: line.from, to: line.from + headingMatch[1].length, insert: new Array(level + 1).join('#') });
    } else {
      changes.push({ from: line.from, insert: prefix });
    }
  }
  view.dispatch({ changes: changes, scrollIntoView: true, userEvent: 'input.formatting' });
  view.focus();
};

window.toggleBulletList = function () { linePrefix('- '); };
window.toggleBlockquote = function () { linePrefix('> '); };

window.toggleOrderedList = function () {
  var sel = view.state.selection.main;
  var doc = view.state.doc;
  var fromLine = doc.lineAt(sel.from);
  var toLine = doc.lineAt(sel.to);
  var changes = [];
  var num = 1;
  for (var l = fromLine.number; l <= toLine.number; l++) {
    var line = doc.line(l);
    var text = line.text;
    var numberedMatch = text.match(/^\d+\.\s/);
    if (numberedMatch) {
      changes.push({ from: line.from, to: line.from + numberedMatch[0].length, insert: '' });
    } else {
      var nprefix = num + '. ';
      if (text.startsWith('- ') || text.startsWith('* ')) {
        changes.push({ from: line.from, to: line.from + 2, insert: nprefix });
      } else {
        changes.push({ from: line.from, insert: nprefix });
      }
    }
    num++;
  }
  view.dispatch({ changes: changes, scrollIntoView: true, userEvent: 'input.formatting' });
  view.focus();
};

window.insertLink = function () {
  var sel = view.state.selection.main;
  var text = sel.empty ? '' : view.state.sliceDoc(sel.from, sel.to);
  if (text) {
    if (text.startsWith('http://') || text.startsWith('https://') || text.startsWith('ftp://')) {
      var insert = '[ссылка](' + text + ')';
      view.dispatch({
        changes: { from: sel.from, to: sel.to, insert: insert },
        selection: { anchor: sel.from + 1, head: sel.from + 7 },
        scrollIntoView: true, userEvent: 'input.formatting'
      });
    } else {
      var insert = '[' + text + '](url)';
      view.dispatch({
        changes: { from: sel.from, to: sel.to, insert: insert },
        selection: { anchor: sel.from + text.length + 3, head: sel.from + text.length + 6 },
        scrollIntoView: true, userEvent: 'input.formatting'
      });
    }
  } else {
    var insert = '[текст ссылки](https://example.com)';
    view.dispatch({
      changes: { from: sel.from, insert: insert },
      selection: { anchor: sel.from + 1, head: sel.from + 14 },
      scrollIntoView: true, userEvent: 'input.formatting'
    });
  }
  view.focus();
};

window.insertImage = function () {
  var sel = view.state.selection.main;
  var text = sel.empty ? '' : view.state.sliceDoc(sel.from, sel.to);
  if (text) {
    var insert = '![' + text + '](url)';
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: insert },
      scrollIntoView: true, userEvent: 'input.formatting'
    });
  } else {
    var insert = '![подпись](image.jpg)';
    view.dispatch({
      changes: { from: sel.from, insert: insert },
      selection: { anchor: sel.from + 2, head: sel.from + 9 },
      scrollIntoView: true, userEvent: 'input.formatting'
    });
  }
  view.focus();
};

window.insertHorizontalRule = function () {
  var sel = view.state.selection.main;
  view.dispatch({
    changes: { from: sel.from, insert: '\n\n---\n\n' },
    scrollIntoView: true, userEvent: 'input.formatting'
  });
  view.focus();
};

window.insertTable = function () {
  var sel = view.state.selection.main;
  var insert = '\n| Заголовок 1 | Заголовок 2 | Заголовок 3 |\n|-------------|-------------|-------------|\n| Текст       | Текст       | Текст       |\n';
  view.dispatch({
    changes: { from: sel.from, insert: insert },
    selection: { anchor: sel.from + insert.length },
    scrollIntoView: true, userEvent: 'input.formatting'
  });
  view.focus();
};

window.insertMermaid = function () {
  var sel = view.state.selection.main;
  var insert = '\n```mermaid\ngraph TD\n    A[Начало] --> B[Конец]\n```\n';
  view.dispatch({
    changes: { from: sel.from, insert: insert },
    selection: { anchor: sel.from + insert.length - 5 },
    scrollIntoView: true, userEvent: 'input.formatting'
  });
  view.focus();
};

window.insertChart = function () {
  var sel = view.state.selection.main;
  var insert = '\n```chart\ntype: column\ntitle: Пример\n| Месяц | Продажи |\n|-------|---------|\n| Янв   | 30      |\n| Фев   | 50      |\n| Мар   | 70      |\n```\n';
  view.dispatch({
    changes: { from: sel.from, insert: insert },
    selection: { anchor: sel.from + insert.length - 5 },
    scrollIntoView: true, userEvent: 'input.formatting'
  });
  view.focus();
};

// Вставка текста в позицию курсора (для внешних диалогов)
window.insertText = function (text) {
  var sel = view.state.selection.main;
  view.dispatch({
    changes: { from: sel.from, insert: text },
    scrollIntoView: true,
    userEvent: 'input.formatting'
  });
  view.focus();
};

window.getRenderedBodyHTMLExport = function () {
  // Для экспорта ссылки вида [text](url+) превращаем в обычные <a href="url">
  // Для этого парсим с другим renderer'ом
  // Используем new marked.Renderer() чтобы все методы (heading, paragraph и т.д.)
  // были унаследованы от базового класса
  var exportRenderer = new marked.Renderer();
  exportRenderer.link = function ({ href, title, text }) {
    var cleanHref = href.endsWith('+') ? href.slice(0, -1) : href;
    var titleAttr = title ? ' title="' + title + '"' : '';
    return '<a href="' + cleanHref + '"' + titleAttr + ' target="_blank">' + text + '</a>';
  };
  exportRenderer.code = function ({ text, lang }) {
    if (lang === 'mermaid') {
      return '<pre class="mermaid" data-code="' + encodeURIComponent(text) + '">' + text + '</pre>';
    }
    if (lang === 'chart') {
      var id = 'chart-' + (chartCounter++);
      var escaped = encodeURIComponent(text);
      return '<div id="' + id + '" data-chart-code="' + escaped + '" style="min-height:300px;"></div>';
    }
    return false;
  };
  var content = view.state.doc.toString();
  return marked.parse(content, { renderer: exportRenderer });
};

window.getEditorStyles = function () {
  var el = document.querySelector('style');
  return el ? el.innerHTML : '';
};
// Функция для смены темы Mermaid (вызывается из applyTheme в index.html)
window.rethemeMermaid = function (dark) {
  // Восстанавливаем код диаграмм из data-code
  document.querySelectorAll('.mermaid').forEach(function (el) {
    var code = el.getAttribute('data-code');
    if (code) {
      el.innerHTML = decodeURIComponent(code);
      el.removeAttribute('data-processed');
    }
  });
  // Инициализируем с цветами под тему
  mermaid.initialize({
    theme: 'base',
    startOnLoad: false,
    themeVariables: {
      background: dark ? '#1e1e1e' : '#ffffff',
      primaryColor: dark ? '#1e1e1e' : '#ffffff',
      primaryBorderColor: dark ? '#d4d4d4' : '#000000',
      primaryTextColor: dark ? '#d4d4d4' : '#000000',
      secondaryColor: dark ? '#1e1e1e' : '#ffffff',
      secondaryBorderColor: dark ? '#d4d4d4' : '#000000',
      secondaryTextColor: dark ? '#d4d4d4' : '#000000',
      tertiaryColor: dark ? '#1e1e1e' : '#ffffff',
      tertiaryBorderColor: dark ? '#d4d4d4' : '#000000',
      tertiaryTextColor: dark ? '#d4d4d4' : '#000000',
      lineColor: dark ? '#d4d4d4' : '#000000',
      arrowheadColor: dark ? '#d4d4d4' : '#000000',
      textColor: dark ? '#d4d4d4' : '#000000',
      titleColor: dark ? '#d4d4d4' : '#000000',
      nodeBkg: dark ? '#1e1e1e' : '#ffffff',
      nodeBorder: dark ? '#d4d4d4' : '#000000',
      nodeTextColor: dark ? '#d4d4d4' : '#000000',
      clusterBkg: dark ? '#1e1e1e' : '#ffffff',
      clusterBorder: dark ? '#d4d4d4' : '#000000',
      defaultLinkColor: dark ? '#d4d4d4' : '#000000',
      edgeLabelBackground: dark ? '#1e1e1e' : '#ffffff',
      border1: dark ? '#d4d4d4' : '#000000',
      border2: dark ? '#d4d4d4' : '#000000',
      mainBkg: dark ? '#1e1e1e' : '#ffffff',
      secondBkg: dark ? '#1e1e1e' : '#ffffff',
      actorBorder: dark ? '#d4d4d4' : '#000000',
      actorBkg: dark ? '#1e1e1e' : '#ffffff',
      actorTextColor: dark ? '#d4d4d4' : '#000000',
      actorLineColor: dark ? '#d4d4d4' : '#000000',
      signalColor: dark ? '#d4d4d4' : '#000000',
      signalTextColor: dark ? '#d4d4d4' : '#000000',
      labelBoxBkgColor: dark ? '#1e1e1e' : '#ffffff',
      labelBoxBorderColor: dark ? '#d4d4d4' : '#000000',
      labelTextColor: dark ? '#d4d4d4' : '#000000',
      loopTextColor: dark ? '#d4d4d4' : '#000000',
      noteBorderColor: dark ? '#d4d4d4' : '#000000',
      noteBkgColor: dark ? '#1e1e1e' : '#ffffff',
      noteTextColor: dark ? '#d4d4d4' : '#000000',
      activationBorderColor: dark ? '#d4d4d4' : '#000000',
      activationBkgColor: dark ? '#1e1e1e' : '#ffffff',
      sequenceNumberColor: dark ? '#d4d4d4' : '#000000',
      sectionBkgColor: dark ? '#1e1e1e' : '#ffffff',
      altSectionBkgColor: dark ? '#1e1e1e' : '#ffffff',
      sectionBkgColor2: dark ? '#1e1e1e' : '#ffffff',
      excludeBkgColor: dark ? '#1e1e1e' : '#ffffff',
      taskBorderColor: dark ? '#d4d4d4' : '#000000',
      taskBkgColor: dark ? '#1e1e1e' : '#ffffff',
      activeTaskBorderColor: dark ? '#d4d4d4' : '#000000',
      activeTaskBkgColor: dark ? '#1e1e1e' : '#ffffff',
      gridColor: dark ? '#555555' : '#000000',
      doneTaskBkgColor: dark ? '#1e1e1e' : '#ffffff',
personBorder: dark ? '#d4d4d4' : '#000000',
      personBkg: dark ? '#1e1e1e' : '#ffffff',
      rowOdd: dark ? '#1e1e1e' : '#ffffff',
      rowEven: dark ? '#1e1e1e' : '#ffffff',
      labelColor: dark ? '#d4d4d4' : '#000000',
      errorBkgColor: dark ? '#1e1e1e' : '#ffffff',
      errorTextColor: dark ? '#d4d4d4' : '#000000',
      classText: dark ? '#d4d4d4' : '#000000',
      stateLabelColor: dark ? '#d4d4d4' : '#000000',
      stateBkg: dark ? '#1e1e1e' : '#ffffff',
      labelBackgroundColor: dark ? '#1e1e1e' : '#ffffff',
      compositeBackground: dark ? '#1e1e1e' : '#ffffff',
      altBackground: dark ? '#1e1e1e' : '#ffffff',
      compositeTitleBackground: dark ? '#1e1e1e' : '#ffffff',
      compositeBorder: dark ? '#d4d4d4' : '#000000',
      innerEndBackground: dark ? '#1e1e1e' : '#ffffff',
      stateBorder: dark ? '#d4d4d4' : '#000000',
      specialStateColor: dark ? '#d4d4d4' : '#000000',
      rectBkgColor: dark ? '#1e1e1e' : '#ffffff',
      transitionColor: dark ? '#d4d4d4' : '#000000',
      transitionLabelColor: dark ? '#d4d4d4' : '#000000',
      requirementBackground: dark ? '#1e1e1e' : '#ffffff',
      requirementBorderColor: dark ? '#d4d4d4' : '#000000',
      requirementTextColor: dark ? '#d4d4d4' : '#000000',
      relationColor: dark ? '#d4d4d4' : '#000000',
      relationLabelBackground: dark ? '#1e1e1e' : '#ffffff',
      relationLabelColor: dark ? '#d4d4d4' : '#000000',
      git0: dark ? '#1e1e1e' : '#ffffff',
      git1: dark ? '#2d2d2d' : '#dddddd',
      git2: dark ? '#1e1e1e' : '#ffffff',
      git3: dark ? '#2d2d2d' : '#dddddd',
      git4: dark ? '#1e1e1e' : '#ffffff',
      git5: dark ? '#2d2d2d' : '#dddddd',
      git6: dark ? '#1e1e1e' : '#ffffff',
      git7: dark ? '#2d2d2d' : '#dddddd',
      gitInv0: dark ? '#d4d4d4' : '#000000',
      gitInv1: dark ? '#d4d4d4' : '#222222',
      gitInv2: dark ? '#d4d4d4' : '#000000',
      gitInv3: dark ? '#d4d4d4' : '#222222',
      gitInv4: dark ? '#d4d4d4' : '#000000',
      gitInv5: dark ? '#d4d4d4' : '#222222',
      gitInv6: dark ? '#d4d4d4' : '#000000',
      gitInv7: dark ? '#d4d4d4' : '#222222',
      branchLabelColor: dark ? '#d4d4d4' : '#000000',
      gitBranchLabel0: dark ? '#1e1e1e' : '#ffffff',
      gitBranchLabel1: dark ? '#1e1e1e' : '#ffffff',
      gitBranchLabel2: dark ? '#1e1e1e' : '#ffffff',
      gitBranchLabel3: dark ? '#1e1e1e' : '#ffffff',
      gitBranchLabel4: dark ? '#1e1e1e' : '#ffffff',
      gitBranchLabel5: dark ? '#1e1e1e' : '#ffffff',
      gitBranchLabel6: dark ? '#1e1e1e' : '#ffffff',
      gitBranchLabel7: dark ? '#1e1e1e' : '#ffffff',
      tagLabelColor: dark ? '#d4d4d4' : '#000000',
      tagLabelBackground: dark ? '#1e1e1e' : '#ffffff',
      tagLabelBorder: dark ? '#d4d4d4' : '#000000',
      commitLabelColor: dark ? '#d4d4d4' : '#000000',
      commitLabelBackground: dark ? '#1e1e1e' : '#ffffff',
      pie1: '#ffffff',
      pie2: '#dddddd',
      pie3: '#bbbbbb',
      pie4: '#999999',
      pie5: '#777777',
      pie6: '#555555',
      pie7: '#ffffff',
      pie8: '#dddddd',
      pie9: '#bbbbbb',
      pie10: '#999999',
      pie11: '#777777',
      pie12: '#555555',
      pieTitleTextColor: dark ? '#d4d4d4' : '#000000',
      pieSectionTextColor: dark ? '#d4d4d4' : '#000000',
      pieLegendTextColor: dark ? '#d4d4d4' : '#000000',
      pieStrokeColor: dark ? '#555555' : '#000000',
      pieOuterStrokeColor: dark ? '#555555' : '#000000',
      useGradient: false,
      dropShadow: 'none',
    }
  });
  try { mermaid.run({ querySelector: '.mermaid' }); } catch (e) { }
};