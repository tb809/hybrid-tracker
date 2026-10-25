"""Outbox → Supabase sync against a mocked Supabase (no real project touched).
Run with the static server on :8765:  python3 tests/e2e_sync_mock.py
"""
import json, sys, time, urllib.parse
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/'
SB = 'https://mock-project.supabase.co'
UID = '11111111-2222-4333-8444-555555555555'
results = []
def check(name, cond, detail=''):
    results.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name + ((' — ' + str(detail)) if detail and not cond else ''))

upserts = []      # (table, rows, on_conflict)
fail_next = {'n': 0}
remote = {'set_logs': [], 'sessions': [], 'segment_logs': [], 'weigh_ins': []}
remote['set_logs'].append({  # newer cloud copy from "another device"
  'user_id': UID, 'session_key': 'w2_wed', 'block_id': 'sp', 'set_id': 'sp1', 'done': True,
  'fields': {'weight': '40', 'reps': '8'}, 'client_updated_at': '2030-01-01T00:00:00Z'})

def handle(route):
    req = route.request
    u = urllib.parse.urlparse(req.url)
    path = u.path
    cors = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'content-type': 'application/json'}
    if req.method == 'OPTIONS':
        return route.fulfill(status=200, headers=cors, body='')
    now = int(time.time())
    user = {'id': UID, 'aud': 'authenticated', 'role': 'authenticated', 'email': 'terry@example.com', 'app_metadata': {}, 'user_metadata': {}, 'created_at': '2026-10-25T00:00:00Z'}
    if path == '/auth/v1/otp':
        return route.fulfill(status=200, headers=cors, body='{}')
    if path == '/auth/v1/verify':
        sess = {'access_token': 'header.' + 'eyJzdWIiOiIxIn0' + '.sig', 'token_type': 'bearer', 'expires_in': 3600, 'expires_at': now + 3600, 'refresh_token': 'r1', 'user': user}
        return route.fulfill(status=200, headers=cors, body=json.dumps(sess))
    if path == '/auth/v1/user':
        return route.fulfill(status=200, headers=cors, body=json.dumps(user))
    if path == '/auth/v1/logout':
        return route.fulfill(status=204, headers=cors, body='')
    if path.startswith('/rest/v1/'):
        table = path.split('/')[-1]
        if req.method == 'GET':
            return route.fulfill(status=200, headers=dict(cors, **{'content-range': '0-0/*'}), body=json.dumps(remote.get(table, [])))
        if req.method == 'POST':
            if fail_next['n'] > 0:
                fail_next['n'] -= 1
                return route.fulfill(status=503, headers=cors, body=json.dumps({'message': 'mock outage'}))
            rows = json.loads(req.post_data or '[]')
            q = urllib.parse.parse_qs(u.query)
            upserts.append((table, rows, q.get('on_conflict', [''])[0], req.headers.get('prefer', '')))
            keys = (q.get('on_conflict', ['id'])[0]).split(',')
            store = remote.setdefault(table, [])
            for r in rows:  # emulate upsert
                k = tuple(r.get(x) for x in keys)
                store[:] = [o for o in store if tuple(o.get(x) for x in keys) != k] + [r]
            return route.fulfill(status=201, headers=cors, body='')
    return route.fulfill(status=404, headers=cors, body='{}')

