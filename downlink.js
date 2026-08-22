/* The ground station - mine, not yours.
 *
 * The CanSat came down trailing telemetry, and the habit stuck. Beside the
 * name on the front page there is a downlink panel streaming the only vehicle
 * this page can see - the machine it is open on: mission clock, link,
 * battery, attitude, frame, one packet a second with a lamp that blinks as
 * each one lands.
 *
 * It is a private instrument on a public page. There is no server behind
 * this site, so "mine" is decided the same way the notepad decides who may
 * print: a plate. Type  c a n s a t  and the plate is asked for; a match
 * sets a latch in this browser's localStorage, and from then on the panel
 * is simply there whenever the page opens on this machine. Nobody else's
 * browser has the latch, so nobody else sees the panel - they see the page
 * exactly as before. Escape puts it away until the next open; the word
 * brings it back.
 *
 * Everything shown is read from the browser and goes nowhere. A row that
 * cannot be read says so rather than pretending. The plate is a latch, not a
 * lock: the check runs in the open, and anyone with devtools can set the
 * latch themselves - which buys them a readout of their own battery.
 */

(function () {
  const LATCH = "ground-station";

  /* The plate itself is never in this file - only what it hashes to.
     Same plate, same hash, as the notepad. */
  const PLATE = "19a10vh";
  function fnv(s) {
    let x = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      x ^= s.charCodeAt(i);
      x = Math.imul(x, 0x01000193) >>> 0;
    }
    return (x >>> 0).toString(36);
  }

  function latched() {
    try { return localStorage.getItem(LATCH) === "1"; } catch (e) { return false; }
  }
  function latch() {
    try { localStorage.setItem(LATCH, "1"); } catch (e) { /* private mode: this open only */ }
  }

  /* where it lives: beside the name when there is one, a corner otherwise */
  function mount() {
    const h1 = document.querySelector(".hero h1");
    return h1 ? { parent: h1.parentNode, before: h1.nextSibling, inHero: true } : { parent: document.body, before: null, inHero: false };
  }

  let panel = null;
  let ask = null;
  let timer = null;
  let t0 = 0;
  let pkt = 0;
  let battery = null;
  let att = null;

  /* ---------- the word ---------- */

  const WORD = "cansat";
  let at = 0;
  document.addEventListener("keydown", (e) => {
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    const k = e.key.toLowerCase();
    at = k === WORD[at] ? at + 1 : k === WORD[0] ? 1 : 0;
    if (at === WORD.length) {
      at = 0;
      if (panel) close();
      else if (latched()) open();
      else askPlate();
    }
  });

  /* ---------- the plate ---------- */

  function askPlate() {
    if (ask) { ask.querySelector("input").focus(); return; }
    const m = mount();
    ask = document.createElement("form");
    ask.className = "dl-ask" + (m.inHero ? " in-hero" : "");
    ask.innerHTML =
      '<div class="pad-plate">' +
      '<label class="mono" for="dl-pw">Plate</label>' +
      '<input id="dl-pw" type="password" autocomplete="off" spellcheck="false" aria-label="Password" />' +
      '<button class="pad-btn" type="submit">Link</button>' +
      "</div>" +
      '<p class="dl-note mono">The ground station is mine. The plate, then.</p>';
    m.parent.insertBefore(ask, m.before);
    const input = ask.querySelector("input");
    const note = ask.querySelector(".dl-note");
    input.focus();

    ask.addEventListener("submit", (e) => {
      e.preventDefault();
      if (fnv("press:" + input.value.trim().toLowerCase()) === PLATE) {
        latch();
        dropAsk();
        open();
      } else {
        input.value = "";
        note.textContent = "That plate does not match. Nothing was linked.";
        note.classList.add("bad");
      }
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.stopPropagation(); dropAsk(); }
    });
  }

  function dropAsk() {
    if (!ask) return;
    ask.remove();
    ask = null;
  }

  /* ---------- readings ---------- */

  const pad = (n) => String(n).padStart(2, "0");

  function mission() {
    const s = Math.floor((Date.now() - t0) / 1000);
    return "T+" + pad(Math.floor(s / 60)) + ":" + pad(s % 60);
  }
  function local() {
    const d = new Date();
    return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }
  function link() {
    if (!navigator.onLine) return "LOST";
    const c = navigator.connection;
    if (!c) return "UP";
    const parts = ["UP"];
    if (c.effectiveType) parts.push(c.effectiveType.toUpperCase());
    if (c.rtt) parts.push(c.rtt + " ms");
    if (c.saveData) parts.push("lite");
    return parts.join(" · ");
  }
  function power() {
    if (battery === false) return "not reported";
    if (!battery) return "reading…";
    const pc = Math.round(battery.level * 100) + "%";
    return battery.charging ? pc + " · charging" : pc;
  }
  function attitude() {
    if (!att) return "fixed mount";
    const f = (v) => (v == null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(0) + "°");
    return "α " + f(att.alpha) + "  β " + f(att.beta) + "  γ " + f(att.gamma);
  }
  function frame() {
    const dpr = window.devicePixelRatio || 1;
    return innerWidth + "×" + innerHeight + (dpr !== 1 ? " @" + dpr.toFixed(2).replace(/\.?0+$/, "") + "x" : "");
  }
  function scheme() {
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return (dark ? "dark" : "light") + (still ? " · reduced motion" : "");
  }

  const ROWS = [
    ["MET", mission],
    ["LOCAL", local],
    ["LINK", link],
    ["PWR", power],
    ["ATT", attitude],
    ["FRAME", frame],
    ["PREF", scheme],
  ];

  /* ---------- the panel ---------- */

  function open() {
    dropAsk();
    t0 = Date.now();
    pkt = 0;

    const m = mount();
    panel = document.createElement("aside");
    panel.className = "downlink" + (m.inHero ? " in-hero" : "");
    panel.setAttribute("aria-live", "off");
    panel.setAttribute("aria-label", "Downlink: this machine's telemetry");

    const head = document.createElement("div");
    head.className = "dl-head";
    head.innerHTML = '<span class="dl-lamp"></span><span>DOWNLINK</span><span class="dl-pkt">PKT 0000</span>';
    panel.appendChild(head);

    const dl = document.createElement("dl");
    ROWS.forEach(([k]) => {
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.dataset.row = k;
      dl.appendChild(dt);
      dl.appendChild(dd);
    });
    panel.appendChild(dl);

    const foot = document.createElement("div");
    foot.className = "dl-foot";
    foot.textContent = "mine · read locally · sent nowhere · esc";
    panel.appendChild(foot);

    m.parent.insertBefore(panel, m.before);
    requestAnimationFrame(() => panel.classList.add("up"));

    if (navigator.getBattery) {
      navigator.getBattery().then((b) => { battery = b; }, () => { battery = false; });
    } else {
      battery = false;
    }
    window.addEventListener("deviceorientation", onAtt);
    document.addEventListener("keydown", esc);

    tick();
    timer = setInterval(tick, 1000);
  }

  function onAtt(e) {
    if (e.alpha == null && e.beta == null && e.gamma == null) return;
    att = e;
  }

  function tick() {
    if (!panel) return;
    pkt++;
    ROWS.forEach(([k, fn]) => {
      const dd = panel.querySelector('[data-row="' + k + '"]');
      if (dd) dd.textContent = fn();
    });
    panel.querySelector(".dl-pkt").textContent = "PKT " + String(pkt).padStart(4, "0");
    const lamp = panel.querySelector(".dl-lamp");
    lamp.classList.remove("on");
    void lamp.offsetWidth;
    lamp.classList.add("on");
  }

  function esc(e) {
    if (e.key === "Escape") close();
  }

  function close() {
    clearInterval(timer);
    window.removeEventListener("deviceorientation", onAtt);
    document.removeEventListener("keydown", esc);
    const p = panel;
    panel = null;
    p.classList.remove("up");
    setTimeout(() => p.remove(), 320);
  }

  /* ---------- on this machine, it is simply there ---------- */

  if (latched()) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", open);
    else open();
  }
})();
