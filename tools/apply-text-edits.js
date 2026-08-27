#!/usr/bin/env node
/* TEMPORARY companion to text-edit.js. Takes the text-edits.json that the
   in-page editor downloads and writes the new wording back into the source.
   Usage:  node tools/apply-text-edits.js ~/Downloads/text-edits.json [--dry]
   The browser hands us decoded text ("Skills & tools"), while the source may
   hold entities and line breaks ("Skills &amp;\n   tools"), so every edit is
   matched with a whitespace- and entity-tolerant pattern instead of a literal
   string. An edit that matches nothing, or matches twice, is reported and
   skipped rather than guessed at. */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const file = process.argv[2];
const dry = process.argv.includes("--dry");

if (!file) {
    console.error("usage: node tools/apply-text-edits.js <text-edits.json> [--dry]");
    process.exit(1);
}

const edits = JSON.parse(fs.readFileSync(file, "utf8"));

/* Characters the pages write as entities, mapped to every spelling we accept. */
const ENTITIES = {
    "&": ["&amp;"], "<": ["&lt;"], ">": ["&gt;"], '"': ["&quot;", "&#34;"],
    "'": ["&#39;", "&apos;"], "→": ["&rarr;", "&#8594;"],
    "←": ["&larr;"], "–": ["&ndash;"], "—": ["&mdash;"],
    "…": ["&hellip;"], "×": ["&times;"], "·": ["&middot;"],
    "©": ["&copy;"], "°": ["&deg;"], "’": ["&rsquo;", "&#8217;"],
    "‘": ["&lsquo;"], "“": ["&ldquo;"], "”": ["&rdquo;"],
    " ": ["&nbsp;"],
};

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function pattern(text) {
    let out = "";
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (/\s/.test(c)) {
            while (i + 1 < text.length && /\s/.test(text[i + 1])) i++;
            out += "(?:\\s|&nbsp;)+";
            continue;
        }
        const alts = [esc(c)].concat((ENTITIES[c] || []).map(esc));
        out += alts.length > 1 ? "(?:" + alts.join("|") + ")" : alts[0];
    }
    /* Do not let "THUNDER" match inside "THUNDERSTORM". */
    if (/^\w/.test(text)) out = "(?<![\\w-])" + out;
    if (/\w$/.test(text)) out = out + "(?![\\w-])";
    return new RegExp(out, "g");
}

/* Put back only what the source itself has to escape. */
function encode(text, sample) {
    let out = text.replace(/&/g, "&amp;");
    if (/[<>]/.test(sample) === false) out = out.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return out;
}

function sources() {
    const found = [];
    const walk = (dir, depth) => {
        for (const name of fs.readdirSync(dir)) {
            /* tools/ holds build scripts, never page copy - and this file itself
               quotes example wording that would otherwise look like a match. */
            if (name === ".git" || name === "node_modules" || name === "tools" ||
                name.startsWith(".")) continue;
            const full = path.join(dir, name);
            const stat = fs.statSync(full);
            if (stat.isDirectory()) {
                if (depth > 0) walk(full, depth - 1);
            } else if (/\.(html|js)$/.test(name) && name !== "text-edit.js") {
                found.push(full);
            }
        }
    };
    walk(ROOT, 1);
    return found;
}

const ALL = sources();
const cache = new Map();
const read = (f) => {
    if (!cache.has(f)) cache.set(f, fs.readFileSync(f, "utf8"));
    return cache.get(f);
};

/* Search the page the edit came from first, then everything else. */
function order(edit) {
    const own = path.join(ROOT, edit.file);
    return ALL.slice().sort((a, b) => (a === own ? -1 : b === own ? 1 : 0));
}

let applied = 0;
const problems = [];

for (const edit of edits) {
    if (!edit || !edit.before || edit.before === edit.after) continue;

    /* Where does this wording live? Grouped by file, because one page repeating
       a line (the ticker prints its list twice) is a rewrite-both, while two
       different files sharing it is a call we should not make for you. */
    const byFile = new Map();
    for (const f of order(edit)) {
        const re = pattern(edit.before);
        const text = read(f);
        let m;
        while ((m = re.exec(text))) {
            if (!byFile.has(f)) byFile.set(f, []);
            byFile.get(f).push({ index: m.index, match: m[0] });
        }
        if (byFile.has(path.join(ROOT, edit.file))) break;
    }

    if (byFile.size === 0) {
        problems.push(`not found  "${edit.before}" (${edit.file} ${edit.path})`);
        continue;
    }
    if (byFile.size > 1) {
        const where = [...byFile.keys()].map((f) => path.relative(ROOT, f)).join(", ");
        problems.push(`ambiguous  "${edit.before}" appears in ${where} - edit by hand`);
        continue;
    }

    const [target, hits] = [...byFile][0];
    let text = read(target);
    const first = text.slice(0, hits[0].index).split("\n").length;
    /* Back to front, so earlier offsets stay valid as the text length changes. */
    for (const hit of hits.slice().reverse()) {
        text = text.slice(0, hit.index) + encode(edit.after, hit.match) +
            text.slice(hit.index + hit.match.length);
    }
    cache.set(target, text);
    const times = hits.length > 1 ? ` (${hits.length}x)` : "";
    console.log(`${path.relative(ROOT, target)}:${first}${times}  "${edit.before}" -> "${edit.after}"`);
    applied++;
}

if (!dry) {
    const touched = new Set();
    for (const [f, text] of cache) {
        if (text !== fs.readFileSync(f, "utf8")) {
            fs.writeFileSync(f, text);
            touched.add(path.relative(ROOT, f));
        }
    }
    console.log(`\n${applied} edit(s) written to ${touched.size} file(s).`);
} else {
    console.log(`\n${applied} edit(s) would be written. (--dry)`);
}

if (problems.length) {
    console.log("\nSkipped:");
    problems.forEach((p) => console.log("  " + p));
}
