"""Build and write the Guitar Pro file.

Assembles the arranged parts into a .gp5 song: shared measure headers
carrying the metre and key, one track per part with its own tuning and
MIDI voice, and a beat stream per bar.
"""

from __future__ import annotations

import guitarpro as gp
from guitarpro import models as M

from . import fretting
from .rhythm import GP_QUARTER, Bar, BeatSpec
from .score import Part

# General MIDI programs.
PROGRAMS = {
    "clean": 27, "jazz": 26, "overdrive": 29, "distortion": 30,
    "bass-finger": 33, "bass-pick": 34,
}

TRACK_COLORS = [
    M.Color(255, 90, 90), M.Color(90, 170, 255), M.Color(120, 210, 120),
    M.Color(240, 190, 80), M.Color(200, 130, 235), M.Color(120, 220, 220),
]


def build_song(
    parts: list[Part],
    part_beats: list[list[list[BeatSpec]]],
    second_beats: list[list[list[BeatSpec]]] | None,
    part_positions: list[list[tuple[int, int]]],
    bars: list[Bar],
    *,
    title: str,
    tempo: int,
    key: tuple[int, int],
    tempo_changes: list[tuple[int, int]] | None = None,
    artist: str = "",
    credit: str = "",
    source: str = "",
) -> M.Song:
    """`part_beats[p][bar]` is the beat list; `part_positions[p]` runs in
    note order across the whole part and is consumed as notes are emitted."""
    guitars = sum(1 for p in parts if not p.is_bass)
    scoring = f"{guitars} guitar{'s' if guitars != 1 else ''}"
    if any(p.is_bass for p in parts):
        scoring += " and bass"

    notice = [f"Arranged for {scoring} by FugueSplit."]
    if credit:
        notice.append(f"FugueSplit written by {credit}.")
    if source:
        notice.append(f"Source: {source}")

    song = M.Song(
        title=title,
        subtitle=f"Arranged for {scoring}",
        # `music` is the composer. Leave `artist` and `words` empty: a
        # score reader takes those for the performer and the lyricist, and
        # Bach wrote no words for a fugue.
        artist="",
        music=artist,
        words="",
        tab=credit,
        instructions="",
        notice=notice,
        tempo=int(tempo),
        tempoName="",
        measureHeaders=[],
        tracks=[],
    )
    song.key = _key_signature(key)

    start = GP_QUARTER   # Guitar Pro counts the first bar from tick 960
    tempo_map = dict(tempo_changes or [])
    for bar in bars:
        header = M.MeasureHeader(
            number=bar.index + 1,
            start=start,
            timeSignature=M.TimeSignature(
                numerator=bar.numerator,
                denominator=M.Duration(value=bar.denominator),
            ),
            keySignature=song.key,
        )
        song.measureHeaders.append(header)
        start += bar.length

    for pi, part in enumerate(parts):
        track = M.Track(
            song,
            number=pi + 1,
            name=part.name,
            fretCount=24,
            color=TRACK_COLORS[pi % len(TRACK_COLORS)],
            measures=[],
            strings=_strings(part.tuning),
        )
        # Two MIDI channels per track (voice + effects), skipping the
        # percussion channel.
        base = pi * 2
        if base >= 9:
            base += 2
        track.channel = M.MidiChannel(
            channel=base % 16,
            effectChannel=(base + 1) % 16,
            instrument=part.midi_program,
            volume=104,
            balance=_pan(pi, len(parts)),
        )

        # positions[] holds one fretboard position per struck note; tied
        # continuations reuse the position of the note they belong to.
        cursor = -1
        positions = part_positions[pi]
        seconds = (second_beats or [None] * len(parts))[pi]
        for bi, bar in enumerate(bars):
            measure = M.Measure(track, song.measureHeaders[bi], voices=[])
            voice = M.Voice(measure, beats=[])
            other = M.Voice(measure, beats=[])
            for spec in part_beats[pi][bi]:
                beat = M.Beat(
                    voice,
                    duration=M.Duration(value=spec.value, isDotted=spec.dotted),
                    notes=[],
                )
                if spec.pitch is None:
                    beat.status = M.BeatStatus.rest
                else:
                    beat.status = M.BeatStatus.normal
                    if not spec.tie:
                        cursor += 1
                    string_idx, fret = positions[cursor]
                    note = M.Note(
                        beat,
                        value=fret,
                        # GP numbers strings 1..N from the highest pitch.
                        string=len(part.tuning) - string_idx,
                        velocity=95,
                        type=M.NoteType.tie if spec.tie else M.NoteType.normal,
                    )
                    beat.notes.append(note)
                    for pitch in spec.extras:
                        spot = fretting.position_beside(
                            pitch, part.tuning, part.max_fret,
                            string_idx, fret, part.hand_span,
                        )
                        if spot is None:
                            continue
                        beat.notes.append(M.Note(
                            beat,
                            value=spot[1],
                            string=len(part.tuning) - spot[0],
                            velocity=95,
                            type=M.NoteType.normal,
                        ))
                voice.beats.append(beat)
            if seconds and seconds[bi]:
                _fill(other, seconds[bi], part)
            measure.voices = [voice, other]
            track.measures.append(measure)
        song.tracks.append(track)

    _apply_tempo_changes(song, tempo_map)
    return song


