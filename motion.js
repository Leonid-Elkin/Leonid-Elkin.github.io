/* Motion. Nothing here is content: delete this file and the site is the same
 * site, just still.
 *
 * Two jobs:
 *   1. Tag the document `motion-ok` so the stylesheet knows scripting is
 *      alive - every hidden-until-revealed state is scoped to that class,
 *      which is what keeps a no-JS visitor from staring at an empty page.
 *   2. Watch the page and reveal each block the first time it scrolls into
 *      view, with a small stagger inside a group so rows deal like cards
 *      rather than arriving as one slab.
 *
 * prefers-reduced-motion wins over all of it: we bail before tagging, so the
 * page renders complete and motionless.
 */

(function () {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!("IntersectionObserver" in window)) return;

  document.documentElement.classList.add("motion-ok");

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("in-view");
        io.unobserve(e.target);
      });
    },
    { rootMargin: "0px 0px -60px 0px", threshold: 0.05 }
  );

  const GROUPS = [
    ".section-head",
    ".hero-deck",
    ".about-copy",
    ".fact-list",
    ".role",
    ".edu",
    ".skill-col",
    ".select-row",
    ".project-card",
    ".setup",
    ".filter-row",
  ];

  function arm(root) {
    GROUPS.forEach((sel) => {
      root.querySelectorAll(sel).forEach((n, i) => {
        if (n.classList.contains("reveal")) return;
        n.classList.add("reveal");
        /* stagger within a selector group, capped so a long index does not
           keep a reader waiting for row nineteen */
        n.style.transitionDelay = Math.min(i % 8, 5) * 70 + "ms";
        io.observe(n);
      });
    });
  }

  function start() {
    arm(document);
    /* the project index and skill columns are rendered by script.js after
       DOMContentLoaded; a second pass picks up whatever appeared */
    setTimeout(() => arm(document), 120);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