with sync_playwright() as p:
    dev = p.devices['iPhone 13']
    b = p.chromium.launch()
    ctx = b.new_context(**{k: v for k, v in dev.items() if k != 'default_browser_type'}, service_workers='block')
    ctx.route(SB + '/**', handle)
    ctx.route('**/config.js', lambda r: r.fulfill(status=200, content_type='application/javascript',
        body=f"window.HYBRID_CONFIG = {{ SUPABASE_URL: '{SB}', SUPABASE_ANON_KEY: 'anon-test' }};"))
    page = ctx.new_page()
    errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto(BASE)
    page.wait_for_function("window.__HT && HTSync.status.state === 'signed-out'", timeout=10000)
    check('configured: signed-out state', True)
    # log offline-first while signed out
    page.evaluate("__HT.open('w2_mon')")
    page.fill('[data-field="w2_mon|bs|bs1|weight"]', '82.5')
    page.tap('[data-set-done="bs|bs1"]')
    page.fill('#weigh-input', '200.2'); page.tap('#btn-weigh')
    page.wait_for_timeout(400)
    pend = page.evaluate("HTSync.status.pending")
    check('signed out: changes queued in outbox', pend >= 2, pend)
    check('signed out: set mark says saved on phone', 'saved on phone' in page.text_content('[data-sync-key="set_logs|w2_mon|bs|bs1"]'))
    # sign in with email code
    page.tap('.tab[data-view="more"]')
    page.fill('#auth-email', 'terry@example.com'); page.tap('#btn-send-code')
    page.wait_for_selector('#auth-code', state='visible')
    page.fill('#auth-code', '123456'); page.tap('#btn-verify')
    page.wait_for_function("HTSync.signedIn && HTSync.status.state === 'synced'", timeout=15000)
    tables = {t for t, *_ in upserts}
    check('sign-in: queued rows pushed', {'set_logs', 'weigh_ins'} <= tables, tables)
    allrows = [r for _, rows, *_ in upserts for r in rows]
    check('rows carry auth user_id', all(r.get('user_id') == UID for r in allrows))
    s1 = [r for t, rows, *_ in upserts if t == 'set_logs' for r in rows if r['set_id'] == 'bs1']
    check('set row: kg load + lb conversion', s1 and s1[-1]['weight'] == 82.5 and s1[-1]['weight_unit'] == 'kg' and abs(s1[-1]['weight_lb'] - 181.88) < 0.02, s1[-1:])
    oc = {t: c for t, _, c, _ in upserts}
    check('upsert on_conflict per table', oc.get('set_logs') == 'user_id,session_key,block_id,set_id', oc)
    check('upsert uses merge-duplicates', all('merge-duplicates' in pr for *_, pr in upserts))
    st = page.evaluate("__HT.state.logs.w2_wed.blocks.sp.sets.sp1")
    check('pull: newer cloud row merged locally', st['fields']['weight'] == '40' and st['done'], st)
    page.evaluate("__HT.open('w2_mon')")
    page.wait_for_timeout(200)
    check('signed in: set mark shows synced', 'synced' in page.text_content('[data-sync-key="set_logs|w2_mon|bs|bs1"]'))
    check('pill shows synced', 'Synced' in page.text_content('#sync-pill'))
    # offline tap → queued → online → pushed
    n0 = len(upserts)
    ctx.set_offline(True)
    page.tap('[data-set-done="bs|bs2"]')
    page.wait_for_timeout(1500)
    check('offline: no push, queued', len(upserts) == n0 and page.evaluate("HTSync.status.pending") >= 1)
    check('offline: pill says offline', 'Offline' in page.text_content('#sync-pill'), page.text_content('#sync-pill'))
    ctx.set_offline(False)
    page.wait_for_function("HTSync.status.state === 'synced' && HTSync.status.pending === 0", timeout=15000)
    check('back online: pushed', any(r.get('set_id') == 'bs2' for t, rows, *_ in upserts[n0:] for r in rows))
    # server error → retry with backoff
    fail_next['n'] = 1
    n1 = len(upserts)
    page.tap('[data-set-done="bs|bs3"]')
    page.wait_for_function("HTSync.status.state === 'error'", timeout=10000)
    check('server error: kept in outbox', page.evaluate("HTSync.status.pending") >= 1)
    page.wait_for_function("HTSync.status.state === 'synced' && HTSync.status.pending === 0", timeout=30000)
    check('retry succeeded after backoff', any(r.get('set_id') == 'bs3' for t, rows, *_ in upserts[n1:] for r in rows))
    # reload: session persists, nothing re-sent needlessly
    n2 = len(upserts)
    page.reload(); page.wait_for_function("window.__HT && HTSync.signedIn && HTSync.status.state === 'synced'", timeout=15000)
    page.wait_for_timeout(1500)
    check("reload: still signed in, no duplicate pushes", len(upserts) == n2, [(t, [ (r.get("session_key"), r.get("set_id") or r.get("id"), r.get("client_updated_at")) for r in rows]) for t, rows, *_ in upserts[n2:]])
    check('no page errors', not errs, errs)
    b.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} passed"); sys.exit(1 if failed else 0)
