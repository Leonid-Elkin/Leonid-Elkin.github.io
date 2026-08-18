/* Content and rendering for the home page (skills) and the projects page
 * (grid + category filter).
 *
 * Every project carries a category (software | hardware), a caption written
 * for a reader rather than a search engine, tech tags, links, and a status.
 * A link with `pending: true` renders greyed with a "soon" tag instead of
 * 404ing. A project with `placeholder: true` is a slot still to be filled -
 * it says so on its face and never pretends to be a real entry.
 */

const projects = [
  /* ---------- software ---------- */
  {
    title: "Machine learning",
    cat: "software",
    caption:
      "The elkwork library, the neural scaling laws paper, and the models it produced. It has its own page.",
    image: "Images/neurons.png",
    tags: ["Python", "NumPy", "LaTeX"],
    links: [{ name: "the ML page", url: "MlProjects.html" }],
    featured: true,
  },
  {
    title: "SHELLFALL",
    cat: "software",
    status: "live",
    caption:
      "Hold a coastal fortress against a campaign of named capital ships. You lay the guns yourself and mark what to hit; the enemy keeps sailing. Released as Penumbra.",
    image: "Images/shellfall.png",
    tags: ["Python", "pygame"],
    links: [
      { name: "play on itch.io", url: "https://elkyy.itch.io/penumbra" },
      { name: "source", url: "https://github.com/Leonid-Elkin/Penumbra" },
      { name: "windows build", url: "", pending: true },
    ],
  },
  {
    title: "Drone Strike Map",
    cat: "software",
    status: "live",
    caption:
      "Every reported drone and missile strike in the Russia-Ukraine war, day by day, with the outlet behind each figure. Reads a few dozen sources every morning and runs on its own server.",
    image: "Images/dronestrikemap.png",
    tags: ["Python", "SQLite", "systemd", "Leaflet"],
    links: [
      { name: "open the map", url: "https://dronestrikemap.com/" },
      { name: "public API", url: "https://dronestrikemap.com/api/strikes" },
      { name: "source", url: "", pending: true },
    ],
  },
  {
    title: "Sheet2Tab",
    cat: "software",
    status: "wip",
    caption:
      "Give it a PDF of a score and it hands back classical-guitar tablature under the notation, with an editor for the bars it misreads. Also transcribes from a recording or a video of a page.",
    image: "Images/sheet2tab.png",
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
    image: "Images/chess.png",
    contain: true,
    tags: ["Python", "PyQt5", "python-chess", "C++"],
    links: [
      { name: "the bot", url: "", pending: true },
      { name: "source", url: "", pending: true },
    ],
  },
  {
    title: "Globular clusters",
    cat: "software",
    caption:
      "Does a population of primordial binaries change how fast a globular cluster evaporates? An N-body simulation, a paper and a poster.",
    image: "Images/N-Body Simulation.png",
    tags: ["Python", "NumPy"],
    links: [
      { name: "the paper", url: "Documentation/Physics_investigation (2).pdf" },
      { name: "the poster", url: "Documentation/Physics_investigation_poster.pdf" },
      { name: "source", url: "N-body_simulation/Main.py" },
    ],
  },
  {
    title: "Yavalath & Pentalath",
    cat: "software",
    caption:
      "A-Level coursework: both hex board games in full, with sound and a computer opponent. Yavalath was itself designed by a program.",
    image: "Images/Yavalath.png",
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
    image: "Images/Euler.png",
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
    image: "Images/kk300.png",
    tags: ["Python"],
    links: [{ name: "source", url: "Shooting score visualiser.zip" }],
  },
  {
    title: "Aimtrainer",
    cat: "software",
    status: "old",
    caption: "The first thing made in PyGame. Click the circles before they go.",
    image: "Images/Aimtrainer.png",
    tags: ["Python", "pygame"],
    links: [{ name: "source", url: "Aimtrainer_source/Aimtrainer.zip" }],
  },
  {
    title: "This website",
    cat: "software",
    caption: "Two-ink riso, static HTML, no build step. The commits feed pulls from GitHub in your browser.",
    image: "Images/2fort.png",
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
    image: "Images/Yagi.png",
    tags: ["Raspberry Pi", "RF", "antenna"],
    links: [
      { name: "source", url: "", pending: true },
      { name: "write-up", url: "", pending: true },
    ],
  },
  {
    title: "CANSAT 2025",
    cat: "hardware",
    caption:
      "A can-sized satellite for the CanSat competition, built with six others. The antenna work above started here.",
    image: "Images/CANSAT 2025.jpg",
    tags: ["RF", "telemetry"],
    links: [
      { name: "critical design report", url: "Documentation/Tonbridge CanSat_ReLAACS_ 2024-25 CDR .pdf" },
      { name: "launch video", url: "Images/Relaacs.mp4", pending: true },
    ],
  },
  /* Placeholders. Fill in the object, drop `placeholder`, add a photo. */
  {
    title: "Desk organiser",
    cat: "hardware",
    placeholder: true,
    caption: "[ what it is made of, what it holds, what you would do differently ]",
    tags: ["[ material ]", "[ tool ]"],
    links: [{ name: "photos", url: "", pending: true }],
  },
  {
    title: "[ hardware build ]",
    cat: "hardware",
    placeholder: true,
    caption: "[ a sentence on what it is and why it exists ]",
    tags: ["[ material ]"],
    links: [{ name: "photos", url: "", pending: true }],
  },
  {
    title: "[ hardware build ]",
    cat: "hardware",
    placeholder: true,
    caption: "[ a sentence on what it is and why it exists ]",
    tags: ["[ material ]"],
    links: [{ name: "photos", url: "", pending: true }],
  },
];

