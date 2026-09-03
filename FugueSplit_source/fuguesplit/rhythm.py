"""Tick spans -> notated beats.

Guitar Pro does not store arbitrary tick lengths: a bar is a sequence of
beats, each carrying a duration drawn from whole/half/quarter/... with an
optional dot. So every note has to be quantised to a grid and then split
into representable pieces joined by ties, honouring the usual engraving
rule that a value may only start where it is metrically aligned.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace

from .score import Note, Score

GP_QUARTER = 960          # Guitar Pro's internal resolution
WHOLE = GP_QUARTER * 4

# value -> ticks, as Guitar Pro numbers them (1 = whole ... 64 = 64th).
DURATION_VALUES = [1, 2, 4, 8, 16, 32, 64]
GRID_NAMES = {
    "quarter": 4, "8th": 8, "16th": 16, "32nd": 32, "64th": 64,
}


@dataclass
class Bar:
    index: int
    start: int          # GP ticks
    numerator: int
    denominator: int

    @property
    def length(self) -> int:
        return WHOLE * self.numerator // self.denominator

    @property
    def end(self) -> int:
        return self.start + self.length

    @property
    def beat_ticks(self) -> int:
        """Length of one felt beat: dotted in compound metres (6/8, 9/8...)."""
        unit = WHOLE // self.denominator
        if self.denominator >= 8 and self.numerator % 3 == 0 and self.numerator > 3:
            return unit * 3
        return unit


@dataclass
class BeatSpec:
    """One beat of notation: a pitch or a rest, with its written duration."""

    value: int              # 1, 2, 4, 8, 16, 32, 64
    dotted: bool
    pitch: int | None       # None = rest
    tie: bool = False       # continues the previous beat rather than restriking
    ticks: int = 0
    start: int = 0          # absolute GP tick, so extras can be matched to it
    extras: list[int] = field(default_factory=list)   # rare chord tones


def _table() -> list[tuple[int, bool, int]]:
    """(value, dotted, ticks) sorted longest first."""
    out = []
    for value in DURATION_VALUES:
        base = WHOLE // value
        out.append((value, False, base))
        if base % 2 == 0:
            out.append((value, True, base * 3 // 2))
    out.sort(key=lambda row: -row[2])
    return out


TABLE = _table()


def to_gp(tick: int, ppq_in: int) -> int:
    """Convert a source tick to Guitar Pro's timeline."""
    return _to_gp(tick, ppq_in)


def build_bars(score: Score, upto_tick: int) -> list[Bar]:
    """Bar lines in GP ticks, following the source's time-signature map."""
    bars: list[Bar] = []
    tick_src, tick_gp, index = 0, 0, 0
    upto_gp = _to_gp(upto_tick, score.ppq)
    while tick_gp < max(upto_gp, 1):
        num, den = score.time_sig_at(tick_src)
        bar = Bar(index, tick_gp, num, den)
        bars.append(bar)
        tick_gp += bar.length
        tick_src += int(score.ppq * 4 * num / den)
        index += 1
        if index > 20000:
            break
    return bars


def quantize(notes: list[Note], ppq_in: int, grid: int) -> list[Note]:
    """Rescale to GP ticks and snap onsets and releases to `grid` ticks.

    Releases are snapped up to at least one grid unit, which also repairs
    the short-by-a-hair durations typical of performance MIDI.
    """
    out: list[Note] = []
    for note in notes:
        start = _snap(_to_gp(note.start, ppq_in), grid)
        end = _snap(_to_gp(note.end, ppq_in), grid)
        if end <= start:
            end = start + grid
        out.append(replace(note, start=start, end=end))
    out.sort(key=lambda n: n.start)
    # Snapping can push a release past the next onset; clip again.
    for idx in range(len(out) - 1):
        if out[idx].end > out[idx + 1].start:
            out[idx].end = out[idx + 1].start
    return [n for n in out if n.end > n.start]


