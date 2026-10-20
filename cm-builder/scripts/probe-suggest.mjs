import nspell from "nspell";
import ru from "dictionary-ru";
import en from "dictionary-en";

const SUGGEST_MIN_RATIO = 0.7;
const SUGGEST_LIMIT = 6;
const SUGGEST_WINDOW = 3;
const RU_SWAP = { "а": "о", "о": "а", "е": "и", "и": "е", "з": "с", "с": "з" };
const RU_VOWEL_SWAP = { "а": "о", "о": "а", "е": "и", "и": "е" };

const dic = new TextDecoder("utf8").decode(ru.dic)
  .split(/\r?\n/)
  .filter((line) => line.split("/")[0] !== "упак")
  .join("\n");
const ruSpell = nspell(new TextDecoder("utf8").decode(ru.aff), dic);
const enSpell = nspell(new TextDecoder("utf8").decode(en.aff), new TextDecoder("utf8").decode(en.dic));

function fold(word) {
  return word.toLocaleLowerCase("ru-RU");
}

function commonRatio(left, right) {
  const a = fold(left);
  const b = fold(right);
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

function editDistance(a, b) {
  const rows = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = 0; i <= a.length; i++) rows[i][0] = i;
  for (let j = 0; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      let value = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a.charCodeAt(i - 1) === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) {
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
  const upper = word.toLocaleUpperCase("ru-RU");
  return word === upper && word !== lower;
}

function maxDistance(length) {
  return length <= 4 ? 1 : 2;
}

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

function suggestionScore(word, text, trusted) {
  const a = fold(word);
  const b = fold(text);
  if (!b || b.length < 2 || b === a) return null;
  if (/\d/.test(text) || /\s/.test(text)) return null;
  if (isAllCaps(text) && !isAllCaps(word)) return null;
  const dist = editDistance(a, b);
  if (dist === 0 || dist > maxDistance(a.length)) return null;
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

function phoneticCandidates(spell, word) {
  if (!/[а-яё]/i.test(word)) return [];
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
        // skip
      }
    }
  }
  return out;
}

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
      // skip
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

function rankSuggestions(word, entries) {
  const best = [];
  const seen = new Set();
  entries.forEach((entry, index) => {
    const text = entry.text;
    const key = fold(text);
    if (seen.has(key)) return;
    const score = suggestionScore(word, text, entry.trusted);
    if (score == null) return;
    seen.add(key);
    best.push({ text, score, index });
  });
  best.sort((x, y) => x.score - y.score || x.index - y.index);
  if (!best.length) return [];
  const limit = best[0].score + SUGGEST_WINDOW;
  return best.filter((item) => item.score <= limit).slice(0, SUGGEST_LIMIT);
}

const words = [
  "ашибка", "ашибкой", "упк", "превет", "привт", "првиет", "приветт",
  "карова", "малако", "чтоба", "вобще", "ничево", "зделать", "агенство",
  "чуство", "жизинь", "интренет", "пожалуста", "ошибкаа", "сообение", "седня",
  "бюлетень", "ложить",
  "teh", "recieve", "definately", "seperate", "wierd", "becuase", "occurrance",
];

for (const word of words) {
  const spell = /[а-яё]/i.test(word) ? ruSpell : enSpell;
  const entries = [];
  for (const item of spell.suggest(word)) entries.push({ text: withYo(spell, item), trusted: false });
  for (const item of phoneticCandidates(spell, word)) entries.push({ text: withYo(spell, item), trusted: true });
  const ranked = rankSuggestions(word, entries);
  console.log("\n" + word);
  console.log(ranked.map((item) => item.text + ":" + item.score).join(" | ") || "(пусто)");
}
