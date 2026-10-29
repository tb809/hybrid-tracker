"""Headless phone-viewport tests for Hybrid Tracker v2.
Run:  python3 -m http.server 8765 &  then  python3 tests/e2e_phone.py [base_url]
"""
import json, sys, time
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/'
results = []
def check(name, cond, detail=''):
    results.append((name, bool(cond), detail))
    print(('PASS ' if cond else 'FAIL ') + name + ((' — ' + str(detail)) if detail and not cond else ''))

LEGACY = {
  "version": 2, "todayOverrideSession": None, "kpis": {},
  "logs": {
    "sun": {"modality": "run", "notes": "W1 squat day", "savedAt": "2026-10-11T18:00:00.000Z",
            "blocks": {"bs": {"done": True, "sets": {"bs_build": {"done": True, "fields": {"weight": "225", "reps": "3", "rpe": "9"}},
                                                    "bs_bo1": {"done": True, "fields": {"weight": "185", "reps": "5"}}}},
                       "pp": {"done": False, "sets": {"pu3": {"done": True, "fields": {"weight": "25", "reps": "12"}}}},
                       "gl": {"done": False, "sets": {"ht3": {"done": True, "fields": {"weight": "135", "reps": "10"}}}}}},
    "mon": {"modality": "run", "notes": "", "savedAt": None,
            "blocks": {"easy_run": {"done": True, "sets": {"er25": {"done": True, "fields": {"distance": "4.2", "avgHr": "133"}}}}}},
    "w2_mon": {"modality": "run", "notes": "W2 kg", "savedAt": None,
               "blocks": {"bs": {"done": False, "sets": {"bs1": {"done": True, "fields": {"weight": "80", "reps": "6", "rpe": "6"}}}}}},
  }
}

def iphone(p, offline_ok=True):
    dev = p.devices['iPhone 13']
    b = p.chromium.launch()
    ctx = b.new_context(**{k: v for k, v in dev.items() if k != 'default_browser_type'}, service_workers='allow')
    return b, ctx

