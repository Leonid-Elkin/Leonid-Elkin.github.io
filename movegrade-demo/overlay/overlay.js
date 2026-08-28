import { Chess } from "../lib/chess.js";
import { Engine } from "./engine.js";
import { RemoteEngine } from "./remote-engine.js";
import { classify, CATEGORIES, fmtEval, lineToCp, winPct } from "./classify.js?v=4";
import { lookupOpening } from "./book.js";

const $ = (id) => document.getElementById(id);
const els = {
  status: $("status"), badge: $("badge"), glyph: $("glyph"), label: $("label"),
  move: $("move"), evalBefore: $("evalBefore"), evalAfter: $("evalAfter"),
  detail: $("detail"), bestline: $("bestline"), history: $("history"),
  opening: $("opening"),
  settings: $("settings"), think: $("think"), thinkVal: $("thinkVal"),
  backfill: $("backfill"), showBoard: $("showBoard"), pieceSet: $("pieceSet"),
  boardTheme: $("boardTheme"), board: $("board"), boardWrap: $("boardWrap"),
  evalbar: $("evalbar"), evalfill: $("evalfill"), evaltext: $("evaltext"),
};

const PIECE_SETS = ["cburnett", "merida", "alpha"];

// Runs as an extension page normally; falls back gracefully when opened
// over plain http for development (no chrome.* APIs there).
const isExt = typeof chrome !== "undefined" && !!chrome.storage;
const storage = isExt
  ? chrome.storage.local
  : { get: (_k, cb) => setTimeout(() => cb({}), 0), set: () => {} };
const assetUrl = (p) => (isExt ? chrome.runtime.getURL(p) : new URL("../" + p, location.href).href);

// ----------------------------------------------------------------- settings
const settings = { thinkMs: 1000, backfill: true, showBoard: true, pieceSet: "cburnett", boardTheme: "green" };

const fmtSecs = (ms) => (ms / 1000).toFixed(1) + "s";

for (const s of PIECE_SETS) {
  const o = document.createElement("option");
  o.value = s;
  o.textContent = s[0].toUpperCase() + s.slice(1);
  els.pieceSet.appendChild(o);
}

function applySettingsToUi() {
  els.think.value = settings.thinkMs;
  els.thinkVal.textContent = fmtSecs(settings.thinkMs);
  els.backfill.checked = settings.backfill;
  els.showBoard.checked = settings.showBoard;
  els.pieceSet.value = settings.pieceSet;
  els.boardTheme.value = settings.boardTheme;
  els.boardWrap.hidden = !settings.showBoard;
  document.documentElement.dataset.board = settings.boardTheme;
}

storage.get(Object.keys(settings), (v) => {
  Object.assign(settings, v);
  applySettingsToUi();
  renderCurrent();
});

function saveSetting(k, v) {
  settings[k] = v;
  storage.set({ [k]: v });
}
els.think.addEventListener("input", () => { saveSetting("thinkMs", +els.think.value); els.thinkVal.textContent = fmtSecs(settings.thinkMs); });
els.backfill.addEventListener("change", () => saveSetting("backfill", els.backfill.checked));
els.showBoard.addEventListener("change", () => { saveSetting("showBoard", els.showBoard.checked); applySettingsToUi(); reportHeight(); });
els.pieceSet.addEventListener("change", () => { saveSetting("pieceSet", els.pieceSet.value); renderCurrent(); });
els.boardTheme.addEventListener("change", () => { saveSetting("boardTheme", els.boardTheme.value); applySettingsToUi(); });

$("gear").addEventListener("click", () => {
  els.settings.hidden = !els.settings.hidden;
  reportHeight();
});
$("close").addEventListener("click", () => parent.postMessage({ type: "movegrade:hide" }, "*"));

function setStatus(t) {
  els.status.textContent = t;
  parent.postMessage({ type: "movegrade:status", status: t }, "*");
}

/** Tell the content script what to draw on the site's board. */
function postGrade(g) {
  if (!g || !g.move) {
    parent.postMessage({ type: "movegrade:grade", cat: null }, "*");
    return;
  }
  parent.postMessage({
    type: "movegrade:grade",
    cat: g.cat,
    glyph: CATEGORIES[g.cat].glyph,
    label: CATEGORIES[g.cat].label,
    from: g.move.from,
    to: g.move.to,
    ply: g.ply,
    provisional: !!g.provisional,
    evalAfter: els.evalAfter.textContent,
  }, "*");
}

