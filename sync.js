/* Hybrid Tracker outbox → Supabase sync — v2.0
 *
 * Local-only unless config.js has SUPABASE_URL + SUPABASE_ANON_KEY. When configured:
 * - supabase-js (vendored, no build step) is loaded lazily;
 * - sign-in is an email one-time code (or magic link) — RLS needs a real user;
 * - queued outbox rows are upserted per table whenever the app is open, comes back
 *   online / to the foreground, or after a tap (debounced), with exponential backoff;
 * - on sign-in / app open, remote rows are pulled and merged last-write-wins.
 */
(function () {
  'use strict';

  const SUPABASE_SRC = 'vendor/supabase-js-2.118.0.js';
  const CONFLICT = {
    sessions: 'user_id,session_key',
    set_logs: 'user_id,session_key,block_id,set_id',
    segment_logs: 'user_id,session_key,block_id,segment_id',
    weigh_ins: 'id',
  };
  const PULL_TABLES = ['sessions', 'set_logs', 'segment_logs', 'weigh_ins'];
  const CHUNK = 200;

  const cfg = window.HYBRID_CONFIG || {};
  const configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    String(cfg.SUPABASE_URL).trim() && String(cfg.SUPABASE_ANON_KEY).trim());

  let client = null;
  let loading = null;
  let session = null;
  let flushing = false;
  let again = false;
  let debounceTimer = null;
  let lastPullAt = 0;
  let hooks = { onStatus() {}, onPull() {} };
  const status = { state: configured ? 'starting' : 'local-only', pending: 0, lastSyncAt: null, error: null, email: null };

  function setStatus(patch) {
    Object.assign(status, patch);
    status.pending = window.HTStore ? window.HTStore.pendingKeys.size : 0;
    try { hooks.onStatus(Object.assign({}, status)); } catch (_) {}
  }

  function loadLib() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SUPABASE_SRC;
      s.onload = () => resolve();
      s.onerror = () => { loading = null; reject(new Error('Could not load supabase-js')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  async function getClient() {
    if (!configured) return null;
    if (client) return client;
    await loadLib();
    client = window.supabase.createClient(String(cfg.SUPABASE_URL).trim(), String(cfg.SUPABASE_ANON_KEY).trim(), {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
    });
    client.auth.onAuthStateChange((event, s) => {
      const wasSignedIn = !!session;
      session = s || null;
      status.email = session && session.user ? session.user.email : null;
      // defer: supabase-js holds its auth lock while this callback runs
      if (session && !wasSignedIn) setTimeout(onSignedIn, 0);
      if (!session) setStatus({ state: 'signed-out' });
    });
    return client;
  }

  function isOffline() { return typeof navigator !== 'undefined' && navigator.onLine === false; }

  async function init(h) {
    hooks = Object.assign(hooks, h || {});
    if (!configured) { setStatus({ state: 'local-only' }); return status; }
    window.addEventListener('online', () => kick(0));
    window.addEventListener('offline', () => setStatus({ state: 'offline' }));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { kick(0); maybePull(60000); } });
    window.HTStore.onChange(() => setStatus({}));
    setInterval(() => kick(0), 20000);
    try {
      const c = await getClient();
      const { data } = await c.auth.getSession();
      session = data && data.session ? data.session : null;
      status.email = session && session.user ? session.user.email : null;
      if (session) { setStatus({ state: isOffline() ? 'offline' : 'syncing' }); onSignedIn(); }
      else setStatus({ state: 'signed-out' });
    } catch (e) {
      setStatus({ state: isOffline() ? 'offline' : 'error', error: String(e.message || e) });
    }
    return status;
  }

  let signedInOnce = false;
  async function onSignedIn() {
    if (signedInOnce) { kick(0); return; }
    signedInOnce = true;
    // pull first so the backfill only pushes rows that are newer here than in the cloud
    await maybePull(0);
    try { if (hooks.onSignedIn) await hooks.onSignedIn(); } catch (e) { console.warn('backfill failed', e); }
    kick(0);
  }

  async function maybePull(minGapMs) {
    if (!session || isOffline()) return;
    if (Date.now() - lastPullAt < minGapMs) return;
    lastPullAt = Date.now();
    try {
      const c = await getClient();
      for (const t of PULL_TABLES) {
        const rows = [];
        for (let from = 0; ; from += 1000) {
          const { data, error } = await c.from(t).select('*').range(from, from + 999);
          if (error) throw error;
          rows.push(...(data || []));
          if (!data || data.length < 1000) break;
        }
        try { await hooks.onPull(t, rows); } catch (e) { console.warn('merge failed', t, e); }
      }
    } catch (e) {
      lastPullAt = 0;
      setStatus({ state: isOffline() ? 'offline' : 'error', error: String(e.message || e) });
    }
  }

  /** Request a sync soon (debounced). */
  function kick(delay) {
    if (!configured) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flush, delay == null ? 800 : delay);
  }

  async function flush() {
    if (!configured) return;
    if (flushing) { again = true; return; }
    if (!session) { setStatus({ state: 'signed-out' }); return; }
    if (isOffline()) { setStatus({ state: 'offline' }); return; }
    flushing = true;
    try {
      const c = await getClient();
      const all = await window.HTStore.outboxAll();
      const now = Date.now();
      const due = all.filter((o) => !o.nextAt || o.nextAt <= now);
      if (!all.length) { setStatus({ state: 'synced', lastSyncAt: new Date().toISOString(), error: null }); return; }
      if (!due.length) { setStatus({ state: status.error ? 'error' : 'syncing' }); return; }
      setStatus({ state: 'syncing' });
      const byTable = {};
      due.forEach((o) => { (byTable[o.table] = byTable[o.table] || []).push(o); });
      let anyError = null;
      for (const table of Object.keys(byTable)) {
        const items = byTable[table];
        for (let i = 0; i < items.length; i += CHUNK) {
          const chunk = items.slice(i, i + CHUNK);
          const rows = chunk.map((o) => Object.assign({}, o.row, { user_id: session.user.id }));
          let error = null;
          try {
            const res = await c.from(table).upsert(rows, { onConflict: CONFLICT[table] || undefined });
            error = res.error;
          } catch (e) { error = e; }
          if (error) { anyError = error; await window.HTStore.outboxFail(chunk, error); }
          else await window.HTStore.outboxAck(chunk);
        }
      }
      if (anyError) {
        setStatus({ state: isOffline() ? 'offline' : 'error', error: String(anyError.message || anyError) });
      } else {
        const left = (await window.HTStore.outboxAll()).length;
        setStatus({ state: left ? 'syncing' : 'synced', lastSyncAt: new Date().toISOString(), error: null });
        if (left) again = true;
      }
    } catch (e) {
      setStatus({ state: isOffline() ? 'offline' : 'error', error: String(e.message || e) });
    } finally {
      flushing = false;
      if (again) { again = false; kick(1500); }
    }
  }

  function appUrl() {
    return location.origin + location.pathname.replace(/[^/]*$/, '');
  }

  async function sendCode(email) {
    const c = await getClient();
    const { error } = await c.auth.signInWithOtp({
      email: String(email).trim(),
      options: { emailRedirectTo: appUrl(), shouldCreateUser: true },
    });
    if (error) throw error;
  }

  async function verifyCode(email, token) {
    const c = await getClient();
    const { data, error } = await c.auth.verifyOtp({ email: String(email).trim(), token: String(token).trim(), type: 'email' });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    const c = await getClient();
    await c.auth.signOut({ scope: 'local' });
    session = null; signedInOnce = false;
    setStatus({ state: 'signed-out', email: null });
  }

  window.HTSync = {
    configured, init, kick, flush, sendCode, verifyCode, signOut,
    pull: () => maybePull(0),
    get status() { return Object.assign({}, status, { pending: window.HTStore ? window.HTStore.pendingKeys.size : 0 }); },
    get signedIn() { return !!session; },
  };
})();
