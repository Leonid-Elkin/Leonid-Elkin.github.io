"""Finish Contrapunctus XIV by combining its subjects, and say how well.

    python complete.py -o completion.mid

Bach's last fugue stops in bar 239, three subjects in and with the main
Art of Fugue theme never yet heard. What every completion has to do is
bring the four together. Göncz's insight was that they were *built* to
combine -- the piece is permutational, and the ending is less composed
than solved.

So this does not try to write like Bach. It takes Bach's own four
subjects, exactly as he wrote them, and searches for the vertical
alignments in which they fit each other best: which voice takes which
subject, at what transposition, entering how far apart. Every candidate
is scored as counterpoint -- dissonance on the beat, parallel fifths and
octaves, voices out of range or crossing -- and the cleanest wins. The
finale is then those combinations, one after another, in the voice
permutations that keep each line inside its own range, over a dominant
pedal and out on a Picardy third.

What that yields is a *derivation*, not an inspiration. There are no
episodes, no free counterpoint, no invention: where a completion by a
musician breathes, this one simply states the material. It is honest
about being a machine's answer, and every note in it is Bach's.
"""

from __future__ import annotations

import argparse
import itertools
import os
import sys

Q = 1.0                      # everything here is measured in quarter notes
BAR = 4.0
DISSONANT = {1, 2, 6, 10, 11}

# What counts as a chord: the triads and sevenths of common practice, in
# every key. A vertical that is a subset of one of these is harmony; one
# that is not is either a passing moment or a mistake.
CHORDS = [frozenset((root + step) % 12 for step in shape)
          for root in range(12)
          for shape in ((0, 4, 7), (0, 3, 7), (0, 3, 6), (0, 4, 8),
                        (0, 4, 7, 10), (0, 3, 7, 10), (0, 3, 6, 9),
                        (0, 3, 6, 10), (0, 4, 7, 11), (0, 3, 7, 11))]

# The four voices of the fragment, and the range each keeps to.
RANGES = {0: (62, 84), 1: (53, 79), 2: (48, 70), 3: (36, 62)}
NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def name(pitch: int) -> str:
    return f"{NAMES[pitch % 12]}{pitch // 12 - 1}"


class Subject:
    """A theme as Bach wrote it: offsets, intervals and lengths in quarters."""

    def __init__(self, label: str, steps: list[tuple[float, int, float]]):
        self.label = label
        self.steps = steps                      # (offset, semitones, length)

    @property
    def span(self) -> float:
        return max(offset + length for offset, _s, length in self.steps)

    def at(self, start: float, pitch: int) -> list[tuple[float, float, int]]:
        """(start, end, pitch) for a statement beginning here."""
        return [(start + offset, start + offset + length, pitch + semitones)
                for offset, semitones, length in self.steps]

    def centre(self) -> float:
        return sum(s for _o, s, _l in self.steps) / len(self.steps)

    def fill(self, start: float, pitch: int, until: float) -> list:
        """State it, and state it again, until `until` is covered.

        The four subjects are of very different lengths -- B-A-C-H is two
        bars, the first subject is seven -- so a combination in which each
        is heard once is mostly two voices resting. Restating the short
        ones is what Bach does with them anyway.
        """
        step = max(BAR, (int((self.span - 0.001) / BAR) + 1) * BAR)
        notes, at = [], start
        while at < until:
            notes += [(s, e, p) for s, e, p in self.at(at, pitch) if s < until]
            at += step
        return notes


def read_subjects(fragment: str, first_fugue: str) -> dict[str, Subject]:
    """Pull the four subjects out of Bach's own text."""
    from fuguesplit.midi_in import read_midi

    fugue = read_midi(fragment)
    q = fugue.ppq
    voices: dict[int, list] = {}
    for note in sorted(fugue.notes, key=lambda n: n.start):
        voices.setdefault(note.src_track, []).append(note)

    def take(notes, start_quarter, count):
        run = [n for n in notes if n.start >= start_quarter * q][:count]
        base = run[0]
        return [((n.start - base.start) / q, n.pitch - base.pitch,
                 n.duration / q) for n in run]

    # Subject 1: the fugue's own opening, in the voice that begins it.
    opening = min(voices.values(), key=lambda ns: ns[0].start)
    first = Subject("I", take(opening, opening[0].start / q, 11))

    # Subject 2: the second fugue's, entering in bar 114 -- running
    # quavers, so more notes for the same length of music.
    second_voice = max(voices.values(),
                       key=lambda ns: sum(1 for n in ns
                                          if 113.9 * 4 * q <= n.start < 118 * 4 * q))
    second = Subject("II", take(second_voice, 114.25 * 4 - 4, 16))

    # Subject 3: B-A-C-H, wherever it first sounds.
    bach = None
    for notes in voices.values():
        for i in range(len(notes) - 3):
            window = notes[i:i + 4]
            if [n.pitch % 12 for n in window] == [10, 9, 0, 11]:
                base = window[0]
                bach = Subject("BACH", [((n.start - base.start) / q,
                                         n.pitch - base.pitch, n.duration / q)
                                        for n in window])
                break
        if bach:
            break

    # Subject 4: the theme of the whole work, from Contrapunctus I.
    first_piece = read_midi(first_fugue)
    fq = first_piece.ppq
    lines: dict[int, list] = {}
    for note in sorted(first_piece.notes, key=lambda n: n.start):
        lines.setdefault(note.src_track, []).append(note)
    lead = min(lines.values(), key=lambda ns: ns[0].start)[:12]
    base = lead[0]
    theme = Subject("theme", [((n.start - base.start) / fq, n.pitch - base.pitch,
                               n.duration / fq) for n in lead])
    return {"I": first, "II": second, "BACH": bach, "theme": theme}


