"""Compare a finished arrangement against the MIDI it came from.

Every written note carries the id of the source note it came from, so the
two can be matched exactly rather than guessed at. What that allows us to
ask, per piece:

  kept        how many source notes reached the tab at all
  as a line   how many are real notes of a part rather than double-stops
  octave      how far each note was moved, in whole octaves; the arranger
              may fold a line to fit a guitar but never alters its shape,
              so anything that is not a multiple of 12 is a bug
  onset       how far quantisation moved an attack, in 32nd notes
  held        how much longer notes ring than written -- the legato fill
              and Guitar Pro's tied durations both lengthen them

    python -m fuguesplit.compare midi/art-of-fugue
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field

from . import rhythm


@dataclass
class Comparison:
    """How faithfully one arrangement reproduces its source."""

    name: str
    source_notes: int = 0
    kept: int = 0                 # reached the tab in any form
    as_line: int = 0              # as a part's own note, not a double-stop
    lost: int = 0
    octaves: dict = field(default_factory=dict)   # shift in octaves -> count
    off_pitch: int = 0            # moved by something other than octaves
    onset_error: dict = field(default_factory=dict)  # 32nds -> count
    lengthened: int = 0
    shortened: int = 0
    lost_too_low: int = 0     # lost notes below every part's lowest string
    lost_too_high: int = 0    # lost notes above every part's top fret

    @property
    def kept_pct(self) -> float:
        return 100 * self.kept / max(1, self.source_notes)

    @property
    def in_place_pct(self) -> float:
        """Share of kept notes left at their written octave."""
        return 100 * self.octaves.get(0, 0) / max(1, self.kept)

    @property
    def on_time_pct(self) -> float:
        return 100 * self.onset_error.get(0, 0) / max(1, self.kept)


def compare(report) -> Comparison:
    score, parts = report.source, report.arranged
    out = Comparison(name=report.title or "?")
    if score is None or not parts:
        return out

    written: dict[int, tuple] = {}
    for part in parts:
        for kind, group in (("line", part.notes),
                            ("chord", part.extras),
                            ("second", part.second)):
            for note in group:
                if note.uid < 0:
                    continue
                # A line note beats a double-stop if a note somehow appears
                # as both; we want the most favourable true statement.
                if note.uid not in written or kind == "line":
                    written[note.uid] = (note, kind)

    grid32 = rhythm.GP_QUARTER // 8
    out.source_notes = len(score.notes)
    # The widest window the ensemble can reach between them. Range is never
    # a reason to lose a note -- an octave fold always brings one back --
    # so anything lost outside this window is a bug, not a limitation.
    floor = min((min(p.tuning) for p in parts if p.tuning), default=0)
    ceiling = max((max(p.tuning) + p.max_fret for p in parts if p.tuning),
                  default=127)
    for note in score.notes:
        found = written.get(note.uid)
        if found is None:
            out.lost += 1
            if note.pitch < floor:
                out.lost_too_low += 1
            elif note.pitch > ceiling:
                out.lost_too_high += 1
            continue
        got, kind = found
        out.kept += 1
        if kind == "line":
            out.as_line += 1

        delta = got.pitch - note.pitch
        if delta % 12:
            out.off_pitch += 1
        else:
            octave = delta // 12
            out.octaves[octave] = out.octaves.get(octave, 0) + 1

        want = rhythm.to_gp(note.start, score.ppq)
        error = round((got.start - want) / grid32)
        out.onset_error[error] = out.onset_error.get(error, 0) + 1

        want_len = rhythm.to_gp(note.end, score.ppq) - want
        got_len = got.end - got.start
        if got_len > want_len + grid32:
            out.lengthened += 1
        elif got_len < want_len - grid32:
            out.shortened += 1
    return out


def main(argv: list[str]) -> int:
    import argparse

    from .pipeline import Settings, convert

    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, OSError):
            pass

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("paths", nargs="+")
    ap.add_argument("--legato", type=float, default=1.0)
    args = ap.parse_args(argv)

    files = []
    for path in args.paths:
        if os.path.isdir(path):
            files += [os.path.join(path, f) for f in sorted(os.listdir(path))
                      if f.lower().endswith((".mid", ".midi"))]
        else:
            files.append(path)

    header = (f"{'file':<18} {'src':>6} {'kept':>7} {'as line':>8} "
              f"{'lost':>5} {'same 8ve':>9} {'on time':>8} "
              f"{'held on':>8} {'off-pitch':>9} {'too low':>8}")
    print(header)
    print("-" * len(header))
    totals = Comparison(name="all")
    for path in files:
        stem = os.path.splitext(os.path.basename(path))[0]
        report = convert(path, os.devnull,
                         Settings(legato_quarters=args.legato))
        c = compare(report)
        totals.source_notes += c.source_notes
        totals.kept += c.kept
        totals.as_line += c.as_line
        totals.lost += c.lost
        totals.off_pitch += c.off_pitch
        totals.lengthened += c.lengthened
        totals.lost_too_low += c.lost_too_low
        totals.lost_too_high += c.lost_too_high
        for k, v in c.octaves.items():
            totals.octaves[k] = totals.octaves.get(k, 0) + v
        for k, v in c.onset_error.items():
            totals.onset_error[k] = totals.onset_error.get(k, 0) + v
        print(f"{stem:<18} {c.source_notes:>6} {c.kept_pct:>6.1f}% "
              f"{100*c.as_line/max(1,c.kept):>7.1f}% {c.lost:>5} "
              f"{c.in_place_pct:>8.1f}% {c.on_time_pct:>7.1f}% "
              f"{100*c.lengthened/max(1,c.kept):>7.1f}% {c.off_pitch:>9} "
              f"{c.lost_too_low:>8}")
    print("-" * len(header))
    print(f"{'ALL':<18} {totals.source_notes:>6} {totals.kept_pct:>6.1f}% "
          f"{100*totals.as_line/max(1,totals.kept):>7.1f}% {totals.lost:>5} "
          f"{totals.in_place_pct:>8.1f}% {totals.on_time_pct:>7.1f}% "
          f"{100*totals.lengthened/max(1,totals.kept):>7.1f}% "
          f"{totals.off_pitch:>9} {totals.lost_too_low:>8}")
    print("\noctave displacement of kept notes:")
    for shift in sorted(totals.octaves):
        share = 100 * totals.octaves[shift] / max(1, totals.kept)
        print(f"  {shift:+d} octave{'s' if abs(shift) != 1 else ' '}: "
              f"{totals.octaves[shift]:>7} ({share:>5.2f}%)")
    print("onset error (32nd notes), where it is not zero:")
    for err in sorted(totals.onset_error):
        if err == 0:
            continue
        print(f"  {err:+d}: {totals.onset_error[err]}")
    if totals.lost_too_high:
        print(f"{totals.lost_too_high} notes lost above the top fret")
    print("'too low' = notes lost for sitting below the lowest string; "
          "an octave fold should always rescue these, so it must be 0")
    return 1 if (totals.off_pitch or totals.lost_too_low
                 or totals.lost_too_high) else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
