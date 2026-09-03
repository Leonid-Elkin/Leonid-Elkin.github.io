"""Batch-convert a folder of MIDI files to Guitar Pro tabs.

    python convert_all.py [midi_dir] [out_dir]

Defaults to converting midi/bach-preludes-and-fugues/ into out/. Titles for
the Bach organ preludes and fugues are filled in from the table below; any
other file keeps whatever title its MIDI carries.
"""

from __future__ import annotations

import argparse
import os
import sys
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fuguesplit import check
from fuguesplit.pipeline import Settings, convert
from fuguesplit.voices import VoiceConfig

COMPOSER = "Johann Sebastian Bach"

TITLES = {
    "0531": "Prelude and Fugue in C major",
    "0532": "Prelude and Fugue in D major",
    "0532a": "Fugue in D major (early version)",
    "0533": "Prelude and Fugue in E minor",
    "0533a": "Prelude and Fugue in E minor (early version)",
    "0534": "Prelude and Fugue in F minor",
    "0535": "Prelude and Fugue in G minor",
    "0535a": "Prelude and Fugue in G minor (early version)",
    "0536": "Prelude and Fugue in A major",
    "0536a": "Prelude and Fugue in A major (early version)",
    "0537": "Fantasia and Fugue in C minor",
    "0538": "Toccata and Fugue in D minor (Dorian)",
    "0539": "Prelude and Fugue in D minor",
    "0540": "Toccata and Fugue in F major",
    "0541": "Prelude and Fugue in G major",
    "0542": "Fantasia and Fugue in G minor",
    "0543": "Prelude and Fugue in A minor",
    "0543a": "Prelude in A minor (early version)",
    "0544": "Prelude and Fugue in B minor",
    "0545": "Prelude and Fugue in C major",
    "0545a": "Prelude and Fugue in C major (early version)",
    "0545b": "Prelude and Fugue in B flat major",
    "0546": "Prelude and Fugue in C minor",
    "0547": "Prelude and Fugue in C major",
    "0548": "Prelude and Fugue in E minor",
    "0549": "Prelude and Fugue in C minor",
    "0549a": "Prelude and Fugue in C minor (early version)",
    "0550": "Prelude and Fugue in G major",
    "0551": "Prelude and Fugue in A minor",
    "0552": "Prelude and Fugue in E flat major",
}


def title_for(stem: str) -> str | None:
    if not stem.upper().startswith("BWV_"):
        return None
    number = stem[4:]
    name = TITLES.get(number)
    if not name:
        return None
    return f"BWV {number.lstrip('0')} - {name}"


def main(argv: list[str]) -> int:
    # Paths here can contain characters the console codepage cannot encode.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, OSError):
            pass

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("midi_dir", nargs="?")
    ap.add_argument("out_dir", nargs="?")
    ap.add_argument("-t", "--transpose", type=int, default=0,
                    help="semitones to shift the guitars")
    ap.add_argument("--octave", type=int, default=0,
                    help="shorthand for --transpose (N * 12)")
    ap.add_argument("--assign", default="auto",
                    choices=["auto", "tracks", "voices", "cascade", "balanced"])
    ap.add_argument("--voice-gap", type=float, default=2.0)
    ap.add_argument("-g", "--guitars", type=int, default=0)
    ap.add_argument("--legato", type=float, default=1.0,
                    help="ring across rests shorter than this many quarters")
    args = ap.parse_args(argv)

    here = os.path.dirname(os.path.abspath(__file__))
    midi_dir = args.midi_dir or os.path.join(
        here, "midi", "bach-preludes-and-fugues"
    )
    out_dir = args.out_dir or os.path.join(here, "out")
    os.makedirs(out_dir, exist_ok=True)

    files = sorted(
        f for f in os.listdir(midi_dir) if f.lower().endswith((".mid", ".midi"))
    )
    if not files:
        print(f"no MIDI files in {midi_dir}", file=sys.stderr)
        return 1

    print(f"{len(files)} files: {midi_dir} -> {out_dir}\n")
    header = (f"{'file':<18} {'bars':>5} {'src':>6} {'kept':>6}  "
              f"{'guitar coverage %':<30} {'bass fret':>9} {'broken':>7}")
    print(header)
    print("-" * len(header))

    done = failed = 0
    total_src = total_written = total_broken = 0
    for name in files:
        stem = os.path.splitext(name)[0]
        src = os.path.join(midi_dir, name)
        dst = os.path.join(out_dir, stem + ".gp5")
        settings = Settings(
            guitars=args.guitars,
            bass=True,
            title=title_for(stem),
            artist=COMPOSER,
            transpose=args.transpose + 12 * args.octave,
            legato_quarters=args.legato,
            voice_config=VoiceConfig(mode=args.assign,
                                     voice_gap_quarters=args.voice_gap),
        )
        try:
            report = convert(src, dst, settings)
        except Exception as exc:                      # noqa: BLE001
            failed += 1
            print(f"{stem:<18} FAILED: {type(exc).__name__}: {exc}")
            if os.environ.get("FUGUESPLIT_DEBUG"):
                traceback.print_exc()
            continue

        done += 1
        total_src += report.source_notes
        total_written += report.written_notes
        kept = 100 * report.written_notes / max(1, report.source_notes)
        guitars = [p for p in report.parts if not p.name.startswith("Bass")]
        cover = " ".join(f"{100 * p.sounding:4.0f}" for p in guitars)
        # The bass is dropped entirely when a guitar can reach the whole line.
        bass = next((p for p in report.parts
                     if p.name.startswith("Bass")), None)
        bass_col = f"{bass.max_fret:>9}" if bass else f"{'-':>9}"
        cut = check.broken(check.gaps(report))
        total_broken += cut
        print(f"{stem:<18} {report.bars:>5} {report.source_notes:>6} "
              f"{kept:>5.1f}%  {cover:<30} {bass_col} {cut:>7}")

    print("-" * len(header))
    print(f"{done} converted, {failed} failed; "
          f"{total_written} of {total_src} notes kept "
          f"({100 * total_written / max(1, total_src):.1f}%)")
    print(f"{total_broken} broken runs "
          f"({100 * total_broken / max(1, total_src):.2f} per 100 notes)")
    print("guitar coverage = % of the piece each guitar is playing; "
          "'broken' = a rest inside a run that another instrument plays "
          "through (python -m fuguesplit.check to see where)")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
