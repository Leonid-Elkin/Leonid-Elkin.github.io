"""Copy the Bach arrangements and drop over-high parts an octave.

A part is 'too high' when its mean sounding pitch is 27 semitones or
more above its lowest open string -- G4 on a guitar, G3 on a bass. Mean
pitch is the register the part actually occupies; mean fret, which this
used before, only says which strings the fretting algorithm happened to
pick. It only moves if every
note survives: the lowest note has to stay on the neck after -12. When it
would fall short of the open low string, the bottom string is dropped --
to D, or to C for the parts that need another whole tone -- which reaches
those notes and loses none. Anything still short is left where it was.
Everything is re-fretted with FugueSplit's own Viterbi so the tab still
keeps the hand in one place.
"""
from __future__ import annotations
import csv, itertools, os, shutil, glob

import guitarpro
import guitarpro.gp3
from fuguesplit import fretting


def _tied_note_value(self, note):
    """PyGuitarPro's version, with the beat found by identity.

    A tie carries no fret of its own -- it repeats whatever was last played
    on its string. The library locates the current beat with list.index(),
    which matches on equality, so an identical-looking earlier beat wins and
    the search starts in the wrong place, handing back some other note's
    fret. Everything downstream then transposes a pitch the piece never had.
    """
    measure = note.beat.voice.measure
    voice_index = measure.voices.index(note.beat.voice)
    for i, m in enumerate(reversed(measure.track.measures)):
        voice = m.voices[voice_index]
        if i == 0:
            here = next(j for j, b in enumerate(voice.beats) if b is note.beat)
            beats = voice.beats[:here]
        else:
            beats = voice.beats
        for beat in reversed(beats):
            if beat.status != guitarpro.BeatStatus.empty:
                for prev in beat.notes:
                    if prev.string == note.string:
                        return prev.value
    return -1


guitarpro.gp3.GP3File.getTiedNoteValue = _tied_note_value

# The published tabs, one level up from this file. Each shelf keeps its
# straight reading in gp/ and its octave-dropped one in 8ve/, so the two
# sit beside each other rather than in a parallel tree.
SRC = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir, "bach"))
DST = os.path.join(SRC, "transposed")
SECTIONS = ["art-of-fugue", "chorales", "fugues", "preludes-and-fugues", "trio-sonatas"]

PPQ = 960
FRETS = 24
HAND_SPAN = 4
# The top of each instrument's good-sounding range: the 12th fret of the top
# string, where the tone starts thinning, and the 15th, past which a line is
# both thin and awkward. Notes above these are what an octave down buys.
TOP_SWEET = {6: 76, 4: 55}
TOP_HARSH = {6: 79, 4: 58}
# A dropped low string costs a little warmth and a retune, so it has to earn
# its place; it is never taken just to shave a note or two off the top.
RETUNE_COST = 200
# Whole-piece transpositions worth trying: down to an octave, and a little up.
SHIFTS = list(range(-12, 3))
# Moving off the written key is a real cost -- the piece stops being in the key
# Bach put it in, and open strings stop lining up with the harmony. Priced per
# semitone, it keeps transpositions inside a minor third instead of sliding the
# music as low as the neck allows. An octave is exempt: the key survives it.
KEY_STEP_COST = 100

STD_GUITAR = [40, 45, 50, 55, 59, 64]
DROP_D = [38, 45, 50, 55, 59, 64]
DROP_C = [36, 45, 50, 55, 59, 64]
STD_BASS = [28, 33, 38, 43]
DROP_D_BASS = [26, 33, 38, 43]

# Standard first, then a dropped D. Drop C reaches lower but leaves the string
# slack and dull, which is the opposite of the point.
GUITAR_TUNINGS = [(STD_GUITAR, "standard"), (DROP_D, "drop D")]
BASS_TUNINGS = [(STD_BASS, "standard"), (DROP_D_BASS, "drop D")]

CFG = fretting.FretConfig(fret_count=FRETS)


class N:
    """The little a Viterbi pass needs to know about a note."""
    __slots__ = ("pitch", "start", "end")

    def __init__(self, pitch, start, end):
        self.pitch, self.start, self.end = pitch, start, end


def tuning_of(track):
    """Guitar Pro numbers strings 1..N from the top; we want low-to-high."""
    return [s.value for s in reversed(track.strings)]


def is_tie(note):
    return note.type == guitarpro.NoteType.tie


