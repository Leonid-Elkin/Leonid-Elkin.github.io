"""End-to-end: MIDI in, Guitar Pro tab out."""

from __future__ import annotations

import bisect
import os
from dataclasses import dataclass, field, replace

from . import arrange, fretting, gpout, midi_in, musicxml_in, rhythm, voices
from .score import Note, Part, Score


@dataclass
class Settings:
    guitars: int = 0              # 0 = as many as the music needs
    max_parts: int = 7            # ceiling on that; past it a note goes
                                  # into the stave's second voice instead
    bass: bool = True
    guitar_tuning: str = "standard"
    bass_tuning: str = "bass"
    fret_count: int = 22
    grid: str = "32nd"
    tempo: int = 0                # 0 = whatever the source says
    guitar_program: str = "clean"
    bass_program: str = "bass-finger"
    bass_on_guitar: bool = False  # keep the pedal line on the bass
    transpose: int = 0            # semitones applied to the guitars
    bass_transpose: int = 0       # semitones applied to the bass
    bass_comfort_fret: int = 12
    legato_quarters: float = 1.0  # ring across rests shorter than this; 0 = off
    chords: str = "some"          # "some" = only held ones and endings,
                                  # "all" = every one, "none" = no chords
    chord_min_quarters: float = 1.0   # length that counts as a held chord
    hand_span: int = 4            # frets one hand can hold at once
    ties: str = "few"             # "few" = tie only where unavoidable,
                                  # "beats" = also split at every beat line
    relieve_bass: bool = True
    from_bar: int | None = None
    to_bar: int | None = None
    bass_tracks: set[int] | None = None   # None = auto-detect
    title: str | None = None
    artist: str = ""
    credit: str = "Leonid Elkin"
    voice_config: voices.VoiceConfig = field(default_factory=voices.VoiceConfig)


@dataclass
class PartReport:
    name: str
    notes: int
    low: int
    high: int
    octave_shift: int
    max_fret: int
    open_strings: int
    sounding: float = 0.0        # share of the piece this part is playing
    relief_notes: int = 0        # notes taken over from the bass
    chord_notes: int = 0         # notes sharing a beat with another (chords)
    second_notes: int = 0        # notes in the stave's second voice


@dataclass
class Report:
    title: str
    source_notes: int
    bars: int
    tempo: int
    key: tuple[int, int]
    bass_tracks: set[int]
    handed_off: int = 0          # notes lifted off the bass onto a guitar
    pulled_back: int = 0         # notes a transposition pushed off the neck
    added_guitar: bool = False
    added_voices: int = 0        # players added because the texture thickened
    parts: list[PartReport] = field(default_factory=list)
    # The finished parts and the score they came from, for `check` to
    # audit. Held in memory only; nothing is written out from these.
    arranged: list = field(default_factory=list, repr=False)
    source: object = field(default=None, repr=False)

    @property
    def written_notes(self) -> int:
        return sum(p.notes + p.chord_notes + p.second_notes for p in self.parts)

    @property
    def chords(self) -> int:
        return sum(p.chord_notes for p in self.parts)

    @property
    def second_voice(self) -> int:
        return sum(p.second_notes for p in self.parts)


ENGRAVED = (".xml", ".musicxml", ".mxl", ".zip")


def read_source(path: str) -> Score:
    """Read a score from whichever kind of file this is.

    An engraving is preferred wherever one exists -- it knows the voices,
    the bar lines and the key, all of which a MIDI file only implies --
    so both are accepted and the suffix decides.
    """
    if path.lower().endswith(ENGRAVED):
        return musicxml_in.read_musicxml(path)
    return midi_in.read_midi(path)


