"""Choose where on the neck each note is played.

Any pitch is available in several places on a guitar, and the naive
choice (lowest string that reaches it) produces tab that leaps around the
neck. This is a Viterbi pass over the whole part: the state is a
(string, fret) position and the transition cost is hand movement, so the
solver keeps the hand in one place whenever the music allows.
"""

from __future__ import annotations

from dataclasses import dataclass

from .score import Note


@dataclass
class FretConfig:
    fret_count: int = 22
    w_hand_move: float = 1.0      # per fret of shift between consecutive notes
    w_string_move: float = 0.4    # per string crossed
    w_high_fret: float = 0.25     # mild preference for the lower neck
    w_open_string: float = -0.4   # open strings are easy, encourage them slightly
    reset_gap_quarters: float = 2.0   # a rest this long lets the hand reposition free
    hand_span: int = 4            # frets one hand can hold down at once


Position = tuple[int, int]   # (string_index from low, fret)


def positions_for(pitch: int, tuning: list[int], fret_count: int) -> list[Position]:
    out = []
    for si, open_pitch in enumerate(tuning):
        fret = pitch - open_pitch
        if 0 <= fret <= fret_count:
            out.append((si, fret))
    return out


def fret_part(
    notes: list[Note],
    tuning: list[int],
    ppq: int,
    cfg: FretConfig,
) -> list[Position]:
    """Return one (string, fret) per note, minimising total hand movement."""
    if not notes:
        return []

    reset_gap = ppq * cfg.reset_gap_quarters
    states = [positions_for(n.pitch, tuning, cfg.fret_count) for n in notes]
    for idx, opts in enumerate(states):
        if not opts:
            raise ValueError(
                f"pitch {notes[idx].pitch} is unreachable in this tuning; "
                "fold the part into range first"
            )

    costs = [_emission(p, cfg) for p in states[0]]
    back: list[list[int]] = [[-1] * len(states[0])]

    for idx in range(1, len(notes)):
        gap = notes[idx].start - notes[idx - 1].end
        free_move = gap >= reset_gap
        row_cost, row_back = [], []
        for pos in states[idx]:
            best_cost, best_prev = float("inf"), 0
            for pi, prev in enumerate(states[idx - 1]):
                move = 0.0 if free_move else _transition(prev, pos, cfg)
                total = costs[pi] + move
                if total < best_cost:
                    best_cost, best_prev = total, pi
            row_cost.append(best_cost + _emission(pos, cfg))
            row_back.append(best_prev)
        costs, _ = row_cost, None
        back.append(row_back)

    idx_best = min(range(len(costs)), key=costs.__getitem__)
    chosen = [idx_best]
    for idx in range(len(notes) - 1, 0, -1):
        chosen.append(back[idx][chosen[-1]])
    chosen.reverse()
    return [states[i][c] for i, c in enumerate(chosen)]


def _emission(pos: Position, cfg: FretConfig) -> float:
    _string, fret = pos
    if fret == 0:
        return cfg.w_open_string
    return cfg.w_high_fret * fret


def _transition(prev: Position, cur: Position, cfg: FretConfig) -> float:
    # Open strings do not commit the hand anywhere, so they cost no shift.
    if prev[1] == 0 or cur[1] == 0:
        fret_move = 0.0
    else:
        fret_move = abs(cur[1] - prev[1])
    return cfg.w_hand_move * fret_move + cfg.w_string_move * abs(cur[0] - prev[0])


def position_beside(
    pitch: int,
    tuning: list[int],
    fret_count: int,
    taken_string: int,
    near_fret: int,
    hand_span: int = 4,
) -> Position | None:
    """Where to put a chord tone alongside a note already being played.

    Both notes have to be held at once by one hand, so the second must be
    on a different string and within `hand_span` frets of the first. An
    open string costs no finger and is always available. Returns None when
    there is nowhere the hand could actually hold it -- the note is then
    not written at all, rather than printed as a shape nobody can play.
    """
    options = [
        (s, f) for s, f in positions_for(pitch, tuning, fret_count)
        if s != taken_string
        and (f == 0 or near_fret == 0 or abs(f - near_fret) <= hand_span)
    ]
    if not options:
        return None
    return min(options, key=lambda p: (abs(p[1] - near_fret), p[1]))
