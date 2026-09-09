"""Write a three-voice fugue, and give it to two guitars and a bass.

    python fugue3.py -o fugue-in-e-minor.gp5

Everything else here arranges music somebody else wrote. This writes the
music: an original fugue in E minor, three voices, twenty-nine bars, for
the band this repository keeps -- Guitar I, Guitar II and a bass -- and
then hands it to the same arranger that handles the Bach.

What is authored and what is derived is worth being exact about, because
the split is the whole point.

**Authored**: the subject, and the plan -- which voice enters where, in
which key, and what happens between the entries. Fourteen notes and a
page of structure.

**Derived**: everything else. The answer is the subject at the fifth. The
countersubject is *searched*, not written: against the answer, a Viterbi
pass over every diatonic pitch in the voice's compass picks the line
whose counterpoint costs least -- thirds and sixths on the strong beats,
dissonance only in passing, no parallel fifths or octaves with the voice
it accompanies, no crossing, steps preferred to leaps. Free voices are
found the same way, on a rhythm chosen to move where the others hold.
Episodes are sequences on the subject's own tail, and which voice leads,
which imitates, how far behind and in which direction is settled by
scoring the alternatives and keeping the best.

The scorer is `complete.py`'s, written to judge a completion of
Contrapunctus XIV: on every beat where all the voices sound, do they make
a triad or a seventh? Bach's own text scores 74% by that measure. This
scores 100%, and that is a limitation rather than a boast -- a search told
that dissonance is expensive will not buy any, so there are no
suspensions, no appoggiaturas, nothing held over a bar line to grind and
resolve. Bach's other 26% is where those live. What comes out is clean,
correct, and plainer than a person would write.
"""

from __future__ import annotations

import argparse
import itertools
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from complete import CHORDS

BAR = 4.0
MINOR = [0, 2, 3, 5, 7, 8, 10]
MAJOR = [0, 2, 4, 5, 7, 9, 11]
NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Guitar I, Guitar II, bass -- and the compass each keeps to, which is
# comfortable positions on the neck rather than the whole of it.
RANGES = {0: (55, 76), 1: (47, 69), 2: (28, 52)}
PARTS = {0: "Guitar I", 1: "Guitar II", 2: "Bass"}

# The subject. Fourteen notes: the tonic, a leap to the dominant, a turn
# round the fifth, then a descent in rising seconds that falls a step each
# time -- and that figure is what every episode in the piece is made of.
# (offset in quarters, scale degree, length, sharpened in the minor)
SUBJECT = [
    (0.0,  0, 1.0, 0), (1.0,  4, 1.0, 0),
    (2.0,  3, 0.5, 0), (2.5,  4, 0.5, 0), (3.0,  5, 0.5, 0), (3.5,  4, 0.5, 0),
    (4.0,  2, 0.5, 0), (4.5,  3, 0.5, 0), (5.0,  1, 0.5, 0), (5.5,  2, 0.5, 0),
    (6.0,  0, 0.5, 0), (6.5,  1, 0.5, 0), (7.0, -1, 0.5, 1), (7.5,  0, 0.5, 0),
]
SPAN = 8.0                                # the subject is two bars long

# Its head, for the stretto over the pedal; and its tail -- a whole bar of
# it, normalised to start on the tonic -- which is the episodes' sequence
# unit. The tail's leading note loses its sharp on the way: in the subject
# that D# is the leading note of the key, but a sequence walks it through
# degrees where a sharp would only be a wrong note.
HEAD = SUBJECT[:4]
TAIL = [(o - 4.0, d - 2, length, 0) for o, d, length, _sharp in SUBJECT[6:]]


# ------------------------------------------------------------------- the key

def pitch_of(root: int, degree: int, mode: str, sharp: int = 0) -> int:
    """Where a scale degree of this key falls. Degrees run past the octave."""
    table = MINOR if mode == "minor" else MAJOR
    octave, step = divmod(degree, 7)
    return root + 12 * octave + table[step] + (sharp if mode == "minor" else 0)


def degree_of(pitch: int, root: int, mode: str) -> tuple[int, int]:
    """The degree and accidental that name this pitch in this key."""
    for degree in range(-21, 29):
        for sharp in (0, 1):
            if pitch_of(root, degree, mode, sharp) == pitch:
                return degree, sharp
    raise ValueError(f"{name(pitch)} does not belong to this key")


