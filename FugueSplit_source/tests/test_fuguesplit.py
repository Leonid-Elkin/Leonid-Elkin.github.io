"""Test suite for FugueSplit.

Run with:  python -m unittest discover -s tests -v
"""

from __future__ import annotations

import itertools
import os
import random
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import guitarpro as gp
import mido
from guitarpro import models as M

from fuguesplit import (arrange, check, compare, fretting, hungarian,
                        midi_in, musicxml_in, pipeline, rhythm, verify,
                        voices)
from fuguesplit.pipeline import (Settings, convert, read_source,
                                 _drop_unplayable_chords)
from fuguesplit.score import (Note, Part, Score, TempoEvent,
                              TimeSigEvent)

BWV544 = r"C:\Users\walru\Downloads\BWV_0544.mid"


class TestHungarian(unittest.TestCase):
    def test_matches_brute_force(self):
        random.seed(7)
        for _ in range(200):
            rows = random.randint(1, 5)
            cols = random.randint(rows, rows + 3)
            cost = [[random.randint(0, 40) for _ in range(cols)]
                    for _ in range(rows)]
            got = hungarian.solve(cost)
            self.assertEqual(len(set(got)), rows, "columns must be distinct")
            mine = sum(cost[i][got[i]] for i in range(rows))
            best = min(
                sum(cost[i][p[i]] for i in range(rows))
                for p in itertools.permutations(range(cols), rows)
            )
            self.assertEqual(mine, best)

    def test_rejects_too_few_columns(self):
        with self.assertRaises(ValueError):
            hungarian.solve([[1, 2], [3, 4], [5, 6]])


class TestRhythm(unittest.TestCase):
    def test_spans_reconstruct_exactly(self):
        for beat in (960, 1440):
            for offset in range(0, 3840, 120):
                for length in range(120, 3840 - offset + 1, 120):
                    beats = rhythm._emit(offset, length, 60, False, beat)
                    self.assertEqual(
                        sum(b.ticks for b in beats), length,
                        f"offset={offset} length={length} beat={beat}",
                    )

    def test_notation_choices(self):
        def spell(offset, length, beat=960, fewest=True):
            return " ".join(
                ("." if b.dotted else "") + str(b.value) + ("~" if b.tie else "")
                for b in rhythm._emit(offset, length, 60, False, beat, fewest)
            )

        self.assertEqual(spell(0, 3840), "1")            # whole bar of 4/4
        self.assertEqual(spell(0, 2880, 1440), ".2")     # whole bar of 6/8
        self.assertEqual(spell(0, 1440), ".4")           # dotted qtr on beat 1
        self.assertEqual(spell(360, 240), "16")          # sub-beat syncopation

    def test_a_tie_is_only_written_where_one_is_needed(self):
        """The default spells a length as one note wherever it can."""
        def spell(offset, length, beat=960, fewest=True):
            return " ".join(
                ("." if b.dotted else "") + str(b.value) + ("~" if b.tie else "")
                for b in rhythm._emit(offset, length, 60, False, beat, fewest)
            )

        # A dotted quarter on beat 2 is a dotted quarter, not two tied notes.
        self.assertEqual(spell(960, 1440), ".4")
        self.assertEqual(spell(960, 1440, fewest=False), "4 8~")
        # A half note on beat 2 is a half note.
        self.assertEqual(spell(960, 1920), "2")
        self.assertEqual(spell(960, 1920, fewest=False), "4 4~")
        # Splitting at the beat is what the old policy was for.
        self.assertEqual(spell(480, 960, fewest=False), "8 8~")
        self.assertEqual(spell(480, 960), "4")

    def test_fewest_ties_never_writes_more_pieces(self):
        """Whatever the span, the default is never the wordier spelling."""
        for beat in (960, 1440):
            for offset in range(0, 3840, 120):
                for length in range(120, 3840 - offset + 1, 120):
                    few = rhythm._emit(offset, length, 60, False, beat, True)
                    many = rhythm._emit(offset, length, 60, False, beat, False)
                    self.assertLessEqual(len(few), len(many),
                                         f"offset={offset} length={length}")
                    self.assertEqual(sum(b.ticks for b in few), length)

    def test_ties_only_after_the_first_piece(self):
        beats = rhythm._emit(0, 1200, 60, False, 960)
        self.assertFalse(beats[0].tie)
        self.assertTrue(all(b.tie for b in beats[1:]))

    def test_carried_note_starts_tied(self):
        beats = rhythm._emit(0, 960, 60, True, 960)
        self.assertTrue(beats[0].tie)

    def test_rests_are_never_tied(self):
        beats = rhythm._emit(0, 1200, None, False, 960)
        self.assertTrue(all(not b.tie for b in beats))

    def test_compound_metre_beat(self):
        self.assertEqual(rhythm.Bar(0, 0, 6, 8).beat_ticks, 1440)
        self.assertEqual(rhythm.Bar(0, 0, 4, 4).beat_ticks, 960)
        self.assertEqual(rhythm.Bar(0, 0, 3, 4).beat_ticks, 960)

    def test_quantize_snaps_and_declicks(self):
        # A note a hair short of an eighth should become exactly an eighth.
        notes = [Note(60, 0, 190, 90), Note(62, 192, 380, 90)]
        out = rhythm.quantize(notes, 384, rhythm.grid_ticks("32nd"))
        self.assertEqual([(n.start, n.end) for n in out], [(0, 480), (480, 960)])

    def test_quantize_never_leaves_overlaps(self):
        notes = [Note(60, 0, 400, 90), Note(62, 100, 400, 90)]
        out = rhythm.quantize(notes, 384, rhythm.grid_ticks("32nd"))
        for a, b in zip(out, out[1:]):
            self.assertLessEqual(a.end, b.start)


class TestArrange(unittest.TestCase):
    def test_folds_a_pedal_line_into_bass_range(self):
        # An organ pedal part sitting well below a bass guitar.
        notes = [Note(24 + (i % 5), i * 480, i * 480 + 480, 90) for i in range(20)]
        tuning = arrange.TUNINGS["bass"]
        lo, hi = arrange.playable_range(tuning, 22)
        folded, shift = arrange.fold_into_range(
            notes, tuning, 480, arrange.FoldConfig()
        )
        self.assertNotEqual(shift, 0, "should have moved the part up an octave")
        for note in folded:
            self.assertTrue(lo <= note.pitch <= hi)
        # Folding transposes; it must not change the melodic shape.
        self.assertEqual(
            [b.pitch - a.pitch for a, b in zip(notes, notes[1:])],
            [b.pitch - a.pitch for a, b in zip(folded, folded[1:])],
        )

    def test_fold_prefers_one_octave_for_the_whole_phrase(self):
        notes = [Note(20 + i, i * 240, i * 240 + 240, 90) for i in range(12)]
        folded, _ = arrange.fold_into_range(
            notes, arrange.TUNINGS["bass"], 480, arrange.FoldConfig()
        )
        shifts = {f.pitch - n.pitch for n, f in zip(notes, folded)}
        self.assertEqual(len(shifts), 1, "phrase should move as a unit")

    def test_octave_changes_are_rare(self):
        """Changing octave mid-part is audible as a leap, so the fold should
        commit to one octave unless a phrase genuinely cannot fit."""
        # A line that wanders just enough to tempt the fold to hop octaves.
        pitches = []
        pitch = 60
        for i in range(400):
            pitch += (3 if (i // 20) % 2 == 0 else -3)
            pitches.append(max(45, min(80, pitch)))
        notes = [Note(p, i * 240, i * 240 + 240, 90)
                 for i, p in enumerate(pitches)]
        folded, _ = arrange.fold_into_range(
            notes, arrange.TUNINGS["standard"], 480, arrange.FoldConfig()
        )
        shifts = [f.pitch - n.pitch for n, f in zip(notes, folded)]
        changes = sum(1 for a, b in zip(shifts, shifts[1:]) if a != b)
        self.assertLessEqual(changes, 2, "the part is hopping octaves")

    def test_monophony_truncates_overlaps(self):
        notes = [Note(60, 0, 960, 90), Note(64, 480, 1440, 90)]
        out = arrange.enforce_monophony(notes, 480, arrange.FoldConfig())
        self.assertEqual([(n.start, n.end) for n in out], [(0, 480), (480, 1440)])

    def test_monophony_collapses_same_onset(self):
        chord = [Note(60, 0, 960, 90), Note(64, 0, 960, 90), Note(67, 0, 960, 90)]
        out = arrange.enforce_monophony(chord, 480, arrange.FoldConfig())
        self.assertEqual(len(out), 1)

    def test_monophony_drops_slivers(self):
        # Truncating the first note against the second leaves 10 ticks,
        # far below a 32nd; that stub should be dropped, not written.
        notes = [Note(60, 0, 960, 90), Note(62, 10, 1400, 90)]
        out = arrange.enforce_monophony(notes, 480, arrange.FoldConfig())
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0].pitch, 62)


