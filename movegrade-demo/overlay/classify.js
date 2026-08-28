// Move classification: turns "eval before" / "eval after" into a badge.
//
// Win-probability model is lichess's (win% = 50 + 50 * (2 / (1 + e^(-0.00368208 * cp)) - 1)).
// Thresholds are between lichess (lenient) and chess.com (strict).

import { Chess } from "../lib/chess.js";

const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

export const CATEGORIES = {
  brilliant:  { label: "Brilliant",  glyph: "!!" },
  great:      { label: "Great",      glyph: "!"  },
  best:       { label: "Best",       glyph: "★"  },
  excellent:  { label: "Excellent",  glyph: "✓"  },
  good:       { label: "Good",       glyph: "✓"  },
  book:       { label: "Book",       glyph: "📖" },
  inaccuracy: { label: "Inaccuracy", glyph: "?!" },
  mistake:    { label: "Mistake",    glyph: "?"  },
  miss:       { label: "Miss",       glyph: "✗"  },
  blunder:    { label: "Blunder",    glyph: "??" },
  mate:       { label: "Checkmate",  glyph: "#"  },
  none:       { label: "—",          glyph: "·"  },
};

/** Convert a UCI score line into centipawns (mate mapped far outside cp range). */
export function lineToCp(line) {
  if (!line) return 0;
  if (line.mate !== null && line.mate !== undefined) {
    const sign = line.mate > 0 ? 1 : -1;
    return sign * (1500 + Math.max(0, 100 - Math.abs(line.mate)));
  }
  return line.cp ?? 0;
}

export function winPct(cp) {
  const c = Math.max(-1500, Math.min(1500, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}

/** Format a UCI score (side-to-move perspective) as a White-perspective string. */
export function fmtEval(line, whiteToMove) {
  if (!line) return "·";
  const s = whiteToMove ? 1 : -1;
  if (line.mate !== null && line.mate !== undefined) {
    const m = line.mate * s;
    return (m > 0 ? "M" : "-M") + Math.abs(m);
  }
  const v = ((line.cp ?? 0) * s) / 100;
  return (v > 0 ? "+" : "") + v.toFixed(2);
}

/**
 * Was `move` (chess.js verbose move object, already applied on `after`) a sacrifice?
 * A piece is offered if, after the move, it sits on a square the opponent attacks
 * and either nothing defends it or the cheapest attacker is worth less than it.
 * Captures that win at least equal material are not sacrifices.
 */
function isSacrifice(after, move) {
  const mover = move.color;
  const opp = mover === "w" ? "b" : "w";
  const movedVal = PIECE_VALUE[move.promotion || move.piece];
  const capturedVal = move.captured ? PIECE_VALUE[move.captured] : 0;
  if (move.piece === "k") return false;
  if (capturedVal >= movedVal) return false;

  const attackers = after.attackers(move.to, opp);
  if (!attackers.length) return false;
  const cheapest = Math.min(...attackers.map((sq) => PIECE_VALUE[after.get(sq).type]));
  const defenders = after.attackers(move.to, mover);
  const netLoss = movedVal - capturedVal;
  if (!defenders.length) return netLoss >= 2;
  return cheapest < movedVal && netLoss - cheapest >= 2;
}

/* A win was on the board and the move played does not keep it: either a forced
   mate for the mover, or an evaluation far enough ahead that the game was won.
   Reported as a Miss instead of a Mistake or a Blunder, because the useful
   thing to say is that a win was there - not how many centipawns went with it.
   The size of the drop still decides whether we get this far at all. */
const WIN_CP = 300;   /* a clear piece up: the chance was real */
const KEPT_CP = 150;  /* still comfortably better: the chance was not thrown */

function missedChance(bestLine, cpBest, cpAfter) {
  const hadMate = bestLine.mate !== null && bestLine.mate !== undefined && bestLine.mate > 0;
  if (!hadMate && cpBest < WIN_CP) return false;
  return cpAfter < KEPT_CP;
}

/**
 * @param before  analysis of the position before the move (UCI perspective = mover to move)
 * @param after   analysis of the position after the move (UCI perspective = opponent to move)
 * @param fenBefore
 * @param san     the move played
 * @param ply     0-based ply index of the move
 */
export function classify(before, after, fenBefore, san, ply) {
  const chess = new Chess(fenBefore);
  let move = null;
  try { move = chess.move(san); } catch { /* illegal / unparsable */ }
  if (!move) return { cat: "none", loss: 0 };

  if (chess.isCheckmate()) return { cat: "mate", loss: 0, move };

  const bestLine = before.lines[0];
  const secondLine = before.lines[1];
  const afterLine = after.lines[0];
  if (!bestLine) return { cat: "none", loss: 0, move };

  const cpBest = lineToCp(bestLine);
  const cpSecond = secondLine ? lineToCp(secondLine) : cpBest - 9999;
  // after-eval is from the opponent's perspective; flip to the mover's.
  const cpAfter = afterLine ? -lineToCp(afterLine) : (chess.isStalemate() || chess.isDraw() ? 0 : cpBest);

  const wBest = winPct(cpBest);
  const wAfter = winPct(cpAfter);
  const loss = Math.max(0, wBest - wAfter);
  const uci = move.from + move.to + (move.promotion || "");
  const isEngineBest = before.bestMove === uci;

  let cat;
  if (ply < 12 && loss < 3 && Math.abs(cpBest) < 80) {
    cat = "book";
  } else if (isEngineBest || loss < 0.5) {
    cat = "best";
    const onlyMove = winPct(cpBest) - winPct(cpSecond) >= 10;
    const notCrushing = cpBest < 500 && cpBest > -300;
    if (notCrushing && cpAfter > -60 && isSacrifice(chess, move)) cat = "brilliant";
    else if (onlyMove && notCrushing) cat = "great";
  } else if (loss < 2) cat = "excellent";
  else if (loss < 5) cat = "good";
  else if (loss < 10) cat = "inaccuracy";
  else if (missedChance(bestLine, cpBest, cpAfter)) cat = "miss";
  else if (loss < 20) cat = "mistake";
  else cat = "blunder";

  return { cat, loss, move, cpBest, cpAfter, isEngineBest };
}
