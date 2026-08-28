/* The country, properly surveyed.
 *
 * Any .facet-band[data-terrain] gets its hand-drawn placeholder replaced by
 * a procedurally triangulated landscape: three ranges at three depths, each
 * a ridgeline meshed into triangles whose flat shading follows the slope -
 * west flanks catch the light, east flanks fall into shadow, with a little
 * per-facet grain so the ground reads as rock rather than wallpaper. The
 * PRNG is seeded, so every visitor sees the same country every visit.
 *
 * Scrolling moves the ranges at different rates - the far ridge barely, the
 * near ridge most - so the terrain has parallax depth rather than sitting
 * on the page like a sticker. Under prefers-reduced-motion the mesh still
 * builds (it is drawing, not motion) but nothing shifts. Without this
 * script the static SVG fallback in the HTML simply remains.
 */

(function () {
  const bands = document.querySelectorAll(".facet-band[data-terrain]");
  if (!bands.length) return;

  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* deterministic PRNG - the same landscape on every visit */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hex(c) {
    return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  }

  function mix(a, b, t) {
    const A = hex(a), B = hex(b);
    return "rgb(" +
      Math.round(A[0] + (B[0] - A[0]) * t) + "," +
      Math.round(A[1] + (B[1] - A[1]) * t) + "," +
      Math.round(A[2] + (B[2] - A[2]) * t) + ")";
  }

  const W = 1440, H = 360, OVER = 90; /* overdraw so parallax never shows a seam */
  const NS = "http://www.w3.org/2000/svg";

  /* one range: ridgeline -> foothill row -> triangulated apron */
  function buildRange(rnd, g, opts) {
    const { top, amp, step, base, lit, dark } = opts;
    const pts = [];
    let x = -OVER;
    let y = top + rnd() * amp;
    while (x < W + OVER) {
      pts.push([x, y]);
      x += step * (0.65 + rnd() * 0.8);
      /* a biased walk: mostly gentle, occasionally a proper peak or col */
      const kick = rnd() < 0.22 ? 2.1 : 1;
      y = top + amp * 0.5 + (rnd() - 0.5) * amp * kick;
    }
    pts.push([W + OVER, top + rnd() * amp]);

    /* foothill row between ridge and valley floor */
    const foot = pts.map(([px, py]) => [
      px + (rnd() - 0.5) * step * 0.5,
      py + 46 + rnd() * 46,
    ]);

    const tris = [];
    for (let i = 0; i < pts.length - 1; i++) {
      tris.push({ p: [pts[i], pts[i + 1], foot[i]], up: true, slope: pts[i + 1][1] - pts[i][1] });
      tris.push({ p: [pts[i + 1], foot[i + 1], foot[i]], up: false, slope: foot[i + 1][1] - foot[i][1] });
    }

    for (const t of tris) {
      const poly = document.createElementNS(NS, "polygon");
      poly.setAttribute("points", t.p.map((q) => q[0].toFixed(1) + "," + q[1].toFixed(1)).join(" "));
      /* every facet edge drawn as a hairline of the page's own black, kept
         at 1px whatever the band stretches to - the same line the rest of
         the site rules with */
      poly.setAttribute("stroke", "rgba(10, 10, 10, 0.75)");
      poly.setAttribute("stroke-width", "1");
      poly.setAttribute("vector-effect", "non-scaling-stroke");
      /* slope shading: rising-westward faces take the light */
      const s = Math.max(-1, Math.min(1, t.slope / 55));
      const grain = (rnd() - 0.5) * 0.16;
      const k = Math.max(0, Math.min(1, 0.5 - s * 0.5 + grain));
      poly.setAttribute("fill", k > 0.5 ? mix(base, lit, (k - 0.5) * 2) : mix(base, dark, (0.5 - k) * 2));
      g.appendChild(poly);
      t.el = poly;
    }

    /* solid apron from the foothills to well past the bottom edge */
    const apron = document.createElementNS(NS, "polygon");
    apron.setAttribute(
      "points",
      foot.map((q) => q[0].toFixed(1) + "," + q[1].toFixed(1)).join(" ") +
        " " + (W + OVER) + "," + (H + OVER) + " " + -OVER + "," + (H + OVER)
    );
    /* the apron resolves to the page itself, so the band's lower edge
       dissolves instead of seaming */
    apron.setAttribute("fill", opts.floor || mix(base, dark, 0.45));
    g.appendChild(apron);

    return tris;
  }

  function build(band) {
    const old = band.querySelector("svg");
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("shape-rendering", "crispEdges");
    /* the SVG clips its own overdraw; the band must NOT clip, or anything
       rising above the horizon - the visitor - loses its head */
    svg.style.cssText = "display:block;width:100%;height:100%;overflow:hidden;";

    const rnd = mulberry32(1995);
    const layers = [];

    const far = document.createElementNS(NS, "g");
    buildRange(rnd, far, { top: 118, amp: 84, step: 96, base: "#1a1b20", lit: "#23252d", dark: "#131419" });
    svg.appendChild(far);
    layers.push({ g: far, fy: 8, fx: 0 });

    const mid = document.createElementNS(NS, "g");
    buildRange(rnd, mid, { top: 186, amp: 76, step: 120, base: "#121317", lit: "#1a1c22", dark: "#0c0d11" });
    svg.appendChild(mid);
    layers.push({ g: mid, fy: 22, fx: 0 });

    const near = document.createElementNS(NS, "g");
    buildRange(rnd, near, { top: 252, amp: 70, step: 150, base: "#0c0d10", lit: "#14161c", dark: "#060708", floor: "#0a0a0a" });
    svg.appendChild(near);
    layers.push({ g: near, fy: 40, fx: 0 });

    if (old) old.replaceWith(svg);
    else band.insertBefore(svg, band.firstChild);

    return layers;
  }

  const all = [];
  bands.forEach((band) => all.push({ band, layers: build(band) }));

  if (still) return;

  /* parallax, vertical only: each range rises and falls by its own factor
     of the band's travel through the viewport, so depth comes from the
     scroll direction the reader is actually moving in */
  let ticking = false;
  function apply() {
    const vh = window.innerHeight;
    for (const { band, layers } of all) {
      const r = band.getBoundingClientRect();
      if (r.bottom < -80 || r.top > vh + 80) continue;
      const p = (r.top + r.height / 2 - vh / 2) / vh; /* -0.5 .. 0.5ish */
      for (const l of layers) {
        l.g.setAttribute("transform", "translate(" + (p * l.fx).toFixed(1) + " " + (p * l.fy).toFixed(1) + ")");
      }
    }
    ticking = false;
  }
  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(apply);
    }
  }
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll, { passive: true });
  apply();
})();
