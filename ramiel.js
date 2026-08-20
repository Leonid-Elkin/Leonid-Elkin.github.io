/* The visitor. Maximum effort.
 *
 * Passive, he is what he is in the show: a featureless, glassy, deep-blue
 * octahedron - so flat faces carry NO drawn lines. Edges are detected per
 * frame instead: a line is drawn only where two faces meet at a real crease
 * or along the silhouette, and it is drawn in pale luminous blue, never
 * black, which is what gives him the lit-from-within glass look.
 *
 * The forms are the Rebuild set: a ring of needle-like diamonds, the drill
 * that drips from the bottom point and coils, the flattened hexagonal
 * pyramid, and - before firing - the cannon. Every form is one function
 * bending the same mesh (an octahedron subdivided twice: 66 vertices, 128
 * faces), so he flows between bodies rather than swapping models.
 *
 * Idle, he only turns and flows between his bodies. The firing sequence is
 * yours to trigger: CLICK him and he stops spinning, comes about to face
 * LEFT, deforms into the cannon, his core surfaces at the centre and splits
 * in four as the charge peaks - then the beam fires from the core, through
 * the body, out across the country. Then he cools, closes, and resumes the
 * turn.
 *
 * Still no WebGL, no textures, no image files - arithmetic only. Under
 * prefers-reduced-motion he holds one octahedral pose and never fires.
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

  function subdivide() {
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
  subdivide();
  subdivide(); /* 66 vertices, 128 faces */

  /* edge -> the two faces that share it, for crease/silhouette detection */
  const EDGES = (() => {
    const map = {};
    FACES.forEach((f, fi) => {
      for (let k = 0; k < 3; k++) {
        const a = f[k], b = f[(k + 1) % 3];
        const key = a < b ? a + "_" + b : b + "_" + a;
        (map[key] = map[key] || { a, b, f: [] }).f.push(fi);
      }
    });
    return Object.values(map);
  })();

  /* ================= the forms =================
     Each form bends a base vertex [x,y,z] (octahedron surface, |x|+|y|+|z|=1)
     into a new position. Sources: passive octahedron; the Rebuild attack
     bodies - needle ring, drill, hexagonal pyramid - and the firing cannon,
     which opens toward -x (screen left, once he has come about). */

  function fOcta(v) { return v; }

  /* a symmetric ring of needle-like diamonds: spikes along all six axes,
     the webs between them drawn thin */
  function fNeedles(v) {
    const m = Math.max(Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2]));
    const s = 0.5 + 1.15 * Math.pow(m, 4);
    return [v[0] * s, v[1] * s, v[2] * s];
  }

  /* the drill: the bottom point drips like melting glass and coils */
  function fDrill(v) {
    let [x, y, z] = v;
    if (y < 0) {
      const d = -y;               /* how far down the drip we are */
      const taper = Math.max(0.06, 1 - d * 0.95);
      const ang = d * 6.5;        /* the coil */
      const c = Math.cos(ang), s = Math.sin(ang);
      const nx = (x * c + z * s) * taper;
      const nz = (-x * s + z * c) * taper;
      return [nx, y * 2.25, nz];
    }
    return [x * 0.92, y * 0.9, z * 0.92];
  }

  /* the flattened hexagonal pyramid: cap above, cone below */
  function fPyramid(v) {
    let [x, y, z] = v;
    if (y >= 0) return [x * 1.22, y * 0.22, z * 1.22];
    const taper = Math.max(0.08, 1 + y * 0.9);
    return [x * taper, y * 1.45, z * taper];
  }

  /* the cannon, opening toward -x: flared crown behind, barrel ahead */
  function fCannon(v) {
    let [x, y, z] = v;
    if (x > 0) return [x * 1.12 + 0.16, y * 1.32, z * 1.32];
    return [x * 1.3, y * 0.48, z * 0.48];
  }

  const FORMS = [fOcta, fNeedles, fOcta, fDrill, fOcta, fPyramid];
  const HOLD = 3.2, MORPH = 1.6, PERIOD = HOLD + MORPH;
  const IDLE_TOTAL = FORMS.length * PERIOD;

  /* the firing block - entered only by a click */
  const ALIGN = 1.2, CHARGE = 1.8, FIRE = 1.05, COOL = 1.0;

  const smooth = (t) => t * t * (3 - 2 * t);
  const lerpV = (a, b, t) => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];

  /* ================= glass shading ================= */

  const DEEP = [7, 22, 66];      /* the body of the glass */
  const MID  = [30, 82, 196];
  const LITC = [132, 182, 255];
  const SHEEN = [214, 232, 255]; /* the mirror catch */

  function shade(diffuse, fresnel) {
    /* diffuse light plus a fresnel rim - faces edge-on to the viewer go
       pale, which is what sells translucency without transparency */
    let t = Math.pow(0.10 + 0.90 * diffuse, 0.95) + fresnel * 0.30;
    t = Math.min(1.18, t);
    let a, b, k;
    if (t < 0.5)      { a = DEEP; b = MID;   k = t / 0.5; }
    else if (t < 0.95) { a = MID;  b = LITC;  k = (t - 0.5) / 0.45; }
    else              { a = LITC; b = SHEEN; k = Math.min(1, (t - 0.95) / 0.23); }
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
  const SC = 27; /* mesh scale inside the 100-unit viewBox */

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
      /* stroked in its own fill colour: this closes the antialiasing seams
         between coplanar neighbours without drawing a visible line */
      p.setAttribute("stroke-width", "0.5");
      p.setAttribute("stroke-linejoin", "round");
      svg.appendChild(p);
      return p;
    });

    /* one path carries every lit edge; no polygon carries a stroke */
    const edgePath = document.createElementNS(NS, "path");
    edgePath.setAttribute("fill", "none");
    edgePath.setAttribute("stroke", "#bcd6ff");
    edgePath.setAttribute("stroke-width", "0.55");
    edgePath.setAttribute("stroke-opacity", "0.85");
    edgePath.setAttribute("stroke-linecap", "round");
    svg.appendChild(edgePath);

    /* the core: invisible until the charge calls it up; splits in four at
       the peak, as it does in Rebuild */
    const core = [0, 1, 2, 3].map(() => {
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("fill", "#ffd7ef");
      c.setAttribute("r", "0");
      c.setAttribute("cx", "50");
      c.setAttribute("cy", "50");
      svg.appendChild(c);
      return c;
    });

    mount.appendChild(svg);

    /* the beam lives in the band, behind the body, so it reads as fired
       from the core THROUGH the face */
    const band = mount.closest(".facet-band");
    let beam = null, muzzle = null;
    if (band) {
      beam = document.createElement("div");
      beam.className = "ramiel-beam";
      muzzle = document.createElement("div");
      muzzle.className = "ramiel-muzzle";
      band.append(beam, muzzle);
    }

    const scratch = new Array(VERTS.length);
    const normals = new Array(FACES.length);
    const depths = new Array(FACES.length);

    function pose(yaw, tilt, morphA, morphB, morphT, jitter, recoil) {
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      const cy = Math.cos(yaw), sy = Math.sin(yaw);

      for (let i = 0; i < VERTS.length; i++) {
        const bent = morphT <= 0 ? morphA(VERTS[i])
          : morphT >= 1 ? morphB(VERTS[i])
          : lerpV(morphA(VERTS[i]), morphB(VERTS[i]), morphT);
        const x = bent[0], y = bent[1], z = bent[2];
        const x1 = x * cy + z * sy;
        const z1 = -x * sy + z * cy;
        scratch[i] = [x1 + recoil, y * ct - z1 * st, y * st + z1 * ct];
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

      for (const fi of order) {
        const n = normals[fi];
        const p = polys[fi];
        if (n[2] <= 0) {
          p.setAttribute("points", "");
          continue;
        }
        const diffuse = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
        const fresnel = 1 - n[2];
        const col = shade(diffuse, fresnel);
        p.setAttribute("fill", col);
        p.setAttribute("stroke", col);
        const [ia, ib, ic] = FACES[fi];
        p.setAttribute(
          "points",
          [scratch[ia], scratch[ib], scratch[ic]]
            .map(([x, y]) => (50 + jitter + x * SC).toFixed(2) + "," + (50 - y * SC).toFixed(2))
            .join(" ")
        );
        svg.appendChild(p);
      }
      /* the core and the edges paint over the faces */
      core.forEach((c) => svg.appendChild(c));
      svg.appendChild(edgePath);

      /* edges: silhouette, and true creases only - a flat face shows nothing */
      let d = "";
      for (const e of EDGES) {
        const [f1, f2] = e.f;
        const front1 = normals[f1][2] > 0, front2 = normals[f2][2] > 0;
        let draw = false;
        if (front1 !== front2) draw = true; /* silhouette */
        else if (front1 && front2) {
          const n1 = normals[f1], n2 = normals[f2];
          const dot = n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2];
          if (dot < 0.995) draw = true;     /* a real crease */
        }
        if (draw) {
          const A = scratch[e.a], B = scratch[e.b];
          d += "M" + (50 + jitter + A[0] * SC).toFixed(2) + " " + (50 - A[1] * SC).toFixed(2) +
               "L" + (50 + jitter + B[0] * SC).toFixed(2) + " " + (50 - B[1] * SC).toFixed(2);
        }
      }
      edgePath.setAttribute("d", d);
    }

    /* ---------- core + beam dressing ---------- */

    function setCore(strength, split) {
      /* strength 0..1; split 0..1 spreads the four fragments */
      const r = 3.4 * strength;
      const off = 4.6 * split;
      const at = [[-off, 0], [off, 0], [0, -off], [0, off]];
      core.forEach((c, i) => {
        c.setAttribute("r", (i === 0 || split > 0 ? r * (split > 0 ? 0.62 : 1) : 0).toFixed(2));
        c.setAttribute("cx", (50 + at[i][0]).toFixed(2));
        c.setAttribute("cy", (50 + at[i][1]).toFixed(2));
        c.setAttribute("fill-opacity", String(0.25 + 0.75 * strength));
      });
      if (split === 0) {
        core[1].setAttribute("r", "0");
        core[2].setAttribute("r", "0");
        core[3].setAttribute("r", "0");
      }
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
      muzzle.style.left = cx - mr.width * 0.34 + "px";
      muzzle.style.top = cyy + "px";
      muzzle.style.opacity = String(intensity);
      muzzle.style.transform =
        "translate(-50%, -50%) scale(" + (0.7 + 0.6 * intensity) + ")";
    }

    function setGlow(k) {
      /* k 0 = idle, 1 = full charge */
      const blur = 16 + 26 * k;
      const a = 0.22 + 0.45 * k;
      svg.style.filter =
        "drop-shadow(0 0 " + blur.toFixed(0) + "px rgba(" +
        Math.round(100 + 120 * k) + ", " + Math.round(150 + 40 * k) + ", 255, " + a.toFixed(2) + "))";
    }

    /* ---------- the clock ---------- */

    if (still) {
      pose(0.66, TILT, fOcta, fOcta, 0, 0, 0);
      return;
    }

    /* Two states, and only a click moves between them. Idle time and yaw
       accumulate only while idle, so a shot never skips him ahead in his
       own cycle - he resumes exactly the turn he left. */
    let running = false;
    let firing = false;
    let idleClock = 0;
    let yaw = 0.66;
    let fireT = 0;
    let yawAtAlign = 0;
    let lastNow = null;

    mount.addEventListener("click", () => {
      if (firing || still) return;
      firing = true;
      fireT = 0;
      yawAtAlign = yaw % (Math.PI * 2);
    });

    function frame(now) {
      if (!running) return;
      if (lastNow === null) lastNow = now;
      const dt = Math.min((now - lastNow) / 1000, 0.05);
      lastNow = now;

      const r = mount.getBoundingClientRect();
      const vp = (r.top + r.height / 2 - innerHeight / 2) / innerHeight;
      let tilt = Math.max(-0.4, Math.min(0.08, TILT - vp * 0.28));

      if (!firing) {
        /* idle: turning, flowing between the passive forms */
        mount.classList.remove("locked");
        idleClock = (idleClock + dt) % IDLE_TOTAL;
        yaw += dt / 4.2;
        const idx = Math.floor(idleClock / PERIOD);
        const local = idleClock - idx * PERIOD;
        const A = FORMS[idx], B = FORMS[(idx + 1) % FORMS.length];
        const mt = local < HOLD ? 0 : smooth((local - HOLD) / MORPH);
        pose(yaw, tilt, A, B, mt, 0, 0);
        setCore(0, 0);
        setBeam(false, 0);
        setGlow(0);
      } else {
        /* the firing block: he stops, comes about to face left, and fires */
        mount.classList.add("locked");
        fireT += dt;
        const ft = fireT;

        if (ft < ALIGN) {
          const k = smooth(ft / ALIGN);
          /* shortest way round to yaw 0 */
          let from = yawAtAlign % (Math.PI * 2);
          if (from > Math.PI) from -= Math.PI * 2;
          pose(from * (1 - k), tilt * (1 - k) + -0.12 * k, fOcta, fOcta, 0, 0, 0);
          setCore(0, 0);
          setGlow(0);
        } else if (ft < ALIGN + CHARGE) {
          const k = smooth((ft - ALIGN) / CHARGE);
          const jitter = Math.sin(now / 14) * 0.65 * k;
          pose(0, -0.12, fOcta, fCannon, k, jitter, 0);
          setCore(Math.min(1, k * 1.3), k > 0.72 ? (k - 0.72) / 0.28 : 0);
          setGlow(k);
        } else if (ft < ALIGN + CHARGE + FIRE) {
          const k = (ft - ALIGN - CHARGE) / FIRE;
          const flicker = 0.82 + 0.18 * Math.sin(now / 9);
          const jitter = Math.sin(now / 8) * 0.9;
          pose(0, -0.12, fCannon, fCannon, 0, jitter, 0.14);
          setCore(1, 1);
          setBeam(true, k < 0.08 ? k / 0.08 : flicker);
          setGlow(1);
        } else if (ft < ALIGN + CHARGE + FIRE + COOL) {
          const k = smooth((ft - ALIGN - CHARGE - FIRE) / COOL);
          pose(0, -0.12 * (1 - k) + tilt * k, fCannon, fOcta, k, 0, (1 - k) * 0.08);
          setCore(1 - k, 1 - k);
          setBeam(true, Math.max(0, 0.6 * (1 - k * 1.6)));
          setGlow(1 - k);
        } else {
          /* holstered: resume the turn from dead ahead */
          firing = false;
          yaw = 0;
          setBeam(false, 0);
          setCore(0, 0);
          setGlow(0);
        }
      }
      requestAnimationFrame(frame);
    }

    function start() {
      if (running) return;
      running = true;
      lastNow = null;
      requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      setBeam(false, 0);
    }

    pose(0.66, TILT, fOcta, fOcta, 0, 0, 0);
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
