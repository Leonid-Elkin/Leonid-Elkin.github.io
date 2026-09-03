"""Audit a finished arrangement for lines that were broken up.

The failure this looks for is the most audible way an arrangement can go
wrong: a part falls silent in the middle of a passage its own voice is
still playing, and the note it should have played turns up on somebody
else's stave. In the tab that reads as a rest punched into a flowing run,
with the missing note sounding on another guitar.

A `Hole` is one such moment. `flowing` marks the ones that land inside a
run -- the part was playing just before and picks up again just after --
which are the ones a listener actually notices; a hole at the very start
or end of an entry is far less obtrusive.

    python -m fuguesplit.check midi/bach-preludes-and-fugues
"""

from __future__ import annotations

import bisect
import os
from dataclasses import dataclass

from . import rhythm

# How close the surrounding notes must be for a hole to count as sitting
# inside a flowing passage rather than between two separate entries.
FLOW_GAP = 2 * rhythm.GP_QUARTER


@dataclass
class Hole:
    """One note missing from the part that should have played it."""

    part: str
    bar: int
    beat: float
    pitch: int
    taken_by: str | None      # the part that played it instead; None = lost
    flowing: bool             # does it sit inside a run of that part's own?

    def __str__(self) -> str:
        where = f"-> {self.taken_by}" if self.taken_by else "dropped"
        mark = "*" if self.flowing else " "
        return (f" {mark} bar {self.bar:>4} beat {self.beat:>5.2f}  "
                f"{self.part:<10} pitch {self.pitch:>3}  {where}")


def _overlaps(spans, starts, lo, hi) -> bool:
    """Is the part sounding at any point in [lo, hi)?"""
    at = bisect.bisect_left(starts, lo)
    if at < len(spans) and spans[at][0] < hi:
        return True
    if at > 0 and spans[at - 1][1] > lo:
        return True
    return False


def _in_a_run(spans, starts, lo, hi) -> bool:
    """Does the part play just before and just after this gap?"""
    at = bisect.bisect_left(starts, lo)
    before = at > 0 and lo - spans[at - 1][1] <= FLOW_GAP
    after = at < len(spans) and spans[at][0] - hi <= FLOW_GAP
    return before and after


def audit(report) -> list[Hole]:
    """Every note a part's own voice played that the part did not.

    Only parts that own a source voice outright are audited -- see below.
    A file whose voices had to be inferred returns nothing, because there
    is no ground truth there to check against.
    """
    score, parts = report.source, report.arranged
    if score is None or not parts:
        return []

    # Where each source note ended up, by its stable id.
    home: dict[int, str] = {}
    for part in parts:
        for group in (part.notes, part.extras, part.second):
            for note in group:
                if note.uid >= 0:
                    home[note.uid] = part.name

    bars = rhythm.build_bars(score, score.end_tick)
    bar_starts = [b.start for b in bars]

    # Which source voice each part represents: the track most of its notes
    # come from. This is only meaningful when the source separates the
    # voices and each part ended up with a different one; where the voices
    # had to be inferred from a one- or two-track file, several parts share
    # a track and "the note went to the wrong part" means nothing. Say
    # nothing rather than something false.
    owner: dict[str, int] = {}
    for part in parts:
        counts: dict[int, int] = {}
        for note in part.notes:
            counts[note.src_track] = counts.get(note.src_track, 0) + 1
        if counts:
            owner[part.name] = max(counts, key=counts.get)
    claimed: dict[int, int] = {}
    for track in owner.values():
        claimed[track] = claimed.get(track, 0) + 1

    holes: list[Hole] = []
    for part in parts:
        track = owner.get(part.name)
        if track is None or claimed[track] > 1:
            continue

        spans = sorted((n.start, n.end) for n in part.notes)
        starts = [s for s, _e in spans]

        for note in score.notes:
            if note.src_track != track or home.get(note.uid) == part.name:
                continue
            lo = rhythm.to_gp(note.start, score.ppq)
            hi = rhythm.to_gp(note.end, score.ppq)
            # If the part is playing here it did not fall silent; the note
            # collided with something rather than leaving a rest.
            if _overlaps(spans, starts, lo, hi):
                continue
            index = max(0, bisect.bisect_right(bar_starts, lo) - 1)
            holes.append(Hole(
                part=part.name,
                bar=bars[index].index + 1,
                beat=(lo - bars[index].start) / rhythm.GP_QUARTER + 1,
                pitch=note.pitch,
                taken_by=home.get(note.uid),
                flowing=_in_a_run(spans, starts, lo, hi),
            ))
    holes.sort(key=lambda h: (h.bar, h.beat, h.part))
    return holes


@dataclass
class Gap:
    """A rest punched into a part's flowing passage.

    `taken_by` is the part that carries the music across the rest at a
    comparable pitch -- when it is set, a listener following this part's
    line hears it break off and reappear on another instrument.
    """

    part: str
    bar: int
    beat: float
    rest_quarters: float
    from_pitch: int
    taken_by: str | None
    to_pitch: int | None

    def __str__(self) -> str:
        where = (f"-> {self.taken_by} ({self.to_pitch})"
                 if self.taken_by else "(nobody continues it)")
        return (f"   bar {self.bar:>4} beat {self.beat:>5.2f}  "
                f"{self.part:<11} rests {self.rest_quarters:>4.2f}q after "
                f"{self.from_pitch:>3}  {where}")