def all_notes(track):
    for m in track.measures:
        for vi, v in enumerate(m.voices):
            for b in v.beats:
                for n in b.notes:
                    yield vi, b, n


def pitch_with(tuning, note):
    return tuning[len(tuning) - note.string] + note.value


def track_stats(track):
    tun = tuning_of(track)
    pitches, frets = [], []
    for _vi, _b, n in all_notes(track):
        pitches.append(pitch_with(tun, n))
        frets.append(n.value)
    if not pitches:
        return None
    return dict(lo=min(pitches), hi=max(pitches), n=len(pitches),
                mean_pitch=sum(pitches) / len(pitches), pitches=pitches,
                mean_fret=sum(frets) / len(frets), max_fret=max(frets))


def playing_cost(pitches, shift, low, strings):
    """How poorly a part would sit on the instrument at this shift.

    Everything below the open bottom string is unplayable, so that rules a
    shift out entirely. Above the 12th fret the tone thins; above the 15th it
    thins and gets awkward to hold, so those notes are counted harder.
    """
    sweet, harsh = TOP_SWEET[strings], TOP_HARSH[strings]
    cost = 0
    for pitch in pitches:
        moved = pitch + shift
        if moved < low:
            return None
        if moved > harsh:
            cost += 3 * (moved - harsh) + (harsh - sweet)
        elif moved > sweet:
            cost += moved - sweet
    return cost


def options_for(track, stats, shift):
    """The cheapest way to play this part at this shift, or None if it can't be."""
    strings = len(track.strings)
    ladder = BASS_TUNINGS if strings == 4 else GUITAR_TUNINGS
    if tuning_of(track) != ladder[0][0]:
        return None
    best = None
    for tuning, label in ladder:
        cost = playing_cost(stats["pitches"], shift, tuning[0], strings)
        if cost is None:
            continue
        cost += 0 if label == "standard" else RETUNE_COST
        if best is None or cost < best[0]:
            best = (cost, tuning, label)
    return best


def choose_piece_shift(parts):
    """Pick one transposition for the whole piece.

    Every part moves by the same interval or none does. Shifting parts by
    different amounts is what wrecks these arrangements: it changes how far
    apart the voices sit, so a line that sang a tenth above its neighbour
    ends up a step above it, and the counterpoint stops making sense even
    when no two voices actually cross. Moving everything together leaves
    every interval in the piece exactly as Bach left it.
    """
    best = None
    for shift in SHIFTS:
        picks = [options_for(t, st, shift) for t, st in parts]
        if any(p is None for p in picks):
            continue
        # Prefer no change; then a plain octave, which keeps the key; then
        # the smallest move; and retune as few instruments as possible.
        total = sum(p[0] for p in picks)
        if shift % 12:
            total += KEY_STEP_COST * abs(shift)
        score = (total,
                 0 if shift == 0 else (1 if shift % 12 == 0 else 2),
                 abs(shift),
                 sum(1 for p in picks if p[2] != "standard"))
        if best is None or score < best[0]:
            best = (score, shift, picks)
    return (best[1], best[2]) if best else (0, [options_for(t, st, 0) for t, st in parts])


def _unused_choose_plan(parts):
    """Pick an octave for each part of one piece.

    Each part may stay or drop an octave, and the whole combination is scored
    together, because the parts are only good if they still fit each other:
    any choice that would let a lower voice rise above a higher one is thrown
    out, whatever it does for the range. Among what is left, the cheapest to
    play wins, then the one that retunes and moves the fewest parts.
    """
    means = [st["mean_pitch"] for _t, st in parts]
    best = None
    for combo in itertools.product((0, -12), repeat=len(parts)):
        picks = [options_for(t, st, sh) for (t, st), sh in zip(parts, combo)]
        if any(p is None for p in picks):
            continue
        moved = [m + sh for m, sh in zip(means, combo)]
        if not voices_keep_order(means, moved):
            continue
        score = (sum(p[0] for p in picks),
                 sum(1 for p in picks if p[2] != "standard"),
                 sum(1 for sh in combo if sh))
        if best is None or score < best[0]:
            best = (score, combo, picks)
    return (best[1], best[2]) if best else ([0] * len(parts),
                                            [options_for(t, st, 0) for t, st in parts])