/* Skills by category. Every line names the work that evidences it - no
   invented levels or percentages. */
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
      { name: "Payload design", via: "CANSAT 2025" },
      { name: "[ workshop tools ]", via: "[ placeholder ]", placeholder: true },
    ],
  },
  {
    head: "Machine learning",
    items: [
      { name: "MLPs from scratch", via: "elkwork" },
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

function projectCard(p) {
  const card = el("article", "project-card");
  card.dataset.cat = p.cat;
  if (p.featured) card.classList.add("featured");

  /* thumbnail */
  let thumb;
  if (p.image) {
    thumb = el("div", "thumb duotone" + (p.contain ? " contain" : ""));
    const img = el("img");
    img.src = p.image;
    img.alt = "";
    img.loading = "lazy";
    thumb.appendChild(img);
  } else {
    thumb = el("div", "thumb empty halftone");
    thumb.setAttribute("aria-hidden", "true");
    // a small blue register mark where the photograph will go
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", "34");
    svg.setAttribute("height", "34");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.5");
    ["M12 3v18", "M3 12h18", "M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0"].forEach((d) => {
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    });
    thumb.appendChild(svg);
  }
  card.appendChild(thumb);

  /* body */
  const body = el("div", "project-body");
  const top = el("div", "top");
  top.appendChild(el("h3", null, p.title));
  const st = p.placeholder ? "placeholder" : p.status;
  if (st) top.appendChild(el("span", "status " + st, STATUS_LABEL[st]));
  body.appendChild(top);

  body.appendChild(el("p", "caption" + (p.placeholder ? " mono" : ""), p.caption));

  if (p.tags && p.tags.length) {
    const ul = el("ul", "tags");
    p.tags.forEach((t) => ul.appendChild(el("li", null, t)));
    body.appendChild(ul);
  }

  const links = el("div", "links");
  p.links.forEach((l) => links.appendChild(linkEl(l)));
  body.appendChild(links);

  card.appendChild(body);
  return card;
}

/* ---------- projects page ---------- */

function initProjects() {
  const grid = document.getElementById("project-grid");
  if (!grid) return;

  const frag = document.createDocumentFragment();
  projects.forEach((p) => frag.appendChild(projectCard(p)));
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

window.addEventListener("DOMContentLoaded", () => {
  initProjects();
  initSkills();
});
