/* Hybrid Tracker local-first store (IndexedDB) — v2.0
 *
 * - The whole app state (logs, KPIs, weigh-ins) is one snapshot record in IndexedDB,
 *   rewritten on every tap in the same transaction as its outbox entries.
 * - The snapshot is also mirrored to localStorage (legacy key) as a second copy, so an
 *   IndexedDB failure or a rollback to an older app version never loses logs.
 * - First load migrates the legacy localStorage state (v1.x) into IndexedDB. The legacy
 *   key is never deleted; its raw JSON is also stashed once in IndexedDB meta.
 * - The outbox holds one entry per remote row (key = table|primary-key), so repeated taps
 *   on the same set coalesce into the latest value. Each entry has a seq so an ack for an
 *   older push never deletes a newer queued write.
 */
(function () {
  'use strict';

  const DB_NAME = 'hybrid-tracker';
  const DB_VERSION = 1;
  const LEGACY_KEY = 'hybrid-tracker-v1';
  const LS_OUTBOX_KEY = 'hybrid-tracker-outbox-fallback';

  let db = null;
  let idbOk = false;
  let chain = Promise.resolve();
  const pendingKeys = new Set();
  const listeners = new Set();
  let memOutbox = new Map(); // only used when IndexedDB is unavailable
  let lastError = null;

  function reqP(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function txDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    });
  }

  function open() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB not supported'));
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('state')) d.createObjectStore('state');
        if (!d.objectStoreNames.contains('outbox')) d.createObjectStore('outbox', { keyPath: 'key' });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
  }

  function emit() { listeners.forEach((cb) => { try { cb(); } catch (_) {} }); }

  function readLegacy() {
    try {
      const raw = localStorage.getItem(LEGACY_KEY);
      if (!raw) return { raw: null, parsed: null };
      return { raw, parsed: JSON.parse(raw) };
    } catch (_) {
      return { raw: null, parsed: null };
    }
  }

  /** Union legacy (v1.x-written) logs into the IndexedDB state; IndexedDB wins on conflicts. */
  function mergeLegacy(base, legacy) {
    const out = JSON.parse(JSON.stringify(base));
    out.logs = out.logs || {};
    Object.keys(legacy.logs || {}).forEach((sid) => {
      const L = legacy.logs[sid];
      if (!out.logs[sid]) { out.logs[sid] = L; return; }
      const B = out.logs[sid];
      if (!B.notes && L.notes) B.notes = L.notes;
      if (!B.savedAt && L.savedAt) B.savedAt = L.savedAt;
      B.blocks = B.blocks || {};
      Object.keys(L.blocks || {}).forEach((bid) => {
        const lb = L.blocks[bid];
        if (!B.blocks[bid]) { B.blocks[bid] = lb; return; }
        const bb = B.blocks[bid];
        bb.sets = bb.sets || {};
        if (lb.done && !bb.done) bb.done = true;
        Object.keys(lb.sets || {}).forEach((setId) => {
          const ls = lb.sets[setId];
          if (!bb.sets[setId]) { bb.sets[setId] = ls; return; }
          const bs = bb.sets[setId];
          if (ls.done && !bs.done) bs.done = true;
          bs.fields = bs.fields || {};
          Object.keys(ls.fields || {}).forEach((f) => {
            if ((bs.fields[f] == null || bs.fields[f] === '') && ls.fields[f] !== '') bs.fields[f] = ls.fields[f];
          });
        });
      });
    });
    return out;
  }

  function writeMirror(state) {
    try { localStorage.setItem(LEGACY_KEY, JSON.stringify(state)); return true; } catch (_) { return false; }
  }

  async function idbGet(store, key) {
    const tx = db.transaction(store, 'readonly');
    return reqP(tx.objectStore(store).get(key));
  }

  async function init() {
    const legacy = readLegacy();
    let idbState = null;
    try {
      db = await open();
      idbOk = true;
      db.onversionchange = () => { try { db.close(); } catch (_) {} };
      idbState = await idbGet('state', 'main');
      const outbox = await reqP(db.transaction('outbox', 'readonly').objectStore('outbox').getAll());
      outbox.forEach((o) => pendingKeys.add(o.key));
    } catch (e) {
      idbOk = false;
      lastError = e;
      try {
        const raw = localStorage.getItem(LS_OUTBOX_KEY);
        if (raw) JSON.parse(raw).forEach((o) => { memOutbox.set(o.key, o); pendingKeys.add(o.key); });
      } catch (_) {}
    }

    let state = null;
    let source = 'empty';
    let migrated = false;
    const lsUpdated = (legacy.parsed && legacy.parsed.updatedAt) || 0;
    const idbUpdated = (idbState && idbState.updatedAt) || 0;

    if (idbState && legacy.parsed && !legacy.parsed.updatedAt) {
      // localStorage was last written by an older (v1.x) app version after migration:
      // union it in so nothing typed into the old version is lost.
      state = mergeLegacy(idbState, legacy.parsed); source = 'idb+legacy';
    } else if (idbState && (!legacy.parsed || idbUpdated >= lsUpdated)) {
      state = idbState; source = 'idb';
    } else if (legacy.parsed) {
      state = legacy.parsed; source = 'localStorage';
      migrated = !idbState; // first move from localStorage → IndexedDB
    }

    if (idbOk && legacy.raw) {
      // keep the untouched pre-migration JSON once, forever
      try {
        const existing = await idbGet('meta', 'legacy_localstorage_backup');
        if (!existing) {
          const tx = db.transaction('meta', 'readwrite');
          tx.objectStore('meta').put({ savedAt: new Date().toISOString(), raw: legacy.raw }, 'legacy_localstorage_backup');
          await txDone(tx);
        }
      } catch (_) {}
    }
    if (idbOk && state && (source === 'localStorage' || source === 'idb+legacy')) {
      state.updatedAt = state.updatedAt || Date.now();
      writeMirror(state);
      const tx = db.transaction(['state', 'meta'], 'readwrite');
      tx.objectStore('state').put(state, 'main');
      if (migrated) tx.objectStore('meta').put(new Date().toISOString(), 'migrated_from_localstorage_at');
      await txDone(tx);
    }
    return { state, source, migrated, idbOk };
  }

  /** Persist the full state snapshot + any outbox entries atomically. Serialized. */
  function commit(state, outboxItems) {
    const items = (outboxItems || []).map((o) => Object.assign({}, o, {
      seq: Date.now() + Math.random(),
      attempts: 0,
      nextAt: 0,
      queuedAt: new Date().toISOString(),
    }));
    items.forEach((o) => pendingKeys.add(o.key));
    const snapshot = JSON.parse(JSON.stringify(state));
    const mirrored = writeMirror(snapshot);
    const p = chain.then(async () => {
      if (!idbOk) {
        items.forEach((o) => memOutbox.set(o.key, o));
        try { localStorage.setItem(LS_OUTBOX_KEY, JSON.stringify([...memOutbox.values()])); } catch (_) {}
        if (!mirrored) throw new Error('Storage full');
        return;
      }
      const tx = db.transaction(['state', 'outbox'], 'readwrite');
      tx.objectStore('state').put(snapshot, 'main');
      const ob = tx.objectStore('outbox');
      items.forEach((o) => ob.put(o));
      await txDone(tx);
    });
    chain = p.catch((e) => { lastError = e; });
    p.then(emit, emit);
    return p;
  }

  async function outboxAll() {
    await chain;
    if (!idbOk) return [...memOutbox.values()];
    return reqP(db.transaction('outbox', 'readonly').objectStore('outbox').getAll());
  }

  /** Remove entries that were pushed, unless a newer write replaced them meanwhile. */
  async function outboxAck(items) {
    await chain;
    if (!idbOk) {
      items.forEach((i) => { const cur = memOutbox.get(i.key); if (cur && cur.seq === i.seq) { memOutbox.delete(i.key); pendingKeys.delete(i.key); } });
      try { localStorage.setItem(LS_OUTBOX_KEY, JSON.stringify([...memOutbox.values()])); } catch (_) {}
      emit();
      return;
    }
    const tx = db.transaction('outbox', 'readwrite');
    const ob = tx.objectStore('outbox');
    items.forEach((i) => {
      const r = ob.get(i.key);
      r.onsuccess = () => {
        const cur = r.result;
        if (cur && cur.seq === i.seq) { ob.delete(i.key); pendingKeys.delete(i.key); }
      };
    });
    await txDone(tx);
    emit();
  }

  async function outboxFail(items, err) {
    await chain;
    const msg = String((err && (err.message || err.error_description)) || err || 'error').slice(0, 300);
    const bump = (cur) => {
      cur.attempts = (cur.attempts || 0) + 1;
      // exponential backoff: 2s, 4s, 8s … capped at 5 min
      cur.nextAt = Date.now() + Math.min(300000, 2000 * Math.pow(2, cur.attempts - 1));
      cur.lastError = msg;
      return cur;
    };
    if (!idbOk) {
      items.forEach((i) => { const cur = memOutbox.get(i.key); if (cur && cur.seq === i.seq) bump(cur); });
      emit();
      return;
    }
    const tx = db.transaction('outbox', 'readwrite');
    const ob = tx.objectStore('outbox');
    items.forEach((i) => {
      const r = ob.get(i.key);
      r.onsuccess = () => { const cur = r.result; if (cur && cur.seq === i.seq) ob.put(bump(cur)); };
    });
    await txDone(tx);
    emit();
  }

  /** Drop queued writes for rows the cloud already has a newer version of. */
  async function outboxDrop(keys) {
    await chain;
    if (!keys || !keys.length) return;
    if (!idbOk) {
      keys.forEach((k) => { memOutbox.delete(k); pendingKeys.delete(k); });
      try { localStorage.setItem(LS_OUTBOX_KEY, JSON.stringify([...memOutbox.values()])); } catch (_) {}
      emit();
      return;
    }
    const tx = db.transaction('outbox', 'readwrite');
    const ob = tx.objectStore('outbox');
    keys.forEach((k) => { ob.delete(k); pendingKeys.delete(k); });
    await txDone(tx);
    emit();
  }

  async function getMeta(key) {
    if (!idbOk) { try { return JSON.parse(localStorage.getItem('hybrid-tracker-meta-' + key)); } catch (_) { return null; } }
    return idbGet('meta', key);
  }
  async function setMeta(key, value) {
    if (!idbOk) { try { localStorage.setItem('hybrid-tracker-meta-' + key, JSON.stringify(value)); } catch (_) {} return; }
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put(value, key);
    await txDone(tx);
  }

  async function requestPersist() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        const already = navigator.storage.persisted ? await navigator.storage.persisted() : false;
        if (already) return true;
        return await navigator.storage.persist();
      }
    } catch (_) {}
    return false;
  }

  window.HTStore = {
    init, commit, outboxAll, outboxAck, outboxFail, outboxDrop, getMeta, setMeta, requestPersist,
    pendingKeys,
    onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    get idbOk() { return idbOk; },
    get lastError() { return lastError; },
    flushed() { return chain; },
  };
})();
