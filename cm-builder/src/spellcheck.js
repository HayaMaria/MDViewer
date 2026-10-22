// Орфография в редакторе: nspell и словари Hunspell (русский и английский).
// Словари лежат отдельно (assets/dicts) и читаются, только когда проверка включена.
import { EditorView, Decoration, ViewPlugin, keymap } from "@codemirror/view";
import { Compartment, RangeSetBuilder, StateEffect } from "@codemirror/state";
import { syntaxTree, syntaxTreeAvailable } from "@codemirror/language";
import nspell from "nspell";

const CHECK_DELAY_MS = 300;
// Правка короче этого перечитывается сразу, не дожидаясь таймера.
const IMMEDIATE_CHECK_LIMIT = 4000;
const SUGGEST_LIMIT = 6;
// Ниже этого сходства вариант — чужое короткое слово из словаря, а не исправление.
const SUGGEST_MIN_RATIO = 0.7;
// Соседи хуже лучшего варианта больше чем на это в меню не попадают.
const SUGGEST_WINDOW = 3;
// Частые замены: гласные безударные и звонкая/глухая «з»/«с».
const RU_SWAP = { "а": "о", "о": "а", "е": "и", "и": "е", "з": "с", "с": "з" };
const RU_VOWEL_SWAP = { "а": "о", "о": "а", "е": "и", "и": "е" };

// Узлы, внутри которых обычного текста нет: код, адреса, разметка HTML.
const SKIP_NODES = new Set([
  "FencedCode",
  "CodeBlock",
  "InlineCode",
  "URL",
  "Autolink",
  "HTMLBlock",
  "HTMLTag",
  "Comment",
  // &nbsp; &mdash; &#160; и остальные сущности — не слова.
  "Entity",
]);

const WORD_RE = /[\p{Script=Cyrillic}\p{Script=Latin}]+(?:['’-][\p{Script=Cyrillic}\p{Script=Latin}]+)*/gu;
const CYRILLIC_RE = /\p{Script=Cyrillic}/u;
const LATIN_RE = /\p{Script=Latin}/u;

const spellMark = Decoration.mark({ class: "cm-spell-error" });
const spellResult = StateEffect.define();

export const spellCompartment = new Compartment();
export const spellcheckOff = [];

let ruSpell = null;
let enSpell = null;
let userWords = new Set();
let sessionSkip = new Set();
const wordCache = new Map();
let enabled = false;
let requestToken = 0;
let editorView = null;
let menu = null;
let menuTimer = 0;

function fold(word) {
  return word.toLocaleLowerCase("ru-RU");
}

function checkersReady() {
  return !!(ruSpell && enSpell);
}

function yieldFrame() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function loadDict(lang) {
  return new Promise((resolve, reject) => {
    const ready = window.__mdvSpellDict && window.__mdvSpellDict[lang];
    if (ready) {
      resolve(ready);
      return;
    }
    const script = document.createElement("script");
    script.src = new URL(`dicts/${lang}.js`, window.location.href).href;
    script.onload = () => {
      const data = window.__mdvSpellDict && window.__mdvSpellDict[lang];
      if (data) resolve(data);
      else reject(new Error(lang));
    };
    script.onerror = () => reject(new Error(lang));
    document.head.appendChild(script);
  });
}

function releaseDict(lang) {
  if (window.__mdvSpellDict) delete window.__mdvSpellDict[lang];
}

function dropCheckers() {
  ruSpell = null;
  enSpell = null;
  wordCache.clear();
  releaseDict("ru");
  releaseDict("en");
}

async function loadCheckers(token) {
  const [ruData, enData] = await Promise.all([loadDict("ru"), loadDict("en")]);
  if (token !== requestToken) return false;
  await yieldFrame();
  if (token !== requestToken) return false;
  ruSpell = nspell(ruData.aff, russianDictionary(ruData.dic));
  releaseDict("ru");
  await yieldFrame();
  if (token !== requestToken) return false;
  enSpell = nspell(enData.aff, enData.dic);
  releaseDict("en");
  return checkersReady();
}

// В словаре LibreOffice затесался обрубок «упак». Такого слова нет.
function russianDictionary(dic) {
  return String(dic).split(/\r?\n/).filter((line) => line.split("/")[0] !== "упак").join("\n");
}

function checkersFor(word) {
  const list = [];
  if (CYRILLIC_RE.test(word) && ruSpell) list.push(ruSpell);
  if (LATIN_RE.test(word) && enSpell) list.push(enSpell);
  return list;
}

function dictionaryCorrect(word) {
  if (wordCache.has(word)) return wordCache.get(word);
  const checkers = checkersFor(word);
  if (!checkers.length) return true;
  const ok = checkers.some((spell) => spell.correct(word));
  wordCache.set(word, ok);
  return ok;
}

function isCorrect(word) {
  const folded = fold(word);
  if (userWords.has(folded) || sessionSkip.has(folded)) return true;
  if (dictionaryCorrect(word)) return true;
  const parts = word.split("-");
  if (parts.length < 2 || parts.some((part) => !part)) return false;
  return parts.every((part) => part.length < 2 || isCorrect(part));
}

function uniqueSuggestions(list) {
  const out = [];
  const seen = new Set();
  for (const item of list) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
    if (out.length >= SUGGEST_LIMIT) break;
  }
  return out;
}

function commonRatio(left, right) {
  const a = left.toLocaleLowerCase("ru-RU");
  const b = right.toLocaleLowerCase("ru-RU");
  const rows = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      rows[i][j] = a.charCodeAt(i - 1) === b.charCodeAt(j - 1)
        ? rows[i - 1][j - 1] + 1
        : Math.max(rows[i - 1][j], rows[i][j - 1]);
    }
  }
  return rows[a.length][b.length] / Math.max(a.length, b.length);
}

