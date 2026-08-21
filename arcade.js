/* The range.
 *
 * Aimtrainer was the first thing ever made here, so it lives in the walls.
 * Type  a i m  anywhere and the range opens: red rings spawn across the
 * page for twenty-five seconds, each one shrinking away if you are slow.
 * Click them. Escape closes the range early. Your best run is remembered
 * on this machine and nowhere else.
 *
 * Nothing is load-bearing: no markup is required, the page underneath
 * keeps working, and under prefers-reduced-motion the range refuses to
 * open at all.
 */

(function () {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const ROUND = 25;       /* seconds */
  const SPAWN_MS = 640;
  const LIFE_MS = 1600;
  const KEY = "range-best";

  let open = false;

  /* ---------- the word that opens it ---------- */

  const WORD = "aim";
  let at = 0;
  document.addEventListener("keydown", (e) => {
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    const k = e.key.toLowerCase();
    at = k === WORD[at] ? at + 1 : k === WORD[0] ? 1 : 0;
    if (at === WORD.length) {
      at = 0;
      if (!open) start();
    }
  });

  /* ---------- one round ---------- */

  function start() {
    open = true;
    let hits = 0;
    let clicks = 0;
    let alive = true;

    const hud = document.createElement("div");
    hud.className = "range-hud";
    document.body.appendChild(hud);

    const t0 = performance.now();
    const targets = new Set();

    function timeLeft() {
      return Math.max(0, ROUND - (performance.now() - t0) / 1000);
    }

    function drawHud() {
      const s = Math.ceil(timeLeft());
      const acc = clicks ? Math.round((hits / clicks) * 100) + "%" : "—";
      hud.textContent =
        "RANGE OPEN · 0:" + String(s).padStart(2, "0") + " · HITS " + hits + " · ACC " + acc;
    }

    function spawn() {
      if (!alive) return;
      const d = document.createElement("button");
      d.className = "aim-target";
      d.type = "button";
      d.setAttribute("aria-label", "target");
      const m = 60;
      d.style.left = m + Math.random() * (innerWidth - m * 2) + "px";
      d.style.top = m + Math.random() * (innerHeight - m * 2) + "px";
      d.addEventListener("click", (e) => {
        e.stopPropagation();
        hits++;
        clicks++;
        d.classList.add("hit");
        targets.delete(d);
        setTimeout(() => d.remove(), 140);
        drawHud();
      });
      document.body.appendChild(d);
      targets.add(d);
      /* too slow: it shrinks away */
      requestAnimationFrame(() => d.classList.add("live"));
      setTimeout(() => {
        if (targets.has(d)) {
          targets.delete(d);
          d.remove();
        }
      }, LIFE_MS);
      if (timeLeft() > 0) setTimeout(spawn, SPAWN_MS);
      else end();
    }

    /* every stray click on the page counts against accuracy - it is a range */
    function missListener() {
      clicks++;
      drawHud();
    }
    document.addEventListener("click", missListener);

    function cleanup() {
      alive = false;
      document.removeEventListener("click", missListener);
      document.removeEventListener("keydown", escListener);
      targets.forEach((d) => d.remove());
      targets.clear();
    }

    function end(cancelled) {
      if (!alive) return;
      cleanup();
      hud.remove();
      if (cancelled) {
        open = false;
        return;
      }
      let best = 0;
      try {
        best = parseInt(localStorage.getItem(KEY), 10) || 0;
        if (hits > best) {
          best = hits;
          localStorage.setItem(KEY, String(best));
        }
      } catch (e) { /* private mode - the score dies with the tab */ }
      const acc = clicks ? Math.round((hits / clicks) * 100) : 0;
      const stamp = document.createElement("div");
      stamp.className = "range-stamp";
      stamp.textContent = "RANGE CLOSED · " + hits + " HITS · " + acc + "% · BEST " + best;
      document.body.appendChild(stamp);
      setTimeout(() => {
        stamp.classList.add("gone");
        setTimeout(() => {
          stamp.remove();
          open = false;
        }, 500);
      }, 2600);
    }

    function escListener(e) {
      if (e.key === "Escape") end(true);
    }
    document.addEventListener("keydown", escListener);

    drawHud();
    const tick = setInterval(() => {
      if (!alive) return clearInterval(tick);
      drawHud();
      if (timeLeft() <= 0) end();
    }, 250);
    spawn();
  }
})();
