"""Make a recovered voice actually playable on one instrument.

Two jobs:

  fold      an organ voice spans far more than a guitar's range, so each
            phrase is moved by whole octaves until it fits. Phrases are
            chosen at rests, and the octave choice is a DP over the whole
            part so it does not hop octaves every other bar.

  monophony one note at a time, always: overlaps left by voice separation
            are truncated and same-onset collisions resolved.
"""

from __future__ import annotations

import bisect
from dataclasses import dataclass, replace

from .score import Note

# MIDI numbers of the open strings, lowest first.
TUNINGS = {
    "standard": [40, 45, 50, 55, 59, 64],       # E A D G B E
    "drop-d": [38, 45, 50, 55, 59, 64],
    "eb": [39, 44, 49, 54, 58, 63],
    "d-standard": [38, 43, 48, 53, 57, 62],
    "bass": [28, 33, 38, 43],                    # E A D G
    "bass5": [23, 28, 33, 38, 43],
    "bass-drop-d": [26, 33, 38, 43],
}


@dataclass
class FoldConfig:
    fret_count: int = 22
    phrase_gap_frac: float = 1.0    # a rest this many quarters long starts a new phrase
    w_out_of_range: float = 12.0
    w_center: float = 0.35
    # Changing octave mid-part is audible as a leap, so it is expensive:
    # at 4.0 the corpus produced 578 such jumps, at 25.0 it produces 138.
    w_shift_change: float = 25.0
    min_duration_frac: float = 0.05  # of a quarter; shorter leftovers are dropped


def playable_range(tuning: list[int], fret_count: int) -> tuple[int, int]:
    return min(tuning), max(tuning) + fret_count