// Перестановка соседних букв считается одной правкой: «teh» → «the».
function editDistance(a, b) {
  const rows = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = 0; i <= a.length; i++) rows[i][0] = i;
  for (let j = 0; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      let value = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (
        i > 1 && j > 1
        && a.charCodeAt(i - 1) === b.charCodeAt(j - 2)
        && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)
      ) {
        value = Math.min(value, rows[i - 2][j - 2] + 1);
      }
      rows[i][j] = value;
    }
  }
  return rows[a.length][b.length];
}

function sameLetters(a, b) {
  if (a.length !== b.length) return false;
  return a.split("").sort().join("") === b.split("").sort().join("");
}

function commonPrefixLength(a, b) {
  const size = Math.min(a.length, b.length);
  let i = 0;
  while (i < size && a.charCodeAt(i) === b.charCodeAt(i)) i += 1;
  return i;
}

// «приветт» и «привет»: лишняя буква в удвоении.
function collapsesDouble(longer, shorter) {
  if (longer.length !== shorter.length + 1) return false;
  for (let i = 0; i < longer.length - 1; i++) {
    if (longer.charCodeAt(i) !== longer.charCodeAt(i + 1)) continue;
    if (longer.slice(0, i) + longer.slice(i + 1) === shorter) return true;
  }
  return false;
}

function isAllCaps(word) {
  const lower = fold(word);
  return word === word.toLocaleUpperCase("ru-RU") && word !== lower;
}

function maxSuggestDistance(length) {
  return length <= 4 ? 1 : 2;
}

// Одна замена из частых пар: «карова» → «корова», «зделать» → «сделать».
function swapBonus(a, b) {
  if (a.length !== b.length) return 0;
  let diff = -1;
  for (let i = 0; i < a.length; i++) {
    if (a.charCodeAt(i) === b.charCodeAt(i)) continue;
    if (diff !== -1) return 0;
    diff = i;
  }
  if (diff < 0) return 0;
  return RU_SWAP[a.charAt(diff)] === b.charAt(diff) ? 4 : 0;
}

