/* The visitor.
 *
 * A glassy deep-blue octahedron turning slowly above the ridgeline, tipped
 * respectfully at a certain Angel. That is all he does. He is not
 * interactive; the cursor passes straight through him.
 *
 * Flat faces carry no drawn lines: edges are detected per frame and drawn
 * only along silhouettes and true creases, in pale luminous blue. Faces
 * are stroked in their own fill to close antialiasing seams, and shading
 * carries a fresnel rim and a mirror-sheen top end, which is what sells
 * translucent glass without transparency. All of it is arithmetic in an
 * SVG - no WebGL, no textures, no image files.
 *
 * The turn is a pure function of absolute time, so a throttled frame
 * schedule cannot slow him down - frames just sample the same clock less
 * often. Scrolling changes only the vertical viewing angle, easing between
 * seen-from-above and level, never from underneath. Off screen he stops
 * spending frames and banks his heading; under prefers-reduced-motion he
 * holds one pose.
 */

(function () {
  const mounts = document.querySelectorAll(".ramiel");
  if (!mounts.length) return;

  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const NS = "http://www.w3.org/2000/svg";

  /* ================= mesh: octahedron, subdivided twice ================= */

  let VERTS = [
    [1, 0, 0], [-1, 0, 0],
    [0, 1, 0], [0, -1, 0],
    [0, 0, 1], [0, 0, -1],
  ];
  let FACES = [
    [2, 0, 4], [2, 4, 1], [2, 1, 5], [2, 5, 0],
    [3, 4, 0], [3, 1, 4], [3, 5, 1], [3, 0, 5],
  ];

  for (let s = 0; s < 2; s++) {
    const mid = {};
    const nf = [];
    const midpoint = (a, b) => {
      const key = a < b ? a + "_" + b : b + "_" + a;
      if (key in mid) return mid[key];
      const va = VERTS[a], vb = VERTS[b];
      VERTS.push([(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2]);
      return (mid[key] = VERTS.length - 1);
    };
    for (const [a, b, c] of FACES) {
      const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
      nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    FACES = nf;
  }

  const EDGES = (() => {
    const map = {};
    FACES.forEach((f, fi) => {
      for (let k = 0; k < 3; k++) {
        const a = f[k], b = f[(k + 1) % 3];
        const key = a < b ? a + "_" + b : b + "_" + a;
        (map[key] = map[key] || { a, b, f: [] }).f.push(fi);
      }
    });
    return Object.values(map).filter((e) => e.f.length === 2);
  })();

  /* ================= glass shading ================= */

  const DEEP = [7, 22, 66];
  const MIDC = [30, 82, 196];
  const LITC = [132, 182, 255];
  const SHEEN = [214, 232, 255];

  function shade(diffuse, fresnel) {
    let t = Math.pow(0.10 + 0.90 * diffuse, 0.95) + fresnel * 0.30;
    t = Math.min(1.18, t);
    let a, b, k;
    if (t < 0.5)       { a = DEEP; b = MIDC;  k = t / 0.5; }
    else if (t < 0.95) { a = MIDC; b = LITC;  k = (t - 0.5) / 0.45; }
    else               { a = LITC; b = SHEEN; k = Math.min(1, (t - 0.95) / 0.23); }
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

  const SPIN = 1 / 4.2; /* rad/s */
  const TILT = -0.18;   /* resting view: slightly from above - never below */
  const SC = 27;

  /* ================= per-mount ================= */

  function build(mount) {
    const size = parseInt(mount.dataset.size, 10) || mount.clientWidth || 96;
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("shape-rendering", "geometricPrecision");
    svg.style.filter = "drop-shadow(0 0 16px rgba(100, 150, 255, 0.22))";

    const polys = FACES.map(() => {
      const p = document.createElementNS(NS, "polygon");
      p.setAttribute("stroke-width", "0.5");
      p.setAttribute("stroke-linejoin", "round");
      svg.appendChild(p);
      return p;
    });

    const edgePath = document.createElementNS(NS, "path");
    edgePath.setAttribute("fill", "none");
    edgePath.setAttribute("stroke", "#bcd6ff");
    edgePath.setAttribute("stroke-width", "0.55");
    edgePath.setAttribute("stroke-opacity", "0.85");
    edgePath.setAttribute("stroke-linecap", "round");
    svg.appendChild(edgePath);

    mount.appendChild(svg);

    const scratch = [];
    const normals = [];
    const depths = [];

    function pose(yaw, tilt) {
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      const cy = Math.cos(yaw), sy = Math.sin(yaw);

      for (let i = 0; i < VERTS.length; i++) {
        const [x, y, z] = VERTS[i];
        const x1 = x * cy + z * sy;
        const z1 = -x * sy + z * cy;
        scratch[i] = [x1, y * ct - z1 * st, y * st + z1 * ct];
      }

      const order = [];
      for (let fi = 0; fi < FACES.length; fi++) {
        const [ia, ib, ic] = FACES[fi];
        const a = scratch[ia], b = scratch[ib], c = scratch[ic];
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        let nx = uy * vz - uz * vy;
        let ny = uz * vx - ux * vz;
        let nz = ux * vy - uy * vx;
        const nl = Math.hypot(nx, ny, nz) || 1;
        normals[fi] = [nx / nl, ny / nl, nz / nl];
        depths[fi] = (a[2] + b[2] + c[2]) / 3;
        order.push(fi);
      }
      order.sort((p, q) => depths[p] - depths[q]);

      let used = 0;
      for (const fi of order) {
        const n = normals[fi];
        if (n[2] <= 0) continue;
        const p = polys[used++];
        const diffuse = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
        const col = shade(diffuse, 1 - n[2]);
        p.setAttribute("fill", col);
        p.setAttribute("stroke", col);
        const [ia, ib, ic] = FACES[fi];
        p.setAttribute(
          "points",
          [scratch[ia], scratch[ib], scratch[ic]]
            .map(([x, y]) => (50 + x * SC).toFixed(2) + "," + (50 - y * SC).toFixed(2))
            .join(" ")
        );
        svg.appendChild(p);
      }
      for (let i = used; i < polys.length; i++) polys[i].setAttribute("points", "");
      svg.appendChild(edgePath);

      let d = "";
      for (const e of EDGES) {
        const [f1, f2] = e.f;
        const front1 = normals[f1][2] > 0, front2 = normals[f2][2] > 0;
        let draw = false;
        if (front1 !== front2) draw = true;
        else if (front1 && front2) {
          const n1 = normals[f1], n2 = normals[f2];
          if (n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2] < 0.995) draw = true;
        }
        if (draw) {
          const A = scratch[e.a], B = scratch[e.b];
          d += "M" + (50 + A[0] * SC).toFixed(2) + " " + (50 - A[1] * SC).toFixed(2) +
               "L" + (50 + B[0] * SC).toFixed(2) + " " + (50 - B[1] * SC).toFixed(2);
        }
      }
      edgePath.setAttribute("d", d);
    }

    if (still) {
      pose(0.66, TILT);
      return;
    }

    let running = false;
    let idleStart = null;
    let yawBase = 0.66;

    function yawAt(now) {
      if (idleStart === null) idleStart = now;
      return yawBase + ((now - idleStart) / 1000) * SPIN;
    }

    function frame() {
      if (!running) return;
      const now = performance.now();
      const r = mount.getBoundingClientRect();
      const vp = (r.top + r.height / 2 - innerHeight / 2) / innerHeight;
      const tilt = Math.max(-0.4, Math.min(0.08, TILT - vp * 0.28));
      pose(yawAt(now), tilt);
      requestAnimationFrame(frame);
    }

    function start() {
      if (running) return;
      running = true;
      idleStart = null;
      requestAnimationFrame(frame);
    }
    function stop() {
      if (running) {
        yawBase = yawAt(performance.now()) % (Math.PI * 2);
        idleStart = null;
      }
      running = false;
    }

    pose(0.66, TILT);
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