class TestFretting(unittest.TestCase):
    def test_positions_reproduce_the_pitch(self):
        tuning = arrange.TUNINGS["standard"]
        notes = [Note(52 + (i * 3) % 24, i * 240, i * 240 + 240, 90)
                 for i in range(60)]
        positions = fretting.fret_part(notes, tuning, 960, fretting.FretConfig())
        for (string, fret), note in zip(positions, notes):
            self.assertEqual(tuning[string] + fret, note.pitch)

    def test_moves_the_hand_less_than_the_naive_choice(self):
        """The point of the solver: less hand travel than just taking the
        first string that reaches each note."""
        tuning = arrange.TUNINGS["standard"]
        random.seed(3)
        pitches, pitch = [], 60
        for _ in range(200):
            pitch = max(45, min(79, pitch + random.choice([-5, -2, -1, 1, 2, 5])))
            pitches.append(pitch)
        notes = [Note(p, i * 240, i * 240 + 240, 90)
                 for i, p in enumerate(pitches)]

        cfg = fretting.FretConfig()
        smart = fretting.fret_part(notes, tuning, 960, cfg)
        naive = [fretting.positions_for(n.pitch, tuning, cfg.fret_count)[0]
                 for n in notes]

        def travel(positions):
            return sum(abs(b[1] - a[1])
                       for a, b in zip(positions, positions[1:])
                       if a[1] and b[1])

        self.assertLess(travel(smart), travel(naive))

    def test_unreachable_pitch_is_reported(self):
        with self.assertRaises(ValueError):
            fretting.fret_part(
                [Note(12, 0, 240, 90)], arrange.TUNINGS["standard"], 960,
                fretting.FretConfig(),
            )


class TestVoices(unittest.TestCase):
    def _score(self, notes, ppq=480, names=None):
        return Score(ppq=ppq, notes=notes, tempos=[TempoEvent(0, 120)],
                     time_sigs=[TimeSigEvent(0, 4, 4)],
                     track_names=names or {})

    def test_splits_a_chord_across_parts(self):
        chord = [Note(72, 0, 480, 90), Note(67, 0, 480, 90), Note(60, 0, 480, 90)]
        streams = voices.separate(self._score(chord), voices.VoiceConfig(n_parts=3))
        self.assertEqual([len(s) for s in streams], [1, 1, 1])
        self.assertEqual([s[0].pitch for s in streams], [72, 67, 60])

    def test_keeps_a_line_on_one_part(self):
        # Two clearly separated lines, interleaved in time.
        notes = []
        for i in range(16):
            notes.append(Note(72 + (i % 3), i * 240, i * 240 + 240, 90))
            notes.append(Note(48 + (i % 3), i * 240, i * 240 + 240, 90))
        streams = voices.separate(self._score(notes), voices.VoiceConfig(n_parts=2))
        self.assertTrue(all(n.pitch >= 72 for n in streams[0]))
        self.assertTrue(all(n.pitch <= 50 for n in streams[1]))

    def test_detects_a_named_pedal_track(self):
        notes = [Note(60, 0, 480, 90, src_track=1),
                 Note(36, 0, 480, 90, src_track=2)]
        score = self._score(notes, names={1: "MANUAL", 2: "PEDAL"})
        self.assertEqual(voices.detect_bass_tracks(score), {2})

    def test_detects_an_unnamed_low_track(self):
        notes = [Note(70 + i % 4, i * 240, i * 240 + 240, 90, src_track=1)
                 for i in range(20)]
        notes += [Note(40 + i % 4, i * 240, i * 240 + 240, 90, src_track=2)
                  for i in range(20)]
        self.assertEqual(voices.detect_bass_tracks(self._score(notes)), {2})

    def test_bass_track_is_routed_whole(self):
        notes = [Note(70, i * 240, i * 240 + 240, 90, src_track=1) for i in range(8)]
        notes += [Note(40, i * 240, i * 240 + 240, 90, src_track=2)
                  for i in range(8)]
        score = self._score(notes, names={2: "PEDAL"})
        streams = voices.separate(score, voices.VoiceConfig(n_parts=3), {2})
        self.assertEqual(len(streams[-1]), 8)
        self.assertTrue(all(n.pitch == 40 for n in streams[-1]))

    def test_drops_the_least_important_note_when_oversubscribed(self):
        chord = [Note(p, 0, 480, 90) for p in (72, 67, 64, 60)]
        streams = voices.separate(
            self._score(chord), voices.VoiceConfig(mode="balanced", n_parts=2)
        )
        kept = sorted(n.pitch for s in streams for n in s)
        self.assertEqual(kept, [60, 72], "outer voices survive")


class TestCascade(unittest.TestCase):
    def _score(self, notes):
        return Score(ppq=480, notes=notes, tempos=[TempoEvent(0, 120)],
                     time_sigs=[TimeSigEvent(0, 4, 4)])

    def test_parts_are_strictly_non_overlapping(self):
        notes = []
        for i in range(80):
            for base in (72, 64, 55):
                notes.append(Note(base + (i % 4), i * 240, i * 240 + 240, 90))
        streams = voices.separate(
            self._score(notes), voices.VoiceConfig(mode="cascade", n_parts=3)
        )
        for stream in streams:
            for a, b in zip(stream, stream[1:]):
                self.assertLessEqual(a.end, b.start, "cascade must not overlap")

    def test_first_part_takes_the_most(self):
        notes = []
        for i in range(80):
            for base in (72, 64, 55):
                notes.append(Note(base + (i % 4), i * 240, i * 240 + 240, 90))
        streams = voices.separate(
            self._score(notes), voices.VoiceConfig(mode="cascade", n_parts=3)
        )
        self.assertGreaterEqual(len(streams[0]), len(streams[1]))
        self.assertGreaterEqual(len(streams[1]), len(streams[2]))

    def test_first_part_is_maximal(self):
        """Nothing left over could have been added to the first part."""
        notes = [Note(60 + i % 7, i * 100, i * 100 + 250, 90) for i in range(60)]
        streams = voices.separate(
            self._score(notes), voices.VoiceConfig(mode="cascade", n_parts=2)
        )
        lead = streams[0]
        for other in streams[1]:
            clash = any(other.start < n.end and n.start < other.end for n in lead)
            self.assertTrue(clash, "a leftover note could have fitted on Guitar I")

    def test_single_line_stays_intact(self):
        notes = [Note(60 + i % 5, i * 240, i * 240 + 240, 90) for i in range(40)]
        streams = voices.separate(
            self._score(notes), voices.VoiceConfig(mode="cascade", n_parts=3)
        )
        self.assertEqual(len(streams[0]), 40)
        self.assertEqual(streams[1], [])

    def test_bass_track_still_routed(self):
        notes = [Note(70, i * 240, i * 240 + 240, 90, src_track=1)
                 for i in range(8)]
        notes += [Note(40, i * 240, i * 240 + 240, 90, src_track=2)
                  for i in range(8)]
        score = Score(ppq=480, notes=notes, tempos=[TempoEvent(0, 120)],
                      time_sigs=[TimeSigEvent(0, 4, 4)],
                      track_names={2: "PEDAL"})
        streams = voices.separate(
            score, voices.VoiceConfig(mode="cascade", n_parts=3), {2}
        )
        self.assertTrue(all(n.pitch == 40 for n in streams[-1]))
        self.assertEqual(len(streams[-1]), 8)

    def test_rejects_an_unknown_mode(self):
        with self.assertRaises(ValueError):
            voices.separate(self._score([Note(60, 0, 240, 90)]),
                            voices.VoiceConfig(mode="sideways"))


