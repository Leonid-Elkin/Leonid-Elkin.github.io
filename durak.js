/* Durak - 36-card Russian card game, you against the machine.
 *
 * Deliberately wordless: ranks and suits carry the state, two icon buttons
 * carry the only two decisions a player ever makes (take the table, or end
 * the bout). Nothing here writes a sentence to the screen.
 *
 * Rules implemented: trump from the bottom of the deck; attacker leads,
 * defender must beat with a higher card of the same suit or any trump (a
 * trump attack needs a higher trump); either side may add cards whose rank
 * already sits on the table; a defender who cannot or will not beat picks
 * everything up and loses the next attack; hands refill to six, attacker
 * first; the last player holding cards is the durak.
 *
 * Transfers (perevodnoy durak): a defender who has not beaten anything yet
 * may lay a card of the same rank beside the attack and hand the whole bout
 * back - the attacker becomes the defender. Only while the table is all
 * unbeaten, only if the other side holds enough cards to answer everything,
 * and never past six cards on the table. The machine transfers too.
 */

const SUITS = [
  { s: "♠", red: false }, // spades
  { s: "♣", red: false }, // clubs
  { s: "♥", red: true },  // hearts
  { s: "♦", red: true },  // diamonds
];
const RANKS = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const HAND = 6;

let G = null;

/* ---------- helpers ---------- */

const val = (c) => RANKS.indexOf(c.r);
const isTrump = (c) => c.s === G.trump.s;

function beats(def, atk) {
  if (isTrump(def) && !isTrump(atk)) return true;
  if (def.s !== atk.s) return false;
  return val(def) > val(atk);
}

