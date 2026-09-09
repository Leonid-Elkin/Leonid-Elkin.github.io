"""Describe a shelf from the tabs already on it, without re-arranging.

The five organ shelves were built by hand long before build_shelves.py
existed, and their sources are not kept, so there is no report to read
their bar counts and ensembles off. A .gp5 knows all of it -- how many
tracks, how many bars, what tempo -- so the shelf.json is recovered from
the files themselves. That puts every shelf on the page through one
generator, which is what makes the octave-dropped readings in 8ve/
reachable: they were linked from nowhere before.

    python shelf_from_tabs.py chorales fugues ...
    python shelf_from_tabs.py --all-missing
"""

from __future__ import annotations

import argparse
import glob
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import guitarpro

from keyboard_titles import best_title, label_for

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.normpath(os.path.join(HERE, os.pardir, "bach"))

# Headings for the shelves that predate build_shelves.py.
KNOWN = {
    "preludes-and-fugues": ("Organ preludes and fugues", "BWV 531–552"),
    "art-of-fugue": ("The Art of Fugue", "BWV 1080"),
    "fugues": ("Fugues and other free works", "BWV 531–582"),
    "trio-sonatas": ("Trio sonatas", "BWV 525–530"),
    "chorales": ("Chorale settings", "BWV 599–771"),
}


def describe(path: str) -> dict | None:
    """Bar count, tempo and ensemble, read off a finished tab."""
    try:
        song = guitarpro.parse(path)
    except Exception:                                   # noqa: BLE001
        return None
    if not song.tracks:
        return None
    stem = os.path.splitext(os.path.basename(path))[0]
    guitars = [t for t in song.tracks if not t.name.lower().startswith("bass")]
    has_bass = len(guitars) != len(song.tracks)
    if guitars:
        band = ("1 guitar" if len(guitars) == 1 else f"{len(guitars)} guitars")
        band += " + bass" if has_bass else ""
    else:
        band = "bass alone"
    return {
        "stem": stem,
        "label": label_for(stem),
        "title": best_title(stem, song.title),
        "band": band,
        "bars": len(song.tracks[0].measures),
        "tempo": int(song.tempo or 0),
        # No source to compare against, so these stay honest rather than
        # invented: the arrangement is what it is, and nothing here claims
        # a note count it cannot check.
        "source_notes": 0,
        "written_notes": sum(len(b.notes) for t in song.tracks
                             for m in t.measures for v in m.voices
                             for b in v.beats),
        "read_as": "organ",
        "broken": 0,
        "section": "recovered from the published tabs",
    }


def build(shelf: str) -> int:
    gp_dir = os.path.join(SITE, shelf, "gp")
    if not os.path.isdir(gp_dir):
        print(f"  {shelf}: no gp/ folder")
        return 0
    heading, span = KNOWN.get(shelf, (shelf.replace("-", " ").capitalize(), ""))
    pieces = []
    for path in sorted(glob.glob(os.path.join(gp_dir, "*.gp5"))):
        rec = describe(path)
        if rec:
            pieces.append(rec)
    pieces.sort(key=lambda r: r["stem"])
    meta = {"shelf": shelf, "heading": heading, "span": span, "pieces": pieces}
    with io.open(os.path.join(SITE, shelf, "shelf.json"), "w",
                 encoding="utf-8", newline="\n") as fh:
        json.dump(meta, fh, indent=1, ensure_ascii=False)
    print(f"  {shelf:<24}{len(pieces):>5} pieces")
    return len(pieces)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("shelves", nargs="*")
    ap.add_argument("--all-missing", action="store_true",
                    help="every shelf under bach/ with tabs but no shelf.json")
    args = ap.parse_args(argv)

    wanted = list(args.shelves)
    if args.all_missing:
        for entry in sorted(os.listdir(SITE)):
            if not os.path.isdir(os.path.join(SITE, entry)):
                continue
            if os.path.exists(os.path.join(SITE, entry, "shelf.json")):
                continue
            if glob.glob(os.path.join(SITE, entry, "gp", "*.gp5")):
                wanted.append(entry)
    if not wanted:
        print("nothing to do")
        return 0
    total = sum(build(s) for s in wanted)
    print(f"\n{total} pieces described across {len(wanted)} shelves")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