class TestFlowPriority(unittest.TestCase):
    def _busy_score(self):
        """Two voices throughout, a third only half the time.

        Three parts against this must leave somebody resting, which is the
        choice the flow ladder exists to make. The voices deliberately sit
        in overlapping registers: where registers are far apart, register
        affinity decides who plays and flow has no room to act.
        """
        notes = []
        for i in range(200):
            for base in (63, 60):
                notes.append(Note(base + (i % 3), i * 240, i * 240 + 240, 90))
            if i % 2 == 0:
                notes.append(Note(61 + (i % 3), i * 240, i * 240 + 240, 90))
        return Score(ppq=480, notes=notes, tempos=[TempoEvent(0, 120)],
                     time_sigs=[TimeSigEvent(0, 4, 4)])

    def _coverage(self, score, **kwargs):
        span = score.end_tick
        streams = voices.separate(
            score, voices.VoiceConfig(mode="balanced", n_parts=3, **kwargs)
        )
        return [sum(n.duration for n in s) / span for s in streams]

    def test_lead_part_plays_more_than_the_fillers(self):
        cover = self._coverage(self._busy_score(), w_flow=20,
                               flow_priority="top")
        self.assertGreater(cover[0], cover[-1])
        self.assertGreaterEqual(cover[0], cover[1])
        self.assertGreaterEqual(cover[1], cover[2])

    def test_bottom_priority_reverses_the_ladder(self):
        cover = self._coverage(self._busy_score(), w_flow=20,
                               flow_priority="bottom")
        self.assertGreater(cover[-1], cover[0])
        self.assertGreaterEqual(cover[2], cover[1])
        self.assertGreaterEqual(cover[1], cover[0])

    def test_zero_weight_keeps_parts_even(self):
        cover = sorted(self._coverage(self._busy_score(), w_flow=0))
        self.assertLess(cover[-1] - cover[0], 0.15)

    def test_register_still_beats_flow_when_voices_are_far_apart(self):
        """Flow must not drag the lead guitar down onto the bass line just
        to keep it busy; a clearly separate register wins."""
        notes = []
        for i in range(200):
            for base in (72, 55):
                notes.append(Note(base + (i % 3), i * 240, i * 240 + 240, 90))
        score = Score(ppq=480, notes=notes, tempos=[TempoEvent(0, 120)],
                      time_sigs=[TimeSigEvent(0, 4, 4)])
        streams = voices.separate(
            score, voices.VoiceConfig(mode="balanced", n_parts=3, w_flow=20)
        )
        self.assertTrue(all(n.pitch >= 72 for n in streams[0]))
        self.assertTrue(all(n.pitch <= 57 for n in streams[2] if streams[2]))

    def test_rejects_an_unknown_priority(self):
        with self.assertRaises(ValueError):
            voices.separate(
                self._busy_score(),
                voices.VoiceConfig(mode="balanced", n_parts=3,
                                   flow_priority="sideways"),
            )

    def test_flow_does_not_wreck_voice_leading(self):
        """Feeding the lead part must not turn its line into leaps."""
        score = self._busy_score()
        streams = voices.separate(
            score, voices.VoiceConfig(n_parts=3, w_flow=20)
        )
        leaps = [abs(b.pitch - a.pitch)
                 for a, b in zip(streams[0], streams[0][1:])]
        self.assertLessEqual(sorted(leaps)[len(leaps) // 2], 4)


class TestBassRelief(unittest.TestCase):
    def test_hand_off_skips_a_busy_stream(self):
        busy = [Note(60, 0, 480, 90)]
        free = []
        leftover = arrange.hand_off([Note(70, 100, 300, 90)], [busy, free], [0, 1])
        self.assertEqual(leftover, [])
        self.assertEqual(len(busy), 1, "must not collide")
        self.assertEqual(len(free), 1)

    def test_hand_off_reports_what_nobody_can_take(self):
        busy = [Note(60, 0, 480, 90)]
        leftover = arrange.hand_off([Note(70, 100, 300, 90)], [busy], [0])
        self.assertEqual(len(leftover), 1)

    def test_hand_off_keeps_streams_sorted(self):
        stream = [Note(60, 0, 100, 90), Note(61, 900, 1000, 90)]
        arrange.hand_off([Note(70, 400, 500, 90)], [stream], [0])
        self.assertEqual([n.start for n in stream], [0, 400, 900])

    def test_split_overreach(self):
        ceiling = arrange.comfort_ceiling(arrange.TUNINGS["bass"], 12)
        self.assertEqual(ceiling, 55)
        keep, high = arrange.split_overreach(
            [Note(50, 0, 100, 90), Note(60, 100, 200, 90)], ceiling
        )
        self.assertEqual([n.pitch for n in keep], [50])
        self.assertEqual([n.pitch for n in high], [60])

    def test_fold_without_clamp_leaves_strays(self):
        notes = [Note(20, 0, 480, 90), Note(90, 480, 960, 90)]
        folded, _ = arrange.fold_into_range(
            notes, arrange.TUNINGS["bass"], 480, arrange.FoldConfig(), clamp=False
        )
        lo, hi = arrange.playable_range(arrange.TUNINGS["bass"], 22)
        self.assertTrue(any(n.pitch < lo or n.pitch > hi for n in folded))

    def test_pedal_line_stays_on_the_bass_by_default(self):
        """The bass plays the bottom voice; no guitar is added to take it."""
        with tempfile.TemporaryDirectory() as d:
            src = os.path.join(d, "canon.mid")
            dst = os.path.join(d, "canon.gp5")
            _make_test_midi(src)
            report = convert(src, dst, Settings(guitars=2))
            bass = [p for p in report.parts if p.name == "Bass"]
            self.assertTrue(bass, "the bass part should be kept")
            self.assertTrue(bass[0].notes, "the bass should carry the line")
            self.assertFalse(report.added_guitar,
                             "no extra guitar should be added for the bass")
            self.assertEqual(
                len([p for p in report.parts if p.name.startswith("Guitar")]),
                2, "the ensemble should stay the size it was asked for")
            self.assertTrue(any(p.notes for p in report.parts))

    def test_guitar_count_follows_the_voice_count(self):
        """One instrument per voice: a stray track is not a voice."""
        with tempfile.TemporaryDirectory() as d:
            src = os.path.join(d, "canon.mid")
            dst = os.path.join(d, "canon.gp5")
            _make_test_midi(src)
            report = convert(src, dst, Settings())
            score = midi_in.read_midi(src)
            self.assertEqual(len(report.parts),
                             voices.track_voice_count(score)
                             if voices.is_per_voice(
                                 score, voices.detect_bass_tracks(score))
                             else voices.voice_count(score))

    def test_track_voice_count_ignores_stray_tracks(self):
        """A track sounding for a sliver of the piece is not a voice."""
        notes = [Note(60, t, t + 480, 90, src_track=0)
                 for t in range(0, 480 * 40, 480)]
        notes += [Note(72, t, t + 480, 90, src_track=1)
                  for t in range(0, 480 * 40, 480)]
        # Two notes in a corner: a doubling, not a third voice.
        notes += [Note(67, 0, 480, 90, src_track=2),
                  Note(67, 480, 960, 90, src_track=2)]
        score = Score(ppq=480, notes=notes)
        self.assertEqual(voices.track_voice_count(score), 2)

    def test_bass_stays_in_the_lower_neck(self):
        with tempfile.TemporaryDirectory() as d:
            src = os.path.join(d, "canon.mid")
            dst = os.path.join(d, "canon.gp5")
            _make_test_midi(src)
            convert(src, dst, Settings(guitars=2, bass_comfort_fret=12,
                                       bass_on_guitar=False))
            song = gp.parse(dst)
            bass = [t for t in song.tracks if t.name == "Bass"][0]
            frets = [n.value for m in bass.measures
                     for b in m.voices[0].beats for n in b.notes]
            self.assertTrue(frets)
            self.assertLessEqual(max(frets), 12)


class TestMidiIn(unittest.TestCase):
    def test_key_parsing(self):
        self.assertEqual(midi_in._parse_key("D"), (2, 0))
        self.assertEqual(midi_in._parse_key("Bm"), (2, 1))
        self.assertEqual(midi_in._parse_key("Eb"), (-3, 0))
        self.assertEqual(midi_in._parse_key("Cm"), (-3, 1))

    def test_overlapping_same_pitch_notes_pair_up(self):
        mid = mido.MidiFile(ticks_per_beat=480)
        track = mido.MidiTrack()
        mid.tracks.append(track)
        track.append(mido.Message("note_on", note=60, velocity=90, time=0))
        track.append(mido.Message("note_on", note=60, velocity=90, time=240))
        track.append(mido.Message("note_off", note=60, time=240))
        track.append(mido.Message("note_off", note=60, time=240))
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "t.mid")
            mid.save(path)
            score = midi_in.read_midi(path)
        self.assertEqual(len(score.notes), 2)
        self.assertEqual(sorted((n.start, n.end) for n in score.notes),
                         [(0, 480), (240, 720)])

    def test_clip_carries_the_metre_in_force(self):
        score = Score(
            ppq=480,
            notes=[Note(60, 1920, 2400, 90)],
            tempos=[TempoEvent(0, 60), TempoEvent(1920, 90)],
            time_sigs=[TimeSigEvent(0, 3, 4)],
        )
        clipped = midi_in.clip_to_ticks(score, 1920, None)
        self.assertEqual(clipped.time_sig_at(0), (3, 4))
        self.assertEqual(clipped.tempo_at(0), 90)
        self.assertEqual(clipped.notes[0].start, 0)


def _make_test_midi(path: str) -> None:
    """A little three-voice canon with a pedal-style bass track."""
    mid = mido.MidiFile(ticks_per_beat=480)
    meta = mido.MidiTrack()
    meta.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(96), time=0))
    meta.append(mido.MetaMessage("time_signature", numerator=4, denominator=4,
                                 time=0))
    meta.append(mido.MetaMessage("key_signature", key="G", time=0))
    mid.tracks.append(meta)

    subject = [0, 2, 4, 5, 7, 5, 4, 2]
    for name, base, delay in [("MANUAL", 72, 0), ("MANUAL", 64, 480),
                              ("PEDAL", 43, 960)]:
        track = mido.MidiTrack()
        track.append(mido.MetaMessage("track_name", name=name, time=0))
        prev = 0
        for rep in range(4):
            for i, step in enumerate(subject):
                on = delay + (rep * 8 + i) * 480
                track.append(mido.Message("note_on", note=base + step,
                                          velocity=90, time=on - prev))
                track.append(mido.Message("note_off", note=base + step,
                                          time=460))
                prev = on + 460
        mid.tracks.append(track)
    mid.save(path)


