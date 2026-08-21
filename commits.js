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

/* SET THIS. Your GitHub username - the feed reads public repos only,
   no token needed. Left empty the section explains itself instead of 404ing. */
const GH_USER = "Leonid-Elkin";
const REPO_COUNT = 5; // most recently pushed repos to look at
const PER_REPO = 5; // commits to pull from each
const SHOW = 8; // commits displayed after merging
const CACHE_KEY = "commits-v2";
const FRESH_MS = 30 * 60 * 1000; // a cached list younger than this is shown without asking GitHub

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

  if (!GH_USER) {
    into.appendChild(
      statusLine("Set GH_USER in commits.js to your GitHub username and this fills itself in.")
    );
    return;
  }

  into.appendChild(statusLine("Loading recent commits…"));

  // Six requests per view is rude against a 60/hour unauthenticated limit
  // shared by everyone behind the same IP, so the list is kept in localStorage
  // for half an hour: a visitor clicking around, or coming back after lunch,
  // pays for it once. When GitHub does say no, a stale copy beats an empty
  // section - it is shown, and says how old it is.
  const cached = readCache();
  if (cached && Date.now() - cached.at < FRESH_MS) {
    renderCommits(cached.list, into);
    return;
  }

  try {
    const commits = await fetchRecentCommits();
    renderCommits(commits, into);
    writeCache(commits);
  } catch (err) {
    into.textContent = "";
    if (cached) {
      renderCommits(cached.list, into);
      into.appendChild(
        statusLine(
          `GitHub is not answering just now, so this is the list from ${minutesAgo(cached.at)}.`
        )
      );
      return;
    }
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

/* localStorage, guarded: private mode and full quotas both just mean "no cache". */
function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    return c && Array.isArray(c.list) && typeof c.at === "number" ? c : null;
  } catch (e) {
    return null;
  }
}

function writeCache(list) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), list }));
  } catch (e) {
    /* over quota or blocked - not worth surfacing */
  }
}

function minutesAgo(ts) {
  const m = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (m < 60) return `${m} minute${m > 1 ? "s" : ""} ago`;
  const h = Math.round(m / 60);
  return `${h} hour${h > 1 ? "s" : ""} ago`;
}
