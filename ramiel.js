/* The visitor.
 *
 * Idle, he is the octahedron, turning. Nothing more.
 *
 * CLICK him and the film's firing sequence runs, still and deliberate -
 * he does not shake:
 *
 *   1. The turn decays and he comes about to face LEFT.
 *   2. Only the front - the bit facing the firing line - extends.
 *   3. The body SPLITS into five prolonged octahedrons that PIVOT about
 *      a point near the tail, so the noses fan open toward the target
 *      while the back stays gathered and roughly octahedral, exposing
 *      the red core at the centre.
 *   4. The beam fires from the core, out across the country.
 *   5. The petals close, merge, and the octahedron resumes its turn.
 *
 * The trick that keeps the split honest: from the moment the stretch
 * begins, the body is ALREADY five coincident octahedrons. Coincident,
 * they render as one solid to the pixel; stretching is all five
 * elongating in place, and the split is only their centres parting. No
 * crossfade, no model swap, no seam.
 *
 * Flat faces carry no drawn lines: edges are detected per frame and drawn
 * only along silhouettes and true creases, in pale luminous blue. Faces
 * are stroked in their own fill to close antialiasing seams. All of it is
 * arithmetic in an SVG - no WebGL, no textures, no image files.
 *
 * Every phase is a pure function of absolute elapsed time, never of frame
 * deltas, so a throttled or coalesced frame schedule cannot stall the
 * sequence - the delta-integrated version demonstrably could.
 *
 * Under prefers-reduced-motion he holds one octahedral pose, unprovokable.
 */

