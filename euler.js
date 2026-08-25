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
      row.append(n, ln + "\n");
      code.appendChild(row);
    });
  }

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

    prev.disabled = i === 0;
    next.disabled = i === data.length - 1;
    if (push) history.replaceState(null, "", "#" + p.n);
  }

  prev.addEventListener("click", () => cur > 0 && show(data[cur - 1].n, true));
  next.addEventListener("click", () => cur < data.length - 1 && show(data[cur + 1].n, true));
  window.addEventListener("hashchange", () => show(parseInt(location.hash.slice(1), 10), false));

  show(parseInt(location.hash.slice(1), 10) || data[0].n, false);
})();
