import { StreamLanguage } from "@codemirror/language";
import { pythonLanguage } from "@codemirror/lang-python";
import { javascriptLanguage } from "@codemirror/lang-javascript";
import { htmlLanguage } from "@codemirror/lang-html";
import { cssLanguage } from "@codemirror/lang-css";
import { sql } from "@codemirror/lang-sql";
import { jsonLanguage } from "@codemirror/lang-json";
import { shell } from "@codemirror/legacy-modes/mode/shell";

// Те же языки, что красит превью. mermaid, chart и nomnoml сюда не входят.
const shellLanguage = StreamLanguage.define(shell);
const sqlLanguage = sql().language;

const CODE_LANGUAGES = {
  python: pythonLanguage,
  py: pythonLanguage,
  javascript: javascriptLanguage,
  js: javascriptLanguage,
  jsx: javascriptLanguage,
  html: htmlLanguage,
  xml: htmlLanguage,
  svg: htmlLanguage,
  css: cssLanguage,
  bash: shellLanguage,
  sh: shellLanguage,
  shell: shellLanguage,
  zsh: shellLanguage,
  sql: sqlLanguage,
  json: jsonLanguage,
};

export function editorCodeLanguage(info) {
  return CODE_LANGUAGES[(info || "").toLowerCase()] || null;
}
