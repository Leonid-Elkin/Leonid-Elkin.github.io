import json, urllib.request, urllib.error, time, sys
Q = """query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
  problemsetQuestionList: questionList(categorySlug: $categorySlug, limit: $limit, skip: $skip, filters: $filters) {
    total: totalNum
    questions: data { frontendQuestionId: questionFrontendId title titleSlug difficulty acRate isPaidOnly topicTags { slug } }
  }
}"""
def call(skip, limit):
    body = json.dumps({"query": Q, "variables": {"categorySlug": "", "skip": skip, "limit": limit, "filters": {}}}).encode()
    req = urllib.request.Request("https://leetcode.com/graphql", data=body,
        headers={"Content-Type":"application/json","User-Agent":"Mozilla/5.0","Referer":"https://leetcode.com/problemset/"})
    for attempt in range(4):
        try:
            return json.load(urllib.request.urlopen(req, timeout=60))["data"]["problemsetQuestionList"]
        except Exception as e:
            if attempt == 3: raise
            time.sleep(2 + attempt * 3)

out, skip, total = [], 0, None
while total is None or skip < total:
    page = call(skip, 100)
    total = page["total"]
    qs = page["questions"]
    if not qs: break
    out.extend(qs)
    skip += len(qs)
    print(f"\r{skip}/{total}", end="", file=sys.stderr, flush=True)
    time.sleep(0.25)
print("", file=sys.stderr)
json.dump(out, open("lc_meta.json","w",encoding="utf-8"), ensure_ascii=False)
print("saved", len(out))
