"""Polyphony -> N monophonic voice streams.

A fugue is already written as independent lines, but a MIDI file rarely
stores them that way: voices get spread over "right hand / left hand"
tracks, doubled, or collapsed into chords. This module recovers N
single-note streams by walking the piece in time order and solving a
minimum-cost assignment at every onset.

The cost of putting note X on part P blends four musical preferences:

  continuity  keep a part near the pitch it just played (small intervals)
  register    keep part 0 on top, part 1 below it, and so on
  busy        avoid cutting off a note the part is still sustaining
  affinity    if the source file separated voices by track, honour that

Ties are broken optimally rather than greedily, so a chord is distributed
across parts as a whole instead of first-come-first-served.
"""

from __future__ import annotations

import itertools
import math
import re
from dataclasses import dataclass, field

from .hungarian import solve
from .score import Note, Score

BASS_NAME_RE = re.compile(r"pedal|bass|basso|b\.c\.|continuo", re.I)


@dataclass
class VoiceConfig:
    mode: str = "auto"               # "auto" | "tracks" | "voices" | "cascade" | "balanced"
    voice_gap_quarters: float = 2.0  # a rest this long frees a part to change line
    detect_parts: int = 0            # voices to look for; 0 = from the texture
    n_parts: int = 4
    onset_tol_frac: float = 0.0625   # of a quarter note; groups near-simultaneous onsets
    w_continuity: float = 1.0
    w_register: float = 0.6
    w_busy: float = 30.0
    w_affinity: float = 6.0
    continuity_decay: float = 2.0    # quarter notes; how fast continuity stops mattering
    center_inertia: float = 0.75     # EMA weight on a part's running register centre
    center_recentre: float = 0.03    # pull back toward the part's nominal register
    w_flow: float = 0.0              # off by default: parts share the work evenly
    flow_priority: str = "top"       # "top" = Guitar I leads, "bottom" = the last one does


@dataclass
class _PartState:
    nominal_center: float
    center: float
    flow_bonus: float = 0.0
    last_pitch: int | None = None
    last_end: int = -10 ** 9
    free_at: int = -10 ** 9
    last_src_track: int | None = None
    notes: list[Note] = field(default_factory=list)


def detect_bass_tracks(score: Score) -> set[int]:
    """Find source tracks that clearly hold the bass line.

    Name is the strong signal (organ files label the pedal board); failing
    that, a track sitting more than a fifth below every other track's mean.
    """
    named = {
        ti for ti, name in score.track_names.items() if BASS_NAME_RE.search(name)
    }
    if named:
        return named

    if score.engraved:
        # An engraving is grouped into parts, and an organ's bottom part is
        # its pedal board. Compare parts rather than voices: a manual voice
        # dipping under the pedal for a bar is common, and it used to sink
        # the test and leave the whole pedal line on the guitars.
        parted = _lowest_part(score)
        if parted:
            return parted

    by_track = score.notes_by_track()
    if len(by_track) < 2:
        return set()
    means = {
        ti: sum(n.pitch for n in ns) / len(ns)
        for ti, ns in by_track.items()
        if len(ns) >= 8
    }
    if len(means) < 2:
        return set()
    lowest = min(means, key=means.get)
    others = [m for ti, m in means.items() if ti != lowest]
    if means[lowest] <= min(others) - 7:
        return {lowest}
    return set()



def _lowest_part(score: Score, margin: int = 7) -> set[int]:
    """Tracks of the one part sitting a fifth below every other part."""
    by_part: dict[int, list[Note]] = {}
    for note in score.notes:
        by_part.setdefault(note.src_channel, []).append(note)
    real = {p: ns for p, ns in by_part.items() if len(ns) >= 8}
    if len(real) < 2:
        return set()
    means = {p: sum(n.pitch for n in ns) / len(ns) for p, ns in real.items()}
    lowest = min(means, key=means.get)
    others = [m for p, m in means.items() if p != lowest]
    if means[lowest] > min(others) - margin:
        return set()
    return {n.src_track for n in real[lowest]}