def name(pitch: int) -> str:
    return f"{NAMES[pitch % 12]}{pitch // 12 - 1}"


def state(figure, at: float, root: int, mode: str) -> list:
    """Sound a stored figure here, in this key: (start, end, pitch)."""
    return [(at + o, at + o + length, pitch_of(root, degree, mode, sharp))
            for o, degree, length, sharp in figure]


def store(notes, at: float, root: int, mode: str) -> list:
    """The other way round: keep a played line as degrees of a key."""
    figure = []
    for start, end, pitch in notes:
        degree, sharp = degree_of(pitch, root, mode)
        figure.append((start - at, degree, end - start, sharp))
    return figure


def fit(notes, span) -> list:
    """Move a whole statement by octaves until it lies inside a range."""
    low, high = span
    best, cost = notes, None
    for octave in range(-3, 4):
        moved = [(s, e, p + 12 * octave) for s, e, p in notes]
        over = sum(max(0, p - high) + max(0, low - p) for _s, _e, p in moved)
        if cost is None or over < cost:
            best, cost = moved, over
    return best


def sounding(lines, moment: float) -> dict:
    return {voice: pitch for voice, notes in lines.items()
            for start, end, pitch in notes if start <= moment < end - 1e-9}


# ----------------------------------------------------------- the counterpoint

def _weight(moment: float) -> int:
    """A wrong note costs most where the ear is listening hardest."""
    if abs(moment % BAR) < 1e-6:
        return 4
    if abs(moment % 1.0) < 1e-6:
        return 3
    return 1


# Steps are free, a third or a fourth is cheap, and anything past a sixth
# has to be worth it. A tritone is not a melodic interval.
_MELODY = {0: 3, 1: 1, 2: 0, 3: 1, 4: 1, 5: 2, 6: 9, 7: 2,
           8: 5, 9: 5, 10: 8, 11: 8, 12: 6}


def _harmony(pitch: int, others, weight: int) -> int:
    cost = 0
    for other in others:
        gap = abs(pitch - other)
        interval = gap % 12
        if gap == 0:
            cost += 8                     # two voices arriving on one note
        elif interval in (3, 4, 8, 9):
            cost += 0                     # thirds and sixths: the good stuff
        elif interval == 7:
            cost += 1
        elif interval == 0:
            cost += 2                     # an octave is thin, not wrong
        elif interval == 5:
            cost += 5 if pitch > other else 3
        elif interval == 6:
            cost += 7
        else:
            cost += 9                     # seconds and sevenths
    if others:
        pcs = {pitch % 12} | {p % 12 for p in others}
        if len(pcs) >= 3 and not any(pcs <= chord for chord in CHORDS):
            cost += 4                     # three notes that are not a chord
    return cost * weight


def _parallels(was: int, now: int, before: dict, after: dict) -> int:
    """Consecutive fifths or octaves against any voice already playing.

    The interval is the distance between the two notes, so it is measured
    with an absolute value: a signed remainder calls a fifth below a
    fourth, and quietly lets through every parallel fifth in which this is
    the lower voice.
    """
    cost = 0
    for voice, then in after.items():
        earlier = before.get(voice)
        if earlier is None or earlier == then or was == now:
            continue
        if (abs(was - earlier) % 12 == abs(now - then) % 12
                and abs(now - then) % 12 in (0, 7)
                and (now - was) * (then - earlier) > 0):
            cost += 30
    return cost


def station(voice: int) -> tuple[tuple, tuple]:
    """Which voices this one stays under, and which it stays over."""
    return (tuple(v for v in RANGES if v > voice),
            tuple(v for v in RANGES if v < voice))


