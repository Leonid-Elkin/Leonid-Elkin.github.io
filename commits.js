/* Recent commits section on index.html.
 *
 * Two things, both pulled from the public GitHub REST API in the visitor's
 * browser - no build step and no token:
 *
 *   1. A year of activity as a heatmap. GitHub's own contribution calendar is
 *      GraphQL-only and needs a token, so this is built instead from
 *      /stats/commit_activity, which hands back 52 weeks x 7 days per repo to
 *      anyone who asks. Summed across the repos it is the same picture.
 *   2. The newest commits, newest first.
 *
 * Deliberately repo-based rather than author-based: commits pushed from this
 * machine carry a school email that GitHub maps to a different account, so an
 * author query would miss them. Forks are dropped - their history is somebody
 * else's and would both pad the list and wreck the scale of the graph.
 *
 * Only the first line of each commit message is shown. Bodies can carry
 * trailers that have no business on a portfolio page.
 */

/* SET THIS. Your GitHub username - the feed reads public repos only,
   no token needed. Left empty the section explains itself instead of 404ing. */
const GH_USER = "Leonid-Elkin";
const GRAPH_REPOS = 10; // repos folded into the year graph
const LIST_REPOS = 5; // repos read for the commit list
const PER_REPO = 5; // commits to pull from each
const SHOW = 8; // commits displayed after merging
const WEEKS_SHOWN = 52; // columns in the heatmap - one year
const CACHE_KEY = "commits-v2";
const CACHE_TTL = 6 * 60 * 60 * 1000; // the graph moves once a day at most
const CACHE_TTL_THIN = 10 * 60 * 1000; // ...unless GitHub was still adding up
const CACHE_REUSE = 24 * 60 * 60 * 1000; // how long a fuller year may be held on to

/* grid geometry, in SVG units */
const CELL = 11;
const GAP = 3;
const PITCH = CELL + GAP;
const PAD_L = 26; // room for the weekday labels
const PAD_T = 15; // room for the month labels

const SVG_NS = "http://www.w3.org/2000/svg";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* ---------- the api ---------- */

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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* The stats endpoints are computed on demand: GitHub answers 202 with an empty
   body while it builds the cache, then serves the real thing on a later ask. */
async function ghStats(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (res.status === 202) {
      await wait(900 * (attempt + 1));
      continue;
    }
    if (!res.ok) {
      const err = new Error(`GitHub API ${res.status}`);
      err.status = res.status;
      throw err;
    }
    const body = await res.json().catch(() => []);
    return Array.isArray(body) ? body : [];
  }
  return [];
}