def convert(midi_path: str, out_path: str, settings: Settings) -> Report:
    score = read_source(midi_path)
    source_total = len(score.notes)
    score = _clip_bars(score, settings)

    bass_tracks = (
        voices.detect_bass_tracks(score)
        if settings.bass_tracks is None
        else settings.bass_tracks
    )
    if not settings.bass:
        bass_tracks = set()

    plan = _plan_parts(score, settings, bass_tracks)
    parts, streams = plan.parts, plan.streams
    prefolded = plan.prefolded
    handed_off, added_guitar = plan.handed_off, plan.added_guitar
    fold_cfg = arrange.FoldConfig(fret_count=settings.fret_count)

    relief_counts = [0] * len(parts)
    if handed_off:
        relief_counts = _relief_counts(parts, streams, settings)
    relief_counts += [0] * (len(parts) - len(relief_counts))
    fret_cfg = fretting.FretConfig(fret_count=settings.fret_count)
    grid = rhythm.grid_ticks(settings.grid)

    laid_out, positions = [], []
    pulled_back = 0
    end_gp = 0
    for index, (part, stream) in enumerate(zip(parts, streams)):
        if index in prefolded:
            folded, shift = stream, part.octave_shift
        else:
            # Aim each part at its own register, so the voices keep the
            # order they were written in instead of all being drawn to the
            # middle of the neck and crossing each other.
            folded, shift = arrange.fold_into_range(
                stream, part.tuning, score.ppq, fold_cfg,
                target=arrange.register_target(stream, part.tuning, fold_cfg),
            )
        shift_by = settings.bass_transpose if part.is_bass else settings.transpose
        folded, pulled = arrange.transpose(
            folded, shift_by, part.tuning,
            settings.bass_comfort_fret
            if (part.is_bass and settings.relieve_bass) else settings.fret_count,
        )
        pulled_back += pulled
        mono = arrange.enforce_monophony(folded, score.ppq, fold_cfg)
        # Quantise before fretting so the two stages agree on the note list.
        quantised = rhythm.quantize(mono, score.ppq, grid)
        # Ring across the little rests inside a run, so a flowing passage
        # reads as one line rather than a string of fragments.
        quantised = arrange.fill_short_rests(
            quantised, rhythm.GP_QUARTER, settings.legato_quarters
        )
        part.notes = quantised
        part.octave_shift = shift
        # The bass has already been folded to sit low on the neck, so hold
        # its fingering there too rather than letting the position solver
        # wander up the fretboard for a pitch it can reach in first position.
        part_fret_cfg = fret_cfg
        if part.is_bass and settings.relieve_bass:
            part_fret_cfg = fretting.FretConfig(
                fret_count=settings.bass_comfort_fret
            )
        # Chord tones and the second voice share the part's fret limit.
        part.max_fret = part_limit = part_fret_cfg.fret_count
        for name in ("extras", "second"):
            spare = getattr(part, name)
            if not spare:
                continue
            moved, _ = arrange.transpose(
                [n.shifted(shift) for n in spare], shift_by,
                part.tuning, part_limit,
            )
            if name == "second":
                moved = arrange.enforce_monophony(moved, score.ppq, fold_cfg)
            # A chord tone or an inner-voice note can sit off the end of
            # the neck even when nothing was transposed. Fold it back by
            # octaves rather than letting the writer quietly turn it into
            # a rest -- no note is dropped for being out of range.
            moved, off_neck = arrange.clamp_octaves(
                moved, part.tuning, part_limit
            )
            pulled_back += off_neck
            setattr(part, name, rhythm.quantize(moved, score.ppq, grid))
        # Most double-stops are a stray sixteenth inside somebody's run.
        # Keep the held ones and the ones at endings; drop the rest.
        if settings.chords == "none":
            part.extras = []
        elif settings.chords != "all":
            part.extras = arrange.thin_chords(
                part.extras, part.notes, rhythm.GP_QUARTER,
                min_quarters=settings.chord_min_quarters,
            )
        spots = fretting.fret_part(
            quantised, part.tuning, rhythm.GP_QUARTER, part_fret_cfg
        )
        positions.append(spots)
        # Now that the line's fingering is known, drop the chord tones no
        # hand could reach alongside it.
        part.hand_span = settings.hand_span
        part.extras = _drop_unplayable_chords(part, spots, settings.hand_span)
        end_gp = max(end_gp, max((n.end for n in quantised), default=0))

    bars = rhythm.build_bars(score, score.end_tick)
    # Make sure the last sounding note has a bar to live in.
    while bars and bars[-1].end < end_gp:
        last = bars[-1]
        if last.length <= 0:
            break               # a bar of no length would never reach the end
        bars.append(rhythm.Bar(last.index + 1, last.end, last.numerator,
                               last.denominator))

    # A source with fewer voices than we have players leaves some parts
    # silent; an empty stave is clutter, so drop it.
    keep = [i for i, p in enumerate(parts) if p.notes or p.second]
    if keep and len(keep) < len(parts):
        parts = [parts[i] for i in keep]
        positions = [positions[i] for i in keep]
        relief_counts = [relief_counts[i] for i in keep]

    second_out = []
    for part in parts:
        laid_out.append(rhythm.lay_out(part.notes, bars, grid, part.extras,
                                       settings.ties == "few"))
        second_out.append(
            rhythm.lay_out(part.second, bars, grid, None,
                           settings.ties == "few") if part.second else None
        )

    tempo = settings.tempo or round(score.tempo_at(0))
    # An engraving often carries no tempo at all, so an explicit one
    # replaces the default rather than being written alongside it.
    tempo_changes = [] if settings.tempo else _tempo_changes(score, bars)
    song = gpout.build_song(
        parts,
        laid_out,
        second_out,
        positions,
        bars,
        title=settings.title or score.title,
        tempo=tempo,
        key=score.key,
        tempo_changes=tempo_changes,
        artist=settings.artist,
        credit=settings.credit,
        source=os.path.basename(midi_path),
    )
    gpout.write(song, out_path)

    return Report(
        arranged=parts,
        source=score,
        title=settings.title or score.title,
        source_notes=source_total,
        bars=len(bars),
        tempo=tempo,
        key=score.key,
        bass_tracks=bass_tracks,
        handed_off=handed_off,
        added_guitar=added_guitar,
        added_voices=plan.added_voices,
        pulled_back=pulled_back,
        parts=[
            PartReport(
                name=part.name,
                notes=len(part.notes),
                low=part.pitch_range[0],
                high=part.pitch_range[1],
                octave_shift=part.octave_shift,
                max_fret=max((f for _s, f in pos), default=0),
                open_strings=sum(1 for _s, f in pos if f == 0),
                sounding=(
                    sum(n.duration for n in part.notes) / span
                    if (span := max((n.end for p in parts for n in p.notes),
                                    default=0)) else 0.0
                ),
                relief_notes=relief,
                chord_notes=len(part.extras),
                second_notes=len(part.second),
            )
            for part, pos, relief in zip(parts, positions, relief_counts)
        ],
    )


