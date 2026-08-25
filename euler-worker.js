/* Runs one Project Euler solution in Pyodide, off the main thread so a slow
 * brute-force cannot freeze the page. The page posts {code, files}; we post
 * back {kind: 'out'|'done'|'err', ...}. Killing the worker is the stop button.
 */

importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js");

let ready = null;

function boot() {
  if (!ready) {
    ready = loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/" }).then((py) => {
      py.setStdout({ batched: (s) => postMessage({ kind: "out", text: s + "\n" }) });
      py.setStderr({ batched: (s) => postMessage({ kind: "out", text: s + "\n" }) });
      return py;
    });
  }
  return ready;
}

onmessage = async (e) => {
  const { code, files } = e.data;
  try {
    postMessage({ kind: "status", text: "loading python…" });
    const py = await boot();
    // The solutions open their input by whatever path was on the author's disk;
    // drop each file in by its basename and teach open() to look there.
    for (const f of files || []) py.FS.writeFile(f.name, f.text);
    py.runPython(
      "import builtins, os\n" +
      "_open = builtins.open\n" +
      "def open(path, *a, **k):\n" +
      "    p = str(path)\n" +
      "    if not os.path.exists(p):\n" +
      "        base = p.replace('\\\\', '/').split('/')[-1]\n" +
      "        if os.path.exists(base): p = base\n" +
      "    return _open(p, *a, **k)\n" +
      "builtins.open = open\n"
    );
    postMessage({ kind: "status", text: "running…" });
    const t0 = performance.now();
    try {
      await py.runPythonAsync(code);
    } catch (err) {
      // a few solutions end with quit() - that is a finish, not a failure
      if (!/SystemExit/.test(String(err))) throw err;
    }
    postMessage({ kind: "done", ms: Math.round(performance.now() - t0) });
  } catch (err) {
    postMessage({ kind: "err", text: String(err && err.message || err) });
  }
};