// null — вариант в меню не нужен. Меньше число — выше в списке.
function suggestionScore(word, text, trusted) {
  const a = fold(word);
  const b = fold(text);
  if (!b || b.length < 2 || b === a) return null;
  if (/\d/.test(text) || /\s/.test(text)) return null;
  if (isAllCaps(text) && !isAllCaps(word)) return null;
  const dist = editDistance(a, b);
  if (dist === 0 || dist > maxSuggestDistance(a.length)) return null;
  const transposed = dist === 1 && sameLetters(a, b) && a.charAt(0) === b.charAt(0);
  const ratio = commonRatio(a, b);
  if (!trusted) {
    if (ratio < SUGGEST_MIN_RATIO && !transposed) return null;
    if (dist >= 2 && ratio < 0.8) return null;
  }
  let score = (trusted ? 6 : dist * 10) + Math.abs(a.length - b.length);
  const prefix = commonPrefixLength(a, b);
  if (transposed) score -= 3;
  else score -= Math.min(prefix, 4);
  if (prefix === 0) score += 2;
  // «ашибка» → «шибка»: отрезанное начало, это не исправление.
  if (a.length !== b.length && a.endsWith(b) && a.length - b.length <= 2) score += 8;
  if (a.startsWith(b) && a.length > b.length) score += 3;
  if (collapsesDouble(a, b) || collapsesDouble(b, a)) score -= 5;
  score -= swapBonus(a, b);
  const typedLower = word.charAt(0) === word.charAt(0).toLocaleLowerCase("ru-RU");
  const shownLower = text.charAt(0) === text.charAt(0).toLocaleLowerCase("ru-RU");
  if (typedLower && !shownLower) score += 3;
  return score;
}

function applyCase(sample, lower) {
  if (sample === fold(sample)) return lower;
  if (isAllCaps(sample)) return lower.toLocaleUpperCase("ru-RU");
  return lower.charAt(0).toLocaleUpperCase("ru-RU") + lower.slice(1);
}

// Hunspell не дотягивается до двух замен гласных: «малако» само в «молоко» не превращается.
function phoneticCandidates(spell, word) {
  if (!CYRILLIC_RE.test(word)) return [];
  const lower = fold(word);
  const idxs = [];
  for (let i = 0; i < lower.length; i++) {
    if (RU_VOWEL_SWAP[lower.charAt(i)]) idxs.push(i);
  }
  if (idxs.length < 2 || idxs.length > 5) return [];
  const out = [];
  for (let i = 0; i < idxs.length; i++) {
    for (let j = i + 1; j < idxs.length; j++) {
      const chars = lower.split("");
      chars[idxs[i]] = RU_VOWEL_SWAP[chars[idxs[i]]];
      chars[idxs[j]] = RU_VOWEL_SWAP[chars[idxs[j]]];
      const next = chars.join("");
      try {
        if (spell.correct(next)) out.push(applyCase(word, next));
      } catch (e) {
        // Некорректная форма не мешает остальным вариантам.
      }
    }
  }
  return out;
}

function rankSuggestions(word, entries) {
  const byKey = new Map();
  entries.forEach((entry, index) => {
    const text = entry.text;
    if (!text) return;
    const score = suggestionScore(word, text, entry.trusted);
    if (score == null) return;
    const key = fold(text);
    const prev = byKey.get(key);
    if (!prev || score < prev.score) {
      byKey.set(key, { text, score, index: prev ? prev.index : index });
    }
  });
  const best = [...byKey.values()].sort((left, right) => left.score - right.score || left.index - right.index);
  if (!best.length) return [];
  const limit = best[0].score + SUGGEST_WINDOW;
  const picked = [];
  for (const item of best) {
    if (item.score > limit) break;
    picked.push(item.text);
    if (picked.length >= SUGGEST_LIMIT) break;
  }
  return picked;
}

// Словарь часто хранит форму с «е», хотя правильная запись — с «ё».
function withYo(spell, word) {
  const lower = word.toLocaleLowerCase("ru-RU");
  if (!lower.includes("е")) return word;
  const hits = [];
  for (let i = 0; i < lower.length; i++) {
    if (lower.charAt(i) !== "е") continue;
    const next = lower.slice(0, i) + "ё" + lower.slice(i + 1);
    try {
      if (spell.correct(next)) hits.push(next);
    } catch (e) {
      // Некорректная форма не мешает остальным вариантам.
    }
  }
  if (hits.length !== 1) return word;
  const yo = hits[0];
  const first = word.charAt(0);
  if (first !== first.toLocaleLowerCase("ru-RU")) {
    return yo.charAt(0).toLocaleUpperCase("ru-RU") + yo.slice(1);
  }
  return yo;
}

