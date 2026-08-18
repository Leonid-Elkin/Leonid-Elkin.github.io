/* Tab switching, with the hash kept in sync so a tab can be linked to.
 *
 * Two panels are deliberately lazy: the live map iframe is only given its
 * src when its tab is first opened (the front page must not pull in
 * dronestrikemap.com), and Durak only deals on its first open.
 */

const TABS = ["work", "skills", "live", "log"];

/* dronestrikemap.com currently refuses to be framed (`frame-ancestors 'none'`
   plus `X-Frame-Options: DENY`). Set this to true once that server allows
   https://leonid-elkin.github.io as a frame ancestor; the Live tab then swaps
   the poster for the real page. */
const EMBED = false;

function selectTab(name, { push = true } = {}) {
  if (!TABS.includes(name)) name = TABS[0];

  TABS.forEach((t) => {
    const tab = document.getElementById("tab-" + t);
    const panel = document.getElementById("panel-" + t);
    if (!tab || !panel) return;
    const on = t === name;
    tab.setAttribute("aria-selected", on ? "true" : "false");
    tab.tabIndex = on ? 0 : -1;
    panel.hidden = !on;
  });

  if (name === "live" && EMBED) {
    const f = document.getElementById("live-map");
    const poster = document.getElementById("live-poster");
    if (f && !f.src && f.dataset.src) {
      f.src = f.dataset.src;
      f.hidden = false;
      if (poster) poster.hidden = true;
    }
  }
  if (push) {
    const target = name === TABS[0] ? " " : "#" + name;
    history.replaceState(null, "", target === " " ? location.pathname : target);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const tablist = document.querySelector('[role="tablist"]');
  if (!tablist) return;

  TABS.forEach((t) => {
    const tab = document.getElementById("tab-" + t);
    if (tab) tab.addEventListener("click", () => selectTab(t));
  });

  // Left/right arrows walk the tab row, as expected of a tablist.
  tablist.addEventListener("keydown", (e) => {
    const i = TABS.indexOf(
      (document.activeElement && document.activeElement.id || "").replace("tab-", "")
    );
    if (i < 0) return;
    let next = null;
    if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
    if (e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = TABS.length - 1;
    if (next === null) return;
    e.preventDefault();
    selectTab(TABS[next]);
    const el = document.getElementById("tab-" + TABS[next]);
    if (el) el.focus();
  });

  selectTab((location.hash || "").replace("#", ""), { push: false });
});
