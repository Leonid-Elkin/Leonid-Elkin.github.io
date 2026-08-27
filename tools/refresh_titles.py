#!/usr/bin/env python3
"""Refresh the two title lookups the site's build reads.

    lc_titles.json   {"1": ["Two Sum", "two-sum", 1], ...}
    pe_titles.json   {"1": "Multiples of 3 or 5", ...}

That is all the site needs from either service: a problem number in the folder
becomes a title, a difficulty and a link. Statements are not stored - the page
links out to them, because a page that needs a scrape to be current is a page
that goes stale.

Run this only when new problems have appeared. Everything it writes is
committed, and nothing on the site fetches from leetcode.com or
projecteuler.net at runtime.

    python refresh_titles.py            both
    python refresh_titles.py euler      just Project Euler
    python refresh_titles.py leetcode   just LeetCode

Standard library only.
"""

import io
import json
import os
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))

UA = "Mozilla/5.0 (portfolio build script; https://leonid-elkin.github.io)"

DIFFICULTY = {"Easy": 1, "Medium": 2, "Hard": 3}

QUERY = """query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
  problemsetQuestionList: questionList(categorySlug: $categorySlug, limit: $limit, skip: $skip, filters: $filters) {
    total: totalNum
    questions: data { frontendQuestionId: questionFrontendId title titleSlug difficulty }
  }
}"""


def write(name, payload, what):
    path = os.path.join(HERE, name)
    io.open(path, "w", encoding="utf-8", newline="\n").write(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    print("%s: %d %s" % (name, len(payload), what))


def get(url, data=None, headers=None):
    """One request, with a few retries - both services rate-limit politely."""
    head = {"User-Agent": UA}
    if headers:
        head.update(headers)
    request = urllib.request.Request(url, data=data, headers=head)
    last = None
    for attempt in range(4):
        try:
            return urllib.request.urlopen(request, timeout=60).read()
        except Exception as err:
            last = err
            if attempt < 3:
                time.sleep(2 + attempt * 3)
    raise last


def refresh_leetcode():
    titles = {}
    skip = 0
    total = None
    while total is None or skip < total:
        body = json.dumps({
            "query": QUERY,
            "variables": {"categorySlug": "", "skip": skip, "limit": 100, "filters": {}},
        }).encode()
        page = json.loads(get("https://leetcode.com/graphql", body, {
            "Content-Type": "application/json",
            "Referer": "https://leetcode.com/problemset/",
        }))["data"]["problemsetQuestionList"]
        total = page["total"]
        questions = page["questions"]
        if not questions:
            break
        for q in questions:
            titles[str(q["frontendQuestionId"])] = [
                q["title"], q["titleSlug"], DIFFICULTY.get(q["difficulty"], 0),
            ]
        skip += len(questions)
        sys.stderr.write("\rleetcode %d/%d" % (skip, total))
        sys.stderr.flush()
        time.sleep(0.25)
    sys.stderr.write("\n")
    write("lc_titles.json", titles, "problems")


def refresh_euler():
    """projecteuler.net/minimal=problems is the whole index in one request,
    as `number##title##published##solvers` per line."""
    titles = {}
    text = get("https://projecteuler.net/minimal=problems").decode("utf-8", "replace")
    for line in text.splitlines():
        parts = line.split("##")
        if len(parts) >= 2 and parts[0].isdigit():
            titles[parts[0]] = parts[1]
    if not titles:
        raise SystemExit("projecteuler.net returned nothing recognisable - "
                         "check the minimal= endpoint before overwriting")
    write("pe_titles.json", titles, "problems")


def main():
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    if which in ("all", "leetcode"):
        refresh_leetcode()
    if which in ("all", "euler"):
        refresh_euler()
    print("now run: python build_solutions.py")


if __name__ == "__main__":
    main()
