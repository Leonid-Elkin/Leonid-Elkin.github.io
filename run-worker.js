/* Runs one committed solution off the main thread, so a slow brute force
 * cannot freeze the page. The page posts {lang, code, files}; we post back
 * {kind: 'status'|'out'|'done'|'err'}. Killing the worker is the stop button.
 *
 * Python goes through Pyodide - CPython compiled to WebAssembly, fetched from
 * a CDN the first time. JavaScript just runs here: a worker has no DOM and the
 * code being run is the author's own, committed to this repo.
 *
 * Nothing else runs. A browser has no C++ compiler, and pretending otherwise
 * would mean a button that always fails.
 */

const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";

let ready = null;

function bootPython() {
  if (!ready) {
    importScripts(PYODIDE + "pyodide.js");
    ready = loadPyodide({ indexURL: PYODIDE }).then((py) => {
      py.setStdout({ batched: (s) => postMessage({ kind: "out", text: s + "\n" }) });
      py.setStderr({ batched: (s) => postMessage({ kind: "out", text: s + "\n" }) });
      return py;
    });
  }
  return ready;
}

async function runPython(code, files) {
  postMessage({ kind: "status", text: "loading python…" });
  const py = await bootPython();
  /* The solutions open their input by whatever path was on the author's disk
     years ago. Drop each file in by its basename and teach open() to fall
     back to it, so the file the author had still resolves. */
  for (const f of files || []) py.FS.writeFile(f.name, f.text);
  py.runPython(
    "import builtins, os\n" +
    "if not getattr(builtins, '_elk_patched', False):\n" +
    "    _open = builtins.open\n" +
    "    def open(path, *a, **k):\n" +
    "        p = str(path)\n" +
    "        if not os.path.exists(p):\n" +
    "            base = p.replace(chr(92), '/').split('/')[-1]\n" +
    "            if os.path.exists(base): p = base\n" +
    "        return _open(p, *a, **k)\n" +
    "    builtins.open = open\n" +
    "    builtins._elk_patched = True\n"
  );
  postMessage({ kind: "status", text: "running…" });
  const started = performance.now();
  try {
    await py.runPythonAsync(code);
  } catch (err) {
    /* a few solutions end with quit() - that is a finish, not a failure */
    if (!/SystemExit/.test(String(err))) throw err;
  }
  return Math.round(performance.now() - started);
}

async function runJavaScript(code, files) {
  postMessage({ kind: "status", text: "running…" });
  const say = (...parts) => postMessage({
    kind: "out",
    text: parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" ") + "\n",
  });
  const shim = {
    log: say, info: say, warn: say, error: say, debug: say,
    table: say, dir: say, trace: say,
    group: say, groupEnd: () => {}, time: () => {}, timeEnd: () => {},
  };
  /* The data files a solution might read, by basename */
  const box = {};
  (files || []).forEach((f) => { box[f.name] = f.text; });
  const started = performance.now();
  const fn = new Function("console", "readFile", code);
  await fn(shim, (name) => {
    if (!(name in box)) throw new Error("no data file called " + name);
    return box[name];
  });
  return Math.round(performance.now() - started);
}

onmessage = async (e) => {
  const { lang, code, files } = e.data;
  try {
    const ms = lang === "javascript"
      ? await runJavaScript(code, files)
      : await runPython(code, files);
    postMessage({ kind: "done", ms: ms });
  } catch (err) {
    postMessage({ kind: "err", text: String((err && err.message) || err) });
  }
};