def lay_out(
    notes: list[Note],
    bars: list[Bar],
    grid: int,
    extras: list[Note] | None = None,
    fewest_ties: bool = True,
) -> list[list[BeatSpec]]:
    """Turn one part into per-bar beat lists, every bar exactly filled.

    `extras` are notes that could not be given a player of their own; each
    is attached to the beat it starts on, making that beat a double-stop.

    With `fewest_ties` the note is written as the longest values that fit,
    so a tie appears only where one is unavoidable -- across a bar line,
    or for a length no single value can spell. Clear it to split at beat
    lines as well, which shows the pulse but litters the stave with ties
    that carry no information.
    """
    by_bar: list[list[BeatSpec]] = []
    cursor_note = 0
    for bar in bars:
        beats: list[BeatSpec] = []
        cursor = bar.start
        # Notes that overlap this bar (a long note may start earlier).
        while cursor_note > 0 and notes[cursor_note - 1].end > bar.start:
            cursor_note -= 1
        idx = cursor_note
        while idx < len(notes) and notes[idx].start < bar.end:
            note = notes[idx]
            if note.end <= bar.start:
                idx += 1
                continue
            seg_start = max(note.start, bar.start)
            seg_end = min(note.end, bar.end)
            if seg_start > cursor:
                beats += _stamp(_emit(cursor - bar.start, seg_start - cursor,
                                      None, False, bar.beat_ticks,
                                      fewest_ties), cursor)
            if seg_end > seg_start:
                carried = note.start < bar.start
                beats += _stamp(_emit(seg_start - bar.start,
                                      seg_end - seg_start, note.pitch,
                                      carried, bar.beat_ticks,
                                      fewest_ties), seg_start)
                cursor = seg_end
            idx += 1
        cursor_note = idx
        if cursor < bar.end:
            beats += _stamp(_emit(cursor - bar.start, bar.end - cursor, None,
                                  False, bar.beat_ticks, fewest_ties), cursor)
        by_bar.append(beats)
    if extras:
        _attach(by_bar, extras)
    return by_bar


def _attach(by_bar: list[list[BeatSpec]], extras: list[Note]) -> None:
    """Hang each extra note on the struck beat that starts with it."""
    index: dict[int, BeatSpec] = {}
    for beats in by_bar:
        for beat in beats:
            if beat.pitch is not None and not beat.tie:
                index.setdefault(beat.start, beat)
    for note in extras:
        beat = index.get(note.start)
        if beat is not None and note.pitch != beat.pitch:
            beat.extras.append(note.pitch)


def _emit(
    offset: int,
    length: int,
    pitch: int | None,
    carried: bool,
    beat: int,
    fewest_ties: bool = True,
) -> list[BeatSpec]:
    """Split a span into notatable durations joined by ties.

    With `fewest_ties`, the longest value that fits is taken every time, so
    the span becomes as few notes as it can: a tie then means something --
    the note really does carry over a bar line, or its length genuinely
    has no single spelling. A half note starting on the second beat is
    written as a half note, not two tied quarters.

    Without it, a value is allowed only where it is strictly aligned, or
    -- when no longer than a beat -- where it does not cross a beat line.
    That draws the pulse more explicitly at the cost of many ties that
    tell the player nothing.
    """
    out: list[BeatSpec] = []
    remaining = length
    first = True
    while remaining > 0:
        pick = None
        for value, dotted, ticks in TABLE:
            if ticks > remaining:
                continue
            if fewest_ties or offset % ticks == 0 or (
                ticks <= beat and not _crosses(offset, ticks, beat)
            ):
                pick = (value, dotted, ticks)
                break
        if pick is None:
            # Off-grid remainder; fall back to the longest that simply fits.
            for value, dotted, ticks in TABLE:
                if ticks <= remaining:
                    pick = (value, dotted, ticks)
                    break
        if pick is None:
            break
        value, dotted, ticks = pick
        tie = (carried if first else True) if pitch is not None else False
        out.append(BeatSpec(value, dotted, pitch, tie, ticks))
        offset += ticks
        remaining -= ticks
        first = False
    return out


def _stamp(beats: list[BeatSpec], start: int) -> list[BeatSpec]:
    """Give each beat its absolute tick."""
    tick = start
    for beat in beats:
        beat.start = tick
        tick += beat.ticks
    return beats


def _crosses(offset: int, ticks: int, beat: int) -> bool:
    """Does the span [offset, offset+ticks) step over a beat line?"""
    return offset // beat != (offset + ticks - 1) // beat


def _to_gp(tick: int, ppq_in: int) -> int:
    return round(tick * GP_QUARTER / ppq_in)


def _snap(tick: int, grid: int) -> int:
    return int(round(tick / grid)) * grid


def grid_ticks(name: str) -> int:
    if name not in GRID_NAMES:
        raise ValueError(f"unknown grid {name!r}; choose from {sorted(GRID_NAMES)}")
    return WHOLE // GRID_NAMES[name]