async function fetchRecentCommits(repos) {
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

async function fetchYear(repos) {
  const perRepo = await Promise.all(
    repos.map((repo) =>
      ghStats(
        `https://api.github.com/repos/${repo.full_name}/stats/commit_activity`
      ).catch(() => [])
    )
  );
  return {
    weeks: mergeWeeks(perRepo),
    answered: perRepo.filter((r) => r.length).length,
  };
}

/* The Sunday that owns a timestamp, at UTC midnight. */
function weekStart(ts) {
  const midnight = Math.floor(ts / 86400) * 86400;
  return midnight - new Date(midnight * 1000).getUTCDay() * 86400;
}

/* Repos do NOT agree on their week boundaries - a repo whose stats cache is
   stale answers with an older window, and the windows are not all anchored to
   the same weekday. Keyed on the raw stamp the union ran to eighty-odd columns
   with two cells claiming the same date. So: snap every week to its Sunday,
   then lay the grid out from the calendar and read the counts off the map. */
function mergeWeeks(perRepo) {
  const byWeek = new Map();

  perRepo.flat().forEach((week) => {
    if (!week || !Array.isArray(week.days)) return;
    const start = weekStart(week.week);
    const row = byWeek.get(start) || [0, 0, 0, 0, 0, 0, 0];
    week.days.forEach((n, i) => {
      row[i] += n || 0;
    });
    byWeek.set(start, row);
  });

  if (!byWeek.size) return [];

  const thisWeek = weekStart(Math.floor(Date.now() / 1000));
  const out = [];
  for (let back = WEEKS_SHOWN - 1; back >= 0; back--) {
    const week = thisWeek - back * 7 * 86400;
    out.push({ week, days: byWeek.get(week) || [0, 0, 0, 0, 0, 0, 0] });
  }
  return out;
}

async function fetchEverything() {
  const repos = (
    await ghJson(
      `https://api.github.com/users/${GH_USER}/repos?sort=pushed&per_page=${GRAPH_REPOS + 10}`
    )
  )
    .filter((repo) => !repo.fork)
    .slice(0, GRAPH_REPOS);

  const [commits, year] = await Promise.all([
    fetchRecentCommits(repos.slice(0, LIST_REPOS)),
    fetchYear(repos),
  ]);

  return {
    commits,
    weeks: year.weeks,
    repoCount: repos.length,
    // A repo asked for stats it has never served before answers 202 while it
    // adds them up, and we give up before it finishes. That first visitor gets
    // a thin graph; flag it so the answer is not kept for six hours.
    thin: year.answered < repos.length,
  };
}

/* ---------- the heatmap ---------- */

function svgEl(name, attrs) {
  const el = document.createElementNS(SVG_NS, name);
  Object.keys(attrs || {}).forEach((k) => el.setAttribute(k, attrs[k]));
  return el;
}

/* Four shades over the quartiles of the days that actually saw work, so the
   graph reads the same whether the year held 40 commits or 4000. */
function levelScale(counts) {
  const busy = counts.filter((n) => n > 0).sort((a, b) => a - b);
  if (!busy.length) return () => 0;
  const at = (p) => busy[Math.min(busy.length - 1, Math.floor(p * busy.length))];
  const t = [at(0.25), at(0.5), at(0.75)];
  return (n) => (n <= 0 ? 0 : n <= t[0] ? 1 : n <= t[1] ? 2 : n <= t[2] ? 3 : 4);
}

/* Week stamps are UTC midnight on a Sunday, so everything below stays in UTC. */
function dayStamp(ts) {
  const d = new Date(ts * 1000);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function plural(n, one, many) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

function renderGraph(weeks, into, repoCount) {
  into.textContent = "";
  if (!weeks.length) return; // the list underneath still carries the section

  const counts = weeks.flatMap((w) => w.days);
  const total = counts.reduce((a, b) => a + b, 0);
  const level = levelScale(counts);
  const now = Math.floor(Date.now() / 1000);

  const cols = weeks.length;
  const width = PAD_L + cols * PITCH - GAP;
  const height = PAD_T + 7 * PITCH - GAP;

  const svg = svgEl("svg", {
    class: "gh-grid",
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": `Commit heatmap: ${plural(total, "commit", "commits")} in the last year across ${plural(repoCount, "repository", "repositories")}.`,
  });

  // Mon, Wed, Fri only - all seven crowd a column 11 units wide.
  [1, 3, 5].forEach((row) => {
    const label = svgEl("text", { class: "gh-axis", x: 0, y: PAD_T + row * PITCH + CELL - 2 });
    label.textContent = WEEKDAYS[row];
    svg.appendChild(label);
  });

  let lastMonth = -1;
  let lastLabel = -9;
  weeks.forEach((week, col) => {
    const month = new Date(week.week * 1000).getUTCMonth();
    // Three clear columns between labels, and none hanging off the last one.
    if (month !== lastMonth && lastMonth !== -1 && col - lastLabel >= 3 && col < cols - 2) {
      const label = svgEl("text", { class: "gh-axis", x: PAD_L + col * PITCH, y: 9 });
      label.textContent = MONTHS[month];
      svg.appendChild(label);
      lastLabel = col;
    }
    lastMonth = month;
  });

  weeks.forEach((week, col) => {
    week.days.forEach((n, row) => {
      const ts = week.week + row * 86400;
      if (ts > now) return; // the rest of this week has not happened yet
      const cell = svgEl("rect", {
        class: `gh-cell l${level(n)}`,
        x: PAD_L + col * PITCH,
        y: PAD_T + row * PITCH,
        width: CELL,
        height: CELL,
        rx: 2,
      });
      cell.style.setProperty("--c", col); // staggers the entrance, column by column
      cell.dataset.count = n;
      cell.dataset.when = dayStamp(ts);
      svg.appendChild(cell);
    });
  });

  const scroller = document.createElement("div");
  scroller.className = "gh-scroll";
  scroller.appendChild(svg);

  const foot = document.createElement("div");
  foot.className = "gh-foot";

  const idle = `${plural(total, "commit", "commits")} in the last year · ${plural(repoCount, "repository", "repositories")}`;
  const readout = document.createElement("p");
  readout.className = "gh-readout";
  readout.textContent = idle;

  const legend = document.createElement("p");
  legend.className = "gh-legend";
  legend.appendChild(document.createTextNode("less"));
  const key = svgEl("svg", {
    class: "gh-key",
    viewBox: `0 0 ${5 * PITCH - GAP} ${CELL}`,
    width: 5 * PITCH - GAP,
    height: CELL,
    "aria-hidden": "true",
  });
  for (let i = 0; i < 5; i++) {
    key.appendChild(
      svgEl("rect", { class: `gh-cell l${i}`, x: i * PITCH, y: 0, width: CELL, height: CELL, rx: 2 })
    );
  }
  legend.appendChild(key);
  legend.appendChild(document.createTextNode("more"));

  foot.appendChild(readout);
  foot.appendChild(legend);

  // One listener on the grid rather than 364 on the cells.
  svg.addEventListener("pointerover", (e) => {
    const cell = e.target;
    if (!cell.classList || !cell.classList.contains("gh-cell")) return;
    const n = Number(cell.dataset.count);
    readout.textContent = `${n === 0 ? "no commits" : plural(n, "commit", "commits")} · ${cell.dataset.when}`;
    readout.classList.add("is-hot");
  });
  svg.addEventListener("pointerleave", () => {
    readout.textContent = idle;
    readout.classList.remove("is-hot");
  });

  into.appendChild(scroller);
  into.appendChild(foot);

  // On a narrow screen the grid overflows; open it on the recent end.
  scroller.scrollLeft = scroller.scrollWidth;
}

/* ---------- the list ---------- */

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

/* ---------- cache ---------- */

/* Sixteen-odd requests per view is rude against a 60/hour unauthenticated
   limit, and the graph only moves once a day, so a visitor pays for them once
   and not again for six hours. localStorage where it exists, the session
   otherwise, and nothing at all in the browsers that block both. */
function store() {
  try {
    if (window.localStorage) return window.localStorage;
  } catch (e) {
    /* blocked - fall through to the session */
  }
  try {
    return window.sessionStorage;
  } catch (e) {
    return null;
  }
}

function readBox() {
  const shelf = store();
  if (!shelf) return null;
  try {
    const raw = shelf.getItem(CACHE_KEY);
    if (!raw) return null;
    const box = JSON.parse(raw);
    return box && box.data ? box : null;
  } catch (e) {
    return null;
  }
}

function readCache() {
  const box = readBox();
  if (!box || Date.now() - box.at > (box.ttl || CACHE_TTL)) return null;
  return box.data;
}

function yearTotal(data) {
  return (data.weeks || []).reduce(
    (sum, week) => sum + week.days.reduce((a, b) => a + b, 0),
    0
  );
}

/* Pushing to a repo invalidates its stats, and GitHub answers 202 until it has
   added them up again - so a visit made minutes after a push can swap a full
   year for a nearly empty one. Sit on the last fuller answer instead, but not
   for more than a day, or a genuinely quiet year could never come back down. */
function keepFullerYear(data) {
  if (!data.thin) return data;
  const box = readBox();
  if (!box) return data;
  // Carried forward, not the time it was last written - every thin visit
  // rewrites the cache, so the box's own stamp would never grow old.
  const asOf = box.data.asOf || box.at;
  if (Date.now() - asOf > CACHE_REUSE) return data;
  if (yearTotal(box.data) <= yearTotal(data)) return data;
  return {
    ...data,
    asOf,
    weeks: box.data.weeks,
    repoCount: Math.max(data.repoCount || 0, box.data.repoCount || 0),
  };
}

function writeCache(data) {
  const shelf = store();
  if (!shelf) return;
  try {
    const ttl = data.thin ? CACHE_TTL_THIN : CACHE_TTL;
    shelf.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), ttl, data }));
  } catch (e) {
    /* over quota or blocked - not worth surfacing */
  }
}

