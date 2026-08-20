/* Previews: one small drawn vignette per project, in the same two inks as
 * everything else. These are diagrams, not screenshots - a strike map is
 * squares on a grid, a score is staves, a target is rings - so the site's
 * zero-image rule holds and nothing here can go stale or 404.
 *
 * script.js asks for a preview by project title; a title with no entry gets
 * the hatched placeholder, which is the honest answer. All static SVG - the
 * moving figures (the cluster, the visitor) live elsewhere.
 */

(function () {
  const BONE = "#8b8880";
  const DIM = "#3a3a3a";
  const RED = "#ff2d16";

  /* every preview shares one stage: 120x80, transparent ground */
  const wrap = (inner) =>
    '<svg viewBox="0 0 120 80" shape-rendering="crispEdges" aria-hidden="true">' + inner + "</svg>";

  const P = {
    "Drone Strike Map": wrap(
      '<g stroke="' + DIM + '" stroke-width="1">' +
        '<line x1="0" y1="20" x2="120" y2="20"/><line x1="0" y1="40" x2="120" y2="40"/><line x1="0" y1="60" x2="120" y2="60"/>' +
        '<line x1="30" y1="0" x2="30" y2="80"/><line x1="60" y1="0" x2="60" y2="80"/><line x1="90" y1="0" x2="90" y2="80"/></g>' +
        '<polygon points="18,52 42,30 70,38 88,24 106,44 84,62 46,66" fill="none" stroke="' + BONE + '" stroke-width="1"/>' +
        '<g fill="' + RED + '"><rect x="38" y="42" width="4" height="4"/><rect x="56" y="34" width="4" height="4"/>' +
        '<rect x="74" y="48" width="4" height="4"/><rect x="64" y="56" width="4" height="4"/><rect x="90" y="38" width="4" height="4"/></g>'
    ),
    "SHELLFALL": wrap(
      '<line x1="0" y1="58" x2="120" y2="58" stroke="' + BONE + '" stroke-width="1"/>' +
        '<rect x="10" y="42" width="16" height="16" fill="' + BONE + '"/><rect x="14" y="34" width="8" height="8" fill="' + BONE + '"/>' +
        '<polygon points="88,58 112,58 106,50 94,50" fill="' + BONE + '"/><rect x="98" y="42" width="4" height="8" fill="' + BONE + '"/>' +
        '<path d="M 26 40 Q 60 4 96 48" fill="none" stroke="' + RED + '" stroke-width="1.5" stroke-dasharray="4 4"/>'
    ),
    "Sheet2Tab": wrap(
      '<g stroke="' + DIM + '" stroke-width="1"><line x1="8" y1="14" x2="112" y2="14"/><line x1="8" y1="20" x2="112" y2="20"/>' +
        '<line x1="8" y1="26" x2="112" y2="26"/><line x1="8" y1="32" x2="112" y2="32"/><line x1="8" y1="38" x2="112" y2="38"/></g>' +
        '<g fill="' + BONE + '"><ellipse cx="34" cy="20" rx="4" ry="3"/><ellipse cx="58" cy="26" rx="4" ry="3"/><ellipse cx="82" cy="17" rx="4" ry="3"/></g>' +
        '<g stroke="' + DIM + '" stroke-width="1"><line x1="8" y1="56" x2="112" y2="56"/><line x1="8" y1="63" x2="112" y2="63"/><line x1="8" y1="70" x2="112" y2="70"/></g>' +
        '<g fill="' + RED + '" font-family="monospace" font-size="9"><text x="31" y="60">0</text><text x="55" y="67">2</text><text x="79" y="60">3</text></g>'
    ),
    "Chess Vision Bot": wrap(
      '<g fill="' + DIM + '"><rect x="24" y="8" width="16" height="16"/><rect x="56" y="8" width="16" height="16"/>' +
        '<rect x="40" y="24" width="16" height="16"/><rect x="72" y="24" width="16" height="16"/>' +
        '<rect x="24" y="40" width="16" height="16"/><rect x="56" y="40" width="16" height="16"/>' +
        '<rect x="40" y="56" width="16" height="16"/><rect x="72" y="56" width="16" height="16"/></g>' +
        '<rect x="56" y="40" width="16" height="16" fill="' + RED + '"/>' +
        '<g stroke="' + BONE + '" stroke-width="1" fill="none"><line x1="64" y1="30" x2="64" y2="42"/><line x1="64" y1="54" x2="64" y2="66"/>' +
        '<line x1="46" y1="48" x2="58" y2="48"/><line x1="70" y1="48" x2="82" y2="48"/></g>'
    ),
    "Yavalath & Pentalath": wrap(
      (() => {
        const hex = (cx, cy, fill) => {
          let pts = "";
          for (let i = 0; i < 6; i++) {
            const a = Math.PI / 3 * i + Math.PI / 6;
            pts += (cx + 9 * Math.cos(a)).toFixed(1) + "," + (cy + 9 * Math.sin(a)).toFixed(1) + " ";
          }
          return '<polygon points="' + pts + '" fill="' + fill + '" stroke="#0a0a0a" stroke-width="1"/>';
        };
        return hex(45, 30, DIM) + hex(61, 30, DIM) + hex(37, 44, DIM) + hex(53, 44, RED) + hex(69, 44, DIM) + hex(45, 58, DIM) + hex(61, 58, DIM);
      })()
    ),
    "Project Euler": wrap(
      '<text x="18" y="54" font-family="Georgia,serif" font-size="40" fill="' + BONE + '">&#931;</text>' +
        '<g fill="' + RED + '" font-family="monospace" font-size="10"><text x="52" y="38">233168</text></g>' +
        '<g fill="' + DIM + '" font-family="monospace" font-size="8"><text x="52" y="54">n &lt; 1000</text><text x="52" y="66">3 | n, 5 | n</text></g>'
    ),
    "Shooting scores": wrap(
      '<g fill="none" stroke="' + DIM + '" stroke-width="1"><circle cx="60" cy="40" r="30"/><circle cx="60" cy="40" r="20"/><circle cx="60" cy="40" r="10"/></g>' +
        '<g fill="' + RED + '"><rect x="56" y="34" width="3" height="3"/><rect x="63" y="40" width="3" height="3"/>' +
        '<rect x="58" y="44" width="3" height="3"/><rect x="66" y="35" width="3" height="3"/></g>' +
        '<rect x="42" y="52" width="3" height="3" fill="' + BONE + '"/>'
    ),
    "Aimtrainer": wrap(
      '<g fill="none" stroke="' + DIM + '" stroke-width="1.5"><circle cx="30" cy="26" r="12"/><circle cx="88" cy="52" r="9"/></g>' +
        '<circle cx="64" cy="38" r="14" fill="none" stroke="' + RED + '" stroke-width="2"/>' +
        '<circle cx="64" cy="38" r="3" fill="' + RED + '"/>'
    ),
    "This website": wrap(
      '<rect x="14" y="14" width="22" height="22" fill="' + RED + '"/>' +
        '<g stroke="' + BONE + '" stroke-width="1"><line x1="46" y1="18" x2="106" y2="18"/><line x1="46" y1="28" x2="92" y2="28"/></g>' +
        '<g stroke="' + DIM + '" stroke-width="1"><line x1="14" y1="48" x2="106" y2="48"/><line x1="14" y1="58" x2="106" y2="58"/><line x1="14" y1="68" x2="80" y2="68"/></g>'
    ),
    "Yagi-Uda radar": wrap(
      '<line x1="14" y1="40" x2="106" y2="40" stroke="' + BONE + '" stroke-width="1.5"/>' +
        '<g stroke="' + BONE + '" stroke-width="2"><line x1="22" y1="16" x2="22" y2="64"/><line x1="40" y1="20" x2="40" y2="60"/>' +
        '<line x1="56" y1="23" x2="56" y2="57"/><line x1="70" y1="25" x2="70" y2="55"/><line x1="82" y1="27" x2="82" y2="53"/></g>' +
        '<g fill="none" stroke="' + RED + '" stroke-width="1"><path d="M 92 30 A 14 14 0 0 1 92 50"/><path d="M 98 24 A 22 22 0 0 1 98 56"/></g>'
    ),
    "CanSat 2025": wrap(
      '<rect x="48" y="22" width="24" height="40" fill="none" stroke="' + BONE + '" stroke-width="1.5"/>' +
        '<line x1="48" y1="32" x2="72" y2="32" stroke="' + DIM + '" stroke-width="1"/>' +
        '<line x1="48" y1="52" x2="72" y2="52" stroke="' + DIM + '" stroke-width="1"/>' +
        '<line x1="60" y1="22" x2="60" y2="8" stroke="' + RED + '" stroke-width="1.5"/>' +
        '<g fill="none" stroke="' + RED + '" stroke-width="1"><path d="M 52 12 A 11 11 0 0 1 68 12"/><path d="M 46 8 A 18 18 0 0 1 74 8"/></g>'
    ),
    "Neural scaling laws": wrap(
      '<g stroke="' + DIM + '" stroke-width="1"><line x1="16" y1="8" x2="16" y2="66"/><line x1="16" y1="66" x2="110" y2="66"/></g>' +
        '<polyline points="22,14 40,30 58,42 76,50 94,56 106,59" fill="none" stroke="' + RED + '" stroke-width="1.5"/>' +
        '<g fill="' + BONE + '"><rect x="20" y="12" width="4" height="4"/><rect x="38" y="28" width="4" height="4"/>' +
        '<rect x="56" y="40" width="4" height="4"/><rect x="74" y="48" width="4" height="4"/><rect x="92" y="54" width="4" height="4"/></g>'
    ),
    "Globular clusters": wrap(
      (() => {
        /* deterministic scatter, denser at the core */
        let dots = "";
        let seed = 7;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        for (let i = 0; i < 26; i++) {
          const r = 26 * Math.pow(rnd(), 1.7);
          const a = rnd() * 6.283;
          dots += '<rect x="' + (60 + r * Math.cos(a)).toFixed(1) + '" y="' + (40 + r * Math.sin(a) * 0.7).toFixed(1) +
            '" width="2.4" height="2.4" fill="' + BONE + '"/>';
        }
        return dots +
          '<rect x="52" y="34" width="3" height="3" fill="' + RED + '"/><rect x="70" y="46" width="3" height="3" fill="' + RED + '"/>';
      })()
    ),
    "Drawer": wrap(
      (() => {
        /* the digit 3, on a 5x7 pixel grid */
        const rows = ["1111", "0001", "0001", "0111", "0001", "0001", "1111"];
        let px = "";
        rows.forEach((row, y) => {
          row.split("").forEach((c, x) => {
            if (c === "1") px += '<rect x="' + (42 + x * 9) + '" y="' + (9 + y * 9) + '" width="8" height="8" fill="' + BONE + '"/>';
          });
        });
        return px + '<rect x="42" y="36" width="8" height="8" fill="' + RED + '"/>';
      })()
    ),
  };

  window.projectPreview = function (title) {
    return P[title] || null;
  };
})();
