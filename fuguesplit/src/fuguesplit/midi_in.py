"""MIDI -> Score.

Flattens a type-0 or type-1 file into absolute-tick notes, keeping the
source track index (a strong hint for voice separation when the file was
engraved voice-by-voice, as organ and choral transcriptions usually are).
"""

from __future__ import annotations

import mido

from dataclasses import replace

from .score import Note, Score, TempoEvent, TimeSigEvent

DRUM_CHANNEL = 9


def read_midi(path: str, *, keep_drums: bool = False) -> Score:
    mid = mido.MidiFile(path)
    score = Score(ppq=mid.ticks_per_beat, title=_guess_title(mid, path))

    for ti, track in enumerate(mid.tracks):
        tick = 0
        # (channel, pitch) -> list of pending note-on ticks, so repeated
        # onsets before a matching off are paired first-in-first-out.
        pending: dict[tuple[int, int], list[tuple[int, int]]] = {}
        for msg in track:
            tick += msg.time
            if msg.type == "track_name" and msg.name.strip():
                score.track_names[ti] = msg.name.strip()
            elif msg.type == "set_tempo":
                score.tempos.append(TempoEvent(tick, mido.tempo2bpm(msg.tempo)))
            elif msg.type == "key_signature" and tick == 0:
                score.key = _parse_key(msg.key)
            elif msg.type == "time_signature":
                # A 0/4 shows up in chorale settings to mark a free
                # interlude that is not counted in bars. It is not a metre,
                # and a bar of no length is one the writer can never fill,
                # so let the previous signature stand.
                if msg.numerator >= 1 and msg.denominator >= 1:
                    score.time_sigs.append(
                        TimeSigEvent(tick, msg.numerator, msg.denominator)
                    )
            elif msg.type == "note_on" and msg.velocity > 0:
                if msg.channel == DRUM_CHANNEL and not keep_drums:
                    continue
                pending.setdefault((msg.channel, msg.note), []).append(
                    (tick, msg.velocity)
                )
            elif msg.type in ("note_off", "note_on"):
                if msg.channel == DRUM_CHANNEL and not keep_drums:
                    continue
                stack = pending.get((msg.channel, msg.note))
                if not stack:
                    continue
                start, vel = stack.pop(0)
                if tick > start:
                    score.notes.append(
                        Note(
                            pitch=msg.note,
                            start=start,
                            end=tick,
                            velocity=vel,
                            src_track=ti,
                            src_channel=msg.channel,
                        )
                    )
        # Anything still held at end of track gets closed at the last event.
        for (_ch, pitch), stack in pending.items():
            for start, vel in stack:
                if tick > start:
                    score.notes.append(
                        Note(pitch, start, tick, vel, ti, _ch)
                    )

    score.notes.sort(key=lambda n: (n.start, -n.pitch))
    # Stamp each source note with a stable identity, so any stage can be
    # asked which source note a written note came from -- and which source
    # notes never made it into anybody's part.
    for index, note in enumerate(score.notes):
        note.uid = index
    score.tempos.sort(key=lambda e: e.tick)
    score.time_sigs.sort(key=lambda e: e.tick)
    if not score.tempos:
        score.tempos.append(TempoEvent(0, 120.0))
    if not score.time_sigs or score.time_sigs[0].tick > 0:
        score.time_sigs.insert(0, TimeSigEvent(0, 4, 4))
    return score


def clip_to_ticks(score: Score, start: int, end: int | None) -> Score:
    """Restrict a score to [start, end), rebasing to tick 0.

    Used by --from-bar/--to-bar so a long Prelude-and-Fugue file can be
    reduced to the movement you actually want on the fretboard.
    """
    end = score.end_tick if end is None else end
    notes: list[Note] = []
    for n in score.notes:
        if n.end <= start or n.start >= end:
            continue
        notes.append(replace(n,
                             start=max(n.start, start) - start,
                             end=min(n.end, end) - start))

    def carry(events, make):
        """Keep events inside the window, plus the one in force at `start`."""
        kept, before = [], None
        for ev in events:
            if ev.tick < start:
                before = ev
            elif ev.tick < end:
                kept.append(make(ev, ev.tick - start))
        if before is not None:
            kept.insert(0, make(before, 0))
        elif kept and kept[0].tick != 0:
            kept.insert(0, make(kept[0], 0))
        return kept

    out = Score(
        ppq=score.ppq,
        notes=notes,
        tempos=carry(score.tempos, lambda e, t: TempoEvent(t, e.bpm)),
        time_sigs=carry(
            score.time_sigs,
            lambda e, t: TimeSigEvent(t, e.numerator, e.denominator),
        ),
        title=score.title,
        track_names=dict(score.track_names),
        key=score.key,
        engraved=score.engraved,
    )
    if not out.tempos:
        out.tempos.append(TempoEvent(0, score.tempo_at(start)))
    if not out.time_sigs:
        num, den = score.time_sig_at(start)
        out.time_sigs.append(TimeSigEvent(0, num, den))
    return out


def bar_starts(score: Score, upto: int | None = None) -> list[int]:
    """Absolute tick of each bar line, derived from the time-signature map."""
    upto = score.end_tick if upto is None else upto
    starts, tick = [], 0
    guard = 0
    while tick <= upto and guard < 100_000:
        starts.append(tick)
        num, den = score.time_sig_at(tick)
        tick += int(score.ppq * 4 * num / den)
        guard += 1
    return starts


KEY_SHARPS = {
    "Cb": -7, "Gb": -6, "Db": -5, "Ab": -4, "Eb": -3, "Bb": -2, "F": -1,
    "C": 0, "G": 1, "D": 2, "A": 3, "E": 4, "B": 5, "F#": 6, "C#": 7,
}


def _parse_key(key: str) -> tuple[int, int]:
    """mido spells keys as 'Eb' or 'Bbm'; Guitar Pro wants (sharps, minor)."""
    key = key.strip()
    is_minor = key.endswith("m")
    root = key[:-1] if is_minor else key
    if is_minor:
        # Relative major carries the same signature, three semitones up.
        rel = {"A": "C", "E": "G", "B": "D", "F#": "A", "C#": "E", "G#": "B",
               "D#": "F#", "A#": "C#", "D": "F", "G": "Bb", "C": "Eb",
               "F": "Ab", "Bb": "Db", "Eb": "Gb", "Ab": "Cb"}
        root = rel.get(root, "C")
    return KEY_SHARPS.get(root, 0), 1 if is_minor else 0


def _guess_title(mid: mido.MidiFile, path: str) -> str:
    for track in mid.tracks[:1]:
        for msg in track:
            if msg.type == "track_name" and msg.name.strip():
                return msg.name.strip()
    import os

    return os.path.splitext(os.path.basename(path))[0]
