"""Arrange a fetched collection and shelve the tabs where the site serves them.

    python build_shelves.py                  # every keyboard shelf
    python build_shelves.py well-tempered-clavier inventions-and-sinfonias

Takes what `fetch_tobis.py` downloaded into midi/klavier/<section>/, runs
each score through the arranger, and writes the finished .gp5 into
../fugue/<shelf>/gp/ -- the folder the published page links to. A shelf
gathers the archive's sections into one heading a reader would recognise.

Metadata for each piece (bars, tempo, the size of the band) lands in
../fugue/<shelf>/shelf.json, which `build_index.py` turns into the page.

Movements are not split. The archive publishes a prelude and its fugue as
one score and this keeps them that way, rather than inventing a bar to cut
at that nothing in the file marks.

Quelle: www.tobis-notenarchiv.de -- CC BY-NC-SA 4.0.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from convert_all import COMPOSER, pick_sources, tempo_beside
from fuguesplit import check
from fuguesplit.pipeline import Settings, convert
from keyboard_titles import label_for, title_for

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.normpath(os.path.join(HERE, os.pardir, "fugue"))

# shelf -> (heading, blurb, the archive sections it gathers)
SHELVES: dict[str, tuple[str, str, list[str]]] = {
    "well-tempered-clavier": (
        "The Well-Tempered Clavier",
        "BWV 846–893",
        ["das-wohltemperierte-klavier-teil-1",
         "das-wohltemperierte-klavier-teil-2"],
    ),
    "inventions-and-sinfonias": (
        "Inventions and sinfonias",
        "BWV 772–801",
        ["inventionen", "sinfonien"],
    ),
    "keyboard-suites": (
        "Suites and partitas",
        "BWV 806–831",
        ["englische-suiten", "franzoesische-suiten", "partiten",
         "diverse-suiten"],
    ),
    "toccatas-and-fantasias": (
        "Toccatas and fantasias",
        "BWV 894–923",
        ["toccaten-fantasien-und-praeludien", "fantasien-und-fugen"],
    ),
    "keyboard-fugues": (
        "Keyboard fugues",
        "BWV 944–962",
        ["fugen", "praeludien-und-fugen"],
    ),
    "little-preludes": (
        "The little preludes",
        "BWV 924–943",
        ["fuenf-kleine-praeludien", "sechs-kleine-praeludien",
         "neun-kleine-praeludien-aus-dem-klavierbuechlein-fuer-wilhelm-"
         "friedemann-bach"],
    ),
    "keyboard-variations": (
        "Airs and variations",
        "BWV 988–994",
        ["arien-und-variationen"],
    ),
    "keyboard-concertos": (
        "Concertos after other masters",
        "BWV 972–987",
        ["konzerte-nach-verschiedenen-meistern"],
    ),
    "keyboard-sonatas": (
        "Sonatas, duets and single pieces",
        "BWV 963–971",
        ["sonaten", "duette", "einzelwerke", "sonstige-einzelwerke"],
    ),
}


def band(report) -> str:
    """"3 guitars + bass", the way the page already describes an ensemble."""
    guitars = [p for p in report.parts if not p.name.startswith("Bass")]
    has_bass = any(p.name.startswith("Bass") for p in report.parts)
    if not guitars:
        return "bass alone" if has_bass else "no parts"
    head = "1 guitar" if len(guitars) == 1 else f"{len(guitars)} guitars"
    return head + (" + bass" if has_bass else "")


def build(shelf: str, src_root: str, pause_on_fail: bool = False) -> list[dict]:
    heading, span, sections = SHELVES[shelf]
    gp_dir = os.path.join(SITE, shelf, "gp")
    os.makedirs(gp_dir, exist_ok=True)

    records: list[dict] = []
    for section in sections:
        folder = os.path.join(src_root, section)
        if not os.path.isdir(folder):
            print(f"  (no {section})")
            continue
        for name in pick_sources(folder):
            stem = os.path.splitext(name)[0]
            src = os.path.join(folder, name)
            dst = os.path.join(gp_dir, stem + ".gp5")
            settings = Settings(
                bass=True,
                title=title_for(stem),
                artist=COMPOSER,
                legato_quarters=1.0,
                tempo=tempo_beside(folder, name),
            )
            try:
                report = convert(src, dst, settings)
            except Exception as exc:                        # noqa: BLE001
                print(f"  {stem:<14} FAILED {type(exc).__name__}: {exc}")
                if os.environ.get("FUGUESPLIT_DEBUG"):
                    traceback.print_exc()
                continue
            records.append({
                "stem": stem,
                "label": label_for(stem),
                "title": title_for(stem) or report.title or stem,
                "band": band(report),
                "bars": report.bars,
                "tempo": report.tempo,
                "source_notes": report.source_notes,
                "written_notes": report.written_notes,
                "read_as": report.read_as,
                "broken": check.broken(check.gaps(report)),
                "section": section,
            })
            kept = 100 * report.written_notes / max(1, report.source_notes)
            print(f"  {stem:<14} {report.bars:>4} bars  {kept:>5.1f}%  "
                  f"{records[-1]['band']}")

    records.sort(key=lambda r: r["stem"])
    meta = {"shelf": shelf, "heading": heading, "span": span,
            "pieces": records}
    with open(os.path.join(SITE, shelf, "shelf.json"), "w",
              encoding="utf-8") as fh:
        json.dump(meta, fh, indent=1, ensure_ascii=False)
    return records


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, OSError):
            pass

    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("shelves", nargs="*", help="default: all of them")
    ap.add_argument("--src", default=os.path.join(HERE, "midi", "klavier"))
    args = ap.parse_args(argv)

    wanted = args.shelves or list(SHELVES)
    unknown = [s for s in wanted if s not in SHELVES]
    if unknown:
        print(f"unknown shelf: {', '.join(unknown)}", file=sys.stderr)
        return 1

    grand = 0
    for shelf in wanted:
        print(f"\n{shelf}")
        made = build(shelf, args.src)
        grand += len(made)
        print(f"  -> {len(made)} tabs")
    print(f"\n{grand} tabs written under {SITE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