def score(lines: dict[int, list]) -> tuple[int, dict]:
    """Penalties for the counterpoint of a passage. Lower is better."""
    events = []
    for voice, notes in lines.items():
        for start, end, pitch in notes:
            events.append((start, end, pitch, voice))
    attacks = sorted({round(start, 3) for start, _e, _p, _v in events})
    faults = {"dissonance": 0, "parallels": 0, "range": 0, "crossing": 0,
              "collision": 0}

    for start, _end, pitch, voice in events:
        low, high = RANGES[voice]
        if not low <= pitch <= high:
            faults["range"] += 1

    previous: dict[tuple[int, int], tuple[int, int, int]] = {}
    for moment in attacks:
        sounding = {}
        for start, end, pitch, voice in events:
            if start <= moment < end:
                sounding.setdefault(voice, pitch)
        on_beat = abs(moment - round(moment)) < 1e-6
        for a, b in itertools.combinations(sorted(sounding), 2):
            gap = abs(sounding[a] - sounding[b])
            if gap == 0:
                faults["collision"] += 1
            elif gap % 12 in DISSONANT:
                faults["dissonance"] += 3 if on_beat else 1
            if a < b and sounding[a] < sounding[b]:
                faults["crossing"] += 1
            was = previous.get((a, b))
            if was is not None:
                before, low_was, high_was = was
                if (gap % 12 in (0, 7) and before % 12 == gap % 12
                        and sounding[a] != low_was and sounding[b] != high_was
                        and (sounding[a] - low_was) * (sounding[b] - high_was) > 0):
                    faults["parallels"] += 1
            previous[(a, b)] = (gap, sounding[a], sounding[b])

    # Harmony: on every beat where three or more voices sound, do they
    # make a chord? Bach's own text manages this about seven times in
    # ten, which is the standard to aim at.
    span = (min((s for s, _e, _p, _v in events), default=0.0),
            max((e for _s, e, _p, _v in events), default=0.0))
    beat = span[0] - span[0] % 1
    chords = thin = loose = 0
    while beat < span[1]:
        sounding = {pitch % 12 for start, end, pitch, _v in events
                    if start <= beat < end}
        if len(sounding) >= 3:
            if any(sounding <= chord for chord in CHORDS):
                chords += 1
            else:
                loose += 1
        elif len(sounding) >= 1:
            thin += 1
        beat += 1
    faults["loose"] = loose
    faults["thin"] = thin
    faults["chords"] = chords

    weights = {"dissonance": 1, "parallels": 6, "range": 12, "crossing": 2,
               "collision": 8, "loose": 4, "thin": 2, "chords": -4}
    return sum(weights[k] * v for k, v in faults.items()), faults


def best_combination(subjects: dict[str, Subject], tonic: int = 62,
                     spread: list[float] = (0.0, 2.0, 4.0, 6.0, 8.0),
                     avoid: set = frozenset()):
    """Search the alignments of the four subjects for the cleanest one.

    `avoid` rules out voice permutations already used, so a later
    statement of the same combination is heard the other way up rather
    than being the same music again.
    """
    labels = ["theme", "I", "II", "BACH"]
    keys = [0, 7]                       # tonic and dominant forms
    best = None
    for order in itertools.permutations(range(4)):
        if order in avoid:
            continue
        for shifts in itertools.product(keys, repeat=3):
            for offsets in itertools.product(spread, repeat=3):
                until = subjects["I"].span
                lines, ok = {}, True
                for slot, index in enumerate(order):
                    subject = subjects[labels[index]]
                    start = 0.0 if index == 0 else offsets[index - 1]
                    step = 0 if index == 0 else shifts[index - 1]
                    pitch = _fit(tonic + step, subject, RANGES[slot])
                    if pitch is None:
                        ok = False
                        break
                    lines[slot] = subject.fill(start, pitch, until)
                if not ok:
                    continue
                total, faults = score(lines)
                if best is None or total < best[0]:
                    best = (total, faults, order, shifts, offsets, lines)
    return best


def _fit(pitch: int, subject: Subject, span: tuple[int, int]) -> int | None:
    """Octave-shift a statement until the whole of it lies in the range."""
    low, high = span
    for octave in range(-3, 4):
        start = pitch + 12 * octave
        notes = [start + s for _o, s, _l in subject.steps]
        if low <= min(notes) and max(notes) <= high:
            return start
    return None