def voices_keep_order(before, after):
    """Did every pair of voices stay on the same side of each other?"""
    for i in range(len(before)):
        for j in range(i + 1, len(before)):
            if before[i] == before[j]:
                continue
            if (before[i] - before[j]) * (after[i] - after[j]) <= 0:
                return False
    return True


def primary_of(beat, later):
    """The melodic note of a beat; the rest are chord tones beside it."""
    if len(beat.notes) == 1:
        return beat.notes[0]
    ties = [n for n in beat.notes if is_tie(n)]
    if len(ties) == 1:
        return ties[0]
    if later is not None:
        nxt = [n for n in later.notes if is_tie(n)]
        if len(nxt) == 1:
            for n in beat.notes:
                if n.string == nxt[0].string:
                    return n
    return beat.notes[0]


def voice_beats(track, vi):
    out = []
    for m in track.measures:
        if vi >= len(m.voices):
            continue
        for b in m.voices[vi].beats:
            if b.notes:
                out.append(b)
    return out


def retune_voice(track, vi, old_tun, new_tun, shift, report):
    """Move one voice by `shift` semitones and re-finger it."""
    beats = voice_beats(track, vi)
    if not beats:
        return
    plan = []
    for i, b in enumerate(beats):
        prim = primary_of(b, beats[i + 1] if i + 1 < len(beats) else None)
        plan.append((b, prim, [n for n in b.notes if n is not prim]))

    struck = [(b, p) for b, p, _ in plan if not is_tie(p)]
    line = [N(pitch_with(old_tun, p) + shift, b.start, b.start + b.duration.time)
            for b, p in struck]
    spots = fretting.fret_part(line, new_tun, PPQ, CFG) if line else []

    cursor, held = -1, None
    for b, prim, extras in plan:
        if not is_tie(prim):
            cursor += 1
            held = spots[cursor]
        if held is None:
            # A tie with nothing before it: fret it on its own.
            held = min(fretting.positions_for(
                pitch_with(old_tun, prim) + shift, new_tun, FRETS), key=lambda s: s[1])
        si, fr = held
        prim.string = len(new_tun) - si
        prim.value = fr
        taken = {si}
        for ex in extras:
            want = pitch_with(old_tun, ex) + shift
            spot = fretting.position_beside(want, new_tun, FRETS, si, fr, HAND_SPAN)
            if spot is None or spot[0] in taken:
                free = [s for s in fretting.positions_for(want, new_tun, FRETS)
                        if s[0] not in taken]
                if not free:
                    report["lost"] += 1
                    continue
                spot = min(free, key=lambda s: (abs(s[1] - fr), s[1]))
                report["stretched"] += 1
            taken.add(spot[0])
            ex.string = len(new_tun) - spot[0]
            ex.value = spot[1]


def retune_track(track, new_tun, shift, report):
    old_tun = tuning_of(track)
    voices = max((len(m.voices) for m in track.measures), default=0)
    for vi in range(voices):
        retune_voice(track, vi, old_tun, new_tun, shift, report)
    for i, pitch in enumerate(reversed(new_tun)):
        track.strings[i].value = pitch


def widest_stretch(track):
    """The biggest fret span the hand has to hold at any one instant."""
    at = {}
    for _vi, beat, note in all_notes(track):
        if note.value > 0:
            at.setdefault(beat.start, []).append(note.value)
    spans = [max(f) - min(f) for f in at.values() if len(f) > 1]
    return max(spans, default=0)


def snapshot(track):
    """Everything retune_track touches, so a failed attempt can be undone."""
    return ([(n, n.string, n.value) for _v, _b, n in all_notes(track)],
            [s.value for s in track.strings])


def restore(track, snap):
    notes, strings = snap
    for note, string, value in notes:
        note.string, note.value = string, value
    for gp_string, value in zip(track.strings, strings):
        gp_string.value = value


def pitches_of(track):
    tun = tuning_of(track)
    return sorted(pitch_with(tun, n) for _v, _b, n in all_notes(track))


ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"]


