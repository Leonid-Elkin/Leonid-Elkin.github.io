// =============================
// 🚀 Project Data
// =============================
const projects = [
  {
    title: "Machine Learning Projects",
    description:
      "View my AI/ML work uncluding my research paper on scaling, my completed code with a live demonstraction, and different downloadable models all trained by meeee :3",
    image: "Images/neurons.png",
    files: [{ name: "Go to ML Projects Page →", url: "MlProjects.html" }],
    featured: true,
    large: true,
  },
  {
    title: "Personal Physics investigation",
    description:
      "Investigating the effect of primordial binary stars on the rate of decay of a globular star cluster",
    image: "Images/N-Body Simulation.png",
    files: [
      {
        name: "📄 Research paper",
        url: "Documentation/Physics_investigation (2).pdf",
      },
      {
        name: "📄 Download project poster",
        url: "Documentation/Physics_investigation_poster.pdf",
      },
      { name: "📁 Download my code", url: "N-body_simulation/Main.py" },
    ],
    featured: false,
  },
  {
    title: "Live handwritten digit recognition using elkwork library",
    description:
      "A live demonstration of my neural network. Users can draw numbers and the network will try and predict which digit was drawn.",
    image: "Images/mnist.png",
    files: [{ name: "📁 Download my code", url: "Drawer_source.zip" }],
    featured: false,
  },
  {
    title: "Training demonstration for elkwork",
    description:
      "An easy program that can be used to train the elkwork MLP on any dataset.",
    image: "Images/code.png",
    files: [
      {
        name: "📁 Download training demo",
        url: "Elkwork_trainer_source/Main.zip",
      },
    ],
    featured: false,
  },
  {
    title: "Project Euler mathematical programming",
    description: "My solutions to the questions on the website Project Euler",
    image: "Images/Euler.png",
    files: [
      { name: "📁 My solutions.zip", url: "Euler_source.zip" },
      {
        name: "📄 Project Euler problem archives",
        url: "https://projecteuler.net/archives",
      },
    ],
    featured: false,
  },
  {
    title: "Yagi-Uda antenna based radar system",
    description:
      "Built a 14.5dbi gain antenna and used RF transceivers with a Raspberry Pi 3 to measure distances. INCOMPLETE.",
    image: "Images/Yagi.png",
    files: [
      { name: "📁 Download my code (currently unavailable)", url: "" },
      { name: "📄 Download documentation (currently unavailable)", url: "" },
    ],
    featured: false,
  },
  {
    title: "CANSAT 2025",
    description:
      "A competition that began my work on the Yagi Uda antenna radar. I worked with a team of seven.",
    image: "Images/CANSAT 2025.jpg",
    files: [
      {
        name: "📁 Download Critical design report",
        url: "Documentation/Tonbridge CanSat_ReLAACS_ 2024-25 CDR .pdf",
      },
      { name: "🎥 Download regional launch video", url: "Images/Relaacs.mp4" },
    ],
    featured: false,
  },
  {
    title: "Multiplayer Yavalath",
    description:
      "Yavalath is an abstract strategy game that was actually created by artificial intelligence. This is very much a work in progress.",
    image: "Images/Yavalath.png",
    files: [
      {
        name: "📄 Rulebook",
        url: "https://boardgamegeek.com/boardgame/33767/yavalath",
      },
    ],
    featured: false,
  },
  {
    title: "Portfolio website",
    description: "Code for this website",
    image: "Images/2fort.png",
    files: [
      { name: "My brother's website", url: "https://alexeyelkin.com/" },
      { name: "📁 Download my code", url: "Website_source.zip" },
    ],
    featured: false,
  },
  {
    title: "Shooting score visualiser",
    description:
      "I created this program to analyze shooting scores from our club and track performance.",
    image: "Images/kk300.png",
    files: [
      { name: "📁 Download my code", url: "Projects/Shooting scores/Scores" },
    ],
    featured: false,
  },
  {
    title: "Aimtrainer",
    description:
      "The first thing I ever made in PyGame. A simple aimtrainer game for FPS-style practice.",
    image: "Images/Aimtrainer.png",
    files: [
      {
        name: "📁 Download my code",
        url: "Projects/Aimtrainer_source/Aimtrainer.zip",
      },
    ],
    featured: false,
  },
];

// =============================
// 📦 Card Creator
// =============================
function createProjectCard(project) {
  const card = document.createElement("div");
  card.className = "project-card";
  if (project.featured) card.classList.add("featured-card");

  const img = document.createElement("img");
  img.src = project.image;
  img.alt = project.title;

  const content = document.createElement("div");
  content.className = "project-content";

  const title = document.createElement("h3");
  title.textContent = project.title;

  const desc = document.createElement("p");
  desc.textContent = project.description;

  content.appendChild(title);
  content.appendChild(desc);

  // Add file links
  project.files.forEach((file) => {
    const link = document.createElement("a");
    link.href = file.url;
    link.textContent = file.name;

    // Skip blank links
    if (!file.url) {
      link.classList.add("disabled");
      link.style.pointerEvents = "none";
      link.style.opacity = "0.5";
    } else if (!file.url.endsWith(".html")) {
      link.setAttribute("download", "");
    }

    content.appendChild(link);
  });

  card.appendChild(img);
  card.appendChild(content);
  return card;
}

// =============================
// 📂 Load Cards into Grid
// =============================
window.addEventListener("DOMContentLoaded", () => {
  const grid = document.getElementById("project-grid");
  projects.forEach((project) => {
    const card = createProjectCard(project);
    grid.appendChild(card);
  });
});
