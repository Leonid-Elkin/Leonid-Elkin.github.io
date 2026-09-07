"""Write the new shelves into the published /fugue/ page.

    python build_index.py

Reads every ../fugue/<shelf>/shelf.json that `build_shelves.py` left and
rewrites one marked block in ../fugue/index.html. The block is delimited by
HTML comments, so running this again replaces what it wrote last time
instead of piling a second copy on top; everything the page had before the
markers -- the five hand-built organ shelves -- is left alone.

New shelves carry a GP5 link only. The per-part PDFs on the organ shelves
are made outside this repository, and the page already says of its later
shelves that they are Guitar Pro files for now.
"""

from __future__ import annotations

import argparse
import glob
import html
import io
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.normpath(os.path.join(HERE, os.pardir, "fugue"))
INDEX = os.path.join(SITE, "index.html")

BEGIN = "                <!-- shelves:begin (build_index.py) -->"
END = "                <!-- shelves:end -->"

# The order the shelves read in on the page.
ORDER = [
    "well-tempered-clavier",
    "inventions-and-sinfonias",
    "keyboard-suites",
    "toccatas-and-fantasias",
    "keyboard-fugues",
    "little-preludes",
    "keyboard-variations",
    "keyboard-concertos",
    "keyboard-sonatas",
]

CREDIT = """                <p class="setup">Bach's music is public domain. The engravings these are read
                    from come from <a href="https://tobis-notenarchiv.de/" target="_blank" rel="noopener">Tobis
                    Notenarchiv</a> (Quelle: www.tobis-notenarchiv.de) and are published there under
                    <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener">CC
                    BY-NC-SA 4.0</a>, so these arrangements carry the same licence: credit the source, keep it
                    non-commercial, share it alike. The converter is in
                    <a href="https://github.com/Leonid-Elkin/Leonid-Elkin.github.io/tree/main/FugueSplit_source">FugueSplit_source</a>
                    if you would like to run it over something of your own.</p>"""


def piece_html(shelf: str, piece: dict) -> str:
    gp = f"/fugue/{shelf}/gp/{piece['stem']}.gp5"
    meta = f"{piece['band']} &middot; {piece['bars']} bars"
    if piece.get("tempo"):
        meta += f" &middot; {piece['tempo']} bpm"
    return f"""                        <li>
                            <span class="piece-idx mono">{html.escape(piece['label'])}</span>
                            <span class="piece-name">{html.escape(piece['title'])}</span>
                            <span class="piece-meta mono">{meta}</span>
                            <span class="piece-get">
                                <a class="get-gp" href="{gp}" title="Guitar Pro file, every part together">GP5</a>
                            </span>
                        </li>"""


def shelf_html(meta: dict) -> str:
    shelf = meta["shelf"]
    pieces = meta["pieces"]
    if not pieces:
        return ""
    count = f"{len(pieces)} piece" + ("" if len(pieces) == 1 else "s")
    head = f"""
                <div class="set-head">
                    <h2>{html.escape(meta['heading'])}</h2>
                    <span class="mono">{html.escape(meta['span'])} &middot; {count}</span>
                </div>
                <ul class="pieces">"""
    body = "\n".join(piece_html(shelf, p) for p in pieces)
    return head + "\n" + body + "\n                </ul>\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--index", default=INDEX)
    args = ap.parse_args(argv)

    metas = []
    for path in sorted(glob.glob(os.path.join(SITE, "*", "shelf.json"))):
        with io.open(path, encoding="utf-8") as fh:
            metas.append(json.load(fh))
    rank = {name: i for i, name in enumerate(ORDER)}
    metas.sort(key=lambda m: (rank.get(m["shelf"], 999), m["shelf"]))
    if not metas:
        print("no shelf.json found; run build_shelves.py first", file=sys.stderr)
        return 1

    block = BEGIN + "\n" + "".join(shelf_html(m) for m in metas) + END

    with io.open(args.index, encoding="utf-8") as fh:
        page = fh.read()

    if BEGIN in page and END in page:
        before = page[:page.index(BEGIN)]
        after = page[page.index(END) + len(END):]
        page = before + block + after
    else:
        # First run: land the block after the last hand-built shelf, which
        # is the last </ul> before the closing note, and put the licence
        # credit in place of that note.
        anchor = page.index('                <p class="setup">Bach\'s music is public domain')
        tail = page.index("</p>", anchor) + len("</p>")
        page = page[:anchor] + block + "\n\n" + CREDIT + page[tail:]

    with io.open(args.index, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(page)

    total = sum(len(m["pieces"]) for m in metas)
    print(f"{len(metas)} shelves, {total} pieces written into {args.index}")
    for m in metas:
        print(f"  {m['shelf']:<26} {len(m['pieces']):>4}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