function suggestPlain(word) {
  if (word.length > 40) return [];
  const entries = [];
  for (const spell of checkersFor(word)) {
    let found = [];
    try {
      found = spell.suggest(word);
    } catch (e) {
      // Кривой ввод не должен ронять меню.
    }
    for (const item of found) entries.push({ text: withYo(spell, item), trusted: false });
    for (const item of phoneticCandidates(spell, word)) {
      entries.push({ text: withYo(spell, item), trusted: true });
    }
  }
  return rankSuggestions(word, entries);
}

function suggest(word) {
  const parts = word.split("-");
  if (parts.length >= 2) {
    const bad = [];
    parts.forEach((part, index) => {
      if (part.length >= 2 && !isCorrect(part)) bad.push(index);
    });
    if (bad.length === 1) {
      const index = bad[0];
      return uniqueSuggestions(suggestPlain(parts[index]).map((fix) => (
        parts.map((part, partIndex) => (partIndex === index ? fix : part)).join("-")
      )));
    }
  }
  return suggestPlain(word);
}

function touchesJunk(state, from, to) {
  const doc = state.doc;
  const before = from > 0 ? doc.sliceString(from - 1, from) : "";
  const after = to < doc.length ? doc.sliceString(to, to + 1) : "";
  return /[\d_]/.test(before) || /[\d_]/.test(after);
}

export function wordsInRange(state, from, to) {
  if (from >= to) return [];
  const skipped = [];
  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      if (!SKIP_NODES.has(node.name)) return;
      const start = Math.max(from, node.from);
      const end = Math.min(to, node.to);
      if (start < end) skipped.push({ from: start, to: end });
      return false;
    },
  });
  skipped.sort((a, b) => a.from - b.from || a.to - b.to);

  const slices = [];
  let cursor = from;
  for (const skip of skipped) {
    if (skip.from > cursor) slices.push([cursor, skip.from]);
    cursor = Math.max(cursor, skip.to);
  }
  if (cursor < to) slices.push([cursor, to]);

  const words = [];
  for (const [start, end] of slices) {
    const text = state.doc.sliceString(start, end);
    WORD_RE.lastIndex = 0;
    let match;
    while ((match = WORD_RE.exec(text))) {
      const word = match[0];
      if (word.length < 2) continue;
      const abs = start + match.index;
      const absEnd = abs + word.length;
      if (touchesJunk(state, abs, absEnd)) continue;
      // Запасной отсев, если дерево ещё не разметило сущность: &nbsp; &amp;
      if (abs > 0 && state.doc.sliceString(abs - 1, abs) === "&") continue;
      words.push({ from: abs, to: absEnd, word });
    }
  }
  return words;
}

// Слово не переходит через перевод строки. Пустая строка в Markdown не обязательна,
// поэтому «абзац» легко оказывается всем документом — его целиком не перечитываем.
function expandLines(state, from, to) {
  const doc = state.doc;
  if (doc.length === 0) return { from: 0, to: 0 };
  const start = Math.max(0, Math.min(from, doc.length));
  const end = Math.max(start, Math.min(to, doc.length));
  const fromLine = doc.lineAt(start);
  const toLine = doc.lineAt(end);
  const first = doc.line(Math.max(1, fromLine.number - 1));
  const last = doc.line(Math.min(doc.lines, toLine.number + 1));
  return { from: first.from, to: last.to };
}

function mergeRanges(ranges) {
  const sorted = ranges.filter((range) => range.from < range.to)
    .sort((a, b) => a.from - b.from || a.to - b.to);
  const out = [];
  for (const range of sorted) {
    const last = out[out.length - 1];
    if (last && range.from <= last.to) last.to = Math.max(last.to, range.to);
    else out.push({ from: range.from, to: range.to });
  }
  return out;
}

function mapRange(range, changes) {
  return {
    from: changes.mapPos(range.from, 1),
    to: changes.mapPos(range.to, -1),
  };
}

const WORD_EDGE = /[\p{Script=Cyrillic}\p{Script=Latin}]/u;

// Буква сразу за краем пометки: слово выросло, старая черта короче текста.
function grewAround(state, from, to) {
  const doc = state.doc;
  const before = from > 0 ? doc.sliceString(from - 1, from) : "";
  const after = to < doc.length ? doc.sliceString(to, to + 1) : "";
  return WORD_EDGE.test(before) || WORD_EDGE.test(after);
}

