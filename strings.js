/* The guitar in the corner.
 *
 * Off duty says classical guitar, so there is one in the walls. Type  t u n e
 * anywhere and six strings are stretched across the foot of the page, low E
 * at the bottom, in standard tuning. Click a string to pluck it, or press
 * 1 to 6. Escape puts it away.
 *
 * There are no samples on this site any more than there are images. Each
 * note is synthesised on the spot by Karplus-Strong: a ring of noise the
 * length of one period, averaged with itself on every pass until it rings
 * down to a note. It is the 1983 algorithm and it still sounds like a
 * plucked string, which is the whole reason to use it.
 *
 * Nothing is load-bearing. No markup is required, the page keeps working,
 * and no sound is made until someone asks for it - browsers insist on that,
 * and they are right to.
 */

(function () {
  const STRINGS = [
    { name: "E", hz: 329.63, key: "6" },
    { name: "B", hz: 246.94, key: "5" },
    { name: "G", hz: 196.0, key: "4" },
    { name: "D", hz: 146.83, key: "3" },
    { name: "A", hz: 110.0, key: "2" },
    { name: "E", hz: 82.41, key: "1" },
  ];
  const STILL = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let strip = null;
  let ctx = null;

  /* ---------- the word that opens it ---------- */

  const WORD = "tune";
  let at = 0;
  document.addEventListener("keydown", (e) => {
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    const k = e.key.toLowerCase();
    at = k === WORD[at] ? at + 1 : k === WORD[0] ? 1 : 0;
    if (at === WORD.length) {
      at = 0;
      strip ? close() : open();
    }
  });

  /* ---------- the string itself ---------- */

  function audio() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function pluck(hz) {
    const ac = audio();
    const sr = ac.sampleRate;
    const period = Math.round(sr / hz);
    const seconds = 2.4;
    const buf = ac.createBuffer(1, Math.round(sr * seconds), sr);
    const out = buf.getChannelData(0);

    /* the ring: one period of noise, brightened a little so the attack has
       some nail in it, then the Karplus-Strong pass */
    const ring = new Float32Array(period);
    for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1;

    let p = 0;
    for (let i = 0; i < out.length; i++) {
      const a = ring[p];
      const b = ring[(p + 1) % period];
      out[i] = a;
      ring[p] = (a + b) * 0.5 * 0.998;
      p = (p + 1) % period;
    }

    const src = ac.createBufferSource();
    src.buffer = buf;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.5, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + seconds);
    src.connect(gain).connect(ac.destination);
    src.start();
    src.stop(ac.currentTime + seconds);
  }

  /* ---------- the strip ---------- */

  function open() {
    strip = document.createElement("div");
    strip.className = "strings";
    strip.setAttribute("role", "group");
    strip.setAttribute("aria-label", "Six guitar strings, standard tuning");

    const hint = document.createElement("span");
    hint.className = "strings-hint";
    hint.textContent = "standard tuning · 1–6 or click · esc";
    strip.appendChild(hint);

    STRINGS.forEach((s) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "string";
      b.dataset.key = s.key;
      b.setAttribute("aria-label", s.name + " string, " + s.hz + " hertz");
      b.innerHTML = "<i></i><b>" + s.name + "</b><u>" + s.hz.toFixed(2) + "</u>";
      b.addEventListener("click", () => strike(b, s.hz));
      strip.appendChild(b);
    });

    document.body.appendChild(strip);
    requestAnimationFrame(() => strip.classList.add("up"));
    document.addEventListener("keydown", keys);
  }

  function strike(el, hz) {
    pluck(hz);
    if (STILL) return;
    el.classList.remove("rings");
    void el.offsetWidth; /* restart the animation */
    el.classList.add("rings");
  }

  function keys(e) {
    if (!strip) return;
    if (e.key === "Escape") {
      close();
      return;
    }
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    const b = strip.querySelector('.string[data-key="' + e.key + '"]');
    if (b) {
      e.preventDefault();
      b.click();
    }
  }

  function close() {
    document.removeEventListener("keydown", keys);
    const s = strip;
    strip = null;
    s.classList.remove("up");
    setTimeout(() => s.remove(), 320);
  }
})();
