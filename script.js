/* Content and rendering for the home page (skills, research) and the projects
 * page (index + category filter).
 *
 * Every project carries a category (software | hardware | research), a caption
 * written for a reader rather than a search engine, tech tags, links, and a
 * status. A link with `pending: true` renders greyed with a "soon" tag instead
 * of 404ing.
 *
 * Anything still wrapped in [ square brackets ] is a slot nobody has filled -
 * it renders in the loud placeholder treatment at the foot of style.css so it
 * cannot be mistaken for finished copy.
 */

/* ---------- projects ---------- */

const projects = [
  /* ---------- software ---------- */
  {
    title: "Drone Strike Map",
    cat: "software",
    status: "live",
    featured: true,
    caption:
      "Every reported drone and missile strike in the Russia-Ukraine war, day by day, with the outlet behind each figure. Reads a few dozen sources every morning and runs on its own server.",
    tags: ["Python", "SQLite", "systemd", "Leaflet"],
    links: [
      { name: "case study", url: "project.html" },
      { name: "open the map", url: "https://dronestrikemap.com/" },
      { name: "public API", url: "https://dronestrikemap.com/api/strikes" },
      { name: "source", url: "", pending: true },
    ],
  },
  {
    title: "SHELLFALL",
    cat: "software",
    status: "live",
    caption:
      "Hold a coastal fortress against a campaign of named capital ships. You lay the guns yourself and mark what to hit; the enemy keeps sailing. Released as Penumbra.",
    tags: ["Python", "pygame"],
    links: [
      { name: "play on itch.io", url: "https://elkyy.itch.io/penumbra" },
      { name: "source", url: "https://github.com/Leonid-Elkin/Penumbra" },
      { name: "windows build", url: "", pending: true },
    ],
  },
  {
    title: "Sheet2Tab",
    cat: "software",
    status: "wip",
    caption:
      "Give it a PDF of a score and it hands back classical-guitar tablature under the notation, with an editor for the bars it misreads. Also transcribes from a recording or a video of a page.",
    tags: ["Python", "PyMuPDF", "MusicXML"],
    links: [
      { name: "example output", url: "Documentation/sheet2tab_example.pdf" },
      { name: "the app", url: "", pending: true },
      { name: "source", url: "", pending: true },
    ],
  },
  {
    title: "Chess Vision Bot",
    cat: "software",
    status: "wip",
    caption:
      "Watches a chessboard on your screen, rebuilds the position, and says what to play. The engine now has a C++ port for speed.",
    tags: ["Python", "PyQt5", "python-chess", "C++"],
    links: [
      { name: "the bot", url: "", pending: true },
      { name: "source", url: "", pending: true },
    ],
  },
  {
    title: "Yavalath & Pentalath",
    cat: "software",
    caption:
      "A-Level coursework: both hex board games in full, with sound and a computer opponent. Yavalath was itself designed by a program.",
    tags: ["Python"],
    links: [
      { name: "documentation", url: "Documentation/Yavalath_NEA_documentation.pdf" },
      { name: "the rules", url: "https://boardgamegeek.com/boardgame/33767/yavalath" },
    ],
  },
  {
    title: "Project Euler",
    cat: "software",
    caption: "Solutions to the first hundred-odd problems.",
    tags: ["Python"],
    links: [
      { name: "solutions", url: "Euler_source.zip" },
      { name: "the archive", url: "https://projecteuler.net/archives" },
    ],
  },
  {
    title: "Shooting scores",
    cat: "software",
    caption: "Plots a season of club scores so you can see whether practice is working.",
    tags: ["Python"],
    links: [{ name: "source", url: "Shooting score visualiser.zip" }],
  },
  {
    title: "Aimtrainer",
    cat: "software",
    status: "old",
    caption: "The first thing made in PyGame. Click the circles before they go.",
    tags: ["Python", "pygame"],
    links: [{ name: "source", url: "Aimtrainer_source/Aimtrainer.zip" }],
  },
  {
    title: "This website",
    cat: "software",
    caption:
      "Swiss editorial on black, static HTML, no build step and no images anywhere - every mark is type, rule or inline SVG. The commits feed pulls from GitHub in your browser.",
    tags: ["HTML", "CSS", "JavaScript"],
    links: [
      { name: "source", url: "https://github.com/Leonid-Elkin/Leonid-Elkin.github.io" },
      { name: "my brother's site", url: "https://alexeyelkin.com/" },
    ],
  },

  /* ---------- hardware ---------- */
  {
    title: "Yagi-Uda radar",
    cat: "hardware",
    status: "wip",
    caption:
      "A 14.5 dBi Yagi-Uda feeding RF transceivers off a Raspberry Pi 3 to range a target. Not finished.",
    tags: ["Raspberry Pi", "RF", "antenna"],
    links: [
      { name: "source", url: "", pending: true },
      { name: "write-up", url: "", pending: true },
    ],
  },
  {
    title: "CanSat 2025",
    cat: "hardware",
    caption:
      "A can-sized satellite for the CanSat competition, built with six others. The antenna work above started here.",
    tags: ["RF", "telemetry", "payload"],
    links: [
      {
        name: "critical design report",
        url: "Documentation/Tonbridge CanSat_ReLAACS_ 2024-25 CDR .pdf",
      },
    ],
  },

  /* ---------- research ---------- */
  {
    title: "Neural scaling laws",
    cat: "research",
    caption:
      "Multilayer perceptrons written from scratch in NumPy, run at different sizes to see how loss falls with parameters. The library is on PyPI as elkwork; the paper is 56 pages.",
    tags: ["Python", "NumPy", "LaTeX"],
    links: [
      { name: "the paper", url: "Documentation/Investigating_neural_scaling_laws (9).pdf" },
      { name: "elkwork on PyPI", url: "https://pypi.org/project/elkwork/" },
      { name: "code and models", url: "MLP all documents (2).zip" },
    ],
  },
  {
    title: "Globular clusters",
    cat: "research",
    caption:
      "Does a population of primordial binaries change how fast a globular cluster evaporates? An N-body simulation, a paper and a poster.",
    tags: ["Python", "NumPy"],
    links: [
      { name: "the paper", url: "Documentation/Physics_investigation (2).pdf" },
      { name: "the poster", url: "Documentation/Physics_investigation_poster.pdf" },
      { name: "source", url: "N-body_simulation/Main.py" },
    ],
  },
  {
    title: "Drawer",
    cat: "research",
    caption:
      "A companion to the MLP work: draw a digit and watch the trained network read it back, one layer at a time.",
    tags: ["Python", "NumPy"],
    links: [{ name: "source", url: "Drawer_source.zip" }],
  },
];

