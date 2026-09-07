"""Proper titles for Bach's keyboard works, by BWV number.

The engravings carry no usable title -- most say only "BWV_0846" -- so the
names come from the catalogue instead. Only the works that come in
numbered sets are generated; anything else is named outright, and anything
missing falls back to whatever the score says.
"""

from __future__ import annotations

# The twenty-four, in the order Bach set them, for both books.
WTC_KEYS = [
    "C major", "C minor", "C-sharp major", "C-sharp minor",
    "D major", "D minor", "E-flat major", "E-flat minor",
    "E major", "E minor", "F major", "F minor",
    "F-sharp major", "F-sharp minor", "G major", "G minor",
    "A-flat major", "G-sharp minor", "A major", "A minor",
    "B-flat major", "B-flat minor", "B major", "B minor",
]

# Inventions and sinfonias share one key sequence.
TWO_PART_KEYS = [
    "C major", "C minor", "D major", "D minor", "E-flat major",
    "E major", "E minor", "F major", "F minor", "G major",
    "G minor", "A major", "A minor", "B-flat major", "B minor",
]

ENGLISH_SUITE_KEYS = ["A major", "A minor", "G minor",
                      "F major", "E minor", "D minor"]
FRENCH_SUITE_KEYS = ["D minor", "C minor", "B minor",
                     "E-flat major", "G major", "E major"]
PARTITA_KEYS = ["B-flat major", "C minor", "A minor",
                "D major", "G major", "E minor"]

NAMED = {
    "0903": "Chromatic Fantasia and Fugue in D minor",
    "0831": "French Overture in B minor",
    "0971": "Italian Concerto in F major",
    "0988": "Goldberg Variations",
    "0989": "Aria variata alla maniera italiana in A minor",
    "0990": "Sarabande con partite in C major",
    "0991": "Air with variations in C minor",
    "0992": "Capriccio on the departure of a beloved brother",
    "0993": "Capriccio in E major",
    "0994": "Applicatio in C major",
}


def _sets() -> dict[str, str]:
    out: dict[str, str] = {}
    for i, key in enumerate(WTC_KEYS):
        out[f"{846 + i:04d}"] = f"Prelude and Fugue in {key} (Book I, No. {i + 1})"
        out[f"{870 + i:04d}"] = f"Prelude and Fugue in {key} (Book II, No. {i + 1})"
    for i, key in enumerate(TWO_PART_KEYS):
        out[f"{772 + i:04d}"] = f"Invention No. {i + 1} in {key}"
        out[f"{787 + i:04d}"] = f"Sinfonia No. {i + 1} in {key}"
    for i, key in enumerate(ENGLISH_SUITE_KEYS):
        out[f"{806 + i:04d}"] = f"English Suite No. {i + 1} in {key}"
    for i, key in enumerate(FRENCH_SUITE_KEYS):
        out[f"{812 + i:04d}"] = f"French Suite No. {i + 1} in {key}"
    for i, key in enumerate(PARTITA_KEYS):
        out[f"{825 + i:04d}"] = f"Partita No. {i + 1} in {key}"
    out.update(NAMED)
    return out


TITLES = _sets()


def title_for(stem: str) -> str | None:
    """"BWV_0846" -> "Prelude and Fugue in C major (Book I, No. 1)"."""
    if not stem.upper().startswith("BWV_"):
        return None
    number = stem[4:]
    name = TITLES.get(number)
    if name:
        return name
    # An early or alternative version: BWV_0846a leans on its parent.
    if number[-1].isalpha() and TITLES.get(number[:-1]):
        return f"{TITLES[number[:-1]]} (early version)"
    return None


def label_for(stem: str) -> str:
    """The catalogue number as the page shows it: BWV_0846 -> BWV 846."""
    if not stem.upper().startswith("BWV_"):
        return stem
    return "BWV " + stem[4:].lstrip("0")
