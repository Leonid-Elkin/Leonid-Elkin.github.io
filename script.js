/* Project data for the grid on index.html.
 *
 * Each entry: { title, description, image, files[], featured?, large?, contain? }
 * A file with `pending: true` (or an empty url) renders greyed out with a
 * "coming soon" tag - use it for downloads that do not exist yet.
 */

const projects = [
  {
    title: "Machine Learning Projects",
    description:
      "My AI/ML work: interactive demos, the neural scaling laws research paper, and downloadable models, all trained by me.",
    image: "Images/neurons.png",
    files: [{ name: "Go to ML Projects Page →", url: "MlProjects.html" }],
    featured: true,
    large: true,
  },
  {
    title: "Drone Strike Map",
    description:
      "A live, day-by-day map of reported drone and missile strikes in the Russia-Ukraine war. Scrapers read the daily reports from a few dozen outlets, pin what was launched and where it landed, and cite the source behind every figure. Runs on its own server with a public read API.",
    image: "Images/dronestrikemap.png",
    files: [
      { name: "🌐 Open the live map", url: "https://dronestrikemap.com/" },
      { name: "📡 Public API", url: "https://dronestrikemap.com/api/strikes" },
      { name: "📁 Source on GitHub", url: "", pending: true },
    ],
  },
  {
    title: "SHELLFALL — Naval Warfare",
    description:
      "Command a coastal fortress against a campaign of named capital ships. Aim your batteries by hand, mark priority targets, rally your fleet and out-build an enemy that never stops sailing. Previously released as Penumbra.",
    image: "Images/shellfall.png",
    files: [
      { name: "🎮 Play on itch.io", url: "https://elkyy.itch.io/penumbra" },
      { name: "📦 Download for Windows", url: "", pending: true },
      { name: "📁 Source on GitHub", url: "https://github.com/Leonid-Elkin/Penumbra" },
    ],
  },
  {
    title: "Sheet2Tab",
    description:
      "Turns a PDF of sheet music into playable classical-guitar tablature, with an editor for correcting whatever the reader gets wrong. Also transcribes straight from a recording or a video of a score.",
    image: "Images/sheet2tab.png",
    files: [
      { name: "📄 Example output (Bach, Contrapunctus I)", url: "Documentation/sheet2tab_example.pdf" },
      { name: "📦 Download the app", url: "", pending: true },
      { name: "📁 Source on GitHub", url: "", pending: true },
    ],
  },
  {
    title: "Chess Vision Bot",
    description:
      "Reads a chessboard directly off the screen, reconstructs the position, and uses a custom engine to suggest the best move in real time. Now has a C++ port of the engine for speed.",
    image: "Images/chess.png",
    contain: true,
    files: [
      { name: "📦 Download the bot", url: "", pending: true },
      { name: "📁 Source on GitHub", url: "", pending: true },
    ],
  },
  {
    title: "Personal Physics investigation",
    description:
      "Investigating the effect of primordial binary stars on the rate of decay of a globular star cluster.",
    image: "Images/N-Body Simulation.png",
    files: [
      { name: "📄 Research paper", url: "Documentation/Physics_investigation (2).pdf" },
      { name: "📄 Project poster", url: "Documentation/Physics_investigation_poster.pdf" },
      { name: "📁 Download my code", url: "N-body_simulation/Main.py" },
    ],
  },
  {
    title: "Yavalath & Pentalath (A-Level NEA)",
    description:
      "My completed A-Level Computer Science coursework: a full implementation of the hex board games Yavalath and Pentalath, with a UI, sound and a computer opponent. Yavalath was itself designed by AI.",
    image: "Images/Yavalath.png",
    files: [
      { name: "📄 Download documentation", url: "Documentation/Yavalath_NEA_documentation.pdf" },
      { name: "📄 Rulebook", url: "https://boardgamegeek.com/boardgame/33767/yavalath" },
    ],
  },
  {
    title: "Yagi-Uda antenna based radar system",
    description:
      "Built a 14.5dBi gain antenna and used RF transceivers with a Raspberry Pi 3 to measure distances. Incomplete.",
    image: "Images/Yagi.png",
    files: [
      { name: "📁 Download my code", url: "", pending: true },
      { name: "📄 Download documentation", url: "", pending: true },
    ],
  },
  {
    title: "CANSAT 2025",
    description:
      "A competition that began my work on the Yagi-Uda antenna radar. I worked with a team of seven.",
    image: "Images/CANSAT 2025.jpg",
    files: [
      {
        name: "📁 Critical design report",
        url: "Documentation/Tonbridge CanSat_ReLAACS_ 2024-25 CDR .pdf",
      },
      // The v1.5 site linked Images/Relaacs.mp4, but that file has never been
      // in the repo - the live link 404s. Marked pending until the file exists.
      { name: "🎥 Regional launch video", url: "Images/Relaacs.mp4", pending: true },
    ],
  },
  {
    title: "Project Euler mathematical programming",
    description: "My solutions to the questions on the website Project Euler.",
    image: "Images/Euler.png",
    files: [
      { name: "📁 My solutions.zip", url: "Euler_source.zip" },
      { name: "📄 Project Euler archives", url: "https://projecteuler.net/archives" },
    ],
  },
  {
    title: "Shooting score visualiser",
    description:
      "I created this program to analyse shooting scores from our club and track performance.",
    image: "Images/kk300.png",
    files: [{ name: "📁 Download my code", url: "Shooting score visualiser.zip" }],
  },
  {
    title: "Aimtrainer",
    description:
      "The first thing I ever made in PyGame. A simple aimtrainer game for FPS-style practice.",
    image: "Images/Aimtrainer.png",
    files: [{ name: "📁 Download my code", url: "Aimtrainer_source/Aimtrainer.zip" }],
  },
  {
    title: "Portfolio website",
    description: "The code for this website.",
    image: "Images/2fort.png",
    files: [
      { name: "📁 Download my code", url: "Website_source.zip" },
      { name: "My brother's website", url: "https://alexeyelkin.com/" },
    ],
  },
];

function isExternal(url) {
  return /^https?:\/\//i.test(url);
}

function createFileLink(file) {
  const link = document.createElement("a");
  link.textContent = file.name;

  // No target yet: render as a disabled placeholder so the card still shows
  // what is planned without offering a link that 404s.
  if (file.pending || !file.url) {
    link.href = "";
    link.classList.add("disabled");
    link.setAttribute("aria-disabled", "true");
    link.tabIndex = -1;

    const tag = document.createElement("span");
    tag.className = "pending";
    tag.textContent = "coming soon";

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
  project.files.forEach((file) => content.appendChild(createFileLink(file)));

  card.appendChild(img);
  card.appendChild(content);
  return card;
}

window.addEventListener("DOMContentLoaded", () => {
  const grid = document.getElementById("project-grid");
  if (!grid) return;
  const frag = document.createDocumentFragment();
  projects.forEach((project) => frag.appendChild(createProjectCard(project)));
  grid.appendChild(frag);
});
