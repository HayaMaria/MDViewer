import { EditorView, basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { ViewPlugin, Decoration, keymap } from "@codemirror/view";
import { StateField, StateEffect, RangeSetBuilder, Compartment, EditorState } from "@codemirror/state";
import { indentUnit } from "@codemirror/language";
import { defaultKeymap, historyKeymap, undo, redo, undoDepth, redoDepth, indentLess } from "@codemirror/commands";
import { marked } from "marked";
import mermaid from "mermaid";
import { Chart, registerables } from "chart.js";
import { applyChartTheme, renderChart } from "./charts.js";
import mermaidThemes from "../../assets/mermaid-themes.json";

// Mermaid в превью всегда рисуется светлой палитрой; в тёмной теме его инвертирует CSS.
// useMaxWidth:false — SVG в натуральном размере (не растягивается на 100% контейнера).
mermaid.initialize(mermaidThemes.light);

// 600 — «нормальный» масштаб Mermaid. Одно и то же число зумит все схемы одинаково:
// текст и блоки одного размера, ширина картинки зависит от того, сколько в ней элементов.
const MEDIA_SCALE_BASE = 600;

// Число из блока или из настроек. Для «по умолчанию» читаем настройки,
// а не текущую ширину элемента: после масштаба она уже другая.
function diagramTargetWidth(container) {
  if (container.getAttribute("data-size") === "default") {
    const kind = container.getAttribute("data-kind") || "mermaid";
    const defaults = window.__mediaSizeDefaults || { image: 500, mermaid: 600, uml: 450, chart: 600 };
    const fromSettings = parseInt(defaults[kind], 10);
    if (fromSettings > 0) return fromSettings;
  }
  const explicit = parseInt(container.getAttribute("data-mdv-width"), 10);
  if (explicit > 0) return explicit;
  const styled = parseInt(container.style.width, 10);
  if (styled > 0) return styled;
  return MEDIA_SCALE_BASE;
}

function scaleDiagramSvg(container) {
  const svg = container.querySelector("svg");
  if (!svg) return;
  const target = diagramTargetWidth(container);
  if (container.getAttribute("data-size") !== "default") {
    container.setAttribute("data-mdv-width", String(target));
  }
  const zoom = target / MEDIA_SCALE_BASE;

  let natW = 0;
  let natH = 0;
  const vb = (svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/);
  if (vb.length >= 4) {
    natW = parseFloat(vb[2]) || 0;
    natH = parseFloat(vb[3]) || 0;
  }
  if (!(natW > 0)) {
    const aw = svg.getAttribute("width") || "";
    const ah = svg.getAttribute("height") || "";
    if (aw.indexOf("%") === -1) natW = parseFloat(aw) || 0;
    if (ah.indexOf("%") === -1) natH = parseFloat(ah) || 0;
  }
  const drawW = natW > 0 ? Math.max(1, Math.round(natW * zoom)) : target;
  container.style.width = drawW + "px";
  container.style.maxWidth = "none";

  svg.setAttribute("width", String(drawW));
  if (natW > 0 && natH > 0) svg.setAttribute("height", String(Math.max(1, Math.round(natH * zoom))));
  else svg.removeAttribute("height");
  svg.style.width = drawW + "px";
  svg.style.maxWidth = "none";
  svg.style.height = "auto";
}
window.scaleDiagramSvg = scaleDiagramSvg;

Chart.register(...registerables);
window.Chart = Chart;
window.renderChart = renderChart;
window.applyChartTheme = applyChartTheme;
applyChartTheme(true);

// Счётчик для уникальных id графиков
let chartCounter = 0;

// Разбор info-строки ограждения: «mermaid uml width=600px» → { type, width, isUml }
function parseFenceInfo(lang) {
  const parts = (lang || "").trim().split(/\s+/).filter(Boolean);
  const type = (parts[0] || "").toLowerCase();
  let width = null;
  let isUml = false;
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (/^uml$/i.test(part)) {
      isUml = true;
      continue;
    }
    const m = part.match(/^width=(\d+)(?:px)?$/i);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 50 && n <= 2000) width = n;
    }
  }
  return { type, width, isUml };
}

function extractChartWidth(text) {
  const lines = text.trim().split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const m = line.match(/^width:\s*(\d+)(?:px)?/i);
    if (m) {
      const n = parseInt(m[1], 10);
      return n >= 50 && n <= 2000 ? n : null;
    }
    if (!/^(type|title|xlabel|ylabel|width):/i.test(line) && !line.startsWith("|")) break;
  }
  return null;
}

// Атрибуты ширины: явный px или data-size=default → CSS-переменная из настроек
function sizeAttrs(kind, width) {
  const styles = [];
  if (width != null) styles.push("width:" + width + "px");
  const styleAttr = styles.length ? ` style="${styles.join(";")}"` : "";
  const widthData = width != null ? ` data-mdv-width="${width}"` : "";
  const sizeData = width != null
    ? ` data-kind="${kind}"`
    : ` data-kind="${kind}" data-size="default"`;
  return ` class="mdv-sized"${widthData}${styleAttr}${sizeData}`;
}

function mermaidBlock(text, width, kind) {
  const widthData = width != null ? ` data-mdv-width="${width}" style="width:${width}px"` : ` data-size="default"`;
  return `<pre class="mermaid mdv-sized" data-code="${encodeURIComponent(text)}" data-kind="${kind}"${widthData}>${text}</pre>`;
}

function chartBlock(text, widthFromFence) {
  const width = widthFromFence != null ? widthFromFence : extractChartWidth(text);
  return `<div id="chart-${chartCounter++}" data-chart-code="${encodeURIComponent(text)}"${sizeAttrs("chart", width)}></div>`;
}

function nomnomlBlock(text, width) {
  const id = "nomnoml-" + (chartCounter++);
  const escaped = encodeURIComponent(text);
  const widthBits = width != null
    ? ` data-mdv-width="${width}" style="width:${width}px;min-height:100px"`
    : ` data-size="default" style="min-height:100px"`;
  return `<div id="${id}" class="nomnoml-diagram mdv-sized" data-nomnoml-code="${escaped}" data-kind="uml"${widthBits}></div>`;
}

