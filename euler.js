/* The Project Euler page: a column of problem numbers, and the chosen
 * solution beside it. State lives in the URL hash (#12) so a problem can be
 * linked to. Data comes from euler-data.js, generated from Euler_source/.
 */

(function () {
  const data = (window.EULER || []).slice().sort((a, b) => a.n - b.n);
  const pick = document.getElementById("euler-pick");
  if (!pick || !data.length) return;

  const num = document.getElementById("euler-num");
  const title = document.getElementById("euler-title");
  const facts = document.getElementById("euler-facts");
  const code = document.querySelector("#euler-code code");
  const count = document.getElementById("euler-count");
  const prev = document.getElementById("euler-prev");
  const next = document.getElementById("euler-next");

  count.textContent = data.length + " problems";

  const buttons = data.map((p) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "euler-btn";
    b.textContent = String(p.n);
    b.setAttribute("role", "option");
    b.title = p.title;
    b.addEventListener("click", () => show(p.n, true));
    pick.appendChild(b);
    return b;
  });

  function fact(k, v) {
    const row = document.createElement("div");
    const dt = document.createElement("dt");
    dt.className = "k";
    dt.textContent = k;
    const dd = document.createElement("dd");
    if (typeof v === "string") dd.textContent = v;
    else dd.appendChild(v);
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

  /* A small Python tokeniser - enough to colour keywords, strings, numbers,
     comments and the names being defined. Everything else stays ink. */
  const KW = new Set("and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield True False None print range len int str list dict set sum max min abs sorted enumerate zip map filter open".split(" "));
  const TOKEN = /(#.*)|("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b)|(\b(?:def|class)\s+)([A-Za-z_]\w*)|([A-Za-z_]\w*)/g;

  function highlight(src, into) {
    let last = 0, m;
    TOKEN.lastIndex = 0;
    const push = (text, cls) => {
      if (!text) return;
      if (!cls) return into.append(text);
      const s = document.createElement("span");
      s.className = cls;
      s.textContent = text;
      into.appendChild(s);
    };
    while ((m = TOKEN.exec(src))) {
      push(src.slice(last, m.index));
      if (m[1]) push(m[1], "tk-com");
      else if (m[2]) push(m[2], "tk-str");
      else if (m[3]) push(m[3], "tk-num");
      else if (m[4]) { push(m[4], "tk-kw"); push(m[5], "tk-def"); }
      else push(m[6], KW.has(m[6]) ? "tk-kw" : null);
      last = TOKEN.lastIndex;
    }
    push(src.slice(last));
  }

  /* line numbers in the gutter, the source untouched */
  function renderCode(src) {
    code.textContent = "";
    const lines = src.replace(/\s+$/, "").split("\n");
    const pad = String(lines.length).length;
    lines.forEach((ln, i) => {
      const row = document.createElement("span");
      row.className = "ln";
      const n = document.createElement("span");
      n.className = "n";
      n.textContent = String(i + 1).padStart(pad, " ");
      row.appendChild(n);
      highlight(ln, row);
      row.append("\n");
      code.appendChild(row);
    });
  }

  /* ---------- run it here: Pyodide in a worker ---------- */

  const runBtn = document.getElementById("euler-run");
  const stopBtn = document.getElementById("euler-stop");
  const runStatus = document.getElementById("euler-run-status");
  const out = document.getElementById("euler-out");
  let worker = null;

  function stopRun(msg) {
    if (worker) { worker.terminate(); worker = null; }
    stopBtn.hidden = true;
    runBtn.disabled = false;
    if (msg) runStatus.textContent = msg;
  }

  async function run() {
    const p = data[cur];
    if (!p || worker) return;
    out.hidden = false;
    out.textContent = "";
    runBtn.disabled = true;
    stopBtn.hidden = false;
    runStatus.textContent = "fetching…";
    const files = [];
    for (const path of p.data || []) {
      try {
        const r = await fetch(path);
        files.push({ name: path.split("/").pop(), text: await r.text() });
      } catch (e) { /* the run will report the missing file itself */ }
    }
    worker = new Worker("euler-worker.js");
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.kind === "out") { out.textContent += m.text; out.scrollTop = out.scrollHeight; }
      else if (m.kind === "status") runStatus.textContent = m.text;
      else if (m.kind === "done") stopRun("finished in " + (m.ms < 1000 ? m.ms + " ms" : (m.ms / 1000).toFixed(1) + " s"));
      else if (m.kind === "err") { out.textContent += m.text + "\n"; stopRun("stopped on an error"); }
    };
    worker.onerror = (e) => { out.textContent += (e.message || "worker error") + "\n"; stopRun("could not start"); };
    worker.postMessage({ code: p.code, files });
  }

  runBtn.addEventListener("click", run);
  stopBtn.addEventListener("click", () => stopRun("stopped"));

  let cur = -1;

  function show(n, push) {
    const i = data.findIndex((p) => p.n === n);
    if (i < 0) return show(data[0].n, push);
    cur = i;
    const p = data[i];

    buttons.forEach((b, j) => b.setAttribute("aria-selected", j === i ? "true" : "false"));
    buttons[i].scrollIntoView({ block: "nearest" });

    num.textContent = "Problem " + p.n;
    title.textContent = p.title || "Problem " + p.n;
    document.title = "Euler " + p.n + " · " + (p.title || "") + " · Leonid Elkin";

    facts.textContent = "";
    facts.appendChild(fact("Statement", link("projecteuler.net/problem=" + p.n, "https://projecteuler.net/problem=" + p.n)));
    facts.appendChild(fact("Length", p.lines + (p.lines === 1 ? " line" : " lines") + " of Python"));
    if (p.data && p.data.length) {
      const wrap = document.createElement("span");
      p.data.forEach((d, k) => {
        if (k) wrap.append(", ");
        wrap.appendChild(link(d.split("/").pop(), d, true));
      });
      facts.appendChild(fact("Input file", wrap));
    }

    renderCode(p.code);
    stopRun("");
    out.hidden = true;
    out.textContent = "";

    prev.disabled = i === 0;
    next.disabled = i === data.length - 1;
    if (push) history.replaceState(null, "", "#" + p.n);
  }

  prev.addEventListener("click", () => cur > 0 && show(data[cur - 1].n, true));
  next.addEventListener("click", () => cur < data.length - 1 && show(data[cur + 1].n, true));
  window.addEventListener("hashchange", () => show(parseInt(location.hash.slice(1), 10), false));

  show(parseInt(location.hash.slice(1), 10) || data[0].n, false);
})();
