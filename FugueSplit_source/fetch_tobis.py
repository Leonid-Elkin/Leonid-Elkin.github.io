"""Fetch Bach engravings from Tobis Notenarchiv into midi/.

    python fetch_tobis.py                 # the keyboard works
    python fetch_tobis.py klavier lute    # named collections only
    python fetch_tobis.py --list          # what each collection holds

The sources are not kept in the repository -- they are somebody else's
transcriptions, and the tabs are regenerable from them -- so this is how
they come back. Each piece is offered as a `.zip` holding one MusicXML
engraving and as a `.mid`; both are taken, because the engraving is the
better score and the edition carries no tempo, which the MIDI does. See
"Reading an engraving" in the README.

Quelle: www.tobis-notenarchiv.de, whose scores are published under
CC BY-NC-SA 4.0. Anything derived from them carries that licence too:
credit the source, keep it non-commercial, share it alike.
"""

from __future__ import annotations

import argparse
import io
import os
import re
import sys
import time
import urllib.error
import urllib.request
import zipfile

BASE = "https://tobis-notenarchiv.de/wp/bach-archiv/instrumentalwerke/"
UA = "Mozilla/5.0 (compatible; FugueSplit source fetch)"
HERE = os.path.dirname(os.path.abspath(__file__))

# Which index pages to walk, and the folder each lands in. Every page below
# is a list of pieces; the crawler takes the download links off it.
COLLECTIONS = {
    # name          page under bach-archiv/            folder under midi/
    "all": ("", "bach"),
    "instrumental": ("instrumentalwerke/", "instrumental"),
    "vocal": ("vokalwerke/", "vocal"),
    "klavier": ("instrumentalwerke/werke-fuer-klavier/", "klavier"),
    "organ": ("instrumentalwerke/orgelwerke/", "organ-full"),
    "lute": ("instrumentalwerke/werke-fuer-laute/", "lute"),
    "chamber": ("instrumentalwerke/kammermusik/", "chamber"),
    "concertos": ("instrumentalwerke/instrumentalkonzerte/", "concertos"),
    "orchestral": ("instrumentalwerke/ouvertueren-und-sinfonie/", "orchestral"),
    "offering": ("instrumentalwerke/musikalisches-opfer/", "musical-offering"),
    "canons": ("instrumentalwerke/kanons/", "canons"),
    "art-of-fugue": ("instrumentalwerke/die-kunst-der-fuge/", "art-of-fugue-full"),
    "appendix": ("anhang/", "appendix"),
    "deest": ("bwv-deest-de/", "deest"),
    "additions": ("ergaenzungen/", "additions"),
    "manuscripts": ("notenbuecher-drucke-und-handschriften/", "manuscripts"),
}


def get(url: str, tries: int = 3) -> bytes:
    """Fetch a URL, retrying: the archive is slow rather than unreliable."""
    last = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=90) as fh:
                return fh.read()
        except (urllib.error.URLError, OSError) as exc:
            last = exc
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"{url}: {last}")


def page(url: str) -> str:
    return get(url).decode("utf-8", "replace")


SKIP = re.compile(r"/(bachs-ornamentik|feed|wp-json|wp-content)", re.I)


def sub_pages(index_url: str) -> list[str]:
    """Every page at or under `index_url` that the archive links to.

    The archive nests to different depths -- the lute works list their
    pieces on one page, the keyboard works put them two levels down, and
    the cantatas three -- so this walks the whole subtree rather than
    assuming a shape, and returns the pages in the order it meets them.
    """
    seen: set[str] = set()
    queue = [index_url]
    found: list[str] = []
    while queue:
        url = queue.pop(0)
        if url in seen or SKIP.search(url):
            continue
        seen.add(url)
        try:
            html = page(url)
        except RuntimeError:
            continue
        found.append(url)
        for child in sorted(set(re.findall(
                r'href="(' + re.escape(index_url) + r'[^"#]+/)"', html))):
            if child not in seen:
                queue.append(child)
    return found


