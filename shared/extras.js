/* Small pleasures. None of this is load-bearing; every page works with this
 * file deleted.
 *
 * Three secrets, in ascending order of obscurity:
 *
 *   1. The console. Anyone who opens devtools gets a note - the oldest
 *      portfolio easter egg there is, and still the right one, because the
 *      only people who see it are the people it is for.
 *   2. Typing  d u r a k  anywhere fans the card stack and opens the board.
 *      A keyboard door to the click egg, for people who read source.
 *   3. The Konami code puts the site into MISPRINT: the red overprint plate
 *      slips further out of register, as if the press had drifted. Enter it
 *      again and the printer fixes the registration.
 */

(function () {
  /* ---------- 1. the console note ---------- */

  try {
    console.log(
      "%c ■ %c LEONID ELKIN — you found the service hatch.",
      "background:#ff2d16;color:#ff2d16;font-size:18px;",
      "color:#f2f0ec;background:#0a0a0a;font-family:monospace;font-size:12px;padding:4px 8px;"
    );
    console.log(
      "%cNo images, no build step, no framework. View source is the whole stack.\n" +
        "Two more secrets on this page: one you can type, one you can click.\n" +
        "https://github.com/Leonid-Elkin/Leonid-Elkin.github.io",
      "color:#6e6b67;font-family:monospace;font-size:11px;line-height:1.7;"
    );
  } catch (e) {
    /* a console that cannot log is not worth crashing over */
  }

  /* ---------- shared: watch typed keys for a word ---------- */

  function watchWord(word, onDone) {
    let at = 0;
    document.addEventListener("keydown", (e) => {
      /* never swallow typing in a real input */
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      at = k === word[at] ? at + 1 : k === word[0] ? 1 : 0;
      if (at === word.length) {
        at = 0;
        onDone();
      }
    });
  }

  /* ---------- 2. type the word, get the game ---------- */

  watchWord("durak", () => {
    const egg = document.getElementById("egg");
    if (!egg) return;
    /* first click fans the stack, second opens the board - both, spaced so
       the fan is actually seen */
    egg.click();
    setTimeout(() => egg.click(), 420);
  });

  /* ---------- 3. the Konami code drifts the press ---------- */

  const KONAMI = [
    "arrowup", "arrowup", "arrowdown", "arrowdown",
    "arrowleft", "arrowright", "arrowleft", "arrowright",
    "b", "a",
  ];

  let kAt = 0;
  document.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    kAt = k === KONAMI[kAt] ? kAt + 1 : k === KONAMI[0] ? 1 : 0;
    if (kAt === KONAMI.length) {
      kAt = 0;
      const on = document.documentElement.classList.toggle("misprint");
      try {
        console.log(
          "%c" + (on ? "REGISTRATION LOST — the plates have drifted." : "Registration restored."),
          "color:" + (on ? "#ff2d16" : "#6e6b67") + ";font-family:monospace;font-size:12px;"
        );
      } catch (err) { /* fine */ }
    }
  });

  /* ---------- the footer counts your visit in lost stars ---------- */

  (function () {
    const el = document.getElementById("dwell");
    if (!el) return;
    const t0 = Date.now();
    setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      const mm = String(Math.floor(s / 60)).padStart(2, "0");
      const ss = String(s % 60).padStart(2, "0");
      let line = "You have been here " + mm + ":" + ss;
      const cs = window.clusterStats;
      if (cs && cs.escaped) line += " · the cluster has lost " + cs.escaped + " star" + (cs.escaped === 1 ? "" : "s") + " in that time";
      if (cs && cs.intruders) line += " · " + cs.intruders + " of the intruders " + (cs.intruders === 1 ? "was" : "were") + " you";
      el.textContent = line;
    }, 1000);
  })();

  /* ---------- registration debris (the 404 only) ---------- */

  /* On the misprinted page, the cursor sheds little squares of loose ink. */
  if (
    document.documentElement.classList.contains("misprint") &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    let last = 0;
    document.addEventListener("pointermove", (e) => {
      const now = performance.now();
      if (now - last < 70) return;
      last = now;
      const d = document.createElement("span");
      d.className = "debris";
      d.style.left = e.clientX + (Math.random() - 0.5) * 14 + "px";
      d.style.top = e.clientY + (Math.random() - 0.5) * 14 + "px";
      document.body.appendChild(d);
      requestAnimationFrame(() => d.classList.add("gone"));
      setTimeout(() => d.remove(), 700);
    });
  }

})();