// ![alt](url){width=400px} → ширина на <img>; без указания — дефолт из настроек
function processImageSizes(html) {
  html = html.replace(/<img\b([^>]*?)>\s*\{width=(\d+)(?:px)?\}/gi, (_, attrs, w) => {
    const n = parseInt(w, 10);
    const width = n >= 50 && n <= 2000 ? n : null;
    const cleaned = attrs.replace(/\s*class=(["'])[^"']*\1/i, "");
    if (width != null) {
      return `<img${cleaned} class="mdv-sized" data-kind="image" style="width:${width}px">`;
    }
    return `<img${cleaned} class="mdv-sized" data-kind="image" data-size="default">`;
  });
  return html.replace(/<img\b(?![^>]*\bmdv-sized\b)([^>]*)>/gi,
    (_, attrs) => `<img${attrs} class="mdv-sized" data-kind="image" data-size="default">`);
}

// В экспорте подставляем фактическую ширину вместо CSS-переменных настроек
function resolveDefaultMediaSizes(html) {
  const defaults = Object.assign(
    { image: 500, mermaid: 600, uml: 450, chart: 600 },
    window.__mediaSizeDefaults || {}
  );
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  tmp.querySelectorAll(".mdv-sized[data-size='default'][data-kind]").forEach((el) => {
    const kind = el.getAttribute("data-kind");
    const w = defaults[kind] != null ? defaults[kind] : 600;
    el.style.width = w + "px";
    el.setAttribute("data-mdv-width", String(w));
    if (kind === "chart") el.style.height = Math.round(w * 5 / 8) + "px";
    el.removeAttribute("data-size");
  });
  return tmp.innerHTML;
}

// Настройка marked:
// — [текст](url) — открывается в браузере
// — [текст](url+) — открывается в новом окне приложения
// — блоки ```mermaid / ```chart / ```nomnoml — контейнеры для отрисовки диаграмм
const renderer = {
  link({ href, title, text }) {
    const openInApp = href.endsWith("+");
    const cleanHref = openInApp ? href.slice(0, -1) : href;
    const titleAttr = title ? ` title="${title}"` : "";
    if (openInApp) {
      return `<span class="app-link" data-url="${cleanHref}"${titleAttr}>${text}</span>`;
    }
    return `<span class="external-link" data-url="${cleanHref}"${titleAttr}>${text} ↗</span>`;
  },
  code({ text, lang }) {
    const info = parseFenceInfo(lang);
    if (info.type === "mermaid") return mermaidBlock(text, info.width, info.isUml ? "uml" : "mermaid");
    if (info.type === "chart") return chartBlock(text, info.width);
    if (info.type === "nomnoml") return nomnomlBlock(text, info.width);
    // Для остальных блоков — пусть marked обрабатывает стандартно (возвращаем null/false)
    return false;
  },
};
marked.use({ renderer });

// ===== Производительность превью: debounce + кэш диаграмм =====
// Превью перестраивается через innerHTML, поэтому на каждое нажатие клавиши
// заново отрисовывались ВСЕ диаграммы (mermaid/nomnoml) — на документах со
// множеством схем ввод «зависал». Теперь:
//  1) перестройка откладывается до паузы в наборе (debounce);
//  2) отрендеренные SVG кэшируются по сигнатуре (тип + исходник [+ тема]) и
//     восстанавливаются мгновенно, а mermaid.run запускается только для
//     новых/изменённых диаграмм.

// Задержка до перестройки превью после последнего изменения текста (мс)
const PREVIEW_DEBOUNCE_MS = 200;
// Максимальное число записей в кэше SVG диаграмм (ограничение памяти)
const DIAGRAM_CACHE_LIMIT = 100;

let previewTimer = null;
let lastPreviewContent = null;

// Кэш отрендеренных SVG: сигнатура -> innerHTML контейнера
const diagramSVGCache = new Map();

function getPreviewTheme() {
  return document.documentElement.getAttribute("data-theme") || "dark";
}

// Mermaid инициализируется один раз с фиксированной палитрой и не зависит от
// темы приложения, поэтому тема в его сигнатуру не входит. nomnoml
// перекрашивается под тему — тема входит в его сигнатуру.
function makeDiagramSignature(kind, code, withTheme) {
  return kind + "\u0000" + (withTheme ? getPreviewTheme() + "\u0000" : "") + code;
}

function svgCacheGet(key) {
  const svg = diagramSVGCache.get(key);
  if (svg !== undefined) {
    // LRU: переносим запись в конец очереди вытеснения
    diagramSVGCache.delete(key);
    diagramSVGCache.set(key, svg);
  }
  return svg;
}

function svgCachePut(key, svg) {
  diagramSVGCache.delete(key);
  diagramSVGCache.set(key, svg);
  while (diagramSVGCache.size > DIAGRAM_CACHE_LIMIT) {
    diagramSVGCache.delete(diagramSVGCache.keys().next().value);
  }
}

// Отложенное обновление превью: пока пользователь печатает, перестройка не
// выполняется; запускается через PREVIEW_DEBOUNCE_MS после последней правки
function schedulePreviewUpdate() {
  if (previewTimer !== null) clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    previewTimer = null;
    updatePreview();
  }, PREVIEW_DEBOUNCE_MS);
}

// Функция обновления превью
// force=true — пропустить проверку «текст не менялся» (нужно после выхода из
// режима просмотра HTML, когда DOM превью был очищен извне)
function updatePreview(force) {
  // В режиме просмотра HTML-файла превью занято iframe — не перерисовываем
  if (window.__htmlMode) return;
  const content = view.state.doc.toString();
  // Текст не менялся с прошлой перестройки — перерисовывать нечего
  if (!force && content === lastPreviewContent) return;
  lastPreviewContent = content;
  const html = processImageSizes(marked.parse(content));
  const previewEl = document.getElementById("preview");

  // ===== Сохранение позиции при перерисовке =====
  // innerHTML-перезапись уничтожает элементы: пока диаграммы (mermaid/chart)
  // не отрендерились, высота превью резко падает, браузер клампит scrollTop
  // к верху, а после рендера высота возвращается — позиция уже потеряна.
  // Якорим верхний видимый блок и возвращаем его на место после стабилизации;
  // на это время синхронизация заморожена (syncScroll.settling), чтобы
  // служебные кламп-прокрутки не дёргали вторую панель.
  const settleId = ++syncScrollSettle.id;
  syncScroll.settling = true;
  syncScroll.lock = null;

  // Якорь ДО перезаписи: блок у верхней кромки + его смещение от кромки
  let anchorIndex = 0;
  let anchorOffset = 0;
  const panelTop = previewEl.getBoundingClientRect().top;
  const oldKids = Array.from(previewEl.children);
  for (let i = 0; i < oldKids.length; i++) {
    if (oldKids[i].getBoundingClientRect().top <= panelTop) anchorIndex = i;
    else break;
  }
  if (oldKids.length && anchorIndex < oldKids.length) {
    anchorOffset = oldKids[anchorIndex].getBoundingClientRect().top - panelTop;
  }

  previewEl.innerHTML = html;

  // Промежуточное восстановление (диаграммы ещё не отрендерены): держим
  // якорный блок у кромки, чтобы не мигало и не улетало к верху
  const kidsMid = Array.from(previewEl.children);
  if (kidsMid.length && anchorIndex < kidsMid.length) {
    const contentTop = kidsMid[anchorIndex].getBoundingClientRect().top
      - previewEl.getBoundingClientRect().top + previewEl.scrollTop;
    syncScroll.lock = "editor"; // эхо этой установки не должно синхронизировать редактор
    previewEl.scrollTop = Math.max(0, contentTop - anchorOffset);
  }

  // Рендерим схемы Mermaid: неизменённые диаграммы восстанавливаем из кэша SVG
  // мгновенно, а mermaid.run({nodes}) запускаем только для новых/изменённых
  // блоков (точечный рендер). Promise ждём в стабилизации ниже (ошибки глотаем).
  let mermaidDone = Promise.resolve();
  const pendingMermaid = [];
  previewEl.querySelectorAll(".mermaid").forEach((el) => {
    const key = makeDiagramSignature("mermaid", el.dataset.code || "", false);
    const cached = svgCacheGet(key);
    if (cached !== undefined) {
      el.innerHTML = cached;
      scaleDiagramSvg(el);
    } else {
      pendingMermaid.push(el);
    }
  });
  if (pendingMermaid.length) {
    try {
      mermaidDone = Promise.resolve(mermaid.run({ nodes: pendingMermaid }))
        .catch(() => { })
        .then(() => {
          // Кэшируем исходный SVG (viewBox), масштаб ставим отдельно —
          // иначе смена width подставит картинку прошлого размера.
          pendingMermaid.forEach((el) => {
            const svg = el.innerHTML;
            if (svg && svg.indexOf("<svg") !== -1) {
              svgCachePut(makeDiagramSignature("mermaid", el.dataset.code || "", false), svg);
            }
            scaleDiagramSvg(el);
          });
        });
    } catch (e) { }
  }

  // Рендерим графики Chart.js (пересоздаются после innerHTML-перезаписи;
  // уничтожение прежних инстансов выполняет сам renderChart, см. charts.js)
  previewEl.querySelectorAll("[id^='chart-']").forEach((el) => {
    const code = decodeURIComponent(el.dataset.chartCode || "");
    if (code) {
      const w = diagramTargetWidth(el);
      el.setAttribute("data-mdv-width", String(w));
      el.style.width = w + "px";
      el.style.maxWidth = "none";
      el.style.height = Math.round(w * 5 / 8) + "px";
      renderChart(code, el.id);
    }
  });

  // Рендерим диаграммы nomnoml: неизменённые восстанавливаем из кэша SVG
  previewEl.querySelectorAll(".nomnoml-diagram").forEach((el) => {
    const code = decodeURIComponent(el.dataset.nomnomlCode || "");
    if (!code) return;
    const key = makeDiagramSignature("nomnoml", code, true);
    const cached = svgCacheGet(key);
    if (cached !== undefined) {
      el.innerHTML = cached;
      scaleDiagramSvg(el);
      return;
    }
    if (typeof window.renderNomnoml === "function") {
      try {
        window.renderNomnoml(el, code);
        if (el.innerHTML.indexOf("<svg") !== -1) {
          svgCachePut(key, el.innerHTML);
          scaleDiagramSvg(el);
        }
      } catch (e) {
        el.innerHTML = `<pre style="color:#ff6b6b;">Parse error: ${e.message}</pre>`;
      }
    }
  });

  // Стабилизация: после mermaid.run и двух кадров раскладки (canvas графиков,
  // layout) возвращаем якорный блок точно на место и снимаем заморозку.
  // Токен settleId: применяется только самая последняя перестройка.
  mermaidDone.then(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (settleId !== syncScrollSettle.id) return;
      const kids = Array.from(previewEl.children);
      if (kids.length && anchorIndex < kids.length) {
        const contentTop = kids[anchorIndex].getBoundingClientRect().top
          - previewEl.getBoundingClientRect().top + previewEl.scrollTop;
        const desired = Math.max(0, contentTop - anchorOffset);
        if (Math.abs(desired - previewEl.scrollTop) > 0.5) {
          // Эхо этой установки погасится в обработчике (lock !== 'preview');
          // если события не будет — подчистим lock следующим кадром
          syncScroll.lock = "editor";
          previewEl.scrollTop = desired;
        }
      }
      syncScroll.settling = false;
      requestAnimationFrame(() => {
        if (syncScroll.lock === "editor") syncScroll.lock = null;
      });
    }));
  });

  bindPreviewLinks(previewEl, ".external-link", "open_external");
  bindPreviewLinks(previewEl, ".app-link", "open_in_app_window");
}

