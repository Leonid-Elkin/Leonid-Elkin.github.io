// Same interface as Engine (readyPromise, analyse(fen, depth, onProgress),
// stop(), error) but proxies to the Stockfish worker living in the
// extension's offscreen document. See offscreen/engine-host.js.

export class RemoteEngine {
  constructor({ onError, onStatus } = {}) {
    this.onError = onError || (() => {});
    this.onStatus = onStatus || (() => {});
    this.ready = false;
    this.error = null;
    this.readyPromise = new Promise((res, rej) => { this._resolveReady = res; this._rejectReady = rej; });
    this.pending = new Map(); // id -> { resolve, onProgress }
    this.nextId = 1;
    this._connect();
  }

  async _connect() {
    try {
      this.onStatus("starting engine host…");
      const r = await chrome.runtime.sendMessage({ type: "movegrade:ensure-engine" });
      if (!r || !r.ok) throw new Error((r && r.error) || "no reply from background");
    } catch (e) {
      return this._fail("could not start engine host: " + e.message);
    }
    this.port = chrome.runtime.connect({ name: "movegrade-engine" });
    this.port.onMessage.addListener((m) => this._onMessage(m));
    this.port.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError;
      if (!this.error) this._fail("engine host disconnected" + (err ? ": " + err.message : ""));
    });
    this._startupTimer = setTimeout(() => {
      if (!this.ready && !this.error) this._fail("engine host did not become ready within 30s");
    }, 30000);
  }

  _fail(msg) {
    this.error = msg;
    this.onError(msg);
    if (!this.ready) this._rejectReady(new Error(msg));
    for (const [, p] of this.pending) p.resolve(null);
    this.pending.clear();
  }

  _onMessage(m) {
    if (m.type === "ready") {
      this.ready = true;
      clearTimeout(this._startupTimer);
      this._resolveReady();
    } else if (m.type === "error") {
      this._fail(m.message);
    } else if (m.type === "progress") {
      const p = this.pending.get(m.id);
      if (p && p.onProgress) p.onProgress(m.snapshot);
    } else if (m.type === "result") {
      const p = this.pending.get(m.id);
      if (p) { this.pending.delete(m.id); p.resolve(m.result); }
    }
  }

  analyse(fen, depth, onProgress) {
    return new Promise((resolve) => {
      if (this.error || !this.port) return resolve(null);
      const id = this.nextId++;
      // a newer request supersedes anything still in flight from this panel
      for (const [oldId, p] of this.pending) { p.resolve(null); this.pending.delete(oldId); }
      this.pending.set(id, { resolve, onProgress });
      this.port.postMessage({ type: "analyse", id, fen, depth });
    });
  }

  stop() {
    if (this.port && !this.error) this.port.postMessage({ type: "stop" });
  }
}
