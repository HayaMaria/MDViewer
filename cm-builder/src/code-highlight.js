import { IterMode, NodeProp } from "@lezer/common";
import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { Decoration, ViewPlugin } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

// Классы tok-* красятся в style.css теми же переменными --hl-*, что и превью (тема GitHub).
export const codeHighlightStyle = HighlightStyle.define([
  { tag: t.comment, class: "tok-comment" },
  { tag: t.keyword, class: "tok-keyword" },
  { tag: [t.null, t.literal], class: "tok-literal" },
  // Операторы (+, =, .) в превью остаются цветом текста. Исключения — ниже, оверлеем.
  { tag: [t.unit, t.number, t.color], class: "tok-number" },
  { tag: [t.string, t.regexp, t.escape, t.inserted], class: "tok-string" },
  {
    tag: [
      t.function(t.variableName),
      t.function(t.propertyName),
      t.function(t.definition(t.variableName)),
    ],
    class: "tok-title",
  },
  { tag: [t.className, t.namespace], class: "tok-type" },
  { tag: t.typeName, class: "tok-keyword" },
  { tag: [t.standard(t.variableName), t.standard(t.name), t.macroName], class: "tok-builtin" },
  // Скобки тега в превью не красятся, имя тега — зелёное.
  { tag: t.tagName, class: "tok-tag" },
  { tag: [t.attributeName, t.propertyName], class: "tok-attr" },
  { tag: [t.variableName, t.name, t.labelName], class: "tok-variable" },
  { tag: t.constant(t.className), class: "tok-tag" },
  { tag: t.special(t.brace), class: "tok-keyword" },
  { tag: [t.meta, t.annotation], class: "tok-meta" },
  { tag: [t.invalid, t.deleted], class: "tok-invalid" },

  { tag: t.heading, class: "tok-heading" },
  { tag: [t.link, t.url], class: "tok-link" },
  { tag: t.emphasis, class: "tok-em" },
  { tag: t.strong, class: "tok-strong" },
  { tag: t.strikethrough, class: "tok-strike" },
  { tag: t.quote, class: "tok-quote" },
  { tag: [t.processingInstruction, t.contentSeparator, t.documentMeta], class: "tok-mark" },
]);

export const codeHighlighting = syntaxHighlighting(codeHighlightStyle);

// Имена, которые GitHub красит как встроенные функции (тот же цвет, что у функций).
const PYTHON_BUILTINS = new Set([
  "__import__", "abs", "aiter", "all", "anext", "any", "ascii", "bin", "bool",
  "breakpoint", "bytearray", "bytes", "callable", "chr", "classmethod", "compile",
  "complex", "delattr", "dict", "dir", "divmod", "enumerate", "eval", "exec",
  "filter", "float", "format", "frozendict", "frozenset", "getattr", "globals",
  "hasattr", "hash", "help", "hex", "id", "input", "int", "isinstance", "issubclass",
  "iter", "len", "list", "locals", "map", "max", "memoryview", "min", "next",
  "object", "oct", "open", "ord", "pow", "print", "property", "range", "repr",
  "reversed", "round", "sentinel", "set", "setattr", "slice", "sorted",
  "staticmethod", "str", "sum", "super", "tuple", "type", "vars", "zip",
]);

const JS_BUILTINS = new Set([
  "setInterval", "setTimeout", "clearInterval", "clearTimeout", "require", "exports",
  "eval", "isFinite", "isNaN", "parseFloat", "parseInt", "decodeURI",
  "decodeURIComponent", "encodeURI", "encodeURIComponent", "escape", "unescape",
  "Object", "Function", "Boolean", "Symbol", "Math", "Date", "Number", "BigInt",
  "String", "RegExp", "Array", "Float32Array", "Float64Array", "Int8Array",
  "Uint8Array", "Uint8ClampedArray", "Int16Array", "Int32Array", "Uint16Array",
  "Uint32Array", "BigInt64Array", "BigUint64Array", "Set", "Map", "WeakSet",
  "WeakMap", "ArrayBuffer", "SharedArrayBuffer", "Atomics", "DataView", "JSON",
  "Promise", "Generator", "GeneratorFunction", "AsyncFunction", "Reflect", "Proxy",
  "Intl", "WebAssembly", "Error", "EvalError", "InternalError", "RangeError",
  "ReferenceError", "SyntaxError", "TypeError", "URIError",
]);

const BUILTINS = {
  python: PYTHON_BUILTINS,
  py: PYTHON_BUILTINS,
  javascript: JS_BUILTINS,
  js: JS_BUILTINS,
  jsx: JS_BUILTINS,
};

// highlight.js помечает их как variable.language — цвет ключевого слова.
const JS_LANG_VARS = new Set([
  "arguments", "this", "super", "console", "window", "document",
  "localStorage", "sessionStorage", "module", "self", "global",
]);