with sync_playwright() as p:
    b, ctx = iphone(p)
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    # --- seed a v1.x localStorage log (Week 1 lb + Week 2 kg), as an old install would have ---
    page.goto(BASE + 'manifest.json')
    page.evaluate("s => localStorage.setItem('hybrid-tracker-v1', s)", json.dumps(LEGACY))
    page.goto(BASE)
    page.wait_for_function("window.__HT && window.__HT.boot")
    boot = page.evaluate("({source: __HT.boot.source, migrated: __HT.boot.migrated, idbOk: __HT.boot.idbOk})")
    check('migration: boot source is localStorage & migrated', boot['source'] == 'localStorage' and boot['migrated'], boot)
    st = page.evaluate("__HT.state")
    check('migration: week 1 lb logs intact', st['logs']['sun']['blocks']['bs']['sets']['bs_build']['fields']['weight'] == '225')
    check('migration: week 2 kg logs intact', st['logs']['w2_mon']['blocks']['bs']['sets']['bs1']['fields']['weight'] == '80')
    check('migration: run segment intact', st['logs']['mon']['blocks']['easy_run']['sets']['er25']['fields']['distance'] == '4.2')
    time.sleep(0.5)
    idb = page.evaluate("""() => new Promise(r => { const q = indexedDB.open('hybrid-tracker'); q.onsuccess = () => {
        const db = q.result; const tx = db.transaction(['state','meta']); const out = {};
        tx.objectStore('state').get('main').onsuccess = e => out.state = e.target.result;
        tx.objectStore('meta').get('legacy_localstorage_backup').onsuccess = e => out.backup = e.target.result;
        tx.objectStore('meta').get('migrated_from_localstorage_at').onsuccess = e => out.migAt = e.target.result;
        tx.oncomplete = () => r(out); }; })""")
    def unwrap(v):
        return v.get('value', v) if isinstance(v, dict) and 'value' in v and 'logs' not in v else v
    idb_state = unwrap(idb.get('state'))
    check('migration: state written to IndexedDB', idb_state and 'logs' in idb_state and 'w2_mon' in idb_state['logs'], str(idb)[:200])
    check('migration: raw localStorage backup stashed in IDB meta', bool(idb.get('backup')))
    check('migration: legacy localStorage key kept', page.evaluate("!!localStorage.getItem('hybrid-tracker-v1')"))

    # --- local-only mode (empty config) ---
    pill = page.text_content('#sync-pill')
    check('local-only: pill shows on-phone status', 'On phone' in pill, pill)
    check('local-only: HTSync not configured', page.evaluate("HTSync.configured === false"))

    # --- Week 2 squat: prefills + one-tap confirm ---
    page.evaluate("__HT.open('w2_mon')")
    page.wait_for_selector('[data-set-done="bs|bs2"]')
    w = page.input_value('[data-field="w2_mon|bs|bs2|weight"]')
    r = page.input_value('[data-field="w2_mon|bs|bs2|reps"]')
    check('prefill: bs2 load from bs1 (80 kg) and reps from label (6)', w == '80' and r == '6', (w, r))
    pu = page.input_value('[data-field="w2_mon|pp|pu3|weight"]')
    check('prefill: W2 push-up load from W1 (25 lb → 11.3 kg)', pu == '11.3', pu)
    rir_ph = page.get_attribute('[data-field="w2_mon|pp|pu1|rir"]', 'placeholder')
    check('RIR field on RIR blocks', rir_ph is not None, rir_ph)
    box = page.locator('[data-set-done="bs|bs2"]').bounding_box()
    check('tap target ≥ 44px', box['width'] >= 44 and box['height'] >= 44, box)
    page.tap('[data-set-done="bs|bs2"]')
    s2 = page.evaluate("__HT.state.logs.w2_mon.blocks.bs.sets.bs2")
    check('one tap logs set with prefilled values', s2['done'] and s2['fields'].get('weight') == '80' and s2['fields'].get('reps') == '6', s2)
    page.tap('[data-step="w2_mon|bs|bs3|weight"][data-delta="2.5"]')
    v3 = page.input_value('[data-field="w2_mon|bs|bs3|weight"]')
    check('stepper +2.5 kg', v3 == '82.5', v3)
    lb = page.text_content('#lb-bs-bs3')
    check('kg set also shows lb', 'lb' in lb, lb)
    mark = page.text_content('[data-sync-key="set_logs|w2_mon|bs|bs2"]')
    check('per-set mark says saved on phone', 'saved on phone' in mark, mark)

    # --- weigh-in ---
    page.fill('#weigh-input', '201.4')
    page.tap('#btn-weigh')
    wis = page.evaluate("__HT.state.weighins")
    check('weigh-in logged in lb', len(wis) == 1 and wis[0]['weightLb'] == 201.4, wis)

    # --- persistence across reload ---
    time.sleep(0.4)
    page.reload()
    page.wait_for_function("window.__HT && window.__HT.boot")
    boot2 = page.evaluate("__HT.boot.source")
    st2 = page.evaluate("__HT.state")
    check('reload: loads from IndexedDB', boot2 == 'idb', boot2)
    check('reload: tapped set persisted', st2['logs']['w2_mon']['blocks']['bs']['sets']['bs2']['done'])
    check('reload: stepper edit persisted', st2['logs']['w2_mon']['blocks']['bs']['sets']['bs3']['fields'].get('weight') == '82.5')
    check('reload: weigh-in persisted', len(st2['weighins']) == 1)

    # --- units on run days ---
    page.evaluate("__HT.open('mon')")
    page.wait_for_selector('[data-field="mon|easy_run|er25|time"]', state='attached')
    if not page.is_visible('[data-field="mon|easy_run|er25|time"]'):
        page.tap('[data-toggle-block="easy_run"] .block-title')
    page.fill('[data-field="mon|easy_run|er25|time"]', '25:00')
    page.dispatch_event('[data-field="mon|easy_run|er25|time"]', 'change')
    dual = page.text_content('#dual-easy_run-er25')
    check('run: shows km, /km, mi, /mi', all(x in dual for x in ['km', '/km', 'mi', '/mi']), dual)
    meta = page.text_content('[data-block="easy_run"] .block-meta')
    check('plan text paces have /mi', '/mi' in meta, meta)
    hr = page.get_attribute('[data-field="mon|easy_run|er25|avgHr"]', 'placeholder')
    check('HR target shown as Avg HR hint', '137' in (hr or ''), hr)
    page.evaluate("__HT.open('w2_thu')")
    page.wait_for_selector('.block')
    body = page.text_content('#view-root')
    check('w2 interval page renders with mi', ' mi' in body)

    # --- history + more ---
    page.tap('.tab[data-view="history"]')
    page.wait_for_timeout(200)
    h = page.text_content('#view-root')
    check('history renders summaries + weigh-ins', 'Weigh-ins' in h and 'Top:' in h, h[:300])
    page.tap('.tab[data-view="more"]')
    m = page.text_content('#view-root')
    check('more: local-only notice', 'Local-only mode' in m)

    # --- offline: SW installed, reload with network off ---
    page.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller", timeout=10000)
    caches = page.evaluate("caches.keys()")
    check('SW cache v2-1-1 installed', 'hybrid-tracker-v2-1-1' in caches, caches)
    ctx.set_offline(True)
    page.reload()
    page.wait_for_function("window.__HT && window.__HT.boot", timeout=10000)
    check('offline: app boots from SW cache', page.evaluate("__HT.state.logs.w2_mon.blocks.bs.sets.bs2.done"))
    page.evaluate("__HT.open('w2_mon')")
    page.tap('[data-set-done="bs|bs3"]')
    page.wait_for_timeout(300)
    page.reload()
    page.wait_for_function("window.__HT && window.__HT.boot", timeout=10000)
    check('offline: logging persists across offline reload', page.evaluate("__HT.state.logs.w2_mon.blocks.bs.sets.bs3.done"))
    ctx.set_offline(False)
    page.screenshot(path='/tmp/ht_today.png', full_page=False)
    check('no page errors', not errors, errors)
    b.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