// ----------------------------------------------------------------- dragging
const bar = $("bar");
let dragging = false;
bar.addEventListener("mousedown", (e) => {
  if (e.target.tagName === "BUTTON") return;
  dragging = true;
  e.preventDefault();
});
window.addEventListener("mousemove", (e) => {
  if (dragging) parent.postMessage({ type: "movegrade:drag", dx: e.movementX, dy: e.movementY }, "*");
});
window.addEventListener("mouseup", () => {
  if (dragging) parent.postMessage({ type: "movegrade:dragend" }, "*");
  dragging = false;
});

function reportHeight() {
  parent.postMessage({ type: "movegrade:resize", height: document.body.scrollHeight + 2, width: document.body.scrollWidth + 2 }, "*");
}
new ResizeObserver(reportHeight).observe($("panel"));

// ----------------------------------------------------------------- engine
// In the extension the engine lives in an offscreen document (see
// background.js for why); the in-page Worker is only used for http dev testing.
const engineOpts = {
  onError: (msg) => { setStatus("engine error: " + msg); els.status.title = msg; console.error("[MoveGrade]", msg); diagnoseEngine(msg); },
  onLog: (line) => console.debug("[MoveGrade engine]", line),
  onStatus: (t) => setStatus(t),
  // ?nonnue runs the classical evaluation (for hosts that do not ship the 40 MB net)
  nnue: !/[?&]nonnue\b/.test(location.search),
};
const engine = isExt
  ? new RemoteEngine(engineOpts)
  : new Engine(assetUrl("engine/stockfish-nnue-16-single.js"), engineOpts);

/** On engine failure, check each piece of the loading chain and show the results in the panel. */
async function diagnoseEngine(msg) {
  const lines = ["Engine failed: " + msg];
  for (const f of ["engine/stockfish-nnue-16-single.js", "engine/stockfish-nnue-16-single.wasm", "engine/nn-5af11540bbfe.nnue"]) {
    try {
      const r = await fetch(assetUrl(f));
      const len = r.headers.get("content-length") || (await r.arrayBuffer()).byteLength;
      lines.push(`${f.split("/").pop()}: HTTP ${r.status}, ${len} bytes, type ${r.headers.get("content-type") || "?"}`);
    } catch (e) {
      lines.push(`${f.split("/").pop()}: fetch failed (${e.message})`);
    }
  }
  try {
    new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
    lines.push("WebAssembly compile: allowed");
  } catch (e) {
    lines.push("WebAssembly compile: BLOCKED (" + e.message + ")");
  }
  lines.push("Worker support: " + (typeof Worker === "function"));
  console.error("[MoveGrade diagnostics]\n" + lines.join("\n"));
  els.label.className = "cat-none";
  els.label.textContent = "Engine failed to load";
  els.move.textContent = "";
  els.detail.innerHTML = "";
  for (const l of lines) {
    const d = document.createElement("div");
    d.textContent = l;
    els.detail.appendChild(d);
  }
  els.detail.style.userSelect = "text";
  reportHeight();
}
engine.readyPromise.then(() => setStatus("engine ready")).catch(() => {});

// The first grade is shown as soon as both positions have been searched to
// this depth; every deeper iteration up to the user's selected depth then
// re-grades and updates the badge. Nothing is searched beyond the selected depth.
const QUICK_MS = 150;

// ----------------------------------------------------------------- game state
let sans = [];            // current mainline
let fens = [];            // fens[i] = position after i plies (fens[0] = start)
let grades = [];          // grades[i] = classification of sans[i] (or undefined)
let selected = -1;        // ply the user clicked in the history strip (-1 = latest)
const evalCache = new Map(); // fen -> analysis result
let generation = 0;
let paused = "";
let flipped = false;      // mirror the site's board orientation (black at bottom)

function rebuild(newSans) {
  const chess = new Chess();
  const newFens = [chess.fen()];
  const ok = [];
  for (const san of newSans) {
    try {
      if (!chess.move(san)) break;
    } catch { break; }
    ok.push(san);
    newFens.push(chess.fen());
  }
  let keep = 0;
  while (keep < ok.length && keep < sans.length && ok[keep] === sans[keep]) keep++;
  grades = grades.slice(0, keep);
  if (ok.length !== sans.length) selected = -1;
  sans = ok;
  fens = newFens;
  return ok.length === newSans.length;
}

/**
 * Analyse `fen` to at least `depth`. Cached results shallower than `depth`
 * are re-searched. `onPartial(snapshot)` fires after each completed depth.
 */
