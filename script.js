const projects = [
  {
    title: "Investigating neural scaling laws in a multilayer perceptron",
    description:
      "Creating my own AI model from scratch to see how the accuracy of it scales with different hyperparameters.",
    image: "Images/neurons.png",
    files: [
      { name: "📁 Download my code", url: "MLP_source/Code.zip" },
      {
        name: "📄 Download my documentation",
        url: "Documentation/Investigating_neural_scaling_laws (9).pdf",
      },
    ],
    featured: false,
  },
  {
    title: "Live handwritten digit recognition using elkwork library",
    description:
      "A live demonstration of my neural network. Users can draw numbers and the network will try and predict which digit was drawn. Easily reconfigurable to work with different datasets by just editing the save file",
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
      {
        name: "📁 My solutions.zip",
        url: "Euler_source.zip",
      },
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
      "A project I was working on for a long time. It involved lots of software and hardware development over a few months. I built a 14.5dbi gain antenna and used two transceiver chips paired with a pi3 to transmit, receive, and measure distances between other chips. This is currently INCOMPLETE.",
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
      "A competition that began my work on the Yagi Uda antenna radar. I worked with a team of seven",
    image: "Images/CANSAT 2025.jpg",
    files: [
      {
        name: "📁 Download Critical design report",
        url: "📄 Documentation/Tonbridge CanSat_ReLAACS_ 2024-25 CDR .pdf",
      },
      { name: "🎥(YouTube) Regional launch video", url: "Images/Relaacs.mp4" },
    ],
    featured: false,
  },
  {
    title: "Multiplayer Yavalath",
    description:
      "Yavalath is an abstract strategy game that was actually created by artificial intelligence. I'm currently working on it for my AQA Computer Science NEA. This is very much a work in progress and will be INCOMPLETE for another year",
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
    title: "Personal Physics investigation",
    description:
      "Investigating the effect of primordial binary stars on the rate of decay of a globular star cluster",
    image: "Images/NbodySim.png",
    files: [
      { name: "📄 Research paper", url: "" },
      { name: "📁 Download my code", url: "N-body_simulation/Main.py" },
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
      "As a member of a prone rifle shooting club, I wanted to track my progress and compare it to other people. So I created this program that analysed excel files sent to us by our coach.",
    image: "Images/kk300.png",
    files: [
      { name: "📁 Download my code", url: "Projects/Shooting scores/Scores" },
    ],
    featured: false,
  },

  {
    title: "Aimtrainer",
    description:
      "The first ever thing I made in PyGame. It's a very simplistic 'aimtrainer' game like the ones one might find for games like Counter Strike",
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

function createProjectCard(project) {
  const card = document.createElement("div");
  card.className = "project-card";

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

  project.files.forEach((file) => {
    const link = document.createElement("a");
    link.href = file.url;
    link.textContent = file.name;
    link.setAttribute("download", "");
    content.appendChild(link);
  });

  card.appendChild(img);
  card.appendChild(content);

  return card;
}

// Load boxes
window.addEventListener("DOMContentLoaded", () => {
  const projectGrid = document.getElementById("project-grid");
  projects.forEach((project) => {
    const card = createProjectCard(project);
    projectGrid.appendChild(card);
  });
});
