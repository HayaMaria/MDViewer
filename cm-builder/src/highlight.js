import hljs from "highlight.js/lib/core";
import python from "highlight.js/lib/languages/python";
import javascript from "highlight.js/lib/languages/javascript";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import bash from "highlight.js/lib/languages/bash";
import sql from "highlight.js/lib/languages/sql";
import json from "highlight.js/lib/languages/json";

// Только языки из справки. html — псевдоним xml, js — javascript, py — python, sh — bash.
hljs.registerLanguage("python", python);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("css", css);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("json", json);
hljs.registerAliases("shell", { languageName: "bash" });

// false — язык не из набора, marked оставит блок обычным серым <pre>.
export function highlightCodeBlock(text, lang) {
  const language = (lang || "").trim().toLowerCase();
  if (!language || !hljs.getLanguage(language)) return false;
  const source = text.replace(/\n$/, "") + "\n";
  let html;
  try {
    html = hljs.highlight(source, { language, ignoreIllegals: true }).value;
  } catch {
    return false;
  }
  const safe = language.replace(/[^a-z0-9_+-]/g, "");
  return `<pre><code class="hljs language-${safe}">${html}</code></pre>\n`;
}
