/* The proof sheet.
 *
 * Ctrl+P on a black page with a moving ticker, a live map and a card game in
 * the corner is a waste of toner. The print stylesheet in style.css turns the
 * page into a proof: white stock, black ink, the one red kept, every link
 * followed by its address, and the toys left out.
 *
 * The only thing CSS cannot do is know the date. This stamps it onto <body>
 * on the way to the printer so the sheet can say when it was pulled; the
 * attribute is removed again afterwards, because the screen never needs it.
 */

(function () {
  function stamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    document.body.dataset.pulled =
      d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
      " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function clear() {
    delete document.body.dataset.pulled;
  }
  window.addEventListener("beforeprint", stamp);
  window.addEventListener("afterprint", clear);
  /* Safari fires neither event reliably; it does honour the media query. */
  if (window.matchMedia) {
    const mq = window.matchMedia("print");
    const on = (m) => (m.matches ? stamp() : clear());
    if (mq.addEventListener) mq.addEventListener("change", on);
    else if (mq.addListener) mq.addListener(on);
  }
})();
