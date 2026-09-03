# FugueSplit

Turns a polyphonic MIDI file into **one-note-at-a-time electric guitar and bass
parts**, written out as a Guitar Pro tab.

A fugue is already written as independent melodic lines, so it is the ideal
input: instead of hacking chords apart, the program works out which line is
which and hands each one to a different player. No chords are ever written —
every part is strictly monophonic, the way a band with three guitarists and a
bassist would actually cover the piece.

Built and tested against Bach's Prelude and Fugue in B minor, BWV 544.

```
python -m fuguesplit BWV_0544.mid --from-bar 86 -o fugue.gp5
```

```
"BWV_0544"  ->  fugue.gp5
  88 bars, 70 bpm, 2 sharps
  bass taken from source track(s): 8
  4715 source notes -> 2390 written

  part          notes       range   8ve  maxfret   open
  Guitar I        672      C#3-C6     0       20     73
  Guitar II       775       D3-B5     0       19     71
  Guitar III      635      E2-F#5    -1       14    146
  Bass            308       E2-C4     0       17      4
```

Open the `.gp5` in Guitar Pro (5 or later, including GP8).

## Install

```
pip install -r requirements.txt
```

Needs Python 3.10+, [mido](https://mido.readthedocs.io) for MIDI and
[PyGuitarPro](https://pyguitarpro.readthedocs.io) for the tab.

## How it works

The interesting problem is not the file format, it is deciding *who plays
what*. Six stages:

**1. Read.** The MIDI is flattened onto one absolute-tick timeline, keeping
each note's source track — a strong hint, because organ and choral
transcriptions are usually engraved voice by voice.

**2. Separate voices.** The piece is walked in time order, and at every onset
a minimum-cost assignment decides which part takes which note. The cost of
putting a note on a part blends four musical preferences:

| term | what it wants |
|---|---|
| continuity | keep a part near the pitch it just played, so lines move by step |
| register | keep Guitar I on top, Guitar II under it, and so on |
| busy | avoid cutting off a note the part is still sustaining |
| affinity | if the source file separated voices by track, honour that |

Continuity decays with silence: a part that has not played for two beats is
free to pick up wherever the music needs it. Assignment is solved exactly (a
small Hungarian solver, `hungarian.py`) rather than greedily, so a chord is
distributed as a whole instead of first-come-first-served. When more notes
sound than there are players, the outer voices are kept first — a listener
tracks the top line and the bass — and longer notes beat passing ornament.

The bass is handled separately: a track named `PEDAL`, `Bass` or `Continuo`
(or, failing a name, one sitting more than a fifth below everything else) is
routed straight to the bass part and takes no part in the assignment.

**Flow priority.** A fifth term ranks the guitars. Whenever a part would
otherwise fall silent it gets a discount for picking a note up, largest for
the lead and tapering to nothing for the last — so Guitar I carries an
unbroken line and the guitars below it fill in around it. On BWV 544 that
takes Guitar I from 80% to 96% of the piece while Guitar III drops to 59%.
`--flow-priority bottom` hands the unbroken line to the highest-numbered
guitar instead, and `--flow-weight 0` makes the parts equal again.

This only has leverage where voices overlap in register. Where a line sits
clearly apart, register affinity still wins — the lead guitar will not drag
itself down onto the bass line just to stay busy.

**3. Fold into range.** An organ voice spans far more than a guitar. Each part
is cut into phrases at rests and each phrase is moved by whole octaves until it
fits, chosen by a dynamic program over the whole part so it does not hop
octaves every other bar. Transposition never changes the melodic shape.

**4. Enforce monophony.** Overlaps left by separation are truncated,
same-onset collisions collapsed, and stubs shorter than a 32nd dropped.

**4a. Spare the bassist.** An organ pedal line transcribed literally sends a
bass guitar far up the neck — 17.7% of bass notes above the 12th fret before
this stage, and 36% in the worst piece. The bass is folded against a
*comfortable* fret span rather than the whole neck, so phrases drop an octave
where that helps, and its fingering is pinned there too (a pitch reachable in
first position is never fingered at the 17th fret on a lower string). Whatever
still sits too high is handed to a guitar that happens to be silent — filler
guitars first, so the lead keeps its line — and if nobody is free, an extra
guitar part is added just to cover it. Across all 30 Bach preludes and fugues
this puts **every one of 17,328 bass notes at or below the 12th fret**.

**5. Fret.** Any pitch is available in several places on the neck. A Viterbi
pass over the whole part picks positions, with hand movement as the transition
cost, so the tab stays in position instead of leaping around. Open strings are
free and cost no shift.

**6. Notate.** Guitar Pro stores bars as sequences of beats with real note
values, not arbitrary tick lengths, so every note is quantised to a grid and
split into representable durations joined by ties. A value may begin where it
is metrically aligned, or — if it is no shorter than a beat — anywhere that
does not cross a beat line. That keeps the pulse readable while still writing
ordinary off-beat syncopation as one note rather than a chain of ties.

## Usage

```
python -m fuguesplit INPUT.mid [-o OUTPUT.gp5] [options]
```

| option | meaning |
|---|---|
| `-g, --guitars N` | number of guitar parts (default 3) |
| `--no-bass` | do not create a bass part |
| `--tuning NAME` | `standard`, `drop-d`, `eb`, `d-standard` |
| `--bass-tuning NAME` | `bass`, `bass5`, `bass-drop-d` |
| `--frets N` | highest usable fret (default 22) |
| `--grid NAME` | quantisation: `quarter`…`64th` (default `32nd`) |
| `--tone NAME` | guitar voice: `clean`, `jazz`, `overdrive`, `distortion` |
| `--bass-tone NAME` | `bass-finger`, `bass-pick` |
| `--flow-priority top\|bottom` | which guitar gets the unbroken line (default `top` = Guitar I) |
| `--flow-weight N` | how hard to keep it playing (0 = equal parts; default 20) |
| `--bass-comfort-fret N` | highest fret the bass should normally use (default 12) |
| `--no-bass-relief` | let the bass play high up the neck |
| `--no-extra-guitar` | never add a guitar to cover the bass |
| `--from-bar N`, `--to-bar N` | convert only part of the piece |
| `--bass-track N` | force a source track to the bass (repeatable) |
| `--title TEXT` | title written into the tab |
| `--list-tracks` | show the source file's tracks and exit |

Inspect a file before converting it:

```
$ python -m fuguesplit --list-tracks BWV_0544.mid
BWV_0544.mid: 4715 notes, 384 ticks/beat
 trk   notes      range  name
   1    1373      A2-C6  MANUAL
   2    1044      E3-B5  MANUAL
   ...
   8     593     C2-C#4  PEDAL  <- bass
```

Two guitars in drop D, fugue only:

```
python -m fuguesplit BWV_0544.mid --from-bar 86 -g 2 --tuning drop-d --tone overdrive
```

Use it as a library:

```python
from fuguesplit import convert, Settings

report = convert("BWV_0544.mid", "fugue.gp5", Settings(guitars=3, from_bar=86))
print(report.written_notes, "notes across", len(report.parts), "parts")
```

## Choosing the number of parts

Count how many voices actually sound at once. In BWV 544 it is usually three
or four, so three guitars plus bass loses almost nothing (4676 of 4715 notes
survive). Ask for fewer parts and the arranger starts dropping inner voices —
which is a legitimate arrangement choice, just a lossier one.

## Batch conversion

`convert_all.py` converts a whole folder and prints a summary:

```
python convert_all.py [midi_dir] [out_dir]
```

With no arguments it converts `midi/bach-preludes-and-fugues/` into `out/`.
Run over all 30 of Bach's organ preludes and fugues (BWV 531-552, sourced
from [Tobis Notenarchiv](https://tobis-notenarchiv.de/)), it keeps **97.9% of
104,763 source notes**, with no failures. The lost 2% is where five or six
voices sound at once and three guitars plus a bass simply run out of hands.
Eight of the 30 needed a fourth guitar to take a handful of notes off the
bass; the rest were solved by octave folding alone.

Every tab is credited to Leonid Elkin as arranger, with Bach as composer.

## Tests

```
python -m unittest discover -s tests -v
```

49 tests. The assignment solver is checked against brute-force optimality; the
notation layer is checked exhaustively (every offset and length on a 32nd grid
in both simple and compound metre reconstructs to exactly the right number of
ticks); and end-to-end tests parse the generated `.gp5` back and assert every
bar is exactly filled, every beat holds at most one note, and every fret lies
within the tuning, and that the bass never leaves the lower neck. The BWV 544
tests are skipped if the file is not present.

## Limitations

- **Binary rhythms only.** No tuplets — a source with triplets or swing will be
  quantised onto the nearest binary grid. BWV 544 needs none (100% of its
  onsets land on a 32nd grid).
- **Playability is positional, not physical.** The fretting solver minimises
  hand movement but does not model finger stretch, so a dense passage can still
  ask for an awkward shape.
- **Repeats are written out**, not folded into repeat barlines.
- Output is `.gp5`, which Guitar Pro 8 opens and can re-save as `.gp`.

`midi/` and `out/` are git-ignored: the source MIDI sequences are other
people's work, and the tabs are regenerable from them.