def separate(
    score: Score,
    config: VoiceConfig,
    bass_tracks: set[int] | None = None,
) -> list[list[Note]]:
    """Split `score` into `config.n_parts` monophonic streams, high to low.

    The last stream is the bass. If `bass_tracks` is non-empty those notes
    are routed straight to it and take no part in the assignment.

    Two strategies, chosen by `config.mode`:

      auto      use the source's own tracks when they already hold one
                voice each, otherwise fall back to "voices".
      tracks    trust the file: one source track becomes one part. Nothing
                is inferred, so this is the most faithful option when the
                engraving separated the voices.
      voices    find the melodic lines first, then cascade over whole lines:
                a part follows one line and only changes when that line
                actually rests, so a voice is not swapped between players
                halfway through a phrase.
      cascade   fill the first part with as many notes as it can physically
                play, hand the remainder to the second, and so on. Each part
                is a maximum non-overlapping set, so nothing is ever cut off.
      balanced  share the work: at every onset, solve a minimum-cost
                assignment so each part follows one melodic line.
    """
    valid = ("auto", "tracks", "voices", "cascade", "balanced")
    if config.mode not in valid:
        raise ValueError(f"mode must be one of {valid}, not {config.mode!r}")
    mode = config.mode
    if mode == "auto":
        mode = "tracks" if is_per_voice(score, bass_tracks or set()) else "voices"
    if mode == "tracks":
        return _separate_by_track(score, config, bass_tracks or set())
    if mode == "cascade":
        return _separate_cascade(score, config, bass_tracks or set())
    if mode == "voices":
        return _separate_voice_cascade(score, config, bass_tracks or set())

    n = config.n_parts
    if n < 1:
        raise ValueError("need at least one part")
    bass_tracks = bass_tracks or set()
    notes = sorted(score.notes, key=lambda x: (x.start, -x.pitch))
    if not notes:
        return [[] for _ in range(n)]

    parts = [_PartState(c, c) for c in _initial_centers(notes, n)]
    bass_index = n - 1
    # A dedicated bass source means the bass part is spoken for.
    assignable = list(range(n - 1)) if (bass_tracks and n > 1) else list(range(n))
    for part_index, bonus in _flow_bonuses(assignable, config).items():
        parts[part_index].flow_bonus = bonus

    tol = max(1, int(score.ppq * config.onset_tol_frac))
    for group in _onset_groups(notes, tol):
        routed = [x for x in group if x.src_track in bass_tracks]
        free = [x for x in group if x.src_track not in bass_tracks]

        for note in routed:
            _commit(parts[bass_index], note, config)

        if not free:
            continue
        if len(free) > len(assignable):
            free = _prune(free, len(assignable))

        cost = [
            [_cost(note, parts[p], score.ppq, config) for p in assignable]
            for note in free
        ]
        for row, col in enumerate(solve(cost)):
            _commit(parts[assignable[col]], free[row], config)

    return [sorted(p.notes, key=lambda x: x.start) for p in parts]


def _separate_cascade(
    score: Score,
    config: VoiceConfig,
    bass_tracks: set[int],
) -> list[list[Note]]:
    """Greedy waterfall: each part takes as many notes as it can play.

    Maximising the notes one monophonic part can hold is the classic
    activity-selection problem -- repeatedly take the compatible note that
    finishes earliest -- which is optimal. Ties between notes ending at the
    same instant are broken toward the smaller melodic interval, which costs
    nothing in note count but keeps the line singable.
    """
    n = config.n_parts
    if n < 1:
        raise ValueError("need at least one part")

    streams: list[list[Note]] = [[] for _ in range(n)]
    pool = [x for x in score.notes if x.src_track not in bass_tracks]
    guitars = n - 1 if (bass_tracks and n > 1) else n
    if bass_tracks and n > 1:
        streams[-1] = _select_max([x for x in score.notes
                                   if x.src_track in bass_tracks])[0]

    for index in range(guitars):
        streams[index], pool = _select_max(pool)
    return streams


def is_per_voice(score: Score, bass_tracks: set[int], tolerance: float = 0.05) -> bool:
    """Does this file already store one voice per track?

    Engravings exported from notation software usually do. A few stray
    overlaps are tolerated -- they are typically note-length artefacts, not
    a second voice sharing the staff.

    A score read from MusicXML says so outright, and is believed: its
    tracks *are* the engraved voices, overlaps and all. A voice with a
    double-stop in it is still one voice, and inferring lines afresh from
    a file that already names them only loses information.
    """
    if score.engraved:
        return True
    by_track = score.notes_by_track()
    real = {ti: ns for ti, ns in by_track.items() if len(ns) >= 8}
    if len(real) < 2:
        return False
    for notes in real.values():
        ordered = sorted(notes, key=lambda n: n.start)
        overlaps = sum(1 for a, b in zip(ordered, ordered[1:]) if a.end > b.start)
        if overlaps > tolerance * len(ordered):
            return False
    return True


