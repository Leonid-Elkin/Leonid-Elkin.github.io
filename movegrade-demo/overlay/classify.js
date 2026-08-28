// Move classification: turns "eval before" / "eval after" into a badge.
//
// Two published systems are copied here rather than invented:
//
// 1. The win-probability model is lichess's, from https://lichess.org/page/accuracy
//        Win% = 50 + 50 * (2 / (1 + exp(-0.00368208 * centipawns)) - 1)
//    Everything below is measured as win% lost by the side that moved - a
//    1-pawn error in a dead-drawn endgame and the same pawn when you are
//    already up a queen are not the same mistake.
//
// 2. The thresholds are chess.com's "Expected Points" bands, from
//    https://support.chess.com/en/articles/8572705-how-are-moves-classified-what-is-a-blunder-or-brilliant-etc
//        Excellent 0.00-0.02, Good 0.02-0.05, Inaccuracy 0.05-0.10,
//        Mistake 0.10-0.20, Blunder 0.20-1.00
//    Expected points run 0-1, so 0.02 expected points is 2 win% points here.
//    lichess grades far more leniently (10/20/30%); we follow chess.com
//    because that is the scale players recognise.

import { Chess } from "../lib/chess.js";
import { lookupOpening } from "./book.js";

const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

// How badly the mover may stand after a book move and still have it called
// "Book". Loose enough for the pawn a gambit invests, tight enough that a named
// but refuted line is graded on its merits instead.
const BOOK_MIN_CP = -150;

// Win% lost, i.e. chess.com's expected-points bands x100.
const T_EXCELLENT = 2;
const T_GOOD = 5;
const T_INACCURACY = 10;
const T_MISTAKE = 20;

// A Miss is a Mistake or Blunder that specifically threw away a win: the mover
// stood at WINNING and no longer stands at STILL_WINNING.
const WINNING = 75;
const STILL_WINNING = 60;

export const CATEGORIES = {
  brilliant:  { label: "Brilliant",  glyph: "!!" },
  great:      { label: "Great",      glyph: "!"  },
  best:       { label: "Best",       glyph: "★"  },
  excellent:  { label: "Excellent",  glyph: "✓"  },
  good:       { label: "Good",       glyph: "✓"  },
  book:       { label: "Book",       glyph: "📖" },
  forced:     { label: "Forced",     glyph: "→"  },
  inaccuracy: { label: "Inaccuracy", glyph: "?!" },
  miss:       { label: "Miss",       glyph: "✗"  },
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
  const legalMoves = chess.moves().length;
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
  const uci = move.from + move.to + (move.promotion || "");
  const isEngineBest = before.bestMove === uci;

  // The before- and after-positions are searched separately, so their scores
  // disagree by a few centipawns even for the engine's own top move, and the
  // panel would say "Best - 3.0% lost" about the move the engine asked for.
  // That move loses nothing by definition.
  const loss = isEngineBest ? 0 : Math.max(0, wBest - wAfter);

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

  // Nothing to grade when there was no choice. Checked before the book so a
  // forced recapture inside theory reads as forced rather than as approval.
  const hadMate = bestLine.mate !== null && bestLine.mate !== undefined && bestLine.mate > 0;

  let cat;
  if (legalMoves === 1) {
    cat = "forced";
  } else if (inBook && cpAfter > BOOK_MIN_CP) {
    cat = "book";
  } else if (isEngineBest || loss < 0.5) {
    cat = "best";
    const onlyMove = winPct(cpBest) - winPct(cpSecond) >= 10;
    const notCrushing = cpBest < 500 && cpBest > -300;
    if (notCrushing && cpAfter > -60 && isSacrifice(chess, move)) cat = "brilliant";
    else if (onlyMove && notCrushing) cat = "great";
  } else if (loss >= T_GOOD && (hadMate || wBest >= WINNING) && wAfter < STILL_WINNING) {
    // A win was there and the move does not keep it. Named for the chance
    // rather than for the size of the drop, so it replaces Mistake/Blunder.
    cat = "miss";
  } else if (loss < T_EXCELLENT) cat = "excellent";
  else if (loss < T_GOOD) cat = "good";
  else if (loss < T_INACCURACY) cat = "inaccuracy";
  else if (loss < T_MISTAKE) cat = "mistake";
  else cat = "blunder";

  if (cat === "forced") return { cat, loss: 0, move, cpBest, cpAfter, isEngineBest, opening };
  return { cat, loss, move, cpBest, cpAfter, isEngineBest, opening };
}
