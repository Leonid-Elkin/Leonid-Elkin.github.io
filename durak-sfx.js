/* Card sounds for both Durak tables, synthesised - no files. A card laid on
 * the table is a short damped click; taking the pile is a low sweep; the
 * stamp at the end is two notes. Nothing plays until the page has had a
 * gesture, which is when a browser lets audio start anyway.
 */

(function () {
  let ctx = null;

  function ac() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(freq, t0, dur, type, gain, slideTo) {
    const c = ac();
    if (!c) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(c.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  /* a card hitting felt: a burst of noise, band-limited, very short */
  function snap(t0, gain) {
    const c = ac();
    if (!c) return;
    const n = Math.floor(c.sampleRate * 0.045);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 1800;
    f.Q.value = 0.8;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(c.destination);
    src.start(t0);
  }

  window.durakSfx = {
    play() { const c = ac(); if (c) { snap(c.currentTime, 0.35); tone(520, c.currentTime, 0.05, "triangle", 0.05); } },
    beat() { const c = ac(); if (c) { snap(c.currentTime, 0.3); tone(720, c.currentTime, 0.06, "triangle", 0.06); } },
    take() { const c = ac(); if (c) { tone(300, c.currentTime, 0.28, "sawtooth", 0.05, 90); snap(c.currentTime + 0.12, 0.25); snap(c.currentTime + 0.2, 0.2); } },
    done() { const c = ac(); if (c) { snap(c.currentTime, 0.2); snap(c.currentTime + 0.06, 0.15); } },
    win()  { const c = ac(); if (c) { tone(523, c.currentTime, 0.14, "square", 0.05); tone(784, c.currentTime + 0.14, 0.3, "square", 0.05); } },
    lose() { const c = ac(); if (c) { tone(220, c.currentTime, 0.4, "sawtooth", 0.06, 110); } },
  };
})();