def _separate_by_track(
    score: Score,
    config: VoiceConfig,
    bass_tracks: set[int],
) -> list[list[Note]]:
    """One source track, one part -- no guessing at all.

    This is the faithful reading of an engraving that already separates
    the voices, as the per-voice files published by Mutopia and most
    notation exports do. Tracks are laid out by register, highest first,
    so the top voice lands on Guitar I and *stays there for the whole
    piece*: a voice is never split down the middle, and no passage is
    handed to another player partway through.

    Only real voices get an instrument. A track that sounds for a sliver
    of the piece -- a few bars doubling somebody, a single stray tied note
    -- is not a voice and must not displace one, so it is left unplaced
    and comes back as a chord tone on whichever part is already playing
    there. A voice's own double-stops are left the same way, landing back
    on that voice's own part rather than being scattered across the band.
    """
    n = config.n_parts
    if n < 1:
        raise ValueError("need at least one part")

    by_track = score.notes_by_track()
    pedal = [x for ti in bass_tracks for x in by_track.get(ti, [])]
    manual = {ti: ns for ti, ns in by_track.items() if ti not in bass_tracks}

    streams: list[list[Note]] = [[] for _ in range(n)]
    slots = n - 1 if (bass_tracks and n > 1) else n
    if bass_tracks and n > 1:
        streams[-1], _spill = _select_max(pedal)

    def register(track: int) -> float:
        notes = manual[track]
        return -sum(x.pitch for x in notes) / len(notes)

    # Voices claim the guitars, highest first; anything that is not a voice
    # queues behind them and only gets a part if one is going spare.
    carriers = voice_tracks(score)
    order = (sorted((t for t in manual if t in carriers), key=register)
             + sorted((t for t in manual if t not in carriers), key=register))

    for index, track in enumerate(order):
        if index >= slots:
            break
        streams[index], _rest = _select_max(manual[track])
    return streams


def detect_voices(
    score: Score,
    config: VoiceConfig,
    bass_tracks: set[int],
) -> dict[int, int]:
    """Label every non-bass note with the melodic line it belongs to.

    Reuses the balanced separator, which is exactly a voice tracker: run it
    with as many parts as the texture ever needs and each part comes out as
    one coherent line.
    """
    manual = [n for n in score.notes if n.src_track not in bass_tracks]
    if not manual:
        return {}
    count = config.detect_parts or _texture_width(manual)
    finder = VoiceConfig(
        mode="balanced",
        n_parts=count,
        w_flow=0.0,
        w_affinity=config.w_affinity,
        w_register=config.w_register,
        w_continuity=config.w_continuity,
        w_busy=config.w_busy,
    )
    probe = Score(ppq=score.ppq, notes=manual, tempos=score.tempos,
                  time_sigs=score.time_sigs, track_names=score.track_names)
    labels: dict[int, int] = {}
    for index, stream in enumerate(separate(probe, finder)):
        for note in stream:
            labels[id(note)] = index
    return labels


def peak_polyphony(score: Score) -> int:
    """Most notes sounding at once anywhere in the piece.

    A strictly monophonic ensemble needs one player per simultaneous note,
    so this is exactly how many parts are required to lose nothing.
    """
    events = []
    for note in score.notes:
        events.append((note.start, 1))
        events.append((note.end, -1))
    events.sort()
    live = peak = 0
    for _tick, delta in events:
        live += delta
        peak = max(peak, live)
    return max(1, peak)


def voice_tracks(score: Score, min_share: float = 0.15) -> set[int]:
    """Which source tracks actually carry a voice.

    A file engraved voice by voice still holds tracks that are not voices:
    a couple of bars where the organist doubles a line, an editorial
    footnote, one stray tied note. Counting every track that has a few
    notes in it hands each of those a guitar of its own -- BWV 544 is
    written in five voices and has eight tracks, three of which sound for
    under five percent of the piece. A voice is a track that is playing
    for a real share of the music.
    """
    span = max((n.end for n in score.notes), default=0)
    if span <= 0:
        return set()
    carriers = set()
    for track, notes in score.notes_by_track().items():
        events = []
        for note in notes:
            events.append((note.start, 1))
            events.append((note.end, -1))
        if not events:
            continue
        events.sort()
        live = sounding = 0
        previous = events[0][0]
        for tick, delta in events:
            if live > 0:
                sounding += tick - previous
            live += delta
            previous = tick
        if sounding >= min_share * span:
            carriers.add(track)
    return carriers


def track_voice_count(score: Score, min_share: float = 0.15) -> int:
    """How many source tracks actually carry a voice."""
    return max(1, len(voice_tracks(score, min_share)))


