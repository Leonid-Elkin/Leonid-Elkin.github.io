// Position key for the opening book, shared by the runtime lookup and by
// tools/build-book.mjs so the generated keys always match what we look up.

/**
 * Stable key for a position: board, side to move and castling rights.
 *
 * The en-passant square and the move clocks are deliberately dropped. Book
 * lines are identified by structure, and leaving them out lets transpositions
 * that arrive at the same position by a different move order share one key.
 *
 * Two 32-bit hashes (FNV-1a and djb2) are concatenated in base 36, giving a
 * 64-bit key — collisions across the ~30k book positions are negligible.
 */
export function bookKey(fen) {
  const f = fen.split(" ");
  const s = f[0] + " " + f[1] + " " + f[2];
  let h1 = 0x811c9dc5;
  let h2 = 5381;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = (Math.imul(h2, 33) ^ c) >>> 0;
  }
  return h1.toString(36).padStart(7, "0") + h2.toString(36).padStart(7, "0");
}
