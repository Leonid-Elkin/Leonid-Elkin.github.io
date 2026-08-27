/* judge-worker.js - runs and checks a solution off the main thread.
 *
 * Two jobs, one worker:
 *   {op:"check", lang, code, id}          -> {op:"check", id, errors:[...]}
 *   {op:"run", lang, code, mode, cases}   -> a stream of "out", then "done"
 *
 * Python goes through Pyodide; JavaScript runs here directly, which is safe
 * enough because a worker has no DOM and the whole page is static anyway.
 * The stop button terminates the worker - that is the only way to interrupt a
 * brute force that has decided to take a fortnight. Pyodide reloads from the
 * HTTP cache afterwards, so the second boot is quick.
 */

const PYODIDE_VERSION = "0.26.4";
const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v" + PYODIDE_VERSION + "/full/";

let pyReady = null;

function bootPython() {
  if (!pyReady) {
    postMessage({ op: "status", text: "loading python" });
    importScripts(PYODIDE_URL + "pyodide.js");
    pyReady = loadPyodide({ indexURL: PYODIDE_URL }).then((py) => {
      py.setStdout({ batched: (s) => postMessage({ op: "out", text: s + "\n" }) });
      py.setStderr({ batched: (s) => postMessage({ op: "out", text: s + "\n", err: true }) });
      py.runPython(PY_SUPPORT);
      return py;
    });
  }
  return pyReady;
}

/* ------------------------------------------------------------------
   The Python side of the harness: LeetCode's own scaffolding types,
   the array <-> structure conversions it does invisibly, and a runner
   that reads the signature to decide which conversion each argument
   needs.
   ------------------------------------------------------------------ */

const PY_SUPPORT = `
import builtins, inspect, json, sys, typing, collections, heapq, math, bisect, itertools, functools, re, string, random
from typing import List, Optional, Dict, Set, Tuple, Any, Union, Deque, Callable
from collections import defaultdict, Counter, deque, OrderedDict, namedtuple

class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next
    def __repr__(self):
        return "ListNode(%r)" % (_elk_list_to_array(self),)

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right
    def __repr__(self):
        return "TreeNode(%r)" % (_elk_tree_to_array(self),)

class Node:
    def __init__(self, val=0, neighbors=None, children=None, next=None, left=None, right=None, random=None):
        self.val = val
        self.neighbors = neighbors if neighbors is not None else []
        self.children = children if children is not None else []
        self.next = next
        self.left = left
        self.right = right
        self.random = random

for _n in ("ListNode", "TreeNode", "Node", "List", "Optional", "Dict", "Set", "Tuple",
           "Any", "Union", "Deque", "Callable", "defaultdict", "Counter", "deque",
           "OrderedDict", "heapq", "bisect", "itertools", "functools", "math"):
    setattr(builtins, _n, globals()[_n])


def _elk_array_to_list(arr):
    if arr is None:
        return None
    head = tail = None
    for v in arr:
        node = ListNode(v)
        if head is None:
            head = tail = node
        else:
            tail.next = node
            tail = node
    return head


def _elk_list_to_array(node, limit=10000):
    out = []
    seen = set()
    while node is not None and len(out) < limit:
        if id(node) in seen:
            out.append("...cycle")
            break
        seen.add(id(node))
        out.append(node.val)
        node = node.next
    return out


def _elk_array_to_tree(arr):
    if not arr:
        return None
    it = iter(arr)
    root = TreeNode(next(it))
    queue = deque([root])
    while queue:
        node = queue.popleft()
        try:
            left = next(it)
        except StopIteration:
            break
        if left is not None:
            node.left = TreeNode(left)
            queue.append(node.left)
        try:
            right = next(it)
        except StopIteration:
            break
        if right is not None:
            node.right = TreeNode(right)
            queue.append(node.right)
    return root


def _elk_tree_to_array(root):
    if root is None:
        return []
    out = []
    queue = deque([root])
    while queue:
        node = queue.popleft()
        if node is None:
            out.append(None)
            continue
        out.append(node.val)
        queue.append(node.left)
        queue.append(node.right)
    while out and out[-1] is None:
        out.pop()
    return out


def _elk_convert(value, annotation, shape=None):
    """LeetCode hands linked lists and trees to you as objects but writes the
    example as an array. Which one an argument wants is decided by the shape
    the site worked out from the original stub, and by the annotation only if
    that is missing - typing.Optional[ListNode] has __name__ 'Optional', so
    the whole repr has to be searched, not just the name."""
    if shape == "ListNode":
        return _elk_array_to_list(value)
    if shape == "TreeNode":
        return _elk_array_to_tree(value)
    if shape is not None:
        return value
    text = ""
    if annotation is not inspect.Parameter.empty:
        text = "%s %s" % (getattr(annotation, "__name__", ""), annotation)
    if "ListNode" in text:
        return _elk_array_to_list(value)
    if "TreeNode" in text:
        return _elk_array_to_tree(value)
    return value


def _elk_serialise(value):
    if isinstance(value, ListNode):
        return _elk_list_to_array(value)
    if isinstance(value, TreeNode):
        return _elk_tree_to_array(value)
    if isinstance(value, (set, frozenset)):
        return sorted(value, key=repr)
    if isinstance(value, tuple):
        return [_elk_serialise(v) for v in value]
    if isinstance(value, list):
        return [_elk_serialise(v) for v in value]
    return value


def _elk_solve(entry, raw_cases, shapes=None):
    """Run one case per group of argument lines, the way the site sends them."""
    if "Solution" not in globals() and "Solution" not in dir(builtins):
        raise RuntimeError("no class Solution found - the runner calls Solution()." + (entry or "?"))
    cls = globals().get("Solution") or getattr(builtins, "Solution")
    results = []
    for raw in raw_cases:
        instance = cls()
        method = getattr(instance, entry, None)
        if method is None:
            names = [n for n in dir(instance) if not n.startswith("_")]
            raise RuntimeError("Solution has no method %r (found: %s)" % (entry, ", ".join(names)))
        signature = inspect.signature(method)
        params = list(signature.parameters.values())
        args = []
        for index, line in enumerate(raw):
            value = json.loads(line) if line.strip() != "" else None
            annotation = params[index].annotation if index < len(params) else inspect.Parameter.empty
            shape = shapes[index] if shapes and index < len(shapes) else None
            args.append(_elk_convert(value, annotation, shape))
        out = method(*args)
        if out is None and args:
            # "modify nums in-place and return nothing" - the answer is argument one
            out = args[0]
        results.append(_elk_serialise(out))
    return json.dumps(results, default=str)
`;