function misspellingsIn(state, ranges) {
  const found = [];
  for (const range of ranges) {
    for (const item of wordsInRange(state, range.from, range.to)) {
      if (!isCorrect(item.word)) found.push(item);
    }
  }
  return found;
}

// Новая пометка заменяет старую, если они лежат на одном месте.
function replaceOverlapping(marks, found) {
  const next = marks.filter((mark) => !found.some((item) => item.from < mark.to && item.to > mark.from));
  next.push(...found);
  next.sort((a, b) => a.from - b.from || a.to - b.to);
  return next;
}

function marksToDeco(marks) {
  const sorted = [...marks].sort((a, b) => a.from - b.from || b.to - a.to);
  const builder = new RangeSetBuilder();
  let cursor = 0;
  for (const mark of sorted) {
    if (mark.from < cursor || mark.from >= mark.to) continue;
    builder.add(mark.from, mark.to, spellMark);
    cursor = mark.to;
  }
  return builder.finish();
}

function hideMenu() {
  clearTimeout(menuTimer);
  if (menu) menu.hidden = true;
}

function placeMenu(view, pos, point) {
  const coords = placeAt(view, pos, point);
  if (!coords) return;
  menu.style.visibility = "hidden";
  menu.hidden = false;
  const rect = menu.getBoundingClientRect();
  const margin = 8;
  let left = coords.left;
  let top = coords.bottom + 4;
  if (left + rect.width > window.innerWidth - margin) {
    left = Math.max(margin, window.innerWidth - margin - rect.width);
  }
  if (top + rect.height > window.innerHeight - margin) {
    top = Math.max(margin, coords.top - 4 - rect.height);
  }
  menu.style.left = left + "px";
  menu.style.top = top + "px";
  menu.style.visibility = "visible";
}

function menuButton(label, onClick, enabled) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "spell-menu-item";
  button.textContent = label;
  if (enabled === false) {
    button.disabled = true;
    return button;
  }
  button.addEventListener("click", () => {
    hideMenu();
    onClick();
  });
  return button;
}

function menuLabel(text) {
  const node = document.createElement("div");
  node.className = "spell-menu-empty";
  node.textContent = text;
  return node;
}

function menuSeparator() {
  const node = document.createElement("div");
  node.className = "spell-menu-sep";
  return node;
}

function ensureMenu() {
  if (menu) return menu;
  menu = document.createElement("div");
  menu.className = "spell-menu";
  menu.hidden = true;
  menu.addEventListener("mousedown", (event) => event.preventDefault());
  document.body.appendChild(menu);
  menu.addEventListener("contextmenu", (event) => event.preventDefault());
  document.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    if (!menu || menu.hidden) return;
    if (event.target instanceof Node && menu.contains(event.target)) return;
    hideMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideMenu();
  });
  return menu;
}

function replaceWord(view, from, to, word, suggestion) {
  if (to > view.state.doc.length) return;
  if (view.state.doc.sliceString(from, to) !== word) return;
  view.dispatch({
    changes: { from, to, insert: suggestion },
    selection: { anchor: from + suggestion.length },
  });
}

function recheckAll() {
  if (!editorView) return;
  const plugin = editorView.plugin(spellPlugin);
  if (!plugin) return;
  plugin.dirty = [{ from: 0, to: editorView.state.doc.length }];
  plugin.schedule();
}

function rememberUserWord(word) {
  userWords.add(fold(word));
  recheckAll();
  if (typeof window.noteSpellUserWord === "function") window.noteSpellUserWord(word);
  const pending = window.callApi ? window.callApi("add_user_word", word) : null;
  if (pending && typeof pending.then === "function") {
    pending.then((words) => {
      if (!Array.isArray(words)) return;
      userWords = new Set(words.map((item) => fold(item)));
      recheckAll();
    });
  }
}

function skipWord(word) {
  sessionSkip.add(fold(word));
  recheckAll();
}

function markAtPoint(view, x, y) {
  if (!enabled || !checkersReady()) return null;
  const plugin = view.plugin(spellPlugin);
  if (!plugin) return null;
  let pos = view.posAtCoords({ x, y });
  if (pos == null) {
    const el = document.elementFromPoint(x, y);
    const span = el && el.closest ? el.closest(".cm-spell-error") : null;
    if (!span) return null;
    const rect = span.getBoundingClientRect();
    pos = view.posAtCoords({ x: rect.left + 1, y: rect.top + rect.height / 2 });
  }
  if (pos == null) return null;
  return plugin.markAt(pos);
}