def counterline(slots, fixed, key, span, above=(), below=(), prefer=None,
                close=None, came_from=None):
    """The best line this voice could play against what is already there.

    A Viterbi pass, the same shape as the fretting solver: every diatonic
    pitch in the range is a candidate at every slot, the emission cost is
    the counterpoint against whatever is sounding, and the transition cost
    is the melodic interval plus a fine for parallel perfects.
    """
    if not slots:
        return []
    root, mode = key
    low, high = span
    candidates = sorted({pitch_of(root, degree, mode, sharp)
                         for degree in range(-14, 22) for sharp in (0, 1)
                         if not sharp or degree % 7 == 6
                         if low <= pitch_of(root, degree, mode, sharp) <= high})
    if not candidates:
        return []

    company = [sounding(fixed, start) for start, _length in slots]
    # Parallels are between consecutive *chords*, not consecutive notes of
    # this line. While this voice holds one note the others may move
    # several times, and it is the last of those moves the next note makes
    # fifths with -- so each slot is compared against the latest thing that
    # happened before it, not against the previous slot.
    attacks = sorted({s for notes in fixed.values() for s, _e, _p in notes})
    latest = [company[0]]
    for i in range(1, len(slots)):
        meanwhile = [t for t in attacks
                     if slots[i - 1][0] - 1e-9 <= t < slots[i][0] - 1e-9]
        latest.append(sounding(fixed, max(meanwhile)) if meanwhile
                      else company[i - 1])
    allowed = []
    for others in company:
        room = candidates
        under = [others[v] for v in above if v in others]
        if under:
            room = [p for p in room if p > max(under)] or room
        over = [others[v] for v in below if v in others]
        if over:
            room = [p for p in room if p < min(over)] or room
        allowed.append(room)

    cost = {}
    for pitch in allowed[0]:
        start = _harmony(pitch, company[0].values(), _weight(slots[0][0]))
        if prefer is not None:
            start += 2 * min(abs(pitch - prefer), 12)
        if came_from is not None:
            # A voice does not begin again from nowhere every time it has
            # been resting: the note it left off on is the note this one
            # has to follow, and the two can make fifths across the join
            # like any other pair.
            was, before = came_from
            start += _MELODY.get(abs(pitch - was), 40)
            start += _parallels(was, pitch, before, company[0])
        cost[pitch] = start
    trail = []
    for i in range(1, len(slots)):
        weight = _weight(slots[i][0])
        step, link = {}, {}
        for pitch in allowed[i]:
            emit = _harmony(pitch, company[i].values(), weight)
            if close is not None and i == len(slots) - 1:
                emit += 4 * min(abs(pitch - close), 12)
            best, whence = None, None
            for was, had in cost.items():
                total = (had + emit + _MELODY.get(abs(pitch - was), 40)
                         + _parallels(was, pitch, latest[i], company[i]))
                if best is None or total < best:
                    best, whence = total, was
            step[pitch], link[pitch] = best, whence
        cost = step
        trail.append(link)

    pitch = min(cost, key=lambda p: cost[p])
    chosen = [pitch]
    for link in reversed(trail):
        pitch = link[pitch]
        chosen.append(pitch)
    chosen.reverse()
    return [(start, start + length, pitch)
            for (start, length), pitch in zip(slots, chosen)]


def complementary(fixed, start: float, end: float) -> list:
    """A rhythm that moves where the others hold and holds where they move."""
    slots, moment = [], start
    while moment < end - 1e-9:
        room = min(1.0, end - moment)
        onsets = sum(1 for notes in fixed.values() for s, _e, _p in notes
                     if moment - 1e-9 <= s < moment + room - 1e-9)
        if onsets >= 2 or room <= 0.5 + 1e-9:
            slots.append((moment, room))
        else:
            slots.append((moment, 0.5))
            slots.append((moment + 0.5, room - 0.5))
        moment += room
    return slots


def merge(notes, longest: float = 2.0) -> list:
    """Two of the same note in a row is one longer note."""
    joined = []
    for start, end, pitch in notes:
        if (joined and joined[-1][2] == pitch
                and abs(joined[-1][1] - start) < 1e-9
                and end - joined[-1][0] <= longest + 1e-9):
            joined[-1] = (joined[-1][0], end, pitch)
        else:
            joined.append((start, end, pitch))
    return joined


