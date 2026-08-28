// Thin UCI wrapper around the Stockfish WASM worker.
//
// One search at a time. analyse() returns a promise resolving to
//   { bestMove, lines: [{ multipv, cp, mate, pv }], depth, ms, elapsed }
// with scores from the side-to-move's perspective (UCI convention).
// onProgress(snapshot) fires after every completed depth with the same shape,
// so callers can show provisional results while the search deepens.
// Calling analyse() while a search runs stops the old one first; the old
// promise resolves with whatever partial result it had.
//
// Searches are bounded by time, not by depth: `go movetime`. A fixed depth
// costs whatever the position happens to cost - depth 14 is instant in a
// bare king-and-pawn ending and takes many seconds in a sharp middlegame with
// six pieces hanging - so the badge arrived at wildly different times and the
// slider's number meant nothing a player could feel. A time budget is the
// promise you can actually keep: every move gets the same wall clock, and the
// engine spends it going as deep as that position allows.

export class Engine {
  constructor(workerUrl, { onError, onLog, nnue = true } = {}) {
    this.onError = onError || (() => {});
    this.onLog = onLog || (() => {});
    this.nnue = nnue;
    this.ready = false;
    this.readyPromise = new Promise((res, rej) => { this._resolveReady = res; this._rejectReady = rej; });
    this.current = null;
    this.queued = null;
    this.pendingIsready = [];

    try {
      this.worker = new Worker(workerUrl);
    } catch (e) {
      this._fail("could not start worker: " + e.message);
      return;
    }
    this.worker.onmessage = (e) => this._onLine(String(e.data));
    this.worker.onerror = (e) => this._fail("worker error: " + (e.message || e.filename || "unknown"));
    this.worker.onmessageerror = () => this._fail("worker message error");
    this.send("uci");
    this._startupTimer = setTimeout(() => {
      if (!this.ready) this._fail("engine did not answer 'uci' within 30s (wasm/NNUE failed to load?)");
    }, 30000);
  }

  _fail(msg) {
    this.error = msg;
    this.onError(msg);
    if (!this.ready) this._rejectReady(new Error(msg));
  }

  send(cmd) {
    if (this.worker) this.worker.postMessage(cmd);
  }

  isready() {
    return new Promise((res) => {
      this.pendingIsready.push(res);
      this.send("isready");
    });
  }

  _snapshot(cur) {
    const lines = cur.lines.filter(Boolean);
    return {
      bestMove: lines[0] ? lines[0].pv[0] : null,
      lines,
      depth: cur.maxDepthSeen,
      ms: cur.ms,
      elapsed: Date.now() - cur.started,
    };
  }

  _onLine(line) {
    if (!this.ready) this.onLog(line);
    if (line === "uciok") {
      this.send("setoption name MultiPV value 2");
      this.send("setoption name Hash value 32");
      // The single-threaded build ships with NNUE off; turning it on makes the
      // engine fetch the net file (next to the script) before answering isready.
      if (this.nnue) this.send("setoption name Use NNUE value true");
      this.send("isready");
      this.pendingIsready.push(() => {
        this.ready = true;
        clearTimeout(this._startupTimer);
        this._resolveReady();
      });
      return;
    }
    if (line === "readyok") {
      const r = this.pendingIsready.shift();
      if (r) r();
      return;
    }
    const cur = this.current;
    if (!cur) return;

    if (line.startsWith("info ") && line.includes(" pv ")) {
      const depth = +(/ depth (\d+)/.exec(line) || [])[1] || 0;
      const multipv = +(/ multipv (\d+)/.exec(line) || [])[1] || 1;
      const cpM = / score cp (-?\d+)/.exec(line);
      const mateM = / score mate (-?\d+)/.exec(line);
      const pv = line.split(" pv ")[1].trim().split(/\s+/);
      if (depth < cur.maxDepthSeen) return;
      if (depth > cur.maxDepthSeen) {
        // a new iteration started: report the completed previous one
        if (cur.maxDepthSeen > 0 && cur.onProgress) cur.onProgress(this._snapshot(cur));
        cur.maxDepthSeen = depth;
      }
      cur.lines[multipv - 1] = { multipv, depth, cp: cpM ? +cpM[1] : null, mate: mateM ? +mateM[1] : null, pv };
    } else if (line.startsWith("bestmove")) {
      const bm = line.split(/\s+/)[1];
      const result = this._snapshot(cur);
      if (bm && bm !== "(none)") result.bestMove = bm;
      this.current = null;
      cur.resolve(result);
      if (this.queued) {
        const q = this.queued;
        this.queued = null;
        q();
      }
    }
  }

  /** Search `fen` for `ms` milliseconds. */
  analyse(fen, ms, onProgress) {
    return new Promise((resolve) => {
      if (this.error) return resolve(null);
      const start = () => {
        this.current = { resolve, lines: [], maxDepthSeen: 0, onProgress, ms, started: Date.now() };
        this.send(`position fen ${fen}`);
        this.send(`go movetime ${Math.max(1, Math.round(ms))}`);
      };
      if (this.current) {
        // Preempt: whatever is queued behind the running search is stale.
        if (this.queued) this.queued.cancel();
        const q = () => start();
        q.cancel = () => resolve(null);
        this.queued = q;
        this.send("stop");
      } else {
        start();
      }
    });
  }

  stop() {
    if (this.current) this.send("stop");
  }

  terminate() {
    clearTimeout(this._startupTimer);
    if (this.worker) this.worker.terminate();
    this.worker = null;
  }
}