def register_target(notes: list[Note], tuning: list[int], cfg: FoldConfig) -> float:
    """The register a part should be folded toward: its own.

    Every guitar shares a tuning, so pulling all of them to the middle of
    the neck squeezes the voices together and lets them cross -- the top
    line drops an octave, the bottom one climbs, and the counterpoint is
    inverted. Aiming each part at the register its own voice actually
    occupies keeps the parts in the order the composer stacked them, and
    leaves a voice that already fits exactly where it was written.
    """
    lo, hi = playable_range(tuning, cfg.fret_count)
    if not notes:
        return (lo + hi) / 2
    pitches = sorted(x.pitch for x in notes)
    median = pitches[len(pitches) // 2]
    return float(min(max(median, lo), hi))


def fold_into_range(
    notes: list[Note],
    tuning: list[int],
    ppq: int,
    cfg: FoldConfig,
    clamp: bool = True,
    target: float | None = None,
) -> tuple[list[Note], int]:
    """Octave-shift phrases so they fit the instrument.

    With `clamp` set, a stray note still outside the range after its phrase
    moves is nudged by whole octaves until it fits. Clear it to leave such
    notes where they are, so a caller can deal with them another way.

    `target` is the register phrases are drawn toward; it defaults to the
    middle of the neck, which is right for a lone part but crosses the
    voices of an ensemble -- see `register_target`.

    Returns the folded notes and the most-used shift (for reporting).
    """
    if not notes:
        return [], 0
    lo, hi = playable_range(tuning, cfg.fret_count)
    if target is None:
        target = (lo + hi) / 2

    phrases = _phrases(notes, int(ppq * cfg.phrase_gap_frac))
    candidates = _candidate_shifts(notes, lo, hi)

    # DP: best cumulative cost of giving phrase i shift s.
    best: list[dict[int, float]] = []
    back: list[dict[int, int]] = []
    for idx, phrase in enumerate(phrases):
        row_cost, row_back = {}, {}
        for shift in candidates:
            local = _phrase_cost(phrase, shift, lo, hi, target, cfg)
            if idx == 0:
                row_cost[shift], row_back[shift] = local, shift
            else:
                prev_shift, prev_cost = min(
                    (
                        (ps, pc + cfg.w_shift_change * abs(shift - ps) / 12)
                        for ps, pc in best[idx - 1].items()
                    ),
                    key=lambda kv: kv[1],
                )
                row_cost[shift], row_back[shift] = local + prev_cost, prev_shift
        best.append(row_cost)
        back.append(row_back)

    chosen: list[int] = [min(best[-1], key=best[-1].get)]
    for idx in range(len(phrases) - 1, 0, -1):
        chosen.append(back[idx][chosen[-1]])
    chosen.reverse()

    out: list[Note] = []
    for phrase, shift in zip(phrases, chosen):
        for note in phrase:
            moved = note.shifted(shift)
            if clamp:
                while moved.pitch < lo:
                    moved = moved.shifted(12)
                while moved.pitch > hi:
                    moved = moved.shifted(-12)
            out.append(moved)

    dominant = max(set(chosen), key=chosen.count) if chosen else 0
    return out, dominant


def enforce_monophony(notes: list[Note], ppq: int, cfg: FoldConfig) -> list[Note]:
    """Guarantee one sounding note at a time."""
    if not notes:
        return []
    ordered = sorted(notes, key=lambda n: (n.start, -n.duration, -n.pitch))

    # Collapse same-onset collisions, keeping the longest (then highest).
    deduped: list[Note] = []
    for note in ordered:
        if deduped and note.start == deduped[-1].start:
            continue
        deduped.append(note)

    min_dur = max(1, int(ppq * cfg.min_duration_frac))
    out: list[Note] = []
    for idx, note in enumerate(deduped):
        end = note.end
        if idx + 1 < len(deduped):
            end = min(end, deduped[idx + 1].start)
        if end - note.start < min_dur:
            continue
        out.append(replace(note, end=end))
    return out


def _phrases(notes: list[Note], gap: int) -> list[list[Note]]:
    phrases: list[list[Note]] = [[notes[0]]]
    for prev, note in zip(notes, notes[1:]):
        if note.start - prev.end >= gap:
            phrases.append([])
        phrases[-1].append(note)
    return phrases


def _candidate_shifts(notes: list[Note], lo: int, hi: int) -> list[int]:
    """Octave shifts worth considering for this part."""
    pitches = [n.pitch for n in notes]
    span_lo, span_hi = min(pitches), max(pitches)
    shifts = set()
    for target_edge, source_edge in ((lo, span_lo), (hi, span_hi)):
        base = round((target_edge - source_edge) / 12) * 12
        shifts.update(base + 12 * k for k in range(-2, 3))
    shifts.add(0)
    return sorted(shifts)


def _phrase_cost(
    phrase: list[Note], shift: int, lo: int, hi: int, target: float, cfg: FoldConfig
) -> float:
    out_of_range = 0
    total = 0
    for note in phrase:
        pitch = note.pitch + shift
        if pitch < lo or pitch > hi:
            out_of_range += 1
        total += pitch
    mean = total / len(phrase)
    return (
        cfg.w_out_of_range * out_of_range
        + cfg.w_center * abs(mean - target)
    )


def fill_short_rests(notes: list[Note], quarter: int,
                     max_rest_quarters: float = 1.0) -> list[Note]:
    """Let a note ring across a short rest instead of stopping dead.

    A guitarist playing a running passage does not damp the string for a
    sixteenth rest in the middle of it -- the note rings until the next
    one. Writing every rest of the engraving literally chops a flowing
    line into fragments, and that is the single thing that makes an
    otherwise faithful arrangement sound wrong: the ear follows a line,
    hears it stop, and hears the music carry on somewhere else.

    Only rests inside a run are filled -- the next note has to arrive
    within `max_rest_quarters`. A real rest, where the voice has genuinely
    stopped, is longer than that and is left exactly as written.
    """
    if len(notes) < 2 or max_rest_quarters <= 0:
        return notes
    limit = int(quarter * max_rest_quarters)
    ordered = sorted(notes, key=lambda n: n.start)
    out: list[Note] = []
    for note, nxt in zip(ordered, ordered[1:]):
        rest = nxt.start - note.end
        if 0 < rest <= limit:
            note = replace(note, end=nxt.start)
        out.append(note)
    out.append(ordered[-1])
    return out


def thin_chords(extras: list[Note], line: list[Note], quarter: int,
                min_quarters: float = 1.0,
                rest_after: float = 1.0) -> list[Note]:
    """Keep only the double-stops that earn their place.

    A second note on a beat is worth writing when it is *held* -- a third
    ringing under a cadence, an inner voice sustaining through a final
    chord. It is only clutter when it is one more sixteenth in the middle
    of a run, where it muddies the line the ear is trying to follow and
    asks the player to fret two notes at speed for no musical gain.

    So a chord tone survives if it is at least `min_quarters` long, or if
    the part stops after it -- a rest of `rest_after` or more, or the end
    of the piece -- which is exactly where the chords a listener expects
    actually fall. Everything else is dropped.
    """
    if not extras or not line:
        return extras
    ordered = sorted(line, key=lambda n: n.start)
    starts = [n.start for n in ordered]
    finish = max(n.end for n in ordered)
    long_enough = min_quarters * quarter
    silence = rest_after * quarter

    kept: list[Note] = []
    for note in extras:
        if note.end - note.start >= long_enough:
            kept.append(note)
            continue
        at = bisect.bisect_left(starts, note.end)
        if at >= len(ordered):
            # Nothing follows on this part at all: it is an ending.
            if note.end >= finish - silence:
                kept.append(note)
            continue
        if ordered[at].start - note.end >= silence:
            kept.append(note)
    return kept


def clamp_octaves(notes: list[Note], tuning: list[int],
                  fret_count: int) -> tuple[list[Note], int]:
    """Bring any note sitting off the neck back onto it, by whole octaves.

    Nothing is ever dropped for being out of range. A pitch below the
    lowest string comes up an octave until it fits; one past the last fret
    goes down. The note keeps its place in the bar and its pitch class, so
    the line still reads as the line -- an octave displacement is the one
    liberty the arranger is allowed to take.

    Returns the notes and how many had to move.
    """
    if not notes:
        return [], 0
    lo, hi = playable_range(tuning, fret_count)
    if hi - lo < 11:            # no tuning is this narrow; refuse to loop
        return list(notes), 0
    out: list[Note] = []
    moved = 0
    for note in notes:
        pitch = note.pitch
        while pitch < lo:
            pitch += 12
        while pitch > hi:
            pitch -= 12
        if pitch != note.pitch:
            moved += 1
            note = note.shifted(pitch - note.pitch)
        out.append(note)
    return out, moved


def transpose(
    notes: list[Note],
    semitones: int,
    tuning: list[int],
    fret_count: int,
) -> tuple[list[Note], int]:
    """Shift a part, folding back anything pushed off the end of the neck.

    A plain transposition would make notes at the extremes unplayable, so
    any note driven past either end is moved back by whole octaves. The
    count of those is returned so the caller can report it.
    """
    if not semitones:
        return list(notes), 0
    lo, hi = playable_range(tuning, fret_count)
    out: list[Note] = []
    pulled = 0
    for note in notes:
        moved = note.shifted(semitones)
        if moved.pitch < lo or moved.pitch > hi:
            pulled += 1
            while moved.pitch < lo:
                moved = moved.shifted(12)
            while moved.pitch > hi:
                moved = moved.shifted(-12)
        out.append(moved)
    return out, pulled


def comfort_ceiling(tuning: list[int], comfort_fret: int) -> int:
    """Highest pitch reachable without leaving the comfortable neck."""
    return max(tuning) + comfort_fret


def split_overreach(notes: list[Note], ceiling: int) -> tuple[list[Note], list[Note]]:
    """Separate the notes a player can reach comfortably from the rest."""
    keep = [n for n in notes if n.pitch <= ceiling]
    high = [n for n in notes if n.pitch > ceiling]
    return keep, high


def hand_off(
    notes: list[Note],
    streams: list[list[Note]],
    order: list[int],
) -> list[Note]:
    """Give each note to the first stream in `order` that is silent then.

    Used to lift the notes a bass cannot reach comfortably onto a guitar.
    Streams are modified in place and kept sorted; whatever nobody was free
    to take is returned.
    """
    starts = [[n.start for n in stream] for stream in streams]
    leftovers: list[Note] = []
    for note in sorted(notes, key=lambda n: n.start):
        for index in order:
            if _is_free(streams[index], starts[index], note):
                at = bisect.bisect_left(starts[index], note.start)
                streams[index].insert(at, note)
                starts[index].insert(at, note.start)
                break
        else:
            leftovers.append(note)
    return leftovers


def _is_free(stream: list[Note], starts: list[int], note: Note) -> bool:
    """Is this stream silent for the whole span of `note`?"""
    at = bisect.bisect_left(starts, note.start)
    if at < len(stream) and stream[at].start < note.end:
        return False
    if at > 0 and stream[at - 1].end > note.start:
        return False
    return True
