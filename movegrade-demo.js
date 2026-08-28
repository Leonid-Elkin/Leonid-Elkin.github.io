/* MoveGrade, live, on its own case page.
 *
 * The extension's panel is a plain web page (movegrade-demo/overlay/) and the
 * engine is Stockfish compiled to WebAssembly, so the whole thing runs here in
 * an iframe with no extension installed. This file gives it a game: three
 * famous ones to pick from, a box for any PGN, and a pair of buttons to step
 * through the moves while the panel grades each one as it appears. The net
 * file is left out (40 MB); the demo grades with Stockfish's classical eval.
 */

(function () {
  const GAMES = [
    {
      name: "Kasparov – Topalov, Wijk aan Zee 1999",
      pgn: "1.e4 d6 2.d4 Nf6 3.Nc3 g6 4.Be3 Bg7 5.Qd2 c6 6.f3 b5 7.Nge2 Nbd7 8.Bh6 Bxh6 9.Qxh6 Bb7 10.a3 e5 11.O-O-O Qe7 12.Kb1 a6 13.Nc1 O-O-O 14.Nb3 exd4 15.Rxd4 c5 16.Rd1 Nb6 17.g3 Kb8 18.Na5 Ba8 19.Bh3 d5 20.Qf4+ Ka7 21.Rhe1 d4 22.Nd5 Nbxd5 23.exd5 Qd6 24.Rxd4 cxd4 25.Re7+ Kb6 26.Qxd4+ Kxa5 27.b4+ Ka4 28.Qc3 Qxd5 29.Ra7 Bb7 30.Rxb7 Qc4 31.Qxf6 Kxa3 32.Qxa6+ Kxb4 33.c3+ Kxc3 34.Qa1+ Kd2 35.Qb2+ Kd1 36.Bf1 Rd2 37.Rd7 Rxd7 38.Bxc4 bxc4 39.Qxh8 Rd3 40.Qa8 c3 41.Qa4+ Ke1 42.f4 f5 43.Kc1 Rd2 44.Qa7 1-0",
    },
    {
      name: "Byrne – Fischer, New York 1956 (the Game of the Century)",
      pgn: "1.Nf3 Nf6 2.c4 g6 3.Nc3 Bg7 4.d4 O-O 5.Bf4 d5 6.Qb3 dxc4 7.Qxc4 c6 8.e4 Nbd7 9.Rd1 Nb6 10.Qc5 Bg4 11.Bg5 Na4 12.Qa3 Nxc3 13.bxc3 Nxe4 14.Bxe7 Qb6 15.Bc4 Nxc3 16.Bc5 Rfe8+ 17.Kf1 Be6 18.Bxb6 Bxc4+ 19.Kg1 Ne2+ 20.Kf1 Nxd4+ 21.Kg1 Ne2+ 22.Kf1 Nc3+ 23.Kg1 axb6 24.Qb4 Ra4 25.Qxb6 Nxd1 26.h3 Rxa2 27.Kh2 Nxf2 28.Re1 Rxe1 29.Qd8+ Bf8 30.Nxe1 Bd5 31.Nf3 Ne4 32.Qb8 b5 33.h4 h5 34.Ne5 Kg7 35.Kg1 Bc5+ 36.Kf1 Ng3+ 37.Ke1 Bb4+ 38.Kd1 Bb3+ 39.Kc1 Ne2+ 40.Kb1 Nc3+ 41.Kc1 Rc2# 0-1",
    },
    {
      name: "Morphy – Duke of Brunswick & Count Isouard, Paris 1858 (the Opera Game)",
      pgn: "1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3 Qe7 8.Nc3 c6 9.Bg5 b5 10.Nxb5 cxb5 11.Bxb5+ Nbd7 12.O-O-O Rd8 13.Rxd7 Rxd7 14.Rd1 Qe6 15.Bxd7+ Nxd7 16.Qb8+ Nxb8 17.Rd8# 1-0",
    },
  ];

  const SAN_RE = /^(?:[NBRQK][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x?[a-h]?[1-8](?:=[NBRQ])?|O-O(?:-O)?)[+#]?$/;

  /** PGN movetext -> list of SAN. Drops headers, comments, variations, NAGs, numbers, result. */
  function parsePgn(text) {
    let t = text.replace(/\[[^\]]*\]/g, " ");
    t = t.replace(/\{[^}]*\}/g, " ");
    for (let i = 0; i < 20 && /\([^()]*\)/.test(t); i++) t = t.replace(/\([^()]*\)/g, " ");
    t = t.replace(/\$\d+/g, " ").replace(/\d+\.(\.\.)?/g, " ").replace(/[!?]+/g, "");
    return t.split(/\s+/).filter((w) => SAN_RE.test(w));
  }

  window.mountMoveGradeDemo = function (root) {
    const box = document.createElement("div");
    box.className = "mg-demo";
    box.innerHTML = `
      <h2 class="display case-h">Try it here</h2>
      <p>The panel below is the extension's own panel and the engine is the extension's own Stockfish, running in this page. Pick a game or paste a PGN, then step through it: each move is graded at depth four the moment it appears and re-graded as the search deepens.</p>
      <div class="mg-controls">
        <select class="mg-game" aria-label="Game"></select>
        <button class="mg-btn" data-act="start" title="Start of game">|&larr;</button>
        <button class="mg-btn" data-act="prev" title="Previous move">&larr;</button>
        <button class="mg-btn" data-act="next" title="Next move">&rarr;</button>
        <button class="mg-btn" data-act="end" title="End of game">&rarr;|</button>
        <button class="mg-btn" data-act="play" title="Play through">play</button>
        <span class="mono mg-pos"></span>
      </div>
      <textarea class="mg-pgn mono" rows="3" spellcheck="false" aria-label="PGN"></textarea>
      <div class="mg-frame"><iframe src="movegrade-demo/overlay/overlay.html?nonnue&v=4" title="MoveGrade panel"></iframe></div>
    `;
    root.appendChild(box);

    const sel = box.querySelector(".mg-game");
    const ta = box.querySelector(".mg-pgn");
    const pos = box.querySelector(".mg-pos");
    const frame = box.querySelector("iframe");
    GAMES.forEach((g, i) => {
      const o = document.createElement("option");
      o.value = i;
      o.textContent = g.name;
      sel.appendChild(o);
    });
    const custom = document.createElement("option");
    custom.value = "custom";
    custom.textContent = "Your own PGN (paste below)";
    sel.appendChild(custom);

    let sans = [];
    let ply = 0;
    let timer = null;
    let ready = false;

    function send() {
      pos.textContent = sans.length ? `move ${ply} / ${sans.length}` : "no moves";
      if (!ready) return;
      frame.contentWindow.postMessage(
        { type: "movegrade:moves", mode: "analysis", allowed: true, reason: "", sans: sans.slice(0, ply), flipped: false },
        "*"
      );
    }
    function load(text) {
      sans = parsePgn(text);
      ply = Math.min(sans.length, 1);
      send();
    }
    function stop() { clearInterval(timer); timer = null; box.querySelector('[data-act="play"]').textContent = "play"; }

    sel.addEventListener("change", () => {
      stop();
      if (sel.value === "custom") { ta.value = ""; ta.focus(); load(""); return; }
      ta.value = GAMES[+sel.value].pgn;
      load(ta.value);
    });
    ta.addEventListener("input", () => { stop(); sel.value = "custom"; load(ta.value); });

    box.querySelectorAll(".mg-btn").forEach((b) =>
      b.addEventListener("click", () => {
        const act = b.dataset.act;
        if (act === "play") {
          if (timer) { stop(); return; }
          b.textContent = "pause";
          timer = setInterval(() => {
            if (ply >= sans.length) { stop(); return; }
            ply++; send();
          }, 2600);
          return;
        }
        stop();
        if (act === "start") ply = 0;
        else if (act === "prev") ply = Math.max(0, ply - 1);
        else if (act === "next") ply = Math.min(sans.length, ply + 1);
        else if (act === "end") ply = sans.length;
        send();
      })
    );

    window.addEventListener("message", (ev) => {
      const d = ev.data;
      if (!d || ev.source !== frame.contentWindow) return;
      if (d.type === "movegrade:ready") { ready = true; send(); }
      else if (d.type === "movegrade:resize" && d.height) frame.style.height = Math.max(200, d.height) + "px";
    });

    ta.value = GAMES[0].pgn;
    load(ta.value);
  };
})();