class TestEndToEnd(unittest.TestCase):
    def _read_back(self, path):
        song = gp.parse(path)
        out = []
        for track in song.tracks:
            tuning = [s.value for s in track.strings]
            notes, tick = [], rhythm.GP_QUARTER
            for measure in track.measures:
                header = measure.header
                bar_len = (rhythm.WHOLE * header.timeSignature.numerator
                           // header.timeSignature.denominator.value)
                filled = 0
                for beat in measure.voices[0].beats:
                    ticks = rhythm.WHOLE // beat.duration.value
                    if beat.duration.isDotted:
                        ticks = ticks * 3 // 2
                    for note in beat.notes:
                        if note.type != M.NoteType.tie:
                            notes.append((tick, tuning[note.string - 1] + note.value))
                    tick += ticks
                    filled += ticks
                self.assertEqual(filled, bar_len,
                                 f"bar {header.number} of {track.name} is not full")
            out.append((track, notes))
        return song, out

    def test_synthetic_canon_round_trips(self):
        with tempfile.TemporaryDirectory() as d:
            src = os.path.join(d, "canon.mid")
            dst = os.path.join(d, "canon.gp5")
            _make_test_midi(src)
            report = convert(src, dst, Settings(guitars=2, bass=True))

            self.assertTrue(os.path.exists(dst))
            # 2 guitars plus one covering the pedal line; the bass is only
            # kept if something is too low for a guitar.
            self.assertGreaterEqual(len(report.parts), 3)
            self.assertTrue(all(p.notes for p in report.parts))
            # The pedal track should have been spotted by name.
            self.assertTrue(report.bass_tracks)

            song, tracks = self._read_back(dst)
            self.assertEqual(song.tempo, 96)
            self.assertEqual(len(song.tracks), len(report.parts))
            self.assertEqual(song.key, M.KeySignature.GMajor)
            for (track, notes), part in zip(tracks, report.parts):
                self.assertEqual(len(notes), part.notes)
                self.assertEqual(track.name, part.name)

    def test_every_part_is_monophonic(self):
        with tempfile.TemporaryDirectory() as d:
            src = os.path.join(d, "canon.mid")
            dst = os.path.join(d, "canon.gp5")
            _make_test_midi(src)
            convert(src, dst, Settings(guitars=2, bass=True))
            song = gp.parse(dst)
            for track in song.tracks:
                for measure in track.measures:
                    for beat in measure.voices[0].beats:
                        self.assertLessEqual(
                            len(beat.notes), 1,
                            f"{track.name} bar {measure.header.number} has a chord",
                        )

    def test_bar_range_selection(self):
        with tempfile.TemporaryDirectory() as d:
            src = os.path.join(d, "canon.mid")
            _make_test_midi(src)
            full = convert(src, os.path.join(d, "a.gp5"), Settings())
            part = convert(src, os.path.join(d, "b.gp5"),
                           Settings(from_bar=3, to_bar=6))
            self.assertEqual(part.bars, 4)
            self.assertLess(part.bars, full.bars)

    def test_notes_stay_inside_the_tuning(self):
        with tempfile.TemporaryDirectory() as d:
            src = os.path.join(d, "canon.mid")
            dst = os.path.join(d, "canon.gp5")
            _make_test_midi(src)
            convert(src, dst, Settings(guitars=2, fret_count=22))
            song = gp.parse(dst)
            for track in song.tracks:
                for measure in track.measures:
                    for beat in measure.voices[0].beats:
                        for note in beat.notes:
                            self.assertTrue(0 <= note.value <= 22)
                            self.assertTrue(1 <= note.string <= len(track.strings))


def _make_thick_midi(path: str, lines: int = 4) -> None:
    """A stack of staggered manual lines over a pedal, all on one track.

    The Passacaglia's problem in miniature: several voices sounding at
    once, entering off each other's beats, with nothing in the file to
    say which note belongs to which line.
    """
    mid = mido.MidiFile(ticks_per_beat=480)
    meta = mido.MidiTrack()
    meta.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(80), time=0))
    meta.append(mido.MetaMessage("time_signature", numerator=4, denominator=4,
                                 time=0))
    mid.tracks.append(meta)

    subject = [0, 2, 3, 5, 7, 5, 3, 2]
    entries = [(79, 0), (74, 120), (69, 240), (64, 360), (60, 60)][:lines]

    manual = mido.MidiTrack()
    manual.append(mido.MetaMessage("track_name", name="MANUAL", time=0))
    events = []
    for base, delay in entries:
        for rep in range(6):
            for i, step in enumerate(subject):
                on = delay + (rep * 8 + i) * 480
                events.append((on, "note_on", base + step))
                events.append((on + 460, "note_off", base + step))
    events.sort()
    prev = 0
    for tick, kind, pitch in events:
        manual.append(mido.Message(kind, note=pitch, velocity=90,
                                   time=tick - prev))
        prev = tick
    mid.tracks.append(manual)

    pedal = mido.MidiTrack()
    pedal.append(mido.MetaMessage("track_name", name="PEDAL", time=0))
    prev = 0
    for rep in range(6):
        for i, step in enumerate(subject):
            on = (rep * 8 + i) * 480
            pedal.append(mido.Message("note_on", note=40 + step, velocity=90,
                                      time=on - prev))
            pedal.append(mido.Message("note_off", note=40 + step, time=440))
            prev = on + 440
    mid.tracks.append(pedal)
    mid.save(path)


class TestThickTexture(unittest.TestCase):
    """A note with no line to sit in gets a player, not a grey second voice."""

    def _convert(self, settings, lines=4):
        with tempfile.TemporaryDirectory() as d:
            src = os.path.join(d, "thick.mid")
            dst = os.path.join(d, "thick.gp5")
            _make_thick_midi(src, lines)
            return convert(src, dst, settings)

    def _guitars(self, report):
        return len([p for p in report.parts if p.name.startswith("Guitar")])

    def test_a_thick_texture_is_written_as_lines(self):
        report = self._convert(Settings())
        self.assertGreaterEqual(self._guitars(report), 4,
                                "one guitar per voice")
        self.assertEqual(report.second_voice, 0,
                         "nothing should be left greyed into a second voice")
        self.assertEqual(report.written_notes, report.source_notes,
                         "no note should be thrown away")

    def test_a_fixed_ensemble_greys_what_it_cannot_place(self):
        """Ask for two guitars and the notes over that are still kept --
        as a second voice, which is exactly what growing avoids."""
        report = self._convert(Settings(guitars=2))
        self.assertEqual(self._guitars(report), 2,
                         "an explicit ensemble size is never grown")
        self.assertGreater(report.second_voice, 0)

    def test_more_players_rescue_notes_from_the_grey(self):
        """Room for more players means fewer notes greyed into voice two.

        This used to assert that the ensemble *grew past its estimate*, but
        a player now has to earn the stand: growth is refused when it would
        rescue only a note or two. On this texture the estimate is already
        right, so nothing is added and nothing should be.
        """
        thin = self._convert(Settings(max_parts=3), lines=5)
        grown = self._convert(Settings(max_parts=7), lines=5)
        self.assertGreater(self._guitars(grown), self._guitars(thin))
        self.assertLess(grown.second_voice, thin.second_voice)

    def test_a_player_is_not_seated_to_rescue_a_note_or_two(self):
        """The stand has to be worth turning up for.

        Accepting any improvement at all put a guitarist on BWV 664c who
        played five notes in the whole piece. A new player must rescue at
        least a hundredth of the music.
        """
        report = self._convert(Settings(max_parts=7), lines=5)
        busiest = max(p.notes for p in report.parts)
        for part in report.parts:
            self.assertGreater(
                part.notes, max(4, busiest * 0.01),
                f"{part.name} barely plays; it should not have been seated")

    def test_the_default_band_is_a_five_piece(self):
        """Four guitars and a bass. Past that it stops being a band.

        A thick texture can always use one more player, so without a
        ceiling the arranger will seat a seventh guitarist to cover a
        handful of notes. Five is the size that keeps every part worth
        turning up for.
        """
        report = self._convert(Settings(), lines=7)
        self.assertLessEqual(len(report.parts), 5)

    def test_growth_stops_at_max_parts(self):
        report = self._convert(Settings(max_parts=3), lines=5)
        self.assertLessEqual(len(report.parts), 3)

    def test_a_thin_texture_is_not_grown(self):
        """Two voices need two players, however high the ceiling is."""
        with tempfile.TemporaryDirectory() as d:
            src = os.path.join(d, "canon.mid")
            dst = os.path.join(d, "canon.gp5")
            _make_test_midi(src)
            report = convert(src, dst, Settings(max_parts=7))
            self.assertLessEqual(len(report.parts), 4)
            self.assertEqual(report.added_voices, 0)