function editCommand(view, command) {
  view.focus();
  document.execCommand(command);
}

// Страница каждый запуск на новом порту. navigator.clipboard.readText
// из-за этого снова спрашивает, можно ли сайту смотреть буфер обмена.
export function pasteClipboard(view) {
  view.focus();
  const pending = typeof window.callApi === "function" ? window.callApi("read_clipboard") : null;
  if (!pending || typeof pending.then !== "function") return;
  pending.then((text) => {
    if (typeof text !== "string" || text === "") return;
    view.dispatch(view.state.replaceSelection(text));
    view.focus();
  }).catch(() => {});
}

function selectAllText(view) {
  const length = view.state.doc.length;
  view.dispatch({ selection: { anchor: 0, head: length } });
  view.focus();
}

function showEditorMenu(view, x, y) {
  const panel = ensureMenu();
  panel.replaceChildren();
  const mark = markAtPoint(view, x, y);
  if (mark) {
    const status = menuLabel("Ищем варианты…");
    const spellSep = menuSeparator();
    panel.append(
      status,
      spellSep,
      menuButton("Пропустить", () => skipWord(mark.word)),
      menuButton("Добавить в словарь", () => rememberUserWord(mark.word)),
    );
    const { from, to, word } = mark;
    clearTimeout(menuTimer);
    menuTimer = setTimeout(() => {
      if (!menu || menu.hidden) return;
      if (view.state.doc.sliceString(from, to) !== word) {
        hideMenu();
        return;
      }
      status.remove();
      const suggestions = suggest(word);
      if (!suggestions.length) {
        panel.insertBefore(menuLabel("Нет вариантов"), spellSep);
      } else {
        for (const suggestion of suggestions) {
          panel.insertBefore(
            menuButton(suggestion, () => replaceWord(view, from, to, word, suggestion)),
            spellSep,
          );
        }
      }
      placeMenu(view, from, { x, y });
    }, 0);
  }

  if (panel.childElementCount) panel.append(menuSeparator());
  const readOnly = view.state.readOnly;
  const hasSelection = view.state.selection.ranges.some((range) => !range.empty);
  panel.append(menuButton("Вырезать", () => editCommand(view, "cut"), !readOnly && hasSelection));
  panel.append(menuButton("Копировать", () => editCommand(view, "copy"), hasSelection));
  panel.append(menuButton("Вставить", () => pasteClipboard(view), !readOnly));
  panel.append(menuButton("Выделить всё", () => selectAllText(view), view.state.doc.length > 0));
  panel.append(menuSeparator());
  panel.append(menuButton("Голосовой ввод", () => {
    if (window.callApi) window.callApi("start_voice_typing");
  }));
  const pos = mark ? mark.from : view.posAtCoords({ x, y });
  placeMenu(view, pos == null ? 0 : pos, { x, y });
}

function spellTargetAt(x, y) {
  const view = editorView;
  if (!enabled || !view || !checkersReady()) return null;
  let pos = view.posAtCoords({ x, y });
  if (pos == null) {
    const el = document.elementFromPoint(x, y);
    const span = el && el.closest ? el.closest(".cm-spell-error") : null;
    if (!span) return null;
    const rect = span.getBoundingClientRect();
    pos = view.posAtCoords({ x: rect.left + 1, y: rect.top + rect.height / 2 });
  }
  const plugin = view.plugin(spellPlugin);
  if (pos == null || !plugin) return null;
  const mark = plugin.markAt(pos);
  if (!mark) return null;
  return { view, mark };
}

