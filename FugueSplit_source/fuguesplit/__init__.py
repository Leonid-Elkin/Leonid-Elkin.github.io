"""FugueSplit -- turn a polyphonic MIDI file into playable one-note-at-a-time
electric guitar and bass parts, written out as a Guitar Pro tab."""

from .pipeline import Report, Settings, convert

__all__ = ["convert", "Settings", "Report"]
__version__ = "1.0.0"