function ago(ts) {
  const m = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (m < 60) return `${m} minute${m > 1 ? "s" : ""} ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hour${h > 1 ? "s" : ""} ago`;
  return `${Math.round(h / 24)} days ago`;
}

/* ---------- run ---------- */

window.addEventListener("DOMContentLoaded", async () => {
  const into = document.getElementById("commit-feed");
  const graphInto = document.getElementById("commit-graph");
  if (!into) return;

  const paint = (data) => {
    if (graphInto) renderGraph(data.weeks || [], graphInto, data.repoCount || 0);
    renderCommits(data.commits || [], into);
    const lc = document.getElementById("last-change");
    const top = (data.commits || [])[0];
    if (lc && top) lc.textContent = "Last change " + relativeDate(top.date) + " — " + top.message.split("\n")[0];
  };

  if (!GH_USER) {
    into.appendChild(
      statusLine("Set GH_USER in commits.js to your GitHub username and this fills itself in.")
    );
    return;
  }

  into.appendChild(statusLine("Loading recent commits…"));

  const cached = readCache();
  if (cached) {
    paint(cached);
    return;
  }

  try {
    const data = keepFullerYear(await fetchEverything());
    paint(data);
    writeCache(data);
  } catch (err) {
    if (graphInto) graphInto.textContent = "";
    into.textContent = "";
    // GitHub said no, but a copy past its sell-by is still better than a
    // blank section: show it, and say how old it is.
    const stale = readBox();
    if (stale) {
      paint(stale.data);
      into.appendChild(
        statusLine(
          `GitHub is not answering just now, so this is the list from ${ago(stale.at)}.`
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
