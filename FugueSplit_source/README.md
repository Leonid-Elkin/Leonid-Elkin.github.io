# FugueSplit

Turns a polyphonic score — a MIDI file, or better a MusicXML engraving —
into **one-note-at-a-time electric guitar and bass parts**, written out as a
Guitar Pro tab.

A fugue is already written as independent melodic lines, so it is the ideal
input: instead of hacking chords apart, the program works out which line is
which and hands each one to a different player. No chords are ever written —
every part is strictly monophonic, the way a band of guitarists and a bassist
would actually cover the piece. The band is as big as the music needs: the
count comes from the texture and grows while notes are still being crammed
into a stave's second voice.

Built and tested against Bach's Prelude and Fugue in B minor, BWV 544.

```
python -m fuguesplit BWV_0544.mid --from-bar 86 -o fugue.gp5
```

```
"BWV_0544"  ->  fugue.gp5
  88 bars, 70 bpm, 2 sharps
  bass taken from source track(s): 8
  4715 source notes -> 2393 written

  part          notes       range   8ve  maxfret   open  playing
  Guitar I        518       D4-C6     0       20      8   77.6%
  Guitar II       695      E3-F#5     0       14     82   86.4%
  Guitar III      318     F#2-C#5     0        9     85   36.7%
  Guitar IV       526       E2-A4     0        6    158   55.3%
  Guitar V         28       F3-C5     0        8      9    4.5%
  Bass            308       E1-C3    -1        5     71   48.4%

  grew to 5 guitars: any fewer left notes greyed into a stave's second voice
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

**1. Read.** The score is flattened onto one absolute-tick timeline, keeping
each note's source track — a strong hint, because organ and choral
transcriptions are usually engraved voice by voice. A MusicXML engraving is
read the same way but arrives already separated: see [Reading an
engraving](#reading-an-engraving).

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

**2a. As many players as it takes.** The part count is a guess, and a fugue
does not hold still: BWV 582 opens in three voices and later stacks five over
the pedal. A note that arrives when every player is busy is written as a
double-stop or into the stave's second voice, greyed out behind the main one
in Guitar Pro — so wherever that grey appears, a guitar is added and the piece
is dealt out again, until nothing is left greyed or the ensemble reaches
`--max-parts`. Asking for a size with `-g` turns this off.

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
| `-g, --guitars N` | fix the number of guitar parts; the default works it out from the texture and grows it while notes are still being crammed into a second voice |
| `--max-parts N` | ceiling on that growth, staves including the bass (default 7) |
| `--no-bass` | do not create a bass part |
| `--tuning NAME` | `standard`, `drop-d`, `eb`, `d-standard` |
| `--bass-tuning NAME` | `bass`, `bass5`, `bass-drop-d` |
| `--frets N` | highest usable fret (default 22) |
| `--grid NAME` | quantisation: `quarter`…`64th` (default `32nd`) |
| `--tempo BPM` | tempo written into the tab (default: whatever the source says) |
| `--tone NAME` | guitar voice: `clean`, `jazz`, `overdrive`, `distortion` |
| `--bass-tone NAME` | `bass-finger`, `bass-pick` |
| `--flow-priority top\|bottom` | which guitar gets the unbroken line (default `top` = Guitar I) |
| `--flow-weight N` | how hard to keep it playing (0 = equal parts; default 20) |
| `--bass-comfort-fret N` | highest fret the bass should normally use (default 12) |
| `--no-bass-relief` | let the bass play high up the neck |
| `--no-extra-guitar` | never add a guitar to cover the bass |
| `--from-bar N`, `--to-bar N` | convert only part of the piece |
| `--bass-track N` | force a source track to the bass (repeatable) |
| `--like SCORE` | write every note this score shares with `SCORE` exactly as `SCORE`'s own tab writes it |
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

## How many parts

Worked out from the piece, and then checked against the piece.

The first guess counts how many voices are sounding for most of the playing
time — three or four in BWV 544. That guess is regularly too low, because a
fugue does not stay at its own voice count: the Passacaglia and Fugue in C
minor, BWV 582, is written in three or four voices and then piles up to five
over the pedal, and a note that arrives when every player is busy has nowhere
to go. Such a note is not thrown away — it is written as a double-stop, or
into the stave's **second voice**, which Guitar Pro draws greyed out behind
the main one — but neither is a line anybody can read.

So that grey is treated as the ensemble asking for another player. Each time
it appears, a guitar is added and the whole piece is dealt out again, for as
long as that keeps rescuing notes and up to `--max-parts` staves. On BWV 582
that grows three guitars into six: from the MIDI it takes the arrangement from
5165 to 5630 of 5666 notes, and from the engraving it writes 5540 of 5545 —
in both cases with nothing left greyed at all.

Growth only happens when the count is left to the program. `-g N` fixes the
ensemble at N guitars and keeps it there — a legitimate arrangement choice,
just a lossier one, and the notes over that go back to the second voice
rather than being dropped.

## Reading an engraving

Give it a `.xml`, `.musicxml` or `.mxl` and it reads that instead. Worth
doing wherever an edition exists, because a MIDI file is a performance and an
engraving is the piece:

| | MIDI | MusicXML |
|---|---|---|
| voices | inferred from pitch and timing | **written down**, one track per staff-and-voice |
| bar lines | counted forward from a metre map | **the engraving's own**, pickup bars included |
| key | often absent | in the file |
| note lengths | as played, gaps and all | as written |
| ornaments | played out as real notes | left as symbols, so not sounded |

That last row is the one thing the MIDI does better, and it is why both are
kept.

The difference is not cosmetic. Bach's Passacaglia in C minor, BWV 582, is
the case that made this worth writing.

- Its MIDI puts all five manual voices on **one track**, so every voice has to
  be inferred, and the separator hands lines between guitars wherever two of
  them cross.
- Its MIDI also carries a time signature of 4/4 changing to 3/4 two beats in,
  which is not a metre any bar can hold. Read literally it puts **every bar
  line in the piece a beat late**. The engraving has a one-beat pickup bar and
  3/4 after it, which is what Bach wrote.
- The MIDI has no key signature at all; the engraving has three flats.

Read from the engraving, each guitar picks up one voice and keeps it for the
whole piece:

```
guitar      engraved voice    notes  of    playing
Guitar I    staff 1 voice 1    1553  1562    82.6%
Guitar II   staff 1 voice 2    1480  1481    84.9%
Guitar III  staff 2 voice 5    1262  1265    68.6%
Guitar IV   staff 2 voice 6     341   341    22.9%
Guitar V    staff 1 voice 3      23    24     3.4%
Guitar VI   staff 1 voice 4      17    17     1.8%
Bass        pedal               854   854    73.7%
```

Guitars V and VI look like padding and are not: they are the two voices the
engraving adds where the texture thickens to six parts, and giving them their
own staves is what stops them elbowing another voice off its guitar mid-phrase.
`python -m fuguesplit.check` reports **no misplaced notes** and the count of
runs broken by a handover drops from 285 to 78 against the same piece read
from MIDI.

Eight notes do change hands, all of them where a voice is playing a
double-stop against itself — one player cannot hold two notes of one line —
and six of those are a single run, handed over whole.

Across all 31 pieces the same swap takes broken runs from **4152 to 963**, and
of the 194 notes still played by a part other than their voice's own, exactly
one falls inside a run of that voice. Where a piece is engraved in more voices
than there are staves for — `--max-parts` is 7 — the extra voices are handed
to whichever guitar is free for the whole run rather than split across
several.

Engravings for the Bach organ works, matching the MIDI files this repository
already uses, are at [Tobis Notenarchiv](https://tobis-notenarchiv.de/):
each piece offers MusicXML beside its MIDI. Drop the `.xml` next to the `.mid`
and `convert_all.py` prefers it automatically, taking the tempo from the MIDI
since editions carry none.

## Finishing it without a completer (`complete.py`)

```
python complete.py -o finale.mid
python splice.py contrapunctusXIX.mid finale.mid -o whole.mid
python -m fuguesplit whole.mid --like contrapunctusXIX.mid -o whole.gp5
```

Bach's last fugue stops in bar 239, three subjects in, with the theme of
the whole work never yet heard. Göncz's insight was that the four subjects
were *built* to combine — the piece is permutational, and its ending is
less composed than solved. So this does not try to write like Bach. It takes
his four subjects exactly as he wrote them — the fugue's own, the second
fugue's, B-A-C-H, and the theme of Contrapunctus I — and searches the
alignments in which they fit each other best: which voice takes which
subject, at what transposition, entering how far apart, each short subject
restated until the passage is covered.

Every candidate is scored as counterpoint, and the scoring is where the
judgement lives:

| | |
|---|---|
| harmony | on each beat where three or more different notes sound, do they make a triad or a seventh? |
| parallels | consecutive fifths or octaves between the same two voices |
| range | a voice outside the compass it keeps to in the fragment |
| collisions | two voices on the same note |

Bach's own 239 bars score **74%** on the harmony test, and so does the
finale this picks — with no collisions, nothing out of range and one
parallel in thirty bars: four combinations of all four subjects in
different voice permutations, the last with the theme itself in the bass,
then a dominant pedal with B-A-C-H in stretto over it and a Picardy third.

Silence is scored too, because the first version of this had four bars of
it. Each block now begins a bar before the last has finished and a voice
that runs out of subject holds its note rather than dropping out, so the
four parts play 79-89% of the time — Bach's own are between 79% and 88% —
and at no point does everything stop.

That is a derivation, not an inspiration. There are no episodes and no free
counterpoint — where a completion by a musician breathes, this one states
the material and stops. But every note in it is Bach's, the joins are where
he put them, and the arithmetic is checkable, which is the most an
arranger's program can honestly claim.

## Reading it off the page (`omr.py`)

When a piece exists only on paper, [Audiveris](https://audiveris.github.io)
can be pointed at a PDF and asked for MusicXML, which is a format this
already reads:

```
python omr.py score.pdf -o score.gp5           # PDF -> MusicXML -> tab
python omr.py score.pdf --xml-only             # stop at the MusicXML
```

Install Audiveris separately; `omr.py` finds it in the usual places, or set
`AUDIVERIS` to the executable.

**Expect a draft, not an edition.** Run over the Tobis PDF of the Passacaglia
— a digital-native file, the friendliest case there is — against the same
publisher's own MusicXML of the same engraving, 17 pages took three minutes
and came back:

| | recognised |
|---|---|
| the pedal staff, one voice on its own | **99.8%** of its notes |
| the manual staves, two voices each | 88-91% |
| the piece as one stream of pitches | **91.1%** |
| notes in the right place in the right bar | 38.2% |

That last row is the one to look at. Recognition errors are not spread evenly:
the notes come back well, and then one misread bar knocks the bar lines out of
step and everything after it lands in the wrong place. Here that happened at
bar 121, and everything from there on counted as wrong even where the pitches
were right. Key signature, pickup bar and total length all came back correct.

## Proofreading what comes back (`fuguesplit.proof`)

Where part of the music is already known, every recognition error in that part
can be found exactly:

```
python -m fuguesplit.proof recognised.mxl --against torso.mid --bars 239
```

This is written for completions. The first 239 bars of a completed
Contrapunctus XIV *are* the unfinished fugue, note for note, so any
disagreement there is a misreading and nothing else — and the same misreadings
usually recur in the new material. It reports the bars that disagree, worst
first, and the bar where the two stop being in step at all, which is the one
to open in a notation editor:

```
BWV_0582.mxl against BWV_0582.xml
  2117 of 5545 known notes recognised (38.2%); the bar lines go out of step at bar 121
  up to that point, 40 bars disagree
    bar   51: 15 of 18 notes missing, 15 not in the original
    bar   64: 13 of 23 notes missing, 13 not in the original
