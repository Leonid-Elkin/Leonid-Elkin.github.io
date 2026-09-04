"""Check a recognised score against music that is already known.

Optical music recognition gets most of the notes and then, somewhere, a
misread rest or time signature knocks the bar lines out of step and
everything after it lands in the wrong place. The errors are not spread
evenly, so an overall percentage is no help in finding them.

When part of the music is already known, they can be found exactly. A
completion of an unfinished fugue is the case this was written for: its
first 239 bars *are* the torso, note for note, so every disagreement
there is a recognition error and nothing else. Fix those and the same
misreadings in the new material are usually the same misreadings.

    python -m fuguesplit.proof recognised.mxl --against torso.mid

Reports, bar by bar, what the known score has that the recognised one
does not; and the bar where the two stop being in step at all, which is
the one to open in a notation editor first.
"""

from __future__ import annotations

import bisect
import collections
import os
from dataclasses import dataclass, field

from . import rhythm


@dataclass
class BarReport:
    number: int
    known: int = 0          # notes the known score has here
    found: int = 0          # of those, ones the recognised score also has
    extra: int = 0          # notes the recognised score has that it should not

    @property
    def missed(self) -> int:
        return self.known - self.found

    @property
    def share(self) -> float:
        return self.found / self.known if self.known else 1.0


@dataclass
class Proof:
    bars: list[BarReport] = field(default_factory=list)
    drift_at: int | None = None     # first bar of a sustained collapse
    offset: int = 0                 # ticks the recognised score was shifted by

    @property
    def known(self) -> int:
        return sum(b.known for b in self.bars)

    @property
    def found(self) -> int:
        return sum(b.found for b in self.bars)

    def summary(self) -> str:
        if not self.known:
            return "nothing to check against"
        line = (f"{self.found} of {self.known} known notes recognised "
                f"({100 * self.found / self.known:.1f}%)")
        if self.drift_at:
            line += f"; the bar lines go out of step at bar {self.drift_at}"
        return line


def proof(recognised, known, upto_bar: int | None = None,
          collapse: float = 0.5, run: int = 4) -> Proof:
    """Compare two readings of the same music, bar by bar.

    Both are matched on (onset, pitch) after lining up where each score's
    music begins -- a page of recognition often gains or loses a rest at
    the very front, and that is not an error worth reporting on its own.

    `drift_at` is the first bar of `run` consecutive bars that agree less
    than `collapse`: past that the two are no longer measuring the same
    beat, and comparing them bar by bar stops meaning anything.
    """
    got = _events(recognised)
    want = _events(known)
    first = lambda rows: rows[0][0] if rows else 0
    offset = first(got) - first(want)

    bars = rhythm.build_bars(known, known.end_tick)
    if upto_bar:
        bars = bars[:upto_bar]

    out = Proof(offset=offset)
    misses = 0
    for bar in bars:
        report = BarReport(number=bar.index + 1)
        here = collections.Counter(_slice(want, bar.start, bar.end))
        theirs = collections.Counter(
            _slice(got, bar.start + offset, bar.end + offset)
        )
        report.known = sum(here.values())
        report.found = sum((here & theirs).values())
        report.extra = sum((theirs - here).values())
        out.bars.append(report)

        if report.known and report.share < collapse:
            misses += 1
            if misses >= run and out.drift_at is None:
                out.drift_at = report.number - run + 1
        else:
            misses = 0
    return out


def _events(score) -> list[tuple[int, int]]:
    """(onset in Guitar Pro ticks, pitch), in time order."""
    return sorted((rhythm.to_gp(n.start, score.ppq), n.pitch)
                  for n in score.notes)


def _slice(rows: list[tuple[int, int]], lo: int, hi: int) -> list[tuple[int, int]]:
    """The events starting inside [lo, hi), keyed by offset within the bar."""
    left = bisect.bisect_left(rows, (lo, -1))
    right = bisect.bisect_left(rows, (hi, -1))
    return [(tick - lo, pitch) for tick, pitch in rows[left:right]]


def main(argv: list[str]) -> int:
    import argparse

    from .pipeline import read_source

    for stream in (os.sys.stdout, os.sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, OSError):
            pass

    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("recognised", help="the score to check (.mxl/.xml/.mid)")
    ap.add_argument("--against", required=True,
                    help="the score whose music is already known")
    ap.add_argument("--bars", type=int,
                    help="only check this many bars (the shared opening)")
    ap.add_argument("--detail", type=int, default=12,
                    help="how many of the worst bars to list (default 12)")
    args = ap.parse_args(argv)

    result = proof(read_source(args.recognised), read_source(args.against),
                   args.bars)
    print(f"{os.path.basename(args.recognised)} against "
          f"{os.path.basename(args.against)}")
    print(f"  {result.summary()}")

    wrong = [b for b in result.bars if b.missed or b.extra]
    if result.drift_at:
        wrong = [b for b in wrong if b.number < result.drift_at]
        print(f"  up to that point, {len(wrong)} bars disagree")
    for bar in sorted(wrong, key=lambda b: (-b.missed, b.number))[:args.detail]:
        print(f"    bar {bar.number:>4}: {bar.missed} of {bar.known} notes "
              f"missing, {bar.extra} not in the original")
    if len(wrong) > args.detail:
        print(f"    ... and {len(wrong) - args.detail} more")
    return 0 if result.found == result.known else 1


if __name__ == "__main__":
    raise SystemExit(main(os.sys.argv[1:]))