@dataclass
class _Plan:
    """One deal of the piece's notes among a given number of players."""

    guitars: int
    parts: list
    streams: list
    prefolded: set[int]
    handed_off: int
    added_guitar: bool
    crowded: int             # notes with no line of their own to sit in
    added_voices: int = 0    # players added on top of the first estimate


def _plan_parts(score: Score, settings: Settings, bass_tracks: set[int]) -> _Plan:
    """Decide how many players the piece needs, and deal the notes out.

    A note no part can pick up as part of its line is not thrown away: it
    is written as a double-stop, or into the stave's second voice, where
    Guitar Pro draws it greyed out behind the main voice. That grey is the
    ensemble telling us it has run out of hands, and in the Passacaglia,
    BWV 582, it is everywhere -- the manuals pile up to five voices over
    the pedal, and three guitars and a bass lost 500 notes to it.

    So when the part count is ours to choose, the estimate is only a
    starting point: add a player, deal again, and keep the new arrangement
    as long as it rescues notes from the grey. Growth stops at
    `max_parts`, or as soon as another player stops rescuing anything.

    A double-stop the arrangement means to keep -- a third ringing under a
    cadence -- is not a note in trouble and does not ask for a player.
    """
    if settings.guitars > 0:
        return _assign_parts(score, settings, bass_tracks, settings.guitars)

    # One instrument per voice. Where the file already separates the
    # voices, trust its own count; otherwise infer it from how many notes
    # sound for most of the piece.
    if voices.is_per_voice(score, bass_tracks):
        needed = voices.track_voice_count(score)
    else:
        needed = voices.voice_count(score)
    cap = max(1, settings.max_parts - (1 if settings.bass else 0))
    guitars = max(1, min(needed - (1 if settings.bass else 0), cap))

    plan = _assign_parts(score, settings, bass_tracks, guitars)
    while plan.crowded and plan.guitars < cap:
        trial = _assign_parts(score, settings, bass_tracks, plan.guitars + 1)
        if trial.crowded >= plan.crowded:
            break
        trial.added_voices = trial.guitars - guitars
        plan = trial
    return plan


