/* TEMPORARY authoring tool. Add ?edit=1 to any page (or press Ctrl+Shift+E) to
   turn every run of text on the page into something you can click and retype.
   Edits live in localStorage, so they survive a reload and you can keep judging
   the fit of the page while you work. When it reads right, hit Save patch and
   run: node tools/apply-text-edits.js <the downloaded file>
   Delete this file, tools/apply-text-edits.js and the script tags when done. */
(function () {
    "use strict";

    var KEY = "text-edit:" + page();
    var ON_KEY = "text-edit:on";
    var EDITABLE = "h1,h2,h3,h4,h5,h6,p,li,a,span,button,td,th,dt,dd,blockquote,figcaption,label,strong,em,small,summary,div";
    var edits = load();
    var live = false;
    var bar = null;

    function page() {
        var name = location.pathname.split("/").pop();
        return name || "index.html";
    }

    function load() {
        try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
    }

    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(edits)); } catch (e) { }
    }

    /* A stable-ish address for a node: tag plus its index among same-tag siblings,
       all the way up to <body>. Good enough for a page whose shape is not moving. */
    function pathOf(el) {
        var parts = [];
        while (el && el !== document.body) {
            var i = 1, sib = el;
            while ((sib = sib.previousElementSibling)) {
                if (sib.tagName === el.tagName) i++;
            }
            parts.unshift(el.tagName.toLowerCase() + ":" + i);
            el = el.parentElement;
        }
        return parts.join(">");
    }

    function nodeAt(path) {
        var el = document.body;
        var parts = path.split(">");
        for (var p = 0; p < parts.length && el; p++) {
            var bits = parts[p].split(":");
            var tag = bits[0].toUpperCase(), want = +bits[1], seen = 0, found = null;
            for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
                if (c.tagName === tag && ++seen === want) { found = c; break; }
            }
            el = found;
        }
        return el;
    }

    /* Only leaf-ish text: no element children, some visible words, and not part
       of the editor's own furniture or a canvas-driven widget. */
    function editable(el) {
        if (!el || el.closest("#text-edit-bar")) return false;
        if (el.closest("[data-no-edit],canvas,svg,script,style,code,pre")) return false;
        if (el.children.length) return false;
        var t = (el.textContent || "").trim();
        return t.length > 0 && t.length < 4000;
    }

    function apply() {
        Object.keys(edits).forEach(function (path) {
            var el = nodeAt(path);
            if (el && el.textContent !== edits[path].after) el.textContent = edits[path].after;
        });
    }

    function record(el) {
        var path = pathOf(el);
        var after = el.textContent.replace(/\s+/g, " ").trim();
        var before = el.getAttribute("data-edit-before");
        if (before === null) return;
        if (after === before) { delete edits[path]; }
        else { edits[path] = { before: before, after: after, tag: el.tagName.toLowerCase() }; }
        save();
        paint();
    }

    /* Remember the wording the source file still holds, so a later patch knows
       what to search for even after you have retyped a line three times. */
    function baseline(el) {
        if (el.hasAttribute("data-edit-before")) return;
        var known = edits[pathOf(el)];
        el.setAttribute("data-edit-before", known ? known.before
            : el.textContent.replace(/\s+/g, " ").trim());
    }

    function onFocus(e) {
        if (e.target.isContentEditable) baseline(e.target);
    }

    function onClick(e) {
        if (!live) return;
        if (e.target.closest("#text-edit-bar")) return;
        var el = e.target.closest(EDITABLE);
        if (!editable(el)) return;
        e.preventDefault();
        e.stopPropagation();
        if (el.isContentEditable) return;
        /* Stamp before focusing: a link or button is focused by the mousedown
           that precedes this click, so focus() below fires no focusin at all. */
        baseline(el);
        el.setAttribute("contenteditable", "plaintext-only");
        el.focus();
    }

    /* Blur is the tidy moment to save, but focus can be stolen by a carousel or
       a stray script, so keep a debounced save running while you type too. */
    var typing = null;
    function onInput(e) {
        if (!e.target.isContentEditable) return;
        clearTimeout(typing);
        typing = setTimeout(function () { record(e.target); }, 400);
    }

    function onBlur(e) {
        var el = e.target;
        if (!el.isContentEditable) return;
        clearTimeout(typing);
        el.removeAttribute("contenteditable");
        record(el);
    }

    function onKey(e) {
        if (e.ctrlKey && e.shiftKey && (e.key === "E" || e.key === "e")) {
            e.preventDefault();
            if (live) { stop(); } else { start(); }
            return;
        }
        if (!live) return;
        var el = document.activeElement;
        if (el && el.isContentEditable) {
            if (e.key === "Escape") { e.preventDefault(); el.blur(); }
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); el.blur(); }
        }
    }

    function count() { return Object.keys(edits).length; }

    function paint() {
        if (!bar) return;
        var n = count();
        bar.querySelector("[data-count]").textContent =
            n === 0 ? "no edits yet" : n + (n === 1 ? " edit" : " edits") + " on this page";
    }

    function collect() {
        var out = [];
        for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k.indexOf("text-edit:") !== 0 || k === ON_KEY) continue;
            var file = k.slice("text-edit:".length);
            var map;
            try { map = JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { continue; }
            Object.keys(map).forEach(function (path) {
                out.push({
                    file: file, path: path, tag: map[path].tag,
                    before: map[path].before, after: map[path].after
                });
            });
        }
        return out;
    }

    function download() {
        var all = collect();
        var blob = new Blob([JSON.stringify(all, null, 2)], { type: "application/json" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "text-edits.json";
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    }

    function reset() {
        edits = {};
        save();
        location.reload();
    }

    function resetAll() {
        var kill = [];
        for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k.indexOf("text-edit:") === 0) kill.push(k);
        }
        kill.forEach(function (k) { localStorage.removeItem(k); });
        location.reload();
    }

    function makeBar() {
        bar = document.createElement("div");
        bar.id = "text-edit-bar";
        bar.setAttribute("data-no-edit", "");
        bar.innerHTML =
            '<strong>Text edit</strong><span data-count></span>' +
            '<button type="button" data-act="save">Save patch</button>' +
            '<button type="button" data-act="reset">Undo page</button>' +
            '<button type="button" data-act="resetall">Undo all</button>' +
            '<button type="button" data-act="off">Exit</button>';
        var css = document.createElement("style");
        css.id = "text-edit-css";
        css.textContent =
            "#text-edit-bar{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);" +
            "z-index:2147483647;display:flex;gap:10px;align-items:center;padding:10px 14px;" +
            "background:#111;border:1px solid #ff2d16;border-radius:8px;color:#f4f4f4;" +
            "font:500 13px/1 ui-monospace,'JetBrains Mono',monospace;box-shadow:0 8px 30px rgba(0,0,0,.5)}" +
            "#text-edit-bar strong{color:#ff2d16;letter-spacing:.06em;text-transform:uppercase}" +
            "#text-edit-bar span{opacity:.7}" +
            "#text-edit-bar button{font:inherit;color:inherit;background:#1e1e1e;border:1px solid #3a3a3a;" +
            "border-radius:5px;padding:6px 10px;cursor:pointer}" +
            "#text-edit-bar button:hover{border-color:#ff2d16}" +
            "body.text-edit-live [contenteditable]{outline:2px solid #ff2d16;outline-offset:2px;cursor:text}";
        document.head.appendChild(css);
        document.body.appendChild(bar);
        bar.addEventListener("click", function (e) {
            var act = e.target.getAttribute && e.target.getAttribute("data-act");
            if (act === "save") download();
            if (act === "reset") reset();
            if (act === "resetall") resetAll();
            if (act === "off") stop();
        });
        paint();
    }

    function start() {
        live = true;
        try { localStorage.setItem(ON_KEY, "1"); } catch (e) { }
        document.body.classList.add("text-edit-live");
        if (!bar) { makeBar(); } else { bar.hidden = false; }
        paint();
    }

    function stop() {
        live = false;
        try { localStorage.removeItem(ON_KEY); } catch (e) { }
        document.body.classList.remove("text-edit-live");
        if (bar) bar.hidden = true;
        var open = document.querySelector("[contenteditable]");
        if (open) open.blur();
    }

    function boot() {
        apply();
        /* Half this site paints itself from JS, so re-apply when the DOM settles. */
        var timer = null;
        new MutationObserver(function () {
            clearTimeout(timer);
            timer = setTimeout(apply, 120);
        }).observe(document.body, { childList: true, subtree: true });

        document.addEventListener("click", onClick, true);
        document.addEventListener("focusin", onFocus, true);
        document.addEventListener("focusout", onBlur, true);
        document.addEventListener("input", onInput, true);
        document.addEventListener("keydown", onKey, true);

        var asked = /[?&]edit=1/.test(location.search) || location.hash === "#edit";
        var remembered = false;
        try { remembered = localStorage.getItem(ON_KEY) === "1"; } catch (e) { }
        if (asked || remembered) start();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
