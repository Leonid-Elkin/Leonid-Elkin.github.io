import json, os, re, sys, time, urllib.request

H = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
     "Accept": "text/html,*/*", "Accept-Language": "en-US,en;q=0.9", "Connection": "close"}
def get(u):
    return urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=45).read().decode("utf-8", "replace")

CACHE = "pe_cache"
os.makedirs(CACHE, exist_ok=True)

# index: ID##Title##Published##Solved By
idx = []
for line in get("https://projecteuler.net/minimal=problems").splitlines():
    parts = line.split("##")
    if len(parts) == 4 and parts[0].isdigit():
        idx.append({"n": int(parts[0]), "title": parts[1], "published": parts[2][:10], "solvedBy": int(parts[3])})
json.dump(idx, open("pe_index.json", "w", encoding="utf-8"), ensure_ascii=False)
sys.stderr.write("index %d problems\n" % len(idx))

RE_DIFF = re.compile(r"Difficulty:\s*Level\s*(\d+)\s*\[(\d+)%\]")
RE_BODY = re.compile(r'<div class="problem_content"[^>]*>(.*?)</div>\s*(?:<div|<br)', re.S)

fail = 0
for i, p in enumerate(idx):
    path = os.path.join(CACHE, "%d.json" % p["n"])
    if os.path.exists(path):
        continue
    for attempt in range(5):
        try:
            html = get("https://projecteuler.net/problem=%d" % p["n"])
            m = RE_DIFF.search(html)
            body = RE_BODY.search(html)
            if not body:
                body_txt = get("https://projecteuler.net/minimal=%d" % p["n"])
            else:
                body_txt = body.group(1)
            rec = {"n": p["n"], "title": p["title"], "published": p["published"],
                   "solvedBy": p["solvedBy"],
                   "level": int(m.group(1)) if m else None,
                   "pct": int(m.group(2)) if m else None,
                   "content": body_txt.strip()}
            json.dump(rec, open(path, "w", encoding="utf-8"), ensure_ascii=False)
            break
        except Exception as e:
            if attempt == 4:
                fail += 1
                sys.stderr.write("\nFAIL %d: %s\n" % (p["n"], e))
            else:
                time.sleep(3 + attempt * 5)
    time.sleep(0.35)
    if i % 20 == 0:
        sys.stderr.write("\r%d/%d fail=%d" % (i, len(idx), fail)); sys.stderr.flush()
sys.stderr.write("\nDONE fail=%d\n" % fail)
