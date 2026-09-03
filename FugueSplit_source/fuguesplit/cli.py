"""Command-line front end."""

from __future__ import annotations

import argparse
import os
import sys

from . import arrange, gpout, voices
from .pipeline import Report, Settings, convert

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def note_name(pitch: int) -> str:
    return f"{NOTE_NAMES[pitch % 12]}{pitch // 12 - 1}"


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="fuguesplit",
        description=(
            "Split a polyphonic MIDI file (a fugue, a chorale, anything "
            "contrapuntal) into monophonic electric guitar and bass parts "
            "and write them as a Guitar Pro tab."
        ),
    )
    p.add_argument("midi", help="input score: .mid/.midi, or a MusicXML .xml/.musicxml/.mxl engraving, which knows its own voices and bar lines")
    p.add_argument("-o", "--out", help="output .gp5 (default: alongside input)")
    p.add_argument("-g", "--guitars", type=int, default=0,
                   help="guitar parts carrying the main voices. Default 0 "
                        "works the number out from the texture and adds a "
                        "player for as long as notes are still being "
                        "crammed into a stave's second voice, so no note is "
                        "dropped; give a number to fix the ensemble instead")
    p.add_argument("--max-parts", type=int, default=7, metavar="N",
                   help="ceiling on the ensemble when the part count is "
                        "worked out for you: staves, bass included. A "
                        "thicker moment than this can be covered is written "
                        "as a double-stop or in a stave's second voice "
                        "(default 7)")
    p.add_argument("--no-bass", action="store_true",
                   help="do not create a bass part")
    p.add_argument("--tuning", default="standard", choices=sorted(arrange.TUNINGS),
                   help="guitar tuning (default: standard)")
    p.add_argument("--bass-tuning", default="bass", choices=sorted(arrange.TUNINGS),
                   help="bass tuning (default: bass)")
    p.add_argument("--frets", type=int, default=22,
                   help="highest usable fret (default: 22)")
    p.add_argument("--tempo", type=int, default=0, metavar="BPM",
                   help="tempo written into the tab; by default whatever "
                        "the source says, which for an engraving with no "
                        "tempo mark at all is 120")
    p.add_argument("--grid", default="32nd",
                   choices=["quarter", "8th", "16th", "32nd", "64th"],
                   help="rhythmic quantisation grid (default: 32nd)")
    p.add_argument("--tone", default="clean", choices=sorted(gpout.PROGRAMS),
                   help="guitar MIDI voice (default: clean)")
    p.add_argument("--bass-tone", default="bass-finger",
                   choices=sorted(gpout.PROGRAMS),
                   help="bass MIDI voice (default: bass-finger)")
    p.add_argument("--from-bar", type=int, help="first bar to convert (1-based)")
    p.add_argument("--to-bar", type=int, help="last bar to convert (inclusive)")
    p.add_argument("--bass-track", type=int, action="append", metavar="N",
                   help="force this source MIDI track to the bass "
                        "(repeatable; overrides auto-detection)")
    p.add_argument("-t", "--transpose", type=int, default=0, metavar="N",
                   help="shift the guitars by N semitones (-12 drops them an "
                        "octave). Notes pushed off the neck fold back")
    p.add_argument("--bass-transpose", type=int, default=0, metavar="N",
                   help="shift the bass by N semitones")
    p.add_argument("--octave", type=int, default=0, metavar="N",
                   help="shorthand for --transpose (N * 12)")
    p.add_argument("--assign", default="auto",
                   choices=["auto", "tracks", "voices", "cascade", "balanced"],
                   help="'auto' (default) uses the source's own tracks when "
                        "it already holds one voice each -- one voice, one "
                        "guitar, all the way through -- and falls back to "
                        "'voices' when it does not; 'tracks' forces that "
                        "reading; 'voices' infers the melodic lines instead; "
                        "'cascade' maximises Guitar I's note count regardless "
                        "of line; 'balanced' shares the voices out evenly")
    p.add_argument("--voice-gap", type=float, default=2.0, metavar="Q",
                   help="how long (in quarter notes) a line must rest before "
                        "a guitar may change to another; higher keeps lines "
                        "more intact but plays fewer notes (default 2)")
    p.add_argument("--voices", type=int, default=0, metavar="N",
                   help="how many melodic lines to look for (default: from "
                        "the texture)")
    p.add_argument("--voice-stickiness", type=float, default=6.0,
                   help="how hard a voice sticks to one instrument. Raising "
                        "it (try 20) cuts handovers sharply but can revoice "
                        "the opening; default 6")
    p.add_argument("--flow-priority", default="top", choices=["top", "bottom"],
                   help="which guitar gets the unbroken line: 'top' = Guitar I "
                        "(default), 'bottom' = the highest-numbered guitar")
    p.add_argument("--flow-weight", type=float, default=0.0,
                   help="how hard to keep that part playing (default 0 = "
                        "parts share the work evenly)")
    p.add_argument("--bass-comfort-fret", type=int, default=12,
                   help="highest fret the bass should normally use "
                        "(default 12)")
    p.add_argument("--bass-on-guitar", action="store_true",
                   help="hand the pedal line to a guitar instead. By "
                        "default the bass plays it, which is what the bass "
                        "is for")
    p.add_argument("--legato", type=float, default=1.0, metavar="Q",
                   help="let a note ring across a rest shorter than Q "
                        "quarter notes, so a running passage reads as one "
                        "line instead of fragments (default 1; 0 = write "
                        "every rest of the engraving literally)")
    p.add_argument("--chords", choices=["some", "all", "none"], default="some",
                   help="which double-stops to write: 'some' (default) keeps "
                        "only the held ones and those at endings, 'all' "
                        "writes every note that would not fit a line, "
                        "'none' writes strictly one note at a time")
    p.add_argument("--chord-length", type=float, default=1.0, metavar="Q",
                   help="how long a double-stop must be held to be kept "
                        "(quarter notes, default 1)")
    p.add_argument("--hand-span", type=int, default=4, metavar="N",
                   help="how many frets one hand can hold at once; a "
                        "double-stop wider than this is not written "
                        "(default 4; open strings are always free)")
    p.add_argument("--ties", choices=["few", "beats"], default="few",
                   help="'few' (default) writes a note as the longest "
                        "values that fit, so a tie only appears where one "
                        "is unavoidable; 'beats' also splits at every beat "
                        "line, drawing the pulse at the cost of many ties")
    p.add_argument("--no-bass-relief", action="store_true",
                   help="let the bass play high up the neck instead of "
                        "folding the line down into a comfortable span")
    p.add_argument("--title", help="title written into the tab")
    p.add_argument("--artist", default="", help="composer credit")
    p.add_argument("--credit", default="Leonid Elkin",
                   help="name credited as the arranger in the tab")
    p.add_argument("--list-tracks", action="store_true",
                   help="show the source file's tracks and exit")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    if args.list_tracks:
        return _list_tracks(args.midi)

    out = args.out or os.path.splitext(args.midi)[0] + ".gp5"
    settings = Settings(
        guitars=args.guitars,
        max_parts=args.max_parts,
        transpose=args.transpose + 12 * args.octave,
        bass_transpose=args.bass_transpose,
        bass_comfort_fret=args.bass_comfort_fret,
        bass_on_guitar=args.bass_on_guitar,
        legato_quarters=args.legato,
        chords=args.chords,
        chord_min_quarters=args.chord_length,
        hand_span=args.hand_span,
        ties=args.ties,
        relieve_bass=not args.no_bass_relief,
        voice_config=voices.VoiceConfig(
            mode=args.assign,
            voice_gap_quarters=args.voice_gap,
            detect_parts=args.voices,
            w_flow=args.flow_weight,
            flow_priority=args.flow_priority,
            w_affinity=args.voice_stickiness,
        ),
        bass=not args.no_bass,
        guitar_tuning=args.tuning,
        bass_tuning=args.bass_tuning,
        fret_count=args.frets,
        grid=args.grid,
        tempo=args.tempo,
        guitar_program=args.tone,
        bass_program=args.bass_tone,
        from_bar=args.from_bar,
        to_bar=args.to_bar,
        bass_tracks=set(args.bass_track) if args.bass_track else None,
        title=args.title,
        artist=args.artist,
        credit=args.credit,
    )

    try:
        report = convert(args.midi, out, settings)
    except (ValueError, OSError) as exc:
        print(f"fuguesplit: {exc}", file=sys.stderr)
        return 1

    _print_report(report, out)
    return 0