def score(lines) -> tuple[int, dict]:
    """Penalties for a passage's counterpoint. Lower is better."""
    events = [(s, e, p, v) for v, notes in lines.items() for s, e, p in notes]
    faults = {"dissonance": 0, "parallels": 0, "range": 0, "crossing": 0,
              "collision": 0, "loose": 0, "thin": 0, "chords": 0}
    if not events:
        return 0, faults

    for _start, _end, pitch, voice in events:
        low, high = RANGES[voice]
        if not low <= pitch <= high:
            faults["range"] += 1

    before: dict = {}
    by_voice = {v: notes for v, notes in lines.items() if notes}
    for moment in sorted({round(s, 3) for s, _e, _p, _v in events}):
        heard = sounding(by_voice, moment)
        on_beat = abs(moment - round(moment)) < 1e-6
        for a, b in itertools.combinations(sorted(heard), 2):
            gap = abs(heard[a] - heard[b])
            if gap == 0:
                faults["collision"] += 1
            elif gap % 12 in (1, 2, 6, 10, 11):
                faults["dissonance"] += 3 if on_beat else 1
            if a < b and heard[a] < heard[b]:
                faults["crossing"] += 1
            was = before.get((a, b))
            if was is not None:
                gone, low_was, high_was = was
                if (gap % 12 in (0, 7) and gone % 12 == gap % 12
                        and heard[a] != low_was and heard[b] != high_was
                        and (heard[a] - low_was) * (heard[b] - high_was) > 0):
                    faults["parallels"] += 1
            before[(a, b)] = (gap, heard[a], heard[b])

    first = min(s for s, _e, _p, _v in events)
    last = max(e for _s, e, _p, _v in events)
    beat = first - first % 1
    while beat < last:
        pcs = {p % 12 for s, e, p, _v in events if s <= beat < e}
        if len(pcs) >= 3:
            if any(pcs <= chord for chord in CHORDS):
                faults["chords"] += 1
            else:
                faults["loose"] += 1
        elif pcs:
            faults["thin"] += 1
        beat += 1

    weights = {"dissonance": 1, "parallels": 6, "range": 12, "crossing": 1,
               "collision": 8, "loose": 4, "thin": 1, "chords": -4}
    return sum(weights[k] * v for k, v in faults.items()), faults


# ------------------------------------------------------------------- the plan

def add(lines, voice: int, notes) -> None:
    lines[voice] = sorted(lines[voice] + list(notes))


def window(lines, start: float, end: float) -> dict:
    return {v: [(s, e, p) for s, e, p in notes if start - 1e-9 <= s < end]
            for v, notes in lines.items()}


def silences(lines, voice: int, start: float, end: float) -> list:
    """The stretches inside this window where the voice has nothing to play."""
    free, cursor = [], start
    for note_start, note_end, _pitch in sorted(lines[voice]):
        if note_end <= start + 1e-9 or note_start >= end - 1e-9:
            continue
        if note_start > cursor + 1e-9:
            free.append((cursor, min(note_start, end)))
        cursor = max(cursor, note_end)
    if cursor < end - 1e-9:
        free.append((cursor, end))
    return [(a, b) for a, b in free if b - a >= 0.5 - 1e-9]


def accompany(lines, voice, start, end, key, prefer=None):
    """Fill a voice's silences with a line searched against everything else."""
    above, below = station(voice)
    written = []
    for gap_start, gap_end in silences(lines, voice, start, end):
        others = {v: notes for v, notes in lines.items() if v != voice}
        heard = window(others, gap_start - 2 * SPAN, gap_end)
        slots = complementary(heard, gap_start, gap_end)
        # What this voice was doing on either side of the silence: the note
        # it broke off on, and the note it has to arrive at.
        left = [n for n in lines[voice] if abs(n[1] - gap_start) < 1e-9]
        arrive = [n for n in lines[voice] if abs(n[0] - gap_end) < 1e-9]
        line = merge(counterline(
            slots, heard, key, RANGES[voice], above=above, below=below,
            prefer=prefer, close=arrive[0][2] if arrive else None,
            came_from=((left[0][2], sounding(heard, gap_start - 1e-6))
                       if left else None)))
        add(lines, voice, line)
        written += line
    return written