/* ---------- what fills the experience slot ----------
 *
 * No employment history yet, so this section carries the things that actually
 * evidence the work: a team competition, and two pieces of independent
 * research. Dates come from the documents themselves. When a job does turn up,
 * add it at the top with `current: true` and rename the section heading in
 * index.html from "Research & competitions" back to "Experience".
 */
const roles = [
  {
    title: "CanSat 2025 — payload & radio",
    org: "Tonbridge School",
    place: "Team of seven",
    from: "2024",
    to: "2025",
    current: true,
    bullets: [
      "Built a can-sized satellite for the CanSat competition with six others, through to a full critical design report.",
      "Worked the telemetry and RF side; the 14.5 dBi Yagi-Uda antenna project grew directly out of this.",
      "[ Add the result — where it placed, what flew, what failed on the day. ]",
    ],
  },
  {
    title: "Investigating neural scaling laws",
    org: "Independent research",
    place: "56-page paper",
    from: "2024",
    to: "Apr 2025",
    bullets: [
      "Wrote multilayer perceptrons from scratch in NumPy — no framework — and published the library on PyPI as elkwork.",
      "Trained at a range of model sizes to measure how test loss falls with parameter count; reached 98.52% on MNIST and 93.35% on FashionMNIST.",
    ],
  },
  {
    title: "Globular cluster evaporation",
    org: "Physics investigation",
    place: "Paper and poster",
    from: "2024",
    to: "2024",
    bullets: [
      "Built an N-body simulation to test whether primordial binaries change how fast a globular cluster evaporates.",
      "Wrote it up as a paper and presented it as a poster.",
    ],
  },
];

const education = [
  {
    award: "A-Levels",
    org: "Tonbridge School",
    years: "[ 20XX–20XX ]",
    note: "[ Subjects and grades ]",
  },
  {
    award: "[ Current course ]",
    org: "[ Institution ]",
    years: "[ 20XX– ]",
    note: "[ Or delete this box if it does not apply yet ]",
  },
];

/* ---------- skills ---------- */

/* Every line names the work that evidences it - no invented levels or
   percentages. */
