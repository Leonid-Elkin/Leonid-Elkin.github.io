"""Arrange a fetched collection and shelve the tabs where the site serves them.

    python build_shelves.py                  # every keyboard shelf
    python build_shelves.py well-tempered-clavier inventions-and-sinfonias

Takes what `fetch_tobis.py` downloaded into midi/klavier/<section>/, runs
each score through the arranger, and writes the finished .gp5 into
../bach/<shelf>/gp/ -- the folder the published page links to. A shelf
gathers the archive's sections into one heading a reader would recognise.

Metadata for each piece (bars, tempo, the size of the band) lands in
../bach/<shelf>/shelf.json, which `build_index.py` turns into the page.

Movements are not split. The archive publishes a prelude and its fugue as
one score and this keeps them that way, rather than inventing a bar to cut
at that nothing in the file marks.

Quelle: www.tobis-notenarchiv.de -- CC BY-NC-SA 4.0.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import sys
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from convert_all import COMPOSER, pick_sources, tempo_beside
from fuguesplit import check
from fuguesplit.pipeline import Settings, convert
from keyboard_titles import best_title, label_for, title_for

HERE = os.path.dirname(os.path.abspath(__file__))
# One tree per composer under fuguesplit/, the folder this lives in.
ROOT = os.path.normpath(os.path.join(HERE, os.pardir))
SITE = os.path.join(ROOT, "bach")

# Anything not listed here is Bach, which is most of it.
COMPOSER_OF = {"vivaldi-arias": "vivaldi"}


def composer_of(shelf: str) -> str:
    return COMPOSER_OF.get(shelf, "bach")


def shelf_dir(shelf: str) -> str:
    return os.path.join(ROOT, composer_of(shelf), shelf)

# shelf -> (heading, blurb, root under midi/, sections under that root).
# An empty section list takes everything under the root, however deeply the
# archive nests it; naming sections splits one collection over more than one
# shelf, which is what the keyboard works need.
SHELVES: dict[str, tuple[str, str, str, list[str]]] = {
    "well-tempered-clavier": (
        "The Well-Tempered Clavier",
        "BWV 846–893",
        "klavier",
        ["das-wohltemperierte-klavier-teil-1",
         "das-wohltemperierte-klavier-teil-2"],
    ),
    "inventions-and-sinfonias": (
        "Inventions and sinfonias", "BWV 772–801", "klavier",
        ["inventionen", "sinfonien"],
    ),
    "keyboard-suites": (
        "Suites and partitas", "BWV 806–831", "klavier",
        ["englische-suiten", "franzoesische-suiten", "partiten",
         "diverse-suiten"],
    ),
    "toccatas-and-fantasias": (
        "Toccatas and fantasias", "BWV 894–923", "klavier",
        ["toccaten-fantasien-und-praeludien", "fantasien-und-fugen"],
    ),
    "keyboard-fugues": (
        "Keyboard fugues", "BWV 944–962", "klavier",
        ["fugen", "praeludien-und-fugen"],
    ),
    "little-preludes": (
        "The little preludes", "BWV 924–943", "klavier",
        ["fuenf-kleine-praeludien", "sechs-kleine-praeludien",
         "neun-kleine-praeludien-aus-dem-klavierbuechlein-fuer-wilhelm-"
         "friedemann-bach"],
    ),
    "keyboard-variations": (
        "Airs and variations", "BWV 988–994", "klavier",
        ["arien-und-variationen"],
    ),
    "keyboard-concertos": (
        "Concertos after other masters", "BWV 972–987", "klavier",
        ["konzerte-nach-verschiedenen-meistern"],
    ),
    "keyboard-sonatas": (
        "Sonatas, duets and single pieces", "BWV 963–971", "klavier",
        ["sonaten", "duette", "einzelwerke", "sonstige-einzelwerke"],
    ),

    # Everything that is not keyboard and not already on one of the five
    # hand-built organ shelves. Each takes its whole collection.
    "lute-works": (
        "Lute works", "BWV 995–1000, 1006a", "lute", [],
    ),
    "chamber-music": (
        "Chamber music", "BWV 1001–1040", "chamber", [],
    ),
    "concertos": (
        "Concertos", "BWV 1041–1065", "concertos", [],
    ),
    "orchestral": (
        "Overtures and sinfonias", "BWV 1066–1071", "orchestral", [],
    ),
    "musical-offering": (
        "The Musical Offering", "BWV 1079", "musical-offering", [],
    ),
    "canons": (
        "Canons", "BWV 1072–1078, 1086–1087", "canons", [],
    ),
    "cantatas": (
        "Cantatas", "BWV 1–224", "vocal", ["bach-archiv-kantaten"],
    ),
    "passions-and-masses": (
        "Passions, masses and oratorios", "BWV 225–249", "vocal",
        ["passionen", "oratorien", "messen", "magnificat", "motetten"],
    ),
    "chorales-and-songs": (
        "Four-part chorales and songs", "BWV 250–524", "vocal",
        ["vierstimmige-choraele", "lieder-arien-und-quodlibet"],
    ),
    "appendix": (
        "Appendix and doubtful works", "BWV Anh.", "appendix", [],
    ),
    "deest": (
        "Works without a BWV number", "BWV deest", "deest", [],
    ),
    "additions": (
        "Additions", "Ergänzungen", "additions", [],
    ),
    "manuscripts": (
        "Notebooks, prints and manuscripts", "", "manuscripts", [],
    ),
    "organ-other": (
        "More organ works", "BWV 525–598", "organ-full", [],
    ),

    # Not Bach. Mutopia holds four Vivaldi pieces and no more; there is no
    # Vivaldi archive of Tobis's kind to draw on. See fetch_mutopia.py.
    "vivaldi-arias": (
        "Vivaldi — arias", "RV 690, RV 725", "vivaldi", [],
    ),
}

# The five shelves already on the page were built by hand from the same
# archive. A shelf listed here skips anything they already hold, so the
# organ collection contributes only what is not published yet rather than
# a second copy of 303 pieces.
ORIGINAL = ["art-of-fugue", "chorales", "fugues", "preludes-and-fugues",
            "trio-sonatas"]
AVOID = {"organ-other": ORIGINAL}


def already_published(shelves: list[str]) -> set[str]:
    """Stems those shelves hold, movement suffixes folded in."""
    import re
    held: set[str] = set()
    for shelf in shelves:
        pattern = os.path.join(SITE, shelf, "gp", "*.gp5")
        for path in glob.glob(pattern):
            stem = os.path.splitext(os.path.basename(path))[0]
            held.add(stem)
            held.add(re.sub(r"-\d+$", "", stem))
    return held


def band(report) -> str:
    """"3 guitars + bass", the way the page already describes an ensemble."""
    guitars = [p for p in report.parts if not p.name.startswith("Bass")]
    has_bass = any(p.name.startswith("Bass") for p in report.parts)
    if not guitars:
        return "bass alone" if has_bass else "no parts"
    head = "1 guitar" if len(guitars) == 1 else f"{len(guitars)} guitars"
    return head + (" + bass" if has_bass else "")


def source_dirs(root: str, sections: list[str]) -> list[str]:
    """Every folder holding scores, for the sections a shelf asked for.

    The archive nests to different depths -- the lute works sit in one
    folder, the cantatas three deep -- so each starting point is walked
    rather than assumed to be a leaf.
    """
    starts = [os.path.join(root, s) for s in sections] if sections else [root]
    found: list[str] = []
    for start in starts:
        if not os.path.isdir(start):
            continue
        for folder, _subdirs, files in os.walk(start):
            if any(f.lower().endswith((".mid", ".midi", ".xml", ".musicxml",
                                       ".mxl")) for f in files):
                found.append(folder)
    return sorted(found)


def build(shelf: str, midi_root: str) -> list[dict]:
    heading, span, root, sections = SHELVES[shelf]
    gp_dir = os.path.join(shelf_dir(shelf), "gp")
    os.makedirs(gp_dir, exist_ok=True)

    held = already_published(AVOID.get(shelf, []))
    records: list[dict] = []
    for folder in source_dirs(os.path.join(midi_root, root), sections):
        section = os.path.relpath(folder, midi_root).replace(os.sep, "/")
        for name in pick_sources(folder):
            stem = os.path.splitext(name)[0]
            if stem in held:
                continue
            src = os.path.join(folder, name)
            # One shelf gathers several folders, and the archive reuses a
            # name across them -- a movement called "Aria" under two
            # cantatas. Keep the first and qualify the rest, so nothing is
            # silently written over.
            if any(r["stem"] == stem for r in records):
                stem = f"{stem}__{os.path.basename(folder)}"
            dst = os.path.join(gp_dir, stem + ".gp5")
            settings = Settings(
                bass=True,
                title=title_for(stem),
                artist=COMPOSER,
                legato_quarters=1.0,
                tempo=tempo_beside(folder, name),
                # Ensemble music has more lines at once than a keyboard
                # piece: the first movement of the C major overture keeps
                # 5,408 of its 7,169 notes against a ceiling of five and
                # 7,131 against eight. Costs nothing where it is not
                # needed -- the band only grows while notes are still
                # being crammed into a stave's second voice, so every
                # keyboard and chamber score tested came out identical.
                max_parts=8,
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
                "title": best_title(stem, report.title),
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

    # Merge rather than replace. A collection too big to hold on disk at
    # once is fetched, arranged and cleaned a section at a time, so a later
    # run sees only part of its own sources; anything already arranged
    # whose tab is still on the shelf stays on it.
    meta_path = os.path.join(shelf_dir(shelf), "shelf.json")
    if os.path.exists(meta_path):
        with open(meta_path, encoding="utf-8") as fh:
            kept = json.load(fh).get("pieces", [])
        fresh = {r["stem"] for r in records}
        for old in kept:
            if old["stem"] in fresh:
                continue
            if os.path.exists(os.path.join(gp_dir, old["stem"] + ".gp5")):
                records.append(old)

    records.sort(key=lambda r: r["stem"])
    meta = {"shelf": shelf, "composer": composer_of(shelf),
            "heading": heading, "span": span, "pieces": records}
    with open(os.path.join(shelf_dir(shelf), "shelf.json"), "w",
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
    ap.add_argument("--src", default=os.path.join(HERE, "midi"),
                    help="where fetch_tobis.py put the collections")
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
