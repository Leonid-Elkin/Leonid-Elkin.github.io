/* The docket - "currently", pinned under the name.
 *
 * A public surface with a private latch. Anyone may press Edit and type in it:
 * rewrite the lines, strike them, add their own. None of it leaves their
 * browser, because Save asks for the plate first and the plate is mine.
 * Vandalism that does not survive a reload is not vandalism; publishing is the
 * part that needs a key.
 *
 * There is no server behind this site - it is flat files on a static host - so
 * a successful save does two things at once:
 *
 *   1. writes the lines to localStorage, so the pad stays right in the browser
 *      that set it, and
 *   2. copies the same lines out as ready-to-paste markup, so the canonical
 *      copy in index.html can be updated and committed. That commit is what
 *      every other visitor reads.
 *
 * The stored copy remembers which markup it was set against. When index.html
 * moves on, the stored copy is dropped: committed beats cached, always.
 *
 * The plate is a latch, not a lock. The check runs in this file, in the open,
 * and anyone with devtools can walk around it. It keeps out passers-by, and
 * the only thing behind it is a list of what I am doing.
 */

(function () {
  const pad = document.querySelector("[data-pad]");
  if (!pad) return;

  const list = pad.querySelector("[data-pad-list]");
  const status = pad.querySelector("[data-pad-status]");
  const count = pad.querySelector("[data-pad-count]");
  const plate = pad.querySelector("[data-pad-plate]");
  const pw = pad.querySelector("[data-pad-pw]");

  const btn = {
    edit: pad.querySelector("[data-pad-edit]"),
    add: pad.querySelector("[data-pad-add]"),
    save: pad.querySelector("[data-pad-save]"),
    cancel: pad.querySelector("[data-pad-cancel]"),
    print: pad.querySelector("[data-pad-print]"),
  };

  const KEY = "le.pad.v1";
  const MAX = 10;      /* a to-do list past ten items is a confession */
  const LEN = 120;     /* one printed line, no more */

  /* The plate itself is never in this file - only what it hashes to. */
  const PLATE = "19a10vh";

  /* FNV-1a, 32-bit, printed in base 36. Not a password hash and not pretending
     to be one; it exists so the word is not sitting in plain view of anyone
     who opens this file out of idle curiosity. */
  function fnv(s) {
    let x = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      x ^= s.charCodeAt(i);
      x = Math.imul(x, 0x01000193) >>> 0;
    }
    return (x >>> 0).toString(36);
  }

  /* ---------- reading and drawing the lines ---------- */

  function read() {
    return Array.from(list.querySelectorAll(".pad-line"))
      .map((n) => n.textContent.replace(/\s+/g, " ").trim().slice(0, LEN))
      .filter(Boolean);
  }

  function row(text) {
    const li = document.createElement("li");

    const line = document.createElement("span");
    line.className = "pad-line";
    line.textContent = text;
    line.contentEditable = editing ? "true" : "false";
    line.spellcheck = false;

    const drop = document.createElement("button");
    drop.type = "button";
    drop.className = "pad-drop";
    drop.setAttribute("aria-label", "Strike this line");
    drop.textContent = "×";
    drop.addEventListener("click", () => {
      li.remove();
      tally();
      focusLast();
    });

    li.append(line, drop);
    return li;
  }

  function render(ls) {
    list.textContent = "";
    ls.forEach((t) => list.appendChild(row(t)));
    tally();
  }

  /* The running count in the head. The numbers down the left are a CSS
     counter, so striking a line renumbers the rest on its own. */
  function tally() {
    if (count) count.textContent = String(list.children.length).padStart(2, "0");
  }

  function say(text, hot) {
    if (!status) return;
    status.textContent = text;
    status.parentElement.classList.toggle("hot", !!hot);
  }

  function focusLast() {
    if (!editing) return;
    const lines = list.querySelectorAll(".pad-line");
    const last = lines[lines.length - 1];
    if (!last) return;
    last.focus();
    /* drop the caret at the end of the line rather than the start */
    const r = document.createRange();
    r.selectNodeContents(last);
    r.collapse(false);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  /* ---------- what the pad currently holds ---------- */

  /* whatever index.html shipped, and a fingerprint of it */
  const source = read();
  const stamp = fnv(source.join(" "));

  let lines = source.slice();
  let editing = false;
  let held = null;

  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw);
      if (o && Array.isArray(o.lines) && o.from === stamp) {
        held = o;
        lines = o.lines.slice();
      } else {
        /* the file has been edited and committed since - the cache is stale */
        localStorage.removeItem(KEY);
      }
    }
  } catch (e) {
    /* storage off, private window, quota. The pad works without it. */
  }

  const IDLE = "Anyone may type here · printing needs the plate";
  const KEPT = () => "Set " + held.at + ", in this browser · anyone may type here";

  render(lines);
  say(held ? KEPT() : IDLE);

  /* ---------- edit mode ---------- */

  function setMode(on) {
    editing = on;
    pad.classList.toggle("editing", on);
    list.querySelectorAll(".pad-line").forEach((n) => {
      n.contentEditable = on ? "true" : "false";
    });
    btn.edit.hidden = on;
    btn.add.hidden = !on;
    btn.save.hidden = !on;
    btn.cancel.hidden = !on;
    if (!on) shutPlate();
  }

  btn.edit.addEventListener("click", () => {
    setMode(true);
    say("Type freely. Nothing leaves this browser until the plate matches.");
    focusLast();
  });

  btn.cancel.addEventListener("click", () => {
    render(lines);
    setMode(false);
    say(held ? KEPT() : "Discarded · back to the printed copy");
  });

  btn.add.addEventListener("click", () => {
    if (list.children.length >= MAX) {
      say("Ten lines is already more than anyone finishes.", true);
      return;
    }
    list.appendChild(row(""));
    tally();
    focusLast();
  });

  /* Enter opens the next line rather than a paragraph tag; Escape backs out.
     Paste arrives as plain text - a pad that accepts styled markup is a pad
     that eventually accepts a <script>. */
  list.addEventListener("keydown", (e) => {
    if (!editing) return;
    if (e.key === "Enter") {
      e.preventDefault();
      btn.add.click();
    } else if (e.key === "Escape") {
      e.preventDefault();
      btn.cancel.click();
    }
  });

  list.addEventListener("paste", (e) => {
    if (!editing) return;
    e.preventDefault();
    const src = e.clipboardData || window.clipboardData;
    const text = (src ? src.getData("text") : "").replace(/\s+/g, " ");
    document.execCommand("insertText", false, text.slice(0, LEN));
  });

  /* ---------- the plate ---------- */

  function shutPlate() {
    plate.hidden = true;
    pw.value = "";
    pad.classList.remove("bad");
  }

  btn.save.addEventListener("click", () => {
    if (plate.hidden) {
      plate.hidden = false;
      say("The plate, then.");
    }
    pw.focus();
  });

  btn.print.addEventListener("click", attempt);

  pw.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      attempt();
    } else if (e.key === "Escape") {
      e.preventDefault();
      shutPlate();
      say("Type freely. Nothing leaves this browser until the plate matches.");
    }
  });

  function attempt() {
    const ok = fnv("press:" + pw.value.trim().toLowerCase()) === PLATE;
    pw.value = "";
    if (!ok) {
      pad.classList.add("bad");
      setTimeout(() => pad.classList.remove("bad"), 420);
      say("That plate does not match. Nothing was printed.", true);
      pw.focus();
      return;
    }
    commit();
  }

  function commit() {
    lines = read().slice(0, MAX);
    if (!lines.length) lines = ["[ the pad is empty ]"];
    render(lines);
    setMode(false);

    const at = new Date().toISOString().slice(0, 10);
    held = { lines: lines.slice(), at: at, from: stamp };
    try {
      localStorage.setItem(KEY, JSON.stringify(held));
    } catch (e) {
      /* nothing to do about it; the clipboard copy below is the real save */
    }

    /* The half that outlives this browser: the same lines as markup, ready to
       drop into index.html between the <ol> tags and commit. */
    copy(markup(lines)).then(
      () => say("Printed " + at + " · markup copied — paste it into index.html and commit"),
      () => say("Printed " + at + " · held in this browser only; index.html is unchanged", true)
    );
  }

  function copy(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
      }
    } catch (e) {
      /* fall through to the rejection below */
    }
    return Promise.reject(new Error("no clipboard"));
  }

  function markup(ls) {
    return ls
      .map((t) => '                        <li><span class="pad-line">' + esc(t) + "</span></li>")
      .join("\n");
  }

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
})();