// Настройки размера по умолчанию применяются к уже открытому документу
window.refreshPreviewMedia = function () {
  if (!view) return;
  lastPreviewContent = null;
  updatePreview(true);
};

function bindPreviewLinks(previewEl, selector, apiMethod) {
  previewEl.querySelectorAll(selector).forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (el.dataset.url) window.callApi(apiMethod, el.dataset.url);
    });
  });
}

// Биндинг, вызывающий метод Python API (нативные диалоги файлов)
function apiCommand(method) {
  return () => {
    window.callApi(method);
    return true;
  };
}

// Строки выделения. Хвост, который лишь упирается в начало следующей строки, её не захватывает.
function selectedLineNumbers(state, range) {
  const doc = state.doc;
  const first = doc.lineAt(range.from).number;
  let last = doc.lineAt(range.to).number;
  if (last > first && range.to === doc.line(last).from) last--;
  return [first, last];
}

// Tab добавляет один уровень отступа в каждую затронутую строку.
// Shift+Tab (indentLess) снимает ровно этот же уровень.
function indentSelectedLines(editor) {
  const state = editor.state;
  if (state.readOnly) return true;
  const unit = state.facet(indentUnit) || "  ";
  const changes = [];
  const seen = new Set();
  for (const range of state.selection.ranges) {
    const [first, last] = selectedLineNumbers(state, range);
    for (let n = first; n <= last; n++) {
      if (seen.has(n)) continue;
      seen.add(n);
      changes.push({ from: state.doc.line(n).from, insert: unit });
    }
  }
  if (!changes.length) return true;
  const spec = state.changes(changes);
  editor.dispatch({ changes: spec, selection: state.selection.map(spec, 1) });
  return true;
}

