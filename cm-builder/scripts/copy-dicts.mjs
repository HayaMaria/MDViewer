// Копирует словари Hunspell в assets/dicts как отдельные скрипты.
// В editor.bundle.js остаётся только nspell: сами списки слов слишком большие.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.resolve(root, "../assets/dicts");
fs.mkdirSync(outDir, { recursive: true });

for (const lang of ["ru", "en"]) {
  const dir = path.join(root, "node_modules", `dictionary-${lang}`);
  const aff = fs.readFileSync(path.join(dir, "index.aff"), "utf8");
  const dic = fs.readFileSync(path.join(dir, "index.dic"), "utf8");
  const json = JSON.stringify({ aff, dic });
  const js = `window.__mdvSpellDict=window.__mdvSpellDict||{};window.__mdvSpellDict.${lang}=${json};\n`;
  fs.writeFileSync(path.join(outDir, `${lang}.js`), js);
  console.log(`${lang}.js ${Math.round(js.length / 1024)} KB`);
}