function makeDeck() {
  const d = [];
  SUITS.forEach((su) => RANKS.forEach((r) => d.push({ r, s: su.s, red: su.red })));
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

/* Ranks already on the table - the only ranks that may be added to a bout. */
function tableRanks() {
  const rs = new Set();
  G.table.forEach((p) => {
    rs.add(p.attack.r);
    if (p.defence) rs.add(p.defence.r);
  });
  return rs;
}

function unbeaten() {
  return G.table.filter((p) => !p.defence);
}

/* May `c` be laid down as a transfer, handing the bout to `receiver`? */
function canTransfer(c, receiver) {
  if (!G.table.length || G.table.length >= HAND) return false;
  if (G.table.some((p) => p.defence)) return false;
  if (c.r !== G.table[0].attack.r) return false;
  return receiver.length >= G.table.length + 1;
}

const cheapFirst = (a, b) => {
  const ta = isTrump(a) ? 1 : 0;
  const tb = isTrump(b) ? 1 : 0;
  return ta - tb || val(a) - val(b);
};

/* Sort a hand: non-trumps by rank, then trumps. */
function sortHand(h) {
  h.sort((a, b) => {
    const ta = isTrump(a) ? 1 : 0;
    const tb = isTrump(b) ? 1 : 0;
    if (ta !== tb) return ta - tb;
    if (a.s !== b.s) return a.s.localeCompare(b.s);
    return val(a) - val(b);
  });
}

/* ---------- setup ---------- */

function newGame() {
  const deck = makeDeck();
  const trump = deck[0]; // bottom card, drawn last
  G = {
    deck,
    trump,
    you: [],
    foe: [],
    table: [],
    discard: 0,
    youAttack: true,
    over: null, // 'win' | 'lose' | 'draw'
    busy: false,
  };
  for (let i = 0; i < HAND; i++) {
    G.you.push(G.deck.pop());
    G.foe.push(G.deck.pop());
  }
  sortHand(G.you);

  // Lowest trump leads; ties go to you.
  const lowest = (h) => {
    const t = h.filter(isTrump);
    return t.length ? Math.min(...t.map(val)) : 99;
  };
  G.youAttack = lowest(G.you) <= lowest(G.foe);

  render();
  if (!G.youAttack) setTimeout(foeAttack, 620);
}

function refill() {
  const order = G.youAttack ? [G.you, G.foe] : [G.foe, G.you];
  order.forEach((h) => {
    while (h.length < HAND && G.deck.length) h.push(G.deck.pop());
  });
  sortHand(G.you);
}

function checkOver() {
  if (G.deck.length) return false;
  const y = G.you.length === 0;
  const f = G.foe.length === 0;
  if (y && f) G.over = "draw";
  else if (y) G.over = "win";
  else if (f) G.over = "lose";
  return !!G.over;
}

/* ---------- turn resolution ---------- */

function endBout(taken) {
  if (taken) {
    // Defender picks the table up.
    const cards = [];
    G.table.forEach((p) => {
      cards.push(p.attack);
      if (p.defence) cards.push(p.defence);
    });
    if (G.youAttack) G.foe.push(...cards);
    else {
      G.you.push(...cards);
      sortHand(G.you);
    }
  } else {
    G.discard += G.table.reduce((n, p) => n + (p.defence ? 2 : 1), 0);
  }
  G.table = [];
  refill();

  // A defender who took the cards is attacked again.
  if (!taken) G.youAttack = !G.youAttack;

  if (checkOver()) return render();
  render();
  if (!G.youAttack) setTimeout(foeAttack, 560);
}

/* ---------- the opponent ---------- */

function foeAttack() {
  if (G.over) return;
  const ranks = tableRanks();
  let pool = G.foe;
  if (G.table.length) {
    pool = G.foe.filter((c) => ranks.has(c.r));
    // Never pile more onto the table than the defender holds in hand.
    if (!pool.length || G.table.length >= HAND || unbeaten().length >= G.you.length) {
      return endBout(false);
    }
  }
  // Cheapest card, trumps held back.
  const pick = pool.slice().sort((a, b) => {
    const ta = isTrump(a) ? 1 : 0;
    const tb = isTrump(b) ? 1 : 0;
    return ta - tb || val(a) - val(b);
  })[0];
  if (!pick) return endBout(false);

  G.foe.splice(G.foe.indexOf(pick), 1);
  G.table.push({ attack: pick, defence: null });
  render();
}

function foeDefend() {
  if (G.over) return;
  if (!unbeaten().length) return;

  // Pass it back if it can: a non-trump of the table's rank, else a trump.
  const pass = G.foe.filter((c) => canTransfer(c, G.you)).sort(cheapFirst)[0];
  if (pass) {
    G.foe.splice(G.foe.indexOf(pass), 1);
    G.table.push({ attack: pass, defence: null });
    G.youAttack = false;
    G.busy = false;
    return render();
  }

  // Otherwise answer every open card in turn, cheapest card that beats it.
  for (const atk of unbeaten()) {
    const pick = G.foe.filter((c) => beats(c, atk.attack)).sort(cheapFirst)[0];
    if (!pick) {
      G.busy = false;
      return endBout(true);
    }
    G.foe.splice(G.foe.indexOf(pick), 1);
    atk.defence = pick;
  }
  G.busy = false;
  render();

  if (G.table.length >= HAND || !G.foe.length) setTimeout(() => endBout(false), 520);
}

/* ---------- your moves ---------- */

function playable(c) {
  if (G.over || G.busy) return false;
  if (G.youAttack) {
    if (!G.table.length) return true;
    if (G.table.length >= HAND) return false;
    if (unbeaten().length >= G.foe.length) return false;
    return tableRanks().has(c.r);
  }
  const open = unbeaten();
  if (!open.length) return false;
  if (canTransfer(c, G.foe)) return true;
  return beats(c, open[0].attack);
}

function playCard(i) {
  const c = G.you[i];
  if (!playable(c)) return;
  G.you.splice(i, 1);

  if (G.youAttack) {
    G.table.push({ attack: c, defence: null });
    render();
    G.busy = true;
    setTimeout(foeDefend, 620);
  } else if (canTransfer(c, G.foe)) {
    // Same rank, nothing beaten yet: the bout is theirs now.
    G.table.push({ attack: c, defence: null });
    G.youAttack = true;
    render();
    G.busy = true;
    setTimeout(foeDefend, 620);
  } else {
    unbeaten()[0].defence = c;
    render();
    if (unbeaten().length) return; // more to answer before they may add
    // Opponent may add another card to the bout.
    setTimeout(() => {
      if (G.over) return;
      const ranks = tableRanks();
      const more = G.foe.filter((x) => ranks.has(x.r));
      if (more.length && G.table.length < HAND && G.you.length > 0) foeAttack();
      else endBout(false);
    }, 640);
  }
}

function youTake() {
  if (G.over || G.youAttack || G.busy || !unbeaten().length) return;
  endBout(true);
}

function youDone() {
  if (G.over || !G.youAttack || G.busy || !G.table.length) return;
  if (unbeaten().length) return; // cannot end a bout the opponent has not answered
  endBout(false);
}

/* ---------- rendering ---------- */

function cardEl(c, opts = {}) {
  const el = document.createElement("div");
  el.className = "card " + (c.red ? "red" : "black");
  if (isTrump(c)) el.classList.add("trump");
  if (opts.cls) el.classList.add(opts.cls);

  const top = document.createElement("div");
  top.className = "pip";
  top.textContent = c.r + c.s;

  const mid = document.createElement("div");
  mid.className = "suit-lg";
  mid.textContent = c.s;

  const foot = document.createElement("div");
  foot.className = "pip foot";
  foot.textContent = c.r + c.s;

  el.appendChild(top);
  el.appendChild(mid);
  el.appendChild(foot);
  return el;
}

function backEl() {
  const el = document.createElement("div");
  el.className = "card back";
  return el;
}

function icon(paths, size = 22) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  paths.forEach((d) => {
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", d);
    svg.appendChild(p);
  });
  return svg;
}

