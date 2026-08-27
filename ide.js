/* ide.js - the editor itself.
 *
 * CodeMirror does the text editing, the colouring and the folding; everything
 * on top of it is here: the language table, a structural checker that runs on
 * every keystroke without waiting for anything to load, the wiring to the real
 * Python compiler in the worker, and the format button.
 *
 *   ELKIDE.create({host, lang, value, onChange}) -> editor handle
 *
 * If the CDN is unreachable the whole thing degrades to a plain textarea that
 * still saves, still formats and still runs. Nothing here is load-bearing for
 * getting your code out again.
 */

(function () {
  "use strict";

  /* ---------- the languages on offer -------------------------------- */

  const LANGS = [
    { id: "python", label: "Python", ext: "py", mode: "python", snippet: "python3", comment: "#", runs: true },
    { id: "javascript", label: "JavaScript", ext: "js", mode: "javascript", snippet: "javascript", comment: "//", runs: true },
    { id: "typescript", label: "TypeScript", ext: "ts", mode: { name: "javascript", typescript: true }, snippet: "typescript", comment: "//", runs: false },
    { id: "cpp", label: "C++", ext: "cpp", mode: "text/x-c++src", snippet: "cpp", comment: "//", runs: false },
    { id: "java", label: "Java", ext: "java", mode: "text/x-java", snippet: "java", comment: "//", runs: false },
    { id: "c", label: "C", ext: "c", mode: "text/x-csrc", snippet: "c", comment: "//", runs: false },
    { id: "csharp", label: "C#", ext: "cs", mode: "text/x-csharp", snippet: "csharp", comment: "//", runs: false },
    { id: "go", label: "Go", ext: "go", mode: "go", snippet: "golang", comment: "//", runs: false },
    { id: "rust", label: "Rust", ext: "rs", mode: "rust", snippet: "rust", comment: "//", runs: false },
  ];

  const BY_ID = {};
  LANGS.forEach((lang) => { BY_ID[lang.id] = lang; });

  const PY_HINTS = ("False None True and as assert async await break class continue def del elif " +
    "else except finally for from global if import in is lambda nonlocal not or pass raise return " +
    "try while with yield print len range enumerate sorted reversed sum min max abs zip map filter " +
    "list dict set tuple str int float bool any all defaultdict Counter deque heapq bisect " +
    "itertools functools math self append pop insert remove index count extend sort keys values " +
    "items get setdefault join split strip format ListNode TreeNode Solution").split(" ");

  const C_HINTS = ("auto bool break case catch char class const continue default delete do double " +
    "else enum explicit export extern false float for friend goto if inline int long namespace new " +
    "nullptr operator private protected public return short signed sizeof static struct switch " +
    "template this throw true try typedef typename union unsigned using virtual void volatile while " +
    "vector map set unordered_map unordered_set pair string queue stack priority_queue push_back " +
    "size begin end sort max min abs count find insert erase emplace_back").split(" ");

  const JS_HINTS = ("await break case catch class const continue debugger default delete do else " +
    "export extends finally for function if import in instanceof let new return super switch this " +
    "throw try typeof var void while with yield Math Number String Array Object Map Set JSON " +
    "console length push pop shift unshift slice splice map filter reduce forEach sort join " +
    "Infinity parseInt parseFloat ListNode TreeNode").split(" ");

  function hintsFor(langId) {
    if (langId === "python") return PY_HINTS;
    if (langId === "javascript" || langId === "typescript") return JS_HINTS;
    return C_HINTS;
  }

  /* ---------- a scanner that keeps line numbers ---------------------- */

  /* The formatter's tokenisers throw positions away because they do not need
     them. The checker does, so this walks the source once and records where
     every bracket, string and comment starts. */

  function scan(code, langId) {
    const python = langId === "python";
    const tokens = [];
    let line = 0;
    let ch = 0;
    let i = 0;
    const n = code.length;
    const unterminated = [];

    function advance(count) {
      for (let k = 0; k < count; k++) {
        if (code[i] === "\n") { line++; ch = 0; } else { ch++; }
        i++;
      }
    }

    while (i < n) {
      const c = code[i];
      const startLine = line;
      const startCh = ch;

      if (c === "\n" || c === " " || c === "\t" || c === "\r") { advance(1); continue; }

      /* comments */
      if ((python && c === "#") || (!python && c === "/" && code[i + 1] === "/")) {
        let k = i;
        while (k < n && code[k] !== "\n") k++;
        advance(k - i);
        continue;
      }
      if (!python && c === "/" && code[i + 1] === "*") {
        const end = code.indexOf("*/", i + 2);
        if (end === -1) {
          unterminated.push({ line: startLine, ch: startCh, message: "this block comment is never closed" });
          advance(n - i);
        } else {
          advance(end + 2 - i);
        }
        continue;
      }

      /* strings */
      const quoteMatch = python
        ? /^([rRbBuUfF]{0,3})("""|'''|"|')/.exec(code.slice(i, i + 6))
        : /^()("|'|`)/.exec(code.slice(i, i + 1));
      if (quoteMatch) {
        const prefix = quoteMatch[1];
        const quote = quoteMatch[2];
        let k = i + prefix.length + quote.length;
        let closed = false;
        while (k < n) {
          if (code[k] === "\\") { k += 2; continue; }
          if (code.startsWith(quote, k)) { k += quote.length; closed = true; break; }
          if (quote.length === 1 && code[k] === "\n" && quote !== "`") break;
          k++;
        }
        if (!closed) {
          unterminated.push({
            line: startLine, ch: startCh,
            message: quote.length === 3 ? "this triple-quoted string is never closed" : "this string is never closed",
          });
        }
        advance(Math.min(k, n) - i);
        tokens.push({ t: "str", v: quote, line: startLine, ch: startCh });
        continue;
      }

      /* words */
      if (/[A-Za-z_$]/.test(c)) {
        let k = i;
        while (k < n && /[A-Za-z0-9_$]/.test(code[k])) k++;
        tokens.push({ t: "word", v: code.slice(i, k), line: startLine, ch: startCh });
        advance(k - i);
        continue;
      }

      /* numbers */
      if (/[0-9]/.test(c)) {
        let k = i;
        while (k < n && /[0-9a-fA-FxXoObB._+\-eE]/.test(code[k])) {
          if ((code[k] === "+" || code[k] === "-") && !/[eE]/.test(code[k - 1] || "")) break;
          k++;
        }
        tokens.push({ t: "num", v: code.slice(i, k), line: startLine, ch: startCh });
        advance(k - i);
        continue;
      }

      tokens.push({ t: "op", v: c, line: startLine, ch: startCh });
      advance(1);
    }

    return { tokens: tokens, unterminated: unterminated };
  }

  const PAIRS = { "(": ")", "[": "]", "{": "}" };
  const CLOSERS = { ")": "(", "]": "[", "}": "{" };

  const PY_BLOCK_WORDS = ["if", "elif", "else", "for", "while", "def", "class", "try",
    "except", "finally", "with", "match", "case"];

  /* Structural problems, found without a parser and without waiting for
     Pyodide. Everything here is a certainty, never a guess - a linter that
     cries wolf on working code is worse than no linter. */
  function structuralCheck(code, langId) {
    const problems = [];
    if (!code.trim()) return problems;

    const scanned = scan(code, langId);
    scanned.unterminated.forEach((u) => {
      problems.push({ line: u.line, ch: u.ch, message: u.message, severity: "error" });
    });

    const stack = [];
    scanned.tokens.forEach((tk) => {
      if (tk.t !== "op") return;
      if (PAIRS[tk.v]) { stack.push(tk); return; }
      if (CLOSERS[tk.v]) {
        const open = stack.pop();
        if (!open) {
          problems.push({ line: tk.line, ch: tk.ch, message: "stray '" + tk.v + "' - nothing was opened", severity: "error" });
        } else if (PAIRS[open.v] !== tk.v) {
          problems.push({
            line: tk.line, ch: tk.ch,
            message: "'" + tk.v + "' closes a '" + open.v + "' opened on line " + (open.line + 1),
            severity: "error",
          });
          stack.push(open);
        }
      }
    });
    stack.forEach((open) => {
      problems.push({
        line: open.line, ch: open.ch,
        message: "'" + open.v + "' is never closed",
        severity: "error",
      });
    });

    if (langId === "python") {
      const lines = code.split("\n");
      let depth = 0;
      let inTriple = false;
      for (let index = 0; index < lines.length; index++) {
        const text = lines[index];
        const bare = text.replace(/(['"])(?:\\.|(?!\1).)*\1/g, "''").replace(/#.*$/, "");

        const triples = (text.match(/"""|'''/g) || []).length;
        if (triples % 2 === 1) inTriple = !inTriple;
        if (inTriple) continue;

        const opens = (bare.match(/[([{]/g) || []).length;
        const closes = (bare.match(/[)\]}]/g) || []).length;
        const wasNested = depth > 0;
        depth = Math.max(0, depth + opens - closes);
        if (wasNested) continue;

        const trimmed = bare.trim();
        if (!trimmed) continue;

        const head = /^([A-Za-z_]+)\b/.exec(trimmed);
        if (head && PY_BLOCK_WORDS.indexOf(head[1]) !== -1 && depth === 0 &&
            !/:\s*$/.test(trimmed) && !/:.+/.test(trimmed) && !/\\$/.test(trimmed)) {
          problems.push({
            line: index, ch: text.length,
            message: "'" + head[1] + "' opens a block, so this line needs to end in ':'",
            severity: "error",
          });
        }

        if (/^(if|while|elif)\b/.test(trimmed) && /[^!<>=+\-*/%&|^:]=[^=]/.test(trimmed.replace(/^(if|while|elif)\b/, ""))) {
          problems.push({
            line: index, ch: 0,
            message: "'=' assigns, '==' compares - Python will not accept an assignment here",
            severity: "error",
          });
        }

        if (/^print\s+[^(=\s]/.test(trimmed)) {
          problems.push({
            line: index, ch: 0,
            message: "this is Python 2 syntax - print is a function, so it needs brackets",
            severity: "error",
          });
        }

        if (/^\t+ | +\t/.test(text)) {
          problems.push({
            line: index, ch: 0,
            message: "tabs and spaces are mixed in this indent - Python will refuse the file",
            severity: "error",
          });
        }
      }
    }

    return problems;
  }

  /* ---------- loading CodeMirror ------------------------------------- */

  const CM_BASE = "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/";
  const PRETTIER_BASE = "https://cdnjs.cloudflare.com/ajax/libs/prettier/2.8.8/";

  const CM_CSS = ["codemirror.min.css", "addon/hint/show-hint.min.css", "addon/fold/foldgutter.min.css"];
  const CM_CORE = "codemirror.min.js";
  const CM_PARTS = [
    "mode/python/python.min.js",
    "mode/clike/clike.min.js",
    "mode/javascript/javascript.min.js",
    "mode/go/go.min.js",
    "mode/rust/rust.min.js",
    "addon/edit/closebrackets.min.js",
    "addon/edit/matchbrackets.min.js",
    "addon/comment/comment.min.js",
    "addon/selection/active-line.min.js",
    "addon/search/searchcursor.min.js",
    "addon/hint/show-hint.min.js",
    "addon/hint/anyword-hint.min.js",
    "addon/fold/foldcode.min.js",
    "addon/fold/foldgutter.min.js",
    "addon/fold/indent-fold.min.js",
    "addon/fold/brace-fold.min.js",
  ];
  const PRETTIER_PARTS = ["standalone.js", "parser-babel.js", "parser-typescript.js"];

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = url;
      el.async = false;
      el.onload = resolve;
      el.onerror = () => reject(new Error("could not load " + url));
      document.head.appendChild(el);
    });
  }

  function loadCss(url) {
    const el = document.createElement("link");
    el.rel = "stylesheet";
    el.href = url;
    document.head.appendChild(el);
  }

  let loading = null;

  function load() {
    if (loading) return loading;
    CM_CSS.forEach((name) => loadCss(CM_BASE + name));
    loading = loadScript(CM_BASE + CM_CORE)
      .then(() => Promise.all(CM_PARTS.map((name) => loadScript(CM_BASE + name))))
      .then(() => Promise.all(PRETTIER_PARTS.map((name) => loadScript(PRETTIER_BASE + name))).catch(() => null))
      .then(() => true)
      .catch((err) => {
        console.warn("[ide] falling back to a plain textarea:", err.message);
        return false;
      });
    return loading;
  }

  /* ---------- the editor handle -------------------------------------- */

  function create(options) {
    const host = options.host;
    const state = {
      lang: options.lang || "python",
      value: options.value || "",
      cm: null,
      textarea: null,
      marks: [],
      errorLines: [],
    };

    host.classList.add("ide-host");
    const textarea = document.createElement("textarea");
    textarea.className = "ide-fallback";
    textarea.value = state.value;
    textarea.spellcheck = false;
    textarea.setAttribute("aria-label", "Solution source code");
    host.appendChild(textarea);
    state.textarea = textarea;

    let changeTimer = null;
    function fireChange() {
      if (!options.onChange) return;
      clearTimeout(changeTimer);
      changeTimer = setTimeout(() => options.onChange(api.getValue()), 180);
    }

    textarea.addEventListener("input", fireChange);

    const api = {
      lang: function () { return state.lang; },

      getValue: function () {
        return state.cm ? state.cm.getValue() : textarea.value;
      },

      setValue: function (text) {
        if (state.cm) {
          const cursor = state.cm.getCursor();
          state.cm.setValue(text);
          try { state.cm.setCursor(cursor); } catch (err) { /* text got shorter */ }
        } else {
          textarea.value = text;
        }
        api.clearErrors();
      },

      setLang: function (langId) {
        state.lang = langId;
        const lang = BY_ID[langId];
        if (state.cm && lang) {
          state.cm.setOption("mode", lang.mode);
          state.cm.setOption("lineComment", lang.comment);
        }
      },

      focus: function () { (state.cm || textarea).focus(); },

      refresh: function () { if (state.cm) state.cm.refresh(); },

      /* structural problems, instantly, with no network involved */
      check: function () {
        return structuralCheck(api.getValue(), state.lang);
      },

      clearErrors: function () {
        state.marks.forEach((mark) => mark.clear());
        state.marks = [];
        if (state.cm) {
          state.errorLines.forEach((line) => {
            state.cm.removeLineClass(line, "background", "ide-error-line");
            state.cm.setGutterMarker(line, "ide-gutter-errors", null);
          });
        }
        state.errorLines = [];
      },

      showErrors: function (problems) {
        api.clearErrors();
        if (!state.cm) return;
        const doc = state.cm.getDoc();
        const lastLine = state.cm.lineCount() - 1;
        problems.forEach((problem) => {
          const line = Math.min(Math.max(0, problem.line), lastLine);
          const text = state.cm.getLine(line) || "";
          const from = { line: line, ch: Math.min(problem.ch || 0, Math.max(0, text.length - 1)) };
          const to = { line: line, ch: text.length || 1 };
          if (to.ch > from.ch) {
            state.marks.push(doc.markText(from, to, {
              className: "ide-squiggle",
              title: problem.message,
            }));
          }
          state.cm.addLineClass(line, "background", "ide-error-line");
          const marker = document.createElement("span");
          marker.className = "ide-gutter-error";
          marker.title = problem.message;
          marker.textContent = "●";
          state.cm.setGutterMarker(line, "ide-gutter-errors", marker);
          state.errorLines.push(line);
        });
      },

      format: function () {
        const before = api.getValue();
        const after = window.ELKFMT.format(before, state.lang);
        if (after !== before) api.setValue(after);
        return after !== before;
      },

      onKey: function (name, handler) {
        (api._keys = api._keys || {})[name] = handler;
        if (state.cm) {
          const map = {};
          map[name] = handler;
          state.cm.addKeyMap(map);
        }
      },
    };

    load().then((ok) => {
      if (!ok || !window.CodeMirror) return;
      const lang = BY_ID[state.lang] || BY_ID.python;
      const cm = window.CodeMirror.fromTextArea(textarea, {
        mode: lang.mode,
        theme: "elk",
        lineNumbers: true,
        lineWrapping: false,
        indentUnit: 4,
        tabSize: 4,
        indentWithTabs: false,
        smartIndent: true,
        autoCloseBrackets: true,
        matchBrackets: true,
        styleActiveLine: true,
        foldGutter: true,
        lineComment: lang.comment,
        gutters: ["CodeMirror-linenumbers", "ide-gutter-errors", "CodeMirror-foldgutter"],
        extraKeys: {
          Tab: function (editor) {
            if (editor.somethingSelected()) editor.indentSelection("add");
            else editor.replaceSelection("    ", "end");
          },
          "Shift-Tab": function (editor) { editor.indentSelection("subtract"); },
          "Ctrl-/": function (editor) { editor.toggleComment({ indent: true }); },
          "Cmd-/": function (editor) { editor.toggleComment({ indent: true }); },
          "Ctrl-Space": function (editor) { showHints(editor, state.lang); },
        },
      });
      cm.setSize("100%", options.height || "100%");
      state.cm = cm;
      cm.on("change", function (editor, change) {
        fireChange();
        if (change.origin !== "setValue" && options.autoHint !== false) queueHints(editor, state.lang);
      });
      if (api._keys) cm.addKeyMap(api._keys);
      if (options.onReady) options.onReady(api);
    });

    return api;
  }

  /* ---------- completion --------------------------------------------- */

  let hintTimer = null;

  function queueHints(editor, langId) {
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () {
      const cursor = editor.getCursor();
      const line = editor.getLine(cursor.line) || "";
      const before = line.slice(0, cursor.ch);
      if (!/[A-Za-z_][A-Za-z0-9_]{1,}$/.test(before)) return;
      if (editor.state.completionActive) return;
      showHints(editor, langId, true);
    }, 320);
  }

  function showHints(editor, langId, quiet) {
    if (!window.CodeMirror || !window.CodeMirror.showHint) return;
    const words = hintsFor(langId);
    window.CodeMirror.showHint(editor, function (cm) {
      const cursor = cm.getCursor();
      const line = cm.getLine(cursor.line) || "";
      const start = /[A-Za-z_][A-Za-z0-9_]*$/.exec(line.slice(0, cursor.ch));
      const token = start ? start[0] : "";
      const seen = Object.create(null);
      const list = [];

      /* words already in this file first - they are the ones you meant */
      const local = (cm.getValue().match(/[A-Za-z_][A-Za-z0-9_]{2,}/g) || []);
      local.concat(words).forEach(function (word) {
        if (seen[word] || word === token) return;
        if (token && word.lastIndexOf(token, 0) !== 0) return;
        seen[word] = true;
        list.push(word);
      });

      return {
        list: list.slice(0, 40),
        from: window.CodeMirror.Pos(cursor.line, cursor.ch - token.length),
        to: cursor,
      };
    }, { completeSingle: false, closeOnUnfocus: true, alignWithWord: true, container: null });
  }

  /* ---------- a real parse, where one is available ------------------- */

  /* Prettier is already loaded to format JavaScript and TypeScript, and its
     parser reports the line and column of a syntax error, which `new Function`
     does not. Returns null for languages nothing here can parse - the caller
     then falls back to the structural check, or to CPython for Python. */
  function parseCheck(code, langId) {
    const parser = { javascript: "babel", typescript: "typescript" }[langId];
    if (!parser || !window.prettier || !window.prettierPlugins) return null;
    try {
      window.prettier.format(code, { parser: parser, plugins: window.prettierPlugins });
      return [];
    } catch (err) {
      const start = (err.loc && err.loc.start) || err.loc || {};
      return [{
        line: Math.max(0, (start.line || 1) - 1),
        ch: Math.max(0, (start.column || 1) - 1),
        message: String(err.message || err).split(String.fromCharCode(10))[0]
          .replace(/\s*\(\d+:\d+\)\s*$/, ""),
        severity: "error",
      }];
    }
  }

  window.ELKIDE = {
    LANGS: LANGS,
    parseCheck: parseCheck,
    byId: BY_ID,
    create: create,
    load: load,
    structuralCheck: structuralCheck,
  };
})();
