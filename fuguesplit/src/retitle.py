"""Re-name what is already shelved, without arranging it again.

The titles came from the engravings, and most of the archive outside the
keyboard works has none: the field holds "BWV 1082 - S. #" -- a page
marker, Seite -- or just the filename. That was 1,886 of 2,441 pieces
reading as gibberish on the page. This rewrites the titles and labels in
every shelf.json from the catalogue rules in keyboard_titles, which is a
metadata change only; not a note is touched.

    python retitle.py            # every shelf
    python retitle.py cantatas
"""

from __future__ import annotations

import argparse
import glob
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from keyboard_titles import best_title, label_for

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, os.pardir))
SITE = ROOT


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("shelves", nargs="*", help="default: all of them")
    args = ap.parse_args(argv)

    paths = sorted(glob.glob(os.path.join(ROOT, "*", "*", "shelf.json")))
    if args.shelves:
        wanted = set(args.shelves)
        paths = [p for p in paths
                 if os.path.basename(os.path.dirname(p)) in wanted]

    changed = total = 0
    for path in paths:
        with io.open(path, encoding="utf-8") as fh:
            meta = json.load(fh)
        touched = 0
        for piece in meta["pieces"]:
            total += 1
            # The old title is only a hint now: best_title ignores it when
            # it is a placeholder or the filename.
            new = best_title(piece["stem"], piece.get("title"))
            new_label = label_for(piece["stem"])
            if new != piece.get("title") or new_label != piece.get("label"):
                piece["title"] = new
                piece["label"] = new_label
                touched += 1
        if touched:
            with io.open(path, "w", encoding="utf-8", newline="\n") as fh:
                json.dump(meta, fh, indent=1, ensure_ascii=False)
        changed += touched
        print(f"  {meta['shelf']:<26}{touched:>5} renamed of {len(meta['pieces'])}")
    print(f"\n{changed} of {total} pieces renamed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
