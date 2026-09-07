"""Join a torso and a completion of it into one score.

    python splice.py torso.mid completion.xml -o joined.mid

The Art of Fugue breaks off in the middle of bar 239. Every completion
of it reprints those 239 bars, but from its own edition -- different
accidentals here and there, an ornament written out, an octave moved.
Arranging the completion on its own therefore gives a tab whose opening
is *nearly* the one already learned from the torso, which is worse than
either being identical or being different.

So the two are joined at the bar the torso stops in: Bach's own notes up
to there, the completion's from there on. The completion's voices are
matched to the torso's by register, so the four lines carry through the
join, and the result is written as one MIDI file with a track per voice.

Feed that to the arranger with `--like torso.mid` and the opening is not
merely close to the torso's tab, it is the same arrangement of the same
notes.
"""

from __future__ import annotations

import argparse
import os
import sys

import mido


def voice_order(notes) -> list[int]:
    """Source tracks, highest voice first, ignoring the stray ones."""
    by_track: dict[int, list] = {}
    for note in notes:
        by_track.setdefault(note.src_track, []).append(note)
    real = {t: ns for t, ns in by_track.items() if len(ns) >= 8}
    return sorted(real, key=lambda t: -sum(n.pitch for n in real[t]) / len(real[t]))


def nearest(pitch: float, centres: dict[int, float]) -> int:
    return min(centres, key=lambda t: abs(centres[t] - pitch))


def splice(torso, completion, at_tick: int | None = None, ppq: int = 384):
    """(notes, track names) for the torso up to `at_tick`, then the rest.

    `at_tick` is in the torso's own ticks and defaults to where it stops.
    """
    at_tick = torso.end_tick if at_tick is None else at_tick
    scale = lambda tick, source: round(tick * ppq / source.ppq)

    voices = voice_order(torso.notes)
    if not voices:
        raise ValueError("the torso has no voices to carry through")
    centres = {}
    for index, track in enumerate(voices):
        pitches = [n.pitch for n in torso.notes if n.src_track == track]
        centres[index] = sum(pitches) / len(pitches)

    lanes: list[list] = [[] for _ in voices]
    for note in torso.notes:
        if note.start >= at_tick or note.src_track not in voices:
            continue
        lanes[voices.index(note.src_track)].append(
            (scale(note.start, torso), scale(note.end, torso), note.pitch)
        )

    # The completion's own voices, ordered the same way, so the lines
    # carry over the join rather than swapping instruments at it.
    theirs = voice_order(completion.notes)
    mapping = {track: index for index, track in enumerate(theirs[:len(voices)])}
    join = round(at_tick * completion.ppq / torso.ppq)
    dropped = 0
    for note in sorted(completion.notes, key=lambda n: (n.start, -n.pitch)):
        if note.end <= join:
            continue
        start = max(scale(note.start, completion), scale(join, completion))
        end = scale(note.end, completion)
        if end <= start:
            continue
        first = mapping.get(note.src_track)
        if first is None:
            first = nearest(note.pitch, centres)
        # One voice, one line: a note that would overlap what its own
        # voice is already holding -- the edition's own double-stops, and
        # the inner parts it adds for a bar here and there -- goes to the
        # nearest voice that is free instead, so no lane ends up holding
        # two notes at once and the file stays as cleanly separated as
        # the torso it continues.
        order = [first] + sorted((i for i in range(len(lanes)) if i != first),
                                 key=lambda i: abs(centres[i] - note.pitch))
        for index in order:
            if not _clash(lanes[index], start, end):
                lanes[index].append((start, end, note.pitch))
                break
        else:
            dropped += 1

    names = [f"Voice {i + 1}" for i in range(len(lanes))]
    for lane in lanes:
        lane.sort()
    return lanes, names, dropped


def _clash(lane, start, end) -> bool:
    """Would a note here collide with one this lane already holds?"""
    for other_start, other_end, _pitch in lane:
        if other_start < end and start < other_end:
            return True
    return False


MAJOR = {0: "C", 1: "G", 2: "D", 3: "A", 4: "E", 5: "B", 6: "F#", 7: "C#",
         -1: "F", -2: "Bb", -3: "Eb", -4: "Ab", -5: "Db", -6: "Gb", -7: "Cb"}
MINOR = {0: "Am", 1: "Em", 2: "Bm", 3: "F#m", 4: "C#m", 5: "G#m", 6: "D#m",
         7: "A#m", -1: "Dm", -2: "Gm", -3: "Cm", -4: "Fm", -5: "Bbm",
         -6: "Ebm", -7: "Abm"}


def write_midi(lanes, names, path: str, ppq: int, tempo: float,
               numerator: int, denominator: int,
               key: tuple[int, int] = (0, 0)) -> None:
    mid = mido.MidiFile(ticks_per_beat=ppq)
    meta = mido.MidiTrack()
    meta.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(tempo), time=0))
    meta.append(mido.MetaMessage("time_signature", numerator=numerator,
                                 denominator=denominator, time=0))
    table = MINOR if key[1] else MAJOR
    meta.append(mido.MetaMessage("key_signature",
                                 key=table.get(key[0], "C"), time=0))
    mid.tracks.append(meta)
    for lane, name in zip(lanes, names):
        track = mido.MidiTrack()
        track.append(mido.MetaMessage("track_name", name=name, time=0))
        events = []
        for start, end, pitch in lane:
            events.append((start, 1, pitch))
            events.append((max(end, start + 1), 0, pitch))
        events.sort(key=lambda e: (e[0], e[1]))
        previous = 0
        for tick, on, pitch in events:
            track.append(mido.Message("note_on" if on else "note_off",
                                      note=pitch, velocity=90 if on else 0,
                                      time=tick - previous))
            previous = tick
        mid.tracks.append(track)
    mid.save(path)


def main(argv: list[str]) -> int:
    from fuguesplit.pipeline import read_source

    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("torso", help="the unfinished piece")
    ap.add_argument("completion", help="a score that finishes it")
    ap.add_argument("-o", "--out", required=True, help="the joined .mid")
    ap.add_argument("--at-bar", type=int,
                    help="join at this bar (default: where the torso stops)")
    args = ap.parse_args(argv)

    torso = read_source(args.torso)
    completion = read_source(args.completion)
    at = None
    if args.at_bar:
        from fuguesplit.midi_in import bar_starts

        starts = bar_starts(torso)
        at = starts[min(args.at_bar - 1, len(starts) - 1)]

    lanes, names, dropped = splice(torso, completion, at)
    numerator, denominator = torso.time_sig_at(0)
    write_midi(lanes, names, args.out, 384, torso.tempo_at(0),
               numerator, denominator, torso.key)

    kept = sum(len(lane) for lane in lanes)
    print(f"{os.path.basename(args.torso)} + "
          f"{os.path.basename(args.completion)} -> {args.out}")
    print(f"  {len(lanes)} voices, {kept} notes, joined at tick "
          f"{at if at is not None else torso.end_tick} of the torso")
    for name, lane in zip(names, lanes):
        print(f"    {name}: {len(lane)} notes")
    if dropped:
        print(f"  {dropped} notes of the completion had no free voice to "
              f"take them")
    return 0


if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    raise SystemExit(main(sys.argv[1:]))
