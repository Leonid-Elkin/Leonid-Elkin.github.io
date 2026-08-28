/* solutions.js - the solved-problems index, driven twice.
 *
 * Project Euler and LeetCode are the same page: a column of problem numbers
 * on the left, the solution beside it on the right. The only differences are
 * where the statement link points and whether a problem has more than one
 * language, so both pages load this and it reads whichever data file is there.
 *
 * This page shows work that is already written. It is not an editor and keeps
 * no score - it is the index to a folder in this repo, generated from that
 * folder rather than maintained by hand.
 */

(function () {
  "use strict";

  const set = window.LEETCODE || window.EULER;
  const pick = document.getElementById("euler-pick");
  if (!set || !pick) return;

  const track = set.track;
  const data = (set.problems || []).slice().sort((a, b) => a.n - b.n);

  const num = document.getElementById("euler-num");
  const title = document.getElementById("euler-title");
  const facts = document.getElementById("euler-facts");
  const code = document.querySelector("#euler-code code");
  const count = document.getElementById("euler-count");
  const prev = document.getElementById("euler-prev");
  const next = document.getElementById("euler-next");
  const tabs = document.getElementById("euler-langs");
  const view = document.querySelector(".euler-view");

  const DIFF = { 1: "Easy", 2: "Medium", 3: "Hard" };
  const RUNS = { python: true, javascript: true };

  /* An empty folder is a fair state to be in - say so, rather than render a
     blank frame and leave the reader to work out whether it is broken. */
  if (!data.length) {
    const empty = document.createElement("p");
    empty.className = "setup";
    empty.textContent = track === "leetcode"
      ? "Nothing here yet. Solutions appear as they are added to the LeetCode folder in this repo."
      : "Nothing here yet.";
    if (view) view.replaceChildren(empty);
    pick.remove();
    if (count) count.textContent = "no problems";
    return;
  }

  if (count) {
    count.textContent = data.length + (data.length === 1 ? " problem" : " problems");
  }

  const buttons = data.map((p) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "euler-btn";
    b.textContent = String(p.n);
    b.setAttribute("role", "option");
    b.title = p.title ? p.n + ". " + p.title : "Problem " + p.n;
    b.addEventListener("click", () => show(p.n, true));
    pick.appendChild(b);
    return b;
  });

  /* ---------- little builders ---------- */

  function fact(key, value) {
    const row = document.createElement("div");
    const dt = document.createElement("dt");
    dt.className = "k";
    dt.textContent = key;
    const dd = document.createElement("dd");
    if (typeof value === "string") dd.textContent = value;
    else dd.appendChild(value);
    row.append(dt, dd);
    return row;
  }

  function link(text, href, download) {
    const a = document.createElement("a");
    a.textContent = text;
    a.href = href;
    if (/^https?:/.test(href)) { a.target = "_blank"; a.rel = "noopener"; }
    else if (download) a.setAttribute("download", "");
    return a;
  }

  function statementLink(p) {
    return track === "leetcode"
      ? link("leetcode.com/problems/" + p.slug,
        "https://leetcode.com/problems/" + p.slug + "/")
      : link("projecteuler.net/problem=" + p.n,
        "https://projecteuler.net/problem=" + p.n);
  }

  /* ---------- colouring ----------

     Enough of a tokeniser to tell keywords, strings, numbers and comments
     apart in the languages the folders actually contain. It is deliberately
     not a parser: it colours, and where it cannot be sure it leaves the text
     as plain ink rather than guessing wrong in a bright colour. */

  const WORDS = {
    python: "and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield True False None self print range len int str list dict set sum max min abs sorted enumerate zip map filter open",
    c: "auto break case char const continue default do double else enum extern float for goto if inline int long register return short signed sizeof static struct switch typedef union unsigned void volatile while NULL true false",
    cpp: "auto bool break case catch char class const constexpr continue default delete do double else enum explicit extern false float for friend goto if inline int long namespace new nullptr operator private protected public return short signed sizeof static struct switch template this throw true try typedef typename union unsigned using virtual void volatile while vector string map set pair queue stack",
    java: "abstract boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new null package private protected public return short static super switch synchronized this throw throws transient true false try void volatile while String System",
    csharp: "abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using virtual void volatile while var",
    javascript: "async await break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new null return static super switch this throw true false try typeof var void while yield of console Math JSON Number String Array Object Map Set Promise",
    typescript: "abstract any as async await boolean break case catch class const constructor continue declare default delete do else enum export extends false finally for from function if implements import in instanceof interface let new null number private protected public readonly return static string super switch this throw true try type typeof var void while yield console Math JSON",
    go: "break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var nil true false make new len cap append string int float64 error",
    rust: "as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while String Vec Option Some None Result Ok Err usize i32 i64 u32 u64",
    ruby: "alias and begin break case class def defined do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield puts",
    kotlin: "as break class continue do else false for fun if in interface is null object package return super this throw true try typealias val var when while private public internal override data",
    swift: "associatedtype class deinit enum extension fileprivate func import init inout internal let open operator private protocol public struct subscript typealias var break case continue default defer do else fallthrough for guard if in repeat return switch where while as false is nil self super true try print",
    sql: "select from where group by having order limit offset join inner left right outer full on as union all distinct insert into values update set delete create table drop alter index and or not null is in between like case when then else end count sum avg min max",
    shell: "if then else elif fi for while do done case esac function return in local export echo read set unset shift exit",
  };

  const HASH_COMMENT = { python: true, ruby: true, shell: true };
  const KEYWORDS = {};
  Object.keys(WORDS).forEach((lang) => {
    KEYWORDS[lang] = new Set(WORDS[lang].split(" "));
  });

  const PY_TOKEN = /(#.*)|("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b)|(\b(?:def|class)\s+)([A-Za-z_]\w*)|([A-Za-z_]\w*)/g;
  const C_TOKEN = /(\/\/.*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?[fFlLuU]*\b)|(\b(?:fn|func|function|class|struct|interface)\s+)([A-Za-z_]\w*)|([A-Za-z_]\w*)/g;
  const SQL_TOKEN = /(--.*)|("(?:[^"\n])*"|'(?:''|[^'\n])*')|(\b\d+(?:\.\d+)?\b)|(\b(?:procedure|function)\s+)([A-Za-z_]\w*)|([A-Za-z_]\w*)/g;

  function tokenFor(lang) {
    if (HASH_COMMENT[lang]) return PY_TOKEN;
    if (lang === "sql") return SQL_TOKEN;
    return C_TOKEN;
  }

  function highlight(source, into, lang) {
    const words = KEYWORDS[lang] || KEYWORDS.python;
    const pattern = tokenFor(lang);
    const push = (text, className) => {
      if (!text) return;
      if (!className) return into.append(text);
      const span = document.createElement("span");
      span.className = className;
      span.textContent = text;
      into.appendChild(span);
    };
    let last = 0;
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(source))) {
      push(source.slice(last, match.index));
      /* Every pattern above exposes the same six groups in the same order:
         comment, string, number, a defining keyword, the name it defines, and
         any other bare word. They have to stay aligned - when SQL had its two
         string forms as separate groups, every language lost its class names. */
      if (match[1]) push(match[1], "tk-com");
      else if (match[2]) push(match[2], "tk-str");
      else if (match[3]) push(match[3], "tk-num");
      else if (match[4]) { push(match[4], "tk-kw"); push(match[5], "tk-def"); }
      else {
        const word = match[6];
        const key = lang === "sql" ? String(word).toLowerCase() : word;
        push(word, words.has(key) ? "tk-kw" : null);
      }
      last = pattern.lastIndex;
      /* a zero-width match would spin here forever */
      if (pattern.lastIndex === match.index) pattern.lastIndex++;
    }
    push(source.slice(last));
  }

  /* the source untouched, with a line-number gutter beside it */
  function renderCode(source, lang) {
    code.textContent = "";
    const lines = source.replace(/\s+$/, "").split("\n");
    const pad = String(lines.length).length;
    lines.forEach((line, index) => {
      const row = document.createElement("span");
      row.className = "ln";
      const gutter = document.createElement("span");
      gutter.className = "n";
      gutter.textContent = String(index + 1).padStart(pad, " ");
      row.appendChild(gutter);
      highlight(line, row, lang);
      row.append("\n");
      code.appendChild(row);
    });
  }

  /* ---------- run it here ---------- */

  const runBtn = document.getElementById("euler-run");
  const stopBtn = document.getElementById("euler-stop");
  const runStatus = document.getElementById("euler-run-status");
  const out = document.getElementById("euler-out");
  let worker = null;

  function stopRun(message) {
    if (worker) { worker.terminate(); worker = null; }
    stopBtn.hidden = true;
    runBtn.disabled = !RUNS[currentFile().lang];
    if (message !== undefined) runStatus.textContent = message;
  }

  async function run() {
    const problem = data[cur];
    const file = currentFile();
    if (!problem || worker || !RUNS[file.lang]) return;
    out.hidden = false;
    out.textContent = "";
    runBtn.disabled = true;
    stopBtn.hidden = false;
    runStatus.textContent = "fetching…";

    const files = [];
    for (const path of problem.data || []) {
      try {
        const response = await fetch(path);
        files.push({ name: path.split("/").pop(), text: await response.text() });
      } catch (err) { /* the run reports the missing file itself */ }
    }

    worker = new Worker("/shared/run-worker.js");
    worker.onmessage = (event) => {
      const message = event.data;
      if (message.kind === "out") {
        out.textContent += message.text;
        out.scrollTop = out.scrollHeight;
      } else if (message.kind === "status") {
        runStatus.textContent = message.text;
      } else if (message.kind === "done") {
        stopRun("finished in " + (message.ms < 1000
          ? message.ms + " ms"
          : (message.ms / 1000).toFixed(1) + " s"));
      } else if (message.kind === "err") {
        out.textContent += message.text + "\n";
        stopRun("stopped on an error");
      }
    };
    worker.onerror = (event) => {
      out.textContent += (event.message || "worker error") + "\n";
      stopRun("could not start");
    };
    worker.postMessage({ lang: file.lang, code: file.code, files: files });
  }

  runBtn.addEventListener("click", run);
  stopBtn.addEventListener("click", () => stopRun("stopped"));

  /* ---------- which problem, in which language ---------- */

  let cur = -1;
  let langIndex = 0;

  function currentFile() {
    const problem = data[cur];
    if (!problem) return {};
    return problem.files[langIndex] || problem.files[0] || {};
  }

  function renderTabs(problem) {
    tabs.textContent = "";
    /* one language is the common case, and a lone tab is just noise */
    tabs.hidden = problem.files.length < 2;
    if (problem.files.length < 2) return;
    problem.files.forEach((file, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "euler-lang";
      button.textContent = file.label;
      button.setAttribute("aria-selected", index === langIndex ? "true" : "false");
      button.addEventListener("click", () => {
        langIndex = index;
        showFile();
      });
      tabs.appendChild(button);
    });
  }

  function showFile() {
    const problem = data[cur];
    const file = currentFile();
    renderTabs(problem);
    renderCode(file.code || "", file.lang);

    facts.textContent = "";
    facts.appendChild(fact("Statement", statementLink(problem)));
    if (track === "leetcode" && DIFF[problem.difficulty]) {
      facts.appendChild(fact("Difficulty", DIFF[problem.difficulty]));
    }
    facts.appendChild(fact("Length",
      file.lines + (file.lines === 1 ? " line" : " lines") + " of " + file.label));
    if (problem.files.length > 1) {
      facts.appendChild(fact("Written in",
        problem.files.map((f) => f.label).join(", ")));
    }
    if (problem.data && problem.data.length) {
      const wrap = document.createElement("span");
      problem.data.forEach((path, index) => {
        if (index) wrap.append(", ");
        wrap.appendChild(link(path.split("/").pop(), path, true));
      });
      facts.appendChild(fact("Input file", wrap));
    }

    out.hidden = true;
    out.textContent = "";
    if (worker) { worker.terminate(); worker = null; }
    stopBtn.hidden = true;
    runBtn.disabled = !RUNS[file.lang];
    runBtn.title = RUNS[file.lang]
      ? "run this in your browser"
      : file.label + " needs a compiler, and a browser has none";
    runStatus.textContent = "";
  }

  function show(n, push) {
    const index = data.findIndex((p) => p.n === n);
    if (index < 0) return show(data[0].n, push);
    cur = index;
    langIndex = 0;
    const problem = data[index];

    buttons.forEach((b, j) => b.setAttribute("aria-selected", j === index ? "true" : "false"));
    buttons[index].scrollIntoView({ block: "nearest" });

    num.textContent = "Problem " + problem.n;
    title.textContent = problem.title || "Problem " + problem.n;
    document.title = (track === "leetcode" ? "LeetCode " : "Euler ") +
      problem.n + " · " + (problem.title || "") + " · Leonid Elkin";

    showFile();

    prev.disabled = index === 0;
    next.disabled = index === data.length - 1;
    if (push) history.replaceState(null, "", "#" + problem.n);
  }

  prev.addEventListener("click", () => cur > 0 && show(data[cur - 1].n, true));
  next.addEventListener("click", () => cur < data.length - 1 && show(data[cur + 1].n, true));
  window.addEventListener("hashchange", () => show(parseInt(location.hash.slice(1), 10), false));
  window.addEventListener("keydown", (event) => {
    if (event.target && /input|textarea/i.test(event.target.tagName)) return;
    if (event.key === "ArrowLeft" || event.key === "k") prev.click();
    else if (event.key === "ArrowRight" || event.key === "j") next.click();
    else if (event.key === "r" && !runBtn.disabled) run();
  });

  show(parseInt(location.hash.slice(1), 10) || data[0].n, false);
})();