```

## Finishing an unfinished piece

The Art of Fugue breaks off in the middle of bar 239. Play a completion of
it and the first 239 bars are Bach's, note for note — so a tab of the
completed fugue ought to open exactly as the tab of the torso does, or nobody
who has learned one can read the other.

That is not automatic. Octaves are chosen a phrase at a time by a dynamic
program over the whole part, so music added at the end can move a phrase near
it: appending a low-lying ending to Contrapunctus XIV shifted seventeen notes
of Guitar I an octave, two hundred bars earlier.

```
python -m fuguesplit completion.xml --like contrapunctusXIX.mid -o completed.gp5
```

`--like` arranges the reference first and writes every note the two scores
share the way the reference wrote it: same player, same octave. A note the
reference gave to another guitar is handed back to that guitar wherever it is
free to take it — pinning the octave alone is not enough, because a completion
is a different edition whose voices are laid out differently, and the
separator will otherwise give a line to a player who has not learned it. A
completion padded with a bar of silence at the front still lines up, since the
two openings are matched by where each score's music begins rather than by
tick zero.

That gets an opening to about 99% of the torso's own tab. The last per cent is
the edition itself: every completion reprints Bach's 239 bars from its own
source, with a different accidental here, an ornament written out there. So
`splice.py` joins the two scores instead of matching them —

```
python splice.py torso.mid completion.xml -o joined.mid
python -m fuguesplit joined.mid --like torso.mid -o completed.gp5
```

— taking Bach's own notes up to the bar he stopped in and the completion's
from there on, with the completion's voices matched to the torso's by register
so the four lines carry through the join. A note that would collide with what
its own voice is already holding goes to the nearest voice that is free, so
the joined file stays as cleanly separated as the torso it continues.

**The Art of Fugue, finished.** Contrapunctus XIV breaks off at bar 239;
[Donald Tovey's 1931 completion](https://peterbillam.gitlab.io/pjb_arrangements/index.html)
carries it to bar 317. Peter Billam's typesetting of it is free, and muscript
— the program he typeset it with — writes MusicXML directly (`muscript -xml`),
so no page has to be recognised at all. Checked against Bach's own text with
`fuguesplit.proof`, that edition agrees with the torso on **2611 of 2620
notes**; the nine are editorial readings, mostly B flat against B natural.
Spliced and arranged, the tab runs to 317 bars, **3851 notes, every one traced
back to its source**, and its first 239 bars are the torso's tab exactly:
2620 of 2620 notes on the same guitar, at the same instant, at the same pitch,
ringing for the same length.

## Is it the right piece? (`fuguesplit.verify`)

```
python -m fuguesplit.verify BWV_0582.xml out/BWV_0582.gp5
```

`check.py` asks whether the arrangement is musically sensible.
`verify.py` asks the blunter question — is what came out the piece that went
in? It parses the written `.gp5` back off disk, works out what each fret on
each string actually sounds, folds ties back together, and follows every note
to the source note it came from:

- **pitch** — the written note must be the source note, in some octave
- **timing** — its onset must be where the source puts it on the grid
- **bar** — every bar must hold exactly its own length, in every voice
- **missing** — a note the arrangement meant to write that the file has not
  got, and source notes that reached the file as nothing at all

Across the 31 organ pieces that is **108,940 written notes, every one of them
traced back to its source note, and no problems of any kind** — and the count
in the file matches the count in the report, piece by piece.

It has already earned its keep. It caught a unison double-stop that the
notation writer discarded while the report still counted it, and a chord tone
dragged onto a neighbouring beat far enough to be quantised to the wrong
32nd.

## Batch conversion

`convert_all.py` converts a whole folder and prints a summary:

```
python convert_all.py [midi_dir] [out_dir]
```

With no arguments it converts `midi/bach-preludes-and-fugues/` into `out/`,
taking the engraving of a piece where one is sitting beside its MIDI. Run over
Bach's 30 organ preludes and fugues (BWV 531-552) and the Passacaglia
(BWV 582), sourced from
[Tobis Notenarchiv](https://tobis-notenarchiv.de/), it keeps **99.7% of the
109,280 notes in those engravings**, with no failures, and breaks a run with a
handover **0.88 times per 100 notes** — read from the MIDI files of the same
pieces that figure is 3.76.

The ensemble that takes is five or six guitars and a bass, against the three
guitars that used to be the default — which is what the music is: an organist
has two manuals and a pedal board, and Bach writes as many voices across them
as ten fingers can hold.

Every tab is credited to Leonid Elkin as arranger, with Bach as composer.

## Tests

```
python -m unittest discover -s tests -v
```

136 tests. The assignment solver is checked against brute-force optimality; the
notation layer is checked exhaustively (every offset and length on a 32nd grid
in both simple and compound metre reconstructs to exactly the right number of
ticks); and end-to-end tests parse the generated `.gp5` back and assert every
bar is exactly filled, every beat holds at most one note, and every fret lies
within the tuning, and that the bass never leaves the lower neck. A canon
and a longer continuation of it check that `--like` holds an opening still,
and a tune with a bar taken out of it checks that `proof` reports the bar
where two readings stop being in step; a bar padded to place a whole rest
checks that the bar lines after it stay where they were engraved, and a
spliced canon checks that the torso survives the join and no voice ends up
holding two notes at once; the counterpoint scorer is checked against a
triad, a cluster and a pair of parallel fifths, and the completion against
Bach's four subjects, which it has to find in his text before it can use
them. A thick
synthetic texture checks the ensemble grows until no note is left in a
stave's second voice, and stops at `--max-parts`. A scrap of MusicXML checks
that voices, ties, chords, a pickup bar and the key survive the read, and that
each voice keeps one guitar for the whole piece; the verifier is checked both
against a clean tab and against one with a note deliberately altered in the
written file. The BWV 544 tests are
skipped if the file is not present.

## Limitations

- **Binary rhythms only.** No tuplets — a source with triplets or swing will be
  quantised onto the nearest binary grid. BWV 544 needs none (100% of its
  onsets land on a 32nd grid).
- **Playability is positional, not physical.** The fretting solver minimises
  hand movement but does not model finger stretch, so a dense passage can still
  ask for an awkward shape.
- **Repeats are written out**, not folded into repeat barlines.
- **Optical recognition is a draft.** Roughly one note in eleven comes back
  wrong or missing even from a clean PDF, and a single misread bar moves every
  bar line after it. Proofread before playing.
- **Ornaments in an engraving stay symbols.** A MIDI file of the same piece
  plays trills and mordents out as real notes; MusicXML marks them, and those
  marks are not realised, so they are not in the tab.
- Output is `.gp5`, which Guitar Pro 8 opens and can re-save as `.gp`.

`midi/` and `out/` are git-ignored: the source MIDI sequences are other
people's work, and the tabs are regenerable from them.
