/* The card stack in the corner.
 *
 * Durak used to be a titled section at the foot of the front page. It is now
 * unlabelled: a small stack of card backs in the bottom corner, which is the
 * one part of a portfolio nobody scans for information. That is the point -
 * finding it should feel like a discovery, not like reading a menu item.
 *
 * Three states:
 *   resting  five backs, squared up, no cursor change
 *   hovered  one word fades in - "deal?"
 *   dealt    the stack fans; a second click opens the board
 *
 * Nothing here touches durak.js. The stack is a collapsed entry point in
 * front of it; the game itself is untouched and only starts when asked.
 */

(function () {
  const FACES = [
    { r: "6", s: "♦", red: true },
    { r: "9", s: "♠", red: false },
    { r: "J", s: "♥", red: true },
    { r: "Q", s: "♣", red: false },
    { r: "K", s: "♦", red: true },
  ];

  function build() {
    const egg = document.getElementById("egg");
    if (!egg) return;

    const stack = egg.querySelector(".egg-stack");
    const hint = egg.querySelector(".egg-hint");
    const panel = document.getElementById("durak-panel");
    const closeBtn = panel && panel.querySelector(".panel-close");

    const cards = FACES.map((f, i) => {
      const c = document.createElement("div");
      c.className = "egg-card" + (f.red ? " red" : "");
      const top = document.createElement("span");
      top.className = "egg-pip";
      top.textContent = f.r + f.s;
      const mid = document.createElement("span");
      mid.className = "egg-suit";
      mid.textContent = f.s;
      c.append(top, mid);
      stack.appendChild(c);
      return c;
    });

    let dealt = false;

    /* Geometry lives here rather than in the stylesheet. The fan is a function
     * of the card's index and the current state, and keeping both cases in one
     * place is easier to reason about than a pair of calc() chains. */
    const NARROW = () => window.matchMedia("(max-width: 720px)").matches;

    function place() {
      const pitch = NARROW() ? 24 : 30;
      const mid = (cards.length - 1) / 2;
      cards.forEach((c, i) => {
        if (dealt) {
          c.style.right = 8 + i * pitch + "px";
          c.style.bottom = "14px";
          c.style.transform = "rotate(" + (i - mid) * 6 + "deg)";
        } else {
          c.style.right = 6 + i * 3 + "px";
          c.style.bottom = 6 + i * 3 + "px";
          c.style.transform = "rotate(0deg)";
        }
      });
    }

    function setDealt(next) {
      dealt = next;
      egg.classList.toggle("is-dealt", dealt);
      hint.textContent = dealt ? "play?" : "deal?";
      egg.setAttribute(
        "aria-label",
        dealt ? "Open the card game" : "A stack of cards. Deal them."
      );
      place();
    }

    window.addEventListener("resize", place);

    function openPanel() {
      if (!panel) return;
      panel.hidden = false;
      egg.hidden = true;
      /* durak.js exposes this; the board builds itself the first time only. */
      if (typeof window.startDurak === "function") window.startDurak();
      document.body.style.overflow = "hidden";
      if (closeBtn) closeBtn.focus();
    }

    function closePanel() {
      if (!panel) return;
      panel.hidden = true;
      egg.hidden = false;
      document.body.style.overflow = "";
      egg.focus();
    }

    egg.addEventListener("click", () => {
      if (!dealt) setDealt(true);
      else openPanel();
    });

    egg.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        egg.click();
      }
    });

    if (closeBtn) closeBtn.addEventListener("click", closePanel);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && panel && !panel.hidden) closePanel();
    });

    /* Clicking the backdrop, but not the board itself, closes it. */
    if (panel) {
      panel.addEventListener("click", (e) => {
        if (e.target === panel) closePanel();
      });
    }

    setDealt(false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
