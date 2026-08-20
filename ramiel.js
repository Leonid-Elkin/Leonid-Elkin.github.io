/* The visitor.
 *
 * A blue octahedron turning slowly above the ridgeline - the site's one
 * borrowed shape, tipped respectfully at a certain Angel. It is a real
 * solid, not a sprite: six vertices rotated in 3D every frame, eight faces
 * flat-shaded by their normals and painted back to front into an SVG. No
 * WebGL, no textures, no image files - the zero-image rule holds because
 * the whole thing is arithmetic.
 *
 * Any element with class "ramiel" gets one. data-size sets the edge of the
 * box it spins in. Under prefers-reduced-motion it holds a single stately
 * pose; off screen it stops spending frames. Delete this file and the
 * mounts stay empty - nothing else references it.
 */

(function () {
  const mounts = document.querySelectorAll(".ramiel");
  if (!mounts.length) return;

  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* octahedron: 6 vertices, 8 triangular faces */
  const V = [
    [1, 0, 0], [-1, 0, 0],
    [0, 1, 0], [0, -1, 0],
    [0, 0, 1], [0, 0, -1],
  ];
  const F = [
    [2, 0, 4], [2, 4, 1], [2, 1, 5], [2, 5, 0],
    [3, 4, 0], [3, 1, 4], [3, 5, 1], [3, 0, 5],
  ];

  /* cobalt ramp, dark to lit - flat fills, hard facet edges, like the rest
     of the site's polygons */
  const RAMP = ["#0a1d4a", "#10306e", "#1a4494", "#2458c2", "#3f79e8", "#6ea3ff"];

  /* light from upper left, toward the viewer */
  const L = (() => {
    const v = [-0.35, -0.55, 0.85];
    const n = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / n, v[1] / n, v[2] / n];
  })();

  const TILT = 0.42; /* constant lean, so the spin reads as 3D */

  function build(mount) {
    const size = parseInt(mount.dataset.size, 10) || mount.clientWidth || 96;
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("shape-rendering", "crispEdges");
    const polys = F.map(() => {
      const p = document.createElementNS(ns, "polygon");
      svg.appendChild(p);
      return p;
    });
    mount.appendChild(svg);

    const ct = Math.cos(TILT), st = Math.sin(TILT);

    function pose(yaw) {
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      /* rotate each vertex: yaw about Y, then tilt about X */
      const pts = V.map(([x, y, z]) => {
        const x1 = x * cy + z * sy;
        const z1 = -x * sy + z * cy;
        const y2 = y * ct - z1 * st;
        const z2 = y * st + z1 * ct;
        return [x1, y2, z2];
      });

      /* paint order: farthest faces first */
      const order = F.map((f, i) => ({
        i,
        z: (pts[f[0]][2] + pts[f[1]][2] + pts[f[2]][2]) / 3,
      })).sort((a, b) => a.z - b.z);

      for (const { i } of order) {
        const [a, b, c] = F[i].map((vi) => pts[vi]);
        /* face normal */
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        let nx = uy * vz - uz * vy;
        let ny = uz * vx - ux * vz;
        let nz = ux * vy - uy * vx;
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;

        const p = polys[i];
        if (nz <= 0) {
          /* back face - painted over anyway, skip the work */
          p.setAttribute("points", "");
          continue;
        }
        const lit = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
        const shade = RAMP[Math.min(RAMP.length - 1, Math.floor(lit * RAMP.length))];
        p.setAttribute("fill", shade);
        p.setAttribute(
          "points",
          [a, b, c].map(([x, y]) => (50 + x * 42) + "," + (50 - y * 42)).join(" ")
        );
        /* re-append so DOM order matches paint order */
        svg.appendChild(p);
      }
    }

    if (still) {
      pose(0.66);
      return;
    }

    let running = false;
    function loop(t) {
      if (!running) return;
      pose(t / 4200); /* one turn roughly every 26 seconds */
      requestAnimationFrame(loop);
    }
    function start() {
      if (running) return;
      running = true;
      requestAnimationFrame(loop);
    }
    function stop() { running = false; }

    pose(0.66);
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