function render() {
  const root = document.getElementById("durak");
  if (!root || !G) return;
  root.textContent = "";

  const board = document.createElement("div");
  board.className = "durak-board";

  /* opponent hand, face down */
  const foeRow = document.createElement("div");
  foeRow.className = "durak-row opponent";
  G.foe.forEach(() => foeRow.appendChild(backEl()));
  board.appendChild(foeRow);

  /* middle: deck, table, discard */
  const mid = document.createElement("div");
  mid.className = "durak-side";

  const stack = document.createElement("div");
  stack.className = "deck-stack";
  if (G.deck.length) {
    const under = cardEl(G.trump, { cls: "trump-under" });
    stack.appendChild(under);
    const top = backEl();
    top.classList.add("deck-top");
    stack.appendChild(top);
    const n = document.createElement("div");
    n.className = "deck-count";
    n.textContent = G.deck.length;
    stack.appendChild(n);
  } else {
    const t = cardEl(G.trump, { cls: "trump-under" });
    t.classList.add("dimmed");
    stack.appendChild(t);
  }
  mid.appendChild(stack);

  const table = document.createElement("div");
  table.className = "durak-table";
  const open = unbeaten();
  G.table.forEach((p) => {
    const pair = document.createElement("div");
    pair.className = "pair open";
    if (!p.defence && !G.youAttack && open[0] === p) pair.classList.add("target");
    const a = cardEl(p.attack, { cls: "attack" });
    pair.appendChild(a);
    if (p.defence) pair.appendChild(cardEl(p.defence, { cls: "defence" }));
    table.appendChild(pair);
  });
  mid.appendChild(table);

  const disc = document.createElement("div");
  disc.className = "discard-pile";
  if (G.discard) {
    const d = backEl();
    d.style.transform = "rotate(-7deg)";
    disc.appendChild(d);
  }
  mid.appendChild(disc);
  board.appendChild(mid);

  /* your hand */
  const mine = document.createElement("div");
  mine.className = "durak-row mine";
  G.you.forEach((c, i) => {
    const el = cardEl(c);
    if (playable(c)) {
      el.classList.add("playable");
      el.tabIndex = 0;
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", c.r + " " + c.s);
      el.addEventListener("click", () => playCard(i));
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          playCard(i);
        }
      });
    } else {
      el.classList.add("dimmed");
    }
    mine.appendChild(el);
  });
  board.appendChild(mine);

  root.appendChild(board);

  /* two icon controls, plus a reset */
  const ctl = document.createElement("div");
  ctl.className = "durak-controls";

  // take the table (defender only)
  const take = document.createElement("button");
  take.className = "durak-btn";
  take.appendChild(icon(["M12 4v12", "M6 12l6 6 6-6", "M4 20h16"]));
  take.disabled = G.over || G.youAttack || G.busy || !unbeaten().length;
  take.setAttribute("aria-label", "take");
  take.addEventListener("click", youTake);
  ctl.appendChild(take);

  // end the bout (attacker only, once everything is beaten)
  const done = document.createElement("button");
  done.className = "durak-btn primary";
  done.appendChild(icon(["M5 13l4 4L19 7"]));
  done.disabled = G.over || !G.youAttack || G.busy || !G.table.length || !!unbeaten().length;
  done.setAttribute("aria-label", "done");
  done.addEventListener("click", youDone);
  ctl.appendChild(done);

  // deal again
  const again = document.createElement("button");
  again.className = "durak-btn";
  again.appendChild(icon(["M3 12a9 9 0 1 0 3-6.7", "M3 4v5h5"]));
  again.setAttribute("aria-label", "deal");
  again.addEventListener("click", newGame);
  ctl.appendChild(again);

  root.appendChild(ctl);

  /* outcome, as a stamp of suits rather than a sentence */
  if (G.over) {
    const stamp = document.createElement("div");
    stamp.className = "durak-stamp";
    const mark = document.createElement("div");
    mark.className = "mark" + (G.over === "win" ? " win" : "");
    if (G.over === "win") {
      mark.textContent = "♠♥♦♣";
    } else if (G.over === "lose") {
      mark.textContent = "☠";
    } else {
      mark.textContent = "=";
    }
    stamp.appendChild(mark);
    stamp.addEventListener("click", newGame);
    root.appendChild(stamp);
  }
}

/* The board now lives behind the card stack in the corner (see egg.js), so it
 * must NOT deal itself on load or on scroll - it would be shuffling away
 * inside a hidden panel for every visitor who never finds it. A board marked
 * `data-deferred` waits to be asked, and egg.js asks through window.startDurak
 * when someone opens the panel. Anything else (a board dropped straight into a
 * page) keeps the old deal-when-visible behaviour. */
window.startDurak = function () {
  if (!G) newGame();
};

function armDurak() {
  const root = document.getElementById("durak");
  if (!root) return;
  if (root.hasAttribute("data-deferred")) return;

  const deal = () => {
    if (!G) newGame();
  };

  if (!("IntersectionObserver" in window)) {
    deal();
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        deal();
      }
    },
    { rootMargin: "150px" }
  );
  io.observe(root);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", armDurak);
} else {
  armDurak();
}