def place(lines, voice, notes, start, end):
    """Which octave a stored statement is heard in, decided by ear.

    A countersubject searched once against the answer has to work later
    against the subject in another key, another mode and another voice.
    Dropping it into the first octave that fits the part is what put it
    underneath the voice it was written above; so every octave that fits
    is tried, and the one whose counterpoint scores best is the one heard.
    """
    low, high = RANGES[voice]
    best = None
    for octave in range(-3, 4):
        moved = [(s, e, p + 12 * octave) for s, e, p in notes]
        if any(not low <= pitch <= high for _s, _e, pitch in moved):
            continue
        trial = {v: list(ns) for v, ns in lines.items()}
        trial[voice] = sorted(trial[voice] + moved)
        total, _faults = score(window(trial, start, end))
        if best is None or total < best[0]:
            best = (total, moved)
    return best[1] if best else fit(notes, RANGES[voice])


def sequence(motif, start, bars, root, mode, step, base=0):
    """A figure stated once a bar, a step lower (or higher) each time."""
    notes = []
    for i in range(bars):
        moved = [(o, d + base + step * i, length, sharp)
                 for o, d, length, sharp in motif]
        notes += state(moved, start + i * BAR, root, mode)
    return notes


def episode(lines, start, bars, key, players, verbose=False, avoid=None):
    """A sequence on the subject's tail; the search picks how to lay it out.

    Which voice leads, whether another imitates it and how far behind,
    and whether the sequence falls or rises are four choices with no
    obviously right answer, so all of them are tried and the passage that
    scores best as counterpoint is the one that gets written.

    Left at that, every episode in the piece comes out the same way up --
    the cleanest counterpoint is the cleanest counterpoint, four times
    over, and four identical episodes is not a fugue, it is a loop. So a
    layout already used is struck off, exactly as `complete.py` strikes
    off a voice permutation it has already heard.
    """
    avoid = set() if avoid is None else avoid
    root, mode = key
    end = start + bars * BAR
    settled = {v: [(s, e, p) for s, e, p in notes if e <= start + 1e-9]
               for v, notes in lines.items()}
    best = None
    for lead in players:
        for step in (-1, 1):
            shadows = [(None, 0.0, 0)]
            shadows += [(v, delay, offset)
                        for v in players if v != lead
                        for delay in (2.0,) for offset in (-2, 2, -4)]
            for follow, delay, offset in shadows:
                if (lead, follow, step) in avoid:
                    continue
                trial = {v: list(settled[v]) for v in lines}
                add(trial, lead,
                    fit(sequence(TAIL, start, bars, root, mode, step),
                        RANGES[lead]))
                if follow is not None:
                    add(trial, follow,
                        fit(sequence(TAIL, start + delay, bars - 1, root, mode,
                                     step, base=offset), RANGES[follow]))
                for voice in sorted(players, key=lambda v: -v):
                    if voice in (lead, follow):
                        continue
                    accompany(trial, voice, start, end, key)
                total, _faults = score(window(trial, start, end))
                if best is None or total < best[0]:
                    best = (total, trial, (lead, follow, delay, step))
    total, trial, how = best
    for voice in lines:
        add(lines, voice, [n for n in trial[voice] if n[0] >= start - 1e-9])
    lead, follow, delay, step = how
    avoid.add((lead, follow, step))
    told = (f"{PARTS[lead]} leads, "
            + (f"{PARTS[follow]} {delay:g} beats behind, " if follow is not None else "")
            + ("falling" if step < 0 else "rising"))
    if verbose:
        print(f"    episode at bar {start / BAR + 1:.0f}: {told}")
    return told


