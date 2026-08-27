import json, os, sys, threading, queue, time, urllib.request

LANGS = {"python3","javascript","typescript","cpp","java","c","csharp","golang","rust"}
Q = """query q($titleSlug: String!){question(titleSlug:$titleSlug){questionFrontendId title difficulty content exampleTestcases sampleTestCase hints codeSnippets{langSlug code}}}"""
CACHE = "lc_cache"
os.makedirs(CACHE, exist_ok=True)

def fetch(slug):
    body = json.dumps({"query": Q, "variables": {"titleSlug": slug}}).encode()
    req = urllib.request.Request("https://leetcode.com/graphql", data=body, headers={
        "Content-Type": "application/json", "User-Agent": "Mozilla/5.0",
        "Referer": "https://leetcode.com/problems/%s/" % slug})
    return json.load(urllib.request.urlopen(req, timeout=60))["data"]["question"]

meta = json.load(open("lc_meta.json", encoding="utf-8"))
todo = [m["titleSlug"] for m in meta if not m["isPaidOnly"]
        and not os.path.exists(os.path.join(CACHE, m["titleSlug"] + ".json"))]
sys.stderr.write("todo %d\n" % len(todo))

work = queue.Queue()
for s in todo: work.put(s)
lock = threading.Lock()
state = {"ok": 0, "fail": 0}

def worker():
    while True:
        try: slug = work.get_nowait()
        except queue.Empty: return
        for attempt in range(5):
            try:
                q = fetch(slug)
                if q is None: raise ValueError("null question")
                rec = {"id": int(q["questionFrontendId"]), "slug": slug,
                       "content": q["content"] or "", "tests": q["exampleTestcases"] or "",
                       "sample": q["sampleTestCase"] or "", "hints": q["hints"] or [],
                       "snip": {c["langSlug"]: c["code"] for c in q["codeSnippets"] or [] if c["langSlug"] in LANGS}}
                tmp = os.path.join(CACHE, slug + ".json.tmp")
                with open(tmp, "w", encoding="utf-8") as f: json.dump(rec, f, ensure_ascii=False)
                os.replace(tmp, os.path.join(CACHE, slug + ".json"))
                with lock:
                    state["ok"] += 1
                    if state["ok"] % 50 == 0:
                        sys.stderr.write("\rok=%d fail=%d left=%d" % (state["ok"], state["fail"], work.qsize())); sys.stderr.flush()
                break
            except Exception as e:
                if attempt == 4:
                    with lock: state["fail"] += 1
                    sys.stderr.write("\nFAIL %s: %s\n" % (slug, e))
                else:
                    time.sleep(2 + attempt * 4)
        time.sleep(0.05)

threads = [threading.Thread(target=worker, daemon=True) for _ in range(8)]
for t in threads: t.start()
for t in threads: t.join()
sys.stderr.write("\nDONE ok=%d fail=%d\n" % (state["ok"], state["fail"]))
