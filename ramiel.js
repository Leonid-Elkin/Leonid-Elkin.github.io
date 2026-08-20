/* The visitor.
 *
 * A blue solid turning slowly above the ridgeline, tipped respectfully at a
 * certain Angel - including the part where it does not stay an octahedron.
 * Every so often it flows into another body and back: a stellated burst, a
 * long drill, a flattened gem. The mesh is a subdivided octahedron - 18
 * vertices, 32 faces - and every form is the same mesh with its vertices
 * breathed in or out, so the morph is continuous arithmetic, not a swap.
 *
 * Faces are flat-shaded by their normals off a continuous cobalt ramp, every
 * edge drawn in the deepest blue, painted back to front into an SVG. No
 * WebGL, no textures, no image files.
 *
 * Under prefers-reduced-motion it holds one octahedral pose; off screen it
 * stops spending frames. Delete this file and the mounts stay empty.
 */

(function () {
  const mounts = document.querySelectorAll(".ramiel");
  if (!mounts.length) return;

  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- the mesh: an octahedron subdivided once ---------- */

  const AX = [
    [1, 0, 0], [-1, 0, 0],
    [0, 1, 0], [0, -1, 0],
    [0, 0, 1], [0, 0, -1],
  ];
  const OCTA_FACES = [
    [2, 0, 4], [2, 4, 1], [2, 1, 5], [2, 5, 0],
    [3, 4, 0], [3, 1, 4], [3, 5, 1], [3, 0, 5],
  ];

  const BASE = AX.map((v) => v.slice()); /* vertex positions */
  const F = [];                          /* 32 faces into BASE */
  const midCache = {};

  function midpoint(a, b) {
    const key = a < b ? a + "_" + b : b + "_" + a;
    if (key in midCache) return midCache[key];
    const va = BASE[a], vb = BASE[b];
    BASE.push([(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2]);
    midCache[key] = BASE.length - 1;
    return midCache[key];
  }

  for (const [a, b, c] of OCTA_FACES) {
    const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
    F.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
  }

  /* ---------- the forms: per-vertex breath on the same mesh ----------
     Classes: pole = the two Y-axis tips, equator = the four X/Z tips,
     mp = midpoints touching a pole, me = midpoints on the equator. */

  const CLASS = BASE.map((v) => {
    if (Math.abs(v[1]) === 1) return "pole";
    if (v[1] === 0 && (Math.abs(v[0]) === 1 || Math.abs(v[2]) === 1)) return "eq";
    return v[1] === 0 ? "me" : "mp";
  });

  const FORMS = [
    { pole: 1,    eq: 1,    mp: 1,    me: 1    }, /* the octahedron */
    { pole: 1.38, eq: 1.38, mp: 0.52, me: 0.52 }, /* stellated burst */
    { pole: 1.72, eq: 0.68, mp: 1.02, me: 0.55 }, /* the drill */
    { pole: 0.55, eq: 1.28, mp: 0.82, me: 1.28 }, /* the flattened gem */
  ];
  /* always return to the octahedron between excursions, as he does */
  const SEQ = [0, 1, 0, 2, 0, 3];
  const HOLD = 3.4, MORPH = 1.5, PERIOD = HOLD + MORPH;

  const smooth = (t) => t * t * (3 - 2 * t);

  function factorAt(cls, time) {
    const cycle = (time / 1000) % (SEQ.length * PERIOD);
    const idx = Math.floor(cycle / PERIOD);
    const local = cycle - idx * PERIOD;
    const from = FORMS[SEQ[idx]][cls];
    const to = FORMS[SEQ[(idx + 1) % SEQ.length]][cls];
    if (local < HOLD) return from;
    return from + (to - from) * smooth((local - HOLD) / MORPH);
  }

  /* ---------- shading ---------- */

  const DARK = [8, 24, 64];
  const MID  = [36, 88, 194];
  const LIT  = [126, 176, 255];

  function shade(lit) {
    const t = Math.pow(0.12 + 0.88 * lit, 0.9);
    let a, b, k;
    if (t < 0.55) { a = DARK; b = MID; k = t / 0.55; }
    else { a = MID; b = LIT; k = (t - 0.55) / 0.45; }
    return "rgb(" +
      Math.round(a[0] + (b[0] - a[0]) * k) + "," +
      Math.round(a[1] + (b[1] - a[1]) * k) + "," +
      Math.round(a[2] + (b[2] - a[2]) * k) + ")";
  }

  const L = (() => {
    const v = [-0.35, -0.55, 0.85];
    const n = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / n, v[1] / n, v[2] / n];
  })();

  const TILT = -0.18; /* resting view: slightly from above - never from below */

  /* ---------- per-mount build ---------- */

  function build(mount) {
    const size = parseInt(mount.dataset.size, 10) || mount.clientWidth || 96;
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("shape-rendering", "geometricPrecision");
    const polys = F.map(() => {
      const p = document.createElementNS(ns, "polygon");
      p.setAttribute("stroke", "#081840");
      p.setAttribute("stroke-width", "0.7");
      p.setAttribute("stroke-linejoin", "round");
      svg.appendChild(p);
      return p;
    });
    mount.appendChild(svg);

    function pose(yaw, tilt, time) {
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      const cy = Math.cos(yaw), sy = Math.sin(yaw);

      const pts = BASE.map((v, i) => {
        const k = factorAt(CLASS[i], time);
        const x = v[0] * k, y = v[1] * k, z = v[2] * k;
        const x1 = x * cy + z * sy;
        const z1 = -x * sy + z * cy;
        return [x1, y * ct - z1 * st, y * st + z1 * ct];
      });

      const order = F.map((f, i) => ({
        i,
        z: (pts[f[0]][2] + pts[f[1]][2] + pts[f[2]][2]) / 3,
      })).sort((a, b) => a.z - b.z);

      for (const { i } of order) {
        const [a, b, c] = F[i].map((vi) => pts[vi]);
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        let nx = uy * vz - uz * vy;
        let ny = uz * vx - ux * vz;
        let nz = ux * vy - uy * vx;
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;

        const p = polys[i];
        if (nz <= 0) {
          p.setAttribute("points", "");
          continue;
        }
        const lit = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
        p.setAttribute("fill", shade(lit));
        p.setAttribute(
          "points",
          [a, b, c].map(([x, y]) => (50 + x * 29) + "," + (50 - y * 29)).join(" ")
        );
        svg.appendChild(p);
      }
    }

    if (still) {
      pose(0.66, TILT, 0);
      return;
    }

    let running = false;
    function loop(t) {
      if (!running) return;
      /* the idle turn is time's alone; the scroll changes only the
         VERTICAL viewing angle - never from underneath */
      const r = mount.getBoundingClientRect();
      const p = (r.top + r.height / 2 - innerHeight / 2) / innerHeight;
      const tilt = Math.max(-0.4, Math.min(0.08, TILT - p * 0.28));
      pose(t / 4200, tilt, t);
      requestAnimationFrame(loop);
    }
    function start() {
      if (running) return;
      running = true;
      requestAnimationFrame(loop);
    }
    function stop() { running = false; }

    pose(0.66, TILT, 0);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        (es) => es.forEach((e) => (e.isIntersecting ? start() : stop())),
        { rootMargin: "60px" }
      ).observe(mount);
    } else {
      start();
    }
  }

  mounts.forEach(build);
})();