def voice_count(score: Score, share: float = 0.9) -> int:
    """How many voices the piece is actually written in.

    Peak polyphony overstates this: one incidental double-stop would claim
    a whole extra instrument. This instead asks how many notes are sounding
    for most of the piece's playing time, so the answer is the number of
    real voices and the rare thicker moment is left to become a chord.

    `share` is how much of the playing time the ensemble must cover. At
    0.99 the count stays close to the true voice count while leaving only
    about half a percent of notes to be written as double-stops.
    """
    events = []
    for note in score.notes:
        events.append((note.start, 1))
        events.append((note.end, -1))
    if not events:
        return 1
    events.sort()
    held = {}
    live = 0
    previous = events[0][0]
    for tick, delta in events:
        if tick > previous and live > 0:
            held[live] = held.get(live, 0) + (tick - previous)
        live += delta
        previous = tick
    if not held:
        return 1
    total = sum(held.values())
    running = 0
    for count in sorted(held):
        running += held[count]
        if running >= share * total:
            return max(1, count)
    return max(held)


def _texture_width(notes: list[Note], cap: int = 6) -> int:
    """How many notes sound at once, at the busy end of the piece."""
    events = []
    for note in notes:
        events.append((note.start, 1))
        events.append((note.end, -1))
    events.sort()
    live = peak = 0
    for _tick, delta in events:
        live += delta
        peak = max(peak, live)
    return max(2, min(cap, peak))


def _separate_voice_cascade(
    score: Score,
    config: VoiceConfig,
    bass_tracks: set[int],
) -> list[list[Note]]:
    """Cascade over whole melodic lines rather than loose notes."""
    n = config.n_parts
    if n < 1:
        raise ValueError("need at least one part")

    streams: list[list[Note]] = [[] for _ in range(n)]
    pool = [x for x in score.notes if x.src_track not in bass_tracks]
    guitars = n - 1 if (bass_tracks and n > 1) else n
    if bass_tracks and n > 1:
        streams[-1] = _select_max([x for x in score.notes
                                   if x.src_track in bass_tracks])[0]

    labels = detect_voices(score, config, bass_tracks)
    gap = int(score.ppq * config.voice_gap_quarters)
    for index in range(guitars):
        streams[index], pool = _select_line(pool, labels, gap)
    return streams


def _select_line(
    notes: list[Note],
    labels: dict[int, int],
    gap: int,
) -> tuple[list[Note], list[Note]]:
    """Take one line and stay on it, changing only when it rests.

    The part follows whichever voice it is currently on for as long as that
    voice keeps producing notes it can reach. Only when the line goes quiet
    for longer than `gap` does the part look for another line to pick up --
    so a voice is handed over at a rest, never mid-phrase.
    """
    by_voice: dict[int, list[Note]] = {}
    for note in sorted(notes, key=lambda x: (x.start, -x.pitch)):
        by_voice.setdefault(labels.get(id(note), -1), []).append(note)

    pointer = {voice: 0 for voice in by_voice}
    chosen: list[Note] = []
    taken: set[int] = set()
    last_end = -(10 ** 18)
    current: int | None = None

    while True:
        options: dict[int, Note] = {}
        for voice, line in by_voice.items():
            index = pointer[voice]
            while index < len(line) and line[index].start < last_end:
                index += 1
            pointer[voice] = index
            if index < len(line):
                options[voice] = line[index]
        if not options:
            break

        if current in options and options[current].start - last_end <= gap:
            voice = current
        else:
            # Prefer the line that starts soonest; break ties toward the
            # longer line, which is more likely to be a real voice.
            voice = min(
                options,
                key=lambda v: (options[v].start, -len(by_voice[v])),
            )
        note = options[voice]
        chosen.append(note)
        taken.add(id(note))
        last_end = note.end
        current = voice
        pointer[voice] += 1

    rest = [n for n in notes if id(n) not in taken]
    return chosen, sorted(rest, key=lambda x: x.start)


def select_monophonic(notes: list[Note]) -> tuple[list[Note], list[Note]]:
    """The largest set of these notes one instrument could actually play.

    Returns (playable, rest) -- `rest` is what had to be left behind
    because it sounded at the same time as something already chosen.
    """
    return _select_max(notes)


