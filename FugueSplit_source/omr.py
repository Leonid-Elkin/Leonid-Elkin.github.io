"""Read a PDF of sheet music into MusicXML, then into a tab.

    python omr.py score.pdf [-o out.gp5] [--pages 1 4]

Optical music recognition is done by [Audiveris](https://audiveris.github.io),
which has to be installed separately; this only drives it in batch and hands
the MusicXML it produces to the arranger. Set AUDIVERIS to the executable if
it is not in one of the usual places.

**What comes out is a draft.** On a digital-native PDF of Bach's Passacaglia
-- the friendliest case there is -- Audiveris recovered 91% of the notes, and
two misread bars threw the bar lines out from bar 126 onwards. A single-line
pedal staff came back at 99.8%; the dense manual staves at 88-91%. So a score
read this way wants proofreading before anybody plays from it, and
`fuguesplit.proof` will point at the bars to look at when part of the music
is already known.
"""

from __future__ import annotations

import argparse
import glob
import os
import shutil
import subprocess
import sys

CANDIDATES = [
    os.environ.get("AUDIVERIS", ""),
    r"C:\Program Files\Audiveris\Audiveris.exe",
    r"C:\Program Files (x86)\Audiveris\Audiveris.exe",
    "/Applications/Audiveris.app/Contents/MacOS/Audiveris",
    "audiveris",
]


def find_audiveris() -> str:
    for candidate in CANDIDATES:
        if not candidate:
            continue
        if os.path.exists(candidate):
            return candidate
        found = shutil.which(candidate)
        if found:
            return found
    raise FileNotFoundError(
        "Audiveris not found. Install it from https://audiveris.github.io "
        "and set AUDIVERIS to the executable."
    )


def recognise(pdf: str, out_dir: str, pages: list[int] | None = None) -> str:
    """Run Audiveris over `pdf` and return the MusicXML it wrote."""
    os.makedirs(out_dir, exist_ok=True)
    command = [find_audiveris(), "-batch", "-export", "-output", out_dir]
    if pages:
        command += ["-sheets"] + [str(p) for p in pages]
    command.append(pdf)
    result = subprocess.run(command, capture_output=True, text=True)
    stem = os.path.splitext(os.path.basename(pdf))[0]
    for pattern in (f"{stem}.mxl", f"{stem}*.mxl", "*.mxl"):
        hits = sorted(glob.glob(os.path.join(out_dir, pattern)))
        if hits:
            return hits[0]
    tail = (result.stderr or result.stdout or "").strip().splitlines()[-5:]
    raise RuntimeError("Audiveris produced no MusicXML:\n  " + "\n  ".join(tail))


def main(argv: list[str]) -> int:
    from fuguesplit.pipeline import Settings, convert
    from fuguesplit.cli import _print_report

    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("pdf", help="the sheet music to read")
    ap.add_argument("-o", "--out", help="output .gp5 (default: alongside the PDF)")
    ap.add_argument("--pages", nargs=2, type=int, metavar=("FIRST", "LAST"),
                    help="only these pages of the PDF")
    ap.add_argument("--xml-only", action="store_true",
                    help="stop after recognition and keep the MusicXML")
    ap.add_argument("--work", help="where to put the MusicXML "
                                   "(default: beside the PDF)")
    ap.add_argument("--like", help="a score this one continues; every shared "
                                   "note is written as that score's tab writes it")
    ap.add_argument("--tempo", type=int, default=0)
    ap.add_argument("--title")
    args = ap.parse_args(argv)

    work = args.work or os.path.dirname(os.path.abspath(args.pdf))
    pages = list(range(args.pages[0], args.pages[1] + 1)) if args.pages else None
    print(f"reading {os.path.basename(args.pdf)} ...", flush=True)
    xml = recognise(args.pdf, work, pages)
    print(f"  -> {xml}")
    if args.xml_only:
        return 0

    out = args.out or os.path.splitext(args.pdf)[0] + ".gp5"
    report = convert(xml, out, Settings(like=args.like, tempo=args.tempo,
                                        title=args.title))
    _print_report(report, out)
    print()
    print("  recognition is not proofreading: check the tab against the page.")
    return 0


if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    raise SystemExit(main(sys.argv[1:]))