def compose(verbose=False):
    """The whole piece, bar by bar."""
    lines = {0: [], 1: [], 2: []}
    plan = []
    heard = set()          # episode layouts already used, so none repeats

    # The countersubject: searched against the answer, once, and then
    # played wherever the subject goes for the rest of the piece.
    # It is searched against the subject twice over -- once in the minor
    # and once in the major -- because the plan states the subject in the
    # relative major later on, and a line that only ever fitted the minor
    # arrives there a semitone out and lands on the note it is supposed to
    # be accompanying.
    answer = state(SUBJECT, 0.0, 59, "minor")
    slots = complementary({1: answer}, 0.0, SPAN)
    counter = store(merge(counterline(slots,
                                      {1: answer,
                                       2: state(SUBJECT, 0.0, 59, "major")},
                                      (59, "minor"), (62, 76),
                                      above=(1, 2), prefer=64)),
                    0.0, 59, "minor")

    def entry(voice, at, root, mode, with_counter=None, label=""):
        add(lines, voice, state(SUBJECT, at, root, mode))
        if with_counter is not None:
            add(lines, with_counter,
                place(lines, with_counter, state(counter, at, root, mode),
                      at, at + SPAN))
        plan.append((at / BAR + 1, label))

    # 1-8  Exposition: subject, answer at the fifth, subject in the bass,
    #      with two bars of episode between the second and third so the
    #      bass arrives out of movement rather than out of nowhere.
    entry(0, 0.0, 64, "minor", label="Guitar I, subject in E minor")
    entry(1, 8.0, 59, "minor", with_counter=0,
          label="Guitar II, answer in B minor; Guitar I, countersubject")
    plan.append((5, "episode, back towards E minor: "
                 + episode(lines, 16.0, 2, (64, "minor"), [0, 1], verbose, heard)))
    entry(2, 24.0, 40, "minor", with_counter=1,
          label="Bass, subject in E minor; Guitar II, countersubject")
    accompany(lines, 0, 24.0, 32.0, (64, "minor"))

    # 9-11 Episode, and the first entry away from the tonic.
    plan.append((9, "episode: "
                 + episode(lines, 32.0, 3, (67, "major"), [0, 1, 2], verbose, heard)))
    entry(1, 44.0, 55, "major", with_counter=0,
          label="Guitar II, subject in G major; Guitar I, countersubject")
    accompany(lines, 2, 44.0, 52.0, (55, "major"))

    # 14-18 Episode, then the subject under everything, in the subdominant.
    plan.append((14, "episode: "
                 + episode(lines, 52.0, 3, (57, "minor"), [0, 1, 2], verbose, heard)))
    entry(2, 64.0, 33, "minor", with_counter=0,
          label="Bass, subject in A minor; Guitar I, countersubject")
    accompany(lines, 1, 64.0, 72.0, (57, "minor"))

    # 19-21 Episode home.
    plan.append((19, "episode, home: "
                 + episode(lines, 72.0, 3, (64, "minor"), [0, 1, 2], verbose, heard)))

    # 22-24 Stretto: the three entries a bar apart, bottom upwards, so the
    #       subject is heard against itself twice over.
    entry(2, 84.0, 40, "minor", label="stretto: bass enters")
    entry(1, 88.0, 52, "minor", label="stretto: Guitar II a bar later")
    entry(0, 92.0, 64, "minor", label="stretto: Guitar I a bar after that")
    accompany(lines, 1, 96.0, 100.0, (64, "minor"))

    # 27-29 The last entry goes in before the pedal that leads to it: the
    #       head statements over the pedal run into the bar the entry
    #       begins, and a search that cannot see the entry writes them on
    #       top of it.
    entry(2, 108.0, 40, "minor", with_counter=0,
          label="Bass, subject in E minor for the last time")

    # 25-26 A dominant pedal, with the subject's head over it in imitation.
    #       Where each statement starts is chosen the way the episodes are.
    add(lines, 2, [(100.0, 104.0, 35), (104.0, 108.0, 35)])   # B1, held
    best = None
    # A dominant pedal carries two harmonies -- the dominant, and the
    # tonic over it -- so those are the two the head may enter on.
    for roots in itertools.product([59, 64], repeat=2):
        for lower in itertools.product([47, 52], repeat=2):
            trial = {v: list(lines[v]) for v in lines}
            for i, root in enumerate(roots):
                add(trial, 0, state(HEAD, 100.0 + 4 * i, root, "minor"))
            for i, root in enumerate(lower):
                add(trial, 1, state(HEAD, 102.0 + 3 * i, root, "minor"))
            total, _f = score(window(trial, 100.0, 108.0))
            if best is None or total < best[0]:
                best = (total, trial)
    for voice in lines:
        add(lines, voice, [n for n in best[1][voice]
                           if n[0] >= 100.0 - 1e-9 and n not in lines[voice]])
    for voice in (0, 1):
        accompany(lines, voice, 100.0, 108.0, (64, "minor"))
    plan.append((26, "dominant pedal, the subject's head in imitation over it"))

    # ... and out on a Picardy third.
    accompany(lines, 1, 108.0, 116.0, (64, "minor"))
    for voice, pitch in ((0, 71), (1, 68), (2, 40)):    # B4, G#4, E2
        add(lines, voice, [(116.0, 120.0, pitch)])
    plan.append((30, "E major: the Picardy third"))

    return lines, plan


