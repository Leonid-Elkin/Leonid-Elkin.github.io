/* leetcode.js - the LeetCode track.
 *
 * The table is the whole public problem set, scraped once into
 * data/leetcode-index.js. Statements, starter stubs and the worked examples
 * are split into buckets of a hundred under data/leetcode/, fetched only when
 * a problem is opened, so the page costs one index file to load and nothing
 * else until you pick something.
 */

(function () {
  "use strict";

  const root = document.getElementById("judge");
  if (!root || !window.LC_INDEX) return;

  const DIFFICULTY = { 1: "Easy", 2: "Medium", 3: "Hard" };
  const tagNames = window.LC_INDEX.tags || [];

  const problems = (window.LC_INDEX.problems || []).map((row) => {
    const id = row[0];
    const title = row[1];
    const slug = row[2];
    const difficulty = row[3];
    const acceptance = row[4];
    const paid = !!row[5];
    const tags = (row[6] || []).map((index) => tagNames[index]).filter(Boolean);
    return {
      key: String(id),
      num: id,
      title: title,
      slug: slug,
      difficulty: difficulty,
      acceptance: acceptance,
      paid: paid,
      tags: tags,
      external: "https://leetcode.com/problems/" + slug + "/",
      searchText: (id + " " + title + " " + tags.join(" ")).toLowerCase(),
      sortValues: { num: id, acceptance: acceptance, difficulty: difficulty },
      metaBits: [
        { text: DIFFICULTY[difficulty], className: "diff-" + difficulty },
        { text: acceptance.toFixed(1) + "% accepted" },
      ].concat(paid ? [{ text: "subscriber only", className: "judge-chip-paid" }] : []),
    };
  });

  /* ---------------- statements, a bucket at a time ---------------- */

  const buckets = {};

  function loadDetail(problem) {
    if (problem.paid) {
      return Promise.reject(new Error("LeetCode keeps this one behind a subscription"));
    }
    const bucket = Math.floor(problem.num / 100);
    if (!buckets[bucket]) {
      buckets[bucket] = fetch("data/leetcode/" + bucket + ".json")
        .then((response) => {
          if (!response.ok) throw new Error("statement bundle " + bucket + " is missing");
          return response.json();
        })
        .catch((err) => { delete buckets[bucket]; throw err; });
    }
    return buckets[bucket].then((data) => {
      const found = data[String(problem.num)];
      if (!found) throw new Error("no statement was scraped for this one");
      return found;
    });
  }

  /* ---------------- rendering the statement ---------------- */

  function renderStatement(pane, problem, detail) {
    const article = document.createElement("article");
    article.className = "judge-statement-body";
    /* The HTML here is LeetCode's own, captured at build time into a file in
       this repo. It is not user input and it is not fetched from anywhere at
       runtime, so it goes in as markup. */
    article.innerHTML = detail.content || "<p>No statement was captured for this problem.</p>";
    pane.appendChild(article);

    if (detail.design) {
      const note = document.createElement("p");
      note.className = "judge-note judge-note-quiet";
      note.textContent = "This is a design problem - it wants a whole class, not one method, " +
        "so the runner will not call anything for you. Run it and print what you want to see.";
      pane.appendChild(note);
    }

    if (detail.hints && detail.hints.length) {
      const wrap = document.createElement("div");
      wrap.className = "judge-hints";
      detail.hints.forEach((hint, index) => {
        const item = document.createElement("details");
        const summary = document.createElement("summary");
        summary.textContent = "Hint " + (index + 1);
        item.appendChild(summary);
        const body = document.createElement("div");
        body.innerHTML = hint;
        item.appendChild(body);
        wrap.appendChild(item);
      });
      pane.appendChild(wrap);
    }
  }

  /* ---------------- starter code ---------------- */

  const COMMENT = { python: "#", javascript: "//", typescript: "//", cpp: "//", java: "//", c: "//", csharp: "//", go: "//", rust: "//" };

  function starter(problem, detail, lang) {
    if (detail && detail.snip && detail.snip[lang]) return detail.snip[lang];
    const mark = COMMENT[lang] || "//";
    return mark + " " + problem.num + ". " + problem.title + "\n" +
      mark + " LeetCode did not publish a " + (window.ELKIDE.byId[lang] || {}).label +
      " stub for this one - write it from scratch.\n\n";
  }

  function casesFor(problem, detail) {
    return (detail && detail.cases) || [];
  }

  function expectedFor(problem, detail) {
    return (detail && detail.expected) || [];
  }

  function runRequest(problem, detail, lang, code, cases) {
    const entry = lang === "python" ? (detail && detail.entry) : (detail && detail.jsEntry);
    const usable = entry && cases && cases.length && !(detail && detail.design);
    return {
      op: "run",
      lang: lang,
      code: code,
      mode: usable ? "solution" : "script",
      entry: entry,
      cases: cases || [],
      shapes: (detail && detail.shapes) || [],
    };
  }

  /* ---------------- the table ---------------- */

  const columns = [
    {
      label: "",
      className: "col-status",
      render: function (cell, problem, status) {
        const dot = document.createElement("span");
        dot.className = "judge-dot judge-dot-" + status;
        dot.title = status === "solved" ? "solved" : status === "attempted" ? "attempted" : "not done";
        cell.appendChild(dot);
      },
    },
    {
      label: "#",
      className: "col-num mono",
      sort: "num",
      render: function (cell, problem) { cell.textContent = problem.num; },
    },
    {
      label: "Problem",
      className: "col-title",
      sort: "title",
      render: function (cell, problem) {
        cell.appendChild(document.createTextNode(problem.title));
        if (problem.paid) {
          const lock = document.createElement("span");
          lock.className = "judge-chip judge-chip-paid";
          lock.textContent = "subscriber";
          cell.appendChild(lock);
        }
      },
    },
    {
      label: "Difficulty",
      className: "col-diff",
      sort: "difficulty",
      render: function (cell, problem) {
        const chip = document.createElement("span");
        chip.className = "judge-chip diff-" + problem.difficulty;
        chip.textContent = DIFFICULTY[problem.difficulty];
        cell.appendChild(chip);
      },
    },
    {
      label: "Accepted",
      className: "col-rate mono",
      sort: "acceptance",
      render: function (cell, problem) { cell.textContent = problem.acceptance.toFixed(1) + "%"; },
    },
    {
      label: "Topics",
      className: "col-tags",
      render: function (cell, problem) {
        problem.tags.slice(0, 3).forEach((tag) => {
          const chip = document.createElement("span");
          chip.className = "judge-tag";
          chip.textContent = tag.replace(/-/g, " ");
          cell.appendChild(chip);
        });
        if (problem.tags.length > 3) {
          const more = document.createElement("span");
          more.className = "judge-tag judge-tag-more";
          more.textContent = "+" + (problem.tags.length - 3);
          cell.appendChild(more);
        }
      },
    },
  ];

  window.ELKJUDGE.mount({
    track: "leetcode",
    root: root,
    problems: problems,
    columns: columns,
    tags: tagNames,
    langs: ["python", "javascript", "typescript", "cpp", "java", "c", "csharp", "go", "rust"],
    defaultLang: "python",
    searchPlaceholder: "title, number or topic",
    externalLabel: "open on leetcode.com ↗",
    loadDetail: loadDetail,
    renderStatement: renderStatement,
    starter: starter,
    casesFor: casesFor,
    expectedFor: expectedFor,
    runRequest: runRequest,
  });
})();
