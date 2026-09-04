"""MusicXML -> Score.

A MIDI file is a performance: it knows when notes sound and nothing about
how they were written. An engraving knows the things the separator would
otherwise have to guess -- which voice a note belongs to, where the bar
lines fall, what the key is -- so when a MusicXML edition of a piece
exists it is the better source by some distance.

Every (part, staff, voice) in the engraving becomes one source track, so
a file written in five voices arrives here already separated into five,
and `--assign tracks` can give each one a guitar of its own for the whole
piece. Ties are joined into single notes, chords keep their onset, and
each measure's real length is measured from its contents, so a pickup bar
stays a pickup bar instead of dragging every bar line after it out of
place.

Reads plain `.xml`/`.musicxml`, compressed `.mxl`, and a `.zip` holding
one of those.
"""

from __future__ import annotations

import os
import zipfile
import xml.etree.ElementTree as ET

from .score import Note, Score, TempoEvent, TimeSigEvent

STEPS = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}

# A note this much shorter than its bar is taken as an engraving rounding
# error rather than a genuinely short bar.
SLOP = 4


def read_musicxml(path: str) -> Score:
    root = _parse(path)
    if root.tag == "score-timewise":
        raise ValueError("timewise MusicXML is not supported; convert to "
                         "score-partwise first")

    ppq = _first_divisions(root)
    score = Score(ppq=ppq, title=_title(root, path), engraved=True)
    names = _part_names(root)

    parts = root.findall("part")
    if not parts:
        raise ValueError("no <part> in this MusicXML file")

    # Read every part on its own clock, then line the measures up: the
    # engraving's own bar lines are the truth, and a part that rests for a
    # whole measure still has to advance by it.
    measured = [_read_part(part, ppq) for part in parts]
    bars = max(len(m.bars) for m in measured)
    lengths = []
    for index in range(bars):
        spans = [m.bars[index] for m in measured if index < len(m.bars)]
        lengths.append(max(span for span in spans))

    starts, tick = [], 0
    for length in lengths:
        starts.append(tick)
        tick += length

    tracks: dict[tuple[int, str, str], int] = {}
    for pi, (part, taken) in enumerate(zip(parts, measured)):
        for entry in taken.notes:
            key = (pi, entry.staff, entry.voice)
            if key not in tracks:
                tracks[key] = len(tracks)
                score.track_names[tracks[key]] = _track_name(
                    names.get(part.get("id"), ""), pi, entry.staff, entry.voice
                )
            start = starts[entry.measure] + entry.offset
            score.notes.append(Note(
                pitch=entry.pitch,
                start=start,
                end=start + entry.duration,
                velocity=90,
                src_track=tracks[key],
                src_channel=pi,
            ))

    score.time_sigs = _signatures(lengths, measured[0].signatures, ppq)
    score.tempos = [TempoEvent(0, bpm) for bpm in [measured[0].tempo or 120.0]]
    score.key = measured[0].key
    score.notes.sort(key=lambda n: (n.start, -n.pitch))
    for index, note in enumerate(score.notes):
        note.uid = index
    return score


class _Entry:
    """One sounding note, still measured from its own bar line."""

    __slots__ = ("measure", "offset", "duration", "pitch", "staff", "voice")

    def __init__(self, measure, offset, duration, pitch, staff, voice):
        self.measure = measure
        self.offset = offset
        self.duration = duration
        self.pitch = pitch
        self.staff = staff
        self.voice = voice


class _Part:
    def __init__(self):
        self.notes: list[_Entry] = []
        self.bars: list[int] = []
        self.sounding: list[int] = []   # how far the *notes* of each bar reach
        self.signatures: dict[int, tuple[int, int]] = {}
        self.key: tuple[int, int] = (0, 0)
        self.tempo: float | None = None
        self.grace = 0


def _read_part(part: ET.Element, ppq: int) -> _Part:
    """Walk one part, measure by measure, on its own clock."""
    out = _Part()
    divisions = ppq
    num, den = 4, 4
    seen_key = False
    # (staff, voice, pitch) -> the entry waiting for its tie to close.
    tied: dict[tuple[str, str, int], _Entry] = {}

    for index, measure in enumerate(part.findall("measure")):
        cursor = longest = sounding = 0
        previous = 0          # onset of the last note, for <chord>
        for node in measure:
            if node.tag == "attributes":
                divisions = _int(node.findtext("divisions"), divisions)
                time = node.find("time")
                if time is not None:
                    num = _int(time.findtext("beats"), num)
                    den = _int(time.findtext("beat-type"), den)
                    out.signatures[index] = (num, den)
                key = node.find("key")
                if key is not None and not seen_key:
                    out.key = (_int(key.findtext("fifths"), 0),
                               1 if (key.findtext("mode") or "").strip()
                               == "minor" else 0)
                    seen_key = True
            elif node.tag == "backup":
                cursor -= _ticks(node.findtext("duration"), divisions, ppq)
            elif node.tag == "forward":
                cursor += _ticks(node.findtext("duration"), divisions, ppq)
            elif node.tag == "direction":
                for sound in node.iter("sound"):
                    if sound.get("tempo") and out.tempo is None:
                        out.tempo = float(sound.get("tempo"))
            elif node.tag == "sound":
                if node.get("tempo") and out.tempo is None:
                    out.tempo = float(node.get("tempo"))
            elif node.tag == "note":
                if node.find("grace") is not None:
                    # No duration of its own: an ornament the engraving
                    # hangs off the next note. Nothing to sound.
                    out.grace += 1
                    continue
                length = _ticks(node.findtext("duration"), divisions, ppq)
                chord = node.find("chord") is not None
                onset = previous if chord else cursor
                if not chord:
                    previous = cursor
                    cursor += length
                    longest = max(longest, cursor)
                else:
                    longest = max(longest, onset + length)
                pitch = _pitch(node.find("pitch"))
                if pitch is None:       # a rest: it only moves the clock
                    continue
                sounding = max(sounding, onset + length)
                staff = (node.findtext("staff") or "1").strip()
                voice = (node.findtext("voice") or "1").strip()
                ties = {t.get("type") for t in node.findall("tie")}
                key = (staff, voice, pitch)
                held = tied.pop(key, None) if "stop" in ties else None
                if held is not None:
                    # Same note continuing: stretch it rather than
                    # writing a second one.
                    held.duration += length
                    entry = held
                else:
                    entry = _Entry(index, onset, length, pitch, staff, voice)
                    out.notes.append(entry)
                if "start" in ties:
                    tied[key] = entry
        out.bars.append(max(longest, 0))
        out.sounding.append(sounding)
        # A tie may not cross a repeat or a section break; if the far end
        # never arrives, the note simply ends where it was written.
        tied = {k: v for k, v in tied.items() if v.measure >= index - 1}

    signature_length = {}
    num, den = 4, 4
    for index in range(len(out.bars)):
        num, den = out.signatures.get(index, (num, den))
        signature_length[index] = int(ppq * 4 * num / den)
    for index, length in enumerate(out.bars):
        want = signature_length[index]
        if length == 0 or abs(length - want) <= SLOP:
            out.bars[index] = want
        elif length > want and out.sounding[index] <= want + SLOP:
            # Only rests reach past the bar line. Engravers park a whole
            # rest wherever it looks best and typesetters pad the bar to
            # place it, which is a drawing instruction, not three extra
            # beats -- and taking it literally moves every bar line after
            # it out of step with the music.
            out.bars[index] = want
    return out