def _assign_parts(
    score: Score,
    settings: Settings,
    bass_tracks: set[int],
    guitars: int,
) -> _Plan:
    """Hand every source note to one of `guitars` guitars (plus the bass)."""
    n_parts = guitars + (1 if settings.bass else 0)
    if n_parts < 1:
        raise ValueError("need at least one part")

    streams = voices.separate(score, _voice_config(settings, n_parts), bass_tracks)
    parts = _make_parts(settings, n_parts, guitars)

    # Which source notes the separation could not place. Worked out here,
    # before the bass stage folds its line to a new octave: folding builds
    # fresh notes, so afterwards every pedal note looks unplaced and would
    # be written a second time as a double-stop on top of itself.
    placed = {id(n) for stream in streams for n in stream}
    leftovers = [n for n in score.notes if id(n) not in placed]

    prefolded: set[int] = set()
    handed_off = 0
    added_guitar = False
    # Not conditional on a detected pedal track: some files put the whole
    # texture on one MIDI track, and their bass part still belongs on a
    # guitar.
    if settings.bass and settings.bass_on_guitar and len(parts) > 1:
        parts, streams, prefolded, handed_off, added_guitar = _bass_onto_guitar(
            parts, streams, settings
        )
    elif settings.bass and settings.relieve_bass and len(parts) > 1:
        parts, streams, prefolded, handed_off, added_guitar = _relieve_bass(
            parts, streams, settings, score.ppq
        )
    # An orphaned run of notes goes to one guitar that is free for all of
    # it, so a line parked in a spare track stays in one pair of hands.
    leftovers = _place_orphan_lines(parts, streams, leftovers, score.ppq)
    # Whatever is left could not be taken monophonically at all; it is kept
    # as a second note on whichever part is already playing at that instant.
    lost = _assign_extras(parts, streams, leftovers, score.ppq,
                          min(arrange.TUNINGS[settings.guitar_tuning]))

    return _Plan(
        guitars=guitars,
        parts=parts,
        streams=streams,
        prefolded=prefolded,
        handed_off=handed_off,
        added_guitar=added_guitar,
        crowded=lost + _crowded(parts, streams, settings, score.ppq),
    )


def _crowded(parts: list[Part], streams: list, settings: Settings,
             ppq: int) -> int:
    """Notes this deal cannot write as part of anybody's line.

    Two ways that happens, and both are worth another player: a note
    lands in a stave's second voice, which Guitar Pro greys out behind
    the main one, or it lands on a beat as a double-stop that the chord
    filter is about to discard. A double-stop the filter would keep is a
    chord the arrangement means to write, so it does not count.
    """
    count = sum(len(part.second) for part in parts)
    if settings.chords == "all":
        return count
    for part, stream in zip(parts, streams):
        if not part.extras:
            continue
        if settings.chords == "none":
            count += len(part.extras)
            continue
        # The part's line is still in its stream at this stage; the notes
        # are only moved onto the part once the octaves are settled.
        kept = arrange.thin_chords(
            part.extras, stream, ppq,
            min_quarters=settings.chord_min_quarters,
        )
        count += len(part.extras) - len(kept)
    return count