async function analyseFen(fen, gen, ms, onPartial) {
  const cached = evalCache.get(fen);
  if (cached && (cached.terminal || (cached.ms || 0) >= ms)) return cached;
  const chess = new Chess(fen);
  if (chess.isGameOver()) {
    const r = { bestMove: null, lines: [], depth: 0, ms, terminal: true };
    evalCache.set(fen, r);
    return r;
  }
  try { await engine.readyPromise; } catch { return null; }
  const r = await engine.analyse(fen, ms, (snap) => {
    if (gen !== generation) return;
    setStatus(`${fmtSecs(Math.min(snap.elapsed, ms))} / ${fmtSecs(ms)} · depth ${snap.depth}`);
    if (onPartial) onPartial(snap);
  });
  // a longer think supersedes a shorter one; an interrupted search does not
  if (r && r.lines.length && (!cached || (r.ms || 0) >= (cached.ms || 0))) {
    evalCache.set(fen, r);
  }
  return r && r.lines.length ? r : (cached || null);
}

/**
 * A move both of whose positions are named theory, before the engine has said
 * anything. Book is the one grade that needs no search, and that is the point:
 * 1.e4 should never spend a third of a second labelled an inaccuracy while a
 * shallow search catches up.
 */
function isBookMove(i) {
  if (fens[i + 1] === undefined) return false;
  return !!lookupOpening(fens[i + 1]) && (i === 0 || !!lookupOpening(fens[i]));
}

function bookGrade(i) {
  const chess = new Chess(fens[i]);
  let move = null;
  try { move = chess.move(sans[i]); } catch { /* unparsable: leave it */ }
  const empty = { bestMove: null, lines: [], depth: 0, ms: 0 };
  return {
    cat: "book", loss: 0, move, san: sans[i], ply: i,
    before: empty, after: empty,
    cpBest: 0, cpAfter: 0, isEngineBest: false,
    opening: lookupOpening(fens[i + 1]),
    depth: 0, provisional: true, fromBook: true,
  };
}

function buildGrade(i, before, after, provisional) {
  const g = classify(before, after, fens[i], sans[i], i);
  g.before = before;
  g.after = after;
  g.san = sans[i];
  g.ply = i;
  g.depth = Math.min(before.terminal ? 99 : before.depth, after.terminal ? 99 : after.depth);
  g.provisional = provisional;
  return g;
}

function isShown(i) {
  return (selected >= 0 ? selected : sans.length - 1) === i;
}

/**
 * Grade ply i to `depth`. When `live` is set the badge updates after every
 * completed depth so a provisional grade appears within a second or so.
 */
async function gradePly(i, gen, ms, live) {
  const existing = grades[i];
  if (existing && !existing.provisional && (existing.ms || 0) >= ms) return existing;

  // Theory first, and without waiting for the engine at all: a move that
  // reaches a named position is named straight away rather than after a
  // shallow search has had a chance to call 1.e4 an inaccuracy. classify()
  // still runs behind this and still has the last word - a named line that
  // leaves the mover simply lost loses the badge on the next render.
  if (live && !existing && isBookMove(i)) {
    grades[i] = bookGrade(i);
    if (isShown(i)) renderCurrent();
    renderHistory();
  }

  // Quick pass: get both positions to FIRST_GRADE_DEPTH so a grade shows
  // right away, before the (much longer) full-depth search starts.
  if (live && ms > QUICK_MS && !(existing && (existing.ms || 0) >= QUICK_MS)) {
    const b0 = await analyseFen(fens[i], gen, QUICK_MS, null);
    if (!b0 || gen !== generation) return null;
    const a0 = await analyseFen(fens[i + 1], gen, QUICK_MS, null);
    if (!a0 || gen !== generation) return null;
    grades[i] = buildGrade(i, b0, a0, true);
    if (isShown(i)) renderCurrent();
    renderHistory();
  }

  const before = await analyseFen(fens[i], gen, ms, live ? (snap) => {
    // "before" is usually cached (it was the previous "after"); if not, grade
    // provisionally against whatever we have for "after" so far.
    const aft = evalCache.get(fens[i + 1]);
    if (aft && gen === generation) { grades[i] = buildGrade(i, snap, aft, true); if (isShown(i)) renderCurrent(); renderHistory(); }
  } : null);
  if (!before || gen !== generation) return null;

  const after = await analyseFen(fens[i + 1], gen, ms, live ? (snap) => {
    if (gen !== generation) return;
    grades[i] = buildGrade(i, before, snap, true);
    if (isShown(i)) renderCurrent();
    renderHistory();
  } : null);
  if (!after || gen !== generation) return null;

  const g = buildGrade(i, before, after, false);
  g.ms = ms;
  grades[i] = g;
  return g;
}

