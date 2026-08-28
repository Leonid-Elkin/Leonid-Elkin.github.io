// Move classification: turns "eval before" / "eval after" into a badge.
//
// Two published systems are copied here rather than invented:
//
// 1. The win-probability model is lichess's, from https://lichess.org/page/accuracy
//        Win% = 50 + 50 * (2 / (1 + exp(-0.00368208 * centipawns)) - 1)
//    Everything below is measured as win% lost by the side that moved, which is
//    what both sites grade on - a 1-pawn error in a dead-drawn endgame and the
//    same 1 pawn when you are already up a queen are not the same mistake.
//
// 2. The thresholds are chess.com's "Expected Points" bands, from
//    https://support.chess.com/en/articles/8572705-how-are-moves-classified-what-is-a-blunder-or-brilliant-etc
//        Best        0.00          expected points lost
//        Excellent   0.00 - 0.02
//        Good        0.02 - 0.05
//        Inaccuracy  0.05 - 0.10
//        Mistake     0.10 - 0.20
//        Blunder     0.20 - 1.00
//    Expected points run 0-1, so 0.02 expected points is 2 win% points here.
//    lichess's own judgements are far more lenient - 10/20/30% for
//    inaccuracy/mistake/blunder (lila, modules/analyse/src/main/Advice.scala).
//    We follow chess.com because that is the scale players recognise.
//
// The named categories that sit outside the bands follow chess.com's wording:
//   Brilliant  "when you find a good piece sacrifice", not from an already-won position
//   Great      "critical to the outcome of the game ... the only good move in a position"
//   Miss       "fail to capitalize on your opponent's mistake"
//   Book       a known opening move - see book.js
//   Forced     only one legal move, so there is nothing to grade

import { Chess } from "../lib/chess.js";
import { isBookPosition } from "./book.js";

const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

// Win% lost, i.e. chess.com's expected-points bands x100.
const T_EXCELLENT = 2;
const T_GOOD = 5;
const T_INACCURACY = 10;
const T_MISTAKE = 20;

// A position is "winning" for the mover at WINNING win%; below STILL_WINNING it
// is no longer a win. Used only to tell a Miss from an ordinary Mistake.
const WINNING = 75;
const STILL_WINNING = 60;

// "The only good move": the second-best move is this many win% worse.
const ONLY_MOVE_GAP = 10;

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
 */
export function classify(before, after, fenBefore, san, ply) {
  const chess = new Chess(fenBefore);
  const legalMoves = chess.moves().length;
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
  const uci = move.from + move.to + (move.promotion || "");
  const isEngineBest = before.bestMove === uci;

  // The before- and after-positions are searched separately, so their scores
  // disagree by a few centipawns even for the engine's own top move. Taking the
  // raw difference there produced badges like "Best - 3.0% lost", which is a
  // contradiction: the move the engine wanted loses nothing by definition.
  const loss = isEngineBest ? 0 : Math.max(0, wBest - wAfter);

  const result = { loss, move, cpBest, cpAfter, isEngineBest };

  // Nothing to grade when there was no choice.
  if (legalMoves === 1) return { ...result, cat: "forced", loss: 0 };

  // Theory. Both the position before and the position after have to be known
  // openings, so a game that has left book cannot wander back into it - which is
  // what used to badge a king shuffle on move 3 as Book. A move that loses more
  // than the Good band is graded on its merits even if a database names it
  // (2.Ke2 is in the database as the Bongcloud Attack; it is still bad).
  if (loss < T_GOOD && isBookPosition(fenBefore) && isBookPosition(chess.fen())) {
    return { ...result, cat: "book" };
  }

  if (isEngineBest || loss < 0.5) {
    const onlyMove = wBest - winPct(cpSecond) >= ONLY_MOVE_GAP;
    const notCrushing = cpBest < 500 && cpBest > -300;
    let cat = "best";
    if (notCrushing && cpAfter > -60 && isSacrifice(chess, move)) cat = "brilliant";
    else if (onlyMove && notCrushing) cat = "great";
    return { ...result, cat };
  }

  // A Miss is a Mistake or Blunder that specifically threw away a win, so it is
  // checked before the bands and replaces whatever they would have said.
  const hadMate = bestLine.mate > 0;
  if (loss >= T_GOOD && (hadMate || wBest >= WINNING) && wAfter < STILL_WINNING) {
    return { ...result, cat: "miss" };
  }

  let cat;
  if (loss < T_EXCELLENT) cat = "excellent";
  else if (loss < T_GOOD) cat = "good";
  else if (loss < T_INACCURACY) cat = "inaccuracy";
  else if (loss < T_MISTAKE) cat = "mistake";
  else cat = "blunder";

  return { ...result, cat };
}