// Кастомные биндинги (Mod = Ctrl на Windows/Linux, Cmd на macOS)
// Должны идти ДО defaultKeymap, чтобы `Mod-s` переопределил стандартный save
const customKeyBindings = [
  { key: "Mod-n", run: apiCommand("new_document") },
  { key: "Mod-o", run: apiCommand("open_document") },
  { key: "Mod-s", run: apiCommand("save_document") },
  { key: "Mod-Shift-s", run: apiCommand("save_document_as") },
  // Форматирование: жирный, курсив, зачёркнутый, подчёркнутый, инлайн-код
  { key: "Mod-b", run: () => { window.toggleBold(); return true; } },
  { key: "Mod-i", run: () => { window.toggleItalic(); return true; } },
  { key: "Mod-Shift-x", run: () => { window.toggleStrikethrough(); return true; } },
  { key: "Mod-u", run: () => { window.toggleUnderline(); return true; } },
  { key: "Mod-`", run: () => { window.toggleInlineCode(); return true; } },
  { key: "Mod-Shift-Enter", run: () => { window.insertBlankParagraph(); return true; } },
  { key: "Tab", run: indentSelectedLines },
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

// ===== Режим «только чтение» (включается при просмотре HTML-файлов) =====
const readOnlyCompartment = new Compartment();

// Включить/выключить запрет редактирования (вызывается из html-mode.js)
window.setEditorReadOnly = function (readOnly) {
  view.dispatch({
    effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(!!readOnly)),
  });
};

// Текст появляется после старта моста pywebview: файл из Проводника или приветствие (main.js)
const editorExtensions = [
  basicSetup,
  markdown(),
  oneDark,
  keymap.of([...customKeyBindings, ...defaultKeymap, ...historyKeymap]),
  searchHighlightExt,
  readOnlyCompartment.of(EditorState.readOnly.of(false)),
  EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      // Превью перестраиваем с задержкой (debounce) — иначе на документах со
      // множеством диаграмм ввод блокируется на каждой клавише
      schedulePreviewUpdate();
      // Помечаем как несохранённое при изменении документа
      if (window.markUnsaved) window.markUnsaved();
      syncHistoryButtons(update.state);
    }
    // Обновляем позицию курсора при любом изменении выделения или документа
    if (update.selectionSet || update.docChanged) {
      updateCursorPosition(update.view);
    }
  }),
];

function createEditorState(doc) {
  return EditorState.create({ doc: doc || "", extensions: editorExtensions });
}

const view = new EditorView({
  state: createEditorState(""),
  parent: document.getElementById("editor"),
});

// Экспортируем view для внешнего доступа (нужно для принудительного пересчёта размеров)
window.__cmView = view;

// ===== Размер шрифта редактора (при запуске и из диалога «Настройки») =====
window.setEditorFontSize = function (size) {
  window.__editorFontSize = size;
  const content = view.contentDOM;
  if (content) {
    content.style.fontSize = size + "px";
  }
};

function reapplyEditorFontSize() {
  if (window.__editorFontSize) window.setEditorFontSize(window.__editorFontSize);
}

function finishDocumentSwap() {
  reapplyEditorFontSize();
  updatePreview();
  syncHistoryButtons(view.state);
  document.dispatchEvent(new CustomEvent("mdv-document-replaced"));
}

// Подмена документа сбрасывает историю правок, чтобы Ctrl+Z не возвращал текст другой вкладки.
function replaceEditorDocument(text) {
  window.__suppressDirty = true;
  try {
    view.setState(createEditorState(text));
  } finally {
    window.__suppressDirty = false;
  }
  finishDocumentSwap();
  return view.state;
}

// Вернуть снимок вкладки: текст, курсор и свою историю отмены.
window.swapEditorState = function (state) {
  window.__suppressDirty = true;
  try {
    if (state) view.setState(state);
  } finally {
    window.__suppressDirty = false;
  }
  finishDocumentSwap();
  return view.state;
};

// ===== Синхронная прокрутка редактора и превью =====
// Пропорциональный режим: переносится доля прокрутки
// (scrollTop / (scrollHeight - clientHeight)) в обе стороны.
// Защита от зацикливания (editor -> preview -> editor): флаг источника
// синхронизации + сброс через requestAnimationFrame + гистерезис 1px.
const syncScroll = {
  enabled: true, // переключается кнопкой на тулбаре (см. toolbar.js -> toggleSyncScroll)
  lock: null,    // 'editor' | 'preview' — чья программная установка scrollTop сейчас «летит»
  settling: false, // заморозка на время перестройки превью (см. updatePreview)
};

// Токен последней перестройки превью (защита от гонки при быстрой печати)
const syncScrollSettle = { id: 0 };

const syncPreviewEl = document.getElementById("preview");
const syncEditorWrapEl = document.getElementById("editor");

// Доля прокрутки source, пересчитанная в scrollTop для target.
// Возвращает null, если целевая панель прокручивать нечего.
function syncScrollTargetTop(sourceEl, targetEl) {
  const targetMax = targetEl.scrollHeight - targetEl.clientHeight;
  if (targetMax <= 0) return null;
  const sourceMax = sourceEl.scrollHeight - sourceEl.clientHeight;
  const ratio = sourceMax > 0 ? sourceEl.scrollTop / sourceMax : 0;
  return ratio * targetMax;
}

// Какой элемент реально прокручивает редактор.
// ВАЖНО: .cm-editor не ограничен по высоте и растёт по контенту, поэтому
// вертикально скроллится внешний контейнер #editor (класс .panel,
// overflow: auto), а не .cm-scroller (view.scrollDOM). Проверяем оба:
// переполнение в один момент времени есть только у реального скроллера.
function getEditorScrollEl() {
  const cm = view.scrollDOM;
  if (cm && cm.scrollHeight > cm.clientHeight + 1) return cm;
  if (syncEditorWrapEl && syncEditorWrapEl.scrollHeight > syncEditorWrapEl.clientHeight + 1) {
    return syncEditorWrapEl;
  }
  return cm;
}