// highlight.js: вызов функции — built_in, эти имена — built_in и без скобок.
const SQL_FUNCTIONS = new Set([
  "abs", "acos", "array_agg", "asin", "atan", "avg", "cast", "ceil", "ceiling",
  "coalesce", "corr", "cos", "cosh", "count", "covar_pop", "covar_samp", "cume_dist",
  "dense_rank", "deref", "element", "exp", "extract", "first_value", "floor",
  "json_array", "json_arrayagg", "json_exists", "json_object", "json_objectagg",
  "json_query", "json_table", "json_table_primitive", "json_value", "lag", "last_value",
  "lead", "listagg", "ln", "log", "log10", "lower", "max", "min", "mod", "nth_value",
  "ntile", "nullif", "percent_rank", "percentile_cont", "percentile_disc", "position",
  "position_regex", "power", "rank", "regr_avgx", "regr_avgy", "regr_count",
  "regr_intercept", "regr_r2", "regr_slope", "regr_sxx", "regr_sxy", "regr_syy",
  "row_number", "sin", "sinh", "sqrt", "stddev_pop", "stddev_samp", "substring",
  "substring_regex", "sum", "tan", "tanh", "translate", "translate_regex", "treat",
  "trim", "trim_array", "unnest", "upper", "value_of", "var_pop", "var_samp",
  "width_bucket",
]);

const SQL_BARE = new Set([
  "current_catalog", "current_date", "current_default_transform_group", "current_path",
  "current_role", "current_schema", "current_transform_group_for_type", "current_user",
  "session_user", "system_time", "system_user", "current_time", "localtime",
  "current_timestamp", "localtimestamp",
]);

const builtinMark = Decoration.mark({ class: "tok-builtin" });
const keywordMark = Decoration.mark({ class: "tok-as-keyword" });
const numberMark = Decoration.mark({ class: "tok-as-number" });
const tagMark = Decoration.mark({ class: "tok-as-tag" });

function fenceLang(state, node) {
  const info = node.node.getChild("CodeInfo");
  if (!info) return "";
  return state.doc.sliceString(info.from, info.to).trim().split(/[\s{]/)[0].toLowerCase();
}

function followedByParen(state, pos) {
  return /^\s*\(/.test(state.doc.sliceString(pos, Math.min(state.doc.length, pos + 8)));
}

// Имя после def / class / function — это объявление, превью красит его как функцию.
function isDefinedName(node) {
  const parent = node.node.parent;
  if (!parent) return false;
  if ((node.name === "VariableName" || node.name === "PropertyName") &&
      (parent.name === "FunctionDefinition" || parent.name === "ClassDefinition")) {
    return true;
  }
  const grand = parent.parent;
  if (!grand) return false;
  return parent.name === "VariableDefinition" &&
    (grand.name === "FunctionDeclaration" || grand.name === "ClassDeclaration");
}

function builtinDecorations(view) {
  const builder = new RangeSetBuilder();
  const state = view.state;
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "FencedCode" || !node.tree) return;
      const lang = fenceLang(state, node);
      const names = BUILTINS[lang] || null;
      const mounted = node.tree.prop(NodeProp.mounted);
      if (!mounted || !mounted.overlay || !mounted.overlay.length) return;
      const start = node.from + mounted.overlay[0].from;
      const inner = node.node.enter(start, 1, IterMode.EnterBracketed);
      if (!inner) return;
      const js = lang === "javascript" || lang === "js" || lang === "jsx";
      inner.cursor().iterate((token) => {
        if (lang === "css" && (token.name === "ClassSelector" || token.name === "IdSelector")) {
          builder.add(token.from, token.to, numberMark);
          return false;
        }
        if (token.node.firstChild) return;
        const length = token.to - token.from;
        if (length < 1 || length > 40) return;
        const text = state.doc.sliceString(token.from, token.to);
        if (lang === "css" && token.node.parent && token.node.parent.name === "PseudoClassSelector" &&
            (token.name === ":" || token.name === "::" || token.name === "PseudoClassName")) {
          builder.add(token.from, token.to, tagMark);
          return;
        }
        if (lang === "sql" && token.name === "Operator") {
          builder.add(token.from, token.to, numberMark);
          return;
        }
        if (lang === "json" && (token.name === "True" || token.name === "False" || token.name === "Null")) {
          builder.add(token.from, token.to, keywordMark);
          return;
        }
        if (js && JS_LANG_VARS.has(text)) {
          builder.add(token.from, token.to, keywordMark);
          return;
        }
        if (lang === "sql") {
          const lower = text.toLowerCase();
          if (SQL_BARE.has(lower) || (SQL_FUNCTIONS.has(lower) && followedByParen(state, token.to))) {
            builder.add(token.from, token.to, builtinMark);
            return;
          }
        }
        if (!names || !names.has(text) || isDefinedName(token)) return;
        builder.add(token.from, token.to, builtinMark);
      });
    },
  });
  return builder.finish();
}

export const builtinHighlight = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = builtinDecorations(view);
    }
    update(update) {
      if (update.docChanged || update.viewportChanged ||
          syntaxTree(update.startState) !== syntaxTree(update.state)) {
        this.decorations = builtinDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations }
);