const skills = [
  {
    head: "Languages",
    items: [
      { name: "Python", via: "most of the above" },
      { name: "C++", via: "chess engine port" },
      { name: "C", via: "a CMake game engine" },
      { name: "C#", via: "Unity" },
      { name: "JavaScript", via: "this site" },
    ],
  },
  {
    head: "Frameworks & tools",
    items: [
      { name: "pygame", via: "SHELLFALL, Aimtrainer" },
      { name: "PyQt5", via: "Chess Vision Bot" },
      { name: "Unity 6", via: "an air-combat prototype" },
      { name: "SQLite + systemd", via: "Drone Strike Map" },
      { name: "PyMuPDF, MusicXML", via: "Sheet2Tab" },
      { name: "LaTeX", via: "the scaling-laws paper" },
    ],
  },
  {
    head: "Hardware & radio",
    items: [
      { name: "Raspberry Pi", via: "Yagi-Uda radar" },
      { name: "RF transceivers", via: "Yagi-Uda radar" },
      { name: "Antenna construction", via: "14.5 dBi Yagi-Uda" },
      { name: "Payload design", via: "CanSat 2025" },
    ],
  },
  {
    head: "Machine learning",
    items: [
      { name: "MLPs from scratch", via: "elkwork, on PyPI" },
      { name: "Training and evaluation", via: "MNIST 98.5%, FashionMNIST 93.4%" },
      { name: "Computer vision", via: "Chess Vision Bot" },
      { name: "Optical music recognition", via: "Sheet2Tab" },
    ],
  },
];

/* ---------- helpers ---------- */

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

const isExternal = (url) => /^https?:\/\//i.test(url);

/* A string wrapped in [ brackets ] is an unfilled slot. */
const isSlot = (s) => typeof s === "string" && /^\s*\[.*\]\s*$/.test(s);

function linkEl(link) {
  const a = el("a", null, link.name);
  if (link.pending || !link.url) {
    a.href = "";
    a.classList.add("disabled");
    a.setAttribute("aria-disabled", "true");
    a.tabIndex = -1;
    const wrap = el("span");
    wrap.appendChild(a);
    wrap.appendChild(el("span", "soon", "soon"));
    return wrap;
  }
  a.href = link.url;
  if (isExternal(link.url)) {
    a.target = "_blank";
    a.rel = "noopener";
  } else if (!/\.html$/.test(link.url)) {
    a.setAttribute("download", "");
  }
  return a;
}

const STATUS_LABEL = { live: "live", wip: "in progress", old: "early", placeholder: "placeholder" };

/* The running number in the left column - what stands where a thumbnail would
   on a site that used images. This one does not. */
function plate(n, p) {
  const box = el("div", "plate" + (p.placeholder ? " is-placeholder" : ""));
  box.setAttribute("aria-hidden", "true");
  box.append(String(n).padStart(2, "0"), el("span", "plate-cat", p.cat || ""));
  return box;
}

function projectCard(p, i) {
  const card = el("article", "project-card");
  card.dataset.cat = p.cat;
  if (p.featured) card.classList.add("featured");

  card.appendChild(plate(i + 1, p));

  const body = el("div", "project-body");
  const top = el("div", "top");
  top.appendChild(el("h3", null, p.title));
  const st = p.placeholder ? "placeholder" : p.status;
  if (st) top.appendChild(el("span", "status " + st, STATUS_LABEL[st]));
  body.appendChild(top);

  body.appendChild(
    el("p", "caption" + (isSlot(p.caption) ? " placeholder" : ""), p.caption)
  );

  if (p.tags && p.tags.length) {
    const ul = el("ul", "tags");
    p.tags.forEach((t) => ul.appendChild(el("li", null, t)));
    body.appendChild(ul);
  }

  card.appendChild(body);

  /* Links are a sibling of the body, not a child: the entry is a three-column
     grid (number | text | links) and the links column is flush right. */
  const links = el("div", "links");
  p.links.forEach((l) => links.appendChild(linkEl(l)));
  card.appendChild(links);

  return card;
}

/* ---------- projects page ---------- */