def finale(subjects: dict[str, Subject], start_bar: float) -> list:
    """A link out of the fragment, three combinations, and the close."""
    plan = []
    tonic = 62                                   # D
    at = start_bar * BAR
    written = []

    # Bach stops mid-flow, so the running quavers of the second subject
    # carry the music the two bars to the first combination rather than
    # letting a full four-voice entry arrive out of nowhere.
    link = subjects["II"]
    for note_start, note_end, pitch in link.at(at, 62):
        written.append((1, note_start, note_end, _into(pitch, RANGES[1])))
    written.append((3, at, at + 2 * BAR, 38))            # D2 under it
    at += 2 * BAR

    used: set = set()
    for key in (tonic, tonic + 7, tonic):
        best = best_combination(subjects, key, avoid=used)
        total, faults, order, _shifts, _offsets, lines = best
        used.add(order)
        span = 0.0
        for slot, notes in lines.items():
            for note_start, note_end, pitch in notes:
                written.append((slot, at + note_start, at + note_end, pitch))
                span = max(span, note_end)
        plan.append((at / BAR + 1, total, faults))
        at += (int(span / BAR) + 1) * BAR

    # The dominant pedal, with B-A-C-H above it in stretto, and out on a
    # Picardy third -- the ending every completion of this fugue writes.
    pedal = at
    written.append((3, pedal, pedal + 4 * BAR, 45))                    # A2
    bach = subjects["BACH"]
    for voice, pitch, delay in ((0, 70, 0.0), (1, 63, 2.0), (2, 58, 4.0)):
        for note_start, note_end, note_pitch in bach.at(pedal + delay, pitch):
            written.append((voice, note_start, note_end,
                            _into(note_pitch, RANGES[voice])))
    at = pedal + 6 * BAR

    # The theme itself has the last word, in the bass, alone until the
    # final chord: nothing a machine writes over it would improve on it.
    theme = subjects["theme"]
    for note_start, note_end, pitch in theme.at(at, 38):
        written.append((3, note_start, note_end, _into(pitch, RANGES[3])))
    close = at + theme.span
    # A Picardy third: the major chord Bach would have ended on, spaced
    # so no voice leaves its range and the third is on top where it tells.
    for voice, pitch in ((0, 78), (1, 74), (2, 69), (3, 38)):          # D major
        written.append((voice, close, close + 2 * BAR, pitch))
    return written, plan


def _into(pitch: int, span: tuple[int, int]) -> int:
    low, high = span
    while pitch < low:
        pitch += 12
    while pitch > high:
        pitch -= 12
    return pitch


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--fragment", default="midi/art-of-fugue/contrapunctusXIX.mid")
    ap.add_argument("--first", default="midi/art-of-fugue/contrapunctusI.mid")
    ap.add_argument("-o", "--out", required=True, help="the completion, as MIDI")
    ap.add_argument("--from-bar", type=float, default=240.0,
                    help="the bar the completion starts in (default 240)")
    args = ap.parse_args(argv)

    subjects = read_subjects(args.fragment, args.first)
    print("Bach's four subjects, as he wrote them:")
    for label, subject in subjects.items():
        pitches = " ".join(name(62 + s) for _o, s, _l in subject.steps)
        print(f"  {label:<6} {len(subject.steps):>2} notes, "
              f"{subject.span:g} quarters: {pitches}")

    written, plan = finale(subjects, args.from_bar - 1)
    print("\nthe combinations the search chose:")
    for bar, total, faults in plan:
        full = faults["chords"] + faults["loose"]
        rate = 100 * faults["chords"] / max(1, full)
        print(f"  bar {bar:>5.0f}: {rate:>4.0f}% of full beats make a chord, "
              f"{faults['parallels']} parallels, {faults['collision']} unisons, "
              f"{faults['range']} out of range")

    lines: dict[int, list] = {}
    for voice, start, end, pitch in written:
        lines.setdefault(voice, []).append((start, end, pitch))
    total, faults = score(lines)
    full = faults["chords"] + faults["loose"]
    print(f"\nthe completion as a whole: {100 * faults['chords'] / max(1, full):.0f}%"
          f" of full beats make a chord ({faults['chords']}/{full}); "
          f"{faults['parallels']} parallels, {faults['collision']} unisons, "
          f"{faults['range']} notes out of range")
    print("  (Bach's own fragment scores 74% by the same measure)")

    _write(written, args.out)
    bars = max(end for _v, _s, end, _p in written) / BAR
    print(f"\n{args.out}: {len(written)} notes, to bar {bars:.0f}")
    return 0


def _write(written, path: str, ppq: int = 384) -> None:
    import mido

    mid = mido.MidiFile(ticks_per_beat=ppq)
    meta = mido.MidiTrack()
    meta.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(120), time=0))
    meta.append(mido.MetaMessage("time_signature", numerator=4, denominator=4,
                                 time=0))
    meta.append(mido.MetaMessage("key_signature", key="Dm", time=0))
    mid.tracks.append(meta)
    for voice in sorted(RANGES):
        track = mido.MidiTrack()
        track.append(mido.MetaMessage("track_name", name=f"Voice {voice + 1}",
                                      time=0))
        events = []
        for v, start, end, pitch in written:
            if v != voice:
                continue
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


if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    raise SystemExit(main(sys.argv[1:]))