/* ------------------------------------------------------------------
   The JavaScript side of the same harness.
   ------------------------------------------------------------------ */

const JS_SUPPORT = `
function ListNode(val, next) { this.val = (val === undefined ? 0 : val); this.next = (next === undefined ? null : next); }
function TreeNode(val, left, right) {
  this.val = (val === undefined ? 0 : val);
  this.left = (left === undefined ? null : left);
  this.right = (right === undefined ? null : right);
}
function _Node(val, children) { this.val = val; this.children = children || []; }
var Node = _Node;

function __arrayToList(arr) {
  if (!arr) return null;
  var head = null, tail = null;
  for (var i = 0; i < arr.length; i++) {
    var node = new ListNode(arr[i]);
    if (!head) { head = tail = node; } else { tail.next = node; tail = node; }
  }
  return head;
}
function __listToArray(node) {
  var out = [], seen = new Set();
  while (node && out.length < 10000) {
    if (seen.has(node)) { out.push("...cycle"); break; }
    seen.add(node);
    out.push(node.val);
    node = node.next;
  }
  return out;
}
function __arrayToTree(arr) {
  if (!arr || !arr.length) return null;
  var root = new TreeNode(arr[0]), queue = [root], i = 1;
  while (queue.length && i < arr.length) {
    var node = queue.shift();
    if (i < arr.length) { var l = arr[i++]; if (l !== null && l !== undefined) { node.left = new TreeNode(l); queue.push(node.left); } }
    if (i < arr.length) { var r = arr[i++]; if (r !== null && r !== undefined) { node.right = new TreeNode(r); queue.push(node.right); } }
  }
  return root;
}
function __treeToArray(root) {
  if (!root) return [];
  var out = [], queue = [root];
  while (queue.length) {
    var node = queue.shift();
    if (!node) { out.push(null); continue; }
    out.push(node.val);
    queue.push(node.left);
    queue.push(node.right);
  }
  while (out.length && out[out.length - 1] === null) out.pop();
  return out;
}
function __serialise(value) {
  if (value instanceof ListNode) return __listToArray(value);
  if (value instanceof TreeNode) return __treeToArray(value);
  if (Array.isArray(value)) return value.map(__serialise);
  if (value instanceof Set) return Array.from(value).sort();
  return value;
}
`;

/* ------------------------------------------------------------------
   checking
   ------------------------------------------------------------------ */

async function checkPython(code) {
  const py = await bootPython();
  py.globals.set("_elk_src", code);
  const result = py.runPython(
    "import json\n" +
    "def _elk_check(src):\n" +
    "    try:\n" +
    "        compile(src, '<solution>', 'exec')\n" +
    "    except SyntaxError as e:\n" +
    "        return json.dumps([{'line': e.lineno or 1, 'ch': (e.offset or 1) - 1, 'message': e.msg, 'severity': 'error'}])\n" +
    "    except ValueError as e:\n" +
    "        return json.dumps([{'line': 1, 'ch': 0, 'message': str(e), 'severity': 'error'}])\n" +
    "    return '[]'\n" +
    "_elk_check(_elk_src)"
  );
  return JSON.parse(result);
}