function initProjects() {
  const grid = document.getElementById("project-grid");
  if (!grid) return;

  const frag = document.createDocumentFragment();
  projects.forEach((p, i) => frag.appendChild(projectCard(p, i)));
  grid.appendChild(frag);

  const cards = Array.from(grid.children);
  const buttons = Array.from(document.querySelectorAll(".filter"));
  const countEl = document.getElementById("project-count");

  const counts = { all: cards.length };
  cards.forEach((c) => (counts[c.dataset.cat] = (counts[c.dataset.cat] || 0) + 1));
  buttons.forEach((b) => {
    const c = b.querySelector(".count");
    if (c) c.textContent = counts[b.dataset.filter] || 0;
  });

  function apply(filter, { push = true } = {}) {
    if (!buttons.some((b) => b.dataset.filter === filter)) filter = "all";
    let shown = 0;
    cards.forEach((c) => {
      const on = filter === "all" || c.dataset.cat === filter;
      c.hidden = !on;
      if (on) shown++;
    });
    buttons.forEach((b) => b.setAttribute("aria-pressed", b.dataset.filter === filter ? "true" : "false"));
    if (countEl) countEl.textContent = shown === 1 ? "1 project" : shown + " projects";
    if (push) history.replaceState(null, "", filter === "all" ? location.pathname : "#" + filter);
  }

  buttons.forEach((b) => b.addEventListener("click", () => apply(b.dataset.filter)));
  apply((location.hash || "").replace("#", ""), { push: false });
}

/* ---------- home: selected work ---------- */

function initSelected() {
  const root = document.getElementById("selected-work");
  if (!root) return;

  projects.slice(0, 3).forEach((p, i) => {
    const row = el("article", "select-row");
    row.appendChild(plate(i + 1, p));

    const body = el("div", "project-body");
    const top = el("div", "top");
    top.appendChild(el("h3", null, p.title));
    const st = p.placeholder ? "placeholder" : p.status;
    if (st) top.appendChild(el("span", "status " + st, STATUS_LABEL[st]));
    body.appendChild(top);
    body.appendChild(
      el("p", "caption" + (isSlot(p.caption) ? " placeholder" : ""), p.caption)
    );
    row.appendChild(body);

    const links = el("div", "links");
    links.appendChild(linkEl(p.links[0]));
    row.appendChild(links);

    root.appendChild(row);
  });
}

/* ---------- home: research & competitions ---------- */

function initRoles() {
  const root = document.getElementById("role-list");
  if (!root) return;

  roles.forEach((r) => {
    const item = el("article", "role" + (r.current ? " current" : ""));

    const head = el("div", "role-head");
    const who = el("div");
    who.appendChild(el("h3", null, r.title));
    const org = el("p", "role-org");
    org.append(r.org, " · ", r.place);
    who.appendChild(org);
    head.appendChild(who);
    head.appendChild(el("span", "role-when mono", r.from + " — " + r.to));
    item.appendChild(head);

    const ul = el("ul", "bullets");
    r.bullets.forEach((b) => ul.appendChild(el("li", isSlot(b) ? "placeholder" : null, b)));
    item.appendChild(ul);

    root.appendChild(item);
  });
}

function initEducation() {
  const root = document.getElementById("edu-list");
  if (!root) return;

  education.forEach((e) => {
    const box = el("div", "edu");
    box.appendChild(el("h3", isSlot(e.award) ? "placeholder" : null, e.award));
    const line = el("p", "mono edu-org");
    line.append(e.org, " · ", e.years);
    box.appendChild(line);
    box.appendChild(el("p", "mono edu-note" + (isSlot(e.note) ? " placeholder" : ""), e.note));
    root.appendChild(box);
  });
}

/* ---------- home: skills ---------- */

function initSkills() {
  const root = document.getElementById("skill-cols");
  if (!root) return;
  skills.forEach((col) => {
    const box = el("div", "skill-col");
    box.appendChild(el("h3", null, col.head));
    const ul = el("ul");
    col.items.forEach((it) => {
      const li = el("li");
      li.appendChild(el("span", it.placeholder ? "placeholder" : null, it.name));
      li.appendChild(el("span", "via" + (it.placeholder ? " placeholder" : ""), it.via));
      ul.appendChild(li);
    });
    box.appendChild(ul);
    root.appendChild(box);
  });
}

/* ---------- counts quoted in the chrome ---------- */

function initCounts() {
  const n = projects.length;
  document.querySelectorAll("[data-project-count]").forEach((node) => {
    node.textContent =
      node.dataset.projectCount === "pad" ? String(n).padStart(2, "0") : String(n);
  });
}

window.addEventListener("DOMContentLoaded", () => {
  initProjects();
  initSelected();
  initRoles();
  initEducation();
  initSkills();
  initCounts();
});