def _select_max(notes: list[Note]) -> tuple[list[Note], list[Note]]:
    """Largest set of notes one part can play, plus what is left over."""
    chosen: list[Note] = []
    rest: list[Note] = []
    last_end = -(10 ** 18)
    last_pitch: int | None = None

    ordered = sorted(notes, key=lambda x: (x.end, x.start, -x.pitch))
    for _end, group in itertools.groupby(ordered, key=lambda x: x.end):
        group = list(group)
        # Everything here ends together, so at most one of them is playable.
        free = [x for x in group if x.start >= last_end]
        if not free:
            rest.extend(group)
            continue
        pick = min(
            free,
            key=lambda x: (
                abs(x.pitch - last_pitch) if last_pitch is not None else 0,
                -x.duration,
            ),
        )
        chosen.append(pick)
        last_end, last_pitch = pick.end, pick.pitch
        rest.extend(x for x in group if x is not pick)
    return chosen, sorted(rest, key=lambda x: x.start)


def _flow_bonuses(assignable: list[int], cfg: VoiceConfig) -> dict[int, float]:
    """Rank the parts for continuity of line.

    The top-ranked part is discounted whenever it is idle, so the assignment
    feeds it first and its line runs unbroken; each part below it gets a
    smaller discount, and the last fills in whatever is left.
    """
    if cfg.flow_priority not in ("top", "bottom"):
        raise ValueError(
            f"flow_priority must be 'top' or 'bottom', not {cfg.flow_priority!r}"
        )
    if cfg.w_flow <= 0 or len(assignable) < 2:
        return {}
    order = list(assignable)
    if cfg.flow_priority == "bottom":
        order.reverse()
    last = len(order) - 1
    return {
        part_index: cfg.w_flow * (last - rank) / last
        for rank, part_index in enumerate(order)
    }


def _onset_groups(notes: list[Note], tol: int):
    """Chunk notes into near-simultaneous onset groups."""
    group: list[Note] = []
    anchor = None
    for note in notes:
        if anchor is None or note.start - anchor <= tol:
            if anchor is None:
                anchor = note.start
            group.append(note)
        else:
            yield group
            group, anchor = [note], note.start
    if group:
        yield group


def _initial_centers(notes: list[Note], n: int) -> list[float]:
    """Seed each part's register by slicing the piece's pitch distribution."""
    pitches = sorted(x.pitch for x in notes)
    last = len(pitches) - 1
    # Round rather than truncate, so a handful of notes still spans the
    # full range instead of collapsing the top percentile onto the middle.
    lo = pitches[round(0.02 * last)]
    hi = pitches[round(0.98 * last)]
    if n == 1:
        return [(lo + hi) / 2]
    step = (hi - lo) / (n - 1)
    return [hi - i * step for i in range(n)]   # part 0 highest


def _prune(group: list[Note], keep: int) -> list[Note]:
    """Too many simultaneous notes: keep the ones that carry the music.

    Outer voices win first (a listener tracks the top line and the bass),
    then longer notes over passing ornament.
    """
    if keep <= 0:
        return []
    by_pitch = sorted(group, key=lambda x: x.pitch)
    outer = {id(by_pitch[0]), id(by_pitch[-1])}
    ranked = sorted(
        group,
        key=lambda x: (0 if id(x) in outer else 1, -x.duration, -x.pitch),
    )
    return sorted(ranked[:keep], key=lambda x: -x.pitch)


def _cost(note: Note, part: _PartState, ppq: int, cfg: VoiceConfig) -> float:
    cost = cfg.w_register * abs(note.pitch - part.center)

    if part.last_pitch is not None:
        gap_q = max(0, note.start - part.last_end) / ppq
        recency = math.exp(-gap_q / cfg.continuity_decay)
        cost += cfg.w_continuity * recency * abs(note.pitch - part.last_pitch)

    if part.free_at > note.start:
        overlap = min(part.free_at, note.end) - note.start
        cost += cfg.w_busy * overlap / ppq
    else:
        # The part would otherwise fall silent here. Ranked parts get a
        # discount for picking the note up, keeping the lead line unbroken.
        cost -= part.flow_bonus

    if part.last_src_track is not None and part.last_src_track == note.src_track:
        cost -= cfg.w_affinity

    return cost


def _commit(part: _PartState, note: Note, cfg: VoiceConfig) -> None:
    part.notes.append(note)
    part.last_pitch = note.pitch
    part.last_end = note.end
    part.free_at = max(part.free_at, note.end)
    part.last_src_track = note.src_track
    part.center = (
        cfg.center_inertia * part.center + (1 - cfg.center_inertia) * note.pitch
    )
    # Drift back toward the nominal register so an idle part does not get
    # stranded wherever its last phrase happened to end.
    part.center += cfg.center_recentre * (part.nominal_center - part.center)
