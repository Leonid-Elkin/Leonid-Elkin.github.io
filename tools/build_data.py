"""Turn the scraped caches into the files the site ships.

Writes, under portfolio/data/:
    leetcode-index.js        the whole problem table, compactly encoded
    leetcode/<bucket>.json   statements, starter code and example cases
    euler-index.js           the Project Euler table
    euler/<bucket>.json      statements
    euler-mine.js            the solutions already in Euler_source/

Re-run this rather than editing anything it produces.
"""

import html
import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\walru\OneDrive\Рабочий стол\Portfolio Website\portfolio"
OUT = os.path.join(SITE, "data")

DIFF_CODE = {"Easy": 1, "Medium": 2, "Hard": 3}
LANG_ORDER = ["python3", "javascript", "typescript", "cpp", "java", "c", "csharp", "golang", "rust"]
LANG_KEY = {"python3": "python", "javascript": "javascript", "typescript": "typescript",
            "cpp": "cpp", "java": "java", "c": "c", "csharp": "csharp",
            "golang": "go", "rust": "rust"}


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with io.open(path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)


# ---------------------------------------------------------------- leetcode

def split_top_level(text):
    """Split a parameter list on commas that are not inside brackets."""
    parts, depth, current = [], 0, ""
    for c in text:
        if c in "([{":
            depth += 1
        elif c in ")]}":
            depth -= 1
        if c == "," and depth == 0:
            parts.append(current)
            current = ""
        else:
            current += c
    if current.strip():
        parts.append(current)
    return [p.strip() for p in parts if p.strip()]


def match_paren(text, start):
    """Index just past the ')' matching the '(' at `start`."""
    depth = 0
    for i in range(start, len(text)):
        if text[i] in "([{":
            depth += 1
        elif text[i] in ")]}":
            depth -= 1
            if depth == 0:
                return i
    return -1


PY_DEF = re.compile(r"^(\s*)def\s+([A-Za-z_]\w*)\s*\(", re.M)


def parse_python_snippet(code):
    """Find the one public method the runner should call, and its parameters."""
    if not code:
        return None
    is_solution_class = re.search(r"class\s+Solution\b", code) is not None
    methods = []
    for m in PY_DEF.finditer(code):
        name = m.group(2)
        if name.startswith("__"):
            continue
        close = match_paren(code, m.end() - 1)
        if close == -1:
            continue
        params = split_top_level(code[m.end():close])
        if params and params[0].split(":")[0].strip() == "self":
            params = params[1:]
        methods.append({"name": name, "params": params, "indent": len(m.group(1))})
    if not is_solution_class or len(methods) != 1:
        return {"design": True, "methods": [m["name"] for m in methods]}

    method = methods[0]
    shapes = []
    for param in method["params"]:
        annotation = param.split(":", 1)[1] if ":" in param else ""
        if "ListNode" in annotation:
            shapes.append("ListNode")
        elif "TreeNode" in annotation:
            shapes.append("TreeNode")
        else:
            shapes.append(None)
    return {
        "design": False,
        "entry": method["name"],
        "arity": len(method["params"]),
        "shapes": shapes,
        "params": method["params"],
    }


JS_ENTRY = re.compile(r"(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*function|function\s+([A-Za-z_$][\w$]*)\s*\(")


JS_BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.S)
JS_LINE_COMMENT = re.compile(r"//.*$", re.M)


def parse_js_entry(code):
    """LeetCode's JS stubs open with a commented-out ListNode definition, so
    the comments have to go before anything is matched."""
    if not code:
        return None
    stripped = JS_LINE_COMMENT.sub("", JS_BLOCK_COMMENT.sub("", code))
    m = JS_ENTRY.search(stripped)
    if not m:
        return None
    return m.group(1) or m.group(2)


TAG_RE = re.compile(r"<[^>]+>")
OUTPUT_RE = re.compile(r"^\s*Output:?\s*(.+?)\s*$", re.M)


def expected_outputs(content):
    text = TAG_RE.sub("\n", content or "")
    text = html.unescape(text)
    found = []
    for m in OUTPUT_RE.finditer(text):
        value = m.group(1).strip()
        if value:
            found.append(value)
    return found


