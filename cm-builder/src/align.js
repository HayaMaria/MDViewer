// Выравнивание блока. Внутри обычный Markdown:
// :::center
// текст
// :::
// :::right — по правому краю. Строка «:::» закрывает блок.
// Строка «:::» внутри ``` / ~~~ блок не закрывает.

const OPEN_RE = /^(?:[ \t]{0,3}):::[ \t]*(center|right)[ \t]*(?:\r?\n|$)/;

export function alignMarker(text) {
  const open = /^([ \t]{0,3}):::[ \t]*(center|right)[ \t]*$/.exec(text);
  if (open) return { kind: "open", align: open[2] };
  if (/^[ \t]{0,3}:::[ \t]*$/.test(text)) return { kind: "close" };
  return null;
}

// Границы блока от начала src. contentEnd — конец внутреннего текста,
// rawEnd — конец всего блока, включая закрывающую строку.
function readAlign(src, from) {
  let pos = from;
  let fence = null;
  while (pos < src.length) {
    const nl = src.indexOf("\n", pos);
    const end = nl === -1 ? src.length : nl;
    const line = src.slice(pos, end).replace(/\r$/, "");
    const fenceMark = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (fenceMark && fenceMark[1][0] === fence.ch && fenceMark[1].length >= fence.len) fence = null;
    } else if (fenceMark) {
      fence = { ch: fenceMark[1][0], len: fenceMark[1].length };
    } else if (alignMarker(line)?.kind === "close") {
      return { contentEnd: pos, rawEnd: nl === -1 ? src.length : nl + 1 };
    }
    if (nl === -1) break;
    pos = nl + 1;
  }
  return { contentEnd: src.length, rawEnd: src.length };
}

export const alignExtension = {
  name: "align",
  level: "block",
  start(src) {
    const match = /(?:^|\n)([ \t]{0,3}):::(?:center|right)[ \t]*(?:\r?\n|$)/.exec(src);
    if (!match) return;
    const atLine = match.index + (src.charAt(match.index) === "\n" ? 1 : 0);
    return atLine + match[1].length;
  },
  tokenizer(src) {
    const open = OPEN_RE.exec(src);
    if (!open) return;
    const parsed = readAlign(src, open[0].length);
    const token = {
      type: "align",
      raw: src.slice(0, parsed.rawEnd),
      align: open[1],
      text: src.slice(open[0].length, parsed.contentEnd),
      tokens: [],
    };
    this.lexer.blockTokens(token.text, token.tokens);
    return token;
  },
  renderer(token) {
    const align = token.align === "right" ? "right" : "center";
    return `<div class="md-align md-align-${align}">${this.parser.parse(token.tokens)}</div>\n`;
  },
  childTokens: ["tokens"],
};