// Подписка source-панели: при её прокрутке двигаем target-панель.
// sourceEl — элемент, к которому привязан слушатель: scroll не всплывает,
// событие придёт только от элемента, который реально прокрутил пользователь.
function attachSyncScroll(sourceEl, sourceName) {
  if (!sourceEl) return;
  sourceEl.addEventListener("scroll", function () {
    if (!syncScroll.enabled) return;
    // Заморозка на время перестройки превью (updatePreview): клампы и
    // служебные прокрутки не должны дёргать вторую панель
    if (syncScroll.settling) return;
    const targetEl = sourceName === "editor" ? syncPreviewEl : getEditorScrollEl();
    if (!targetEl || targetEl === sourceEl) return;
    // «Эхо»: событие вызвано нашей же программной установкой scrollTop в другой панели
    if (syncScroll.lock && syncScroll.lock !== sourceName) {
      syncScroll.lock = null;
      return;
    }
    const target = syncScrollTargetTop(sourceEl, targetEl);
    if (target === null) return;
    if (Math.abs(targetEl.scrollTop - target) < 1) return;
    syncScroll.lock = sourceName;
    targetEl.scrollTop = target;
    // Снимаем блокировку после эхо-события (scroll-события приходят до rAF в этом же кадре)
    requestAnimationFrame(() => {
      if (syncScroll.lock === sourceName) syncScroll.lock = null;
    });
  });
}

attachSyncScroll(view.scrollDOM, "editor");
attachSyncScroll(syncEditorWrapEl, "editor"); // внешний контейнер — реальный скроллер редактора
attachSyncScroll(syncPreviewEl, "preview");

// Включение/выключение синхронной прокрутки (вызывается из toolbar.js)
window.setSyncScrollEnabled = function (enabled) {
  syncScroll.enabled = !!enabled;
  syncScroll.lock = null;
  // При включении сразу подводим превью к текущей позиции редактора
  if (syncScroll.enabled && syncPreviewEl) {
    const sourceEl = getEditorScrollEl();
    if (sourceEl) {
      const target = syncScrollTargetTop(sourceEl, syncPreviewEl);
      if (target !== null) syncPreviewEl.scrollTop = target;
    }
  }
};

// Сразу показываем превью при запуске
updatePreview();

// Принудительная перерисовка MD-превью извне (нужна после выхода из режима
// просмотра HTML-файла; сама updatePreview глобально недоступна из-за минификации)
// force=true: DOM превью мог быть очищен извне — проверку «текст не менялся»
// игнорируем
window.forceUpdatePreview = () => updatePreview(true);

// Функция для получения текста из редактора (вызывается из Python)
window.getEditorContent = () => view.state.doc.toString();

// Функция для установки текста в редактор (вызывается из Python и при смене вкладки)
window.setEditorContent = (text) => {
  replaceEditorDocument(text);
};

// ===== Команды правки (кнопки тулбара) =====

// Серые кнопки, когда в истории вкладки нечего отменять или повторять.
function syncHistoryButtons(state) {
  const undoBtn = document.getElementById("undo-btn");
  const redoBtn = document.getElementById("redo-btn");
  if (undoBtn) undoBtn.disabled = undoDepth(state) === 0;
  if (redoBtn) redoBtn.disabled = redoDepth(state) === 0;
}

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
    const sel = view.state.selection.main;
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: text },
      selection: { anchor: sel.from + text.length }
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

// Позиции всех совпадений: массив [from, to]
window.getSearchMatchPositions = function (text) {
  return getAllSearchMatches(text);
};

// Текущая позиция курсора в документе
window.getSearchCursorPos = function () {
  return view.state.selection.main.head;
};

// ===== Функции форматирования Markdown (панель инструментов) =====
// Инлайн-маркеры (**, *, ~~, `, <u>) ставятся отдельно на каждую строку
// выделения: Markdown не продолжает выделение через пустую строку, заголовок
// или пункт списка, поэтому обёртка всего блока целиком не работает.
// Однородное выделение переключается; смешанное (часть текста уже
// отформатирована) приводится к состоянию символа, с которого начато выделение.
// Блочные команды (списки, цитата, заголовки) переключаются для всех строк
// разом: если разметка есть у всех непустых строк — снимается, иначе
// добавляется недостающим.

