/* Data and rendering for MlProjects.html.
 *
 * A project or model with `pending: true` (or an empty link) renders greyed
 * out with a "coming soon" tag instead of a link that 404s.
 */

const projects = [
  {
    title: "MLP Library (elkwork)",
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

const trainedModels = [
  {
    name: "MNIST",
    accuracy: "98.52%",
    link: "MLSaves/HighAccuracyMNIST.txt",
  },
  {
    // Models/fashion_mnist_model.zip has never been in the repo - the live
    // link 404s. Marked pending until the file is uploaded.
    name: "FashionMNIST",
    accuracy: "93.35%",
    link: "Models/fashion_mnist_model.zip",
    pending: true,
  },
];

function pendingTag() {
  const tag = document.createElement("span");
  tag.className = "pending";
  tag.textContent = "coming soon";
  return tag;
}

function buildLink(href, text, { download = false, pending = false } = {}) {
  const link = document.createElement("a");
  link.textContent = text;

  if (pending || !href) {
    link.href = "";
    link.classList.add("disabled");
    link.setAttribute("aria-disabled", "true");
    link.tabIndex = -1;
    const wrap = document.createElement("span");
    wrap.appendChild(link);
    wrap.appendChild(pendingTag());
    return wrap;
  }

  link.href = href;
  if (download) {
    link.setAttribute("download", "");
  } else if (/^https?:\/\//i.test(href)) {
    link.target = "_blank";
    link.rel = "noopener";
  }
  return link;
}

function createProjectBoxes() {
  const container = document.getElementById("projects-container");
  if (!container) return;

  projects.forEach((project) => {
    const card = document.createElement("article");
    card.className = "ml-card";

    const img = document.createElement("img");
    img.src = project.img;
    img.alt = project.title;
    img.loading = "lazy";

    const body = document.createElement("div");
    body.className = "ml-card-body";

    const title = document.createElement("h3");
    title.textContent = project.title;

    body.appendChild(title);
    body.appendChild(
      buildLink(project.link, project.linkText, {
        download: project.download,
        pending: project.pending,
      })
    );

    card.appendChild(img);
    card.appendChild(body);
    container.appendChild(card);
  });
}

function createModelsList() {
  const ul = document.getElementById("models-list");
  if (!ul) return;

  trainedModels.forEach((model) => {
    const li = document.createElement("li");

    const name = document.createElement("span");
    name.className = "model-name";
    name.textContent = model.name;

    const acc = document.createElement("span");
    acc.className = "model-accuracy";
    acc.textContent = model.accuracy;

    li.appendChild(name);
    li.appendChild(acc);
    li.appendChild(
      buildLink(model.link, "⬇ Download", {
        download: true,
        pending: model.pending,
      })
    );

    ul.appendChild(li);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  createProjectBoxes();
  createModelsList();
});