def _bass_onto_guitar(parts, streams, settings):
    """Hand the pedal line to a guitar and leave the bass the remainder.

    The main voices stay on the higher guitars; an extra guitar takes over
    the pedal line at its written pitch, which works because almost all of
    it lies above a guitar's bottom string. Only the notes genuinely below
    that string fall through to the bass, so the bass part ends up small --
    which is the point.
    """
    bass_part = parts[-1]
    pedal = streams[-1]
    if not pedal:
        return parts, streams, {len(parts) - 1}, 0, False

    guitar_tuning = arrange.TUNINGS[settings.guitar_tuning]
    lowest = min(guitar_tuning)
    on_guitar = [n for n in pedal if n.pitch >= lowest]
    on_bass = [n for n in pedal if n.pitch < lowest]
    if not on_guitar:
        return parts, streams, {len(parts) - 1}, 0, False

    names = _guitar_names(len(parts))
    extra = Part(
        name=names[-1],
        tuning=list(guitar_tuning),
        midi_program=gpout.PROGRAMS[settings.guitar_program],
    )
    parts = parts[:-1] + [extra, bass_part]
    streams = streams[:-1] + [on_guitar, on_bass]
    # Both carry the pedal line at its written pitch; folding them would
    # drag the line into a different octave, so leave them where they are.
    prefolded = {len(parts) - 1, len(parts) - 2}
    return parts, streams, prefolded, len(on_guitar), True


def _relieve_bass(parts, streams, settings, ppq):
    """Keep the bass in the lower neck without breaking up its line.

    The pedal line is folded against a comfortable fret span rather than
    the whole neck, so whole phrases drop an octave where that helps. The
    bass keeps every note either way: nothing is handed to a guitar, which
    is what used to fragment a subject across players mid-statement.
    """
    bass_part = parts[-1]
    # Fold against a *comfortable* span rather than the whole neck, so a
    # phrase that would otherwise sit up at the 17th fret drops a whole
    # octave instead. Folding moves entire phrases, cut at the rests
    # between them, so the melodic shape survives intact -- which is what
    # matters in a fugue, where the pedal is stating the subject.
    comfort = arrange.FoldConfig(fret_count=settings.bass_comfort_fret)
    folded, shift = arrange.fold_into_range(
        streams[-1], bass_part.tuning, ppq, comfort,
        target=arrange.register_target(streams[-1], bass_part.tuning, comfort),
    )
    bass_part.octave_shift = shift

    ceiling = arrange.comfort_ceiling(bass_part.tuning, settings.bass_comfort_fret)
    keep, high = arrange.split_overreach(folded, ceiling)
    prefolded = {len(parts) - 1}
    if not high:
        streams[-1] = keep
        return parts, streams, prefolded, 0, False

    # The notes still poking above the span are not handed to whichever
    # guitar happens to be free at that instant: that is exactly what
    # fragments a subject across three players halfway through stating it.
    # They stay on the bass, dropped by octaves until they are playable.
    low = min(bass_part.tuning)
    for note in high:
        while note.pitch > ceiling and note.pitch - 12 >= low:
            note = note.shifted(-12)
        keep.append(note)
    keep.sort(key=lambda n: n.start)
    streams[-1] = keep
    return parts, streams, prefolded, 0, False


def _drop_unplayable_chords(part, positions, hand_span) -> list:
    """Keep only the double-stops a hand could actually hold, and hear.

    Two notes on one beat have to be stopped at the same instant. The
    second one needs its own string, and it has to sit close enough to the
    first that one hand covers both -- an open string excepted, since it
    costs no finger. A chord tone with nowhere to go was silently skipped
    when the file was written, which quietly overstated how much of the
    music had survived; now it is dropped here, where it is counted.

    A unison goes the same way. Two voices landing on the same pitch at
    the same instant is a doubling, not a chord: one guitar cannot sound
    it twice, and writing it as two notes on two strings would be a lie
    about what is heard.
    """
    if not part.extras or not part.notes:
        return []
    where: dict[int, tuple] = {}
    sounding: dict[int, int] = {}
    for note, spot in zip(sorted(part.notes, key=lambda n: n.start), positions):
        where.setdefault(note.start, spot)
        sounding.setdefault(note.start, note.pitch)
    kept = []
    for extra in part.extras:
        spot = where.get(extra.start)
        if spot is None or extra.pitch == sounding.get(extra.start):
            continue
        if fretting.position_beside(extra.pitch, part.tuning, part.max_fret,
                                    spot[0], spot[1], hand_span) is not None:
            kept.append(extra)
    return kept


