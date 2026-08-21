/* Meteors.
 *
 * Every so often something falls across the sky above the ridgeline - a
 * thin bone streak, gone in under a second. Rare on purpose: the sky is
 * mostly empty, which is what makes the exception worth catching.
 *
 * Runs only in bands marked data-terrain, only while they are on screen,
 * and not at all under prefers-reduced-motion. #sky in the URL makes them
 * frequent, for anyone who wants the shower.
 */

(function () {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const bands = document.querySelectorAll(".facet-band[data-terrain]");
  if (!bands.length) return;

  const SHOWER = location.hash === "#sky";
  const MIN_GAP = SHOWER ? 500 : 7000;
  const VAR_GAP = SHOWER ? 700 : 16000;

  bands.forEach((band) => {
    let visible = false;

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        (es) => es.forEach((e) => (visible = e.isIntersecting)),
        { rootMargin: "40px" }
      ).observe(band);
    } else {
      visible = true;
    }

    function fall() {
      if (visible) {
        const m = document.createElement("span");
        m.className = "meteor";
        /* upper sky only - the ranges own the lower half */
        m.style.left = 8 + Math.random() * 70 + "%";
        m.style.top = 4 + Math.random() * 30 + "%";
        band.appendChild(m);
        requestAnimationFrame(() => m.classList.add("down"));
        setTimeout(() => m.remove(), 1100);
      }
      setTimeout(fall, MIN_GAP + Math.random() * VAR_GAP);
    }
    setTimeout(fall, 1200 + Math.random() * 4000);
  });
})();
