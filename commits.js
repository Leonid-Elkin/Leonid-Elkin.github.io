/* Recent commits section on index.html.
 *
 * Pulls from the public GitHub REST API in the visitor's browser - no build
 * step and no token. Deliberately repo-based rather than author-based: commits
 * pushed from this machine carry a school email that GitHub maps to a
 * different account, so an author query would miss them.
 *
 * Only the first line of each commit message is shown. Bodies can carry
 * trailers that have no business on a portfolio page.
 */

const GH_USER = "Leonid-Elkin";
const REPO_COUNT = 5; // most recently pushed repos to look at
const PER_REPO = 5; // commits to pull from each
const SHOW = 8; // commits displayed after merging
const CACHE_KEY = "commits-v1";

async function ghJson(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) {
    const err = new Error(`GitHub API ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function fetchRecentCommits() {
  const repos = await ghJson(
    `https://api.github.com/users/${GH_USER}/repos?sort=pushed&per_page=${REPO_COUNT}`
  );

  // One repo failing (empty, or rate limit part-way) must not lose the rest.
  const perRepo = await Promise.all(
    repos.map((repo) =>
      ghJson(
        `https://api.github.com/repos/${repo.full_name}/commits?per_page=${PER_REPO}`
      )
        .then((commits) =>
          commits.map((c) => ({
            repo: repo.name,
            message: c.commit.message.split("\n")[0],
            date: c.commit.author.date,
            url: c.html_url,
            sha: c.sha.slice(0, 7),
          }))
        )
        .catch(() => [])
    )
  );

  return perRepo
    .flat()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, SHOW);
}

function relativeDate(iso) {
  const then = new Date(iso);
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? "s" : ""} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years > 1 ? "s" : ""} ago`;
}

function renderCommits(list, into) {
  into.textContent = "";

  if (!list.length) {
    into.appendChild(statusLine("No recent commits to show."));
    return;
  }

  const ul = document.createElement("ul");
  ul.className = "commit-list";

  list.forEach((c) => {
    const li = document.createElement("li");

    const repo = document.createElement("span");
    repo.className = "commit-repo";
    repo.textContent = c.repo;

    const msg = document.createElement("a");
    msg.className = "commit-message";
    msg.href = c.url;
    msg.target = "_blank";
    msg.rel = "noopener";
    msg.textContent = c.message;
    msg.title = `${c.sha} - view on GitHub`;

    const when = document.createElement("time");
    when.className = "commit-date";
    when.dateTime = c.date;
    when.textContent = relativeDate(c.date);

    li.appendChild(repo);
    li.appendChild(msg);
    li.appendChild(when);
    ul.appendChild(li);
  });

  into.appendChild(ul);
}

function statusLine(text) {
  const p = document.createElement("p");
  p.className = "commit-status";
  p.textContent = text;
  return p;
}

window.addEventListener("DOMContentLoaded", async () => {
  const into = document.getElementById("commit-feed");
  if (!into) return;

  into.appendChild(statusLine("Loading recent commits…"));

  // Six requests per view is rude against a 60/hour unauthenticated limit,
  // so a visitor clicking around only pays for them once per session.
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      renderCommits(JSON.parse(cached), into);
      return;
    }
  } catch (e) {
    /* sessionStorage unavailable (private mode) - just fetch */
  }

  try {
    const commits = await fetchRecentCommits();
    renderCommits(commits, into);
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(commits));
    } catch (e) {
      /* over quota or blocked - not worth surfacing */
    }
  } catch (err) {
    into.textContent = "";
    into.appendChild(
      statusLine(
        err.status === 403
          ? "GitHub's hourly API limit is used up. Commits will show again shortly."
          : "Could not reach GitHub just now."
      )
    );
    const link = document.createElement("a");
    link.href = `https://github.com/${GH_USER}?tab=repositories`;
    link.target = "_blank";
    link.rel = "noopener";
    link.className = "commit-fallback";
    link.textContent = "Browse the repositories on GitHub →";
    into.appendChild(link);
  }
});
