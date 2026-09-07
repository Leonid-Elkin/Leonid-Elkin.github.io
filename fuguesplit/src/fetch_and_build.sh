#!/bin/sh
# Fetch, arrange and clean one section at a time.
#
# The vocal collection is 1,913 engravings and will not sit on disk whole:
# this worktree is inside a OneDrive folder, so a downloaded score is also
# a score being sync-uploaded, and holding the collection resident got
# three fetches killed for low memory. One section at a time keeps the
# working set to tens of megabytes.
#
#     sh fetch_and_build.sh vocal cantatas SECTION...
#
# Sources are deleted once arranged. They are gitignored and fetch_tobis.py
# brings any section back, so nothing is lost -- but note a section must be
# arranged before it is cleaned, or the next fetch simply downloads it again.
set -u

COLLECTION="$1"; shift
SHELVES="$1"; shift

for section in "$@"; do
    echo "=== $section ==="
    python -u fetch_tobis.py --workers 1 --only "$section" "$COLLECTION" \
        || { echo "!! fetch failed: $section"; continue; }
    python -u build_shelves.py $SHELVES > "_build_$section.log" 2>&1 \
        || { echo "!! build failed: $section"; continue; }
    # Only clean up once every score in the section actually converted.
    # A source deleted after a failed read is a piece silently lost: the
    # next fetch skips the section as already done. OneDrive has turned
    # listed files into failed opens more than once here, and those are
    # worth another attempt rather than a deletion.
    if grep -aq FAILED "_build_$section.log"; then
        echo "!! $(grep -ac FAILED "_build_$section.log") failed in $section" \
             "-- sources kept for a retry"
        continue
    fi
    find "midi/$COLLECTION" -type d -name "$section" -exec rm -rf {} + \
        2>/dev/null
    echo "--- $section done; midi now $(du -sh midi 2>/dev/null | cut -f1)"
done
echo "all sections finished"