def _signatures(lengths: list[int], engraved: dict[int, tuple[int, int]],
                ppq: int) -> list[TimeSigEvent]:
    """One time signature per bar whose metre or length actually changes.

    A pickup is written as its own short signature, so the bar lines the
    notation stage lays down are the engraving's own rather than a metre
    counted forward from bar one.
    """
    events: list[TimeSigEvent] = []
    current: tuple[int, int] | None = None
    num, den = 4, 4
    tick = 0
    for index, length in enumerate(lengths):
        num, den = engraved.get(index, (num, den))
        fitted = (num, den)
        if length != int(ppq * 4 * num / den):
            fitted = _fit(length, ppq, den)
        if fitted != current:
            events.append(TimeSigEvent(tick, fitted[0], fitted[1]))
            current = fitted
        tick += length
    if not events or events[0].tick != 0:
        events.insert(0, TimeSigEvent(0, 4, 4))
    return events


def _fit(length: int, ppq: int, den: int) -> tuple[int, int]:
    """The simplest time signature that is exactly `length` ticks long."""
    for denominator in (den, 4, 8, 16, 32):
        unit = ppq * 4 // denominator
        if unit and length % unit == 0:
            return max(1, length // unit), denominator
    return max(1, round(length / ppq)), 4


def _parse(path: str) -> ET.Element:
    """Read plain, compressed (.mxl) or zipped MusicXML."""
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as archive:
            name = _inner_name(archive)
            with archive.open(name) as handle:
                return ET.parse(handle).getroot()
    return ET.parse(path).getroot()


def _inner_name(archive: zipfile.ZipFile) -> str:
    """Which member of a .mxl/.zip holds the score."""
    try:
        with archive.open("META-INF/container.xml") as handle:
            container = ET.parse(handle).getroot()
        for root_file in container.iter("rootfile"):
            path = root_file.get("full-path")
            if path:
                return path
    except KeyError:
        pass
    scores = [n for n in archive.namelist()
              if n.lower().endswith((".xml", ".musicxml"))
              and not n.startswith("META-INF")]
    if not scores:
        raise ValueError("no MusicXML inside the archive")
    return scores[0]


def _first_divisions(root: ET.Element) -> int:
    for node in root.iter("divisions"):
        value = _int(node.text, 0)
        if value > 0:
            return value
    return 480


def _part_names(root: ET.Element) -> dict[str, str]:
    names = {}
    for score_part in root.iter("score-part"):
        name = (score_part.findtext("part-name") or "").strip()
        if not name:
            name = (score_part.findtext("part-abbreviation") or "").strip()
        names[score_part.get("id")] = name
    return names


def _track_name(part_name: str, index: int, staff: str, voice: str) -> str:
    head = part_name or f"Part {index + 1}"
    return f"{head} s{staff} v{voice}"


def _title(root: ET.Element, path: str) -> str:
    for tag in ("work-title", "movement-title"):
        text = (root.findtext(f".//{tag}") or "").strip()
        if text:
            return text
    for credit in root.iter("credit-words"):
        text = (credit.text or "").strip()
        if text and text not in {"#"} and not text.isdigit():
            return text
    return os.path.splitext(os.path.basename(path))[0]


def _pitch(node: ET.Element | None) -> int | None:
    if node is None:
        return None
    step = (node.findtext("step") or "C").strip().upper()
    octave = _int(node.findtext("octave"), 4)
    alter = _int(node.findtext("alter"), 0)
    return 12 * (octave + 1) + STEPS.get(step, 0) + alter


def _ticks(text: str | None, divisions: int, ppq: int) -> int:
    value = _int(text, 0)
    if divisions == ppq:
        return value
    return round(value * ppq / max(1, divisions))


def _int(text: str | None, default: int) -> int:
    try:
        return int(float((text or "").strip()))
    except (TypeError, ValueError):
        return default
