"""Fetch a composer's scores from the Mutopia Project into midi/.

    python fetch_mutopia.py VivaldiA

A second source, and a much smaller one. Tobis is a Bach archive -- 460
composers, all of them German organ repertoire, no Vivaldi -- so anything
outside that has to come from somewhere else, and the honest state of the
free-score web is that there is no Vivaldi corpus of Tobis's kind:

  Mutopia    reachable, cleanly licensed, and holds four Vivaldi pieces
  CPDL       refuses automated requests (403)
  KernScores unreachable (503)
  IMSLP      reachable, but scans rather than data, and bulk fetching is
             against the terms it publishes

So this takes what Mutopia has. Mutopia offers MIDI rather than MusicXML,
which is the weaker reading -- voices inferred instead of engraved, bar
lines counted forward rather than given -- and the tabs are correspondingly
rougher than the Bach ones. See "Reading an engraving" in the README.

Mutopia's editions are public domain or Creative Commons; each piece's own
page states which. Source: www.mutopiaproject.org
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import sys
import time
import urllib.error
import urllib.request

TABLE = "https://www.mutopiaproject.org/cgibin/make-table.cgi?Composer="
UA = "Mozilla/5.0 (compatible; FugueSplit source fetch)"
HERE = os.path.dirname(os.path.abspath(__file__))


def get(url: str, tries: int = 3) -> bytes:
    last = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as fh:
                return fh.read()
        except (urllib.error.URLError, OSError) as exc:
            last = exc
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"{url}: {last}")


def download(url: str, path: str) -> None:
    part = path + ".part"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as src, open(part, "wb") as dst:
        shutil.copyfileobj(src, dst, 64 * 1024)
    os.replace(part, path)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("composer", help="Mutopia's key, e.g. VivaldiA")
    ap.add_argument("--out", default=None,
                    help="folder under midi/ (default: the composer key, lowercased)")
    ap.add_argument("--pause", type=float, default=0.5)
    args = ap.parse_args(argv)

    page = get(TABLE + args.composer).decode("utf-8", "replace")
    mids = sorted(set(re.findall(
        r'href="(https://www\.mutopiaproject\.org/ftp/[^"]+\.mid)"', page)))
    if not mids:
        print(f"mutopia lists no MIDI for {args.composer}", file=sys.stderr)
        return 1

    folder = args.out or args.composer.rstrip("A").lower()
    out_dir = os.path.join(HERE, "midi", folder)
    os.makedirs(out_dir, exist_ok=True)

    got = skipped = 0
    for url in mids:
        # .../ftp/VivaldiA/rv725/MentreDormi/MentreDormi.mid -> rv725-MentreDormi
        bits = url.rsplit("/", 3)
        stem = f"{bits[1]}-{os.path.splitext(bits[3])[0]}"
        path = os.path.join(out_dir, stem + ".mid")
        if os.path.exists(path):
            skipped += 1
            continue
        try:
            download(url, path)
        except (urllib.error.URLError, OSError) as exc:
            print(f"  ! {stem}: {exc}")
            continue
        got += 1
        print(f"  {stem}")
        time.sleep(args.pause)
    print(f"{args.composer}: {got} fetched, {skipped} already had -> {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
