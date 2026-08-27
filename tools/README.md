# tools/

Two scripts. Neither is part of the site — GitHub Pages serves files and runs
nothing. Standard library Python, nothing to install.

## Adding a solution

Nothing here. Put the file in `Euler_source/` or `LeetCode/` and push.
`.github/workflows/solutions.yml` runs `build_solutions.py` and commits the
regenerated index back, so the folder is the only thing you maintain.

```
Euler_source/42.py          problem 42, in Python
LeetCode/1.py               problem 1
LeetCode/1.cpp              problem 1 again - the page shows both as tabs
LeetCode/1440/1440.py       a folder when the solution reads a file
LeetCode/1440/data.txt      ...that file, offered as a download beside the code
```

`LeetCode/README.md` has the details.

## build_solutions.py

Walks both folders and writes `data/euler-solutions.js` and
`data/leetcode-solutions.js` — the two files the pages load. Run it by hand if
you want to see the result before pushing:

```sh
cd tools
python build_solutions.py            # both
python build_solutions.py leetcode   # just one
```

It prints what it found and, usefully, what it skipped. A file whose name does
not start with a problem number is skipped and named, so a typo shows up as a
line of output rather than a silently missing entry.

Two behaviours worth knowing:

- **A folder beats a loose file** of the same number and language. `22.py` and
  `22/22.py` both exist in `Euler_source/`; the folder one wins, because if a
  problem reads a data file then the folder is the working copy.
- **Encodings vary.** These were written on Windows over several years, so each
  file is tried as UTF-8, then cp1252, then latin-1 before giving up.

## refresh_titles.py

The only thing that touches the network, and only when new problems have
appeared upstream. It writes the two lookups that turn a problem *number* into
a title:

| file | contents |
| --- | --- |
| `lc_titles.json` | `{"1": ["Two Sum", "two-sum", 1], ...}` — title, slug, difficulty |
| `pe_titles.json` | `{"1": "Multiples of 3 or 5", ...}` |

```sh
python refresh_titles.py            # both
python refresh_titles.py euler      # one request, the whole index
```

That is deliberately all it collects. **Statements are not stored** — both
pages link out to projecteuler.net and leetcode.com instead. Embedding them
meant 13 MB of scraped HTML in the repo that went stale the moment either site
edited a problem, and the link is both smaller and always right.

**Project Euler answers are not collected, stored or shown anywhere.** Project
Euler asks that solutions are not published, and a page that hands you the
number is not one worth visiting twice.