# ------------------------------------------------------------------ the files

def write_midi(lines, path: str, ppq: int = 384, tempo: int = 92) -> None:
    import mido

    mid = mido.MidiFile(ticks_per_beat=ppq)
    meta = mido.MidiTrack()
    meta.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(tempo), time=0))
    meta.append(mido.MetaMessage("time_signature", numerator=4, denominator=4,
                                 time=0))
    meta.append(mido.MetaMessage("key_signature", key="Em", time=0))
    mid.tracks.append(meta)
    for voice in sorted(lines):
        track = mido.MidiTrack()
        track.append(mido.MetaMessage("track_name", name=PARTS[voice], time=0))
        events = []
        for start, end, pitch in lines[voice]:
            events.append((round(start * ppq), 1, pitch))
            events.append((round(end * ppq), 0, pitch))
        events.sort(key=lambda e: (e[0], e[1]))
        previous = 0
        for tick, on, pitch in events:
            track.append(mido.Message("note_on" if on else "note_off",
                                      note=pitch, velocity=90 if on else 0,
                                      time=tick - previous))
            previous = tick
        mid.tracks.append(track)
    mid.save(path)


def report(lines, plan) -> None:
    pitches = " ".join(name(pitch_of(64, d, "minor", s))
                       for _o, d, _l, s in SUBJECT)
    print(f"subject ({len(SUBJECT)} notes, {SPAN:g} quarters): {pitches}\n")
    print("the plan:")
    for bar, told in sorted(plan):
        print(f"  bar {bar:>3.0f}  {told}")

    last = max(e for notes in lines.values() for _s, e, _p in notes)
    print("\nthe parts:")
    for voice in sorted(lines):
        notes = lines[voice]
        playing = sum(e - s for s, e, _p in notes)
        low = min(p for _s, _e, p in notes)
        high = max(p for _s, _e, p in notes)
        print(f"  {PARTS[voice]:<10} {len(notes):>4} notes  "
              f"{name(low):>4}-{name(high):<4}  {100 * playing / last:>3.0f}% "
              f"of the time")

    total, faults = score(lines)
    full = faults["chords"] + faults["loose"]
    print(f"\nthe counterpoint: {100 * faults['chords'] / max(1, full):.0f}% of "
          f"full beats make a chord ({faults['chords']}/{full}); "
          f"{faults['parallels']} parallels, {faults['collision']} unisons, "
          f"{faults['crossing']} crossings, {faults['range']} notes out of range")
    print("  (Bach's Contrapunctus XIV scores 74% by the same measure)")


def main(argv) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("-o", "--out", default="fugue-in-e-minor.gp5",
                    help="the tab to write (.gp5)")
    ap.add_argument("--midi", help="also keep the fugue as MIDI")
    ap.add_argument("--tempo", type=int, default=92)
    ap.add_argument("--title", default="Fugue in E minor")
    ap.add_argument("--tuning", default="standard")
    args = ap.parse_args(argv)

    lines, plan = compose(verbose=True)
    report(lines, plan)

    midi = args.midi or os.path.splitext(args.out)[0] + ".mid"
    write_midi(lines, midi, tempo=args.tempo)

    from fuguesplit import Settings, convert
    settings = Settings(guitars=2, bass=True, tempo=args.tempo,
                        title=args.title, artist="Leonid Elkin",
                        credit="Leonid Elkin", guitar_tuning=args.tuning,
                        condense_parts=False)
    written = convert(midi, args.out, settings)
    bars = max(e for notes in lines.values() for _s, e, _p in notes) / BAR
    print(f"\n{args.out}: {bars:.0f} bars, "
          f"{sum(p.notes for p in written.parts)} notes written")
    for part in written.parts:
        print(f"  {part.name:<10} {part.notes:>4} notes  "
              f"{name(part.low):>4}-{name(part.high):<4} "
              f"max fret {part.max_fret:>2}, {part.open_strings} open")
    if not args.midi:
        os.remove(midi)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