def gaps(report, max_rest_quarters: float = 2.0,
         near: int = 12) -> list[Gap]:
    """Rests that interrupt a run, and who picks the music up.

    This is the marker: a part playing a flowing passage stops for less
    than `max_rest_quarters`, and another part is sounding inside that
    rest within `near` semitones of where this part left off. Bach's own
    rests are included -- the point is not whether the engraving rests but
    whether the *listener's* line survives on one instrument.
    """
    score, parts = report.source, report.arranged
    if score is None or not parts:
        return []
    limit = max_rest_quarters * rhythm.GP_QUARTER

    bars = rhythm.build_bars(score, score.end_tick)
    bar_starts = [b.start for b in bars]

    everything = sorted((n.start, n.end, n.pitch, p.name)
                        for p in parts for n in p.notes)
    all_starts = [x[0] for x in everything]

    found: list[Gap] = []
    for part in parts:
        ordered = sorted(part.notes, key=lambda n: n.start)
        for first, second in zip(ordered, ordered[1:]):
            rest = second.start - first.end
            if rest <= 0 or rest > limit:
                continue
            lo = bisect.bisect_left(all_starts, first.end)
            hi = bisect.bisect_left(all_starts, second.start)
            picked = [x for x in everything[lo:hi]
                      if x[3] != part.name and abs(x[2] - first.pitch) <= near]
            picked.sort(key=lambda x: abs(x[2] - first.pitch))
            index = max(0, bisect.bisect_right(bar_starts, first.end) - 1)
            found.append(Gap(
                part=part.name,
                bar=bars[index].index + 1,
                beat=(first.end - bars[index].start) / rhythm.GP_QUARTER + 1,
                rest_quarters=rest / rhythm.GP_QUARTER,
                from_pitch=first.pitch,
                taken_by=picked[0][3] if picked else None,
                to_pitch=picked[0][2] if picked else None,
            ))
    found.sort(key=lambda g: (g.bar, g.beat))
    return found


def broken(found: list[Gap]) -> int:
    """How many of those rests hand the line to another instrument."""
    return sum(1 for g in found if g.taken_by is not None)


def _auditable(report) -> bool:
    """Does this arrangement have per-part ground truth to check?"""
    owner = {}
    for part in report.arranged:
        counts = {}
        for note in part.notes:
            counts[note.src_track] = counts.get(note.src_track, 0) + 1
        if counts:
            owner[part.name] = max(counts, key=counts.get)
    return len(set(owner.values())) == len(owner) and len(owner) > 1


def tally(holes: list[Hole]) -> tuple[int, int, int]:
    """(total, inside a run, lost altogether)."""
    return (len(holes),
            sum(1 for h in holes if h.flowing),
            sum(1 for h in holes if h.taken_by is None))


def main(argv: list[str]) -> int:
    import argparse

    from .pipeline import Settings, convert

    for stream in (os.sys.stdout, os.sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, OSError):
            pass

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("paths", nargs="+", help=".mid files or folders of them")
    ap.add_argument("--detail", type=int, default=0, metavar="N",
                    help="also list the first N holes of each piece")
    ap.add_argument("--flowing-only", action="store_true",
                    help="list only holes sitting inside a run")
    args = ap.parse_args(argv)

    files = []
    for path in args.paths:
        if os.path.isdir(path):
            files += [os.path.join(path, f) for f in sorted(os.listdir(path))
                      if f.lower().endswith((".mid", ".midi"))]
        else:
            files.append(path)
    if not files:
        print("no MIDI files given", file=os.sys.stderr)
        return 2

    header = (f"{'file':<18} {'notes':>7} {'rests':>6} {'broken':>7} "
              f"{'per 100':>8} {'misplaced':>10}")
    print(header)
    print("-" * len(header))
    grand_broken = grand_notes = 0
    for path in files:
        stem = os.path.splitext(os.path.basename(path))[0]
        report = convert(path, os.devnull, Settings())
        found = gaps(report)
        cut = broken(found)
        holes = audit(report)
        misplaced = str(len(holes)) if holes or _auditable(report) else "-"
        grand_broken += cut
        grand_notes += report.source_notes
        rate = 100 * cut / max(1, report.source_notes)
        print(f"{stem:<18} {report.source_notes:>7} {len(found):>6} "
              f"{cut:>7} {rate:>8.2f} {misplaced:>10}")
        if args.detail:
            shown = [g for g in found
                     if g.taken_by is not None or not args.flowing_only]
            for gap in shown[:args.detail]:
                print(gap)
    print("-" * len(header))
    print(f"{grand_broken} broken runs over {grand_notes} notes "
          f"({100 * grand_broken / max(1, grand_notes):.2f} per 100)")
    print("'broken' = a rest inside a run with another instrument taking "
          "the line over: the marker")
    print("'misplaced' = notes a part's own voice played that it did not "
          "get; should always be 0. Only per-voice sources can be checked "
          "this way; '-' means the voices had to be inferred")
    return 1 if grand_broken else 0


if __name__ == "__main__":
    raise SystemExit(main(os.sys.argv[1:]))
