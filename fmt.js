/* fmt.js - the "make it pretty" button.
 *
 * Prettier can be handed the JavaScript and TypeScript. Nothing on a CDN
 * formats Python or C++ in the browser, so those are written out here. Both
 * work the same way: tokenise properly, so strings and comments are never
 * touched, then re-emit with one spacing rule per token pair. Nothing here
 * parses - a formatter that cannot parse still has to leave working code
 * working, so every rule is local and deliberately conservative.
 *
 *   ELKFMT.format(code, lang) -> formatted source, or throws.
 */

(function () {
  "use strict";

  const OPEN = { "(": ")", "[": "]", "{": "}" };
  const CLOSE = new Set([")", "]", "}"]);

  /* ==================================================================
     Python
     ================================================================== */

  const PY_KEYWORDS = new Set([
    "False", "None", "True", "and", "as", "assert", "async", "await", "break",
    "class", "continue", "def", "del", "elif", "else", "except", "finally",
    "for", "from", "global", "if", "import", "in", "is", "lambda", "nonlocal",
    "not", "or", "pass", "raise", "return", "try", "while", "with", "yield",
  ]);

  const PY_LITERAL_KW = new Set(["None", "True", "False"]);

  const PY_OPS = [
    "**=", "//=", ">>=", "<<=", "...", "!=", ">=", "<=", "==", "->", ":=",
    "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "@=", "**", "//", "<<", ">>",
    "+", "-", "*", "/", "%", "@", "&", "|", "^", "~", "<", ">", "=", ",", ":",
    ".", ";", "(", ")", "[", "]", "{", "}",
  ];

  /* nothing goes between these and whatever follows */
  const PY_TIGHT_AFTER = new Set(["(", "[", "{", ".", "~", "**"]);

  function pyTokenise(src) {
    const out = [];
    let i = 0;
    const n = src.length;
    let atLineStart = true;
    let depth = 0;

    while (i < n) {
      const c = src[i];

      if (c === "\n") {
        out.push({ t: "nl" });
        i++;
        atLineStart = true;
        continue;
      }

      if (atLineStart) {
        let j = i;
        let col = 0;
        while (j < n && (src[j] === " " || src[j] === "\t")) {
          col += src[j] === "\t" ? 8 - (col % 8) : 1;
          j++;
        }
        out.push({ t: "indent", col: col });
        i = j;
        atLineStart = false;
        continue;
      }

      if (c === " " || c === "\t" || c === "\r") { i++; continue; }

      if (c === "\\" && src[i + 1] === "\n") {
        out.push({ t: "nl", joined: true });
        i += 2;
        atLineStart = true;
        continue;
      }

      if (c === "#") {
        let j = i;
        while (j < n && src[j] !== "\n") j++;
        out.push({ t: "comment", v: src.slice(i, j).replace(/\s+$/, "") });
        i = j;
        continue;
      }

      /* a string, with any prefix letters in front of the quote */
      const head = src.slice(i, i + 6);
      const strm = /^([rRbBuUfF]{0,3})("""|'''|"|')/.exec(head);
      if (strm) {
        const prefix = strm[1];
        const quote = strm[2];
        let j = i + prefix.length + quote.length;
        while (j < n) {
          if (src[j] === "\\") { j += 2; continue; }
          if (src.startsWith(quote, j)) { j += quote.length; break; }
          if (quote.length === 1 && src[j] === "\n") break; /* unterminated */
          j++;
        }
        out.push({
          t: "str", v: src.slice(i, j), quote: quote,
          triple: quote.length === 3, prefix: prefix,
        });
        i = j;
        continue;
      }

      if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] || ""))) {
        const m = /^(?:0[xXoObB][0-9a-fA-F_]+|(?:[0-9][0-9_]*)?\.?[0-9][0-9_]*(?:[eE][-+]?[0-9_]+)?[jJ]?)/.exec(src.slice(i));
        if (m) { out.push({ t: "num", v: m[0] }); i += m[0].length; continue; }
      }

      if (/[A-Za-z_-￿]/.test(c)) {
        let j = i;
        while (j < n && /[A-Za-z0-9_-￿]/.test(src[j])) j++;
        const word = src.slice(i, j);
        out.push({ t: PY_KEYWORDS.has(word) ? "kw" : "name", v: word });
        i = j;
        continue;
      }

      let op = null;
      for (let k = 0; k < PY_OPS.length; k++) {
        if (src.startsWith(PY_OPS[k], i)) { op = PY_OPS[k]; break; }
      }
      if (op) {
        out.push({ t: "op", v: op });
        i += op.length;
        continue;
      }

      out.push({ t: "other", v: c });
      i++;
    }
    return out;
  }

  /* single quotes become double, but only where that costs no new escapes */
  function pyQuoteText(tok) {
    if (tok.quote !== "'" || /r/i.test(tok.prefix)) return tok.v;
    const q = tok.quote;
    if (!tok.v.endsWith(q) || tok.v.length < tok.prefix.length + 2 * q.length) return tok.v;
    const body = tok.v.slice(tok.prefix.length + q.length, tok.v.length - q.length);
    if (body.indexOf('"') !== -1) return tok.v;
    const unescaped = body.replace(/\\'/g, "'");
    if (unescaped.indexOf('"') !== -1) return tok.v;
    const nq = tok.triple ? '"""' : '"';
    return tok.prefix + nq + unescaped + nq;
  }

  function pyUnaryContext(prev) {
    if (!prev) return true;
    if (prev.t === "op") return !CLOSE.has(prev.v);
    if (prev.t === "kw") return !PY_LITERAL_KW.has(prev.v);
    return false;
  }

  /* one logical line, re-spaced */
  function pySpaceLine(tokens) {
    /* per-bracket state: `=` inside a call loses its spaces but `=` in a
       statement keeps them, and `:` needs to know dict from slice */
    const stack = [{ kind: "top", sawColon: false, sawLambda: false }];
    const parts = [];
    let prev = null;

    function emit(text, glue) {
      if (parts.length && !glue) parts.push(" ");
      parts.push(text);
    }
    function tightLeft() {
      if (!prev) return true;
      if (prev.noSpaceAfter) return true;
      return prev.t === "op" && PY_TIGHT_AFTER.has(prev.v);
    }

    for (let i = 0; i < tokens.length; i++) {
      const tk = tokens[i];

      if (tk.t === "comment") {
        const body = tk.v.replace(/^(#+)(?![\s!#])/, "$1 ");
        if (parts.length) parts.push("  ");
        parts.push(body);
        prev = { t: "comment" };
        continue;
      }

      if (tk.t === "str") {
        emit(pyQuoteText(tk), tightLeft());
        prev = tk;
        continue;
      }

      if (tk.t === "op") {
        const v = tk.v;
        const top = stack[stack.length - 1];

        if (OPEN[v]) {
          let glue;
          if (tightLeft()) glue = true;
          else if (v === "{") glue = false;
          else {
            glue = !!prev && (prev.t === "name" || prev.t === "num" || prev.t === "str" ||
              (prev.t === "op" && CLOSE.has(prev.v)) ||
              (prev.t === "kw" && PY_LITERAL_KW.has(prev.v)));
          }
          const kind = v === "(" ? "paren" : v === "[" ? "brack" : "brace";
          stack.push({ kind: kind, sawColon: false, sawLambda: false });
          emit(v, glue);
          prev = { t: "op", v: v, noSpaceAfter: true };
          continue;
        }

        if (CLOSE.has(v)) {
          if (stack.length > 1) stack.pop();
          emit(v, true);
          prev = { t: "op", v: v };
          continue;
        }

        if (v === ",") {
          top.sawColon = false;
          emit(v, true);
          prev = { t: "op", v: v };
          continue;
        }

        if (v === ":") {
          if (top.kind === "brack") {
            /* a slice wants no air at all */
            emit(v, true);
            prev = { t: "op", v: v, noSpaceAfter: true };
          } else {
            /* block, dict entry, annotation: tight left, one space right */
            top.sawColon = true;
            emit(v, true);
            prev = { t: "op", v: v };
          }
          continue;
        }

        if (v === "=") {
          /* keyword argument or bare default: no air. An annotated default
             keeps it, which is what PEP 8 asks for. */
          const tight = top.kind === "paren" && !top.sawColon && !top.sawLambda;
          emit(v, tight);
          prev = { t: "op", v: v, noSpaceAfter: tight };
          continue;
        }

        if (v === "." || v === ";") {
          emit(v, true);
          prev = { t: "op", v: v, noSpaceAfter: v === "." };
          continue;
        }

        if (v === "@" && !prev) { /* decorator */
          emit(v, true);
          prev = { t: "op", v: v, noSpaceAfter: true };
          continue;
        }

        if ((v === "*" || v === "**") && pyUnaryContext(prev)) {
          emit(v, tightLeft());
          prev = { t: "op", v: v, noSpaceAfter: true };
          continue;
        }

        if (v === "**") { /* exponent, set tight per PEP 8 */
          emit(v, true);
          prev = { t: "op", v: v, noSpaceAfter: true };
          continue;
        }

        if ((v === "-" || v === "+" || v === "~") && pyUnaryContext(prev)) {
          emit(v, tightLeft());
          prev = { t: "op", v: v, noSpaceAfter: true };
          continue;
        }

        emit(v, false); /* every other operator is binary */
        prev = { t: "op", v: v };
        continue;
      }

      if (tk.t === "kw" && tk.v === "lambda") stack[stack.length - 1].sawLambda = true;

      emit(tk.v, tightLeft());
      prev = tk;
    }

    return parts.join("").replace(/[ \t]+$/, "");
  }

  function pyFormat(src) {
    if (!src.trim()) return "";
    const tokens = pyTokenise(src.replace(/\r\n?/g, "\n"));

    /* physical lines, with bracketed and backslashed continuations folded in */
    const lines = [];
    let cur = { indent: 0, toks: [] };
    let depth = 0;

    for (let i = 0; i < tokens.length; i++) {
      const tk = tokens[i];
      if (tk.t === "indent") {
        if (!cur.toks.length && depth === 0) cur.indent = tk.col;
        continue;
      }
      if (tk.t === "nl") {
        if (depth > 0 || tk.joined) continue;
        lines.push(cur);
        cur = { indent: 0, toks: [] };
        continue;
      }
      if (tk.t === "op" && OPEN[tk.v]) depth++;
      else if (tk.t === "op" && CLOSE.has(tk.v)) depth = Math.max(0, depth - 1);
      cur.toks.push(tk);
    }
    if (cur.toks.length) lines.push(cur);

    /* Map the distinct indent columns onto depths. This normalises tabs and
       two-space code to four without needing to know where blocks start. */
    const levels = [0];
    const out = [];
    let pendingBlank = 0;
    let prevLevel = 0;
    let started = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.toks.length) { if (started) pendingBlank++; continue; }

      while (levels.length > 1 && line.indent < levels[levels.length - 1]) levels.pop();
      if (line.indent > levels[levels.length - 1]) levels.push(line.indent);
      const level = levels.length - 1;

      const text = pySpaceLine(line.toks);
      if (!text) continue;

      const first = line.toks[0];
      const isDecorator = first.t === "op" && first.v === "@";
      const isDefLine = first.t === "kw" && (first.v === "def" || first.v === "class" ||
        (first.v === "async" && line.toks[1] && line.toks[1].v === "def"));
      const wantsGap = isDecorator || isDefLine;
      const afterDecorator = out.length > 0 && /^\s*@/.test(out[out.length - 1]);
      const justOpenedBlock = started && level > prevLevel;

      if (started) {
        const cap = level === 0 ? 2 : 1;
        let blanks = Math.min(pendingBlank, cap);
        if (wantsGap && !afterDecorator && !justOpenedBlock) blanks = cap;
        for (let k = 0; k < blanks; k++) out.push("");
      }
      pendingBlank = 0;
      started = true;
      prevLevel = level;

      out.push("    ".repeat(level) + text);
    }

    return out.join("\n").replace(/[ \t]+$/gm, "") + "\n";
  }

  /* ==================================================================
     C, C++, Java, C#, Go, Rust - one brace-driven pass
     ================================================================== */

  const C_KEYWORDS = new Set([
    "if", "else", "for", "while", "switch", "case", "default", "do", "return",
    "try", "catch", "finally", "new", "delete", "throw", "using", "namespace",
    "struct", "class", "enum", "union", "template", "typename", "public",
    "private", "protected", "static", "const", "auto", "void", "int", "long",
    "float", "double", "char", "bool", "unsigned", "signed", "short", "size_t",
    "func", "let", "mut", "fn", "match", "impl", "pub", "where", "go", "defer",
    "range", "var", "type", "interface", "extends", "implements", "final",
    "break", "continue", "sizeof", "nullptr", "true", "false", "null", "this",
  ]);

  /* words that read as a type, so `Type* p` beats `Type * p` */
  const C_TYPE_WORDS = new Set([
    "int", "char", "void", "double", "float", "long", "short", "bool", "auto",
    "unsigned", "signed", "const", "size_t", "string", "wchar_t", "uint64_t",
    "int64_t", "uint32_t", "int32_t",
  ]);

  /* names that take angle brackets, so `vector<int>` beats `vector < int >` */
  const C_TEMPLATE_WORDS = new Set([
    "vector", "map", "set", "unordered_map", "unordered_set", "pair", "tuple",
    "array", "deque", "queue", "stack", "priority_queue", "list", "multiset",
    "multimap", "unique_ptr", "shared_ptr", "weak_ptr", "function", "optional",
    "variant", "initializer_list", "complex", "valarray", "bitset", "span",
  ]);

  const C_OPS = [
    "<<=", ">>=", "...", "&&=", "||=",
    "==", "!=", "<=", ">=", "&&", "||", "<<", ">>", "++", "--", "->", "::", "=>",
    "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=",
    "+", "-", "*", "/", "%", "=", "<", ">", "!", "~", "&", "|", "^", "?", ":",
    ",", ";", ".", "(", ")", "[", "]", "{", "}", "#", "@",
  ];

  function cTokenise(src) {
    const out = [];
    let i = 0;
    const n = src.length;
    let lineStart = true;

    while (i < n) {
      const c = src[i];

      if (c === "\n") { out.push({ t: "nl" }); i++; lineStart = true; continue; }
      if (c === " " || c === "\t" || c === "\r") { i++; continue; }

      if (c === "/" && src[i + 1] === "/") {
        let j = i;
        while (j < n && src[j] !== "\n") j++;
        out.push({ t: "comment", v: src.slice(i, j).replace(/\s+$/, ""), line: true });
        i = j;
        lineStart = false;
        continue;
      }
      if (c === "/" && src[i + 1] === "*") {
        const end = src.indexOf("*/", i + 2);
        const j = end === -1 ? n : end + 2;
        out.push({ t: "comment", v: src.slice(i, j), line: false });
        i = j;
        lineStart = false;
        continue;
      }
      if (c === "#" && lineStart) {
        let j = i;
        while (j < n && !(src[j] === "\n" && src[j - 1] !== "\\")) j++;
        out.push({ t: "pre", v: src.slice(i, j).replace(/\s+$/, "") });
        i = j;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        let j = i + 1;
        while (j < n) {
          if (src[j] === "\\") { j += 2; continue; }
          if (src[j] === c) { j++; break; }
          if (src[j] === "\n" && c !== "`") break;
          j++;
        }
        out.push({ t: "str", v: src.slice(i, j) });
        i = j;
        lineStart = false;
        continue;
      }
      if (/[0-9]/.test(c)) {
        const m = /^(?:0[xXbB][0-9a-fA-F_]+|[0-9][0-9_]*\.?[0-9_]*(?:[eE][-+]?[0-9]+)?)[uUlLfF]*/.exec(src.slice(i));
        if (m) { out.push({ t: "num", v: m[0] }); i += m[0].length; lineStart = false; continue; }
      }
      if (/[A-Za-z_$]/.test(c)) {
        let j = i;
        while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++;
        const w = src.slice(i, j);
        out.push({ t: C_KEYWORDS.has(w) ? "kw" : "name", v: w });
        i = j;
        lineStart = false;
        continue;
      }
      let op = null;
      for (let k = 0; k < C_OPS.length; k++) {
        if (src.startsWith(C_OPS[k], i)) { op = C_OPS[k]; break; }
      }
      if (op) { out.push({ t: "op", v: op }); i += op.length; lineStart = false; continue; }
      out.push({ t: "other", v: c });
      i++;
      lineStart = false;
    }
    return out;
  }

  function cUnaryContext(prev) {
    if (!prev) return true;
    if (prev.t === "op") return ![")", "]", "}"].includes(prev.v);
    if (prev.t === "kw") return ["return", "case", "throw", "new", "delete"].includes(prev.v);
    return false;
  }

  function cTypeish(tok) {
    if (!tok) return false;
    if (tok.t === "kw") return C_TYPE_WORDS.has(tok.v);
    if (tok.t === "name") return /^[A-Z]/.test(tok.v) || C_TEMPLATE_WORDS.has(tok.v);
    return tok.t === "op" && (tok.v === ">" || tok.v === ">>");
  }

  function cSpaceLine(toks) {
    const parts = [];
    let prev = null;
    let tmpl = 0;

    function emit(text, glue) {
      if (parts.length && !glue) parts.push(" ");
      parts.push(text);
    }
    function tightLeft() {
      return !prev || !!prev.noSpaceAfter;
    }

    for (let i = 0; i < toks.length; i++) {
      const tk = toks[i];
      const next = toks[i + 1];

      if (tk.t === "comment") {
        if (parts.length) parts.push("  ");
        parts.push(tk.v);
        prev = { t: "comment" };
        continue;
      }

      if (tk.t !== "op") {
        emit(tk.v, tightLeft());
        prev = tk;
        continue;
      }

      const v = tk.v;

      if (v === "(" || v === "[") {
        let glue = tightLeft();
        if (!glue) {
          glue = !!prev && (prev.t === "name" || prev.t === "num" || prev.t === "str" ||
            (prev.t === "op" && [")", "]", ">", "::", ".", "->"].includes(prev.v)));
          /* control keywords keep the space: `if (`, not `if(` */
          if (prev && prev.t === "kw" && !["return", "throw", "new", "delete", "case"].includes(prev.v)) {
            glue = ["if", "for", "while", "switch", "catch"].includes(prev.v) ? false : true;
          }
        }
        emit(v, glue);
        prev = { t: "op", v: v, noSpaceAfter: true };
        continue;
      }
      if (v === ")" || v === "]") { emit(v, true); prev = { t: "op", v: v }; continue; }
      if (v === "{") { emit(v, tightLeft()); prev = { t: "op", v: v, noSpaceAfter: true }; continue; }
      if (v === "}") { emit(v, true); prev = { t: "op", v: v }; continue; }
      if (v === "," || v === ";") { emit(v, true); prev = { t: "op", v: v }; continue; }
      if (v === "." || v === "->" || v === "::") {
        emit(v, true);
        prev = { t: "op", v: v, noSpaceAfter: true };
        continue;
      }
      if (v === "++" || v === "--") {
        const postfix = !!prev && (prev.t === "name" || (prev.t === "op" && [")", "]"].includes(prev.v)));
        emit(v, true);
        prev = { t: "op", v: v, noSpaceAfter: !postfix };
        continue;
      }
      if (v === "!" || v === "~") {
        emit(v, tightLeft());
        prev = { t: "op", v: v, noSpaceAfter: true };
        continue;
      }
      if (v === "#" || v === "@") {
        emit(v, tightLeft());
        prev = { t: "op", v: v, noSpaceAfter: true };
        continue;
      }
      if (v === "<" && cTypeish(prev) && next &&
          (next.t === "name" || next.t === "kw" || (next.t === "op" && (next.v === ">" || next.v === ">>")))) {
        tmpl++;
        emit(v, true);
        prev = { t: "op", v: v, noSpaceAfter: true };
        continue;
      }
      if ((v === ">" || v === ">>") && tmpl > 0) {
        tmpl = Math.max(0, tmpl - (v === ">>" ? 2 : 1));
        emit(v, true);
        prev = { t: "op", v: v };
        continue;
      }
      if ((v === "*" || v === "&") && cTypeish(prev) && next &&
          (next.t === "name" || (next.t === "op" && (next.v === "*" || next.v === "&")))) {
        /* a declaration: `TreeNode* root`, `int** grid` */
        emit(v, true);
        prev = { t: "op", v: v, noSpaceAfter: next.t === "op" };
        continue;
      }
      if ((v === "*" || v === "&" || v === "-" || v === "+") && cUnaryContext(prev)) {
        emit(v, tightLeft());
        prev = { t: "op", v: v, noSpaceAfter: true };
        continue;
      }
      if (v === ":") {
        const isLabel = i === toks.length - 1;
        emit(v, isLabel || (!!prev && prev.t === "op" && prev.v === ":"));
        prev = { t: "op", v: v, noSpaceAfter: isLabel };
        continue;
      }

      emit(v, false);
      prev = { t: "op", v: v };
    }
    return parts.join("").replace(/[ \t]+$/, "");
  }

  function cFormat(src, lang) {
    const toks = cTokenise(src.replace(/\r\n?/g, "\n"));
    const usesSemicolons = lang !== "go";

    const lines = [];
    let cur = [];
    let paren = 0;      /* () and [] depth - a `for (;;)` must not split */
    let braces = 0;
    let nlRun = 0;
    const braceKind = [];   /* "block" or "init" for each open brace */

    function push() {
      if (cur.length) { lines.push({ toks: cur, indent: braces }); cur = []; }
    }

    for (let i = 0; i < toks.length; i++) {
      const tk = toks[i];

      if (tk.t === "nl") {
        nlRun++;
        if (!cur.length && nlRun >= 2 && lines.length && !lines[lines.length - 1].blank) {
          lines.push({ blank: true });
        }
        continue;
      }

      if (tk.t === "pre") {
        push();
        lines.push({ toks: [tk], indent: 0, pre: true });
        nlRun = 0;
        continue;
      }

      if (tk.t === "comment" && tk.line) {
        /* a trailing comment stays on the line it trailed */
        if (!cur.length && nlRun === 0 && lines.length && !lines[lines.length - 1].blank &&
            !lines[lines.length - 1].pre) {
          lines[lines.length - 1].toks.push(tk);
        } else {
          cur.push(tk);
          push();
        }
        nlRun = 0;
        continue;
      }
      nlRun = 0;

      if (tk.t === "op" && (tk.v === "(" || tk.v === "[")) paren++;
      if (tk.t === "op" && (tk.v === ")" || tk.v === "]")) paren = Math.max(0, paren - 1);

      if (tk.t === "op" && tk.v === "{" && paren === 0) {
        /* `return {a, b}` and `= {1, 2}` are values, not blocks */
        const before = cur.length ? cur[cur.length - 1] : null;
        const isInit = braceKind[braceKind.length - 1] === "init" ||
          (before && ((before.t === "op" && ["=", ",", "(", "[", ":", "{", "]"].includes(before.v)) ||
                      (before.t === "kw" && ["return", "new"].includes(before.v))));
        braceKind.push(isInit ? "init" : "block");
        cur.push(tk);
        if (isInit) continue;
        push();
        braces++;
        continue;
      }
      if (tk.t === "op" && tk.v === "}" && paren === 0) {
        if (braceKind[braceKind.length - 1] === "init") {
          braceKind.pop();
          cur.push(tk);
          continue;
        }
        braceKind.pop();
        push();
        braces = Math.max(0, braces - 1);
        const line = { toks: [tk], indent: braces };
        const nxt = toks[i + 1];
        if (nxt && ((nxt.t === "kw" && ["else", "catch", "finally", "while"].includes(nxt.v)) ||
                    (nxt.t === "op" && (nxt.v === ";" || nxt.v === "," || nxt.v === ")")))) {
          line.glueNext = true;
        }
        lines.push(line);
        continue;
      }
      if (tk.t === "op" && tk.v === ":" && paren === 0 && cur.length &&
          braceKind[braceKind.length - 1] !== "init") {
        const head = cur[0];
        const isAccess = cur.length === 1 && head.t === "kw" &&
          ["public", "private", "protected"].includes(head.v);
        const isCase = head.t === "kw" && (head.v === "case" || head.v === "default");
        if (isAccess || isCase) {
          cur.push(tk);
          push();
          /* an access specifier sits half a step out from its members */
          if (isAccess && lines.length) lines[lines.length - 1].indent = Math.max(0, braces - 1);
          continue;
        }
      }
      if (tk.t === "op" && tk.v === ";" && paren === 0 && usesSemicolons) {
        cur.push(tk);
        push();
        continue;
      }
      cur.push(tk);
    }
    push();

    /* fold `}` + `else {` back onto one line */
    const merged = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const last = merged[merged.length - 1];
      if (last && last.glueNext && !line.blank && !line.pre) {
        last.toks = last.toks.concat(line.toks);
        last.glueNext = line.glueNext;
        continue;
      }
      merged.push(line);
    }

    const out = [];
    for (let i = 0; i < merged.length; i++) {
      const line = merged[i];
      if (line.blank) {
        if (out.length && out[out.length - 1] !== "") out.push("");
        continue;
      }
      if (line.pre) { out.push(line.toks[0].v); continue; }
      const text = cSpaceLine(line.toks);
      if (text) out.push("    ".repeat(line.indent) + text);
    }
    while (out.length && out[out.length - 1] === "") out.pop();
    return out.join("\n").replace(/[ \t]+$/gm, "") + "\n";
  }

  /* ==================================================================
     public face
     ================================================================== */

  const PRETTIER_PARSER = { javascript: "babel", typescript: "typescript" };

  function format(code, lang) {
    if (PRETTIER_PARSER[lang]) {
      if (!window.prettier || !window.prettierPlugins) {
        throw new Error("the formatter is still loading - try again in a second");
      }
      return window.prettier.format(code, {
        parser: PRETTIER_PARSER[lang],
        plugins: window.prettierPlugins,
        printWidth: 88,
        tabWidth: 2,
        semi: true,
        singleQuote: false,
        trailingComma: "es5",
        bracketSpacing: true,
        arrowParens: "always",
      });
    }
    if (lang === "python") return pyFormat(code);
    return cFormat(code, lang);
  }

  window.ELKFMT = {
    format: format,
    python: pyFormat,
    clike: cFormat,
    tokenisePython: pyTokenise,
  };
})();