def downloads(section_url: str) -> dict[str, dict[str, str]]:
    """stem -> {"zip": url, "mid": url} for every piece on one page."""
    html = page(section_url)
    found: dict[str, dict[str, str]] = {}
    for ext in ("zip", "mid"):
        pattern = r'href="(https://www\.tobis-notenarchiv\.de/[^"]+\.' + ext + r')"'
        for url in sorted(set(re.findall(pattern, html))):
            stem = os.path.splitext(url.rsplit("/", 1)[-1])[0]
            found.setdefault(stem, {})[ext] = url
    return found


def save_engraving(blob: bytes, stem: str, out_dir: str) -> str | None:
    """Unpack the one MusicXML inside a Tobis .zip. Returns the path."""
    try:
        archive = zipfile.ZipFile(io.BytesIO(blob))
    except zipfile.BadZipFile:
        return None
    names = [n for n in archive.namelist()
             if n.lower().endswith((".xml", ".musicxml"))]
    if not names:
        return None
    path = os.path.join(out_dir, stem + ".xml")
    with open(path, "wb") as fh:
        fh.write(archive.read(names[0]))
    return path


def fetch(index_url: str, out_dir: str, pause: float) -> tuple[int, int, list]:
    """Mirror a collection, one folder per section of the archive.

    The archive's own grouping -- inventions, the two books of the
    Well-Tempered Clavier, the suites -- is the grouping the finished tabs
    are shelved under, so it is kept rather than flattened and guessed at
    again from BWV numbers afterwards.
    """
    got = skipped = 0
    failed = []
    for section in sub_pages(index_url):
        try:
            pieces = downloads(section)
        except RuntimeError as exc:
            failed.append(str(exc))
            continue
        # Mirror the archive's own path, not just the last segment:
        # "fantasien-und-fugen" is a section of both the organ works and
        # the keyboard works, and flattening would merge the two.
        rel = section[len(index_url):].strip("/")
        name = rel or os.path.basename(out_dir)
        section_dir = os.path.join(out_dir, *rel.split("/")) if rel else out_dir
        os.makedirs(section_dir, exist_ok=True)
        for stem, urls in sorted(pieces.items()):
            xml_path = os.path.join(section_dir, stem + ".xml")
            mid_path = os.path.join(section_dir, stem + ".mid")
            if os.path.exists(xml_path) and os.path.exists(mid_path):
                skipped += 1
                continue
            try:
                if "zip" in urls and not os.path.exists(xml_path):
                    if save_engraving(get(urls["zip"]), stem, section_dir):
                        time.sleep(pause)
                if "mid" in urls and not os.path.exists(mid_path):
                    with open(mid_path, "wb") as fh:
                        fh.write(get(urls["mid"]))
                    time.sleep(pause)
            except RuntimeError as exc:
                failed.append(str(exc))
                continue
            got += 1
            print(f"  {name}/{stem}", flush=True)
    return got, skipped, failed


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("collections", nargs="*", default=None,
                    help=f"any of: {', '.join(sorted(COLLECTIONS))} "
                         f"(default: klavier)")
    ap.add_argument("--out", default=os.path.join(HERE, "midi"),
                    help="where the folders are made (default: midi/)")
    ap.add_argument("--pause", type=float, default=0.4, metavar="S",
                    help="seconds between requests; be kind to the archive")
    ap.add_argument("--list", action="store_true",
                    help="count what each collection offers and stop")
    args = ap.parse_args(argv)

    wanted = args.collections or ["klavier"]
    unknown = [c for c in wanted if c not in COLLECTIONS]
    if unknown:
        print(f"fetch_tobis: unknown collection(s): {', '.join(unknown)}",
              file=sys.stderr)
        return 1

    for name in wanted:
        path, folder = COLLECTIONS[name]
        index_url = BASE + path
        if args.list:
            total = 0
            for section in sub_pages(index_url):
                n = len(downloads(section))
                total += n
                print(f"  {section.rstrip('/').rsplit('/', 1)[-1]:<60} {n}")
            print(f"{name}: {total} pieces\n")
            continue
        out_dir = os.path.join(args.out, folder)
        print(f"{name} -> {out_dir}")
        got, skipped, failed = fetch(index_url, out_dir, args.pause)
        print(f"{name}: {got} fetched, {skipped} already had, "
              f"{len(failed)} failed")
        for line in failed[:10]:
            print("   !", line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
