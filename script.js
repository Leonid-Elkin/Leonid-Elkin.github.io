/* Project grid (tab 01) and skills (tab 02).
 *
 * A file with `pending: true` (or an empty url) renders greyed out with a
 * "coming soon" tag instead of a link that 404s.
 *
 * Drone Strike Map is deliberately NOT in this grid: its thumbnail is the war
 * map, and that is kept off the landing view. It lives in tab 03 instead.
 */

const projects = [
  {
    title: "Machine Learning",
    description:
      "Interactive demos, the neural scaling laws paper, and downloadable models, all trained by me.",
    image: "Images/neurons.png",
    files: [{ name: "the ML page →", url: "MlProjects.html" }],
    featured: true,
  },
  {
    title: "SHELLFALL",
    description:
      "Command a coastal fortress against a campaign of named capital ships. Aim your batteries by hand, mark priority targets, and out-build an enemy that never stops sailing. Released as Penumbra.",
    image: "Images/shellfall.png",
    files: [
      { name: "play it on itch.io", url: "https://elkyy.itch.io/penumbra" },
      { name: "windows build", url: "", pending: true },
      { name: "source", url: "https://github.com/Leonid-Elkin/Penumbra" },
    ],
  },
  {
    title: "Sheet2Tab",
    description:
      "Turns a PDF of sheet music into playable classical-guitar tablature, with an editor for whatever the reader gets wrong. Also transcribes from a recording or a video of a score.",
    image: "Images/sheet2tab.png",
    files: [
      { name: "example output", url: "Documentation/sheet2tab_example.pdf" },
      { name: "the app", url: "", pending: true },
      { name: "source", url: "", pending: true },
    ],
  },
  {
    title: "Chess Vision Bot",
    description:
      "Reads a chessboard off the screen, reconstructs the position, and suggests the best move in real time. The engine has since been ported to C++.",
    image: "Images/chess.png",
    contain: true,
    files: [
      { name: "the bot", url: "", pending: true },
      { name: "source", url: "", pending: true },
    ],
  },
  {
    title: "Globular clusters",
    description:
      "Investigating the effect of primordial binary stars on the rate of decay of a globular star cluster.",
    image: "Images/N-Body Simulation.png",
    files: [
      { name: "the paper", url: "Documentation/Physics_investigation (2).pdf" },
      { name: "the poster", url: "Documentation/Physics_investigation_poster.pdf" },
      { name: "source", url: "N-body_simulation/Main.py" },
    ],
  },
  {
    title: "Yavalath & Pentalath",
    description:
      "A-Level coursework: the hex board games Yavalath and Pentalath in full, with a UI, sound and a computer opponent. Yavalath was itself designed by an AI.",
    image: "Images/Yavalath.png",
    files: [
      { name: "documentation", url: "Documentation/Yavalath_NEA_documentation.pdf" },
      { name: "the rules", url: "https://boardgamegeek.com/boardgame/33767/yavalath" },
    ],
  },
  {
    title: "Yagi-Uda radar",
    description:
      "A 14.5 dBi antenna driving RF transceivers off a Raspberry Pi 3 to measure distance. Unfinished.",
    image: "Images/Yagi.png",
    files: [
      { name: "source", url: "", pending: true },
      { name: "documentation", url: "", pending: true },
    ],
  },
  {
    title: "CANSAT 2025",
    description: "The competition that started the antenna work. Seven of us.",
    image: "Images/CANSAT 2025.jpg",
    files: [
      { name: "critical design report", url: "Documentation/Tonbridge CanSat_ReLAACS_ 2024-25 CDR .pdf" },
      { name: "launch video", url: "Images/Relaacs.mp4", pending: true },
    ],
  },
  {
    title: "Project Euler",
    description: "My solutions to the problems on Project Euler.",
    image: "Images/Euler.png",
    files: [
      { name: "solutions", url: "Euler_source.zip" },
      { name: "the archive", url: "https://projecteuler.net/archives" },
    ],
  },
  {
    title: "Shooting scores",
    description: "Written to analyse scores from our club and track performance over a season.",
    image: "Images/kk300.png",
    files: [{ name: "source", url: "Shooting score visualiser.zip" }],
  },
  {
    title: "Aimtrainer",
    description: "The first thing I ever made in PyGame.",
    image: "Images/Aimtrainer.png",
    files: [{ name: "source", url: "Aimtrainer_source/Aimtrainer.zip" }],
  },
  {
    title: "This website",
    description: "Cut out and stuck back down.",
    image: "Images/2fort.png",
    files: [
      { name: "source", url: "Website_source.zip" },
      { name: "my brother's", url: "https://alexeyelkin.com/" },
    ],
  },
];