# A two-bar scrap of engraving: a pickup bar, two voices on one staff and
# a third on another, a tie across the bar line and a chord.
MUSICXML = """<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Manual</part-name></score-part>
    <score-part id="P2"><part-name>Pedal</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="0">
      <attributes>
        <divisions>480</divisions>
        <key><fifths>-3</fifths><mode>minor</mode></key>
        <time><beats>3</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
      </attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch>
        <duration>480</duration><voice>1</voice><staff>1</staff></note>
    </measure>
    <measure number="1">
      <note><pitch><step>E</step><alter>-1</alter><octave>5</octave></pitch>
        <duration>960</duration><voice>1</voice><staff>1</staff>
        <tie type="start"/></note>
      <note><pitch><step>G</step><octave>4</octave></pitch>
        <duration>480</duration><voice>1</voice><staff>1</staff></note>
      <backup><duration>1440</duration></backup>
      <note><pitch><step>G</step><octave>3</octave></pitch>
        <duration>1440</duration><voice>2</voice><staff>1</staff></note>
      <backup><duration>1440</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch>
        <duration>1440</duration><voice>5</voice><staff>2</staff></note>
      <note><chord/><pitch><step>E</step><alter>-1</alter><octave>3</octave></pitch>
        <duration>1440</duration><voice>5</voice><staff>2</staff></note>
    </measure>
    <measure number="2">
      <note><pitch><step>E</step><alter>-1</alter><octave>5</octave></pitch>
        <duration>480</duration><voice>1</voice><staff>1</staff>
        <tie type="stop"/></note>
      <note><rest/><duration>960</duration><voice>1</voice><staff>1</staff></note>
      <backup><duration>1440</duration></backup>
      <note><rest/><duration>1440</duration><voice>2</voice><staff>1</staff></note>
      <backup><duration>1440</duration></backup>
      <note><rest/><duration>1440</duration><voice>5</voice><staff>2</staff></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="0">
      <attributes><divisions>480</divisions>
        <time><beats>3</beats><beat-type>4</beat-type></time></attributes>
      <note><rest/><duration>480</duration><voice>1</voice></note>
    </measure>
    <measure number="1">
      <note><pitch><step>C</step><octave>2</octave></pitch>
        <duration>1440</duration><voice>1</voice></note>
    </measure>
    <measure number="2">
      <note><pitch><step>G</step><octave>1</octave></pitch>
        <duration>1440</duration><voice>1</voice></note>
    </measure>
  </part>
</score-partwise>
"""


def _write_musicxml(path: str) -> None:
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(MUSICXML)


class TestMusicXML(unittest.TestCase):
    """An engraving already knows what the separator would have to guess."""

    def _score(self, name="score.xml"):
        directory = tempfile.mkdtemp()
        path = os.path.join(directory, name)
        _write_musicxml(path)
        return musicxml_in.read_musicxml(path), path

    def test_every_voice_becomes_its_own_track(self):
        score, _path = self._score()
        self.assertEqual(len(score.notes_by_track()), 4,
                         "two voices on the top staff, one below, one pedal")
        self.assertEqual(sorted(score.track_names.values()),
                         ["Manual s1 v1", "Manual s1 v2", "Manual s2 v5",
                          "Pedal s1 v1"])

    def test_a_tie_is_one_note(self):
        score, _path = self._score()
        held = [n for n in score.notes if n.pitch == 75]
        self.assertEqual(len(held), 1, "the tied Eb is a single note")
        self.assertEqual(held[0].duration, 960 + 480)

    def test_a_chord_keeps_its_onset(self):
        score, _path = self._score()
        starts = {n.start for n in score.notes if n.pitch in (48, 51)}
        self.assertEqual(len(starts), 1, "both chord tones start together")

    def test_the_pickup_bar_keeps_its_own_length(self):
        score, _path = self._score()
        signatures = [(e.tick, e.numerator, e.denominator)
                      for e in score.time_sigs]
        self.assertEqual(signatures[0], (0, 1, 4), "a one-beat pickup bar")
        self.assertEqual(signatures[1], (480, 3, 4))
        bars = rhythm.build_bars(score, score.end_tick)
        self.assertEqual(bars[0].length, rhythm.GP_QUARTER)
        # So the first full bar starts where the engraving puts it, rather
        # than a whole bar of the new metre later.
        self.assertEqual(bars[1].start, rhythm.GP_QUARTER)

    def test_the_key_comes_from_the_engraving(self):
        score, _path = self._score()
        self.assertEqual(score.key, (-3, 1))

    def test_the_reader_is_chosen_by_suffix(self):
        score, path = self._score()
        self.assertEqual(len(read_source(path).notes), len(score.notes))

    def test_a_zipped_engraving_reads_the_same(self):
        score, path = self._score()
        zipped = os.path.join(os.path.dirname(path), "score.mxl")
        with zipfile.ZipFile(zipped, "w") as archive:
            archive.write(path, "score.xml")
        self.assertEqual(len(musicxml_in.read_musicxml(zipped).notes),
                         len(score.notes))

    def test_an_engraving_is_believed_even_where_voices_overlap(self):
        """A voice with a double-stop in it is still one voice."""
        notes = [Note(60, 0, 960, 90, src_track=0),
                 Note(64, 480, 1440, 90, src_track=0),
                 Note(48, 0, 960, 90, src_track=1)]
        notes += [Note(62, t, t + 480, 90, src_track=0)
                  for t in range(1920, 1920 + 480 * 8, 480)]
        notes += [Note(50, t, t + 480, 90, src_track=1)
                  for t in range(1920, 1920 + 480 * 8, 480)]
        guessed = Score(ppq=480, notes=notes)
        self.assertFalse(voices.is_per_voice(guessed, set()),
                         "inferred from the notes, the overlaps look like "
                         "two voices sharing a track")
        engraved = Score(ppq=480, notes=notes, engraved=True)
        self.assertTrue(voices.is_per_voice(engraved, set()))

    def test_the_bottom_part_is_taken_for_the_pedal(self):
        """Voices are compared part by part, not one at a time.

        A manual voice dipping below the pedal for a bar used to sink the
        register test and leave the whole pedal line on the guitars.
        """
        notes = []
        for track, channel, base_pitch in ((0, 0, 72), (1, 0, 60), (2, 1, 43)):
            notes += [Note(base_pitch + (i % 5), i * 480, i * 480 + 480, 90,
                           src_track=track, src_channel=channel)
                      for i in range(20)]
        # One manual note far below the pedal, as a voice crossing gives.
        notes.append(Note(38, 0, 480, 90, src_track=1, src_channel=0))
        score = Score(ppq=480, notes=notes, engraved=True)
        self.assertEqual(voices.detect_bass_tracks(score), {2})

    def test_one_voice_one_guitar_all_the_way_through(self):
        """The point of reading an engraving: no part changes voice."""
        _score, path = self._score()
        with tempfile.TemporaryDirectory() as d:
            report = convert(path, os.path.join(d, "out.gp5"), Settings())
            self.assertEqual(check.tally(check.audit(report))[0], 0,
                             "no note should be played by another voice's part")
            source = {n.uid: n for n in report.source.notes}
            for part in report.arranged:
                tracks = {source[n.uid].src_track for n in part.notes
                          if n.uid in source}
                self.assertLessEqual(len(tracks), 1,
                                     f"{part.name} plays more than one voice")


