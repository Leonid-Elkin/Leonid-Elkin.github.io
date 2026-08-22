/* The ground station.
 *
 * The CanSat came down trailing telemetry, and the habit stuck. Type
 * c a n s a t  anywhere and a downlink panel opens in the corner, streaming
 * the only vehicle this page can see: the visitor's own machine. Battery,
 * link, attitude, frame, mission clock - one packet a second, with a lamp
 * that blinks as each one lands. Type it again, or Escape, to end the pass.
 *
 * Everything shown is read from the browser and goes nowhere. Most rows are
 * optional on most machines - a desktop has no attitude to report and many
 * browsers refuse to say how the battery is - and a row that cannot be read
 * says so rather than pretending. A ground station that invents numbers is
 * worse than none.
 */

(function () {
  let panel = null;
  let timer = null;
  let t0 = 0;
  let pkt = 0;
  let battery = null;
  let att = null;

  /* ---------- the word that opens it ---------- */

  const WORD = "cansat";
  let at = 0;
  document.addEventListener("keydown", (e) => {
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    const k = e.key.toLowerCase();
    at = k === WORD[at] ? at + 1 : k === WORD[0] ? 1 : 0;
    if (at === WORD.length) {
      at = 0;
      panel ? close() : open();
    }
  });

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
    t0 = Date.now();
    pkt = 0;

    panel = document.createElement("aside");
    panel.className = "downlink";
    panel.setAttribute("aria-live", "off");
    panel.setAttribute("aria-label", "Downlink: this browser's telemetry");

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
    foot.textContent = "read locally · sent nowhere · esc";
    panel.appendChild(foot);

    document.body.appendChild(panel);
    requestAnimationFrame(() => panel.classList.add("up"));

    /* sensors that have to be asked for */
    if (navigator.getBattery) {
      navigator.getBattery().then((b) => {
        battery = b;
      }, () => {
        battery = false;
      });
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
})();
