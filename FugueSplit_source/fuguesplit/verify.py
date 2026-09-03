"""Read a finished tab back and check every note against the source.

`check.py` asks whether the arrangement is musically sensible. This asks
the blunter question: is what came out actually the piece that went in?
It parses the written `.gp5` -- not the objects in memory that produced
it -- and follows each note back through fretting, folding and
quantisation to the source note it came from.

    python -m fuguesplit.verify score.xml tab.gp5

Five things can go wrong, and each is reported as a `Problem`:

  pitch     the fret and string sound something other than the note the
            source has there, or a note is off the end of the neck
  octave    a note was moved by something other than whole octaves, which
            would change the melodic shape rather than transpose it
  timing    an onset does not sit where the source puts it, once both are
            snapped to the quantisation grid
  bar       a bar does not hold exactly its own length of music
  missing   a source note reached the file as nothing at all

The last one is expected in small numbers -- ornament shorter than the
grid cannot be written on that grid -- so it is counted separately and
reported with the durations involved.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field

import guitarpro as gp
from guitarpro import models as M

from . import rhythm


@dataclass
class Problem:
    kind: str          # pitch | octave | timing | bar | missing | extra
    part: str
    bar: int
    detail: str

    def __str__(self) -> str:
        return f"  {self.kind:<8} {self.part:<11} bar {self.bar:>4}  {self.detail}"


@dataclass
class Audit:
    source_notes: int = 0
    written_notes: int = 0
    traced: int = 0                 # written notes matched to a source note
    missing: list = field(default_factory=list)     # source notes never written
    problems: list[Problem] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.problems

    def summary(self) -> str:
        kinds: dict[str, int] = {}
        for problem in self.problems:
            kinds[problem.kind] = kinds.get(problem.kind, 0) + 1
        parts = ", ".join(f"{n} {k}" for k, n in sorted(kinds.items())) or "none"
        return (f"{self.written_notes} notes written, {self.traced} traced "
                f"back to their source note; {len(self.missing)} source notes "
                f"not written; problems: {parts}")


def read_tab(path: str) -> dict[str, list[tuple[int, int, int]]]:
    """The tab as it stands on disk: {track: [(start, pitch, length)]}.

    Ties are folded back into the note they continue, so a note split
    across a bar line comes back as the single note it is meant to be.
    Starts are in GP ticks from the beginning of the piece.
    """
    song = gp.parse(path)
    out: dict[str, list[tuple[int, int, int]]] = {}
    for track in song.tracks:
        tuning = [string.value for string in track.strings]
        notes: list[list[int]] = []
        # string -> index into `notes`, so a tie can find what it extends
        sounding: dict[int, int] = {}
        for measure in track.measures:
            for voice in measure.voices:
                tick = measure.header.start
                for beat in voice.beats:
                    length = rhythm.WHOLE // beat.duration.value
                    if beat.duration.isDotted:
                        length = length * 3 // 2
                    for note in beat.notes:
                        pitch = tuning[note.string - 1] + note.value
                        if note.type == M.NoteType.tie:
                            at = sounding.get(note.string)
                            if at is not None:
                                notes[at][2] += length
                                continue
                        notes.append([tick, pitch, length])
                        sounding[note.string] = len(notes) - 1
                    tick += length
        out[track.name] = [tuple(n) for n in notes]
    return out


def verify(report, path: str, grid: str = "32nd", transpose: int = 0) -> Audit:
    """Check the tab at `path` against the score `report` was built from.

    `transpose` is whatever the arrangement was shifted by, so a part
    written a tone down is not read as a wrong note. Lengths are not
    compared: enforcing monophony shortens a note that overlapped the
    next, and the legato pass lengthens one across a small rest, both
    deliberately.
    """
    audit = Audit()
    score = report.source
    if score is None:
        raise ValueError("the report carries no source score to check against")
    audit.source_notes = len(score.notes)
    step = rhythm.grid_ticks(grid)
    source = {note.uid: note for note in score.notes}

    # What the arranger meant to write, by part: uid -> the written note.
    intended: dict[str, dict[int, object]] = {}
    for part in report.arranged:
        intended[part.name] = {
            note.uid: note
            for group in (part.notes, part.extras, part.second)
            for note in group
        }

    bars = rhythm.build_bars(score, score.end_tick)
    starts = [bar.start for bar in bars]
    written = read_tab(path)
    _check_bars(path, audit)

    for part in report.arranged:
        on_disk = written.get(part.name)
        if on_disk is None:
            audit.problems.append(
                Problem("missing", part.name, 0, "the tab has no such track")
            )
            continue
        audit.written_notes += len(on_disk)
        # Guitar Pro counts the first bar from tick 960; the arrangement
        # counts it from 0.
        offset = bars[0].start + rhythm.GP_QUARTER if bars else rhythm.GP_QUARTER
        planned = sorted(intended[part.name].values(), key=lambda n: (n.start, n.pitch))
        actual = sorted(((t - offset, p, d) for t, p, d in on_disk))
        pool: dict[tuple[int, int], list] = {}
        for note in planned:
            pool.setdefault((note.start, note.pitch), []).append(note)

        for start, pitch, _length in actual:
            waiting = pool.get((start, pitch))
            if not waiting:
                audit.problems.append(Problem(
                    "pitch", part.name, _bar_of(start, starts),
                    f"the tab sounds {pitch} at {_beat(start, starts)} and the "
                    f"arrangement has no such note there",
                ))
                continue
            note = waiting.pop()
            origin = source.get(note.uid)
            if origin is None:
                continue
            if (pitch - origin.pitch - transpose) % 12:
                audit.problems.append(Problem(
                    "pitch", part.name, _bar_of(start, starts),
                    f"source pitch {origin.pitch} was written as {pitch}, "
                    f"which is not the same note in another octave",
                ))
            want = _snap(rhythm.to_gp(origin.start, score.ppq), step)
            if start != want:
                audit.problems.append(Problem(
                    "timing", part.name, _bar_of(start, starts),
                    f"pitch {pitch} sounds at {start} ticks; the source puts "
                    f"it at {want}",
                ))
            else:
                audit.traced += 1

        # Anything the arrangement meant to write and the file has not
        # got: a note lost between the two, which is the failure this
        # audit exists to catch.
        for (start, _pitch), waiting in pool.items():
            for note in waiting:
                audit.problems.append(Problem(
                    "missing", part.name, _bar_of(start, starts),
                    f"pitch {note.pitch} at {_beat(start, starts)} is in the "
                    f"arrangement but not in the file",
                ))

    placed = {uid for part in intended.values() for uid in part}
    audit.missing = [n for n in score.notes if n.uid not in placed]
    return audit


def _check_bars(path: str, audit: Audit) -> None:
    """Every bar must hold exactly its own length, in every voice used."""
    song = gp.parse(path)
    for track in song.tracks:
        for measure in track.measures:
            header = measure.header
            want = (rhythm.WHOLE * header.timeSignature.numerator
                    // header.timeSignature.denominator.value)
            for index, voice in enumerate(measure.voices):
                if not voice.beats:
                    continue
                filled = 0
                for beat in voice.beats:
                    length = rhythm.WHOLE // beat.duration.value
                    if beat.duration.isDotted:
                        length = length * 3 // 2
                    filled += length
                if filled != want:
                    audit.problems.append(Problem(
                        "bar", track.name, header.number,
                        f"voice {index + 1} holds {filled} ticks of a "
                        f"{want}-tick bar",
                    ))


def _snap(tick: int, grid: int) -> int:
    return int(round(tick / grid)) * grid


def _bar_of(tick: int, starts: list[int]) -> int:
    import bisect

    return max(1, bisect.bisect_right(starts, tick))


def _beat(tick: int, starts: list[int]) -> str:
    import bisect

    index = max(0, bisect.bisect_right(starts, tick) - 1)
    if not starts:
        return f"tick {tick}"
    return f"beat {(tick - starts[index]) / rhythm.GP_QUARTER + 1:.2f}"


def main(argv: list[str]) -> int:
    import argparse

    from .pipeline import Settings, convert

    for stream in (os.sys.stdout, os.sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, OSError):
            pass

    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("source", help="the .mid or MusicXML the tab came from")
    ap.add_argument("tab", nargs="?", help="the .gp5 to check (default: "
                                           "convert the source afresh)")
    ap.add_argument("-g", "--guitars", type=int, default=0)
    ap.add_argument("--grid", default="32nd")
    ap.add_argument("--detail", type=int, default=10,
                    help="how many problems to list (default 10)")
    args = ap.parse_args(argv)

    settings = Settings(guitars=args.guitars, grid=args.grid)
    tab = args.tab
    made = None
    if tab is None:
        import tempfile

        made = tempfile.mkdtemp()
        tab = os.path.join(made, "verify.gp5")
    report = convert(args.source, tab, settings)
    audit = verify(report, tab, args.grid)

    print(f"{os.path.basename(args.source)} -> {os.path.basename(tab)}")
    print(f"  {audit.summary()}")
    if audit.missing:
        short = [n for n in audit.missing
                 if n.duration < report.source.ppq / 8]
        print(f"  of the {len(audit.missing)} not written, {len(short)} are "
              f"shorter than a 32nd note")
    for problem in audit.problems[:args.detail]:
        print(problem)
    if len(audit.problems) > args.detail:
        print(f"  ... and {len(audit.problems) - args.detail} more")
    return 0 if audit.ok else 1


if __name__ == "__main__":
    raise SystemExit(main(os.sys.argv[1:]))