def _list_tracks(path: str) -> int:
    from .pipeline import read_source

    score = read_source(path)
    detected = voices.detect_bass_tracks(score)
    print(f"{path}: {len(score.notes)} notes, {score.ppq} ticks/beat")
    print(f"{'trk':>4}  {'notes':>6}  {'range':>9}  name")
    for ti, notes in sorted(score.notes_by_track().items()):
        pitches = [n.pitch for n in notes]
        span = f"{note_name(min(pitches))}-{note_name(max(pitches))}"
        mark = "  <- bass" if ti in detected else ""
        print(f"{ti:>4}  {len(notes):>6}  {span:>9}  "
              f"{score.track_names.get(ti, '')}{mark}")
    return 0


def _print_report(report: Report, out: str) -> None:
    sharps, minor = report.key
    key_desc = f"{abs(sharps)} {'sharp' if sharps >= 0 else 'flat'}"
    key_desc += "" if abs(sharps) == 1 else "s"
    print(f'"{report.title}"  ->  {out}')
    print(f"  {report.bars} bars, {report.tempo} bpm, {key_desc}"
          f"{', minor' if minor else ''}")
    if report.bass_tracks:
        print(f"  bass taken from source track(s): "
              f"{', '.join(str(t) for t in sorted(report.bass_tracks))}")
    print(f"  {report.source_notes} source notes -> "
          f"{report.written_notes} written")
    print()
    print(f"  {'part':<12} {'notes':>6}  {'range':>10}  {'8ve':>4}  "
          f"{'maxfret':>7}  {'open':>5}  {'playing':>6}")
    for part in report.parts:
        shift = f"{part.octave_shift // 12:+d}" if part.octave_shift else "0"
        span = f"{note_name(part.low)}-{note_name(part.high)}"
        print(f"  {part.name:<12} {part.notes:>6}  {span:>10}  {shift:>4}  "
              f"{part.max_fret:>7}  {part.open_strings:>5}  "
              f"{100 * part.sounding:>5.1f}%")
    if report.added_voices:
        players = len([p for p in report.parts if not p.name.startswith("Bass")])
        print()
        print(f"  grew to {players} guitars: any fewer left notes greyed "
              f"into a stave's second voice")
    if report.chords or report.second_voice:
        print()
        if report.chords:
            print(f"  {report.chords} notes share a beat with another "
                  f"(double-stops within a voice)")
        if report.second_voice:
            print(f"  {report.second_voice} notes written into the stave's "
                  f"second voice (they start inside a held note)")
    if report.pulled_back:
        print()
        print(f"  {report.pulled_back} notes folded back an octave to stay "
              f"on the neck")
    if report.handed_off:
        extra = " (added a guitar for them)" if report.added_guitar else ""
        print()
        print(f"  {report.handed_off} notes lifted off the bass"
              f" onto a guitar{extra}")


if __name__ == "__main__":
    raise SystemExit(main())
