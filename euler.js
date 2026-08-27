/* euler.js - the Project Euler track.
 *
 * Same workbench as the LeetCode page, with three differences that come from
 * the site itself. There is no signature to call, so a solution is a program
 * and the answer is whatever it prints. Difficulty is a percentage rather than
 * three words, so it is banded to make it filterable. And the seventy
 * solutions already sitting in Euler_source/ are loaded in as the saved
 * Python for those problems, marked solved, the first time the page runs.
 *
 * Answers are deliberately not stored anywhere. Project Euler asks that they
 * are not published, and a page that hands you the number is not a page you
 * would use twice.
 */

(function () {
  "use strict";

  const root = document.getElementById("judge");
  if (!root || !window.PE_INDEX) return;

  const mine = window.PE_MINE || {};

  /* Project Euler grades in percent. Three bands keep the filter honest and
     line the page up with the LeetCode one. */
  function band(percent) {
    if (percent <= 25) return 1;
    if (percent <= 55) return 2;
    return 3;
  }
  const BAND_NAMES = { 1: "Gentle", 2: "Middling", 3: "Hard" };

  const problems = (window.PE_INDEX.problems || []).map((row) => {
    const n = row[0];
    const title = row[1];
    const level = row[2];
    const percent = row[3];
    const solvedBy = row[4];
    const published = row[5];
    const difficulty = band(percent);
    return {
      key: String(n),
      num: n,
      title: title,
      level: level,
      percent: percent,
      solvedBy: solvedBy,
      published: published,
      difficulty: difficulty,
      tags: [],
      external: "https://projecteuler.net/problem=" + n,
      searchText: (n + " " + title).toLowerCase(),
      sortValues: { num: n, percent: percent, solvedBy: solvedBy, difficulty: difficulty },
      metaBits: [
        { text: BAND_NAMES[difficulty] + " · " + percent + "%", className: "diff-" + difficulty },
        { text: solvedBy.toLocaleString() + " solvers" },
        { text: "published " + published },
      ],
    };
  });

  /* ---------------- seed from Euler_source/ ---------------- */

  /* Run once: the solutions already written go in as saved Python. After that
     the store is the truth, so re-running this would clobber later edits. */
  function seed(store) {
    if (store.data.seeded) return;
    Object.keys(mine).forEach((n) => {
      const slot = store.slot("python", n);
      if (store.data.solutions[slot]) return;
      store.data.solutions[slot] = {
        status: "solved",
        code: mine[n].code,
        ms: null,
        note: "from Euler_source/",
        updated: Date.now(),
      };
    });
    store.data.seeded = true;
    store.save();
  }

  /* ---------------- statements ---------------- */

  const buckets = {};

  function loadDetail(problem) {
    const bucket = Math.floor(problem.num / 100);
    if (!buckets[bucket]) {
      buckets[bucket] = fetch("data/euler/" + bucket + ".json")
        .then((response) => {
          if (!response.ok) throw new Error("statement bundle " + bucket + " is missing");
          return response.json();
        })
        .catch((err) => { delete buckets[bucket]; throw err; });
    }
    return buckets[bucket].then((data) => {
      const found = data[String(problem.num)];
      if (!found) throw new Error("no statement was captured for this one");
      return found;
    });
  }

  /* Project Euler writes its statements in LaTeX. MathJax is fetched the
     first time a statement needs it and never otherwise. */
  let mathjax = null;

  function typeset(node) {
    if (!mathjax) {
      window.MathJax = {
        tex: { inlineMath: [["$", "$"], ["\\(", "\\)"]], displayMath: [["$$", "$$"], ["\\[", "\\]"]] },
        options: { skipHtmlTags: ["script", "noscript", "style", "textarea", "pre", "code"] },
      };
      mathjax = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js";
        script.async = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error("MathJax did not load"));
        document.head.appendChild(script);
      });
    }
    mathjax.then(() => {
      if (window.MathJax && window.MathJax.typesetPromise) window.MathJax.typesetPromise([node]);
    }).catch(() => { /* the LaTeX stays as source, which is still readable */ });
  }

  function renderStatement(pane, problem, detail) {
    const article = document.createElement("article");
    article.className = "judge-statement-body";
    /* projecteuler.net's own markup, captured at build time into this repo. */
    article.innerHTML = detail.content || "<p>No statement was captured for this problem.</p>";
    pane.appendChild(article);
    typeset(article);

    if (mine[problem.key]) {
      const note = document.createElement("p");
      note.className = "judge-note judge-note-quiet";
      note.textContent = "The Python here is the file from Euler_source/, as it was written.";
      pane.appendChild(note);
      const files = mine[problem.key].files || [];
      if (files.length) {
        const list = document.createElement("p");
        list.className = "judge-note judge-note-quiet";
        list.textContent = "It reads " + files.map((f) => f.name).join(", ") +
          ", which is bundled with it and will be there when you run it.";
        pane.appendChild(list);
      }
    }

    const answer = document.createElement("p");
    answer.className = "judge-note judge-note-quiet";
    answer.textContent = "Answers are not stored on this page. Run it, read the number, " +
      "check it on projecteuler.net, then mark it solved.";
    pane.appendChild(answer);
  }

  /* ---------------- code ---------------- */

  const COMMENT = { python: "#", javascript: "//", typescript: "//", cpp: "//", java: "//", c: "//", csharp: "//", go: "//", rust: "//" };

  function starter(problem, detail, lang) {
    if (lang === "python" && mine[problem.key]) return mine[problem.key].code;
    const mark = COMMENT[lang] || "//";
    const head = mark + " Project Euler " + problem.num + " - " + problem.title + "\n" +
      mark + " Print the answer. Nothing else is checked.\n\n";
    if (lang === "python") return head + "print()\n";
    if (lang === "javascript" || lang === "typescript") return head + "console.log();\n";
    if (lang === "java") return head + "public class Main {\n    public static void main(String[] args) {\n\n    }\n}\n";
    if (lang === "cpp") return head + "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n\n    return 0;\n}\n";
    if (lang === "c") return head + "#include <stdio.h>\n\nint main(void) {\n\n    return 0;\n}\n";
    if (lang === "csharp") return head + "using System;\n\nclass Program {\n    static void Main() {\n\n    }\n}\n";
    if (lang === "go") return head + "package main\n\nimport \"fmt\"\n\nfunc main() {\n\n}\n";
    if (lang === "rust") return head + "fn main() {\n\n}\n";
    return head;
  }

  function casesFor() { return []; }
  function expectedFor() { return []; }

  function runRequest(problem, detail, lang, code) {
    return {
      op: "run",
      lang: lang,
      code: code,
      mode: "script",
      files: (mine[problem.key] && mine[problem.key].files) || [],
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
      render: function (cell, problem) { cell.textContent = problem.title; },
    },
    {
      label: "Difficulty",
      className: "col-diff",
      sort: "percent",
      render: function (cell, problem) {
        const chip = document.createElement("span");
        chip.className = "judge-chip diff-" + problem.difficulty;
        chip.textContent = problem.percent ? problem.percent + "%" : "unrated";
        cell.appendChild(chip);
      },
    },
    {
      label: "Solvers",
      className: "col-rate mono",
      sort: "solvedBy",
      render: function (cell, problem) { cell.textContent = problem.solvedBy.toLocaleString(); },
    },
    {
      label: "Published",
      className: "col-tags mono",
      render: function (cell, problem) { cell.textContent = problem.published; },
    },
  ];

  const workbench = window.ELKJUDGE.mount({
    track: "euler",
    root: root,
    problems: problems,
    columns: columns,
    langs: ["python", "javascript", "typescript", "cpp", "java", "c", "csharp", "go", "rust"],
    defaultLang: "python",
    difficulties: [
      { id: 1, label: "Gentle" },
      { id: 2, label: "Middling" },
      { id: 3, label: "Hard" },
    ],
    searchPlaceholder: "title or number",
    externalLabel: "open on projecteuler.net ↗",
    noCasesNote: "Project Euler problems take no input. Press run and read the number it prints.",
    loadDetail: loadDetail,
    renderStatement: renderStatement,
    starter: starter,
    casesFor: casesFor,
    expectedFor: expectedFor,
    runRequest: runRequest,
  });

  seed(workbench.store);
  workbench.renderTable();
})();