def _fill(voice: M.Voice, specs: list[BeatSpec], part: Part) -> None:
    """Write a stave's second voice: the notes that start inside another."""
    for spec in specs:
        beat = M.Beat(
            voice,
            duration=M.Duration(value=spec.value, isDotted=spec.dotted),
            notes=[],
        )
        if spec.pitch is None:
            beat.status = M.BeatStatus.rest
        else:
            beat.status = M.BeatStatus.normal
            spot = fretting.positions_for(spec.pitch, part.tuning, part.max_fret)
            if not spot:
                # Last resort: a pitch off the end of the neck is played an
                # octave away, never silently replaced by a rest.
                pitch = spec.pitch
                low, high = min(part.tuning), max(part.tuning) + part.max_fret
                while pitch < low:
                    pitch += 12
                while pitch > high:
                    pitch -= 12
                spot = fretting.positions_for(pitch, part.tuning, part.max_fret)
            if not spot:
                beat.status = M.BeatStatus.rest
            else:
                string_idx, fret = min(spot, key=lambda p: p[1])
                beat.notes.append(M.Note(
                    beat, value=fret,
                    string=len(part.tuning) - string_idx,
                    velocity=95,
                    type=M.NoteType.tie if spec.tie else M.NoteType.normal,
                ))
        voice.beats.append(beat)


def _apply_tempo_changes(song: M.Song, tempo_map: dict[int, int]) -> None:
    """Attach a mix-table tempo marking to the first beat of changed bars."""
    if not tempo_map or not song.tracks:
        return
    track = song.tracks[0]
    for bar_index, bpm in tempo_map.items():
        if bar_index <= 0 or bar_index >= len(track.measures):
            continue
        beats = track.measures[bar_index].voices[0].beats
        if not beats:
            continue
        change = M.MixTableChange(tempo=M.MixTableItem(value=int(bpm)))
        change.hideTempo = False
        beats[0].effect.mixTableChange = change


def _strings(tuning: list[int]) -> list[M.GuitarString]:
    """Tuning arrives low-to-high; Guitar Pro wants string 1 on top."""
    return [
        M.GuitarString(number=i + 1, value=pitch)
        for i, pitch in enumerate(reversed(tuning))
    ]


def _pan(index: int, total: int) -> int:
    """Spread the guitars across the stereo field, bass centred."""
    if total <= 1 or index == total - 1:
        return 64
    if total == 2:
        return 64
    spread = 40
    frac = index / max(1, total - 2)
    return int(64 - spread + 2 * spread * frac)


def _key_signature(key: tuple[int, int]) -> M.KeySignature:
    try:
        return M.KeySignature((key[0], key[1]))
    except ValueError:
        return M.KeySignature.CMajor


def write(song: M.Song, path: str) -> None:
    gp.write(song, path, version=(5, 1, 0))
