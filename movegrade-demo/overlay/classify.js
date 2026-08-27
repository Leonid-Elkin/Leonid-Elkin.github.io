// Move classification: turns "eval before" / "eval after" into a badge.
//
// Win-probability model is lichess's (win% = 50 + 50 * (2 / (1 + e^(-0.00368208 * cp)) - 1)).
// Thresholds are between lichess (lenient) and chess.com (strict).

import { Chess } from "../lib/chess.js";
import { lookupOpening } from "./book.js";

const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

// How badly the mover may stand after a book move and still have it called
// "Book". Loose enough for the pawn a gambit invests, tight enough that a named
// but refuted line is graded on its merits instead.
const BOOK_MIN_CP = -150;

export const CATEGORIES = {
  brilliant:  { label: "Brilliant",  glyph: "!!" },
  great:      { label: "Great",      glyph: "!"  },
  best:       { label: "Best",       glyph: "★"  },
  excellent:  { label: "Excellent",  glyph: "✓"  },
  good:       { label: "Good",       glyph: "✓"  },
  book:       { label: "Book",       glyph: "📖" },
  inaccuracy: { label: "Inaccuracy", glyph: "?!" },
  mistake:    { label: "Mistake",    glyph: "?"  },
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

/**
 * @param before  analysis of the position before the move (UCI perspective = mover to move)
 * @param after   analysis of the position after the move (UCI perspective = opponent to move)
 * @param fenBefore
 * @param san     the move played
 * @param ply     0-based ply index of the move
 *
 * Returns `opening` (the ECO name of the position reached, or null) alongside
 * the badge, so the panel can name the line even once it stops being book.
 */
export function classify(before, after, fenBefore, san, ply) {
  const chess = new Chess(fenBefore);
  let move = null;
  try { move = chess.move(san); } catch { /* illegal / unparsable */ }
  if (!move) return { cat: "none", loss: 0, opening: null };

  // The ECO name of the position this move reaches, reported whatever the badge
  // turns out to be.
  const opening = lookupOpening(chess.fen());

  if (chess.isCheckmate()) return { cat: "mate", loss: 0, move, opening };

  const bestLine = before.lines[0];
  const secondLine = before.lines[1];
  const afterLine = after.lines[0];
  if (!bestLine) return { cat: "none", loss: 0, move, opening };

  const cpBest = lineToCp(bestLine);
  const cpSecond = secondLine ? lineToCp(secondLine) : cpBest - 9999;
  // after-eval is from the opponent's perspective; flip to the mover's.
  const cpAfter = afterLine ? -lineToCp(afterLine) : (chess.isStalemate() || chess.isDraw() ? 0 : cpBest);

  const wBest = winPct(cpBest);
  const wAfter = winPct(cpAfter);
  const loss = Math.max(0, wBest - wAfter);
  const uci = move.from + move.to + (move.promotion || "");
  const isEngineBest = before.bestMove === uci;

  // In book: the move reaches a named theoretical position and the game has not
  // left theory on the way there (without that second test a pointless shuffle
  // that transposes back into a book position would read as book again).
  //
  // A gambit is book even though it drops material — that is the whole point of
  // grading against theory rather than against the engine's eval, and it is why
  // 3. c3 in the Smith-Morra reads "Book" and not "Inaccuracy".
  //
  // BOOK_MIN_CP is what stops that from excusing everything with a name on it.
  // A named line keeps the badge while it is merely worse (2... f6, the Damiano
  // Defence, is about -0.85 and stays book); it loses the badge at the point
  // the mover is simply lost, which for the Damiano is 3... fxe5 at about -2.3.
  const inBook = opening && (ply === 0 || lookupOpening(fenBefore) !== null);

  let cat;
  if (inBook && cpAfter > BOOK_MIN_CP) {
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
  else if (loss < 20) cat = "mistake";
  else cat = "blunder";

  return { cat, loss, move, cpBest, cpAfter, isEngineBest, opening };
}
