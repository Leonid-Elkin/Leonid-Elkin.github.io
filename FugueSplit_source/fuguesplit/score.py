"""Core note/score model shared by every stage of the pipeline.

Everything downstream of the MIDI reader speaks in terms of a `Score`:
a flat list of notes on an absolute tick timeline, plus the tempo and
time-signature maps needed to lay the result out as notation.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace


@dataclass
class Note:
    """One sounding note on the absolute tick timeline."""

    pitch: int          # MIDI note number
    start: int          # absolute tick
    end: int            # absolute tick, exclusive
    velocity: int = 90
    src_track: int = 0  # index of the MIDI track it came from
    src_channel: int = 0
    uid: int = -1       # stable identity of the source note, kept through
                        # every octave fold, transposition and quantisation
                        # so a written note can be traced back to its origin

    @property
    def duration(self) -> int:
        return self.end - self.start

    def shifted(self, semitones: int) -> "Note":
        return replace(self, pitch=self.pitch + semitones)


@dataclass
class TempoEvent:
    tick: int
    bpm: float


@dataclass
class TimeSigEvent:
    tick: int
    numerator: int
    denominator: int


@dataclass
class Score:
    ppq: int
    notes: list[Note] = field(default_factory=list)
    tempos: list[TempoEvent] = field(default_factory=list)
    time_sigs: list[TimeSigEvent] = field(default_factory=list)
    title: str = ""
    track_names: dict[int, str] = field(default_factory=dict)
    key: tuple[int, int] = (0, 0)   # (sharps: -7..7, is_minor: 0/1)

    @property
    def end_tick(self) -> int:
        return max((n.end for n in self.notes), default=0)

    def tempo_at(self, tick: int) -> float:
        bpm = 120.0
        for ev in self.tempos:
            if ev.tick <= tick:
                bpm = ev.bpm
            else:
                break
        return bpm

    def time_sig_at(self, tick: int) -> tuple[int, int]:
        num, den = 4, 4
        for ev in self.time_sigs:
            if ev.tick <= tick:
                num, den = ev.numerator, ev.denominator
            else:
                break
        return num, den

    def notes_by_track(self) -> dict[int, list[Note]]:
        out: dict[int, list[Note]] = {}
        for n in self.notes:
            out.setdefault(n.src_track, []).append(n)
        return out


@dataclass
class Part:
    """A single monophonic instrument part produced by the arranger."""

    name: str
    notes: list[Note] = field(default_factory=list)
    is_bass: bool = False
    tuning: list[int] = field(default_factory=list)   # low string -> high string
    midi_program: int = 30
    octave_shift: int = 0   # net semitones applied, for the report
    extras: list[Note] = field(default_factory=list)  # chord tones (same onset)
    second: list[Note] = field(default_factory=list)  # notes offset within the voice
    max_fret: int = 22      # highest fret this part should use
    hand_span: int = 4      # frets the hand can hold at once, for double-stops

    @property
    def pitch_range(self) -> tuple[int, int]:
        if not self.notes:
            return (0, 0)
        ps = [n.pitch for n in self.notes]
        return (min(ps), max(ps))