def _span_free(stream, starts, lo, hi) -> bool:
    """Is this stream silent for the whole of [lo, hi)?"""
    at = bisect.bisect_left(starts, lo)
    if at < len(stream) and stream[at].start < hi:
        return False
    if at > 0 and stream[at - 1].end > lo:
        return False
    return True


def _orphan_runs(notes, ppq, gap_beats: float = 1.0):
    """Group unplaced notes into the runs they were written as."""
    by_track: dict[int, list] = {}
    for note in notes:
        by_track.setdefault(note.src_track, []).append(note)
    gap = int(ppq * gap_beats)
    runs = []
    for group in by_track.values():
        group.sort(key=lambda n: n.start)
        run = [group[0]]
        for note in group[1:]:
            if note.start - run[-1].end > gap:
                runs.append(run)
                run = [note]
            else:
                run.append(note)
        runs.append(run)
    return runs


def _place_orphan_lines(parts, streams, leftovers, ppq):
    """Give an orphaned run of notes to one silent guitar, whole.

    A track that is not a voice still holds real music: an engraving
    routinely parks a line in a spare track for a few bars, usually where
    the voices cross, and the voice whose guitar is free is exactly the
    one resting. Placing those notes one at a time as chord tones on
    whoever happens to be sounding shreds the line into fragments that
    jump between guitars mid-bar -- bar 13 of the Dorian toccata was three
    guitars trading a single run. Handing the whole run to one part that
    is silent for all of it keeps it in a single pair of hands.

    The voices themselves are never touched. Returns what found no home.
    """
    guitars = [i for i, p in enumerate(parts) if not p.is_bass]
    if not guitars:
        return leftovers
    starts = {i: [n.start for n in streams[i]] for i in guitars}
    centres = {}
    for i in guitars:
        centres[i] = (sum(n.pitch for n in streams[i]) / len(streams[i])
                      if streams[i] else None)

    rest = []
    # Longest runs first: they are the ones worth keeping whole.
    for run in sorted(_orphan_runs(leftovers, ppq), key=lambda r: -len(r)):
        if len(run) < 2:
            rest.extend(run)
            continue
        lo = min(n.start for n in run)
        hi = max(n.end for n in run)
        centre = sum(n.pitch for n in run) / len(run)
        # Of the guitars free for the whole run, take the one whose own
        # register is nearest, so the line lands in a sensible voice.
        free = [i for i in guitars if _span_free(streams[i], starts[i], lo, hi)]
        if not free:
            rest.extend(run)
            continue
        pick = min(free, key=lambda i: (abs(centres[i] - centre)
                                        if centres[i] is not None else 0.0))
        chosen, spare = voices.select_monophonic(run)
        for note in chosen:
            at = bisect.bisect_left(starts[pick], note.start)
            streams[pick].insert(at, note)
            starts[pick].insert(at, note.start)
        rest.extend(spare)
    return rest