/* Skills carry no invented percentages - each says what the thing is and
   points at the work that proves it. */
const skills = [
  {
    name: "Simulation & game engines",
    note: "SHELLFALL: physics, AI, campaign and netcode, built from nothing",
    icon: ["M3 12h4l3-8 4 16 3-8h4"],
  },
  {
    name: "Scrapers & data pipelines",
    note: "a few dozen outlets read every day, unattended, on their own server",
    icon: ["M4 6h16", "M4 12h16", "M4 18h10", "M18 16v5", "M15.5 18.5L18 21l2.5-2.5"],
  },
  {
    name: "Neural networks",
    note: "elkwork: multilayer perceptrons written from scratch, no framework",
    icon: ["M6 6v12", "M12 4v16", "M18 6v12", "M6 9h6", "M12 9h6", "M6 15h6", "M12 15h6"],
  },
  {
    name: "Computer vision",
    note: "reads a live chessboard off raw pixels and reconstructs the position",
    icon: ["M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"],
  },
  {
    name: "RF & antenna design",
    note: "a 14.5 dBi Yagi-Uda, and the CANSAT payload behind it",
    icon: ["M12 20v-8", "M8 12h8", "M6 8h12", "M4 4h16", "M12 20h0"],
  },
  {
    name: "Optical music recognition",
    note: "Sheet2Tab: a printed score becomes playable guitar tablature",
    icon: ["M9 18V5l10-2v13", "M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z", "M19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"],
  },
];

function svgIcon(paths, size) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.7");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  paths.forEach((d) => {
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", d);
    svg.appendChild(p);
  });
  return svg;
}

function isExternal(url) {
  return /^https?:\/\//i.test(url);
}

function createFileLink(file) {
  const link = document.createElement("a");
  link.textContent = file.name;

  if (file.pending || !file.url) {
    link.href = "";
    link.classList.add("disabled");
    link.setAttribute("aria-disabled", "true");
    link.tabIndex = -1;
    const tag = document.createElement("span");
    tag.className = "pending";
    tag.textContent = "soon";
    const wrap = document.createElement("span");
    wrap.appendChild(link);
    wrap.appendChild(tag);
    return wrap;
  }

  link.href = file.url;
  if (isExternal(file.url)) {
    link.target = "_blank";
    link.rel = "noopener";
  } else if (!file.url.endsWith(".html")) {
    link.setAttribute("download", "");
  }
  return link;
}

function createProjectCard(project) {
  const card = document.createElement("article");
  card.className = "project-card";
  if (project.featured) card.classList.add("featured-card");

  const img = document.createElement("img");
  img.src = project.image;
  img.alt = project.title;
  img.loading = "lazy";
  if (project.contain) img.classList.add("contain");

  const content = document.createElement("div");
  content.className = "project-content";

  const title = document.createElement("h3");
  title.textContent = project.title;

  const desc = document.createElement("p");
  desc.textContent = project.description;

  content.appendChild(title);
  content.appendChild(desc);
  project.files.forEach((f) => content.appendChild(createFileLink(f)));

  card.appendChild(img);
  card.appendChild(content);
  return card;
}

function createSkill(s) {
  const el = document.createElement("div");
  el.className = "skill";
  el.appendChild(svgIcon(s.icon, 24));

  const body = document.createElement("div");
  const h = document.createElement("h3");
  h.textContent = s.name;
  const p = document.createElement("p");
  p.textContent = s.note;
  body.appendChild(h);
  body.appendChild(p);

  el.appendChild(body);
  return el;
}

window.addEventListener("DOMContentLoaded", () => {
  const grid = document.getElementById("project-grid");
  if (grid) {
    const frag = document.createDocumentFragment();
    projects.forEach((p) => frag.appendChild(createProjectCard(p)));
    grid.appendChild(frag);
  }

  const sg = document.getElementById("skill-grid");
  if (sg) {
    const frag = document.createDocumentFragment();
    skills.forEach((s) => frag.appendChild(createSkill(s)));
    sg.appendChild(frag);
  }
});