def build_leetcode():
    meta = json.load(io.open(os.path.join(HERE, "lc_meta.json"), encoding="utf-8"))
    cache_dir = os.path.join(HERE, "lc_cache")

    tags = []
    tag_index = {}

    def tag_id(slug):
        if slug not in tag_index:
            tag_index[slug] = len(tags)
            tags.append(slug)
        return tag_index[slug]

    rows = []
    buckets = {}
    detailed = 0

    for entry in meta:
        try:
            number = int(entry["frontendQuestionId"])
        except (TypeError, ValueError):
            continue
        slug = entry["titleSlug"]
        paid = 1 if entry["isPaidOnly"] else 0
        rows.append([
            number,
            entry["title"],
            slug,
            DIFF_CODE.get(entry["difficulty"], 2),
            round(entry["acRate"] or 0, 1),
            paid,
            sorted(tag_id(t["slug"]) for t in entry["topicTags"]),
        ])

        path = os.path.join(cache_dir, slug + ".json")
        if paid or not os.path.exists(path):
            continue
        raw = json.load(io.open(path, encoding="utf-8"))
        snippets = raw.get("snip") or {}

        info = parse_python_snippet(snippets.get("python3", ""))
        record = {
            "slug": slug,
            "content": raw.get("content") or "",
            "hints": raw.get("hints") or [],
            "snip": {},
        }
        for lang in LANG_ORDER:
            if lang in snippets:
                record["snip"][LANG_KEY[lang]] = snippets[lang]

        raw_lines = (raw.get("tests") or "").split("\n")
        if info and not info.get("design") and info.get("arity"):
            arity = info["arity"]
            record["entry"] = info["entry"]
            record["arity"] = arity
            record["shapes"] = info["shapes"]
            record["params"] = info["params"]
            lines = [line for line in raw_lines if line.strip() != ""] if arity else []
            cases = [lines[i:i + arity] for i in range(0, len(lines) - arity + 1, arity)]
            record["cases"] = cases
            outs = expected_outputs(record["content"])
            record["expected"] = outs if len(outs) == len(cases) else []
        else:
            record["design"] = True
            record["cases"] = []
            record["expected"] = []
            record["rawTests"] = raw.get("tests") or ""

        js_entry = parse_js_entry(snippets.get("javascript", ""))
        if js_entry:
            record["jsEntry"] = js_entry

        buckets.setdefault(number // 100, {})[str(number)] = record
        detailed += 1

    rows.sort(key=lambda r: r[0])
    payload = {"tags": tags, "problems": rows}
    write(os.path.join(OUT, "leetcode-index.js"),
          "/* Generated by build_data.py from leetcode.com - do not edit by hand.\n"
          "   [id, title, slug, difficulty(1-3), acceptance %, paid, [tag ids]] */\n"
          "window.LC_INDEX = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n")

    for bucket, data in buckets.items():
        write(os.path.join(OUT, "leetcode", "%d.json" % bucket),
              json.dumps(data, ensure_ascii=False, separators=(",", ":")))

    print("leetcode: %d rows, %d with statements, %d buckets, %d tags"
          % (len(rows), detailed, len(buckets), len(tags)))


# ------------------------------------------------------------------- euler

def build_euler():
    index = json.load(io.open(os.path.join(HERE, "pe_index.json"), encoding="utf-8"))
    cache_dir = os.path.join(HERE, "pe_cache")

    rows = []
    buckets = {}
    for entry in index:
        number = entry["n"]
        path = os.path.join(cache_dir, "%d.json" % number)
        level = pct = None
        if os.path.exists(path):
            raw = json.load(io.open(path, encoding="utf-8"))
            level, pct = raw.get("level"), raw.get("pct")
            buckets.setdefault(number // 100, {})[str(number)] = {
                "content": raw.get("content") or "",
            }
        rows.append([number, entry["title"], level or 0, pct or 0,
                     entry["solvedBy"], entry["published"]])

    rows.sort(key=lambda r: r[0])
    write(os.path.join(OUT, "euler-index.js"),
          "/* Generated by build_data.py from projecteuler.net - do not edit by hand.\n"
          "   [n, title, level, difficulty %, solved by, published] */\n"
          "window.PE_INDEX = " + json.dumps({"problems": rows}, ensure_ascii=False, separators=(",", ":")) + ";\n")

    for bucket, data in buckets.items():
        write(os.path.join(OUT, "euler", "%d.json" % bucket),
              json.dumps(data, ensure_ascii=False, separators=(",", ":")))

    print("euler: %d rows, %d with statements, %d buckets" % (len(rows), sum(len(b) for b in buckets.values()), len(buckets)))


def build_euler_mine():
    source = os.path.join(SITE, "Euler_source")
    mine = {}
    if not os.path.isdir(source):
        print("euler_source: missing, skipped")
        return

    def read(path):
        with io.open(path, encoding="utf-8", errors="replace") as handle:
            return handle.read().replace("\r\n", "\n")

    for name in sorted(os.listdir(source)):
        full = os.path.join(source, name)
        if os.path.isfile(full) and name.endswith(".py") and name[:-3].isdigit():
            mine[name[:-3]] = {"code": read(full), "files": []}
        elif os.path.isdir(full) and name.isdigit():
            code, files = None, []
            for inner in sorted(os.listdir(full)):
                inner_path = os.path.join(full, inner)
                if not os.path.isfile(inner_path):
                    continue
                if inner.endswith(".py"):
                    code = read(inner_path)
                else:
                    files.append({"name": inner, "text": read(inner_path)})
            if code is not None:
                mine[name] = {"code": code, "files": files}

    write(os.path.join(OUT, "euler-mine.js"),
          "/* Generated by build_data.py from Euler_source/ - the solutions already written.\n"
          "   Regenerate rather than edit. */\n"
          "window.PE_MINE = " + json.dumps(mine, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print("euler_source: %d solutions" % len(mine))


if __name__ == "__main__":
    which = sys.argv[2] if len(sys.argv) > 2 else "all"
    if which in ("all", "leetcode"):
        build_leetcode()
    if which in ("all", "euler"):
        build_euler()
        build_euler_mine()