def _assign_extras(parts, streams, leftovers, ppq, guitar_low) -> int:
    """Give each unplaceable note to a part that is already sounding.

    It becomes a second note on that part's beat -- the rare double-stop
    the arrangement allows -- rather than being thrown away. Onsets only
    have to agree to within a grid step, since both are about to be
    quantised onto the same one anyway.

    Returns how many notes even that could not save, which is the count
    the planner grows the ensemble against.
    """
    if not leftovers:
        return 0
    tolerance = max(1, ppq // 8)
    # Which part carries most of each source voice, so a displaced note
    # goes back to its own line rather than a stranger's.
    holding: dict[int, tuple[int, int]] = {}
    for index, stream in enumerate(streams):
        counts: dict[int, int] = {}
        for note in stream:
            counts[note.src_track] = counts.get(note.src_track, 0) + 1
        for track, count in counts.items():
            if track not in holding or count > holding[track][1]:
                holding[track] = (index, count)
    owner = {track: index for track, (index, _c) in holding.items()}

    tables = []
    for stream in streams:
        ordered = sorted(stream, key=lambda n: n.start)
        tables.append(([n.start for n in ordered], ordered))

    lost = 0
    for note in leftovers:
        best = best_key = None
        for index, (starts, ordered) in enumerate(tables):
            # A double-stop on the bass is only justified when the note is
            # out of a guitar's reach; otherwise leave the bass alone.
            if parts[index].is_bass and note.pitch >= guitar_low:
                continue
            at = bisect.bisect_left(starts, note.start)
            for candidate in ordered[max(0, at - 1):at + 1]:
                offset = abs(candidate.start - note.start)
                if offset > tolerance or candidate.pitch == note.pitch:
                    continue
                key = (offset, abs(candidate.pitch - note.pitch))
                if best_key is None or key < best_key:
                    best, best_key = (index, candidate.start), key
        if best is not None:
            index, host_start = best
            # Same instant as a note already there: a double-stop.
            parts[index].extras.append(replace(note, start=host_start))
            continue
        # Otherwise it starts partway through a held note, which is not a
        # chord at all -- it belongs in the stave's second voice, on the
        # part that owns this line.
        index = owner.get(note.src_track)
        if index is None or (parts[index].is_bass and note.pitch >= guitar_low):
            lost += 1
            continue
        parts[index].second.append(note)
    return lost


def _relief_counts(parts, streams, settings):
    """How many notes each part is covering on the bass's behalf."""
    ceiling = arrange.comfort_ceiling(
        parts[-1].tuning, settings.bass_comfort_fret
    )
    counts = []
    for part, stream in zip(parts, streams):
        if part.is_bass:
            counts.append(0)
        else:
            counts.append(sum(1 for n in stream if n.pitch <= ceiling))
    return counts


def _voice_config(settings: Settings, n_parts: int) -> voices.VoiceConfig:
    cfg = voices.VoiceConfig(**vars(settings.voice_config))
    cfg.n_parts = n_parts
    return cfg


def _make_parts(settings: Settings, n_parts: int, guitars: int) -> list[Part]:
    guitar_tuning = arrange.TUNINGS[settings.guitar_tuning]
    bass_tuning = arrange.TUNINGS[settings.bass_tuning]
    names = _guitar_names(guitars)
    parts = [
        Part(
            name=names[i],
            tuning=list(guitar_tuning),
            midi_program=gpout.PROGRAMS[settings.guitar_program],
        )
        for i in range(guitars)
    ]
    if settings.bass:
        parts.append(
            Part(
                name="Bass",
                is_bass=True,
                tuning=list(bass_tuning),
                midi_program=gpout.PROGRAMS[settings.bass_program],
            )
        )
    return parts[:n_parts]


def _guitar_names(count: int) -> list[str]:
    romans = ["I", "II", "III", "IV", "V", "VI"]
    if count == 1:
        return ["Guitar"]
    return [f"Guitar {romans[i]}" if i < len(romans) else f"Guitar {i + 1}"
            for i in range(count)]


def _clip_bars(score: Score, settings: Settings) -> Score:
    if settings.from_bar is None and settings.to_bar is None:
        return score
    starts = midi_in.bar_starts(score)
    first = max(1, settings.from_bar or 1)
    start_tick = starts[min(first - 1, len(starts) - 1)]
    if settings.to_bar is None:
        end_tick = None
    else:
        idx = min(settings.to_bar, len(starts) - 1)
        end_tick = starts[idx] if idx < len(starts) else None
    return midi_in.clip_to_ticks(score, start_tick, end_tick)


def _tempo_changes(score: Score, bars: list[rhythm.Bar]) -> list[tuple[int, int]]:
    """Map tempo events onto bar indices for the mix-table markings."""
    if len(score.tempos) < 2:
        return []
    src_starts, tick = [], 0
    for bar in bars:
        src_starts.append(tick)
        tick += int(score.ppq * 4 * bar.numerator / bar.denominator)

    out, seen = [], {round(score.tempo_at(0))}
    for event in score.tempos[1:]:
        bpm = round(event.bpm)
        index = 0
        for i, start in enumerate(src_starts):
            if start <= event.tick:
                index = i
            else:
                break
        if bpm not in seen or (out and out[-1][1] != bpm):
            out.append((index, bpm))
            seen.add(bpm)
    return out