class TestChordTones(unittest.TestCase):
    """A double-stop is only kept if a hand could hold it and an ear hear it."""

    def _part(self, extras):
        part = Part(name="Guitar I", tuning=list(arrange.TUNINGS["standard"]))
        part.notes = [Note(50, 0, 960, 90)]      # open D, third string
        part.extras = extras
        part.max_fret = 22
        return part

    def test_a_unison_is_dropped_rather_than_doubled(self):
        """Two voices on the same note is a doubling, not a chord."""
        part = self._part([Note(50, 0, 960, 90)])
        self.assertEqual(_drop_unplayable_chords(part, [(2, 0)], 4), [])

    def test_a_reachable_second_note_is_kept(self):
        part = self._part([Note(57, 0, 960, 90)])
        kept = _drop_unplayable_chords(part, [(2, 0)], 4)
        self.assertEqual([n.pitch for n in kept], [57])

    def test_a_note_the_hand_cannot_reach_is_dropped(self):
        """With the hand up at the 10th fret, a low F needs the other end."""
        part = self._part([Note(41, 0, 960, 90)])
        part.notes = [Note(60, 0, 960, 90)]
        self.assertEqual(_drop_unplayable_chords(part, [(2, 10)], 4), [])


class TestVerify(unittest.TestCase):
    """Every written note has to trace back to the note it came from."""

    def test_a_finished_tab_matches_its_source(self):
        with tempfile.TemporaryDirectory() as d:
            src = os.path.join(d, "canon.mid")
            tab = os.path.join(d, "canon.gp5")
            _make_test_midi(src)
            report = convert(src, tab, Settings())
            audit = verify.verify(report, tab)
            self.assertTrue(audit.ok, "; ".join(str(p) for p in audit.problems))
            self.assertEqual(audit.traced, audit.written_notes)
            self.assertEqual(audit.missing, [])

    def test_an_engraved_source_is_written_whole(self):
        directory = tempfile.mkdtemp()
        path = os.path.join(directory, "score.xml")
        _write_musicxml(path)
        tab = os.path.join(directory, "score.gp5")
        report = convert(path, tab, Settings())
        audit = verify.verify(report, tab)
        self.assertTrue(audit.ok, "; ".join(str(p) for p in audit.problems))
        self.assertEqual(audit.missing, [])

    def test_a_doctored_tab_is_caught(self):
        """The audit reads the file, so a wrong note in it must show up."""
        with tempfile.TemporaryDirectory() as d:
            src = os.path.join(d, "canon.mid")
            tab = os.path.join(d, "canon.gp5")
            _make_test_midi(src)
            report = convert(src, tab, Settings())
            song = gp.parse(tab)
            for track in song.tracks:
                for measure in track.measures:
                    hit = next((b for b in measure.voices[0].beats if b.notes),
                               None)
                    if hit is not None:
                        hit.notes[0].value += 1      # a semitone out
                        break
                else:
                    continue
                break
            gp.write(song, tab, version=(5, 1, 0))
            audit = verify.verify(report, tab)
            self.assertFalse(audit.ok)
            self.assertTrue(any(p.kind == "pitch" for p in audit.problems))