def reorder_by_register(song, means):
    """Put the top-sounding part on the top staff.

    These arrangements number their guitars by fugue voice, not by register,
    so the third staff often carries the soprano and a player reading down the
    page finds the lines in no particular order. Sorting the staves high to
    low and renaming them to match moves no note and changes no sound; it only
    makes the page say what the music is doing. The bass keeps its own name at
    the bottom.
    """
    guitars = [t for t in song.tracks if len(t.strings) == 6]
    others = [t for t in song.tracks if len(t.strings) != 6]
    guitars.sort(key=lambda t: -means.get(id(t), 0))
    renamed = {}
    if len(guitars) > 1:
        for i, track in enumerate(guitars):
            name = "Guitar " + (ROMAN[i] if i < len(ROMAN) else str(i + 1))
            renamed[id(track)] = track.name
            track.name = name
    song.tracks = guitars + others
    for i, track in enumerate(song.tracks, 1):
        track.number = i
    return renamed


def main():
    if os.path.exists(DST):
        shutil.rmtree(DST)
    rows = []
    totals = dict(files=0, tracks=0, pieces_moved=0, parts_moved=0, octave=0,
                  key_change=0, drop_d=0, rejected=0, stretched=0, restaffed=0)
    for sec in SECTIONS:
        os.makedirs(os.path.join(DST, sec, "gp"), exist_ok=True)
        for path in sorted(glob.glob(os.path.join(SRC, sec, "gp", "*.gp5"))):
            name = os.path.basename(path)
            song = guitarpro.parse(path)
            totals["files"] += 1
            parts = []
            for track in song.tracks:
                totals["tracks"] += 1
                st = track_stats(track)
                if st is None:
                    rows.append([sec, name, track.name, track.name, 0,
                                 "", "", "", "", "empty stave"])
                    continue
                parts.append((track, st))

            shift, picks = choose_piece_shift(parts)
            snaps = [(track, snapshot(track)) for track, _st in parts]
            before = [pitches_of(track) for track, _st in parts]
            spans = [widest_stretch(track) for track, _st in parts]

            trouble = None
            if shift:
                rep = dict(lost=0, stretched=0)
                for i, ((track, _st), pick) in enumerate(zip(parts, picks)):
                    retune_track(track, pick[1], shift, rep)
                    if rep["lost"]:
                        trouble = "a chord tone had nowhere to go"
                        break
                    if widest_stretch(track) > max(HAND_SPAN, spans[i]):
                        trouble = "it would need a wider stretch than the original"
                        break
                totals["stretched"] += rep["stretched"]

            if trouble:
                # The piece moves as one or not at all: leaving a single part
                # behind is exactly the mismatch this is meant to avoid.
                for track, snap in snaps:
                    restore(track, snap)
                for i, (track, _st) in enumerate(parts):
                    assert pitches_of(track) == before[i], (name, track.name)
                totals["rejected"] += 1
                shift = 0

            if shift:
                for i, (track, _st) in enumerate(parts):
                    assert pitches_of(track) == [p + shift for p in before[i]],                         (name, track.name)
                    assert all(0 <= n.value <= FRETS for _v, _b, n in all_notes(track))
                totals["pieces_moved"] += 1
                totals["parts_moved"] += len(parts)
                totals["drop_d"] += sum(1 for p in picks if p[2] != "standard")
                if shift % 12 == 0:
                    totals["octave"] += 1
                else:
                    totals["key_change"] += 1

            renamed = reorder_by_register(
                song, {id(t): st["mean_pitch"] for t, st in parts})
            totals["restaffed"] += sum(
                1 for t, _st in parts if renamed.get(id(t), t.name) != t.name)

            for (track, st), pick in zip(parts, picks):
                row = [sec, name, renamed.get(id(track), track.name), track.name,
                       st["n"],
                       round(st["mean_pitch"], 1), round(st["mean_fret"], 1),
                       st["max_fret"], f"{st['lo']}-{st['hi']}"]
                if shift:
                    label = ("down an octave" if shift == -12 else
                             f"whole piece {shift:+d} semitones")
                    if pick[2] != "standard":
                        label += ", " + pick[2]
                    rows.append(row + [label])
                elif trouble:
                    rows.append(row + ["left as it is - " + trouble])
                elif picks and picks[0][0] == 0 and all(p[0] == 0 for p in picks):
                    rows.append(row + ["left as it is - already sits well"])
                else:
                    rows.append(row + ["left as it is - nothing lower fits "
                                       "without falling off the neck"])
            guitarpro.write(song, os.path.join(DST, sec, "gp", name))
    with open(os.path.join(DST, "changes.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["section", "file", "part", "staff", "notes", "mean pitch",
                    "mean fret", "max fret", "range (midi)", "outcome"])
        w.writerows(rows)
    print(totals)


if __name__ == "__main__":
    main()