function checkJavaScript(code) {
  try {
    /* a Function body is parsed but never run, which is exactly the check */
    new Function(code);
    return [];
  } catch (err) {
    const line = /(?:<anonymous>|Function):(\d+)/.exec(String(err.stack || ""));
    return [{
      line: line ? Math.max(1, parseInt(line[1], 10) - 2) : 1,
      ch: 0,
      message: String(err.message || err),
      severity: "error",
    }];
  }
}

/* ------------------------------------------------------------------
   running
   ------------------------------------------------------------------ */

async function runPython(msg) {
  const py = await bootPython();
  postMessage({ op: "status", text: "running" });
  const started = Date.now();

  if (msg.mode === "script") {
    /* Project Euler: the file is the program. Any extra data files it opens
       are dropped in beside it under their own basename. */
    for (const file of msg.files || []) py.FS.writeFile(file.name, file.text);
    py.runPython(
      "import builtins, os\n" +
      "if not getattr(builtins, '_elk_open_patched', False):\n" +
      "    _real_open = builtins.open\n" +
      "    def open(path, *a, **k):\n" +
      "        p = str(path)\n" +
      "        if not os.path.exists(p):\n" +
      "            base = p.replace('\\\\', '/').split('/')[-1]\n" +
      "            if os.path.exists(base):\n" +
      "                p = base\n" +
      "        return _real_open(p, *a, **k)\n" +
      "    builtins.open = open\n" +
      "    builtins._elk_open_patched = True\n"
    );
    try {
      await py.runPythonAsync(msg.code);
    } catch (err) {
      if (!/SystemExit/.test(String(err))) throw err;
    }
    return { ms: Date.now() - started };
  }

  /* LeetCode: define the class, then call the entry point once per case */
  await py.runPythonAsync(msg.code);
  /* The arguments cross as Python objects rather than as text spliced into
     a source string - JSON's `null` is not a name Python knows. */
  py.globals.set("_elk_entry", msg.entry);
  py.globals.set("_elk_cases", py.toPy(msg.cases || []));
  py.globals.set("_elk_shapes", py.toPy(msg.shapes || []));
  const json = py.runPython("_elk_solve(_elk_entry, _elk_cases, _elk_shapes)");
  return { ms: Date.now() - started, results: JSON.parse(json) };
}

function runJavaScript(msg) {
  const started = Date.now();
  const lines = [];
  const capture = (...args) => {
    lines.push(args.map((a) => (typeof a === "string" ? a : safeStringify(a))).join(" "));
    postMessage({ op: "out", text: lines[lines.length - 1] + "\n" });
  };

  if (msg.mode === "script") {
    const fn = new Function("console", JS_SUPPORT + "\n" + msg.code);
    fn({ log: capture, error: capture, warn: capture, info: capture });
    return { ms: Date.now() - started };
  }

  const entry = msg.entry;
  const body =
    JS_SUPPORT + "\n" + msg.code + "\n" +
    "if (typeof " + entry + " !== 'function') throw new Error('no function named " + entry + " was defined');\n" +
    "return " + entry + ";";
  const solve = new Function("console", body)({ log: capture, error: capture, warn: capture, info: capture });

  const shapes = msg.shapes || [];
  const results = [];
  for (const raw of msg.cases) {
    const args = raw.map((line, index) => {
      const value = line.trim() === "" ? null : JSON.parse(line);
      const shape = shapes[index];
      if (shape === "ListNode") return globalThis.__elkArrayToList(value);
      if (shape === "TreeNode") return globalThis.__elkArrayToTree(value);
      return value;
    });
    let out = solve.apply(null, args);
    if (out === undefined && args.length) out = args[0];
    results.push(globalThis.__elkSerialise(out));
  }
  return { ms: Date.now() - started, results };
}

/* the JS harness helpers, hoisted once so runJavaScript can reach them */
(function installJsHelpers() {
  const helpers = new Function(JS_SUPPORT + "\nreturn {toList: __arrayToList, toTree: __arrayToTree, ser: __serialise};")();
  globalThis.__elkArrayToList = helpers.toList;
  globalThis.__elkArrayToTree = helpers.toTree;
  globalThis.__elkSerialise = helpers.ser;
})();

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (err) {
    return String(value);
  }
}

/* ------------------------------------------------------------------ */

onmessage = async (event) => {
  const msg = event.data || {};
  try {
    if (msg.op === "check") {
      const errors = msg.lang === "python" ? await checkPython(msg.code) : checkJavaScript(msg.code);
      postMessage({ op: "check", id: msg.id, errors: errors });
      return;
    }
    if (msg.op === "run") {
      const result = msg.lang === "python" ? await runPython(msg) : runJavaScript(msg);
      postMessage({ op: "done", ms: result.ms, results: result.results || null });
      return;
    }
    if (msg.op === "warm") {
      await bootPython();
      postMessage({ op: "status", text: "python ready" });
      return;
    }
  } catch (err) {
    postMessage({
      op: "err",
      id: msg.id,
      text: String((err && err.message) || err),
    });
  }
};
