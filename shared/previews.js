/* Previews: one real picture per project - a screenshot of the thing running,
 * a photo of the hardware, or the plot from the paper. Nothing drawn or
 * generated. Files live in previews/ (JPEG, at most 960 px wide).
 *
 * script.js asks for a preview by project title; a title with no entry gets
 * the hatched placeholder, which is the honest answer until there is a real
 * screenshot to show.
 */

(function () {
  const P = {
    "Drone Strike Map": "/previews/drone-strike-map.jpg",
    "SHELLFALL": "/previews/shellfall.jpg",
    "THUNDER": "/previews/thunder.jpg",
    "Sheet2Tab": "/previews/sheet2tab.jpg",
    "Chess Vision Bot": "/previews/chess-vision-bot.jpg",
    "YT Grab": "/previews/yt-grab.jpg",
    "MoveGrade": "/previews/movegrade.jpg",
    "Advent of Code 2025": "/previews/advent-of-code-2025.jpg",
    "Durak": "/previews/durak.jpg",
    "Yavalath & Pentalath": "/previews/yavalath.jpg",
    "Project Euler": "/previews/project-euler.jpg",
    "LeetCode": "/previews/leetcode.jpg",
    "Shooting scores": "/previews/shooting-scores.jpg",
    "Aimtrainer": "/previews/aimtrainer.jpg",
    "This website": "/previews/this-website.jpg",
    "Yagi-Uda radar": "/previews/yagi-uda-radar.jpg",
    "CanSat 2025": "/previews/cansat-2025.jpg",
    "Neural scaling laws": "/previews/neural-scaling-laws.jpg",
    "Globular clusters": "/previews/globular-clusters.jpg",
    "Drawer": "/previews/drawer.jpg",
  };

  window.projectPreviewSrc = function (title) {
    return P[title] || null;
  };

  window.projectPreview = function (title) {
    const src = P[title];
    if (!src) return null;
    return '<img src="' + src + '" alt="" loading="lazy" decoding="async">';
  };
})();