// Блочный префикс строки, после которого начинается текст для инлайн-маркеров:
// отступ, цитата, маркер списка (в т.ч. задачи), заголовок
const INLINE_PREFIX_RE = /^(?:\s*>)*\s*(?:(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)?(?:#{1,6}\s+)?/;
// Префикс до маркера списка/заголовка: отступ и уровни цитаты
const LEAD_RE = /^(?:\s*>)*\s*/;
const HR_RE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;
const TABLE_ROW_RE = /^\s*\|/;
const FENCE_RE = /^\s*(`{3,}|~{3,})/;

// Маркеры из повторяющегося символа: допустимая длина серии символов.
// Для * учитывается, что *** — это одновременно жирный и курсив.
const RUN_MARKERS = {
  '**': n => n >= 2,
  '*': n => n === 1 || n >= 3,
  '~~': n => n >= 2,
  '`': n => n >= 1,
};

function isBlankLine(text) {
  return /^(?:\s*>)*\s*$/.test(text);
}

// Блоки кода ``` / ~~~: пары номеров строк открывающего и закрывающего ограждения
function codeBlocks(doc) {
  const blocks = [];
  let open = null, fence = '';
  for (let n = 1; n <= doc.lines; n++) {
    const m = FENCE_RE.exec(doc.line(n).text);
    if (!m) continue;
    if (open === null) {
      open = n;
      fence = m[1];
    } else if (m[1][0] === fence[0] && m[1].length >= fence.length) {
      blocks.push({ open, close: n });
      open = null;
    }
  }
  if (open !== null) blocks.push({ open, close: doc.lines });
  return blocks;
}

function inCodeBlock(blocks, n) {
  return blocks.some(b => n >= b.open && n <= b.close);
}

// Строки, затронутые выделением. Выделение, закончившееся в самом начале
// строки (тройной клик, Shift+Down), эту строку не захватывает.
function selectedLines(state) {
  const doc = state.doc;
  const sel = state.selection.main;
  const first = doc.lineAt(sel.from).number;
  let last = doc.lineAt(sel.to).number;
  if (last > first && sel.to === doc.line(last).from) last--;
  const lines = [];
  for (let n = first; n <= last; n++) lines.push(doc.line(n));
  return lines;
}

// Применяет изменения, сохраняя выделение вокруг отформатированного текста
function applyFormatting(changes, selection) {
  const state = view.state;
  const sel = state.selection.main;
  const set = state.changes(changes);
  if (!selection) {
    if (sel.empty) {
      selection = { anchor: set.mapPos(sel.head, 1) };
    } else {
      const from = set.mapPos(sel.from, -1);
      const to = set.mapPos(sel.to, 1);
      selection = sel.anchor <= sel.head ? { anchor: from, head: to } : { anchor: to, head: from };
    }
  }
  view.dispatch({ changes: set, selection, scrollIntoView: true, userEvent: 'input.formatting' });
  view.focus();
}

// Разбор строки (после блочного префикса) для одного типа маркера.
// kinds[i]: 't' — текст, 'm' — маркер этого типа, 'f' — «чужой» символ
// маркера (например, лишняя * из *** для жирного); fmt[i] — символ внутри
// обёртки. pairs — найденные обёртки: [o0, o1) открывающий маркер,
// [c0, c1) закрывающий.
function parseInline(text, start, before, after) {
  const n = text.length;
  const kinds = new Array(n).fill('t');
  const fmt = new Array(n).fill(false);
  const cands = [];
  const fits = RUN_MARKERS[before];
  let i = start;
  while (i < n) {
    // Внутри инлайн-кода другие маркеры не действуют
    if (text[i] === '`' && before !== '`') {
      let j = i; while (text[j] === '`') j++;
      const tick = text.slice(i, j);
      const close = text.indexOf(tick, j);
      i = close < 0 ? j : close + tick.length;
      continue;
    }
    if (fits && text[i] === before[0]) {
      let j = i; while (text[j] === before[0]) j++;
      for (let k = i; k < j; k++) kinds[k] = 'f';
      if (fits(j - i)) cands.push({ i, j, open: true, close: true });
      i = j;
      continue;
    }
    if (!fits && (text.startsWith(before, i) || text.startsWith(after, i))) {
      const isOpen = text.startsWith(before, i);
      const len = isOpen ? before.length : after.length;
      cands.push({ i, j: i + len, open: isOpen, close: !isOpen });
      i += len;
      continue;
    }
    i++;
  }
  // Открывающий маркер должен стоять перед непробельным символом,
  // закрывающий — после непробельного (как в CommonMark)
  const pairs = [];
  let opener = null;
  for (const c of cands) {
    const canOpen = c.open && c.j < n && !/\s/.test(text[c.j]);
    const canClose = c.close && c.i > start && !/\s/.test(text[c.i - 1]);
    if (opener && canClose) {
      pairs.push({ o0: opener.i, o1: opener.i + before.length, c0: c.j - after.length, c1: c.j });
      opener = null;
    } else if (!opener && canOpen) {
      opener = c;
    }
  }
  for (const p of pairs) {
    for (let k = p.o0; k < p.o1; k++) kinds[k] = 'm';
    for (let k = p.c0; k < p.c1; k++) kinds[k] = 'm';
    for (let k = p.o1; k < p.c0; k++) fmt[k] = true;
  }
  return { kinds, fmt, pairs };
}

// Участок строки под инлайн-маркеры: без блочного префикса и крайних
// пробелов. region — участок, который будет перестроен: выделение плюс
// все обёртки, пересекающие его или вплотную к нему примыкающие.
function inlineSegment(line, selFrom, selTo, before, after) {
  const text = line.text;
  if (HR_RE.test(text)) return null;
  const prefix = INLINE_PREFIX_RE.exec(text)[0].length;
  let from = Math.max(selFrom - line.from, prefix);
  let to = Math.min(selTo, line.to) - line.from;
  while (from < to && /\s/.test(text[from])) from++;
  while (to > from && /\s/.test(text[to - 1])) to--;
  if (from >= to) return null;
  // Ячейки таблицы оборачиваются по одной, иначе строка таблицы ломается
  if (TABLE_ROW_RE.test(text) && text.slice(from, to).includes('|')) return null;
  const parsed = parseInline(text, prefix, before, after);
  let rFrom = from, rTo = to;
  for (const p of parsed.pairs) {
    if (p.o0 <= to && p.c1 >= from) {
      rFrom = Math.min(rFrom, p.o0);
      rTo = Math.max(rTo, p.c1);
    }
  }
  // Значимые (непробельные текстовые) символы выделения
  const selected = [];
  for (let k = from; k < to; k++) {
    if (parsed.kinds[k] === 't' && !/\s/.test(text[k])) selected.push(k);
  }
  return { line, text, from, to, rFrom, rTo, ...parsed, selected };
}

// Перестраивает region сегмента так, чтобы выделенные символы получили
// состояние target. Возвращает изменение и позиции символов в новом тексте.
function rebuildSegment(seg, target, before, after) {
  const { text, kinds, fmt } = seg;
  const items = [];
  for (let k = seg.rFrom; k < seg.rTo; k++) {
    if (kinds[k] === 'm') continue;
    const inSel = k >= seg.from && k < seg.to;
    items.push({ k, ch: text[k], kind: kinds[k], on: kinds[k] === 't' ? (inSel ? target : fmt[k]) : null });
  }
  // «Чужие» символы маркеров следуют за соседним текстом: сначала справа, иначе слева
  for (let x = 0; x < items.length; x++) {
    if (items[x].on !== null) continue;
    let y = x + 1; while (y < items.length && items[y].kind === 'f') y++;
    if (y < items.length) { items[x].on = items[y].on; continue; }
    y = x - 1; while (y >= 0 && items[y].kind === 'f') y--;
    items[x].on = y >= 0 ? items[y].on : false;
  }
  // Пробелы по краям форматированного участка выносятся за маркеры
  for (let x = 0; x < items.length;) {
    let y = x; while (y < items.length && items[y].on === items[x].on) y++;
    if (items[x].on) {
      let a = x; while (a < y && /\s/.test(items[a].ch)) items[a++].on = false;
      let b = y - 1; while (b >= a && /\s/.test(items[b].ch)) items[b--].on = false;
    }
    x = y;
  }
  let out = '';
  const pos = new Map();
  for (let x = 0; x < items.length; x++) {
    const it = items[x];
    const start = out.length;
    if (it.on && (x === 0 || !items[x - 1].on)) out += before;
    const at = out.length;
    out += it.ch;
    if (it.on && (x === items.length - 1 || !items[x + 1].on)) out += after;
    pos.set(it.k, { start, at, end: out.length });
  }
  const base = seg.line.from;
  return { change: { from: base + seg.rFrom, to: base + seg.rTo, insert: out }, pos };
}

function wrapSelection(before, after) {
  view.focus();
  const state = view.state;
  const doc = state.doc;
  const sel = state.selection.main;

  let segments = [];
  const word = sel.empty ? state.wordAt(sel.head) : null;
  if (sel.empty) {
    const line = doc.lineAt(sel.head);
    const seg = word && inlineSegment(line, word.from, word.to, before, after);
    if (!seg || !seg.selected.length) {
      const pos = sel.head - line.from;
      if (pos >= before.length && line.text.slice(pos - before.length, pos) === before
          && line.text.startsWith(after, pos)) {
        // Курсор между пустыми маркерами — убрать их
        applyFormatting({ from: sel.head - before.length, to: sel.head + after.length });
      } else {
        applyFormatting({ from: sel.head, insert: before + after }, { anchor: sel.head + before.length });
      }
      return;
    }
    segments = [seg];
  } else {
    const blocks = codeBlocks(doc);
    for (const line of selectedLines(state)) {
      if (inCodeBlock(blocks, line.number)) continue;
      const seg = inlineSegment(line, sel.from, sel.to, before, after);
      if (seg && seg.selected.length) segments.push(seg);
    }
    if (!segments.length) return;
  }

  // Однородный текст переключается; смешанный приводится к состоянию
  // символа, с которого начато выделение (с конца — последнего символа)
  const states = segments.flatMap(s => s.selected.map(k => s.fmt[k]));
  let target;
  if (states.every(Boolean)) target = false;
  else if (!states.some(Boolean)) target = true;
  else {
    const forward = sel.anchor <= sel.head;
    const seg = forward ? segments[0] : segments[segments.length - 1];
    target = seg.fmt[forward ? seg.selected[0] : seg.selected[seg.selected.length - 1]];
  }

  const rebuilt = segments.map(s => rebuildSegment(s, target, before, after));
  const set = state.changes(rebuilt.map(r => r.change));
  const newPos = (i, k, key) => set.mapPos(rebuilt[i].change.from, -1) + rebuilt[i].pos.get(k)[key];

  if (sel.empty) {
    // Курсор остаётся на том же символе слова
    const seg = segments[0];
    const head = sel.head - seg.line.from;
    const k = head < seg.to ? head : seg.to - 1;
    const p = newPos(0, k, 'at') + (head < seg.to ? 0 : 1);
    applyFormatting(set, { anchor: p });
    return;
  }

  const first = segments[0], lastIdx = segments.length - 1, last = segments[lastIdx];
  let from = newPos(0, first.selected[0], 'start');
  let to = newPos(lastIdx, last.selected[last.selected.length - 1], 'end');
  // Выделение шире значимых символов: маркер списка, цитата, отступ и уже
  // стоящие маркеры. Если оно доходит до края перестроенного участка или
  // выходит за него, граница остаётся на этом крае — в том числе после
  // повторного форматирования, когда хвост строки состоит из маркеров.
  const selFrom = Math.min(sel.anchor, sel.head);
  const selTo = Math.max(sel.anchor, sel.head);
  if (selFrom <= rebuilt[0].change.from) from = Math.min(from, set.mapPos(selFrom, -1));
  if (selTo >= rebuilt[lastIdx].change.to) to = Math.max(to, set.mapPos(selTo, 1));
  applyFormatting(set, sel.anchor <= sel.head ? { anchor: from, head: to } : { anchor: to, head: from });
}

window.toggleBold = () => wrapSelection('**', '**');
window.toggleItalic = () => wrapSelection('*', '*');
window.toggleStrikethrough = () => wrapSelection('~~', '~~');
window.toggleUnderline = () => wrapSelection('<u>', '</u>');
window.toggleInlineCode = () => wrapSelection('`', '`');

// Строки для блочной разметки: непустые и вне блоков кода. Если таких нет
// (курсор на пустой строке) — текущая строка, чтобы начать ввод с разметкой.
function blockTargetLines(state) {
  const blocks = codeBlocks(state.doc);
  const lines = selectedLines(state).filter(l => !inCodeBlock(blocks, l.number));
  const nonBlank = lines.filter(l => !isBlankLine(l.text));
  if (nonBlank.length) return nonBlank;
  return lines.length ? [lines[0]] : [];
}

// Общий toggle блочной разметки. parse(text) -> { at, len, has }: позиция и
// длина существующего маркера и признак, что строка уже размечена.
function toggleLineMarkup(parse, makePrefix) {
  view.focus();
  const lines = blockTargetLines(view.state);
  if (!lines.length) return;
  const parsed = lines.map(l => parse(l.text));
  const remove = parsed.every(p => p.has);
  const changes = [];
  let index = 0;
  lines.forEach((line, i) => {
    const p = parsed[i];
    const from = line.from + p.at;
    if (remove) changes.push({ from, to: from + p.len, insert: '' });
    else changes.push({ from, to: from + p.len, insert: makePrefix(index++, p) });
  });
  applyFormatting(changes);
}

const LIST_MARK_RE = /^((?:\s*>)*\s*)([-*+]\s+|\d+[.)]\s+)?/;

window.toggleBulletList = function () {
  toggleLineMarkup(text => {
    const m = LIST_MARK_RE.exec(text);
    const mark = m[2] || '';
    return { at: m[1].length, len: mark.length, has: /^[-*+]/.test(mark), mark };
  }, (i, p) => p.has ? p.mark : '- ');
};

window.toggleOrderedList = function () {
  toggleLineMarkup(text => {
    const m = LIST_MARK_RE.exec(text);
    const mark = m[2] || '';
    return { at: m[1].length, len: mark.length, has: /^\d/.test(mark) };
  }, i => (i + 1) + '. ');
};

window.toggleBlockquote = function () {
  view.focus();
  const lines = selectedLines(view.state);
  const quoted = text => /^\s*>/.test(text);
  const relevant = lines.filter(l => !isBlankLine(l.text) || quoted(l.text));
  const remove = relevant.length > 0 && relevant.every(l => quoted(l.text));
  const changes = [];
  for (const line of lines) {
    const m = /^(\s*)(>\s?)?/.exec(line.text);
    const from = line.from + m[1].length;
    if (remove) {
      if (m[2]) changes.push({ from, to: from + m[2].length, insert: '' });
    } else if (!m[2]) {
      // Пустые строки внутри цитаты получают «>», чтобы цитата не разрывалась
      changes.push({ from, insert: line.text.trim() || lines.length === 1 ? '> ' : '>' });
    }
  }
  if (changes.length) applyFormatting(changes);
};

window.toggleHeading = function (level) {
  if (level < 1 || level > 6) level = 1;
  const hashes = '#'.repeat(level);
  toggleLineMarkup(text => {
    const lead = LEAD_RE.exec(text)[0].length;
    const m = /^(#{1,6})(\s+|$)/.exec(text.slice(lead));
    return { at: lead, len: m ? m[0].length : 0, has: !!m && m[1].length === level };
  }, () => hashes + ' ');
};

/**
 * Блок кода: оборачивает выделенные строки в ``` и обратно (toggle).
 * Снятие работает, когда выделение внутри блока или включает его ограждения.
 */
window.toggleCodeBlock = function () {
  view.focus();
  const state = view.state;
  const doc = state.doc;
  const lines = selectedLines(state);
  const first = lines[0], last = lines[lines.length - 1];
  const block = codeBlocks(doc).find(b => b.open <= first.number && last.number <= b.close);
  if (block) {
    const open = doc.line(block.open);
    const changes = [{ from: open.from, to: Math.min(open.to + 1, doc.length) }];
    if (block.close !== block.open && FENCE_RE.test(doc.line(block.close).text)) {
      const close = doc.line(block.close);
      changes.push({ from: close.from - 1, to: close.to });
    }
    applyFormatting(changes);
    return;
  }
  if (lines.length === 1 && isBlankLine(first.text)) {
    applyFormatting({ from: first.from, to: first.to, insert: '```\n\n```' }, { anchor: first.from + 4 });
    return;
  }
  applyFormatting([
    { from: first.from, insert: '```\n' },
    { from: last.to, insert: '\n```' },
  ]);
};

// Выделение без крайних пробелов; переносы внутри схлопываются в пробел,
// т.к. текст ссылки/подпись не может пересекать пустую строку
function inlineSelectionText(state) {
  const sel = state.selection.main;
  const raw = state.sliceDoc(sel.from, sel.to);
  const from = sel.from + (raw.length - raw.trimStart().length);
  const to = sel.to - (raw.length - raw.trimEnd().length);
  return { from, to, text: raw.trim().replace(/\s*\n\s*/g, ' ') };
}

const URL_RE = /^(?:https?|ftp):\/\/\S+$/;

window.insertLink = function () {
  view.focus();
  const { from, to, text } = inlineSelectionText(view.state);
  if (!text) {
    const insert = '[текст ссылки](https://example.com)';
    applyFormatting({ from: to, insert }, { anchor: to + 1, head: to + 13 });
  } else if (URL_RE.test(text)) {
    applyFormatting({ from, to, insert: '[ссылка](' + text + ')' }, { anchor: from + 1, head: from + 7 });
  } else {
    const insert = '[' + text + '](url)';
    applyFormatting({ from, to, insert }, { anchor: from + text.length + 3, head: from + text.length + 6 });
  }
};

window.insertImage = function () {
  view.focus();
  const width = (typeof window.getMediaSizeDefault === "function"
    ? window.getMediaSizeDefault("image")
    : 100);
  const sizeSuffix = "{width=" + width + "px}";
  const { from, to, text } = inlineSelectionText(view.state);
  if (!text) {
    const insert = "![подпись](image.jpg)" + sizeSuffix;
    applyFormatting({ from: to, insert }, { anchor: to + 2, head: to + 9 });
  } else if (URL_RE.test(text)) {
    applyFormatting(
      { from, to, insert: "![подпись](" + text + ")" + sizeSuffix },
      { anchor: from + 2, head: from + 9 }
    );
  } else {
    const insert = "![" + text + "](url)" + sizeSuffix;
    applyFormatting(
      { from, to, insert },
      { anchor: from + text.length + 4, head: from + text.length + 7 }
    );
  }
};

// Отдельный блок после текущей строки: с пустой строкой перед ним (иначе
// «текст\n---» станет заголовком, а «текст\n&nbsp;» — частью абзаца) и после
// него. Курсор ставится на пустую строку после блока.
function insertBlockAfterLine(block) {
  view.focus();
  const state = view.state;
  const doc = state.doc;
  const line = doc.lineAt(state.selection.main.to);
  const next = line.number < doc.lines ? doc.line(line.number + 1) : null;
  const tail = next && isBlankLine(next.text) ? '' : '\n';
  if (isBlankLine(line.text)) {
    const prev = line.number > 1 ? doc.line(line.number - 1) : null;
    const lead = prev && !isBlankLine(prev.text) ? '\n' : '';
    applyFormatting({ from: line.from, to: line.to, insert: lead + block + tail },
      { anchor: line.from + lead.length + block.length + 1 });
  } else {
    applyFormatting({ from: line.to, insert: '\n\n' + block + tail }, { anchor: line.to + block.length + 3 });
  }
}

window.insertHorizontalRule = () => insertBlockAfterLine('---');

// Видимая пустая строка: Markdown схлопывает подряд идущие пустые строки,
// а абзац из неразрывного пробела отображается как пустой абзац
window.insertBlankParagraph = () => insertBlockAfterLine('&nbsp;');

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

// HTML документа для экспорта: [текст](url+) превращаются в обычные <a href>
const exportRenderer = new marked.Renderer();
exportRenderer.link = function ({ href, title, text }) {
  const cleanHref = href.endsWith("+") ? href.slice(0, -1) : href;
  const titleAttr = title ? ` title="${title}"` : "";
  return `<a href="${cleanHref}"${titleAttr} target="_blank">${text}</a>`;
};
exportRenderer.code = function ({ text, lang }) {
  const info = parseFenceInfo(lang);
  if (info.type === "mermaid") return mermaidBlock(text, info.width, info.isUml ? "uml" : "mermaid");
  if (info.type === "chart") return chartBlock(text, info.width);
  if (info.type === "nomnoml") return nomnomlBlock(text, info.width);
  return false;
};

window.getRenderedBodyHTMLExport = () =>
  resolveDefaultMediaSizes(
    processImageSizes(marked.parse(view.state.doc.toString(), { renderer: exportRenderer }))
  );
