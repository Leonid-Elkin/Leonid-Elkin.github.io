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
import concurrent.futures as cf
import io
import os
import re
import shutil
import sys
import time
import urllib.error
import urllib.request
import zipfile

BASE = "https://tobis-notenarchiv.de/wp/bach-archiv/"
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


def download(url: str, path: str, tries: int = 3) -> None:
    """Stream a URL straight to disk.

    Not `get()` plus a write: an engraving here reaches six megabytes, and
    holding several of those in memory at once alongside the arranger is
    what got an earlier run killed. Written to a partial file and renamed,
    so an interrupted fetch leaves nothing that looks complete.
    """
    last = None
    part = path + ".part"
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=90) as src:
                with open(part, "wb") as dst:
                    shutil.copyfileobj(src, dst, 64 * 1024)
            os.replace(part, path)
            return
        except (urllib.error.URLError, OSError) as exc:
            last = exc
            time.sleep(2 * (attempt + 1))
    if os.path.exists(part):
        os.remove(part)
    raise RuntimeError(f"{url}: {last}")


def save_engraving(url: str, stem: str, out_dir: str) -> str | None:
    """Unpack the one MusicXML inside a Tobis .zip. Returns the path."""
    tmp = os.path.join(out_dir, stem + ".zip.tmp")
    download(url, tmp)
    try:
        with zipfile.ZipFile(tmp) as archive:
            names = [n for n in archive.namelist()
                     if n.lower().endswith((".xml", ".musicxml"))]
            if not names:
                return None
            path = os.path.join(out_dir, stem + ".xml")
            with archive.open(names[0]) as src, open(path, "wb") as dst:
                shutil.copyfileobj(src, dst, 64 * 1024)
            return path
    except zipfile.BadZipFile:
        return None
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def fetch(index_url: str, out_dir: str, pause: float,
          workers: int = 4, only: str = "") -> tuple[int, int, list]:
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
        # A collection too large to hold on disk at once is taken a
        # section at a time: fetch, arrange, delete, move on.
        if only and only not in rel:
            continue
        name = rel or os.path.basename(out_dir)
        section_dir = os.path.join(out_dir, *rel.split("/")) if rel else out_dir
        os.makedirs(section_dir, exist_ok=True)
        def one(item: tuple[str, dict[str, str]]) -> str | None:
            """Fetch a single piece. Returns its stem, or None if skipped."""
            stem, urls = item
            xml_path = os.path.join(section_dir, stem + ".xml")
            mid_path = os.path.join(section_dir, stem + ".mid")
            if os.path.exists(xml_path) and os.path.exists(mid_path):
                return None
            if "zip" in urls and not os.path.exists(xml_path):
                save_engraving(urls["zip"], stem, section_dir)
                time.sleep(pause)
            if "mid" in urls and not os.path.exists(mid_path):
                download(urls["mid"], mid_path)
                time.sleep(pause)
            return stem

        # The archive is slow per request rather than short of bandwidth,
        # so a few connections at once is the difference between two hours
        # and ten. Kept deliberately small: this is somebody's hobby server.
        with cf.ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(one, item): item[0]
                       for item in sorted(pieces.items())}
            for future in cf.as_completed(futures):
                try:
                    stem = future.result()
                except (RuntimeError, OSError) as exc:
                    failed.append(f"{futures[future]}: {exc}")
                    continue
                if stem is None:
                    skipped += 1
                else:
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
    ap.add_argument("--workers", type=int, default=2, metavar="N",
                    help="downloads in flight at once (default 4); this is "
                         "a small archive, so keep it small")
    ap.add_argument("--only", default="", metavar="PREFIX",
                    help="only sections whose path contains this")
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
                if args.only and args.only not in section[len(index_url):].strip("/"):
                    continue
                n = len(downloads(section))
                total += n
                print(f"  {section.rstrip('/').rsplit('/', 1)[-1]:<60} {n}")
            print(f"{name}: {total} pieces\n")
            continue
        out_dir = os.path.join(args.out, folder)
        print(f"{name} -> {out_dir}")
        got, skipped, failed = fetch(index_url, out_dir, args.pause,
                                     args.workers, args.only)
        print(f"{name}: {got} fetched, {skipped} already had, "
              f"{len(failed)} failed")
        for line in failed[:10]:
            print("   !", line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