async function run() {
  const gen = ++generation;
  if (paused) {
    showIdle(paused, "paused");
    return;
  }
  if (!sans.length) {
    showIdle("Waiting for moves", "idle");
    return;
  }
  const last = sans.length - 1;

  // 1. latest move, progressively, to the configured depth
  const g = await gradePly(last, gen, settings.thinkMs, true);
  if (gen !== generation) return;
  if (g) renderCurrent();
  renderHistory();

  // 2. earlier moves (cheap: each needs one new search)
  if (settings.backfill) {
    for (let i = last - 1; i >= 0; i--) {
      if (gen !== generation) return;
      if (grades[i] && !grades[i].provisional) continue;
      setStatus(`grading earlier moves… (${i + 1}/${sans.length})`);
      await gradePly(i, gen, settings.thinkMs, false);
      if (gen !== generation) return;
      renderHistory();
      if (selected === i) renderCurrent();
    }
  }

  setStatus(`depth ${g ? g.depth : "?"} in ${fmtSecs(settings.thinkMs)} · waiting for next move`);
}

// ----------------------------------------------------------------- rendering
function moveNumber(ply) {
  return Math.floor(ply / 2) + 1 + (ply % 2 === 0 ? "." : "…");
}

function setCat(cat) {
  els.badge.className = "cat-" + cat;
  els.label.className = "cat-" + cat;
  els.glyph.textContent = CATEGORIES[cat].glyph;
  els.label.textContent = CATEGORIES[cat].label;
  els.badge.classList.add("pop");
  setTimeout(() => els.badge.classList.remove("pop"), 160);
}

function pieceUrl(p) {
  const name = (p.color === "w" ? "w" : "b") + p.type.toUpperCase();
  return assetUrl(`pieces/${settings.pieceSet}/${name}.svg`);
}

/** Draw `fen` on the mini board, highlighting `move` and pinning `cat` to its destination. */
function renderBoard(fen, move, cat) {
  const chess = new Chess(fen);
  const grid = chess.board(); // [rank8..rank1][a..h]
  const frag = document.createDocumentFragment();
  for (let rr = 0; rr < 8; rr++) {
    for (let ff = 0; ff < 8; ff++) {
      // screen row/col -> board indices, honouring orientation
      const r = flipped ? 7 - rr : rr;
      const f = flipped ? 7 - ff : ff;
      const sqName = "abcdefgh"[f] + (8 - r);
      const sq = document.createElement("div");
      sq.className = "sq" + ((r + f) % 2 ? " d" : "");
      if (move && sqName === move.from) sq.classList.add("from");
      if (move && sqName === move.to) sq.classList.add("to");
      const p = grid[r][f];
      if (p) {
        const img = document.createElement("img");
        img.src = pieceUrl(p);
        img.alt = "";
        sq.appendChild(img);
      }
      if (move && sqName === move.to && cat && cat !== "none") {
        const mini = document.createElement("span");
        mini.className = "mini cat-" + cat;
        mini.textContent = [...CATEGORIES[cat].glyph][0];
        sq.appendChild(mini);
      }
      frag.appendChild(sq);
    }
  }
  els.board.replaceChildren(frag);
}

function renderEvalBar(line, whiteToMove, terminal, cat) {
  let cpWhite;
  if (terminal) cpWhite = cat === "mate" ? (whiteToMove ? -1600 : 1600) : 0;
  else cpWhite = line ? lineToCp(line) * (whiteToMove ? 1 : -1) : 0;
  const pct = winPct(cpWhite);
  els.evalfill.style.height = pct + "%";
  const txt = terminal ? (cat === "mate" ? "#" : "½") : fmtEval(line, whiteToMove).replace(/^\+/, "");
  els.evaltext.textContent = txt;
  els.evalbar.classList.toggle("black-top", pct < 50);
}

function pvToSan(fen, pv, n = 5) {
  const chess = new Chess(fen);
  const out = [];
  for (const uci of pv.slice(0, n)) {
    try {
      const m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      if (!m) break;
      out.push(m.san);
    } catch { break; }
  }
  return out.join(" ");
}

/**
 * Name the line under the badge. Once the game leaves theory the last name it
 * had is kept, dimmed, so the panel still says which opening was played rather
 * than going blank on the first new move.
 */
function renderOpening(g) {
  let name = g.opening;
  let stale = false;
  for (let i = g.ply - 1; !name && i >= 0; i--) {
    if (grades[i] && grades[i].opening) {
      name = grades[i].opening;
      stale = true;
    }
  }
  els.opening.textContent = name || "";
  els.opening.classList.toggle("stale", stale);
  els.opening.title = name ? (stale ? name + " (out of book)" : name) : "";
}

