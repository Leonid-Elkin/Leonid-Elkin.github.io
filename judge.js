/* judge.js - the part that is not the editor.
 *
 * One workbench, driven twice: leetcode.js and euler.js each hand it a track
 * description and it builds the same thing - a filterable problem table, and
 * a split view with the statement on the left and the editor, the runner and
 * the console on the right.
 *
 * Progress is per language on purpose. Solving 217 in Python says nothing
 * about solving it in C++, so the two are stored under different keys and the
 * table re-reads itself when the language changes. That is the whole point of
 * the language filter.
 *
 * Everything lives in localStorage. GitHub Pages serves files and nothing
 * else, so there is no server to keep it on; the optional gist sync is there
 * for people who use two machines.
 */

(function () {
  "use strict";

  const DIFF_NAMES = { 1: "Easy", 2: "Medium", 3: "Hard" };
  const PAGE_SIZE = 50;

  /* ================================================================
     storage
     ================================================================ */

  function Store(track) {
    this.key = "elk.judge." + track;
    this.data = { lang: null, solutions: {}, gist: { token: "", id: "" }, view: {} };
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.data = Object.assign(this.data, parsed);
        this.data.gist = Object.assign({ token: "", id: "" }, parsed.gist || {});
        this.data.solutions = parsed.solutions || {};
        this.data.view = parsed.view || {};
      }
    } catch (err) {
      console.warn("[judge] saved progress could not be read:", err);
    }
  }

  Store.prototype.save = function () {
    try {
      localStorage.setItem(this.key, JSON.stringify(this.data));
      return true;
    } catch (err) {
      console.warn("[judge] could not save:", err);
      return false;
    }
  };

  Store.prototype.slot = function (lang, key) {
    return lang + "|" + key;
  };

  Store.prototype.get = function (lang, key) {
    return this.data.solutions[this.slot(lang, key)] || null;
  };

  Store.prototype.put = function (lang, key, patch) {
    const slot = this.slot(lang, key);
    const record = Object.assign({ status: "todo", code: "", ms: null, note: "" },
      this.data.solutions[slot] || {}, patch);
    record.updated = Date.now();
    this.data.solutions[slot] = record;
    this.save();
    return record;
  };

  Store.prototype.drop = function (lang, key) {
    delete this.data.solutions[this.slot(lang, key)];
    this.save();
  };

  Store.prototype.statusOf = function (lang, key) {
    const record = this.get(lang, key);
    return record ? record.status : "todo";
  };

  /* ================================================================
     small DOM helpers
     ================================================================ */

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function button(className, label, onClick) {
    const node = el("button", className, label);
    node.type = "button";
    if (onClick) node.addEventListener("click", onClick);
    return node;
  }

  function debounce(fn, wait) {
    let timer = null;
    return function () {
      const args = arguments;
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(null, args), wait);
    };
  }

  function plural(count, word) {
    return count + " " + word + (count === 1 ? "" : "s");
  }

  /* ================================================================
     the workbench
     ================================================================ */

  function mount(config) {
    const store = new Store(config.track);
    const problems = config.problems;
    const byKey = {};
    problems.forEach((p) => { byKey[p.key] = p; });

    const langs = config.langs.map((id) => window.ELKIDE.byId[id]).filter(Boolean);
    if (!store.data.lang || !langs.some((l) => l.id === store.data.lang)) {
      store.data.lang = config.defaultLang || langs[0].id;
    }

    const filters = Object.assign({
      search: "",
      difficulty: [],
      status: [],
      tags: [],
      sort: "num",
      dir: 1,
      page: 0,
    }, store.data.view || {});

    let editor = null;
    let worker = null;
    let running = false;
    let current = null;       /* the open problem */
    let detail = null;        /* its statement and starter code */
    let checkSeq = 0;

    const root = config.root;
    clear(root);

    /* ---------------- chrome ---------------- */

    const bar = el("div", "judge-bar");
    root.appendChild(bar);

    const langSelect = el("select", "judge-select");
    langSelect.setAttribute("aria-label", "Language");
    langs.forEach((lang) => {
      const option = el("option", null, lang.label + (lang.runs ? "" : "  (editor only)"));
      option.value = lang.id;
      langSelect.appendChild(option);
    });
    langSelect.value = store.data.lang;
    langSelect.addEventListener("change", () => {
      store.data.lang = langSelect.value;
      store.save();
      if (current) openProblem(current.key, true);
      renderTable();
      renderCounts();
    });

    const langWrap = el("label", "judge-field");
    langWrap.appendChild(el("span", "judge-field-label", "Language"));
    langWrap.appendChild(langSelect);
    bar.appendChild(langWrap);

    const search = el("input", "judge-search");
    search.type = "search";
    search.placeholder = config.searchPlaceholder || "search problems";
    search.setAttribute("aria-label", "Search problems");
    search.value = filters.search;
    search.addEventListener("input", debounce(() => {
      filters.search = search.value;
      filters.page = 0;
      persistView();
      renderTable();
    }, 160));
    const searchWrap = el("label", "judge-field judge-field-grow");
    searchWrap.appendChild(el("span", "judge-field-label", "Find"));
    searchWrap.appendChild(search);
    bar.appendChild(searchWrap);

    const counts = el("p", "judge-counts");
    bar.appendChild(counts);

    /* filter rows */
    const filterRows = el("div", "judge-filters");
    root.appendChild(filterRows);

    const statusRow = filterRow("Status", [
      { id: "solved", label: "Solved" },
      { id: "attempted", label: "Attempted" },
      { id: "todo", label: "Not done" },
    ], filters.status);

    const difficultyRow = filterRow("Difficulty", (config.difficulties || [
      { id: 1, label: "Easy" }, { id: 2, label: "Medium" }, { id: 3, label: "Hard" },
    ]), filters.difficulty);

    filterRows.appendChild(statusRow);
    filterRows.appendChild(difficultyRow);

    if (config.tags && config.tags.length) {
      const tagsWrap = el("div", "judge-filter-row judge-tags");
      tagsWrap.appendChild(el("span", "judge-filter-label", "Topic"));
      const tagSelect = el("select", "judge-select judge-select-wide");
      tagSelect.setAttribute("aria-label", "Topic");
      const any = el("option", null, "any topic");
      any.value = "";
      tagSelect.appendChild(any);
      config.tags.slice().sort().forEach((tag, index) => {
        const option = el("option", null, tag.replace(/-/g, " "));
        option.value = tag;
        tagSelect.appendChild(option);
      });
      tagSelect.value = filters.tags[0] || "";
      tagSelect.addEventListener("change", () => {
        filters.tags = tagSelect.value ? [tagSelect.value] : [];
        filters.page = 0;
        persistView();
        renderTable();
      });
      tagsWrap.appendChild(tagSelect);
      tagsWrap.appendChild(button("filter judge-reset", "clear filters", () => {
        filters.search = "";
        filters.difficulty = [];
        filters.status = [];
        filters.tags = [];
        filters.page = 0;
        search.value = "";
        tagSelect.value = "";
        syncFilterButtons();
        persistView();
        renderTable();
      }));
      filterRows.appendChild(tagsWrap);
    } else {
      const resetWrap = el("div", "judge-filter-row");
      resetWrap.appendChild(el("span", "judge-filter-label", ""));
      resetWrap.appendChild(button("filter judge-reset", "clear filters", () => {
        filters.search = "";
        filters.difficulty = [];
        filters.status = [];
        filters.page = 0;
        search.value = "";
        syncFilterButtons();
        persistView();
        renderTable();
      }));
      filterRows.appendChild(resetWrap);
    }

    function filterRow(label, options, selected) {
      const row = el("div", "judge-filter-row");
      row.appendChild(el("span", "judge-filter-label", label));
      options.forEach((option) => {
        const node = button("filter", option.label);
        node.dataset.value = String(option.id);
        node.dataset.group = label;
        node.setAttribute("aria-pressed", selected.indexOf(option.id) !== -1 ? "true" : "false");
        node.appendChild(el("span", "count", ""));
        node.addEventListener("click", () => {
          const value = typeof option.id === "number" ? option.id : String(option.id);
          const at = selected.indexOf(value);
          if (at === -1) selected.push(value);
          else selected.splice(at, 1);
          node.setAttribute("aria-pressed", at === -1 ? "true" : "false");
          filters.page = 0;
          persistView();
          renderTable();
        });
        row.appendChild(node);
      });
      return row;
    }

    function syncFilterButtons() {
      root.querySelectorAll(".judge-filter-row .filter[data-value]").forEach((node) => {
        node.setAttribute("aria-pressed", "false");
      });
    }

    function persistView() {
      store.data.view = {
        search: filters.search,
        difficulty: filters.difficulty,
        status: filters.status,
        tags: filters.tags,
        sort: filters.sort,
        dir: filters.dir,
        page: filters.page,
      };
      store.save();
    }

    /* ---------------- table ---------------- */

    const tableWrap = el("div", "judge-table-wrap");
    root.appendChild(tableWrap);

    const table = el("table", "judge-table");
    const thead = el("thead");
    const headRow = el("tr");
    config.columns.forEach((column) => {
      const cell = el("th", column.className || null, column.label);
      if (column.sort) {
        cell.classList.add("sortable");
        cell.tabIndex = 0;
        const activate = () => {
          if (filters.sort === column.sort) filters.dir = -filters.dir;
          else { filters.sort = column.sort; filters.dir = 1; }
          filters.page = 0;
          persistView();
          renderTable();
        };
        cell.addEventListener("click", activate);
        cell.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); }
        });
      }
      headRow.appendChild(cell);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = el("tbody");
    table.appendChild(tbody);
    tableWrap.appendChild(table);

    const pager = el("div", "judge-pager");
    root.appendChild(pager);

    function matches(problem) {
      const status = store.statusOf(store.data.lang, problem.key);
      if (filters.status.length && filters.status.indexOf(status) === -1) return false;
      if (filters.difficulty.length && filters.difficulty.indexOf(problem.difficulty) === -1) return false;
      if (filters.tags.length) {
        const tags = problem.tags || [];
        for (let i = 0; i < filters.tags.length; i++) {
          if (tags.indexOf(filters.tags[i]) === -1) return false;
        }
      }
      if (filters.search) {
        const needle = filters.search.trim().toLowerCase();
        if (!needle) return true;
        if (/^\d+$/.test(needle)) {
          if (String(problem.num).indexOf(needle) !== 0 &&
              problem.title.toLowerCase().indexOf(needle) === -1) return false;
        } else if (problem.searchText.indexOf(needle) === -1) {
          return false;
        }
      }
      return true;
    }

    function sorted(rows) {
      const key = filters.sort;
      const dir = filters.dir;
      const copy = rows.slice();
      copy.sort((a, b) => {
        let left;
        let right;
        if (key === "status") {
          const order = { solved: 0, attempted: 1, todo: 2 };
          left = order[store.statusOf(store.data.lang, a.key)];
          right = order[store.statusOf(store.data.lang, b.key)];
        } else if (key === "title") {
          left = a.title.toLowerCase();
          right = b.title.toLowerCase();
        } else {
          left = a.sortValues[key];
          right = b.sortValues[key];
        }
        if (left === right) return a.num - b.num;
        return (left > right ? 1 : -1) * dir;
      });
      return copy;
    }

    let visible = [];

    function renderTable() {
      visible = sorted(problems.filter(matches));
      const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
      if (filters.page >= pages) filters.page = pages - 1;
      const start = filters.page * PAGE_SIZE;
      const slice = visible.slice(start, start + PAGE_SIZE);

      clear(tbody);
      if (!slice.length) {
        const row = el("tr");
        const cell = el("td", "judge-empty", "Nothing matches those filters.");
        cell.colSpan = config.columns.length;
        row.appendChild(cell);
        tbody.appendChild(row);
      }

      slice.forEach((problem) => {
        const status = store.statusOf(store.data.lang, problem.key);
        const row = el("tr", "judge-row status-" + status);
        row.tabIndex = 0;
        row.addEventListener("click", (event) => {
          if (event.target.closest("a")) return;
          openProblem(problem.key);
        });
        row.addEventListener("keydown", (event) => {
          if (event.key === "Enter") { event.preventDefault(); openProblem(problem.key); }
        });
        config.columns.forEach((column) => {
          const cell = el("td", column.className || null);
          column.render(cell, problem, status, store);
          row.appendChild(cell);
        });
        tbody.appendChild(row);
      });

      renderPager(pages);
      renderCounts();
      updateFilterCounts();
    }

    function renderPager(pages) {
      clear(pager);
      if (pages <= 1) {
        pager.appendChild(el("span", "judge-page-info", plural(visible.length, "problem")));
        return;
      }
      const back = button("filter", "← prev", () => {
        if (filters.page > 0) { filters.page--; persistView(); renderTable(); scrollToTable(); }
      });
      back.disabled = filters.page === 0;
      const forward = button("filter", "next →", () => {
        if (filters.page < pages - 1) { filters.page++; persistView(); renderTable(); scrollToTable(); }
      });
      forward.disabled = filters.page === pages - 1;
      pager.appendChild(back);
      pager.appendChild(el("span", "judge-page-info",
        "page " + (filters.page + 1) + " of " + pages + " · " + plural(visible.length, "problem")));
      pager.appendChild(forward);
    }

    function scrollToTable() {
      tableWrap.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function tally() {
      const lang = store.data.lang;
      const out = { solved: 0, attempted: 0, todo: 0, byDifficulty: { 1: 0, 2: 0, 3: 0 } };
      problems.forEach((problem) => {
        const status = store.statusOf(lang, problem.key);
        out[status]++;
        if (status === "solved") out.byDifficulty[problem.difficulty]++;
      });
      return out;
    }

    function renderCounts() {
      const totals = tally();
      const label = (window.ELKIDE.byId[store.data.lang] || {}).label || store.data.lang;
      clear(counts);
      counts.appendChild(el("strong", null, totals.solved));
      counts.appendChild(document.createTextNode(" of " + problems.length + " solved in " + label));
      if (totals.attempted) {
        counts.appendChild(el("span", "judge-counts-sub", " · " + totals.attempted + " attempted"));
      }
    }

    function updateFilterCounts() {
      const lang = store.data.lang;
      const statusCounts = { solved: 0, attempted: 0, todo: 0 };
      const difficultyCounts = {};
      problems.forEach((problem) => {
        statusCounts[store.statusOf(lang, problem.key)]++;
        difficultyCounts[problem.difficulty] = (difficultyCounts[problem.difficulty] || 0) + 1;
      });
      statusRow.querySelectorAll(".filter[data-value]").forEach((node) => {
        const span = node.querySelector(".count");
        if (span) span.textContent = statusCounts[node.dataset.value] || 0;
      });
      difficultyRow.querySelectorAll(".filter[data-value]").forEach((node) => {
        const span = node.querySelector(".count");
        if (span) span.textContent = difficultyCounts[node.dataset.value] || 0;
      });
    }

    /* ---------------- the solve view ---------------- */

    const solve = el("div", "judge-solve");
    solve.hidden = true;
    root.appendChild(solve);

    const solveHead = el("div", "judge-solve-head");
    const backButton = button("filter", "← all problems", closeProblem);
    const solveTitle = el("h2", "display judge-solve-title");
    const solveMeta = el("div", "judge-solve-meta");
    const solveLink = el("a", "mono judge-solve-link");
    solveLink.target = "_blank";
    solveLink.rel = "noopener";
    solveHead.appendChild(backButton);
    const solveTitleWrap = el("div", "judge-solve-titles");
    solveTitleWrap.appendChild(solveTitle);
    solveTitleWrap.appendChild(solveMeta);
    solveHead.appendChild(solveTitleWrap);
    solveHead.appendChild(solveLink);
    solve.appendChild(solveHead);

    const split = el("div", "judge-split");
    const statementPane = el("div", "judge-pane judge-statement");
    const gripper = el("div", "judge-gripper");
    gripper.setAttribute("role", "separator");
    gripper.setAttribute("aria-orientation", "vertical");
    gripper.tabIndex = 0;
    const workPane = el("div", "judge-pane judge-work");
    split.appendChild(statementPane);
    split.appendChild(gripper);
    split.appendChild(workPane);
    solve.appendChild(split);

    installGripper(split, gripper);

    /* the editor column */
    const editorHead = el("div", "judge-editor-head");
    const editorLangLabel = el("span", "mono judge-editor-lang");
    const formatButton = button("filter", "format", onFormat);
    formatButton.title = "Tidy the code the way Prettier would (Shift+Alt+F)";
    const resetButton = button("filter", "reset", onReset);
    resetButton.title = "Throw this away and start from the stub again";
    const runButton = button("filter judge-run", "▶ run", onRun);
    const stopButton = button("filter", "■ stop", onStop);
    stopButton.hidden = true;
    editorHead.appendChild(editorLangLabel);
    editorHead.appendChild(el("span", "judge-spacer"));
    editorHead.appendChild(formatButton);
    editorHead.appendChild(resetButton);
    editorHead.appendChild(runButton);
    editorHead.appendChild(stopButton);
    workPane.appendChild(editorHead);

    const editorHost = el("div", "judge-editor");
    workPane.appendChild(editorHost);

    const problemsPane = el("div", "judge-lint");
    workPane.appendChild(problemsPane);

    const consoleTabs = el("div", "judge-tabs");
    const consoleBody = el("div", "judge-console");
    workPane.appendChild(consoleTabs);
    workPane.appendChild(consoleBody);

    const tabs = [
      { id: "tests", label: "Test cases" },
      { id: "result", label: "Result" },
      { id: "output", label: "Output" },
    ];
    let activeTab = "tests";
    const tabButtons = {};
    tabs.forEach((tab) => {
      const node = button("judge-tab", tab.label, () => setTab(tab.id));
      node.dataset.tab = tab.id;
      tabButtons[tab.id] = node;
      consoleTabs.appendChild(node);
    });
    const statusText = el("span", "mono judge-status");
    consoleTabs.appendChild(el("span", "judge-spacer"));
    consoleTabs.appendChild(statusText);

    const panes = {
      tests: el("div", "judge-pane-body"),
      result: el("div", "judge-pane-body"),
      output: el("pre", "code out judge-pane-body"),
    };
    Object.keys(panes).forEach((id) => consoleBody.appendChild(panes[id]));

    function setTab(id) {
      activeTab = id;
      Object.keys(panes).forEach((key) => { panes[key].hidden = key !== id; });
      Object.keys(tabButtons).forEach((key) => {
        tabButtons[key].setAttribute("aria-pressed", key === id ? "true" : "false");
      });
    }
    setTab("tests");

    const markRow = el("div", "judge-mark");
    const markSolved = button("filter", "mark solved", () => setStatus("solved"));
    const markTodo = button("filter", "mark not done", () => setStatus("todo"));
    const savedNote = el("span", "mono judge-saved");
    markRow.appendChild(markSolved);
    markRow.appendChild(markTodo);
    markRow.appendChild(savedNote);
    workPane.appendChild(markRow);

    /* ---------------- opening a problem ---------------- */

    function openProblem(key, keepScroll) {
      const problem = byKey[key];
      if (!problem) return;
      current = problem;
      detail = null;

      tableWrap.hidden = true;
      filterRows.hidden = true;
      pager.hidden = true;
      solve.hidden = false;

      solveTitle.textContent = problem.num + ". " + problem.title;
      clear(solveMeta);
      (problem.metaBits || []).forEach((bit) => {
        const node = el("span", "judge-chip " + (bit.className || ""), bit.text);
        solveMeta.appendChild(node);
      });
      solveLink.href = problem.external;
      solveLink.textContent = config.externalLabel || "open on the original site ↗";

      clear(statementPane);
      statementPane.appendChild(el("p", "judge-loading", "loading the statement…"));
      clear(panes.result);
      panes.output.textContent = "";
      statusText.textContent = "";
      setTab("tests");

      ensureEditor();
      editorLangLabel.textContent = (window.ELKIDE.byId[store.data.lang] || {}).label || "";

      if (!keepScroll) window.scrollTo({ top: solve.offsetTop - 80, behavior: "smooth" });
      if (location.hash !== "#p=" + key) history.replaceState(null, "", "#p=" + key);

      config.loadDetail(problem).then((loaded) => {
        if (current !== problem) return;
        detail = loaded;
        clear(statementPane);
        config.renderStatement(statementPane, problem, loaded);
        loadCode();
        renderTests();
      }).catch((err) => {
        clear(statementPane);
        statementPane.appendChild(el("p", "judge-loading",
          "the statement could not be loaded (" + err.message + ") - the editor still works."));
        loadCode();
        renderTests();
      });

      updateMarkRow();
    }

    function closeProblem() {
      current = null;
      detail = null;
      solve.hidden = true;
      tableWrap.hidden = false;
      filterRows.hidden = false;
      pager.hidden = false;
      history.replaceState(null, "", location.pathname + location.search);
      renderTable();
      scrollToTable();
    }

    function ensureEditor() {
      if (editor) {
        editor.setLang(store.data.lang);
        setTimeout(() => editor.refresh(), 0);
        return;
      }
      editor = window.ELKIDE.create({
        host: editorHost,
        lang: store.data.lang,
        value: "",
        height: "100%",
        onChange: onCodeChanged,
        onReady: () => {
          editor.onKey("Ctrl-Enter", onRun);
          editor.onKey("Cmd-Enter", onRun);
          editor.onKey("Shift-Alt-F", onFormat);
          editor.onKey("Ctrl-S", (cm) => { saveCode(true); });
          editor.onKey("Cmd-S", (cm) => { saveCode(true); });
          editor.setLang(store.data.lang);
          if (current) loadCode();
        },
      });
    }

    function starterFor() {
      if (!current) return "";
      return config.starter(current, detail, store.data.lang) || "";
    }

    function loadCode() {
      if (!editor || !current) return;
      const saved = store.get(store.data.lang, current.key);
      const text = saved && saved.code ? saved.code : starterFor();
      editor.setValue(text);
      editor.setLang(store.data.lang);
      setTimeout(() => editor.refresh(), 0);
      lintNow(false);
      updateMarkRow();
      const lang = window.ELKIDE.byId[store.data.lang];
      runButton.disabled = !lang || !lang.runs;
      runButton.title = lang && lang.runs
        ? "Run it (Ctrl+Enter)"
        : lang.label + " cannot run in a browser - the editor, the checker and the formatter all still work";
    }

    const saveCode = debounce(function (announce) {
      if (!editor || !current) return;
      const code = editor.getValue();
      const existing = store.get(store.data.lang, current.key);
      const status = existing ? existing.status : "todo";
      const isStarter = code.trim() === starterFor().trim();
      if (isStarter && status === "todo") {
        store.drop(store.data.lang, current.key);
      } else {
        store.put(store.data.lang, current.key, {
          code: code,
          status: status === "todo" && !isStarter ? "attempted" : status,
        });
      }
      savedNote.textContent = "saved " + new Date().toLocaleTimeString();
      if (announce) statusText.textContent = "saved";
      updateMarkRow();
    }, 400);

    function onCodeChanged() {
      saveCode(false);
      lintNow(true);
    }

    /* `allowCompiler` keeps Pyodide asleep until the code has actually been
       touched. Opening a problem should not cost a ten-megabyte download. */
    const lintNow = debounce(function (allowCompiler) {
      if (!editor || !current) return;
      const code = editor.getValue();
      const lang = store.data.lang;
      const structural = window.ELKIDE.structuralCheck(code, lang);
      showProblems(structural, structural.length ? "structural" : "waiting");
      if (structural.length) {
        editor.showErrors(structural);
        return;
      }
      /* Nothing obviously broken, so ask a real parser. JavaScript and
         TypeScript go through Prettier's, which gives a line and a column;
         Python goes to CPython itself, in the worker. Everything else has to
         settle for the structural check, and is told so. */
      const parsed = window.ELKIDE.parseCheck(code, lang);
      if (parsed) {
        editor.showErrors(parsed);
        showProblems(parsed, "compiler");
        return;
      }
      if (lang !== "python" || !allowCompiler) {
        editor.clearErrors();
        showProblems([], lang === "python" ? "idle" : "ok-structural");
        return;
      }
      const id = ++checkSeq;
      ensureWorker().postMessage({ op: "check", id: id, lang: lang, code: code });
    }, 500);

    function showProblems(list, mode) {
      clear(problemsPane);
      if (!list.length) {
        const label = (window.ELKIDE.byId[store.data.lang] || {}).label || "";
        let text = "no problems found";
        if (mode === "ok-structural") {
          text = "brackets and strings balance · " + label +
            " is not compiled in the browser, so this is a structural check only";
        } else if (mode === "idle") {
          text = "brackets and strings balance · CPython itself checks the rest the " +
            "moment you start typing";
        }
        problemsPane.appendChild(el("span", "judge-lint-ok", text));
        return;
      }
      list.slice(0, 6).forEach((problem) => {
        const line = el("button", "judge-lint-item");
        line.type = "button";
        line.appendChild(el("span", "judge-lint-line", "line " + (problem.line + 1)));
        line.appendChild(el("span", "judge-lint-msg", problem.message));
        line.addEventListener("click", () => {
          editor.focus();
          if (editor.refresh) editor.refresh();
        });
        problemsPane.appendChild(line);
      });
      if (list.length > 6) {
        problemsPane.appendChild(el("span", "judge-lint-more", "and " + (list.length - 6) + " more"));
      }
    }

    function onFormat() {
      if (!editor) return;
      try {
        const changed = editor.format();
        statusText.textContent = changed ? "formatted" : "already tidy";
        saveCode(false);
        lintNow(true);
      } catch (err) {
        statusText.textContent = "could not format";
        const message = String(err.message || err);
        const loc = err.loc && err.loc.start ? err.loc.start.line - 1 : 0;
        showProblems([{ line: loc, ch: 0, message: "formatter: " + message.split("\n")[0] }], "structural");
      }
    }

    function onReset() {
      if (!editor || !current) return;
      const starter = starterFor();
      if (editor.getValue().trim() && !window.confirm("Throw away this solution and start from the stub again?")) return;
      editor.setValue(starter);
      store.drop(store.data.lang, current.key);
      savedNote.textContent = "reset";
      updateMarkRow();
      lintNow(false);
    }

    function setStatus(status) {
      if (!current) return;
      if (status === "todo") {
        const existing = store.get(store.data.lang, current.key);
        if (existing) store.put(store.data.lang, current.key, { status: "attempted" });
      } else {
        store.put(store.data.lang, current.key, {
          status: status,
          code: editor ? editor.getValue() : "",
        });
      }
      updateMarkRow();
      renderCounts();
    }

    function updateMarkRow() {
      if (!current) return;
      const status = store.statusOf(store.data.lang, current.key);
      markSolved.setAttribute("aria-pressed", status === "solved" ? "true" : "false");
      markTodo.setAttribute("aria-pressed", status === "todo" ? "true" : "false");
      const record = store.get(store.data.lang, current.key);
      if (record && record.updated) {
        savedNote.textContent = "saved " + new Date(record.updated).toLocaleString();
      } else {
        savedNote.textContent = "not saved yet";
      }
    }

    /* ---------------- test cases ---------------- */

    let customCases = null;

    function renderTests() {
      clear(panes.tests);
      const cases = config.casesFor(current, detail);
      customCases = null;

      if (!cases || !cases.length) {
        panes.tests.appendChild(el("p", "judge-note", config.noCasesNote ||
          "This one runs as a program: press run and read what it prints."));
        return;
      }

      panes.tests.appendChild(el("p", "judge-note",
        "The examples from the statement, one line per argument. Edit them freely - " +
        "they are only used here."));

      const area = el("textarea", "judge-cases");
      area.spellcheck = false;
      area.value = cases.map((one) => one.join("\n")).join("\n---\n");
      area.setAttribute("aria-label", "Test cases");
      area.addEventListener("input", () => {
        customCases = area.value.split(/^---$/m)
          .map((block) => block.split("\n").filter((line) => line.trim() !== ""))
          .filter((block) => block.length);
      });
      panes.tests.appendChild(area);

      const expected = config.expectedFor(current, detail);
      if (expected && expected.length) {
        const note = el("p", "judge-note judge-note-quiet",
          "Expected answers are read out of the worked examples in the statement. " +
          "Some problems accept more than one valid answer, so a mismatch is a prompt to look, not a verdict.");
        panes.tests.appendChild(note);
      }
    }

    /* ---------------- running ---------------- */

    function ensureWorker() {
      if (!worker) {
        worker = new Worker("judge-worker.js");
        worker.onmessage = onWorkerMessage;
        worker.onerror = (event) => {
          statusText.textContent = "worker failed";
          panes.output.textContent += "\n[worker] " + (event.message || "unknown error") + "\n";
        };
      }
      return worker;
    }

    function killWorker() {
      if (worker) {
        worker.terminate();
        worker = null;
      }
    }

    function onWorkerMessage(event) {
      const msg = event.data || {};
      if (msg.op === "check") {
        if (msg.id !== checkSeq) return;
        const problems = (msg.errors || []).map((problem) => ({
          line: Math.max(0, (problem.line || 1) - 1),
          ch: problem.ch || 0,
          message: problem.message,
        }));
        editor.showErrors(problems);
        showProblems(problems, "compiler");
        return;
      }
      if (msg.op === "status") {
        statusText.textContent = msg.text;
        return;
      }
      if (msg.op === "out") {
        panes.output.textContent += msg.text;
        return;
      }
      if (msg.op === "done") {
        running = false;
        stopButton.hidden = true;
        runButton.disabled = false;
        statusText.textContent = "finished in " + msg.ms + " ms";
        finishRun(msg);
        return;
      }
      if (msg.op === "err") {
        running = false;
        stopButton.hidden = true;
        runButton.disabled = false;
        statusText.textContent = "error";
        setTab("result");
        clear(panes.result);
        const box = el("div", "judge-verdict judge-verdict-bad");
        box.appendChild(el("strong", null, "It threw."));
        box.appendChild(el("pre", "code out", msg.text));
        panes.result.appendChild(box);
        if (current) store.put(store.data.lang, current.key, { status: statusAfterRun("attempted") });
        updateMarkRow();
      }
    }

    function statusAfterRun(fallback) {
      const existing = current ? store.get(store.data.lang, current.key) : null;
      if (existing && existing.status === "solved") return "solved";
      return fallback;
    }

    function onRun() {
      if (!current || !editor || running) return;
      const lang = window.ELKIDE.byId[store.data.lang];
      if (!lang || !lang.runs) return;

      const structural = window.ELKIDE.structuralCheck(editor.getValue(), store.data.lang);
      if (structural.length) {
        editor.showErrors(structural);
        showProblems(structural, "structural");
        setTab("result");
        clear(panes.result);
        const box = el("div", "judge-verdict judge-verdict-bad");
        box.appendChild(el("strong", null, "It will not parse, so it was not run."));
        box.appendChild(el("span", null, structural[0].message + " (line " + (structural[0].line + 1) + ")"));
        panes.result.appendChild(box);
        return;
      }

      saveCode(false);
      running = true;
      stopButton.hidden = false;
      runButton.disabled = true;
      panes.output.textContent = "";
      clear(panes.result);
      statusText.textContent = "starting";
      setTab("output");

      const message = config.runRequest(current, detail, store.data.lang, editor.getValue(),
        customCases || config.casesFor(current, detail));
      ensureWorker().postMessage(message);
    }

    function onStop() {
      killWorker();
      running = false;
      stopButton.hidden = true;
      runButton.disabled = false;
      statusText.textContent = "stopped";
      panes.output.textContent += "\n[stopped]\n";
    }

    function finishRun(msg) {
      const cases = customCases || config.casesFor(current, detail);
      const expected = customCases ? [] : (config.expectedFor(current, detail) || []);
      clear(panes.result);

      if (!msg.results) {
        setTab("output");
        const box = el("div", "judge-verdict");
        box.appendChild(el("strong", null, "It ran."));
        box.appendChild(el("span", null, "Read the output tab - this track has no automatic answer to check against."));
        panes.result.appendChild(box);
        if (current) {
          store.put(store.data.lang, current.key, { status: statusAfterRun("attempted"), ms: msg.ms });
        }
        updateMarkRow();
        return;
      }

      setTab("result");
      let passed = 0;
      let judged = 0;

      const list = el("div", "judge-cases-out");
      msg.results.forEach((result, index) => {
        const row = el("div", "judge-case");
        const got = JSON.stringify(result);
        let verdict = null;
        if (expected[index] !== undefined) {
          judged++;
          verdict = sameAnswer(got, expected[index]);
          if (verdict) passed++;
        }
        row.classList.add(verdict === null ? "judge-case-plain" : verdict ? "judge-case-pass" : "judge-case-fail");
        row.appendChild(el("span", "judge-case-n", "case " + (index + 1)));
        const body = el("div", "judge-case-body");
        body.appendChild(field("input", (cases[index] || []).join(", ")));
        body.appendChild(field("output", got));
        if (expected[index] !== undefined) body.appendChild(field("expected", expected[index]));
        row.appendChild(body);
        if (verdict !== null) {
          row.appendChild(el("span", "judge-case-verdict", verdict ? "pass" : "differs"));
        }
        list.appendChild(row);
      });

      const summary = el("div", "judge-verdict " +
        (judged && passed === judged ? "judge-verdict-good" : judged ? "judge-verdict-warn" : ""));
      if (judged && passed === judged) {
        summary.appendChild(el("strong", null, "All " + judged + " example cases match."));
        summary.appendChild(el("span", null, "Marked solved. " + msg.ms + " ms."));
        if (current) store.put(store.data.lang, current.key, { status: "solved", ms: msg.ms, code: editor.getValue() });
      } else if (judged) {
        summary.appendChild(el("strong", null, passed + " of " + judged + " example cases match."));
        summary.appendChild(el("span", null, "Marked attempted."));
        if (current) store.put(store.data.lang, current.key, { status: statusAfterRun("attempted"), ms: msg.ms });
      } else {
        summary.appendChild(el("strong", null, "It ran without throwing."));
        summary.appendChild(el("span", null, "No expected answers were available, so nothing was checked for you."));
        if (current) store.put(store.data.lang, current.key, { status: statusAfterRun("attempted"), ms: msg.ms });
      }
      panes.result.appendChild(summary);
      panes.result.appendChild(list);
      updateMarkRow();
      renderCounts();
    }

    function field(label, value) {
      const wrap = el("div", "judge-case-field");
      wrap.appendChild(el("span", "judge-case-label", label));
      wrap.appendChild(el("code", null, value));
      return wrap;
    }

    /* LeetCode prints `[0,1]`, the statement says `[0, 1]`, and both are the
       same answer. Compare the parsed values where that is possible. */
    function sameAnswer(got, want) {
      const tidy = (text) => String(text).trim().replace(/^["']|["']$/g, "");
      if (tidy(got) === tidy(want)) return true;
      try {
        const a = JSON.parse(got);
        const b = JSON.parse(want.replace(/'/g, '"'));
        return JSON.stringify(a) === JSON.stringify(b);
      } catch (err) {
        return tidy(got).replace(/\s+/g, "") === tidy(want).replace(/\s+/g, "");
      }
    }

    /* ---------------- the split gripper ---------------- */

    function installGripper(container, handle) {
      let dragging = false;
      const apply = (fraction) => {
        const clamped = Math.min(0.72, Math.max(0.24, fraction));
        container.style.gridTemplateColumns = (clamped * 100).toFixed(2) + "% 8px 1fr";
        if (editor) editor.refresh();
      };
      const saved = parseFloat(store.data.splitAt);
      if (saved) apply(saved);

      handle.addEventListener("mousedown", (event) => {
        dragging = true;
        event.preventDefault();
        document.body.classList.add("judge-dragging");
      });
      window.addEventListener("mousemove", (event) => {
        if (!dragging) return;
        const box = container.getBoundingClientRect();
        apply((event.clientX - box.left) / box.width);
      });
      window.addEventListener("mouseup", () => {
        if (!dragging) return;
        dragging = false;
        document.body.classList.remove("judge-dragging");
        const columns = container.style.gridTemplateColumns;
        const match = /^([\d.]+)%/.exec(columns);
        if (match) { store.data.splitAt = parseFloat(match[1]) / 100; store.save(); }
      });
      handle.addEventListener("keydown", (event) => {
        const box = container.getBoundingClientRect();
        const currentFraction = statementPane.getBoundingClientRect().width / box.width;
        if (event.key === "ArrowLeft") { apply(currentFraction - 0.04); event.preventDefault(); }
        if (event.key === "ArrowRight") { apply(currentFraction + 0.04); event.preventDefault(); }
      });
    }

    /* ---------------- export, import, gist ---------------- */

    const tools = el("div", "judge-tools");
    root.appendChild(tools);

    tools.appendChild(button("filter", "export progress", () => {
      const blob = new Blob([JSON.stringify(store.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = el("a");
      link.href = url;
      link.download = config.track + "-progress.json";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }));

    const importInput = el("input");
    importInput.type = "file";
    importInput.accept = "application/json";
    importInput.hidden = true;
    importInput.addEventListener("change", () => {
      const file = importInput.files && importInput.files[0];
      if (!file) return;
      file.text().then((text) => {
        const incoming = JSON.parse(text);
        mergeSolutions(incoming.solutions || {});
        store.save();
        renderTable();
        syncNote.textContent = "imported " + Object.keys(incoming.solutions || {}).length + " saved solutions";
      }).catch((err) => { syncNote.textContent = "that file could not be read: " + err.message; });
      importInput.value = "";
    });
    tools.appendChild(importInput);
    tools.appendChild(button("filter", "import progress", () => importInput.click()));

    const gistToggle = button("filter", "gist sync", () => {
      gistPanel.hidden = !gistPanel.hidden;
      gistToggle.setAttribute("aria-pressed", gistPanel.hidden ? "false" : "true");
    });
    tools.appendChild(gistToggle);

    const syncNote = el("span", "mono judge-sync-note");
    tools.appendChild(syncNote);

    const gistPanel = el("div", "judge-gist");
    gistPanel.hidden = true;
    root.appendChild(gistPanel);

    gistPanel.appendChild(el("p", "judge-note",
      "GitHub Pages has no server, so progress lives in this browser. To carry it " +
      "between machines, make a GitHub token with only the 'gist' scope and paste it " +
      "here. It is kept in this browser's localStorage and sent to api.github.com and " +
      "nowhere else - which is fine for a gist-only token and not fine for anything wider."));

    const tokenInput = el("input", "judge-input");
    tokenInput.type = "password";
    tokenInput.placeholder = "github token, gist scope only";
    tokenInput.value = store.data.gist.token || "";
    tokenInput.autocomplete = "off";
    const tokenWrap = el("label", "judge-field");
    tokenWrap.appendChild(el("span", "judge-field-label", "Token"));
    tokenWrap.appendChild(tokenInput);

    const gistInput = el("input", "judge-input");
    gistInput.placeholder = "gist id (left blank, one is made for you)";
    gistInput.value = store.data.gist.id || "";
    const gistWrap = el("label", "judge-field");
    gistWrap.appendChild(el("span", "judge-field-label", "Gist"));
    gistWrap.appendChild(gistInput);

    const gistRow = el("div", "judge-gist-row");
    gistRow.appendChild(tokenWrap);
    gistRow.appendChild(gistWrap);
    gistPanel.appendChild(gistRow);

    const gistButtons = el("div", "judge-gist-row");
    gistButtons.appendChild(button("filter", "sync now", () => {
      store.data.gist.token = tokenInput.value.trim();
      store.data.gist.id = gistInput.value.trim();
      store.save();
      sync();
    }));
    gistButtons.appendChild(button("filter", "forget token", () => {
      store.data.gist = { token: "", id: "" };
      tokenInput.value = "";
      gistInput.value = "";
      store.save();
      syncNote.textContent = "token forgotten";
    }));
    gistPanel.appendChild(gistButtons);

    const FILE_NAME = "elk-" + config.track + "-progress.json";

    function mergeSolutions(incoming) {
      let added = 0;
      Object.keys(incoming).forEach((slot) => {
        const theirs = incoming[slot];
        const mine = store.data.solutions[slot];
        if (!mine || (theirs.updated || 0) > (mine.updated || 0)) {
          store.data.solutions[slot] = theirs;
          added++;
        }
      });
      return added;
    }

    function gistFetch(path, options) {
      const token = store.data.gist.token;
      return fetch("https://api.github.com" + path, Object.assign({
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
      }, options || {})).then((response) => {
        if (!response.ok) {
          return response.text().then((text) => {
            throw new Error(response.status + " " + (text.slice(0, 140) || response.statusText));
          });
        }
        return response.json();
      });
    }

    function sync() {
      if (!store.data.gist.token) {
        syncNote.textContent = "a token is needed first";
        return;
      }
      syncNote.textContent = "syncing…";
      const id = store.data.gist.id;
      const pull = id ? gistFetch("/gists/" + id) : Promise.resolve(null);

      pull.then((remote) => {
        let pulled = 0;
        if (remote && remote.files && remote.files[FILE_NAME]) {
          const file = remote.files[FILE_NAME];
          const body = file.truncated ? fetch(file.raw_url).then((r) => r.text()) : Promise.resolve(file.content);
          return Promise.resolve(body).then((text) => {
            try {
              pulled = mergeSolutions((JSON.parse(text) || {}).solutions || {});
            } catch (err) {
              throw new Error("the gist did not contain readable progress");
            }
            return pulled;
          });
        }
        return pulled;
      }).then((pulled) => {
        const payload = {};
        payload[FILE_NAME] = {
          content: JSON.stringify({
            track: config.track,
            updated: Date.now(),
            solutions: store.data.solutions,
          }, null, 1),
        };
        const body = JSON.stringify({
          description: "Leonid Elkin - " + config.track + " progress",
          public: false,
          files: payload,
        });
        const request = store.data.gist.id
          ? gistFetch("/gists/" + store.data.gist.id, { method: "PATCH", body: body })
          : gistFetch("/gists", { method: "POST", body: body });
        return request.then((remote) => {
          store.data.gist.id = remote.id;
          gistInput.value = remote.id;
          store.save();
          syncNote.textContent = "synced · pulled " + pulled + " · " +
            Object.keys(store.data.solutions).length + " kept";
          renderTable();
        });
      }).catch((err) => {
        syncNote.textContent = "sync failed: " + err.message;
      });
    }

    /* ---------------- go ---------------- */

    renderTable();
    renderCounts();

    /* #p=<key> is the address of a problem, so the back button, a pasted link
       and a bookmark all land in the same place. closeProblem uses
       replaceState, which does not fire this, so there is no loop. */
    function followHash() {
      const match = /^#p=(.+)$/.exec(location.hash);
      const key = match ? decodeURIComponent(match[1]) : null;
      if (key && byKey[key]) {
        if (!current || current.key !== key) openProblem(key);
      } else if (current) {
        closeProblem();
      }
    }

    window.addEventListener("hashchange", followHash);
    followHash();

    window.addEventListener("beforeunload", () => {
      if (editor && current) {
        const code = editor.getValue();
        if (code.trim() && code.trim() !== starterFor().trim()) {
          const existing = store.get(store.data.lang, current.key);
          store.put(store.data.lang, current.key, {
            code: code,
            status: existing && existing.status === "solved" ? "solved" : "attempted",
          });
        }
      }
    });

    return { store: store, openProblem: openProblem, renderTable: renderTable };
  }

  window.ELKJUDGE = { mount: mount, DIFF_NAMES: DIFF_NAMES };
})();