function showMenu(view, mark, point) {
  const panel = ensureMenu();
  panel.replaceChildren();
  const status = document.createElement("div");
  status.className = "spell-menu-empty";
  status.textContent = "Ищем варианты…";
  const separator = document.createElement("div");
  separator.className = "spell-menu-sep";
  panel.append(status, separator, menuButton("Пропустить", () => skipWord(mark.word)));
  panel.append(menuButton("Добавить в словарь", () => rememberUserWord(mark.word)));
  placeMenu(view, mark.from, point);

  const { from, to, word } = mark;
  clearTimeout(menuTimer);
  menuTimer = setTimeout(() => {
    if (!menu || menu.hidden) return;
    if (view.state.doc.sliceString(from, to) !== word) {
      hideMenu();
      return;
    }
    const suggestions = suggest(word);
    status.remove();
    if (!suggestions.length) {
      const empty = document.createElement("div");
      empty.className = "spell-menu-empty";
      empty.textContent = "Нет вариантов";
      panel.insertBefore(empty, separator);
    } else {
      for (const suggestion of suggestions) {
        panel.insertBefore(
          menuButton(suggestion, () => replaceWord(view, from, to, word, suggestion)),
          separator,
        );
      }
    }
    placeMenu(view, from, point);
  }, 0);
}

function placeAt(view, pos, point) {
  if (point) return { left: point.x, top: point.y, bottom: point.y };
  return view.coordsAtPos(pos);
}

function findSpellMark(marks, pos) {
  for (const mark of marks) {
    if (pos > mark.from && pos < mark.to) return mark;
  }
  for (const mark of marks) {
    if (pos === mark.from || pos === mark.to) return mark;
  }
  return null;
}

const spellPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.view = view;
    this.marks = [];
    this.decorations = Decoration.none;
    this.dirty = [{ from: 0, to: view.state.doc.length }];
    this.timer = 0;
    this.generation = 0;
    this.waitingForTree = false;
    this.treeWaits = 0;
    this.dead = false;
    this.onScroll = () => hideMenu();
    view.scrollDOM.addEventListener("scroll", this.onScroll, { passive: true });
    this.schedule();
  }

  markAt(pos) {
    return findSpellMark(this.marks, pos);
  }

  schedule() {
    clearTimeout(this.timer);
    const generation = ++this.generation;
    this.timer = setTimeout(() => this.scan(generation), CHECK_DELAY_MS);
  }

  retryScan(generation, delay) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.scan(generation), delay);
  }

  scan(generation) {
    if (this.dead || generation !== this.generation) return;
    if (!checkersReady()) {
      this.retryScan(generation, CHECK_DELAY_MS);
      return;
    }
    const state = this.view.state;
    const docLength = state.doc.length;
    const ranges = mergeRanges(this.dirty.map((range) => ({
      from: Math.max(0, Math.min(range.from, docLength)),
      to: Math.max(0, Math.min(range.to, docLength)),
    })));
    if (!ranges.length) {
      this.dirty = [];
      this.treeWaits = 0;
      return;
    }
    const covered = syntaxTreeAvailable(state, ranges[ranges.length - 1].to);
    if (!covered && this.treeWaits < 20) {
      this.waitingForTree = true;
      this.treeWaits += 1;
      this.retryScan(generation, 80);
      return;
    }
    this.waitingForTree = false;
    this.treeWaits = 0;
    const found = misspellingsIn(state, ranges);
    if (this.dead || generation !== this.generation) return;
    this.view.dispatch({
      effects: spellResult.of({ generation, ranges, found }),
    });
  }

  update(update) {
    if (update.docChanged) {
      this.generation += 1;
      clearTimeout(this.timer);
      hideMenu();
      this.dirty = this.dirty
        .map((range) => mapRange(range, update.changes))
        .filter((range) => range.from < range.to);
      update.changes.iterChanges((fromA, toA, fromB, toB) => {
        this.dirty.push(expandLines(update.state, fromB, toB));
      });
      // Чужое слово не трогаем. Своё снимаем, если буквы уже другие
      // или слово выросло за край старой черты.
      this.marks = this.marks.flatMap((mark) => {
        const from = update.changes.mapPos(mark.from, 1);
        const to = update.changes.mapPos(mark.to, -1);
        if (from >= to) return [];
        if (update.state.doc.sliceString(from, to) !== mark.word) return [];
        if (grewAround(update.state, from, to)) return [];
        return [{ from, to, word: mark.word }];
      });
      const docLength = update.state.doc.length;
      const ranges = mergeRanges(this.dirty.map((range) => ({
        from: Math.max(0, Math.min(range.from, docLength)),
        to: Math.max(0, Math.min(range.to, docLength)),
      })));
      const width = ranges.reduce((sum, range) => sum + (range.to - range.from), 0);
      if (width > 0 && width <= IMMEDIATE_CHECK_LIMIT && checkersReady()) {
        this.marks = replaceOverlapping(this.marks, misspellingsIn(update.state, ranges));
      }
      this.marks.sort((a, b) => a.from - b.from || a.to - b.to);
      this.decorations = marksToDeco(this.marks);
      this.schedule();
      return;
    }

    for (const transaction of update.transactions) {
      for (const effect of transaction.effects) {
        if (!effect.is(spellResult) || effect.value.generation !== this.generation) continue;
        const { ranges, found } = effect.value;
        this.marks = this.marks
          .filter((mark) => !ranges.some((range) => mark.from < range.to && mark.to > range.from));
        this.marks.push(...found);
        this.marks.sort((a, b) => a.from - b.from || a.to - b.to);
        this.dirty = [];
        this.decorations = marksToDeco(this.marks);
      }
    }

    if (this.waitingForTree) this.schedule();
  }

  destroy() {
    this.dead = true;
    clearTimeout(this.timer);
    this.view.scrollDOM.removeEventListener("scroll", this.onScroll);
    hideMenu();
  }
}, {
  decorations: (plugin) => plugin.decorations,
});