(function () {
  const mounts = document.querySelectorAll(".ramiel");
  if (!mounts.length) return;

  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const NS = "http://www.w3.org/2000/svg";

  /* ================= meshes ================= */

  const OCTA_V = [
    [1, 0, 0], [-1, 0, 0],
    [0, 1, 0], [0, -1, 0],
    [0, 0, 1], [0, 0, -1],
  ];
  const OCTA_F = [
    [2, 0, 4], [2, 4, 1], [2, 1, 5], [2, 5, 0],
    [3, 4, 0], [3, 1, 4], [3, 5, 1], [3, 0, 5],
  ];

  /* the idle body: subdivided twice for a fine silhouette */
  function subdivided(verts, faces, times) {
    let V = verts.map((v) => v.slice());
    let F = faces.map((f) => f.slice());
    for (let s = 0; s < times; s++) {
      const mid = {};
      const nf = [];
      const midpoint = (a, b) => {
        const key = a < b ? a + "_" + b : b + "_" + a;
        if (key in mid) return mid[key];
        const va = V[a], vb = V[b];
        V.push([(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2]);
        return (mid[key] = V.length - 1);
      };
      for (const [a, b, c] of F) {
        const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
        nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
      }
      F = nf;
    }
    return { V, F };
  }

  function edgesOf(F) {
    const map = {};
    F.forEach((f, fi) => {
      for (let k = 0; k < 3; k++) {
        const a = f[k], b = f[(k + 1) % 3];
        const key = a < b ? a + "_" + b : b + "_" + a;
        (map[key] = map[key] || { a, b, f: [] }).f.push(fi);
      }
    });
    return Object.values(map).filter((e) => e.f.length === 2);
  }

  const MAIN = subdivided(OCTA_V, OCTA_F, 2);
  MAIN.E = edgesOf(MAIN.F);

  /* the petal scene: five octahedrons in one topology. Petal k owns
     vertices [k*6, k*6+6); its parting direction around the beam axis is
     fixed at build time. */
  const PETALS = 5;
  const PETAL_DIR = [];
  const PSCENE = { V: [], F: [] };
  for (let k = 0; k < PETALS; k++) {
    const th = Math.PI / 2 + (k * 2 * Math.PI) / PETALS;
    PETAL_DIR.push([0, Math.cos(th), Math.sin(th)]);
    for (const v of OCTA_V) PSCENE.V.push(v.slice());
    for (const f of OCTA_F) PSCENE.F.push([f[0] + k * 6, f[1] + k * 6, f[2] + k * 6]);
  }
  PSCENE.E = edgesOf(PSCENE.F);

  /* ================= timing ================= */

  const SPIN = 1 / 4.2; /* idle angular velocity, rad/s */
  const ALIGN = 1.7, STRETCH = 0.9, SPLIT = 1.0, FIRE = 1.05, CLOSE = 1.2;
  const T1 = ALIGN, T2 = T1 + STRETCH, T3 = T2 + SPLIT, T4 = T3 + FIRE, T5 = T4 + CLOSE;

  const smooth = (t) => t * t * (3 - 2 * t);

  /* The prolonged petal. Only vertices AHEAD of centre stretch - the tail
     keeps its octahedral extent - and the thinning tapers toward the nose,
     so the rear half stays full-bodied. The split is a PIVOT: each petal
     rotates about a point near the tail, fanning the noses apart. */
  const STRETCH_X = 1.8;   /* how far the nose reaches */
  const THIN_YZ = 0.5;     /* nose cross-section at full stretch */
  const FAN = 0.4;         /* radians of pivot at full spread */
  const PIVOT_X = 0.85;    /* the hinge, just short of the tail tip */

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

  const TILT = -0.18;
  const FIRE_TILT = -0.12;
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

    /* one polygon pool serves both scenes */
    const POOL = Math.max(MAIN.F.length, PSCENE.F.length);
    const polys = [];
    for (let i = 0; i < POOL; i++) {
      const p = document.createElementNS(NS, "polygon");
      p.setAttribute("stroke-width", "0.5");
      p.setAttribute("stroke-linejoin", "round");
      svg.appendChild(p);
      polys.push(p);
    }

    const edgePath = document.createElementNS(NS, "path");
    edgePath.setAttribute("fill", "none");
    edgePath.setAttribute("stroke", "#bcd6ff");
    edgePath.setAttribute("stroke-width", "0.55");
    edgePath.setAttribute("stroke-opacity", "0.85");
    edgePath.setAttribute("stroke-linecap", "round");
    svg.appendChild(edgePath);

    /* the core: RED - the site's own red, with a hot centre */
    const coreOuter = document.createElementNS(NS, "circle");
    coreOuter.setAttribute("fill", "#ff2d16");
    const coreInner = document.createElementNS(NS, "circle");
    coreInner.setAttribute("fill", "#ffb3a0");
    [coreOuter, coreInner].forEach((c) => {
      c.setAttribute("cx", "50");
      c.setAttribute("cy", "50");
      c.setAttribute("r", "0");
      svg.appendChild(c);
    });

    mount.appendChild(svg);

    const band = mount.closest(".facet-band");
    let beam = null, muzzle = null;
    if (band) {
      beam = document.createElement("div");
      beam.className = "ramiel-beam";
      muzzle = document.createElement("div");
      muzzle.className = "ramiel-muzzle";
      band.append(beam, muzzle);
    }

    const scratch = [];
    const normals = [];
    const depths = [];

    /* project a prepared model-space vertex list and paint it */
    function renderScene(model, faces, edges, yaw, tilt) {
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      const cy = Math.cos(yaw), sy = Math.sin(yaw);

      for (let i = 0; i < model.length; i++) {
        const x = model[i][0], y = model[i][1], z = model[i][2];
        const x1 = x * cy + z * sy;
        const z1 = -x * sy + z * cy;
        scratch[i] = [x1, y * ct - z1 * st, y * st + z1 * ct];
      }

      const order = [];
      for (let fi = 0; fi < faces.length; fi++) {
        const [ia, ib, ic] = faces[fi];
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
        const [ia, ib, ic] = faces[fi];
        p.setAttribute(
          "points",
          [scratch[ia], scratch[ib], scratch[ic]]
            .map(([x, y]) => (50 + x * SC).toFixed(2) + "," + (50 - y * SC).toFixed(2))
            .join(" ")
        );
        svg.appendChild(p);
      }
      for (let i = used; i < POOL; i++) polys[i].setAttribute("points", "");
      svg.appendChild(coreOuter);
      svg.appendChild(coreInner);
      svg.appendChild(edgePath);

      let d = "";
      for (const e of edges) {
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

    function drawMain(yaw, tilt) {
      renderScene(MAIN.V, MAIN.F, MAIN.E, yaw, tilt);
    }

    /* the five petals: stretch 0..1 extends the noses in place; spread
       0..1 pivots each petal about the tail hinge, fanning the front open
       while the back stays gathered */
    const petalModel = PSCENE.V.map(() => [0, 0, 0]);
    function drawPetals(stretch, spread, tilt) {
      const sx = 1 + (STRETCH_X - 1) * stretch;
      const phi = FAN * spread;
      const cph = Math.cos(phi), sph = Math.sin(phi);
      for (let k = 0; k < PETALS; k++) {
        const dy = PETAL_DIR[k][1], dz = PETAL_DIR[k][2];
        for (let i = 0; i < 6; i++) {
          const v = OCTA_V[i];
          /* only the front extends; thinning tapers toward the nose */
          const x = v[0] < 0 ? v[0] * sx : v[0];
          const nose = Math.max(0, -v[0]);
          const syz = 1 - (1 - THIN_YZ) * stretch * nose;
          const y = v[1] * syz, z = v[2] * syz;
          /* pivot in the (x, d) plane about the tail hinge: the nose
             (ahead of the hinge) swings outward along +d */
          const b = y * dy + z * dz;       /* component along the petal's d */
          const c = -y * dz + z * dy;      /* component across it */
          const u = x - PIVOT_X;
          const u2 = u * cph + b * sph;
          const b2 = -u * sph + b * cph;
          const m = petalModel[k * 6 + i];
          m[0] = u2 + PIVOT_X;
          m[1] = b2 * dy - c * dz;
          m[2] = b2 * dz + c * dy;
        }
      }
      renderScene(petalModel, PSCENE.F, PSCENE.E, 0, tilt);
    }

    function setCore(k) {
      coreOuter.setAttribute("r", (3.6 * k).toFixed(2));
      coreInner.setAttribute("r", (1.5 * k).toFixed(2));
    }

    function setBeam(on, intensity) {
      if (!beam) return;
      if (!on) {
        beam.style.opacity = "0";
        muzzle.style.opacity = "0";
        return;
      }
      const mr = mount.getBoundingClientRect();
      const br = band.getBoundingClientRect();
      const cx = mr.left - br.left + mr.width / 2;
      const cyy = mr.top - br.top + mr.height / 2;
      beam.style.width = Math.max(0, cx) + "px";
      beam.style.top = cyy - 2 + "px";
      beam.style.opacity = String(intensity);
      /* the flash sits on the core - the beam is fired FROM it */
      muzzle.style.left = cx + "px";
      muzzle.style.top = cyy + "px";
      muzzle.style.opacity = String(intensity);
      muzzle.style.transform =
        "translate(-50%, -50%) scale(" + (0.7 + 0.6 * intensity) + ")";
    }

    function setGlow(k) {
      const blur = 16 + 26 * k;
      const a = 0.22 + 0.45 * k;
      svg.style.filter =
        "drop-shadow(0 0 " + blur.toFixed(0) + "px rgba(" +
        Math.round(100 + 120 * k) + ", " + Math.round(150 + 40 * k) + ", 255, " + a.toFixed(2) + "))";
    }

    /* ---------- the clock ---------- */

    if (still) {
      drawMain(0.66, TILT);
      return;
    }

    let running = false;
    let firing = false;
    let idleStart = null;
    let yawBase = 0.66;
    let fireStart = 0;
    let yawAtAlign = 0;

    function idleYaw(now) {
      if (idleStart === null) idleStart = now;
      return yawBase + ((now - idleStart) / 1000) * SPIN;
    }

    mount.addEventListener("click", () => {
      if (firing || still) return;
      firing = true;
      fireStart = performance.now();
      yawAtAlign = idleYaw(fireStart) % (Math.PI * 2);
    });

    function frame() {
      if (!running) return;
      const now = performance.now();

      const rect = mount.getBoundingClientRect();
      const vp = (rect.top + rect.height / 2 - innerHeight / 2) / innerHeight;
      const scrollTilt = Math.max(-0.4, Math.min(0.08, TILT - vp * 0.28));

      if (!firing) {
        mount.classList.remove("locked");
        drawMain(idleYaw(now), scrollTilt);
        setCore(0);
        setBeam(false, 0);
        setGlow(0);
      } else {
        mount.classList.add("locked");
        const ft = (now - fireStart) / 1000;

        if (ft < T1) {
          /* the turn decays into the stop: a Hermite curve whose slope
             starts at the live spin rate and ends at zero */
          const k = ft / ALIGN;
          const from = yawAtAlign % (Math.PI * 2);
          const target = Math.PI * 2 * Math.ceil((from + 0.35) / (Math.PI * 2));
          const h00 = 2 * k * k * k - 3 * k * k + 1;
          const h10 = k * k * k - 2 * k * k + k;
          const h01 = -2 * k * k * k + 3 * k * k;
          const y = from * h00 + SPIN * ALIGN * h10 + target * h01;
          const kk = smooth(k);
          drawMain(y, scrollTilt * (1 - kk) + FIRE_TILT * kk);
          setCore(0);
          setGlow(0);
        } else if (ft < T2) {
          /* the front stretches toward the target */
          const k = smooth((ft - T1) / STRETCH);
          drawPetals(k, 0, FIRE_TILT);
          setCore(0);
          setGlow(k * 0.4);
        } else if (ft < T3) {
          /* the spindle splits into five; the red core is exposed */
          const k = smooth((ft - T2) / SPLIT);
          drawPetals(1, k, FIRE_TILT);
          setCore(k);
          setGlow(0.4 + 0.6 * k);
        } else if (ft < T4) {
          /* the beam, from the core. He holds perfectly still. */
          const k = (ft - T3) / FIRE;
          const flicker = 0.82 + 0.18 * Math.sin(now / 9);
          drawPetals(1, 1, FIRE_TILT);
          setCore(1);
          setBeam(true, k < 0.08 ? k / 0.08 : flicker);
          setGlow(1);
        } else if (ft < T5) {
          /* the petals close and merge */
          const k = smooth((ft - T4) / CLOSE);
          drawPetals(1 - k, 1 - k, FIRE_TILT * (1 - k) + scrollTilt * k);
          setCore(1 - k);
          setBeam(true, Math.max(0, 0.5 * (1 - k * 2.2)));
          setGlow(1 - k);
        } else {
          firing = false;
          yawBase = 0;
          idleStart = now;
          setBeam(false, 0);
          setCore(0);
          setGlow(0);
        }
      }
      requestAnimationFrame(frame);
    }

    function start() {
      if (running) return;
      running = true;
      idleStart = null;
      requestAnimationFrame(frame);
    }
    function stop() {
      if (running && !firing) {
        yawBase = idleYaw(performance.now()) % (Math.PI * 2);
        idleStart = null;
      }
      running = false;
      setBeam(false, 0);
    }

    drawMain(0.66, TILT);
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