@unittest.skipUnless(os.path.exists(BWV544), "BWV 544 test file not present")
class TestBWV544(unittest.TestCase):
    """The real thing: Bach's Prelude and Fugue in B minor."""

    def test_pedal_track_is_detected(self):
        score = midi_in.read_midi(BWV544)
        detected = voices.detect_bass_tracks(score)
        self.assertTrue(detected)
        self.assertTrue(
            all("PEDAL" in score.track_names.get(t, "") for t in detected)
        )

    def test_voices_move_stepwise(self):
        """A correct split recovers real counterpoint, so intervals between
        consecutive notes in a part should almost always be small."""
        score = midi_in.read_midi(BWV544)
        streams = voices.separate(
            score, voices.VoiceConfig(mode="balanced", n_parts=4),
            voices.detect_bass_tracks(score),
        )
        for stream in streams:
            leaps = [abs(b.pitch - a.pitch) for a, b in zip(stream, stream[1:])]
            big = sum(1 for leap in leaps if leap > 12)
            self.assertLess(big / len(leaps), 0.02,
                            "too many octave-plus leaps for a real voice")

    def test_bass_never_leaves_the_lower_neck(self):
        with tempfile.TemporaryDirectory() as d:
            dst = os.path.join(d, "bwv544.gp5")
            convert(BWV544, dst, Settings(bass_comfort_fret=12,
                                          bass_on_guitar=False))
            song = gp.parse(dst)
            bass = [t for t in song.tracks if t.name == "Bass"][0]
            frets = [n.value for m in bass.measures
                     for b in m.voices[0].beats for n in b.notes]
            self.assertLessEqual(max(frets), 12)

    def test_cascade_front_loads_the_first_guitar(self):
        """Cascade mode: Guitar I takes as much as it can play, then II."""
        with tempfile.TemporaryDirectory() as d:
            report = convert(BWV544, os.path.join(d, "f.gp5"), Settings(
                guitars=3, voice_config=voices.VoiceConfig(mode="cascade")))
            guitars = [p for p in report.parts
                       if not p.name.startswith("Bass")]
            self.assertGreater(guitars[0].notes, guitars[1].notes)
            self.assertGreater(guitars[1].notes, guitars[2].notes)

    def test_balanced_mode_shares_the_work(self):
        with tempfile.TemporaryDirectory() as d:
            report = convert(BWV544, os.path.join(d, "f.gp5"), Settings(
                bass_on_guitar=False,
                voice_config=voices.VoiceConfig(mode="balanced")))
            cover = sorted(p.sounding for p in report.parts
                           if not p.name.startswith("Bass") and p.notes > 50)
            self.assertLess(cover[-1] - cover[0], 0.2)

    def test_flow_priority_is_available_on_request(self):
        with tempfile.TemporaryDirectory() as d:
            report = convert(BWV544, os.path.join(d, "f.gp5"), Settings(
                voice_config=voices.VoiceConfig(w_flow=20)))
            guitars = [p for p in report.parts
                       if not p.name.startswith("Bass") and p.notes > 50]
            self.assertGreater(guitars[0].sounding, guitars[-1].sounding)

    def test_full_conversion_is_faithful(self):
        with tempfile.TemporaryDirectory() as d:
            dst = os.path.join(d, "bwv544.gp5")
            report = convert(BWV544, dst, Settings(guitars=3, bass=True))
            # 3 guitars + bass, plus a spare guitar if the bass needed one.
            self.assertIn(len(report.parts), (4, 5))
            # Keeping lines intact costs some notes: a guitar holding a
            # resting voice cannot also cover another one.
            self.assertGreater(report.written_notes / report.source_notes, 0.85)

            song = gp.parse(dst)
            self.assertEqual(len(song.tracks), len(report.parts))
            for track in song.tracks:
                for measure in track.measures:
                    bar_len = (rhythm.WHOLE * measure.header.timeSignature.numerator
                               // measure.header.timeSignature.denominator.value)
                    total = 0
                    for beat in measure.voices[0].beats:
                        ticks = rhythm.WHOLE // beat.duration.value
                        if beat.duration.isDotted:
                            ticks = ticks * 3 // 2
                        total += ticks
                    self.assertEqual(total, bar_len)

    def test_default_is_close_to_the_source(self):
        """The whole point: the tab should hold nearly every source note."""
        with tempfile.TemporaryDirectory() as d:
            report = convert(BWV544, os.path.join(d, "d.gp5"), Settings())
            self.assertGreater(
                report.written_notes / report.source_notes, 0.97
            )

    def test_empty_parts_are_not_written(self):
        with tempfile.TemporaryDirectory() as d:
            report = convert(BWV544, os.path.join(d, "e.gp5"), Settings())
            for part in report.parts:
                self.assertGreater(part.notes, 0, f"{part.name} is empty")

    def test_balanced_mode_keeps_almost_every_note(self):
        """Sharing the voices out loses least; that is its trade."""
        with tempfile.TemporaryDirectory() as d:
            report = convert(BWV544, os.path.join(d, "b.gp5"), Settings(
                voice_config=voices.VoiceConfig(mode="balanced")))
            self.assertGreater(
                report.written_notes / report.source_notes, 0.97
            )

    def test_nothing_is_thrown_away(self):
        """Almost every source note reaches the tab.

        Reading the file voice by voice costs a little here: a voice's own
        double-stops can no longer be farmed out to whichever guitar
        happens to be free, because that would split the voice. They come
        back as chord tones instead, and the few that find no host are the
        only notes lost.
        """
        with tempfile.TemporaryDirectory() as d:
            dst = os.path.join(d, "x.gp5")
            report = convert(BWV544, dst, Settings())
            self.assertGreater(
                report.written_notes / report.source_notes, 0.99
            )

    def test_chords_stay_rare_on_the_real_thing(self):
        """Double-stops stay the exception, not the texture."""
        with tempfile.TemporaryDirectory() as d:
            report = convert(BWV544, os.path.join(d, "y.gp5"), Settings())
            self.assertLess(report.chords / report.source_notes, 0.02)

    def test_short_rests_are_filled_and_real_rests_are_not(self):
        """A note rings across a sixteenth rest, not across a half rest."""
        q = 960
        notes = [
            Note(60, 0, q // 2, 90),           # then a half-beat rest
            Note(62, q, q + q // 2, 90),       # then a three-beat rest
            Note(64, 4 * q, 5 * q, 90),
        ]
        out = arrange.fill_short_rests(notes, q, 1.0)
        self.assertEqual(out[0].end, q, "the short rest should be filled")
        self.assertEqual(out[1].end, q + q // 2,
                         "a three-beat rest is real and must be left alone")
        self.assertEqual([n.pitch for n in out], [60, 62, 64])
        self.assertEqual([n.start for n in out], [0, q, 4 * q],
                         "filling must never move an onset")

    def test_filling_is_off_when_asked(self):
        q = 960
        notes = [Note(60, 0, q // 2, 90), Note(62, q, 2 * q, 90)]
        out = arrange.fill_short_rests(notes, q, 0)
        self.assertEqual(out[0].end, q // 2)

    def test_the_checker_finds_a_broken_run(self):
        """check.gaps reports a rest another part plays through."""
        with tempfile.TemporaryDirectory() as d:
            src_mid = os.path.join(d, "canon.mid")
            _make_test_midi(src_mid)
            report = convert(src_mid, os.path.join(d, "c.gp5"),
                             Settings(legato_quarters=0))
            found = check.gaps(report)
            self.assertIsInstance(found, list)
            for gap in found:
                self.assertGreater(gap.rest_quarters, 0)
                self.assertGreaterEqual(gap.bar, 1)

    def test_filling_reduces_broken_runs(self):
        """The marker must actually respond to the fix."""
        with tempfile.TemporaryDirectory() as d:
            src_mid = os.path.join(d, "canon.mid")
            _make_test_midi(src_mid)
            raw = check.gaps(convert(src_mid, os.path.join(d, "a.gp5"),
                                     Settings(legato_quarters=0)))
            filled = check.gaps(convert(src_mid, os.path.join(d, "b.gp5"),
                                        Settings(legato_quarters=1.0)))
            self.assertLessEqual(len(filled), len(raw))

    def test_audit_says_nothing_it_cannot_verify(self):
        """No per-part ground truth means no misplacement claims."""
        with tempfile.TemporaryDirectory() as d:
            src_mid = os.path.join(d, "canon.mid")
            _make_test_midi(src_mid)
            report = convert(src_mid, os.path.join(d, "c.gp5"), Settings())
            for hole in check.audit(report):
                self.assertIsInstance(hole.part, str)

    def test_nothing_is_ever_moved_by_less_than_an_octave(self):
        """Folding may move a line; it must never alter its shape.

        Any displacement that is not a whole number of octaves changes the
        interval a listener hears, which no stage is allowed to do.
        """
        with tempfile.TemporaryDirectory() as d:
            src_mid = os.path.join(d, "canon.mid")
            _make_test_midi(src_mid)
            report = convert(src_mid, os.path.join(d, "c.gp5"), Settings())
            result = compare.compare(report)
            self.assertEqual(result.off_pitch, 0)
            self.assertGreater(result.kept, 0)
            self.assertEqual(result.kept + result.lost, result.source_notes)

    def test_comparison_notices_a_note_that_never_arrives(self):
        """The comparison must be able to fail, or it proves nothing."""
        with tempfile.TemporaryDirectory() as d:
            src_mid = os.path.join(d, "canon.mid")
            _make_test_midi(src_mid)
            report = convert(src_mid, os.path.join(d, "c.gp5"), Settings())
            # Drop a note from every part and confirm it is reported lost.
            before = compare.compare(report).lost
            for part in report.arranged:
                if part.notes:
                    part.notes = part.notes[1:]
            self.assertGreater(compare.compare(report).lost, before)

    def test_a_held_chord_tone_survives_a_passing_one_does_not(self):
        """Keep the chords that ring; drop the ones inside a run."""
        q = 960
        line = [Note(60, t, t + q // 4, 90) for t in range(0, 8 * q, q // 4)]
        passing = Note(64, q, q + q // 4, 90)        # short, mid-run
        held = Note(67, 2 * q, 4 * q, 90)            # two beats long
        kept = arrange.thin_chords([passing, held], line, q)
        self.assertIn(held, kept, "a held chord tone should be kept")
        self.assertNotIn(passing, kept,
                         "a passing sixteenth should not be written")

    def test_a_short_chord_tone_at_an_ending_survives(self):
        """A rest after it makes it an ending, not clutter."""
        q = 960
        line = [Note(60, 0, q // 4, 90), Note(62, q // 4, q // 2, 90)]
        cadence = Note(67, q // 4, q // 2, 90)   # short, but nothing follows
        kept = arrange.thin_chords([cadence], line, q)
        self.assertEqual(kept, [cadence])

    def test_chords_none_writes_strictly_one_note_at_a_time(self):
        with tempfile.TemporaryDirectory() as d:
            src_mid = os.path.join(d, "canon.mid")
            _make_test_midi(src_mid)
            report = convert(src_mid, os.path.join(d, "c.gp5"),
                             Settings(chords="none"))
            self.assertEqual(report.chords, 0)

    def test_thinning_chords_never_touches_the_lines(self):
        """Dropping double-stops must not disturb a single part note."""
        with tempfile.TemporaryDirectory() as d:
            src_mid = os.path.join(d, "canon.mid")
            _make_test_midi(src_mid)
            a = convert(src_mid, os.path.join(d, "a.gp5"), Settings(chords="all"))
            b = convert(src_mid, os.path.join(d, "b.gp5"), Settings(chords="some"))
            self.assertEqual([p.notes for p in a.parts],
                             [p.notes for p in b.parts])
            self.assertLessEqual(b.chords, a.chords)

    def test_a_chord_tone_out_of_the_hand_s_reach_is_refused(self):
        """Two notes on a beat must be holdable by one hand."""
        tuning = arrange.TUNINGS["standard"]
        # Hand at the 1st fret; a pitch only reachable high up the neck.
        far = fretting.position_beside(88, tuning, 22, 5, 1, hand_span=4)
        self.assertIsNone(far, "an out-of-reach chord tone must be refused")
        near = fretting.position_beside(64, tuning, 22, 5, 1, hand_span=4)
        self.assertIsNotNone(near, "a nearby one should still be placed")
        self.assertLessEqual(abs(near[1] - 1), 4)

    def test_an_open_string_is_always_within_reach(self):
        """An open string costs no finger, however far the hand is."""
        tuning = arrange.TUNINGS["standard"]
        spot = fretting.position_beside(
            min(tuning), tuning, 22, 3, 15, hand_span=4)
        self.assertIsNotNone(spot)
        self.assertEqual(spot[1], 0)

    def test_the_reported_chord_count_is_what_the_file_holds(self):
        """Chords the writer could not place must not be counted as kept."""
        with tempfile.TemporaryDirectory() as d:
            src_mid = os.path.join(d, "canon.mid")
            dst = os.path.join(d, "c.gp5")
            _make_test_midi(src_mid)
            report = convert(src_mid, dst, Settings())
            song = gp.parse(dst)
            written = 0
            for track in song.tracks:
                for measure in track.measures:
                    for beat in measure.voices[0].beats:
                        written += max(0, len(beat.notes) - 1)
            self.assertEqual(written, report.chords)

    def test_a_note_below_the_neck_is_raised_not_dropped(self):
        """Out of range is never a reason to lose a note."""
        tuning = arrange.TUNINGS["standard"]
        low, high = arrange.playable_range(tuning, 22)
        notes = [Note(low - 14, 0, 480, 90), Note(high + 5, 480, 960, 90)]
        out, moved = arrange.clamp_octaves(notes, tuning, 22)
        self.assertEqual(len(out), 2, "no note may be dropped")
        self.assertEqual(moved, 2)
        for before, after in zip(notes, out):
            self.assertGreaterEqual(after.pitch, low)
            self.assertLessEqual(after.pitch, high)
            self.assertEqual((after.pitch - before.pitch) % 12, 0,
                             "it may only move by whole octaves")
            self.assertEqual(after.start, before.start)

    def test_clamping_leaves_notes_already_in_range_alone(self):
        tuning = arrange.TUNINGS["standard"]
        notes = [Note(50, 0, 480, 90), Note(60, 480, 960, 90)]
        out, moved = arrange.clamp_octaves(notes, tuning, 22)
        self.assertEqual(moved, 0)
        self.assertEqual([n.pitch for n in out], [50, 60])

    def test_no_note_is_lost_for_being_out_of_range(self):
        with tempfile.TemporaryDirectory() as d:
            src_mid = os.path.join(d, "canon.mid")
            _make_test_midi(src_mid)
            report = convert(src_mid, os.path.join(d, "c.gp5"), Settings())
            result = compare.compare(report)
            self.assertEqual(result.lost_too_low, 0)
            self.assertEqual(result.lost_too_high, 0)

    def test_a_bar_of_no_length_cannot_hang_the_writer(self):
        """A 0/4 marks a free interlude, not a metre.

        Chorale settings use it for a passage that is not counted in bars.
        Taken literally it makes a bar of no length, and the loop that
        extends the last bar to cover the final note then never finishes.
        """
        score = Score(ppq=480, notes=[Note(60, 0, 480, 90)])
        score.time_sigs = [TimeSigEvent(0, 4, 4), TimeSigEvent(480, 0, 4)]
        bars = rhythm.build_bars(score, score.end_tick)
        self.assertTrue(bars)
        self.assertTrue(all(b.length > 0 for b in bars),
                        "no bar may have zero length")

    def test_a_non_metre_time_signature_is_ignored_on_read(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "free.mid")
            mid = mido.MidiFile(ticks_per_beat=480)
            track = mido.MidiTrack()
            mid.tracks.append(track)
            track.append(mido.MetaMessage("time_signature", numerator=4,
                                          denominator=4, time=0))
            track.append(mido.MetaMessage("time_signature", numerator=0,
                                          denominator=4, time=480))
            track.append(mido.Message("note_on", note=60, velocity=90, time=0))
            track.append(mido.Message("note_off", note=60, velocity=0, time=480))
            mid.save(path)
            score = midi_in.read_midi(path)
            self.assertTrue(all(e.numerator >= 1 and e.denominator >= 1
                                for e in score.time_sigs),
                            "a 0/4 should never reach the score")

    def test_a_guitar_with_a_handful_of_notes_is_folded_away(self):
        """Nobody stands up for eleven notes if somebody else is free."""
        q = 480
        # Three real voices, and a stray note that sounds while one of them
        # happens to be resting -- so it can be taken without a collision.
        notes = []
        for v, pitch in enumerate((72, 67, 60)):
            for k in range(24):
                t = k * q
                notes.append(Note(pitch, t, t + q // 2, 90, src_track=v))
        notes.append(Note(64, 6 * q + q // 2, 7 * q, 90, src_track=3))
        score = Score(ppq=q, notes=notes)
        parts = [Part(name=f"Guitar {i}") for i in range(4)]
        streams = [[n for n in notes if n.src_track == i] for i in range(4)]
        kept, out, prefolded, spilled = pipeline._condense_thin_parts(
            parts, streams, set(), Settings())
        self.assertEqual(spilled, [], "no note may be lost condensing")
        self.assertEqual(len(kept), 3, "the one-note part should be gone")
        self.assertEqual(sum(len(s) for s in out), len(notes),
                         "every note must survive on some part")

    def test_a_sparse_part_that_truly_collides_is_left_alone(self):
        """A voice that sounds against all the others is a voice.

        Sparse but real: more notes than the handful the arranger treats
        as an artefact, and every one of them sounding while the other
        parts play, so there is nowhere to put them.
        """
        q = 480
        notes = []
        for v, pitch in enumerate((72, 67, 60)):
            for k in range(24):
                t = k * q
                notes.append(Note(pitch, t, t + q, 90, src_track=v))
        # these sound exactly when every other part is playing
        for k in range(8):
            notes.append(Note(64, k * q, k * q + q, 90, src_track=3))
        parts = [Part(name=f"Guitar {i}") for i in range(4)]
        streams = [[n for n in notes if n.src_track == i] for i in range(4)]
        kept, out, _pf, spilled = pipeline._condense_thin_parts(
            parts, streams, set(), Settings())
        self.assertEqual(spilled, [], "a real voice loses nothing")
        self.assertEqual(len(kept), 4, "it cannot be absorbed, so it stays")

    def test_a_three_note_part_is_not_treated_as_a_voice(self):
        """Below a handful of notes it is an artefact of the guess."""
        q = 480
        notes = []
        for v, pitch in enumerate((72, 67, 60)):
            for k in range(24):
                t = k * q
                notes.append(Note(pitch, t, t + q, 90, src_track=v))
        for k in range(3):
            notes.append(Note(64, k * q, k * q + q, 90, src_track=3))
        parts = [Part(name=f"Guitar {i}") for i in range(4)]
        streams = [[n for n in notes if n.src_track == i] for i in range(4)]
        kept, _out, _pf, _spilled = pipeline._condense_thin_parts(
            parts, streams, set(), Settings())
        self.assertEqual(len(kept), 3, "three notes do not earn a stand")

    def test_the_pedal_line_is_never_fragmented_across_guitars(self):
        """A pedal phrase that sits too high drops an octave on the bass.

        The alternative -- handing those notes to whichever guitar happens
        to be silent -- splits a subject between three players halfway
        through stating it, which is audible and wrong.
        """
        score = midi_in.read_midi(BWV544)
        pedal = voices.detect_bass_tracks(score)
        self.assertTrue(pedal, "BWV 544 has a pedal track")
        written = sum(len(ns) for ti, ns in score.notes_by_track().items()
                      if ti in pedal)
        with tempfile.TemporaryDirectory() as d:
            report = convert(BWV544, os.path.join(d, "p.gp5"), Settings())
        self.assertEqual(report.handed_off, 0,
                         "no pedal note should move onto a guitar")
        bass = [p for p in report.parts if p.name.startswith("Bass")]
        self.assertTrue(bass, "the bass part should be kept")
        self.assertLessEqual(bass[0].max_fret, 12,
                             "the bass should stay in the lower neck")
        self.assertGreater(bass[0].notes / written, 0.98,
                           "the bass should keep its whole line")

    def test_each_part_holds_one_voice_and_only_that_voice(self):
        """A per-voice source is read literally: no part mixes two voices.

        This is the whole point of engraved-per-voice input -- the kind
        Mutopia publishes. Every note a part plays comes from the one
        source track that part represents, so no passage is ever handed
        between instruments.
        """
        score = midi_in.read_midi(BWV544)
        bass = voices.detect_bass_tracks(score)
        self.assertTrue(voices.is_per_voice(score, bass),
                        "BWV 544 is engraved voice by voice")
        n = voices.track_voice_count(score)
        streams = voices.separate(
            score, voices.VoiceConfig(mode="auto", n_parts=n), bass
        )
        for index, stream in enumerate(streams):
            if not stream:
                continue
            tracks = {note.src_track for note in stream}
            self.assertEqual(
                len(tracks), 1,
                f"part {index} mixes source voices {sorted(tracks)}")

    def test_voice_mode_keeps_lines_on_one_guitar(self):
        """The point of the default mode: a line is not swapped between
        players halfway through."""
        score = midi_in.read_midi(BWV544)
        bass = voices.detect_bass_tracks(score)
        labels = voices.detect_voices(score, voices.VoiceConfig(), bass)

        def switches(mode):
            streams = voices.separate(
                score, voices.VoiceConfig(mode=mode, n_parts=4), bass
            )
            total = 0
            for stream in streams[:3]:
                line = [labels.get(id(n), -1) for n in stream]
                total += sum(1 for a, b in zip(line, line[1:]) if a != b)
            return total

        self.assertLess(switches("voices"), switches("cascade") / 3)
        self.assertLess(switches("voices"), switches("balanced") / 2)

    def test_fugue_only_picks_up_its_own_tempo(self):
        with tempfile.TemporaryDirectory() as d:
            report = convert(BWV544, os.path.join(d, "f.gp5"),
                             Settings(from_bar=86))
            self.assertEqual(report.tempo, 70)
            self.assertEqual(report.bars, 88)


if __name__ == "__main__":
    unittest.main(verbosity=2)
