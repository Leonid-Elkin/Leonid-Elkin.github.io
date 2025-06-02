// Data for project boxes (like main page)
const projects = [
  {
    title: "MLP Library",
    img: "Images/neurons.png",
    link: "MLP all documents (2).zip",
    linkText: "📁 Download code",
    download: true,
  },
  {
    title: "Supplementary Research Program",
    img: "Images/EfficiencyFrontier.png",
    link: "Documentation/Physics_investigation (2).pdf",
    linkText: "📄 Research paper",
    download: false,
  },
  {
    title: "Drawer Program",
    img: "Images/DrawerExample.png",
    link: "Drawer_source.zip",
    linkText: "📁 Download code",
    download: true,
  },
];

// Data for trained models with download links
const trainedModels = [
  {
    name: "MNIST",
    accuracy: "98.52%",
    link: "MLSaves/HighAccuracyMNIST.txt",
  },
  {
    name: "FashionMNIST",
    accuracy: "TBD",
    link: "Models/fashion_mnist_model.zip",
  },
];

function createProjectBoxes() {
  const container = document.getElementById("projects-container");
  projects.forEach((project) => {
    const box = document.createElement("div");
    box.className = "project-box";

    box.innerHTML = `
      <img src="${project.img}" alt="${project.title}" />
      <h3>${project.title}</h3>
      <a href="${project.link}" ${
      project.download ? "download" : 'target="_blank"'
    }>${project.linkText}</a>
    `;

    container.appendChild(box);
  });
}

function createModelsList() {
  const ul = document.getElementById("models-list");
  trainedModels.forEach((model) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span>${model.name} - ${model.accuracy}</span>
      <a href="${model.link}" download>⬇ Download</a>
    `;
    ul.appendChild(li);
  });
}

// On DOM ready
document.addEventListener("DOMContentLoaded", () => {
  createProjectBoxes();

  createModelsList();
});
