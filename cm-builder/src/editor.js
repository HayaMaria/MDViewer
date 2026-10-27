import { EditorView, basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { oneDarkTheme } from "@codemirror/theme-one-dark";
import { ViewPlugin, Decoration, keymap } from "@codemirror/view";
import { StateField, StateEffect, RangeSetBuilder, Compartment, EditorState } from "@codemirror/state";
import { indentUnit } from "@codemirror/language";
import { defaultKeymap, historyKeymap, undo, redo, undoDepth, redoDepth, indentLess } from "@codemirror/commands";
import { marked } from "marked";
import { applyChartTheme, renderChart } from "./charts.js";
import { builtinHighlight, codeHighlighting } from "./code-highlight.js";
import { highlightCodeBlock } from "./highlight.js";
import { editorCodeLanguage } from "./code-languages.js";
import { bindSpellcheck, pasteClipboard, spellCompartment, spellcheckOff } from "./spellcheck.js";
import { alignExtension, alignMarker } from "./align.js";
import mermaidThemes from "../../assets/mermaid-themes.json";

// Mermaid и Chart.js не входят в бандл редактора: их файлы подключаются,
// когда в документе появляется первая такая схема.

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

window.renderChart = renderChart;
window.applyChartTheme = applyChartTheme;

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

const TABLE_WIDTH_LINE = /^\{width=(\d+)(?:px)?\}$/i;

function tableWidthPx(text) {
  const m = String(text || "").trim().match(TABLE_WIDTH_LINE);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 50 && n <= 2000 ? n : null;
}

function withTableWidth(attrs, n) {
  let tag = attrs || "";
  if (/\bmdv-table-sized\b/.test(tag)) return `<table${tag}>`;
  if (/\bclass=/i.test(tag)) tag = tag.replace(/\bclass=(["'])/i, "class=$1mdv-table-sized ");
  else tag += ' class="mdv-table-sized"';
  if (/\bstyle=/i.test(tag)) tag = tag.replace(/\bstyle=(["'])/i, `style=$1width:${n}px;`);
  else tag += ` style="width:${n}px"`;
  return `<table${tag}>`;
}

// Строка {width=400px} через пустую строку после таблицы задаёт её ширину.
// В целом документе она приходит отдельным абзацем сразу за </table>.
function processTableWidths(html) {
  return html.replace(
    /<table\b([^>]*)>((?:(?!<table\b)[\s\S])*?)<\/table>\s*<p>\s*\{width=(\d+)(?:px)?\}\s*<\/p>/gi,
    (full, attrs, body, w) => {
      const n = tableWidthPx(`{width=${w}px}`);
      if (n == null) return full;
      return `${withTableWidth(attrs, n)}${body}</table>`;
    }
  );
}

// В превью таблица и строка ширины — разные токены. Склеиваем их,
// иначе ширина рисуется текстом, а таблица остаётся узкой.
function absorbTableWidths(tokens) {
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== "table") continue;
    let j = i + 1;
    if (tokens[j] && tokens[j].type === "space") j++;
    const para = tokens[j];
    if (!para || para.type !== "paragraph") continue;
    const n = tableWidthPx(para.text);
    if (n == null) continue;
    let extra = "";
    for (let k = i + 1; k <= j; k++) extra += tokens[k].raw || "";
    tokens[i].raw = (tokens[i].raw || "") + extra;
    tokens[i].mdvWidth = n;
    tokens.splice(i + 1, j - i);
  }
}

function processRenderedHtml(html) {
  return processTableWidths(processImageSizes(html));
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
  const tableWidth = parseInt(defaults.table, 10);
  if (tableWidth > 0) {
    tmp.querySelectorAll("table:not(.mdv-table-sized)").forEach((table) => {
      table.classList.add("mdv-table-sized");
      table.style.width = tableWidth + "px";
    });
  }
  return tmp.innerHTML;
}

// Настройка marked:
// — [текст](url) — открывается в браузере
// — [текст](url+) — открывается в новом окне приложения
// — :::center / :::right — выравнивание блока
// — блоки ```mermaid / ```chart / ```nomnoml — контейнеры для отрисовки диаграмм
// Чекбокс задачи — свой значок. Клик по нему в превью переключает [ ] / [x] в тексте.
function taskBox({ checked }) {
  const on = checked ? " is-checked" : "";
  const label = checked ? "Сделано" : "Не сделано";
  return `<span class="task-box${on}" role="checkbox" aria-checked="${checked ? "true" : "false"}" title="${label}"></span> `;
}

// Пункты-задачи в том порядке, в каком marked нарисует квадратики.
function collectTaskItems(tokens, out) {
  for (const token of tokens) {
    if (token.type === "list") {
      for (const item of token.items) {
        if (item.task) out.push(item);
        if (item.tokens) collectTaskItems(item.tokens, out);
      }
    } else if (token.tokens && token.type !== "code") {
      collectTaskItems(token.tokens, out);
    }
  }
}

// Позиции «[ ]» / «[x]» в исходнике. from указывает на «[».
// raw пункта у marked без отступа, поэтому ищем первую строку пункта,
// а совпадения внутри ``` не считаем.
function fenceRanges(text) {
  const ranges = [];
  const re = /^[ ]{0,3}(`{3,}|~{3,})/gm;
  let open = null;
  let m;
  while ((m = re.exec(text))) {
    const fence = m[1];
    if (!open) {
      open = { start: m.index, ch: fence[0], len: fence.length };
    } else if (fence[0] === open.ch && fence.length >= open.len) {
      const lineEnd = text.indexOf("\n", m.index);
      ranges.push([open.start, lineEnd < 0 ? text.length : lineEnd + 1]);
      open = null;
    }
  }
  if (open) ranges.push([open.start, text.length]);
  return ranges;
}

function taskCheckPositions(text) {
  const items = [];
  collectTaskItems(marked.lexer(text), items);
  const fences = fenceRanges(text);
  const positions = [];
  let cursor = 0;
  for (const item of items) {
    const line = item.raw.split("\n")[0];
    const box = /\[([ xX])\]/.exec(line);
    if (!box) return [];
    let at = text.indexOf(line, cursor);
    while (at >= 0 && fences.some(([a, b]) => at >= a && at < b)) {
      at = text.indexOf(line, at + line.length);
    }
    if (at < 0) return [];
    positions.push({ from: at + box.index, checked: box[1] !== " " });
    cursor = at + line.length;
  }
  return positions;
}

// Один слушатель на колонку: блоки при правке живут долго, и вешать
// клик заново на каждую перерисовку нельзя — он сработал бы дважды.
function setupPreviewClicks(previewEl) {
  if (previewEl.dataset.clicksBound) return;
  previewEl.dataset.clicksBound = "1";
  previewEl.addEventListener("click", (e) => {
    const link = e.target.closest(".external-link, .app-link");
    if (link && previewEl.contains(link)) {
      e.preventDefault();
      e.stopPropagation();
      if (link.dataset.url) {
        const method = link.classList.contains("app-link") ? "open_in_app_window" : "open_external";
        window.callApi(method, link.dataset.url);
      }
      return;
    }
    const box = e.target.closest(".task-box");
    if (!box || !previewEl.contains(box) || view.state.readOnly) return;
    const positions = taskCheckPositions(view.state.doc.toString());
    const boxes = previewEl.querySelectorAll(".task-box");
    if (boxes.length !== positions.length) return;
    const index = Array.prototype.indexOf.call(boxes, box);
    const task = positions[index];
    if (!task) return;
    e.preventDefault();
    e.stopPropagation();
    const insert = task.checked ? "[ ]" : "[x]";
    view.dispatch({
      changes: { from: task.from, to: task.from + 3, insert },
      userEvent: "input",
    });
  });
}

function renderCodeBlock({ text, lang }) {
  const info = parseFenceInfo(lang);
  if (info.type === "mermaid") return mermaidBlock(text, info.width, info.isUml ? "uml" : "mermaid");
  if (info.type === "chart") return chartBlock(text, info.width);
  if (info.type === "nomnoml") return nomnomlBlock(text, info.width);
  return highlightCodeBlock(text, info.type);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isRemoteHref(href) {
  return /^(https?:)/i.test(href || "");
}

// Короткая ссылка -> прямой адрес картинки. Объявлено рано: превью строится при запуске.
const remoteImageCache = new Map();

// У адреса нет расширения картинки: это может быть страница, а не файл.
// Прямой файл отдаём странице как есть, короткую ссылку сначала раскрывает Python.
function remoteImageNeedsResolve(href) {
  const path = String(href || "").split(/[?#]/)[0];
  return !/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(path);
}

function isVideoHref(href) {
  const path = String(href || "").split(/[?#]/)[0];
  return /\.(mp4|m4v|webm|mov|ogv|ogg|mkv|avi)$/i.test(path);
}

// Локальный файл не отдаём браузеру страницы: WebView2 не грузит file://.
// Путь остаётся в data-mdv-file, а байты подставляет Python.
function renderMarkdownImage({ href, title, text }) {
  const alt = escapeHtml(text || "");
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
  if (isRemoteHref(href)) {
    if (remoteImageNeedsResolve(href)) {
      const known = remoteImageCache.get(href);
      const src = known ? ` src="${escapeHtml(known)}"` : "";
      const pending = known ? "" : ' data-mdv-resolve="1"';
      return `<img${src} alt="${alt}"${titleAttr} data-mdv-remote="${encodeURIComponent(href)}"${pending}>`;
    }
    return `<img src="${escapeHtml(href)}" alt="${alt}"${titleAttr}>`;
  }
  return `<img alt="${alt}"${titleAttr} data-mdv-file="${encodeURIComponent(href || "")}">`;
}

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
  image: renderMarkdownImage,
  code: renderCodeBlock,
  checkbox: taskBox,
};
marked.use({ extensions: [alignExtension] });
marked.use({ renderer });

// ===== Производительность превью: debounce + правка одного блока =====
// Превью не пересобирается целиком. Текст делится на блоки (абзац, список,
// схема), и после паузы в наборе заменяется только изменившийся блок.
// График, Mermaid и nomnoml в остальных блоках остаются в DOM как есть.
// SVG новых схем ещё и кэшируется: повторная вставка того же кода не считает
// диаграмму заново.

// Задержка до перестройки превью после последнего изменения текста (мс)
const PREVIEW_DEBOUNCE_MS = 200;
// Максимальное число записей в кэше SVG диаграмм (ограничение памяти)
const DIAGRAM_CACHE_LIMIT = 100;

let previewTimer = null;
let lastPreviewContent = null;
// Пока экспорт рисует схемы в другой теме, превью не перестраивается:
// mermaid.initialize один на всё окно.
let previewHold = false;
let previewDirty = false;
// Один проход экспорта сам дорисовывает все схемы, без второй очереди.
let captureDiagrams = false;

// Кэш отрендеренных SVG: сигнатура -> innerHTML контейнера
const diagramSVGCache = new Map();

function getPreviewTheme() {
  return document.documentElement.getAttribute("data-theme") || "dark";
}

// И Mermaid, и nomnoml перекрашиваются под тему, поэтому тема входит в сигнатуру.
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
  if (previewHold) {
    previewDirty = true;
    return;
  }
  if (previewTimer !== null) clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    previewTimer = null;
    updatePreview();
  }, PREVIEW_DEBOUNCE_MS);
}

function releasePreviewHold() {
  previewHold = false;
  if (!previewDirty) return;
  previewDirty = false;
  schedulePreviewUpdate();
}

// Уже показанные блоки: исходник и его обёртка в колонке превью.
let liveBlocks = [];
// Определения ссылок [имя]: url. Если карта изменилась, старые блоки
// держат прежний адрес — тогда колонку собираем заново.
let liveLinksKey = "";

// Обёртка с display:contents сама без рамки — якорь смотрит на первый настоящий элемент.
function blockBox(el) {
  return (el && el.firstElementChild) || el;
}

// Верхний видимый блок и насколько его верх ушёл за кромку панели.
function measureAnchor(els, previewEl) {
  const panelTop = previewEl.getBoundingClientRect().top;
  let index = 0;
  let offset = 0;
  for (let i = 0; i < els.length; i++) {
    const box = blockBox(els[i]);
    if (!box) continue;
    const top = box.getBoundingClientRect().top;
    if (top <= panelTop + 1) {
      index = i;
      offset = top - panelTop;
    } else break;
  }
  return { index, offset };
}

// Держим якорный блок на том же месте, чтобы перерисовка не прыгала к началу.
function pinScroll(previewEl, el, offset) {
  const box = blockBox(el);
  if (!box || !box.isConnected) return;
  const contentTop = box.getBoundingClientRect().top
    - previewEl.getBoundingClientRect().top + previewEl.scrollTop;
  const desired = Math.max(0, contentTop - offset);
  if (Math.abs(desired - previewEl.scrollTop) > 0.5) {
    syncScroll.lock = "editor";
    previewEl.scrollTop = desired;
  }
}

// Общий префикс и суффикс совпадающих блоков. Меняется только середина.
function changedRange(prev, nextRaws) {
  const prevLen = prev.length;
  const nextLen = nextRaws.length;
  let start = 0;
  while (start < prevLen && start < nextLen && prev[start].raw === nextRaws[start]) start++;
  let prevEnd = prevLen;
  let nextEnd = nextLen;
  while (prevEnd > start && nextEnd > start && prev[prevEnd - 1].raw === nextRaws[nextEnd - 1]) {
    prevEnd--;
    nextEnd--;
  }
  return { start, prevEnd, nextEnd };
}

// Блоки документа. Пробелы и определения ссылок сами по себе не рисуются.
// null — лексер покрыл не весь текст, тогда рисуем документ одним куском.
function previewBlockTokens(content) {
  const tokens = marked.lexer(content);
  absorbTableWidths(tokens);
  let covered = "";
  const blocks = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    covered += token.raw || "";
    if (token.type === "space" || token.type === "def") continue;
    if (token.raw) blocks.push(token);
  }
  if (covered !== content) return null;
  return { blocks, links: tokens.links || {} };
}

function renderBlockElement(token, links) {
  const wrap = document.createElement("div");
  wrap.className = "mdv-block";
  const list = [token];
  list.links = links || {};
  let html = processRenderedHtml(marked.parser(list));
  if (token.mdvWidth) {
    html = html.replace(/<table\b([^>]*)>/i, (_, attrs) => withTableWidth(attrs, token.mdvWidth));
  }
  wrap.innerHTML = html;
  return wrap;
}

function destroyCharts(root) {
  const api = window.Chart;
  if (!root || !api) return;
  root.querySelectorAll("canvas").forEach((canvas) => {
    try {
      const chart = api.getChart(canvas);
      if (chart) chart.destroy();
    } catch (e) { }
  });
}

// Отдельный файл библиотеки. Повторный вызов ждёт уже начатую загрузку.
function loadScript(src) {
  const existing = document.querySelector('script[data-mdv-src="' + src + '"]');
  if (existing && existing.dataset.ready === "1") return Promise.resolve();
  if (existing && existing._mdvPromise) return existing._mdvPromise;
  const script = existing || document.createElement("script");
  const ready = new Promise((resolve, reject) => {
    script.onload = () => {
      script.dataset.ready = "1";
      resolve();
    };
    script.onerror = () => reject(new Error(src));
  });
  script._mdvPromise = ready;
  if (!existing) {
    script.src = src;
    script.dataset.mdvSrc = src;
    document.head.appendChild(script);
  }
  return ready;
}

let mermaidThemeApplied = null;

function ensureMermaid() {
  return loadScript("lib/mermaid.min.js").then(() => {
    const name = getPreviewTheme() === "light" ? "light" : "dark";
    if (mermaidThemeApplied !== name && window.mermaid) {
      window.mermaid.initialize(mermaidThemes[name] || mermaidThemes.light);
      mermaidThemeApplied = name;
    }
    return window.mermaid;
  });
}

function ensureChart() {
  if (window.Chart) return Promise.resolve(window.Chart);
  return loadScript("lib/chart.umd.min.js").then(() => {
    applyChartTheme(getPreviewTheme() !== "light");
    return window.Chart;
  });
}

function ensureNomnoml() {
  if (window.nomnoml) return Promise.resolve(window.nomnoml);
  return loadScript("lib/graphre.js").then(() => loadScript("lib/nomnoml.min.js"));
}

// Очередь схем вне экрана: по одной за кадр, чтобы первое открытие не замирало.
const diagramQueue = [];
let diagramPump = 0;

function nearPreview(el) {
  const preview = document.getElementById("preview");
  if (!preview || !el || !el.isConnected) return false;
  const view = preview.getBoundingClientRect();
  const box = el.getBoundingClientRect();
  const margin = 240;
  return box.bottom >= view.top - margin && box.top <= view.bottom + margin;
}

function rememberMermaid(el) {
  const svg = el.innerHTML;
  if (svg && svg.indexOf("<svg") !== -1) {
    svgCachePut(makeDiagramSignature("mermaid", el.dataset.code || "", true), svg);
  }
  scaleDiagramSvg(el);
}

function paintMermaid(nodes) {
  if (!nodes.length) return Promise.resolve();
  return ensureMermaid().then((api) => {
    const fresh = [];
    nodes.forEach((el) => {
      if (!el.isConnected) return;
      const key = makeDiagramSignature("mermaid", el.dataset.code || "", true);
      const cached = svgCacheGet(key);
      if (cached !== undefined) {
        el.innerHTML = cached;
        scaleDiagramSvg(el);
        return;
      }
      if (el.querySelector("svg") && el.dataset.code) {
        el.textContent = decodeURIComponent(el.dataset.code);
      }
      fresh.push(el);
    });
    if (!fresh.length || !api) return;
    return Promise.resolve(api.run({ nodes: fresh })).catch(() => { }).then(() => {
      fresh.forEach((el) => {
        if (el.isConnected) rememberMermaid(el);
      });
    });
  }).catch(() => { });
}

function paintChart(el) {
  return ensureChart().then(() => {
    if (!el.isConnected) return;
    const code = decodeURIComponent(el.dataset.chartCode || "");
    if (!code) return;
    const w = diagramTargetWidth(el);
    el.setAttribute("data-mdv-width", String(w));
    el.style.width = w + "px";
    el.style.maxWidth = "none";
    el.style.height = Math.round(w * 5 / 8) + "px";
    renderChart(code, el.id);
  }).catch(() => { });
}

function paintNomnoml(el) {
  const code = decodeURIComponent(el.dataset.nomnomlCode || "");
  if (!code || !el.isConnected) return Promise.resolve();
  const key = makeDiagramSignature("nomnoml", code, true);
  const cached = svgCacheGet(key);
  if (cached !== undefined) {
    el.innerHTML = cached;
    scaleDiagramSvg(el);
    return Promise.resolve();
  }
  return ensureNomnoml().then(() => {
    if (!el.isConnected || typeof window.renderNomnoml !== "function") return;
    try {
      window.renderNomnoml(el, code);
      if (el.innerHTML.indexOf("<svg") !== -1) {
        svgCachePut(key, el.innerHTML);
        scaleDiagramSvg(el);
      }
    } catch (e) {
      el.innerHTML = `<pre style="color:#ff6b6b;">Parse error: ${e.message}</pre>`;
    }
  }).catch(() => { });
}

function paintOne(el) {
  if (!el || !el.isConnected) return Promise.resolve();
  if (el.classList.contains("mermaid")) return paintMermaid([el]);
  if (el.classList.contains("nomnoml-diagram")) return paintNomnoml(el);
  if ((el.id || "").indexOf("chart-") === 0) return paintChart(el);
  return Promise.resolve();
}

function pumpDiagrams() {
  if (diagramPump || !diagramQueue.length) return;
  const step = () => {
    diagramPump = 0;
    if (!diagramQueue.length) return;
    let index = 0;
    for (let i = 0; i < diagramQueue.length; i++) {
      if (nearPreview(diagramQueue[i])) {
        index = i;
        break;
      }
    }
    const el = diagramQueue.splice(index, 1)[0];
    paintOne(el).then(() => {
      if (diagramQueue.length) diagramPump = requestAnimationFrame(step);
    });
  };
  diagramPump = requestAnimationFrame(step);
}

function enqueueDiagram(el) {
  if (diagramQueue.indexOf(el) === -1) diagramQueue.push(el);
}

window.rerenderMermaidTheme = function () {
  mermaidThemeApplied = null;
  const nodes = Array.from(document.querySelectorAll("#preview .mermaid"));
  for (let i = diagramQueue.length - 1; i >= 0; i--) {
    if (diagramQueue[i].classList && diagramQueue[i].classList.contains("mermaid")) {
      if (nodes.indexOf(diagramQueue[i]) === -1) nodes.push(diagramQueue[i]);
      diagramQueue.splice(i, 1);
    }
  }
  return paintMermaid(nodes);
};

window.noteNomnomlSvg = function (el, code) {
  if (!el || el.innerHTML.indexOf("<svg") === -1) return;
  svgCachePut(makeDiagramSignature("nomnoml", code, true), el.innerHTML);
};

// Схемы на экране рисуются сразу. Остальные — по одной за кадр.
function drawDiagrams(roots) {
  const nodes = [];
  const each = (selector, fn) => {
    for (let i = 0; i < roots.length; i++) roots[i].querySelectorAll(selector).forEach(fn);
  };
  each(".mermaid", (el) => nodes.push(el));
  each("[id^='chart-']", (el) => nodes.push(el));
  each(".nomnoml-diagram", (el) => nodes.push(el));

  const now = [];
  nodes.forEach((el) => {
    if (nearPreview(el)) now.push(el);
    else enqueueDiagram(el);
  });
  pumpDiagrams();
  const mermaids = now.filter((el) => el.classList.contains("mermaid"));
  const rest = now.filter((el) => !el.classList.contains("mermaid"));
  return paintMermaid(mermaids).then(() => Promise.all(rest.map(paintOne)));
}

function finishPreviewSettle(settleId, previewEl, pinEl, pinOffset) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (settleId !== syncScrollSettle.id) return;
    if (pinEl) pinScroll(previewEl, pinEl, pinOffset);
    syncScroll.settling = false;
    requestAnimationFrame(() => {
      if (syncScroll.lock === "editor") syncScroll.lock = null;
    });
  }));
}

// Функция обновления превью
// force=true — пропустить проверку «текст не менялся» и собрать колонку заново
// (нужно после выхода из режима просмотра HTML и при смене размеров медиа)
function updatePreview(force) {
  // В режиме просмотра HTML-файла превью занято iframe — не перерисовываем
  if (window.__htmlMode) return;
  if (previewHold) {
    previewDirty = true;
    return;
  }
  const content = view.state.doc.toString();
  // Текст не менялся с прошлой перестройки — перерисовывать нечего
  if (!force && content === lastPreviewContent) return;
  lastPreviewContent = content;
  const previewEl = document.getElementById("preview");
  if (!previewEl) return;
  setupPreviewClicks(previewEl);

  const parsed = previewBlockTokens(content);
  const tokens = parsed ? parsed.blocks : null;
  const links = parsed ? parsed.links : {};
  const linksKey = JSON.stringify(links);
  const linksChanged = linksKey !== liveLinksKey;
  liveLinksKey = linksKey;
  // Лексер не покрыл текст — один блок на весь документ, правка заменяет его целиком.
  const next = tokens || [{ raw: content, type: "fallback" }];
  const nextRaws = next.map((token) => token.raw);

  const column = previewEl.querySelector(":scope > .mdv-column");
  const canPatch = !force
    && !linksChanged
    && !!tokens
    && column
    && liveBlocks.length > 0
    && liveBlocks.every((b) => b.el.isConnected && b.el.parentNode === column);

  const settleId = ++syncScrollSettle.id;
  syncScroll.settling = true;
  syncScroll.lock = null;

  let pinEl = null;
  let pinOffset = 0;
  let freshRoots = [];

  if (!canPatch) {
    const anchor = measureAnchor(liveBlocks.map((b) => b.el), previewEl);
    liveBlocks.forEach((b) => destroyCharts(b.el));
    destroyCharts(previewEl);
    const newColumn = document.createElement("div");
    newColumn.className = "mdv-column";
    liveBlocks = next.map((token) => {
      const el = tokens ? renderBlockElement(token, links) : renderFallback(content);
      newColumn.appendChild(el);
      return { raw: token.raw, el };
    });
    previewEl.replaceChildren(newColumn);
    freshRoots = [newColumn];
    if (liveBlocks.length) {
      const idx = Math.min(anchor.index, liveBlocks.length - 1);
      pinEl = liveBlocks[idx].el;
      pinOffset = anchor.offset;
    }
  } else {
    const range = changedRange(liveBlocks, nextRaws);
    if (range.start === range.prevEnd && range.start === range.nextEnd) {
      syncScroll.settling = false;
      return;
    }
    const anchor = measureAnchor(liveBlocks.map((b) => b.el), previewEl);
    const anchorSurvives = anchor.index < range.start || anchor.index >= range.prevEnd;
    if (anchorSurvives && liveBlocks[anchor.index]) {
      pinEl = liveBlocks[anchor.index].el;
      pinOffset = anchor.offset;
    }
    const after = range.prevEnd < liveBlocks.length ? liveBlocks[range.prevEnd].el : null;
    for (let i = range.prevEnd - 1; i >= range.start; i--) {
      destroyCharts(liveBlocks[i].el);
      liveBlocks[i].el.remove();
    }
    const created = [];
    for (let i = range.start; i < range.nextEnd; i++) {
      const el = renderBlockElement(next[i], links);
      column.insertBefore(el, after);
      created.push({ raw: next[i].raw, el });
    }
    if (!pinEl && created.length) {
      const repl = anchor.index - range.start;
      pinEl = (created[repl] || created[0]).el;
      pinOffset = anchor.offset;
    }
    liveBlocks = liveBlocks.slice(0, range.start).concat(created, liveBlocks.slice(range.prevEnd));
    freshRoots = created.map((b) => b.el);
  }

  if (pinEl) pinScroll(previewEl, pinEl, pinOffset);
  hydrateLocalImages(freshRoots);
  hydrateRemoteImages(freshRoots);
  if (captureDiagrams) {
    finishPreviewSettle(settleId, previewEl, pinEl, pinOffset);
    return;
  }
  drawDiagrams(freshRoots).then(() => finishPreviewSettle(settleId, previewEl, pinEl, pinOffset));
}

// Запасной путь: весь документ одной обёрткой, без деления на блоки.
function renderFallback(content) {
  const wrap = document.createElement("div");
  wrap.className = "mdv-block";
  wrap.innerHTML = processRenderedHtml(marked.parse(content));
  return wrap;
}

// Настройки размера по умолчанию применяются к уже открытому документу
window.refreshPreviewMedia = function () {
  if (!view) return;
  lastPreviewContent = null;
  updatePreview(true);
};

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
  // Настоящий перенос: курсор, клик и выделение идут по видимым рядам.
  // В документ разрыв не записывается.
  EditorView.lineWrapping,
  // Своя проверка. Иначе WebView2 добавляет в меню свои варианты поверх наших.
  EditorView.contentAttributes.of({ spellcheck: "false" }),
  markdown({ codeLanguages: editorCodeLanguage }),
  oneDarkTheme,
  codeHighlighting,
  builtinHighlight,
  keymap.of([...customKeyBindings, ...defaultKeymap, ...historyKeymap]),
  searchHighlightExt,
  readOnlyCompartment.of(EditorState.readOnly.of(false)),
  spellCompartment.of(spellcheckOff),
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
bindSpellcheck(view);

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
  if (window.reapplySpellcheck) window.reapplySpellcheck();
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
// Несколько событий прокрутки за кадр считаем один раз.
let syncJob = null;
let syncFrame = 0;

function runSyncJob() {
  syncFrame = 0;
  const job = syncJob;
  syncJob = null;
  if (!job || !syncScroll.enabled || syncScroll.settling) return;
  const sourceEl = job.sourceEl;
  const sourceName = job.sourceName;
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
  requestAnimationFrame(() => {
    if (syncScroll.lock === sourceName) syncScroll.lock = null;
  });
}

function attachSyncScroll(sourceEl, sourceName) {
  if (!sourceEl) return;
  sourceEl.addEventListener("scroll", function () {
    if (!syncScroll.enabled) return;
    // Заморозка на время перестройки превью (updatePreview): клампы и
    // служебные прокрутки не должны дёргать вторую панель
    if (syncScroll.settling) return;
    syncJob = { sourceEl, sourceName };
    if (syncFrame) return;
    syncFrame = requestAnimationFrame(runSyncJob);
  }, { passive: true });
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
window.pasteText = () => pasteClipboard(view);

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
// выделения и на каждую ячейку таблицы: Markdown не продолжает выделение
// через пустую строку, заголовок, пункт списка или символ |, поэтому
// обёртка всего блока целиком не работает.
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
// CommonMark: черта — это строка из трёх и более одинаковых -, * или _.
// Вставка из панели всегда пишет ---. * и _ остаются, чтобы чужой Markdown
// не превращался в текст: *** на отдельной строке — черта, а не жирный курсив.
const HR_RE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;
const TABLE_ROW_RE = /^\s*\|/;
const TABLE_WIDTH_RE = /^\s*\{width=\d+(?:px)?\}\s*$/i;
const TABLE_SEP_CELL_RE = /^\s*:?-+:?\s*$/;
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

// Ячейки строки таблицы: raw — всё между |, from/to — текст без крайних пробелов.
// Экранированный \| остаётся внутри ячейки.
function tableRawCells(text) {
  const cells = [];
  let i = 0;
  while (i < text.length && /\s/.test(text[i])) i++;
  if (text[i] !== '|') return cells;
  while (text[i] === '|') {
    const rawFrom = i + 1;
    let j = rawFrom;
    while (j < text.length) {
      if (text[j] === '\\' && text[j + 1] === '|') { j += 2; continue; }
      if (text[j] === '|') break;
      j++;
    }
    // Закрывающая | в конце строки — не начало ещё одной ячейки
    if (j >= text.length && rawFrom === j) break;
    let from = rawFrom, to = j;
    while (from < to && /\s/.test(text[from])) from++;
    while (to > from && /\s/.test(text[to - 1])) to--;
    cells.push({ rawFrom, rawTo: j, from, to });
    if (text[j] !== '|') break;
    i = j;
  }
  return cells;
}

function isTableSeparator(text) {
  if (!TABLE_ROW_RE.test(text)) return false;
  const cells = tableRawCells(text);
  return cells.length > 0 && cells.every(c => TABLE_SEP_CELL_RE.test(text.slice(c.rawFrom, c.rawTo)));
}

// false — строку таблицы форматировать нельзя (разделитель или курсор на |).
// null — это не строка таблицы. Иначе ячейка под курсором.
function tableCellAtCursor(line, head) {
  if (!TABLE_ROW_RE.test(line.text)) return null;
  if (isTableSeparator(line.text)) return false;
  const rel = head - line.from;
  const hit = tableRawCells(line.text).find(c =>
    (rel >= c.rawFrom && rel < c.rawTo) || (rel === c.rawTo && c.rawTo === line.text.length));
  return hit || false;
}

function cellScope(line, cell) {
  return {
    text: line.text.slice(cell.from, cell.to),
    from: line.from + cell.from,
    to: line.from + cell.to,
  };
}

// Участки строки, которые можно обернуть маркерами. В таблице — по ячейке:
// выделение на всю таблицу не должно захватывать | и строку-разделитель.
function segmentsInLine(line, selFrom, selTo, before, after) {
  if (TABLE_ROW_RE.test(line.text)) {
    if (isTableSeparator(line.text)) return [];
    const segs = [];
    for (const cell of tableRawCells(line.text)) {
      if (cell.from >= cell.to) continue;
      const scope = cellScope(line, cell);
      const from = Math.max(selFrom, scope.from);
      const to = Math.min(selTo, scope.to);
      if (from >= to) continue;
      const seg = inlineSegment(scope, from, to, before, after, 0);
      if (seg && seg.selected.length) segs.push(seg);
    }
    return segs;
  }
  const seg = inlineSegment(line, selFrom, selTo, before, after);
  return seg && seg.selected.length ? [seg] : [];
}

// Участок строки под инлайн-маркеры: без блочного префикса и крайних
// пробелов. region — участок, который будет перестроен: выделение плюс
// все обёртки, пересекающие его или вплотную к нему примыкающие.
// fixedPrefix задаётся для ячейки таблицы: у неё нет маркера списка или заголовка.
function inlineSegment(line, selFrom, selTo, before, after, fixedPrefix) {
  const text = line.text;
  if (fixedPrefix == null && HR_RE.test(text)) return null;
  const prefix = fixedPrefix != null ? fixedPrefix : INLINE_PREFIX_RE.exec(text)[0].length;
  let from = Math.max(selFrom - line.from, prefix);
  let to = Math.min(selTo, line.to) - line.from;
  while (from < to && /\s/.test(text[from])) from++;
  while (to > from && /\s/.test(text[to - 1])) to--;
  if (from >= to) return null;
  // Запасной стоп: обёртка через | ломает строку таблицы. Обычный путь
  // режет строку на ячейки в segmentsInLine и сюда | уже не приносит.
  if (fixedPrefix == null && TABLE_ROW_RE.test(text) && text.slice(from, to).includes('|')) return null;
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
    const cell = tableCellAtCursor(line, sel.head);
    if (cell === false) return;
    let scope = line;
    let prefix;
    let wordFrom = word && word.from;
    let wordTo = word && word.to;
    if (cell && cell.from < cell.to) {
      scope = cellScope(line, cell);
      prefix = 0;
      if (word) {
        wordFrom = Math.max(word.from, scope.from);
        wordTo = Math.min(word.to, scope.to);
      }
    }
    const seg = word && wordFrom < wordTo && inlineSegment(scope, wordFrom, wordTo, before, after, prefix);
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
      segments.push(...segmentsInLine(line, sel.from, sel.to, before, after));
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

// Задача — пункт списка с «[ ]». Повтор снимает только скобки, маркер списка остаётся.
window.toggleTaskList = function () {
  toggleLineMarkup(text => {
    const m = LIST_MARK_RE.exec(text);
    const lead = m[1].length;
    const mark = m[2] || '';
    const task = /^\[([ xX])\]\s*/.exec(text.slice(lead + mark.length));
    if (task) return { at: lead + mark.length, len: task[0].length, has: true, existing: task[0], mark };
    return { at: lead, len: mark.length, has: false, mark };
  }, (i, p) => {
    if (p.has) return p.existing;
    if (/^\d/.test(p.mark)) return p.mark + '[ ] ';
    if (p.mark) return p.mark.trimEnd() + ' [ ] ';
    return '- [ ] ';
  });
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

// Блок :::center / :::right, внутри которого стоит строка. Незакрытый тянется до конца.
function alignBlockAt(doc, lineNo) {
  const code = codeBlocks(doc);
  const stack = [];
  const found = [];
  for (let n = 1; n <= doc.lines; n++) {
    if (inCodeBlock(code, n)) continue;
    const mark = alignMarker(doc.line(n).text);
    if (!mark) continue;
    if (mark.kind === "open") stack.push({ align: mark.align, open: n, close: null });
    else if (stack.length) {
      const top = stack.pop();
      top.close = n;
      found.push(top);
    }
  }
  found.push(...stack);
  let block = null;
  for (const item of found) {
    const end = item.close == null ? doc.lines : item.close;
    if (lineNo < item.open || lineNo > end) continue;
    if (!block || item.open >= block.open) block = item;
  }
  return block;
}

function removeAlignBlock(doc, block) {
  const openLine = doc.line(block.open);
  if (block.close == null) {
    const to = openLine.number < doc.lines ? openLine.to + 1 : openLine.to;
    return [{ from: openLine.from, to, insert: "" }];
  }
  const closeLine = doc.line(block.close);
  if (closeLine.number === openLine.number + 1 && closeLine.number === doc.lines) {
    return [{ from: openLine.from, to: closeLine.to, insert: "" }];
  }
  const closeFrom = closeLine.number === doc.lines ? closeLine.from - 1 : closeLine.from;
  const closeTo = closeLine.number === doc.lines ? closeLine.to : closeLine.to + 1;
  return [
    { from: openLine.from, to: openLine.to + 1, insert: "" },
    { from: closeFrom, to: closeTo, insert: "" },
  ];
}

function linesRange(doc, from, to) {
  const lines = [];
  for (let n = from; n <= to; n++) lines.push(doc.line(n));
  return lines;
}

// Таблица целиком. Строка {width=…} стоит через пустую строку, иначе
// Markdown затягивает её в последнюю ячейку.
function tableBounds(doc, lineNo) {
  const last = doc.lines;
  const isRow = (n) => n >= 1 && n <= last && TABLE_ROW_RE.test(doc.line(n).text);
  const isWidth = (n) => n >= 1 && n <= last && TABLE_WIDTH_RE.test(doc.line(n).text);
  const isBlank = (n) => n >= 1 && n <= last && isBlankLine(doc.line(n).text);
  let row = 0;
  if (isRow(lineNo)) row = lineNo;
  else if (isWidth(lineNo)) {
    let n = lineNo - 1;
    if (isBlank(n)) n--;
    if (isRow(n)) row = n;
  } else if (isBlank(lineNo) && isWidth(lineNo + 1) && isRow(lineNo - 1)) {
    row = lineNo - 1;
  }
  if (!row) return null;
  let from = row;
  let to = row;
  while (isRow(from - 1)) from--;
  while (isRow(to + 1)) to++;
  let widthAt = to + 1;
  if (isBlank(widthAt) && isWidth(widthAt + 1)) widthAt++;
  if (isWidth(widthAt)) to = widthAt;
  return { from, to };
}

// Код, схема и таблица, которых коснулось выделение, берутся целиком:
// иначе метка ::: оказалась бы внутри ``` и превью её не увидело бы.
function expandAlignRange(doc, from, to) {
  const code = codeBlocks(doc);
  let grew = true;
  while (grew) {
    grew = false;
    for (const block of code) {
      if (block.close < from || block.open > to) continue;
      if (block.open < from) { from = block.open; grew = true; }
      if (block.close > to) { to = block.close; grew = true; }
    }
    for (let n = from; n <= to; n++) {
      if (code.some((block) => n >= block.open && n <= block.close)) continue;
      const bounds = tableBounds(doc, n);
      if (!bounds) continue;
      if (bounds.from < from) { from = bounds.from; grew = true; }
      if (bounds.to > to) { to = bounds.to; grew = true; }
    }
  }
  return { from, to };
}

// Пустое выделение: абзац, либо весь блок кода/схемы/таблицы под курсором.
function alignTargetLines(state) {
  const doc = state.doc;
  const selected = selectedLines(state);
  if (!state.selection.main.empty) {
    const range = expandAlignRange(doc, selected[0].number, selected[selected.length - 1].number);
    return linesRange(doc, range.from, range.to);
  }
  const code = codeBlocks(doc);
  const current = selected[0];
  const fence = code.find((block) => current.number >= block.open && current.number <= block.close);
  if (fence) return linesRange(doc, fence.open, fence.close);
  const table = tableBounds(doc, current.number);
  if (table) return linesRange(doc, table.from, table.to);
  const joins = (line) => !inCodeBlock(code, line.number)
    && !alignMarker(line.text)
    && !isBlankLine(line.text)
    && !FENCE_RE.test(line.text)
    && !TABLE_ROW_RE.test(line.text)
    && !TABLE_WIDTH_RE.test(line.text);
  if (!joins(current)) return selected;
  let from = current.number;
  let to = current.number;
  while (from > 1 && joins(doc.line(from - 1))) from--;
  while (to < doc.lines && joins(doc.line(to + 1))) to++;
  return linesRange(doc, from, to);
}

window.toggleAlign = function (align) {
  if (align !== "center" && align !== "right") return;
  if (view.state.readOnly) return;
  view.focus();
  const state = view.state;
  const doc = state.doc;
  const headLine = doc.lineAt(state.selection.main.head).number;
  const block = alignBlockAt(doc, headLine);
  if (block) {
    if (block.align === align) applyFormatting(removeAlignBlock(doc, block));
    else {
      const openLine = doc.line(block.open);
      const text = openLine.text.replace(/(:::[ \t]*)(center|right)/, "$1" + align);
      applyFormatting({ from: openLine.from, to: openLine.to, insert: text });
    }
    return;
  }
  const lines = alignTargetLines(state);
  if (!lines.length) return;
  const first = lines[0];
  const last = lines[lines.length - 1];
  if (lines.length === 1 && isBlankLine(first.text)) {
    const open = ":::" + align + "\n";
    applyFormatting(
      { from: first.from, to: first.to, insert: open + "\n:::" },
      { anchor: first.from + open.length }
    );
    return;
  }
  applyFormatting([
    { from: first.from, insert: ":::" + align + "\n" },
    { from: last.to, insert: "\n:::" },
  ]);
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

window.imageInsertContext = function () {
  return { text: inlineSelectionText(view.state).text || "" };
};

function imageDest(text) {
  return String(text || "").replace(/\\/g, "/").replace(/>/g, "");
}

function imageCaption(text) {
  return String(text || "").replace(/[\[\]]/g, "");
}

function selectionLooksLikeUrl(text) {
  return /^https?:\/\/\S+$/i.test(text);
}

function selectionLooksLikeFile(text) {
  if (/^[A-Za-z]:[\\/]/.test(text)) return true;
  if (text.startsWith("\\\\") || text.startsWith("//")) return true;
  if (/^file:/i.test(text)) return true;
  const imageName = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(text);
  if (imageName && /[\\/]/.test(text)) return true;
  return imageName && !/\s/.test(text);
}

// Выделенный текст сразу оборачивается в синтаксис картинки.
// Пустое выделение сюда не попадает: для него открывается диалог.
window.wrapSelectionAsImage = function () {
  view.focus();
  const { from, to, text } = inlineSelectionText(view.state);
  if (!text) return false;
  const width = (window.getMediaSizeDefault && window.getMediaSizeDefault("image")) || 500;
  let insert;
  let caret;
  if (selectionLooksLikeUrl(text) || selectionLooksLikeFile(text)) {
    insert = "![](<" + imageDest(text) + ">){width=" + width + "px}";
    caret = 2;
  } else {
    const caption = imageCaption(text);
    insert = "![" + caption + "](<>){width=" + width + "px}";
    caret = 2 + caption.length + 3;
  }
  applyFormatting({ from, to, insert }, { anchor: from + caret, head: from + caret });
  return true;
};

window.replaceSelection = function (text) {
  const sel = view.state.selection.main;
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: text },
    selection: { anchor: sel.from + text.length },
    scrollIntoView: true,
    userEvent: "input.formatting",
  });
  view.focus();
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
exportRenderer.image = renderMarkdownImage;
exportRenderer.code = renderCodeBlock;
exportRenderer.checkbox = taskBox;

function exportMarkup() {
  return resolveDefaultMediaSizes(
    processRenderedHtml(marked.parse(view.state.doc.toString(), { renderer: exportRenderer }))
  );
}

// Дорисовать все схемы превью, включая те, что ещё стоят в очереди за экраном.
function paintAllPreviewDiagrams() {
  const preview = document.getElementById("preview");
  if (!preview) return Promise.resolve();
  const mermaids = [];
  const nomnomls = [];
  preview.querySelectorAll(".mermaid").forEach((el) => mermaids.push(el));
  preview.querySelectorAll(".nomnoml-diagram").forEach((el) => nomnomls.push(el));
  for (let i = diagramQueue.length - 1; i >= 0; i--) {
    const el = diagramQueue[i];
    if (!el.classList) continue;
    if (el.classList.contains("mermaid") || el.classList.contains("nomnoml-diagram")) {
      diagramQueue.splice(i, 1);
    }
  }
  return paintMermaid(mermaids).then(() => Promise.all(nomnomls.map(paintNomnoml)));
}

// После перестройки превью новые графики без canvas дорисовать самим.
function paintUnreadyCharts() {
  const preview = document.getElementById("preview");
  if (!preview) return Promise.resolve();
  const charts = [];
  preview.querySelectorAll("[id^='chart-']").forEach((el) => {
    if (!el.querySelector("canvas") && !el.querySelector("p")) charts.push(el);
  });
  for (let i = diagramQueue.length - 1; i >= 0; i--) {
    const el = diagramQueue[i];
    if (charts.indexOf(el) !== -1) diagramQueue.splice(i, 1);
  }
  return Promise.all(charts.map(paintChart));
}

function copyPaintedDiagrams(host) {
  const preview = document.getElementById("preview");
  if (!preview) return;
  const liveMermaid = preview.querySelectorAll(".mermaid");
  const liveNomnoml = preview.querySelectorAll(".nomnoml-diagram");
  host.querySelectorAll(".mermaid").forEach((el, i) => {
    if (liveMermaid[i]) el.replaceWith(liveMermaid[i].cloneNode(true));
  });
  host.querySelectorAll(".nomnoml-diagram").forEach((el, i) => {
    if (liveNomnoml[i]) el.replaceWith(liveNomnoml[i].cloneNode(true));
  });
}

function nomnomlStyled(code, theme) {
  const dark = theme !== "light";
  const stroke = dark ? "#d4d4d4" : "#333333";
  const line = dark ? "#aaaaaa" : "#555555";
  return "#fill: transparent\n#stroke: " + stroke + "\n#lineColor: " + line + "\n" + code;
}

function paintExportNomnoml(el, theme) {
  const code = decodeURIComponent(el.getAttribute("data-nomnoml-code") || "");
  if (!code) return Promise.resolve();
  return ensureNomnoml().then(() => {
    if (!el.isConnected || !window.nomnoml) return;
    try {
      el.innerHTML = window.nomnoml.renderSvg(nomnomlStyled(code, theme), document);
      if (el.innerHTML.indexOf("<svg") !== -1) scaleDiagramSvg(el);
    } catch (e) {
      el.innerHTML = `<pre style="color:#ff6b6b;">Parse error: ${e.message}</pre>`;
    }
  });
}

function restoreMermaidTheme() {
  if (!window.mermaid) return;
  const editor = getPreviewTheme() === "light" ? "light" : "dark";
  window.mermaid.initialize(mermaidThemes[editor] || mermaidThemes.light);
  mermaidThemeApplied = editor;
}

// Схемы для файла в теме, отличной от редактора. Превью в это время не трогаем.
function paintExportMermaid(nodes, theme) {
  if (!nodes.length) return Promise.resolve();
  nodes.forEach((el, i) => {
    el.id = "mdv-export-mermaid-" + i;
  });
  previewHold = true;
  if (previewTimer !== null) {
    clearTimeout(previewTimer);
    previewTimer = null;
    previewDirty = true;
  }
  return loadScript("lib/mermaid.min.js").then(() => {
    window.mermaid.initialize(mermaidThemes[theme] || mermaidThemes.light);
    mermaidThemeApplied = theme;
    return Promise.resolve(window.mermaid.run({ nodes })).catch(() => { });
  }).then(() => {
    nodes.forEach((el) => {
      if (el.querySelector("svg")) scaleDiagramSvg(el);
    });
  }).finally(() => {
    restoreMermaidTheme();
    releasePreviewHold();
  });
}

function dropDiagramSource(host) {
  host.querySelectorAll(".mermaid, .nomnoml-diagram").forEach((el) => {
    if (el.querySelector("svg")) {
      el.removeAttribute("data-code");
      el.removeAttribute("data-nomnoml-code");
    }
  });
}

// Картинки вне блоков кода. Фрагмент — как в тексте, вместе с {width}, если он есть.
const IMAGE_RE = /!\[([^\]]*)\]\((<[^>\n]+>|[^)\s]+)(?:\s+"[^"]*")?\)(\{width=\d+(?:px)?\})?/g;

function maskInlineCode(line) {
  return line.replace(/`+[^`]*`+/g, (match) => " ".repeat(match.length));
}

function findDocumentImages(text) {
  const lines = String(text || "").split("\n");
  const images = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^[ ]{0,3}(`{3,}|~{3,})/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const masked = maskInlineCode(line);
    IMAGE_RE.lastIndex = 0;
    let match;
    while ((match = IMAGE_RE.exec(masked))) {
      const destRaw = match[2];
      const dest = destRaw.startsWith("<") ? destRaw.slice(1, -1) : destRaw;
      images.push({
        line: i + 1,
        snippet: line.slice(match.index, match.index + match[0].length),
        dest: dest,
      });
    }
  }
  return images;
}

function imageFileName(href) {
  const clean = String(href || "").split(/[?#]/)[0];
  const parts = clean.split(/[/\\]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

window.exportImageInfo = function () {
  const images = findDocumentImages(view.state.doc.toString());
  let local = false;
  for (let i = 0; i < images.length; i++) {
    if (!isRemoteHref(images[i].dest)) local = true;
  }
  return { any: images.length > 0, local: local };
};

function imageErrorMessage(image) {
  return 'Произошла ошибка. Проверьте ссылку на изображение "' + image.snippet + '" в строке ' + image.line + '.';
}

function embedDocumentImages() {
  const images = findDocumentImages(view.state.doc.toString());
  const map = {};
  let chain = Promise.resolve(null);
  images.forEach((image) => {
    chain = chain.then((failed) => {
      if (failed) return failed;
      if (!image.dest || typeof window.callApi !== "function") {
        return imageErrorMessage(image);
      }
      return window.callApi("embed_image", image.dest).then((result) => {
        if (!result || !result.ok || !result.uri) return imageErrorMessage(image);
        map[image.dest] = result.uri;
        return null;
      }, () => imageErrorMessage(image));
    });
  });
  return chain.then((failed) => failed ? { error: true, message: failed } : { map: map });
}

function rewriteExportImages(host, embed, uriMap) {
  host.querySelectorAll("img").forEach((img) => {
    const encoded = img.getAttribute("data-mdv-file");
    const remote = img.getAttribute("data-mdv-remote");
    const href = encoded
      ? decodeURIComponent(encoded)
      : remote
        ? decodeURIComponent(remote)
        : (img.getAttribute("src") || "");
    if (embed) {
      const uri = uriMap && uriMap[href];
      if (uri) img.setAttribute("src", uri);
    } else if (encoded) {
      const name = imageFileName(href);
      if (name) img.setAttribute("src", name);
    } else if (remote) {
      const direct = (uriMap && uriMap[href]) || remoteImageCache.get(href);
      if (direct && !isVideoHref(direct)) img.setAttribute("src", direct);
      else if (!isVideoHref(href)) img.setAttribute("src", href);
    }
    img.removeAttribute("data-mdv-file");
    img.removeAttribute("data-mdv-remote");
    img.removeAttribute("data-mdv-resolve");
  });
}

// path -> { mtime, uri }. Пока файл на диске не изменился, байты повторно не читаем.
const localImageCache = new Map();

function hydrateLocalImages(roots) {
  if (!roots || typeof window.callApi !== "function") return;
  const imgs = [];
  roots.forEach((root) => {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll("img[data-mdv-file]").forEach((img) => imgs.push(img));
  });
  imgs.forEach((img) => {
    const href = decodeURIComponent(img.getAttribute("data-mdv-file") || "");
    if (!href) return;
    const known = localImageCache.get(href);
    if (known && known.uri) img.src = known.uri;
    window.callApi("preview_image", href, known ? known.mtime : "").then((result) => {
      if (!result || !result.ok || !img.isConnected) return;
      if (result.unchanged && known && known.uri) {
        img.src = known.uri;
        return;
      }
      if (!result.uri) return;
      localImageCache.set(href, { mtime: result.mtime || "", uri: result.uri });
      img.src = result.uri;
    }, () => {});
  });
}

function hydrateRemoteImages(roots) {
  if (!roots || typeof window.callApi !== "function") return;
  const imgs = [];
  roots.forEach((root) => {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll("img[data-mdv-resolve]").forEach((img) => imgs.push(img));
  });
  imgs.forEach((img) => {
    const href = decodeURIComponent(img.getAttribute("data-mdv-remote") || "");
    if (!href) return;
    const known = remoteImageCache.get(href);
    if (known) {
      img.src = known;
      img.removeAttribute("data-mdv-resolve");
      return;
    }
    window.callApi("resolve_image", href).then((result) => {
      if (!img.isConnected) return;
      img.removeAttribute("data-mdv-resolve");
      if (!result || !result.ok || !result.url || isVideoHref(result.url)) {
        if (!isVideoHref(href)) img.src = href;
        return;
      }
      remoteImageCache.set(href, result.url);
      img.src = result.url;
    }, () => {
      if (img.isConnected && !isVideoHref(href)) img.src = href;
    });
  });
}

function resolveLooseRemoteImages() {
  const images = findDocumentImages(view.state.doc.toString()).filter((image) =>
    isRemoteHref(image.dest) && remoteImageNeedsResolve(image.dest)
  );
  const map = {};
  let chain = Promise.resolve();
  images.forEach((image) => {
    chain = chain.then(() => {
      const known = remoteImageCache.get(image.dest);
      if (known) {
        map[image.dest] = known;
        return null;
      }
      if (typeof window.callApi !== "function") return null;
      return window.callApi("resolve_image", image.dest).then((result) => {
        if (result && result.ok && result.url) {
          remoteImageCache.set(image.dest, result.url);
          map[image.dest] = result.url;
        }
      }, () => {});
    });
  });
  return chain.then(() => ({ map: map }));
}

function waitForPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

// theme: 'dark' | 'light' — уже выбранная тема файла, не «current».
// embed: встроить картинки. Иначе у локального файла в HTML остаётся только имя.
window.prepareExportBody = function (theme, embed) {
  if (typeof window.showExportBusy === "function") window.showExportBusy();
  return waitForPaint().then(() => {
    const load = embed ? embedDocumentImages() : resolveLooseRemoteImages();
    return load.then((packed) => {
      if (packed && packed.error) return packed;
      return paintExportBody(theme, !!embed, packed && packed.map);
    });
  });
};

function paintExportBody(theme, embed, uriMap) {
  const name = theme === "light" ? "light" : "dark";
  const host = document.createElement("div");
  host.setAttribute("data-mdv-export-stage", "1");
  // За экраном, но не display:none и не visibility:hidden: иначе Mermaid
  // снимает нулевой размер. fixed не раздвигает прокрутку окна.
  host.style.cssText = "position:fixed;left:0;top:0;width:2400px;transform:translateX(-12000px);pointer-events:none;";
  host.innerHTML = exportMarkup();
  document.body.appendChild(host);
  const same = getPreviewTheme() === name;
  const job = same
    ? Promise.resolve().then(() => {
      if (previewTimer !== null) {
        clearTimeout(previewTimer);
        previewTimer = null;
      }
      const stale = view.state.doc.toString() !== lastPreviewContent;
      if (stale) {
        captureDiagrams = true;
        try {
          updatePreview();
        } finally {
          captureDiagrams = false;
        }
      }
      return paintAllPreviewDiagrams().then(() => paintUnreadyCharts());
    }).then(() => copyPaintedDiagrams(host))
    : paintExportMermaid(Array.from(host.querySelectorAll(".mermaid")), name).then(() =>
      Promise.all(Array.from(host.querySelectorAll(".nomnoml-diagram")).map((el) => paintExportNomnoml(el, name)))
    );
  return job.then(() => {
    dropDiagramSource(host);
    rewriteExportImages(host, embed, uriMap);
    const body = host.innerHTML;
    host.remove();
    return body;
  }, (err) => {
    host.remove();
    return Promise.reject(err);
  });
}
