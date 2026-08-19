/* Content and rendering for the home page (skills, experience) and the
 * projects page (index + category filter).
 *
 * THIS IS A TEMPLATE. Everything in the three data blocks below is a
 * placeholder for you to replace. Anything wrapped in [ square brackets ]
 * renders in the loud placeholder treatment (red rule, monospace) so an
 * unfilled slot reads as unfinished rather than as a design choice - see the
 * foot of style.css. Delete the brackets and the copy stops shouting.
 *
 * A link with `pending: true` renders greyed with a "soon" tag instead of
 * 404ing. A project with `placeholder: true` says so on its face.
 */

/* ---------- projects ---------- */

/* `cat` drives the filter buttons on projects.html. Rename the three
   categories to whatever splits your work honestly - the filter reads them
   from here, so changing a name here changes the button. */
const projects = [
  {
    title: "Project One",
    cat: "product",
    status: "live",
    featured: true,
    caption:
      "[ What it is, who it is for, and the part that was genuinely hard. Two sentences. The featured entry gets more room, so use it. ]",
    tags: ["[ Stack ]", "[ Stack ]", "[ Stack ]"],
    links: [
      { name: "case study", url: "project.html" },
      { name: "view live", url: "", pending: true },
      { name: "source", url: "", pending: true },
    ],
  },
  {
    title: "Project Two",
    cat: "product",
    status: "live",
    caption: "[ What it is, and the problem it solved. ]",
    tags: ["[ Stack ]", "[ Stack ]"],
    links: [
      { name: "view live", url: "", pending: true },
      { name: "source", url: "", pending: true },
    ],
  },
  {
    title: "Project Three",
    cat: "tooling",
    status: "wip",
    caption: "[ What it is, and what you learned building it. ]",
    tags: ["[ Stack ]", "[ Stack ]"],
    links: [{ name: "source", url: "", pending: true }],
  },
  {
    title: "Project Four",
    cat: "tooling",
    caption: "[ One sentence is enough for the smaller ones. ]",
    tags: ["[ Stack ]"],
    links: [{ name: "source", url: "", pending: true }],
  },
  {
    title: "Project Five",
    cat: "experiment",
    caption: "[ One sentence. ]",
    tags: ["[ Stack ]"],
    links: [{ name: "write-up", url: "", pending: true }],
  },
  {
    title: "[ Next project ]",
    cat: "experiment",
    placeholder: true,
    caption: "[ An empty slot is fine. It says you are still building. ]",
    tags: ["[ Stack ]"],
    links: [{ name: "soon", url: "", pending: true }],
  },
];

/* ---------- experience ---------- */

/* Most recent first. The first entry renders as the current role. */
const roles = [
  {
    title: "[ Job title ]",
    org: "[ Company ]",
    place: "[ Location ]",
    from: "[ 20XX ]",
    to: "Present",
    current: true,
    bullets: [
      "[ What you built or owned, and the number that proves it mattered. ]",
      "[ A second bullet. Verb first, outcome second. ]",
      "[ A third, if it earns its place. ]",
    ],
  },
  {
    title: "[ Job title ]",
    org: "[ Company ]",
    place: "[ Location ]",
    from: "[ 20XX ]",
    to: "[ 20XX ]",
    bullets: [
      "[ What you shipped here. ]",
      "[ What changed because of it. ]",
    ],
  },
  {
    title: "[ Job title ]",
    org: "[ Company ]",
    place: "[ Location ]",
    from: "[ 20XX ]",
    to: "[ 20XX ]",
    bullets: ["[ What you shipped here. ]"],
  },
];

const education = [
  {
    award: "[ Degree ]",
    org: "[ Institution ]",
    years: "[ 20XX&ndash;20XX ]",
    note: "[ Grade / honours ]",
  },
  {
    award: "[ Qualification ]",
    org: "[ Institution ]",
    years: "[ 20XX&ndash;20XX ]",
    note: "[ Grade ]",
  },
];

/* ---------- skills ---------- */

/* Every line names the work that evidences it - no invented levels or
   percentages. `via` is where a reader can go and see the claim proved. */
const skills = [
  {
    head: "Languages",
    items: [
      { name: "[ Language ]", via: "[ where you used it ]", placeholder: true },
      { name: "[ Language ]", via: "[ where you used it ]", placeholder: true },
      { name: "[ Language ]", via: "[ where you used it ]", placeholder: true },
    ],
  },
  {
    head: "Frameworks",
    items: [
      { name: "[ Framework ]", via: "[ project ]", placeholder: true },
      { name: "[ Framework ]", via: "[ project ]", placeholder: true },
      { name: "[ Tool ]", via: "[ project ]", placeholder: true },
    ],
  },
  {
    head: "Infrastructure",
    items: [
      { name: "[ Tool ]", via: "[ project ]", placeholder: true },
      { name: "[ Tool ]", via: "[ project ]", placeholder: true },
    ],
  },
  {
    head: "[ Your specialism ]",
    items: [
      { name: "[ Skill ]", via: "[ evidence ]", placeholder: true },
      { name: "[ Skill ]", via: "[ evidence ]", placeholder: true },
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

/* The three featured entries on the front page. Same data, shorter form. */
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

/* ---------- home: experience ---------- */

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
    box.appendChild(el("h3", null, e.award));
    const line = el("p", "mono edu-org");
    line.append(e.org, " · ", e.years.replace(/&ndash;/g, "–"));
    box.appendChild(line);
    box.appendChild(el("p", "mono edu-note", e.note));
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
