/* The cluster, still evaporating.
 *
 * Now also a laboratory: CLICK anywhere in the band and a heavy red
 * intruder drops in where you clicked, and the cluster has to live with
 * the consequences. This is, give or take, the paper's actual question.
 *
 * A little N-body globular cluster, the subject of the physics paper, running
 * live in a canvas band. Softened pairwise gravity, leapfrog integration,
 * stars in bone, the primordial binaries of the paper's question in red.
 * Stars that reach escape distance are gone for good and the readout counts
 * them - the band is literally demonstrating the paper's result while you
 * read about it.
 *
 * Drawn, not loaded: a canvas is not an image file, so the site's zero-image
 * rule holds. Under prefers-reduced-motion the cluster renders once and
 * holds still. The loop only runs while the band is actually on screen.
 * Delete this file and the band collapses to nothing.
 */

(function () {
  const root = document.getElementById("cluster");
  if (!root) return;

  const canvas = root.querySelector("canvas");
  const readout = root.querySelector(".cluster-readout b");
  if (!canvas) return;

  root.classList.add("is-live");

  const ctx = canvas.getContext("2d");
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const N = 140;        // stars at dealing time
  const PAIRS = 6;      // primordial binaries, in red
  const SOFT2 = 90;     // softening length squared - keeps close passes sane
  const G = 14;         // tuned for pace, not units
  const ESCAPE = 1.5;   // multiples of the band's half-diagonal

  let stars = [];
  let escaped = 0;
  let W = 0, H = 0, dpr = 1;

  /* the footer reads these; anyone else is welcome to */
  window.clusterStats = { escaped: 0, intruders: 0 };

  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = root.clientWidth;
    H = root.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function deal() {
    stars = [];
    escaped = 0;
    const cx = W / 2, cy = H / 2;
    const R = Math.min(W, H) * 0.34;

    for (let i = 0; i < N; i++) {
      /* denser toward the core, like the real thing */
      const r = R * Math.pow(Math.random(), 1.6) + 3;
      const a = Math.random() * Math.PI * 2;
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a) * 0.55; /* the band is wide, not tall */

      /* mostly tangential velocity, so it orbits rather than collapses */
      const v = Math.sqrt((G * N * 0.5) / (r + 8)) * (0.75 + Math.random() * 0.3);
      stars.push({
        x, y,
        vx: -Math.sin(a) * v,
        vy: Math.cos(a) * v * 0.55,
        m: 1,
        red: false,
        gone: false,
      });
    }

    /* binaries: pick stars and give each a close red companion */
    for (let p = 0; p < PAIRS; p++) {
      const s = stars[p * 3];
      s.red = true;
      stars.push({
        x: s.x + 4, y: s.y + 3,
        vx: s.vx, vy: s.vy - 1.4,
        m: 1, red: true, gone: false,
      });
    }
  }

  function step(dt) {
    const cx = W / 2, cy = H / 2;
    const lim2 = Math.pow(ESCAPE * Math.hypot(W, H) * 0.5, 2);
    const live = stars.filter((s) => !s.gone);

    for (let i = 0; i < live.length; i++) {
      const a = live[i];
      let ax = 0, ay = 0;
      for (let j = 0; j < live.length; j++) {
        if (i === j) continue;
        const b = live[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy + SOFT2;
        const f = (G * (b.m || 1)) / (d2 * Math.sqrt(d2));
        ax += dx * f;
        ay += dy * f;
      }
      a.vx += ax * dt;
      a.vy += ay * dt;
    }

    for (const s of live) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const dx = s.x - cx, dy = s.y - cy;
      if (dx * dx + dy * dy > lim2) {
        s.gone = true;
        escaped++;
        window.clusterStats.escaped++;
      }
    }

    /* the paper's endgame: when most of the cluster has boiled off,
       quietly deal a fresh one */
    if (stars.filter((s) => !s.gone).length < N * 0.45) deal();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (const s of stars) {
      if (s.gone) continue;
      ctx.fillStyle = s.red ? "#ff2d16" : "rgba(242, 240, 236, 0.75)";
      const r = s.m > 1 ? 3 : s.red ? 1.8 : 1.2;
      ctx.fillRect(s.x - r, s.y - r, r * 2, r * 2);
    }
    if (readout) {
      readout.textContent =
        "N " + stars.filter((s) => !s.gone).length + " · ESCAPED " + escaped;
    }
  }

  let running = false;
  let last = 0;

  function loop(t) {
    if (!running) return;
    const dt = Math.min((t - last) / 1000, 0.05) * 2.2;
    last = t;
    step(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function start() {
    if (running || still) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
  }

  size();
  deal();
  /* settle a few steps so the first frame already looks like a cluster */
  for (let i = 0; i < 8; i++) step(0.03);
  draw();

  if (!still && "IntersectionObserver" in window) {
    new IntersectionObserver(
      (es) => es.forEach((e) => (e.isIntersecting ? start() : stop())),
      { rootMargin: "80px" }
    ).observe(root);
  } else if (!still) {
    start();
  }

  /* the perturbation experiment: a click drops a heavy intruder */
  root.addEventListener("click", (e) => {
    const rc = root.getBoundingClientRect();
    const live = stars.filter((st) => st.m > 1 && !st.gone).length;
    if (live >= 3) return; /* three rogue masses is plenty of science */
    stars.push({
      x: e.clientX - rc.left,
      y: e.clientY - rc.top,
      vx: (Math.random() - 0.5) * 6,
      vy: (Math.random() - 0.5) * 4,
      m: 7, red: true, gone: false,
    });
    window.clusterStats.intruders++;
    start();
  });

  let resizeAt = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeAt);
    resizeAt = setTimeout(() => {
      size();
      deal();
      for (let i = 0; i < 8; i++) step(0.03);
      draw();
    }, 180);
  });
})();
