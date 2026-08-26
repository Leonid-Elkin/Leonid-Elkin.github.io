/* Meteors.
 *
 * Every so often something falls across the sky above the ridgeline - a
 * thin bone streak, gone in under a second. Rare on purpose: the sky is
 * mostly empty, which is what makes the exception worth catching.
 *
 * Runs only in bands marked data-terrain, only while they are on screen,
 * and not at all under prefers-reduced-motion. #sky in the URL makes them
 * frequent, for anyone who wants the shower - and it is read live, so adding
 * or removing the hash on an open page changes the weather without a reload.
 */

(function () {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const bands = document.querySelectorAll(".facet-band[data-terrain]");
  if (!bands.length) return;

  let shower = location.hash === "#sky";
  window.addEventListener("hashchange", () => {
    shower = location.hash === "#sky";
  });
  const minGap = () => (shower ? 500 : 7000);
  const varGap = () => (shower ? 700 : 16000);

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
      setTimeout(fall, minGap() + Math.random() * varGap());
    }
    setTimeout(fall, 1200 + Math.random() * 4000);
  });
})();
