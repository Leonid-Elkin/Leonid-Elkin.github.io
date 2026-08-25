/* Durak, two players, browser to browser.
 *
 * One peer hosts and owns the game: every move from either side goes through
 * `apply` on the host, and the host sends the whole state back to both. The
 * guest only ever proposes. Transport is WebRTC through PeerJS's public
 * broker (signalling only - the cards never touch a server).
 *
 * Rules are the same as durak.js: 36 cards, trump from the bottom of the deck,
 * add-on by rank, six cards on the table at most, never more unbeaten than the
 * defender holds - and transfers: a defender who has beaten nothing may lay a
 * card of the table's rank and hand the bout to the other side.
 */

(function () {
  const SUITS = [
    { s: "♠", red: false },
    { s: "♣", red: false },
    { s: "♥", red: true },
    { s: "♦", red: true },
  ];
  const RANKS = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const HAND = 6;

  /* ---------- the engine: pure functions on a state object ---------- */

  const val = (c) => RANKS.indexOf(c.r);
  const isTrump = (S, c) => c.s === S.trump.s;
  const beats = (S, d, a) =>
    (isTrump(S, d) && !isTrump(S, a)) || (d.s === a.s && val(d) > val(a));
  const unbeaten = (S) => S.table.filter((p) => !p.defence);
  const other = (p) => 1 - p;

  function tableRanks(S) {
    const rs = new Set();
    S.table.forEach((p) => {
      rs.add(p.attack.r);
      if (p.defence) rs.add(p.defence.r);
    });
    return rs;
  }

  function sortHand(S, h) {
    h.sort((a, b) => {
      const ta = isTrump(S, a) ? 1 : 0;
      const tb = isTrump(S, b) ? 1 : 0;
      if (ta !== tb) return ta - tb;
      if (a.s !== b.s) return a.s.localeCompare(b.s);
      return val(a) - val(b);
    });
  }

  function newState() {
    const deck = [];
    SUITS.forEach((su) => RANKS.forEach((r) => deck.push({ r, s: su.s, red: su.red })));
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const S = { deck, trump: deck[0], hands: [[], []], table: [], discard: 0, attacker: 0, over: null };
    for (let i = 0; i < HAND; i++) { S.hands[0].push(deck.pop()); S.hands[1].push(deck.pop()); }
    S.hands.forEach((h) => sortHand(S, h));
    const lowest = (h) => {
      const t = h.filter((c) => isTrump(S, c));
      return t.length ? Math.min(...t.map(val)) : 99;
    };
    S.attacker = lowest(S.hands[0]) <= lowest(S.hands[1]) ? 0 : 1;
    return S;
  }

  function canTransfer(S, c, receiverHand) {
    if (!S.table.length || S.table.length >= HAND) return false;
    if (S.table.some((p) => p.defence)) return false;
    if (c.r !== S.table[0].attack.r) return false;
    return receiverHand.length >= S.table.length + 1;
  }

  /* what player p may do right now */
  function legal(S, p) {
    const hand = S.hands[p];
    const out = { cards: [], take: false, done: false };
    if (S.over) return out;
    const def = other(S.attacker);
    if (p === S.attacker) {
      const open = unbeaten(S).length;
      hand.forEach((c, i) => {
        if (!S.table.length) return out.cards.push(i);
        if (S.table.length >= HAND) return;
        if (open >= S.hands[def].length) return;
        if (tableRanks(S).has(c.r)) out.cards.push(i);
      });
      out.done = S.table.length > 0 && open === 0;
    } else {
      const open = unbeaten(S);
      if (open.length) {
        hand.forEach((c, i) => {
          if (canTransfer(S, c, S.hands[S.attacker]) || beats(S, c, open[0].attack)) out.cards.push(i);
        });
        out.take = true;
      }
    }
    return out;
  }

  function refill(S) {
    [S.hands[S.attacker], S.hands[other(S.attacker)]].forEach((h) => {
      while (h.length < HAND && S.deck.length) h.push(S.deck.pop());
    });
    S.hands.forEach((h) => sortHand(S, h));
  }

  function checkOver(S) {
    if (S.deck.length) return;
    const e0 = !S.hands[0].length, e1 = !S.hands[1].length;
    if (e0 && e1) S.over = "draw";
    else if (e0) S.over = 0;
    else if (e1) S.over = 1;
  }

  function endBout(S, taken) {
    const def = other(S.attacker);
    if (taken) {
      S.table.forEach((p) => { S.hands[def].push(p.attack); if (p.defence) S.hands[def].push(p.defence); });
    } else {
      S.discard += S.table.reduce((n, p) => n + (p.defence ? 2 : 1), 0);
    }
    S.table = [];
    refill(S);
    if (!taken) S.attacker = def;
    checkOver(S);
  }

  /* Apply a move from player p. Returns an error string, or null. */
  function apply(S, p, m) {
    const L = legal(S, p);
    if (m.t === "card") {
      if (!L.cards.includes(m.i)) return "not playable";
      const c = S.hands[p].splice(m.i, 1)[0];
      if (p === S.attacker) {
        S.table.push({ attack: c, defence: null });
      } else if (canTransfer(S, c, S.hands[S.attacker])) {
        S.table.push({ attack: c, defence: null });
        S.attacker = p;
      } else {
        unbeaten(S)[0].defence = c;
        // a full table, or an attacker with nothing left to add, ends the bout
        if (!unbeaten(S).length) {
          const atk = S.hands[S.attacker];
          const canAdd = S.table.length < HAND && atk.some((x) => tableRanks(S).has(x.r)) && S.hands[p].length > 0;
          if (!canAdd) endBout(S, false);
        }
      }
      // a defender who ran out of cards mid-bout with the deck empty: the bout is won
      if (!S.deck.length && !S.hands[other(S.attacker)].length && !unbeaten(S).length) endBout(S, false);
      return null;
    }
    if (m.t === "take") {
      if (!L.take) return "nothing to take";
      endBout(S, true);
      return null;
    }
    if (m.t === "done") {
      if (!L.done) return "not yet";
      endBout(S, false);
      return null;
    }
    return "unknown move";
  }

  /* the engine alone, for tests */
  window.DurakEngine = { newState, legal, apply, canTransfer, unbeaten };
  if (typeof document === "undefined") return;

  /* ---------- networking ---------- */

  let peer = null, conn = null, me = -1, S = null;
  const $ = (id) => document.getElementById(id);
  const status = (t) => { $("lobby-status").textContent = t; };

  const CODE_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";
  const makeCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
  const peerId = (code) => "leonid-durak-" + code;

  /* STUN is enough for most pairs of home connections. Players behind a
     symmetric NAT or a VPN need a TURN relay: get a free key from
     dashboard.metered.ca (20 GB/month) and add its servers here. */
  const ICE = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  };

  function newPeer(id) {
    return new Peer(id, { debug: 0, config: ICE });
  }

  function host() {
    const code = makeCode();
    $("btn-host").disabled = true;
    status("opening…");
    peer = newPeer(peerId(code));
    peer.on("open", () => {
      me = 0;
      $("code-text").textContent = code;
      $("room-code").hidden = false;
      status("waiting for the other player");
      history.replaceState(null, "", "#" + code);
    });
    peer.on("connection", (c) => {
      if (conn) { c.close(); return; }
      conn = c;
      wire();
      conn.on("open", () => {
        S = newState();
        send({ t: "state", S });
        begin();
      });
    });
    peer.on("error", (e) => { status("could not open: " + e.type); $("btn-host").disabled = false; });
  }

  function join(code) {
    code = code.trim().toLowerCase();
    if (code.length !== 6) return status("a code is six characters");
    status("finding the table…");
    peer = newPeer();
    peer.on("open", () => {
      conn = peer.connect(peerId(code), { reliable: true });
      me = 1;
      wire();
      conn.on("open", () => status("seated - waiting for the deal"));
    });
    peer.on("error", (e) => status(e.type === "peer-unavailable" ? "no table with that code" : "connection failed: " + e.type));
  }

  function send(msg) { if (conn && conn.open) conn.send(msg); }

  /* for poking at from the console */
  window.durakDebug = () => ({
    me, peerOpen: !!(peer && peer.open), peerId: peer && peer.id,
    conn: conn && {
      open: conn.open, peer: conn.peer,
      ice: conn.peerConnection && conn.peerConnection.iceConnectionState,
      sig: conn.peerConnection && conn.peerConnection.signalingState,
      gather: conn.peerConnection && conn.peerConnection.iceGatheringState,
    },
    S,
  });

  function wire() {
    conn.on("data", (msg) => {
      if (msg.t === "state") { S = msg.S; begin(); render(); }
      else if (msg.t === "move" && me === 0) {
        const err = apply(S, 1, msg.m);
        if (err) send({ t: "nope", err });
        send({ t: "state", S });
        render();
      }
      else if (msg.t === "again" && me === 0) { S = newState(); send({ t: "state", S }); render(); }
      else if (msg.t === "nope") { $("turn-text").textContent = msg.err; }
    });
    conn.on("close", () => { $("peer-text").textContent = "the other player left"; });
    conn.on("error", () => { $("peer-text").textContent = "connection lost"; });
  }

  function begin() {
    $("lobby").hidden = true;
    $("online-head").hidden = false;
    $("durak").hidden = false;
    $("peer-text").textContent = me === 0 ? "you dealt" : "they dealt";
    render();
  }

  /* my move: the host applies it directly, the guest proposes it */
  function move(m) {
    if (!S || S.over) return;
    if (me === 0) {
      const err = apply(S, 0, m);
      if (err) return;
      send({ t: "state", S });
      render();
    } else {
      send({ t: "move", m });
    }
  }

  function again() {
    if (me === 0) { S = newState(); send({ t: "state", S }); render(); }
    else send({ t: "again" });
  }

  /* ---------- rendering (the same board as durak.js, from my seat) ---------- */

  function cardEl(c, cls) {
    const el = document.createElement("div");
    el.className = "card " + (c.red ? "red" : "black") + (cls ? " " + cls : "");
    if (isTrump(S, c)) el.classList.add("trump");
    ["pip", "suit-lg", "pip foot"].forEach((k, i) => {
      const d = document.createElement("div");
      d.className = k;
      d.textContent = i === 1 ? c.s : c.r + c.s;
      el.appendChild(d);
    });
    return el;
  }

  function backEl() {
    const el = document.createElement("div");
    el.className = "card back";
    return el;
  }

  function icon(paths) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", 22); svg.setAttribute("height", 22);
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor"); svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round"); svg.setAttribute("stroke-linejoin", "round");
    paths.forEach((d) => { const p = document.createElementNS(ns, "path"); p.setAttribute("d", d); svg.appendChild(p); });
    return svg;
  }

  function render() {
    const root = $("durak");
    if (!root || !S) return;
    root.textContent = "";
    const L = legal(S, me);
    const foe = other(me);
    const iAttack = S.attacker === me;

    const board = document.createElement("div");
    board.className = "durak-board";

    const foeRow = document.createElement("div");
    foeRow.className = "durak-row opponent";
    S.hands[foe].forEach(() => foeRow.appendChild(backEl()));
    board.appendChild(foeRow);

    const mid = document.createElement("div");
    mid.className = "durak-side";
    const stack = document.createElement("div");
    stack.className = "deck-stack";
    const under = cardEl(S.trump, "trump-under");
    if (!S.deck.length) under.classList.add("dimmed");
    stack.appendChild(under);
    if (S.deck.length) {
      const top = backEl(); top.classList.add("deck-top"); stack.appendChild(top);
      const n = document.createElement("div"); n.className = "deck-count"; n.textContent = S.deck.length; stack.appendChild(n);
    }
    mid.appendChild(stack);

    const table = document.createElement("div");
    table.className = "durak-table";
    const open = unbeaten(S);
    S.table.forEach((p) => {
      const pair = document.createElement("div");
      pair.className = "pair open";
      if (!p.defence && !iAttack && open[0] === p) pair.classList.add("target");
      pair.appendChild(cardEl(p.attack, "attack"));
      if (p.defence) pair.appendChild(cardEl(p.defence, "defence"));
      table.appendChild(pair);
    });
    mid.appendChild(table);

    const disc = document.createElement("div");
    disc.className = "discard-pile";
    if (S.discard) { const d = backEl(); d.style.transform = "rotate(-7deg)"; disc.appendChild(d); }
    mid.appendChild(disc);
    board.appendChild(mid);

    const mine = document.createElement("div");
    mine.className = "durak-row mine";
    S.hands[me].forEach((c, i) => {
      const el = cardEl(c);
      if (L.cards.includes(i)) {
        el.classList.add("playable");
        el.tabIndex = 0;
        el.setAttribute("role", "button");
        el.setAttribute("aria-label", c.r + " " + c.s);
        el.addEventListener("click", () => move({ t: "card", i }));
        el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); move({ t: "card", i }); } });
      } else el.classList.add("dimmed");
      mine.appendChild(el);
    });
    board.appendChild(mine);
    root.appendChild(board);

    const ctl = document.createElement("div");
    ctl.className = "durak-controls";
    const take = document.createElement("button");
    take.className = "durak-btn";
    take.appendChild(icon(["M12 4v12", "M6 12l6 6 6-6", "M4 20h16"]));
    take.disabled = !L.take;
    take.setAttribute("aria-label", "take");
    take.addEventListener("click", () => move({ t: "take" }));
    ctl.appendChild(take);
    const done = document.createElement("button");
    done.className = "durak-btn primary";
    done.appendChild(icon(["M5 13l4 4L19 7"]));
    done.disabled = !L.done;
    done.setAttribute("aria-label", "done");
    done.addEventListener("click", () => move({ t: "done" }));
    ctl.appendChild(done);
    const redo = document.createElement("button");
    redo.className = "durak-btn";
    redo.appendChild(icon(["M3 12a9 9 0 1 0 3-6.7", "M3 4v5h5"]));
    redo.setAttribute("aria-label", "deal again");
    redo.addEventListener("click", again);
    ctl.appendChild(redo);
    root.appendChild(ctl);

    /* whose move, in words - this page is allowed them */
    const t = $("turn-text");
    if (S.over !== null) t.textContent = S.over === "draw" ? "a draw" : S.over === me ? "you are out - they are the durak" : "you are the durak";
    else if (iAttack) t.textContent = open.length ? "they are defending" : S.table.length ? "add a card, or end the bout" : "your lead";
    else t.textContent = open.length ? (L.cards.some((i) => canTransfer(S, S.hands[me][i], S.hands[foe])) ? "beat it, transfer it, or take" : "beat it, or take") : "they may add";

    if (S.over !== null) {
      const stamp = document.createElement("div");
      stamp.className = "durak-stamp";
      const mark = document.createElement("div");
      mark.className = "mark" + (S.over === me ? " win" : "");
      mark.textContent = S.over === "draw" ? "=" : S.over === me ? "♠♥♦♣" : "☠";
      stamp.appendChild(mark);
      stamp.addEventListener("click", again);
      root.appendChild(stamp);
    }
  }

  /* ---------- lobby ---------- */

  $("btn-host").addEventListener("click", host);
  $("join-form").addEventListener("submit", (e) => { e.preventDefault(); join($("join-code").value); });
  $("btn-copy").addEventListener("click", () => {
    const url = location.origin + location.pathname + "#" + $("code-text").textContent;
    navigator.clipboard && navigator.clipboard.writeText(url).then(() => status("link copied - send it over"));
  });

  const fromHash = location.hash.replace("#", "");
  if (fromHash.length === 6) { $("join-code").value = fromHash; join(fromHash); }
})();