const spellExtensions = [
  spellPlugin,
  EditorView.domEventHandlers({
    click(event, view) {
      if (event.button !== 0 || event.altKey || event.metaKey || event.ctrlKey) return false;
      const target = event.target instanceof Element ? event.target.closest(".cm-spell-error") : null;
      if (!target) {
        hideMenu();
        return false;
      }
      if (!view.state.selection.main.empty) return false;
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      const plugin = view.plugin(spellPlugin);
      if (pos == null || !plugin) return false;
      const mark = plugin.markAt(pos);
      if (!mark) return false;
      showMenu(view, mark);
      return false;
    },
  }),
  keymap.of([{
    key: "Escape",
    run() {
      if (!menu || menu.hidden) return false;
      hideMenu();
      return true;
    },
  }]),
];

function applyCompartment() {
  if (!editorView) return;
  const next = enabled && checkersReady() ? spellExtensions : spellcheckOff;
  if (spellCompartment.get(editorView.state) === next) return;
  editorView.dispatch({ effects: spellCompartment.reconfigure(next) });
}

export function bindSpellcheck(view) {
  editorView = view;

  window.setSpellUserWords = function (words) {
    userWords = new Set();
    for (const item of words || []) {
      const word = typeof item === "string" ? item : item && item.word;
      if (typeof word === "string" && word) userWords.add(fold(word));
    }
    recheckAll();
  };

  window.setSpellcheckEnabled = function (on) {
    enabled = !!on;
    const token = ++requestToken;
    if (!enabled) {
      dropCheckers();
      applyCompartment();
      return;
    }
    if (checkersReady()) {
      applyCompartment();
      return;
    }
    loadCheckers(token).then((ready) => {
      if (token !== requestToken || !enabled || !ready) return;
      applyCompartment();
    }).catch((error) => {
      console.warn("Орфография: не удалось загрузить словари", error);
    });
  };

  window.reapplySpellcheck = function () {
    applyCompartment();
  };

  // Своё меню вместо системного: то следует тёмной теме Windows и рисует
  // варианты дважды, плюс «Направление письма».
  view.dom.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    showEditorMenu(view, event.clientX, event.clientY);
  });

  window.editorContextMenu = function (x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el || !view.dom.contains(el)) return false;
    showEditorMenu(view, x, y);
    return true;
  };

  window.spellMenuInfo = function (x, y) {
    const hit = spellTargetAt(x, y);
    if (!hit) return null;
    return {
      word: hit.mark.word,
      from: hit.mark.from,
      to: hit.mark.to,
      suggestions: suggest(hit.mark.word),
    };
  };

  window.spellMenuAction = function (action) {
    if (!editorView || !action) return;
    if (action.type === "replace") {
      replaceWord(editorView, action.from, action.to, action.word, action.text);
    } else if (action.type === "skip") {
      skipWord(action.word);
    } else if (action.type === "add") {
      rememberUserWord(action.word);
    }
  };

  window.spellShowMenu = function (x, y) {
    const hit = spellTargetAt(x, y);
    if (!hit) return;
    showMenu(hit.view, hit.mark, { x: x, y: y });
  };
}
