# tools/

Scrapers and one build script. They are not part of the site — GitHub Pages
serves files and runs nothing — they are what produced everything under
`data/`. Run them again when the problem sets move; commit what they write.

Python 3.8+, standard library only, no packages to install.

## The order

```sh
cd tools

# 1. LeetCode: the whole problem list (id, title, difficulty, tags, acceptance)
python fetch_leetcode_index.py          # -> lc_meta.json          ~1 min

# 2. LeetCode: one statement, stub and worked example per free problem.
#    Resumable - it skips anything already in lc_cache/, so a failed run
#    can just be started again. Eight threads, about ten minutes.
python fetch_leetcode_problems.py       # -> lc_cache/*.json

# 3. Project Euler: the index and every statement, with its difficulty rating.
#    Also resumable, via pe_cache/.
python fetch_euler.py                   # -> pe_index.json, pe_cache/*.json

# 4. Turn all of that into what the site actually loads.
python build_data.py "<path to portfolio>"
```

`build_data.py` takes the site directory as its first argument and, optionally,
`leetcode` or `euler` as its second to rebuild only one track.

## What lands in data/

| file | what it is |
| --- | --- |
| `leetcode-index.js` | every problem as `[id, title, slug, difficulty, acceptance, paid, tags]`. One file, loaded on page open, so the table can filter and sort without a single request. |
| `leetcode/<n>.json` | statements, starter stubs for nine languages, the worked examples and their expected answers, in buckets of a hundred problems. Fetched only when a problem in that bucket is opened. |
| `euler-index.js` | `[n, title, level, difficulty %, solvers, published]`. |
| `euler/<n>.json` | statements, in buckets of a hundred. |
| `euler-mine.js` | the solutions in `Euler_source/`, with the data files they read, so they load into the editor already written. |

## Two things worth knowing

**Expected answers are parsed out of the worked examples.** LeetCode's API gives
the example *inputs* as a field but leaves the outputs in the prose, so
`build_data.py` reads the `Output:` lines out of the statement and pairs them up.
When the counts do not match it stores nothing rather than guessing, which is
why about one problem in ten runs without checking itself. Some problems also
accept more than one valid answer, so a mismatch on the page is worded as a
prompt to look rather than a verdict.

**Nothing is fetched from leetcode.com or projecteuler.net at runtime.** Both
block cross-origin requests, and a page that needs them to be up is a page that
breaks. Everything is captured here and committed.

**Project Euler answers are not collected, stored or shown anywhere.** Project
Euler asks that solutions are not published, and a page that hands you the
number is not one you would use twice.
