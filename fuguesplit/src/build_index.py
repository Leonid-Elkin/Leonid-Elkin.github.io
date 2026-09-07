"""Write the new shelves into the published /fuguesplit/ page.

    python build_index.py

Reads every ../bach/<shelf>/shelf.json that `build_shelves.py` left and
rewrites one marked block in ../index.html. The block is delimited by
HTML comments, so running this again replaces what it wrote last time
instead of piling a second copy on top.

Every shelf on the page is generated now, the five organ ones included --
they were hand-written HTML until shelf_from_tabs.py recovered their
metadata from the tabs themselves. That is what makes the octave-dropped
readings in 8ve/ reachable; they were linked from nowhere before. Where a
piece has per-part PDFs those are linked too, so nothing the hand-written
page offered is lost.
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
SITE = os.path.normpath(os.path.join(HERE, os.pardir, "bach"))
INDEX = os.path.normpath(os.path.join(HERE, os.pardir, "index.html"))

BEGIN = "                <!-- shelves:begin (build_index.py) -->"
END = "                <!-- shelves:end -->"

# The order the shelves read in on the page.
ORDER = [
    # The organ works first: they are what the page opened with.
    "preludes-and-fugues",
    "art-of-fugue",
    "fugues",
    "trio-sonatas",
    "chorales",
    "organ-other",
    "well-tempered-clavier",
    "inventions-and-sinfonias",
    "keyboard-suites",
    "toccatas-and-fantasias",
    "keyboard-fugues",
    "little-preludes",
    "keyboard-variations",
    "keyboard-concertos",
    "keyboard-sonatas",
    "lute-works",
    "chamber-music",
    "concertos",
    "orchestral",
    "musical-offering",
    "canons",
    "cantatas",
    "passions-and-masses",
    "chorales-and-songs",
    "appendix",
    "deest",
    "additions",
    "manuscripts",
]

CREDIT = """                <p class="setup">Bach's music is public domain. The engravings these are read
                    from come from <a href="https://tobis-notenarchiv.de/" target="_blank" rel="noopener">Tobis
                    Notenarchiv</a> (Quelle: www.tobis-notenarchiv.de) and are published there under
                    <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener">CC
                    BY-NC-SA 4.0</a>, so these arrangements carry the same licence: credit the source, keep it
                    non-commercial, share it alike. The converter is in
                    <a href="https://github.com/Leonid-Elkin/Leonid-Elkin.github.io/tree/main/fuguesplit/src">fuguesplit/src</a>
                    if you would like to run it over something of your own.</p>"""


def piece_html(shelf: str, piece: dict) -> str:
    gp = f"/fuguesplit/bach/{shelf}/gp/{piece['stem']}.gp5"
    # Some shelves also carry an octave-dropped reading, made by
    # octave_down.py and kept in 8ve/ beside the straight one. Link it
    # where it exists rather than leaving 356 files reachable from nowhere,
    # which is what the old parallel transposed/ folder amounted to.
    low = os.path.join(SITE, shelf, "8ve", piece["stem"] + ".gp5")
    octave = (f'\n                                <a class="get-gp" '
              f'href="/fuguesplit/bach/{shelf}/8ve/{piece["stem"]}.gp5" '
              f'title="the same arrangement with over-high parts dropped an '
              f'octave">8VE</a>') if os.path.exists(low) else ""

    # The organ shelves carry a PDF per player, engraved elsewhere. They
    # predate this generator and must not be dropped by it.
    parts = []
    for pdf in sorted(glob.glob(os.path.join(
            SITE, shelf, "pdf", glob.escape(piece["stem"]) + "-*.pdf"))):
        suffix = os.path.splitext(os.path.basename(pdf))[0][len(piece["stem"]) + 1:]
        name = suffix.replace("guitar-", "").upper()
        parts.append(
            f'\n                                <a class="get-part" '
            f'href="/fuguesplit/bach/{shelf}/pdf/{os.path.basename(pdf)}" '
            f'title="{suffix.replace("-", " ")} &mdash; PDF">{name}</a>')
    meta = f"{piece['band']} &middot; {piece['bars']} bars"
    if piece.get("tempo"):
        meta += f" &middot; {piece['tempo']} bpm"
    # Much of the archive has no title beyond its catalogue number, and the
    # number is already in the column to the left. Printing it twice reads
    # as a mistake, so the name is simply left empty.
    name = piece["title"]
    if name.strip() == piece["label"].strip():
        name = ""
    return f"""                        <li>
                            <span class="piece-idx mono">{html.escape(piece['label'])}</span>
                            <span class="piece-name">{html.escape(name)}</span>
                            <span class="piece-meta mono">{meta}</span>
                            <span class="piece-get">{"".join(parts)}
                                <a class="get-gp" href="{gp}" title="Guitar Pro file, every part together">GP5</a>{octave}
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

    first_shelf = page.find('                <div class="set-head">')
    if BEGIN in page and END in page:
        # Everything from the first shelf to the end marker is ours now:
        # the five organ shelves were hand-written HTML, and once they have
        # a shelf.json they would otherwise appear twice on the page.
        start = first_shelf if 0 <= first_shelf < page.index(BEGIN) else page.index(BEGIN)
        page = page[:start] + block + page[page.index(END) + len(END):]
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