function renderGrade(g) {
  setCat(g.cat);
  const white = g.ply % 2 === 0;
  els.move.textContent = `${moveNumber(g.ply)} ${g.san} · ${white ? "White" : "Black"}`;
  // engine scores are from the side to move: White before a White move, Black after it.
  els.evalBefore.textContent = fmtEval(g.before.lines[0], white);
  els.evalAfter.textContent = g.after.terminal ? (g.cat === "mate" ? "#" : "½") : fmtEval(g.after.lines[0], !white);

  renderOpening(g);

  const bits = [];
  if (g.loss > 0.05) bits.push(`−${g.loss.toFixed(1)}% win chance`);
  if (g.isEngineBest) bits.push("engine's top choice");
  if (g.fromBook) bits.push("opening book…");
  else bits.push(`depth ${g.depth}${g.provisional ? "…" : ""}`);
  els.detail.textContent = bits.join(" · ");

  if (!g.isEngineBest && g.before.lines[0] && g.cat !== "mate" && g.cat !== "book") {
    els.bestline.textContent = "Best was " + pvToSan(fens[g.ply], g.before.lines[0].pv, 4);
  } else {
    els.bestline.textContent = "";
  }

  renderBoard(fens[g.ply + 1], g.move, g.cat);
  renderEvalBar(g.after.lines[0], !white, g.after.terminal, g.cat);
  // the on-board badge only ever shows the latest move, not one picked from the history strip
  if (g.ply === sans.length - 1) postGrade(g);
}

function renderCurrent() {
  const idx = selected >= 0 ? selected : sans.length - 1;
  if (idx < 0) return;
  const g = grades[idx];
  if (g) {
    renderGrade(g);
  } else {
    setCat("none");
    els.label.textContent = "Grading…";
    els.move.textContent = `${moveNumber(idx)} ${sans[idx]}`;
    els.evalBefore.textContent = "·";
    els.evalAfter.textContent = "·";
    els.detail.textContent = "";
    els.bestline.textContent = "";
    const chess = new Chess(fens[idx]);
    let m = null;
    try { m = chess.move(sans[idx]); } catch {}
    renderBoard(fens[idx + 1], m, null);
  }
  for (const s of els.history.children) s.classList.toggle("current", +s.dataset.ply === idx);
}

function showIdle(text, status) {
  setCat("none");
  els.label.textContent = text;
  els.move.textContent = "—";
  els.evalBefore.textContent = "·";
  els.evalAfter.textContent = "·";
  els.detail.textContent = "";
  els.bestline.textContent = "";
  els.history.innerHTML = "";
  renderBoard(new Chess().fen(), null, null);
  renderEvalBar(null, true, false, null);
  setStatus(status);
  postGrade(null);
}

function renderHistory() {
  const frag = document.createDocumentFragment();
  // one fixed-height row: show only as many recent moves as fit (17px per dot)
  const fit = Math.max(8, Math.floor((els.history.clientWidth || 380) / 17));
  const start = Math.max(0, sans.length - fit);
  const cur = selected >= 0 ? selected : sans.length - 1;
  for (let i = start; i < sans.length; i++) {
    const s = document.createElement("span");
    const g = grades[i];
    s.className = "cat-" + (g ? g.cat : "none") + (i === cur ? " current" : "");
    s.textContent = g ? [...CATEGORIES[g.cat].glyph][0] : "";
    s.title = `${moveNumber(i)} ${sans[i]}${g ? " – " + CATEGORIES[g.cat].label : ""}`;
    s.dataset.ply = i;
    s.addEventListener("click", () => {
      selected = i === sans.length - 1 ? -1 : i;
      renderCurrent();
    });
    frag.appendChild(s);
  }
  els.history.replaceChildren(frag);
  reportHeight();
}

// ----------------------------------------------------------------- messages
window.addEventListener("message", (ev) => {
  const d = ev.data;
  if (!d || d.type !== "movegrade:moves") return;
  paused = d.allowed ? "" : d.reason || "Paused";
  const orientationChanged = !!d.flipped !== flipped;
  flipped = !!d.flipped;
  const complete = rebuild(d.sans || []);
  if (orientationChanged && sans.length) renderCurrent();
  if (!complete) setStatus("could not parse full move list");
  if (!grades[sans.length - 1]) postGrade(null); // new move: clear the stale board badge
  if (!paused && sans.length) renderCurrent();
  run();
});

window.__movegrade = { get sans() { return sans; }, get grades() { return grades; }, evalCache };

showIdle("Waiting for moves", "loading engine…");
parent.postMessage({ type: "movegrade:ready" }, "*");
reportHeight();
