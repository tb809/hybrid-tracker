/* Hybrid Tracker v1 — Phase 6 Week 1 — Terry Baggett
   localStorage persistence; distances stored as km; display km+mi+paces */
(function () {
  'use strict';

  const STORAGE_KEY = 'hybrid-tracker-v1';
  const TODAY_ISO = '2026-10-15'; // box/user date context
  const REAL_TODAY = (() => {
    try {
      return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
    } catch (_) {
      return TODAY_ISO;
    }
  })();

  // Calendar dates for the week
  const WEEK = [
    { id: 'sun', date: '2026-10-11', dow: 'Sun', short: '10/11', title: 'Full Body 1', subtitle: 'Squat Focused', type: 'strength', kpi: '3RM Back Squat' },
    { id: 'mon', date: '2026-10-12', dow: 'Mon', short: '10/12', title: 'Easy Conditioning', subtitle: 'Run or Row', type: 'conditioning' },
    { id: 'tue', date: '2026-10-13', dow: 'Tue', short: '10/13', title: 'Full Body 2', subtitle: 'Press Focused', type: 'strength', kpi: '3RM Strict Press' },
    { id: 'wed', date: '2026-10-14', dow: 'Wed', short: '10/14', title: 'Interval Conditioning', subtitle: '10-min TT / 2k Row', type: 'conditioning', kpi: '10min Max Distance' },
    { id: 'thu', date: '2026-10-15', dow: 'Thu', short: '10/15', title: 'Full Body 3', subtitle: 'Deadlift Focused', type: 'strength', kpi: '3RM Deadlift' },
    { id: 'fri', date: '2026-10-16', dow: 'Fri', short: '10/16', title: 'Tempo Conditioning', subtitle: 'Run or Row', type: 'conditioning' },
    { id: 'sat', date: '2026-10-17', dow: 'Sat', short: '10/17', title: 'Rest', subtitle: 'Recovery day', type: 'rest' },
  ];

  // Terry shifted: Thu Oct 15 → Interval / TT session (not calendar Deadlift day)
  const DEFAULT_SESSION_FOR_TODAY = 'wed';

  const SESSIONS = {
    sun: {
      name: 'Full Body 1 (Squat Focused)',
      kpi: '3RM Back Squat',
      blocks: [
        {
          id: 'wu', title: 'Warm-up Circuit', meta: '2–3 rounds, easy',
          sets: [
            { id: 'wu1', label: 'Circuit round 1', fields: ['notes'] },
            { id: 'wu2', label: 'Circuit round 2', fields: ['notes'] },
            { id: 'wu3', label: 'Circuit round 3 (optional)', fields: ['notes'] },
          ],
        },
        {
          id: 'bs', title: 'Back Squat', meta: 'KPI: build to 3RM, then back-off', kpi: '3rm_back_squat',
          sets: [
            { id: 'bs_build', label: '3RM build / result', fields: ['weight', 'reps', 'rpe'], kpiField: true },
            { id: 'bs_bo1', label: 'Back-off set 1', fields: ['weight', 'reps', 'rpe'] },
            { id: 'bs_bo2', label: 'Back-off set 2', fields: ['weight', 'reps', 'rpe'] },
            { id: 'bs_bo3', label: 'Back-off set 3', fields: ['weight', 'reps', 'rpe'] },
          ],
        },
        {
          id: 'pp', title: 'Push + Pull', meta: 'Weighted push-ups · Cable seated row',
          sets: [
            { id: 'pu1', label: 'Weighted push-ups 1', fields: ['weight', 'reps', 'rpe'] },
            { id: 'pu2', label: 'Weighted push-ups 2', fields: ['weight', 'reps', 'rpe'] },
            { id: 'pu3', label: 'Weighted push-ups 3', fields: ['weight', 'reps', 'rpe'] },
            { id: 'csr1', label: 'Cable seated row 1', fields: ['weight', 'reps', 'rpe'] },
            { id: 'csr2', label: 'Cable seated row 2', fields: ['weight', 'reps', 'rpe'] },
            { id: 'csr3', label: 'Cable seated row 3', fields: ['weight', 'reps', 'rpe'] },
          ],
        },
        {
          id: 'gl', title: 'Glute Accessory', meta: 'Hip thrust · 3 sets',
          sets: [
            { id: 'ht1', label: 'Hip thrust 1', fields: ['weight', 'reps', 'rpe'] },
            { id: 'ht2', label: 'Hip thrust 2', fields: ['weight', 'reps', 'rpe'] },
            { id: 'ht3', label: 'Hip thrust 3', fields: ['weight', 'reps', 'rpe'] },
          ],
        },
        {
          id: 'fin', title: 'Bicep / Tricep / Abs Finisher', meta: 'Arms + core',
          sets: [
            { id: 'bi1', label: 'Biceps', fields: ['weight', 'reps', 'notes'] },
            { id: 'tr1', label: 'Triceps', fields: ['weight', 'reps', 'notes'] },
            { id: 'ab1', label: 'Abs', fields: ['reps', 'notes'] },
          ],
        },
      ],
    },
    mon: {
      name: 'Easy Conditioning',
      modality: true,
      blocksRun: [
        {
          id: 'pogo', title: 'Pogo Jump Warm-up', meta: '1 set · 1–2 rounds',
          sets: [{ id: 'pogo1', label: 'Pogo jumps', fields: ['notes'] }],
        },
        {
          id: 'easy_run', title: 'Easy Run', meta: 'Z2 · HR under ~137 bpm · ~7:30–8:15/km · 12:04–13:17/mi',
          sets: [
            { id: 'er10', label: '10 min easy · Z2 HR <137', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
            { id: 'er25', label: '25 min base · Z2 HR <137', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
            { id: 'er5', label: '5 min easy · Z2 HR <137', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
          ],
        },
      ],
      blocksRow: [
        {
          id: 'pogo_r', title: 'Pogo Jump Warm-up', meta: '1 set · 1–2 rounds',
          sets: [{ id: 'pogo_r1', label: 'Pogo jumps', fields: ['notes'] }],
        },
        {
          id: 'easy_row', title: 'Easy Row', meta: '18 s/m easy · 20 s/m base',
          sets: [
            { id: 'row10', label: '10 min easy (~18 s/m)', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
            { id: 'row25', label: '25 min base (~20 s/m)', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
            { id: 'row5', label: '5 min easy', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
          ],
        },
      ],
    },
    tue: {
      name: 'Full Body 2 (Press Focused)',
      kpi: '3RM Strict Press',
      blocks: [
        {
          id: 'sm', title: 'Shoulder Mobility Warm-up', meta: 'Openers + band work',
          sets: [{ id: 'sm1', label: 'Mobility circuit', fields: ['notes'] }],
        },
        {
          id: 'sp', title: 'Strict Press', meta: 'KPI: 3RM then back-off', kpi: '3rm_strict_press',
          sets: [
            { id: 'sp_build', label: '3RM build / result', fields: ['weight', 'reps', 'rpe'], kpiField: true },
            { id: 'sp_bo1', label: 'Back-off set 1', fields: ['weight', 'reps', 'rpe'] },
            { id: 'sp_bo2', label: 'Back-off set 2', fields: ['weight', 'reps', 'rpe'] },
            { id: 'sp_bo3', label: 'Back-off set 3', fields: ['weight', 'reps', 'rpe'] },
          ],
        },
        {
          id: 'qg', title: 'Quad + Glute Accessory', meta: 'Split lunges',
          sets: [
            { id: 'sl1', label: 'Split lunge 1', fields: ['weight', 'reps', 'rpe'] },
            { id: 'sl2', label: 'Split lunge 2', fields: ['weight', 'reps', 'rpe'] },
            { id: 'sl3', label: 'Split lunge 3', fields: ['weight', 'reps', 'rpe'] },
          ],
        },
        {
          id: 'pu', title: 'Pull-up / Chin-ups', meta: 'Strict preferred',
          sets: [
            { id: 'pull1', label: 'Set 1', fields: ['weight', 'reps', 'rpe'] },
            { id: 'pull2', label: 'Set 2', fields: ['weight', 'reps', 'rpe'] },
            { id: 'pull3', label: 'Set 3', fields: ['weight', 'reps', 'rpe'] },
          ],
        },
        {
          id: 'calf', title: 'Calves Accessory', meta: 'Standing or seated',
          sets: [
            { id: 'c1', label: 'Calves 1', fields: ['weight', 'reps'] },
            { id: 'c2', label: 'Calves 2', fields: ['weight', 'reps'] },
            { id: 'c3', label: 'Calves 3', fields: ['weight', 'reps'] },
          ],
        },
        {
          id: 'arms', title: 'Biceps / Triceps Finisher', meta: 'Arms',
          sets: [
            { id: 'bi', label: 'Biceps', fields: ['weight', 'reps', 'notes'] },
            { id: 'tr', label: 'Triceps', fields: ['weight', 'reps', 'notes'] },
          ],
        },
      ],
    },
    wed: {
      name: 'Interval Conditioning · 10-min TT',
      kpi: '10min Max Distance Run',
      modality: true,
      showTtTargets: true,
      blocksRun: [
        {
          id: 'pogo', title: 'Pogo Jump Warm-up', meta: '1–2 rounds',
          sets: [{ id: 'pogo1', label: 'Pogo jumps', fields: ['notes'] }],
        },
        {
          id: 'wu_run', title: 'Easy Warm-up + Strides', meta: '20 min easy · Z2 HR <137 · 3×20s strides',
          sets: [
            { id: 'wu20', label: '20 min easy · Z2 HR <137 (~7:30–8:15/km · 12:04–13:17/mi)', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
            { id: 'str1', label: 'Stride 1 · 20s', fields: ['notes'] },
            { id: 'str2', label: 'Stride 2 · 20s', fields: ['notes'] },
            { id: 'str3', label: 'Stride 3 · 20s', fields: ['notes'] },
          ],
        },
        {
          id: 'tt', title: '10-min Max Distance TT', meta: 'HARD · KPI · target 2.0 km / 1.24 mi · stretch 2.06 km / 1.28 mi', kpi: '10min_tt',
          sets: [
            {
              id: 'tt_result', label: 'TT result',
              fields: ['distance', 'time', 'avgHr', 'rpe', 'notes'],
              kpiField: true,
            },
          ],
        },
        {
          id: 'cd', title: 'Cooldown', meta: '10 min easy · Z2 HR <137',
          sets: [{ id: 'cd10', label: '10 min easy jog', fields: ['distance', 'avgHr', 'notes'] }],
        },
      ],
      blocksRow: [
        {
          id: 'pogo_r', title: 'Pogo Jump Warm-up', meta: '1–2 rounds',
          sets: [{ id: 'pogo_r1', label: 'Pogo jumps', fields: ['notes'] }],
        },
        {
          id: 'wu_row', title: 'Easy Row + Sprints', meta: '10 min easy with 20s sprints',
          sets: [
            { id: 'rwu10', label: '10 min easy + 20s sprints', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
          ],
        },
        {
          id: 'tt_row', title: '2k Row TT', meta: 'KPI · all-out 2000m', kpi: '2k_row',
          sets: [
            { id: 'row2k', label: '2k result', fields: ['time', 'avgHr', 'rpe', 'notes'], kpiField: true },
          ],
        },
        {
          id: 'cd_row', title: 'Cooldown', meta: '5 min easy',
          sets: [{ id: 'rcd5', label: '5 min easy', fields: ['distance', 'avgHr', 'notes'] }],
        },
      ],
    },
    thu: {
      name: 'Full Body 3 (Deadlift Focused)',
      kpi: '3RM Deadlift',
      blocks: [
        {
          id: 'wu', title: 'Warm-up', meta: 'Hinge prep + activation',
          sets: [{ id: 'wu1', label: 'Warm-up circuit', fields: ['notes'] }],
        },
        {
          id: 'dl', title: 'Deadlift', meta: 'KPI: build to 3RM, then back-off', kpi: '3rm_deadlift',
          sets: [
            { id: 'dl_build', label: '3RM build / result', fields: ['weight', 'reps', 'rpe'], kpiField: true },
            { id: 'dl_bo1', label: 'Back-off set 1', fields: ['weight', 'reps', 'rpe'] },
            { id: 'dl_bo2', label: 'Back-off set 2', fields: ['weight', 'reps', 'rpe'] },
            { id: 'dl_bo3', label: 'Back-off set 3', fields: ['weight', 'reps', 'rpe'] },
          ],
        },
        {
          id: 'acc', title: 'Accessories', meta: 'Posterior + upper',
          sets: [
            { id: 'a1', label: 'Accessory 1', fields: ['weight', 'reps', 'notes'] },
            { id: 'a2', label: 'Accessory 2', fields: ['weight', 'reps', 'notes'] },
            { id: 'a3', label: 'Accessory 3', fields: ['weight', 'reps', 'notes'] },
          ],
        },
        {
          id: 'fin', title: 'Finisher', meta: 'Arms / core as prescribed',
          sets: [{ id: 'f1', label: 'Finisher', fields: ['notes', 'rpe'] }],
        },
      ],
    },
    fri: {
      name: 'Tempo Conditioning',
      modality: true,
      blocksRun: [
        {
          id: 'pogo', title: 'Pogo Jump Warm-up', meta: '1–2 rounds',
          sets: [{ id: 'pogo1', label: 'Pogo jumps', fields: ['notes'] }],
        },
        {
          id: 'wu', title: 'Easy Warm-up', meta: '15 min easy · Z2 HR <137',
          sets: [{ id: 'wu15', label: '15 min easy · Z2 HR <137', fields: ['distance', 'avgHr', 'notes'] }],
        },
        {
          id: 'tempo', title: 'Tempo Intervals', meta: 'MODERATE · 6 min @ Z3 HR ~140–155 (cap ~155–158) + 2 min easy × 3–4',
          sets: [
            { id: 't1', label: 'Tempo 1 · 6 min · HR 140–155', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
            { id: 'tr1', label: 'Easy jog 2 min', fields: ['notes'] },
            { id: 't2', label: 'Tempo 2 · 6 min · HR 140–155', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
            { id: 'tr2', label: 'Easy jog 2 min', fields: ['notes'] },
            { id: 't3', label: 'Tempo 3 · 6 min · HR 140–155', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
            { id: 'tr3', label: 'Easy jog 2 min', fields: ['notes'] },
            { id: 't4', label: 'Tempo 4 · 6 min · HR 140–155 (optional)', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
          ],
        },
        {
          id: 'cd', title: 'Cooldown', meta: '5 min easy · Z2 HR <137',
          sets: [{ id: 'cd5', label: '5 min cooldown', fields: ['distance', 'avgHr', 'notes'] }],
        },
      ],
      blocksRow: [
        {
          id: 'pogo_r', title: 'Pogo Jump Warm-up', meta: '1–2 rounds',
          sets: [{ id: 'pogo_r1', label: 'Pogo jumps', fields: ['notes'] }],
        },
        {
          id: 'wu_r', title: 'Easy Warm-up', meta: '10 min easy',
          sets: [{ id: 'rwu10', label: '10 min easy', fields: ['distance', 'avgHr', 'notes'] }],
        },
        {
          id: 'tempo_r', title: 'Tempo Row', meta: 'MODERATE · 6 min @ 20–24 s/m · HR ~140–155 (cap ~155–158) + 2 min rest × 4',
          sets: [
            { id: 'rt1', label: 'Tempo 1 · 6 min · HR 140–155', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
            { id: 'rtr1', label: 'Rest 2 min', fields: ['notes'] },
            { id: 'rt2', label: 'Tempo 2 · 6 min · HR 140–155', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
            { id: 'rtr2', label: 'Rest 2 min', fields: ['notes'] },
            { id: 'rt3', label: 'Tempo 3 · 6 min · HR 140–155', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
            { id: 'rtr3', label: 'Rest 2 min', fields: ['notes'] },
            { id: 'rt4', label: 'Tempo 4 · 6 min · HR 140–155', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
          ],
        },
        {
          id: 'cd_r', title: 'Cooldown', meta: '10 min easy',
          sets: [{ id: 'rcd10', label: '10 min easy', fields: ['distance', 'avgHr', 'notes'] }],
        },
      ],
    },
    sat: {
      name: 'Rest Day',
      blocks: [
        {
          id: 'rest', title: 'Rest / Recovery', meta: 'Walk, stretch, sleep — optional notes',
          sets: [{ id: 'rest1', label: 'How you feel', fields: ['notes', 'rpe'] }],
        },
      ],
    },
  };

  const KPI_DEFS = [
    { key: '3rm_back_squat', label: '3RM Back Squat', unit: 'lb', session: 'sun' },
    { key: '3rm_strict_press', label: '3RM Strict Press', unit: 'lb', session: 'tue' },
    { key: '10min_tt', label: '10-min Max Distance', unit: 'km', session: 'wed' },
    { key: '2k_row', label: '2k Row', unit: 'time', session: 'wed' },
    { key: '3rm_deadlift', label: '3RM Deadlift', unit: 'lb', session: 'thu' },
  ];

  // —— State ——
  let state = loadState();
  let view = 'today';
  let selectedSessionId = state.todayOverrideSession || (
    REAL_TODAY === '2026-10-15' ? DEFAULT_SESSION_FOR_TODAY :
    (WEEK.find(d => d.date === REAL_TODAY) || {}).id || DEFAULT_SESSION_FOR_TODAY
  );
  let openBlocks = new Set();

  function defaultState() {
    return {
      version: 2,
      logs: {}, // sessionId -> { modality, blocks: {blockId:{done,sets:{setId:{done,fields}}}}, notes, savedAt }
      todayOverrideSession: null,
      kpis: {},
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      const merged = Object.assign(defaultState(), parsed);
      delete merged.unit; // v2: canonical km only; dual display always
      merged.version = 2;
      return merged;
    } catch (_) {
      return defaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      toast('Could not save — storage full?');
    }
  }

  function ensureLog(sessionId) {
    if (!state.logs[sessionId]) {
      state.logs[sessionId] = { modality: 'run', blocks: {}, notes: '', savedAt: null };
    }
    return state.logs[sessionId];
  }

  function getBlocks(sessionId) {
    const s = SESSIONS[sessionId];
    if (!s) return [];
    if (s.modality) {
      const log = ensureLog(sessionId);
      return log.modality === 'row' ? s.blocksRow : s.blocksRun;
    }
    return s.blocks || [];
  }

  // —— Units (canonical km; always show km + mi + both paces) ——
  const KM_PER_MI = 1.609344;

  function parseNum(v) {
    if (v == null || v === '') return null;
    const n = parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  /** Parse mm:ss, m:ss, or decimal minutes → total seconds */
  function parseTimeToSec(v) {
    if (v == null || v === '') return null;
    const s = String(v).trim();
    if (!s) return null;
    if (s.includes(':')) {
      const parts = s.split(':').map((p) => parseFloat(p));
      if (parts.some((p) => !Number.isFinite(p))) return null;
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      return null;
    }
    const n = parseFloat(s);
    return Number.isFinite(n) ? n * 60 : null; // bare number = minutes
  }

  function formatPace(secPerUnit) {
    if (!Number.isFinite(secPerUnit) || secPerUnit <= 0 || secPerUnit > 3600) return null;
    const m = Math.floor(secPerUnit / 60);
    const s = Math.round(secPerUnit % 60);
    const adjM = s === 60 ? m + 1 : m;
    const adjS = s === 60 ? 0 : s;
    return adjM + ':' + String(adjS).padStart(2, '0');
  }

  function fmtDist(n, digits) {
    if (!Number.isFinite(n)) return null;
    const d = digits != null ? digits : (Math.abs(n) >= 10 ? 1 : 2);
    return n.toFixed(d).replace(/\.?0+$/, (m) => (m.startsWith('.') ? '' : m)); // keep meaningful decimals
  }
  function fmtDistFixed(n, digits) {
    if (!Number.isFinite(n)) return null;
    return Number(n).toFixed(digits);
  }

  /** From km (+ optional time) → "2.08 km · 4:49/km · 1.29 mi · 7:45/mi" */
  function formatDualDistance(km, timeStr) {
    const k = parseNum(km);
    if (k == null || k <= 0) return null;
    const mi = k / KM_PER_MI;
    const kmStr = fmtDistFixed(k, 2);
    const miStr = fmtDistFixed(mi, 2);
    const sec = parseTimeToSec(timeStr);
    let paceKm = null, paceMi = null;
    if (sec != null && sec > 0) {
      paceKm = formatPace(sec / k);
      paceMi = formatPace(sec / mi);
    }
    let out = kmStr + ' km';
    if (paceKm) out += ' · ' + paceKm + '/km';
    out += ' · ' + miStr + ' mi';
    if (paceMi) out += ' · ' + paceMi + '/mi';
    return out;
  }

  /** Static dual label for a known km value (targets) */
  function dualKmLabel(km, digits) {
    const k = parseNum(km);
    if (k == null) return '';
    const d = digits != null ? digits : 2;
    return fmtDistFixed(k, d) + ' km · ' + fmtDistFixed(k / KM_PER_MI, d) + ' mi';
  }

  /** Pace range dual: "6:50–7:10/km · 11:00–11:30/mi" */
  function dualPaceRange(paceKmLo, paceKmHi) {
    function toSec(p) {
      const [m, s] = p.split(':').map(Number);
      return m * 60 + s;
    }
    function fromSec(sec) {
      return formatPace(sec);
    }
    const lo = toSec(paceKmLo), hi = toSec(paceKmHi);
    // pace/mi = pace/km * KM_PER_MI
    const loMi = fromSec(lo * KM_PER_MI);
    const hiMi = fromSec(hi * KM_PER_MI);
    return paceKmLo + '–' + paceKmHi + '/km · ' + loMi + '–' + hiMi + '/mi';
  }

  function dualPace(paceKm) {
    const [m, s] = paceKm.split(':').map(Number);
    const sec = m * 60 + s;
    return paceKm + '/km · ' + formatPace(sec * KM_PER_MI) + '/mi';
  }

  // —— Toast ——
  let toastTimer;
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 2400);
  }

  // —— KPI extraction ——
  function refreshKpisFromLogs() {
    const kpis = Object.assign({}, state.kpis);
    WEEK.forEach(day => {
      const sess = SESSIONS[day.id];
      if (!sess) return;
      const log = state.logs[day.id];
      if (!log) return;
      const blocks = getBlocksForLog(day.id, log);
      blocks.forEach(block => {
        if (!block.kpi) return;
        const bLog = (log.blocks || {})[block.id];
        if (!bLog) return;
        block.sets.forEach(set => {
          if (!set.kpiField) return;
          const sLog = (bLog.sets || {})[set.id];
          if (!sLog || !sLog.fields) return;
          const f = sLog.fields;
          if (block.kpi === '10min_tt' && f.distance) {
            const dual = formatDualDistance(f.distance, f.time || '10:00');
            kpis['10min_tt'] = {
              value: f.distance, unit: 'km', extra: f.time || '', avgHr: f.avgHr || '',
              dual: dual, at: day.date, modality: log.modality
            };
          } else if (block.kpi === '2k_row' && f.time) {
            kpis['2k_row'] = { value: f.time, unit: 'time', avgHr: f.avgHr || '', at: day.date };
          } else if (f.weight) {
            kpis[block.kpi] = { value: f.weight, unit: 'lb', reps: f.reps || '3', rpe: f.rpe || '', at: day.date };
          }
        });
      });
    });
    state.kpis = kpis;
  }

  function getBlocksForLog(sessionId, log) {
    const s = SESSIONS[sessionId];
    if (!s) return [];
    if (s.modality) return (log.modality === 'row' ? s.blocksRow : s.blocksRun) || [];
    return s.blocks || [];
  }

  function sessionProgress(sessionId) {
    const blocks = getBlocks(sessionId);
    const log = ensureLog(sessionId);
    let total = 0, done = 0;
    blocks.forEach(b => {
      b.sets.forEach(set => {
        total++;
        const sLog = ((log.blocks || {})[b.id] || {}).sets || {};
        if (sLog[set.id] && sLog[set.id].done) done++;
      });
    });
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
  }

  // —— Render ——
  const root = document.getElementById('view-root');

  function render() {
    refreshKpisFromLogs();
    if (view === 'today') renderToday();
    else if (view === 'week') renderWeek();
    else if (view === 'kpi') renderKpi();
    else if (view === 'history') renderHistory();
    else renderMore();
  }

  function renderToday() {
    const dayMeta = WEEK.find(d => d.id === selectedSessionId) || WEEK[3];
    const sess = SESSIONS[selectedSessionId];
    const log = ensureLog(selectedSessionId);
    const prog = sessionProgress(selectedSessionId);
    const isShiftedToday = REAL_TODAY === '2026-10-15' && selectedSessionId === 'wed';

    let html = '';
    html += `<div class="card">
      <div class="row space">
        <div>
          <div class="muted">${formatDateLabel(REAL_TODAY)} · logging as</div>
          <h2 style="margin:4px 0 0">${escapeHtml(sess.name)}</h2>
        </div>
        ${sess.kpi ? `<span class="badge kpi">KPI</span>` : ''}
      </div>
      ${isShiftedToday ? `<p class="muted" style="margin:8px 0 0">Schedule shifted: doing Interval / 10-min TT today (calendar was Deadlift). Pick any session below.</p>` : ''}
      <div class="session-picker" style="margin-top:12px">
        ${WEEK.map(d => `<button type="button" class="chip ${d.id === selectedSessionId ? 'active' : ''}" data-pick="${d.id}">${d.dow} · ${d.title.split(' ')[0]}${d.id === 'wed' && REAL_TODAY === '2026-10-15' ? ' ★' : ''}</button>`).join('')}
      </div>
      <div class="progress-bar"><span style="width:${prog.pct}%"></span></div>
      <div class="muted" style="margin-top:6px">${prog.done}/${prog.total} sets · ${prog.pct}%</div>
    </div>`;

    if (sess.modality) {
      html += `<div class="card row" style="gap:8px">
        <span class="muted" style="margin-right:4px">Modality</span>
        <button type="button" class="chip ${log.modality !== 'row' ? 'active' : ''}" data-mod="run">Run</button>
        <button type="button" class="chip ${log.modality === 'row' ? 'active' : ''}" data-mod="row">Row</button>
        <span class="muted" style="margin-left:auto;font-size:11px">Dist in km · shows mi + paces</span>
      </div>`;
    }

    if (log.modality !== 'row' || !sess.modality || selectedSessionId === 'fri') html += hrTargetsHtml(selectedSessionId);
    if (sess.showTtTargets && log.modality !== 'row') {
      html += ttTargetsHtml();
    }

    const blocks = getBlocks(selectedSessionId);
    blocks.forEach(block => {
      html += renderBlock(selectedSessionId, block, log);
    });

    html += `<div class="card notes-area">
      <h3>Session notes</h3>
      <textarea id="session-notes" placeholder="How it felt, weather, sleep…">${escapeHtml(log.notes || '')}</textarea>
      <div class="row" style="margin-top:10px">
        <button type="button" class="btn primary lg" id="btn-save">Save session</button>
      </div>
    </div>`;

    if (sess.showTtTargets && log.modality !== 'row') {
      html += `<div class="card"><button type="button" class="btn lg" id="btn-open-tt-timer" style="width:100%">⏱ Start 10:00 TT Timer</button></div>`;
    }
    if (selectedSessionId === 'fri') {
      html += `<div class="card"><button type="button" class="btn lg" id="btn-open-tempo-timer" style="width:100%">⏱ Start Tempo Timer</button></div>`;
    }

    root.innerHTML = html;
    bindTodayEvents();
  }

  function hrTargetsHtml(id) {
    const z2 = dualPaceRange('7:30', '8:15');
    if (id === 'mon') {
      return `<div class="target-card hr-card easy">
        <h4>HR target · EASY / BASE (Z2)</h4>
        <ul>
          <li><strong>HR under ~137 bpm</strong> the whole run (warm-up, base, cooldown)</li>
          <li>Pace is whatever Z2 gives — roughly <span class="pace">${z2}</span></li>
          <li>If HR drifts above 137: slow down or walk briefly. Don't chase pace.</li>
        </ul>
      </div>`;
    }
    if (id === 'fri') {
      return `<div class="moderate-banner">⚠️ MODERATE — don't race it</div>
      <div class="target-card hr-card tempo">
        <h4>HR target · TEMPO (Z3, moderate)</h4>
        <ul>
          <li><strong>Tempo reps: HR ~140–155 bpm</strong> (Z3) · <strong>hard cap ~155–158</strong></li>
          <li>Not hard. If HR hits 155–158, ease off — Z4 (157+) is too much for this session.</li>
          <li>Oct 10 tempo work laps averaged 159–162 bpm (Z4) — that was too hard.</li>
          <li>Warm-up / jog recoveries / cooldown: Z2, HR under ~137 (~<span class="pace">${z2}</span>)</li>
        </ul>
      </div>`;
    }
    if (id === 'wed') {
      return `<div class="target-card hr-card hard">
        <h4>HR target · INTERVALS / TT (HARD)</h4>
        <ul>
          <li><strong>Warm-up + cooldown: Z2, HR under ~137</strong> (~<span class="pace">${z2}</span>)</li>
          <li><strong>TT / strides: HARD</strong> — HR climbs into 180s, 190s by the finish</li>
        </ul>
      </div>`;
    }
    return '';
  }

  function ttTargetsHtml() {
    const goal = dualKmLabel(2.0);
    const stretch = dualKmLabel(2.06);
    const cp = dualKmLabel(1.0, 1) + ' at 5:00';
    const easy = dualPaceRange('7:30', '8:15');
    const first = dualPace('5:00');
    const mid = dualPaceRange('4:55', '4:58');
    const avgGoal = dualPaceRange('4:51', '5:00');
    return `<div class="target-card">
      <h4>Today’s TT targets</h4>
      <ul>
        <li><strong>Warm-up:</strong> 20 min easy Z2, <strong>HR under ~137</strong> (~<span class="pace">${easy}</span>) · then 3×20s strides</li>
        <li><strong>TT goal:</strong> <span class="pace">${goal}</span> · stretch <span class="pace">${stretch}</span> (avg ~${avgGoal})</li>
        <li><strong>Pacing:</strong> first 2 min ~<span class="pace">${first}</span> (no faster than 4:58/km · ${dualPace('4:58').split(' · ')[1]} first min) · middle <span class="pace">${mid}</span> · push last 2 min</li>
        <li><strong>Checkpoint:</strong> ${cp}</li>
        <li><strong>HR (HARD):</strong> climbs into 180s, 190s at finish · Oct 1 mile was 7:43/mi (4:48/km) but went out ~6:45/mi (4:12/km) and faded — stay patient</li>
        <li><strong>Cooldown:</strong> 10 min easy · Z2 HR under ~137</li>
      </ul>
    </div>`;
  }

  function renderBlock(sessionId, block, log) {
    const bLog = (log.blocks || {})[block.id] || { done: false, sets: {} };
    const isOpen = openBlocks.has(block.id) || !bLog.done;
    const openCls = isOpen ? 'open' : '';
    const doneCls = bLog.done ? 'done' : '';
    let html = `<div class="block ${openCls} ${doneCls}" data-block="${block.id}">
      <div class="block-head" data-toggle-block="${block.id}">
        <div class="check" data-block-done="${block.id}">${bLog.done ? '✓' : ''}</div>
        <div style="flex:1">
          <div class="block-title">${escapeHtml(block.title)} ${block.kpi ? '<span class="badge kpi">KPI</span>' : ''}</div>
          <div class="block-meta">${escapeHtml(block.meta || '')}</div>
        </div>
        <span class="muted">${isOpen ? '▾' : '▸'}</span>
      </div>
      <div class="block-body">`;

    block.sets.forEach(set => {
      const sLog = (bLog.sets || {})[set.id] || { done: false, fields: {} };
      html += `<div class="set-row">
        <button type="button" class="set-check ${sLog.done ? 'on' : ''}" data-set-done="${block.id}|${set.id}" aria-label="Toggle set">${sLog.done ? '✓' : ''}</button>
        <div>
          <div class="set-label">${escapeHtml(set.label)}</div>
          <div class="set-fields ${set.fields.length >= 3 ? 'three' : ''}">
            ${set.fields.map(f => fieldHtml(sessionId, block.id, set.id, f, sLog.fields || {})).join('')}
          </div>
          ${dualPreviewHtml(set.fields, sLog.fields || {}, block.id, set.id)}
        </div>
      </div>`;
    });

    html += `</div></div>`;
    return html;
  }

  function dualPreviewHtml(fields, values, blockId, setId) {
    if (!fields.includes('distance')) return '';
    const dual = formatDualDistance(values.distance, values.time);
    const id = `dual-${blockId}-${setId}`;
    if (!dual) {
      return `<div class="dual-preview muted" id="${id}" data-dual-for="${blockId}|${setId}">Enter km (+ time) → km · /km · mi · /mi</div>`;
    }
    return `<div class="dual-preview" id="${id}" data-dual-for="${blockId}|${setId}"><span class="pace">${escapeHtml(dual)}</span></div>`;
  }

  function fieldHtml(sessionId, blockId, setId, field, values) {
    const key = `${sessionId}|${blockId}|${setId}|${field}`;
    const val = values[field] != null ? values[field] : '';
    const labels = {
      weight: 'Weight (lb)',
      reps: 'Reps',
      rpe: 'RPE',
      distance: 'Dist (km)',
      time: 'Time',
      avgHr: 'Avg HR',
      notes: 'Notes',
    };
    const inputmode = ['weight', 'reps', 'rpe', 'distance', 'avgHr'].includes(field) ? 'decimal' : 'text';
    const ph = field === 'time' ? 'mm:ss' : field === 'distance' ? 'e.g. 2.08' : '';
    const dualAttr = (field === 'distance' || field === 'time') ? ` data-dual-input="${blockId}|${setId}"` : '';
    if (field === 'notes') {
      return `<label style="grid-column:1/-1">${labels[field]}<input type="text" data-field="${key}" value="${escapeAttr(val)}" placeholder="optional" /></label>`;
    }
    return `<label>${labels[field] || field}<input type="text" inputmode="${inputmode}" data-field="${key}"${dualAttr} value="${escapeAttr(val)}" placeholder="${ph}" /></label>`;
  }

  function updateDualPreview(blockId, setId) {
    const el = document.getElementById(`dual-${blockId}-${setId}`);
    if (!el) return;
    const distInp = root.querySelector(`[data-field="${selectedSessionId}|${blockId}|${setId}|distance"]`);
    const timeInp = root.querySelector(`[data-field="${selectedSessionId}|${blockId}|${setId}|time"]`);
    const dual = formatDualDistance(distInp && distInp.value, timeInp && timeInp.value);
    if (!dual) {
      el.className = 'dual-preview muted';
      el.textContent = 'Enter km (+ time) → km · /km · mi · /mi';
    } else {
      el.className = 'dual-preview';
      el.innerHTML = '<span class="pace">' + escapeHtml(dual) + '</span>';
    }
  }

  function bindTodayEvents() {
    root.querySelectorAll('[data-pick]').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedSessionId = btn.getAttribute('data-pick');
        state.todayOverrideSession = selectedSessionId;
        openBlocks = new Set();
        saveState();
        render();
      });
    });
    root.querySelectorAll('[data-mod]').forEach(btn => {
      btn.addEventListener('click', () => {
        ensureLog(selectedSessionId).modality = btn.getAttribute('data-mod');
        openBlocks = new Set();
        saveState();
        render();
      });
    });
    root.querySelectorAll('[data-dual-input]').forEach(inp => {
      const sync = () => {
        persistField(inp);
        const pair = inp.getAttribute('data-dual-input').split('|');
        updateDualPreview(pair[0], pair[1]);
      };
      inp.addEventListener('input', sync);
      inp.addEventListener('change', sync);
    });
    root.querySelectorAll('[data-toggle-block]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-block-done]')) return;
        const id = el.getAttribute('data-toggle-block');
        const block = el.closest('.block');
        if (openBlocks.has(id)) { openBlocks.delete(id); block.classList.remove('open'); }
        else { openBlocks.add(id); block.classList.add('open'); }
        // update chevron
        const chev = el.querySelector('.muted:last-child');
        if (chev && (chev.textContent === '▾' || chev.textContent === '▸')) {
          chev.textContent = openBlocks.has(id) ? '▾' : '▸';
        }
      });
    });
    root.querySelectorAll('[data-block-done]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = el.getAttribute('data-block-done');
        const log = ensureLog(selectedSessionId);
        if (!log.blocks[id]) log.blocks[id] = { done: false, sets: {} };
        log.blocks[id].done = !log.blocks[id].done;
        saveState();
        render();
      });
    });
    root.querySelectorAll('[data-set-done]').forEach(el => {
      el.addEventListener('click', () => {
        const [blockId, setId] = el.getAttribute('data-set-done').split('|');
        const log = ensureLog(selectedSessionId);
        if (!log.blocks[blockId]) log.blocks[blockId] = { done: false, sets: {} };
        if (!log.blocks[blockId].sets[setId]) log.blocks[blockId].sets[setId] = { done: false, fields: {} };
        log.blocks[blockId].sets[setId].done = !log.blocks[blockId].sets[setId].done;
        saveState();
        // light update
        el.classList.toggle('on');
        el.textContent = el.classList.contains('on') ? '✓' : '';
        // refresh progress without full re-render to keep keyboard
        const prog = sessionProgress(selectedSessionId);
        const bar = root.querySelector('.progress-bar > span');
        if (bar) bar.style.width = prog.pct + '%';
      });
    });
    root.querySelectorAll('[data-field]').forEach(inp => {
      inp.addEventListener('change', () => persistField(inp));
      inp.addEventListener('blur', () => persistField(inp));
    });
    const notes = document.getElementById('session-notes');
    if (notes) {
      notes.addEventListener('change', () => {
        ensureLog(selectedSessionId).notes = notes.value;
        saveState();
      });
    }
    const saveBtn = document.getElementById('btn-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        root.querySelectorAll('[data-field]').forEach(persistField);
        const log = ensureLog(selectedSessionId);
        if (notes) log.notes = notes.value;
        log.savedAt = new Date().toISOString();
        refreshKpisFromLogs();
        saveState();
        toast('Session saved');
        // soft refresh progress
        render();
      });
    }
    const ttBtn = document.getElementById('btn-open-tt-timer');
    if (ttBtn) ttBtn.addEventListener('click', () => openTimer('tt'));
    const tempoBtn = document.getElementById('btn-open-tempo-timer');
    if (tempoBtn) tempoBtn.addEventListener('click', () => openTimer('tempo'));
  }

  function persistField(inp) {
    const key = inp.getAttribute('data-field');
    if (!key) return;
    const [sessionId, blockId, setId, field] = key.split('|');
    const log = ensureLog(sessionId);
    if (!log.blocks[blockId]) log.blocks[blockId] = { done: false, sets: {} };
    if (!log.blocks[blockId].sets[setId]) log.blocks[blockId].sets[setId] = { done: false, fields: {} };
    log.blocks[blockId].sets[setId].fields[field] = inp.value;
    saveState();
  }

  function renderWeek() {
    let html = `<div class="card"><h2>Phase 6 · Week 1</h2><p class="muted" style="margin:0">Oct 11–17, 2026 · Coach Patrick James</p></div>`;
    WEEK.forEach(d => {
      const prog = sessionProgress(d.id);
      const isToday = d.date === REAL_TODAY;
      const shifted = isToday && REAL_TODAY === '2026-10-15';
      html += `<button type="button" class="week-day ${isToday ? 'today' : ''}" data-goto="${d.id}">
        <div class="dow"><div class="d">${d.date.slice(-2)}</div><div class="w">${d.dow}</div></div>
        <div class="info">
          <div class="name">${escapeHtml(d.title)}${d.kpi ? ' · KPI' : ''}</div>
          <div class="muted">${escapeHtml(d.subtitle)}${shifted ? ' · doing TT today ★' : ''}</div>
          <div class="progress-bar"><span style="width:${prog.pct}%"></span></div>
        </div>
        ${prog.pct === 100 ? '<span class="badge ok">Done</span>' : `<span class="muted">${prog.pct}%</span>`}
      </button>`;
    });
    root.innerHTML = html;
    root.querySelectorAll('[data-goto]').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedSessionId = btn.getAttribute('data-goto');
        state.todayOverrideSession = selectedSessionId;
        view = 'today';
        setActiveTab('today');
        saveState();
        render();
      });
    });
  }

  function renderKpi() {
    refreshKpisFromLogs();
    let html = `<div class="card"><h2>KPI Results</h2><p class="muted" style="margin:0">Auto-filled from logged sets</p></div><div class="kpi-grid">`;
    KPI_DEFS.forEach(def => {
      const k = state.kpis[def.key];
      let value = '—';
      let sub = 'Not logged yet';
      if (k && k.value) {
        if (def.key === '10min_tt') {
          value = k.dual || formatDualDistance(k.value, k.extra || '10:00') || `${k.value} km`;
          sub = [k.extra && `time ${k.extra}`, k.avgHr && `HR ${k.avgHr}`, k.at].filter(Boolean).join(' · ');
        } else if (def.key === '2k_row') {
          value = k.value;
          sub = [k.avgHr && `HR ${k.avgHr}`, k.at].filter(Boolean).join(' · ');
        } else {
          value = `${k.value} ${k.unit || 'lb'}`;
          sub = [k.reps && `${k.reps} reps`, k.rpe && `RPE ${k.rpe}`, k.at].filter(Boolean).join(' · ');
        }
      }
      const valueCls = def.key === '10min_tt' ? 'value dual' : 'value';
      html += `<div class="kpi-card"><div class="label">${escapeHtml(def.label)}</div><div class="${valueCls}">${escapeHtml(value)}</div><div class="sub">${escapeHtml(sub)}</div></div>`;
    });
    html += `</div>`;
    root.innerHTML = html;
  }

  function renderHistory() {
    const items = WEEK.map(d => {
      const log = state.logs[d.id];
      const prog = sessionProgress(d.id);
      return { d, log, prog };
    }).filter(x => x.log && (x.prog.done > 0 || x.log.notes || x.log.savedAt));

    let html = `<div class="card"><h2>History</h2><p class="muted" style="margin:0">Logged days this week</p></div><div class="card" style="padding:0">`;
    if (!items.length) {
      html += `<div class="history-item"><span class="muted">No sessions logged yet</span></div>`;
    } else {
      items.forEach(({ d, log, prog }) => {
        const when = log.savedAt ? formatTime(log.savedAt) : 'in progress';
        const highlight = historyDualSummary(d.id, log);
        html += `<div class="history-item">
          <div>
            <div style="font-weight:700">${d.dow} ${d.short} · ${escapeHtml(d.title)}</div>
            <div class="muted">${prog.done}/${prog.total} sets · ${when}${log.modality ? ' · ' + log.modality : ''}</div>
            ${highlight ? `<div class="pace" style="font-size:12px;margin-top:4px">${escapeHtml(highlight)}</div>` : ''}
          </div>
          <button type="button" class="chip sm" data-goto="${d.id}">Open</button>
        </div>`;
      });
    }
    html += `</div>`;
    root.innerHTML = html;
    root.querySelectorAll('[data-goto]').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedSessionId = btn.getAttribute('data-goto');
        view = 'today';
        setActiveTab('today');
        render();
      });
    });
  }

  function renderMore() {
    root.innerHTML = `<div class="card">
      <h2>Data</h2>
      <p class="muted">Stored on this phone (localStorage). Export a backup before clearing browser data.</p>
      <div class="stack">
        <button type="button" class="btn primary" id="btn-export">Export JSON</button>
        <label class="btn file-btn">Import JSON<input type="file" id="import-file" accept="application/json,.json" /></label>
        <button type="button" class="btn danger" id="btn-reset">Reset all data</button>
      </div>
    </div>
    <div class="card">
      <h2>Distance units</h2>
      <p class="muted" style="margin:0">Enter run distance in <strong>km</strong> (watch default). The app always shows km, pace/km, miles, and pace/mi together when distance (+ time) is logged.</p>
    </div>
    <div class="card">
      <h2>About</h2>
      <p class="muted" style="margin:0">Hybrid Phase 6 Week 1 (Oct 11–17, 2026) · Coach Patrick James · Offline-capable PWA · v1.1</p>
    </div>`;

    document.getElementById('btn-export').addEventListener('click', exportJson);
    document.getElementById('import-file').addEventListener('change', importJson);
    document.getElementById('btn-reset').addEventListener('click', () => {
      if (confirm('Erase all logged workouts on this device?')) {
        state = defaultState();
        saveState();
        selectedSessionId = DEFAULT_SESSION_FOR_TODAY;
        toast('Data reset');
        render();
      }
    });
  }

  function exportJson() {
    refreshKpisFromLogs();
    const payload = {
      exportedAt: new Date().toISOString(),
      app: 'hybrid-tracker',
      version: 1,
      state,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hybrid-tracker-${REAL_TODAY}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Exported');
  }

  function importJson(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const incoming = data.state || data;
        if (!incoming.logs) throw new Error('Invalid file');
        state = Object.assign(defaultState(), incoming);
        saveState();
        toast('Imported');
        render();
      } catch (err) {
        toast('Import failed');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // —— Timer ——
  const timerModal = document.getElementById('timer-modal');
  const timerDisplay = document.getElementById('timer-display');
  const timerStatus = document.getElementById('timer-status');
  let timerMode = 'tt';
  let timerInterval = null;
  let timerRemaining = 600;
  let timerRunning = false;
  let tempoPhase = 'work'; // work | rest
  let tempoSet = 1;
  let checkpointFired = false;

  function openTimer(mode) {
    timerMode = mode || 'tt';
    document.querySelectorAll('.timer-modes .chip').forEach(c => {
      c.classList.toggle('active', c.getAttribute('data-tmode') === timerMode);
    });
    document.getElementById('tempo-config').classList.toggle('hidden', timerMode !== 'tempo');
    document.getElementById('custom-config').classList.toggle('hidden', timerMode !== 'custom');
    resetTimer();
    timerModal.classList.remove('hidden');
  }

  function closeTimer() {
    timerModal.classList.add('hidden');
  }

  function resetTimer() {
    stopTimerTick();
    timerRunning = false;
    checkpointFired = false;
    tempoPhase = 'work';
    tempoSet = 1;
    timerDisplay.classList.remove('alert', 'done');
    document.getElementById('timer-start').textContent = 'Start';
    if (timerMode === 'tt') {
      timerRemaining = 600;
      timerStatus.textContent = 'Ready · checkpoint alert at 5:00 (1.0 km)';
    } else if (timerMode === 'tempo') {
      const w = Math.max(1, parseInt(document.getElementById('tempo-work').value, 10) || 6);
      timerRemaining = w * 60;
      timerStatus.textContent = `Set 1 · WORK ${w}:00`;
    } else {
      const m = Math.max(0, parseInt(document.getElementById('custom-min').value, 10) || 0);
      const s = Math.max(0, parseInt(document.getElementById('custom-sec').value, 10) || 0);
      timerRemaining = m * 60 + s;
      timerStatus.textContent = 'Ready';
    }
    paintTimer();
  }

  function paintTimer() {
    const m = Math.floor(timerRemaining / 60);
    const s = timerRemaining % 60;
    timerDisplay.textContent = `${m}:${String(s).padStart(2, '0')}`;
  }

  function stopTimerTick() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880;
      g.gain.value = 0.08;
      o.start();
      setTimeout(() => { o.stop(); ctx.close(); }, 180);
    } catch (_) {}
    if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
  }

  function tick() {
    if (timerRemaining > 0) timerRemaining--;
    paintTimer();

    if (timerMode === 'tt' && !checkpointFired && timerRemaining === 300) {
      checkpointFired = true;
      timerDisplay.classList.add('alert');
      timerStatus.textContent = 'CHECKPOINT · ~1.0 km / 0.62 mi? Stay on pace.';
      beep();
      setTimeout(() => timerDisplay.classList.remove('alert'), 2000);
    }

    if (timerRemaining <= 0) {
      if (timerMode === 'tempo') {
        beep();
        const work = Math.max(1, parseInt(document.getElementById('tempo-work').value, 10) || 6);
        const rest = Math.max(1, parseInt(document.getElementById('tempo-rest').value, 10) || 2);
        const sets = Math.max(1, parseInt(document.getElementById('tempo-sets').value, 10) || 4);
        if (tempoPhase === 'work') {
          tempoPhase = 'rest';
          timerRemaining = rest * 60;
          timerStatus.textContent = `Set ${tempoSet} · REST ${rest}:00`;
          timerDisplay.classList.add('alert');
          setTimeout(() => timerDisplay.classList.remove('alert'), 1200);
        } else {
          tempoSet++;
          if (tempoSet > sets) {
            finishTimer('Tempo complete');
            return;
          }
          tempoPhase = 'work';
          timerRemaining = work * 60;
          timerStatus.textContent = `Set ${tempoSet} · WORK ${work}:00`;
        }
        paintTimer();
      } else {
        finishTimer(timerMode === 'tt' ? 'TT DONE · log your distance!' : 'Timer done');
      }
    }
  }

  function finishTimer(msg) {
    stopTimerTick();
    timerRunning = false;
    timerDisplay.classList.add('done');
    timerStatus.textContent = msg;
    document.getElementById('timer-start').textContent = 'Start';
    beep();
    toast(msg);
  }

  function toggleTimer() {
    if (timerRunning) {
      stopTimerTick();
      timerRunning = false;
      document.getElementById('timer-start').textContent = 'Resume';
      timerStatus.textContent = 'Paused';
    } else {
      if (timerRemaining <= 0) resetTimer();
      timerRunning = true;
      document.getElementById('timer-start').textContent = 'Pause';
      timerInterval = setInterval(tick, 1000);
    }
  }

  document.getElementById('btn-timer').addEventListener('click', () => openTimer(timerMode));
  document.getElementById('timer-close').addEventListener('click', closeTimer);
  document.getElementById('timer-start').addEventListener('click', toggleTimer);
  document.getElementById('timer-reset').addEventListener('click', resetTimer);
  document.querySelectorAll('.timer-modes .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      timerMode = chip.getAttribute('data-tmode');
      document.querySelectorAll('.timer-modes .chip').forEach(c => c.classList.toggle('active', c === chip));
      document.getElementById('tempo-config').classList.toggle('hidden', timerMode !== 'tempo');
      document.getElementById('custom-config').classList.toggle('hidden', timerMode !== 'custom');
      resetTimer();
    });
  });
  timerModal.addEventListener('click', (e) => { if (e.target === timerModal) closeTimer(); });

  // —— Tabs ——
  function setActiveTab(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.getAttribute('data-view') === name));
  }
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      view = tab.getAttribute('data-view');
      setActiveTab(view);
      render();
      window.scrollTo(0, 0);
    });
  });

  // —— Helpers ——
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function escapeAttr(s) { return escapeHtml(s).replace(/'/g, '&#39;'); }
  function formatDateLabel(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function formatTime(iso) {
    try {
      return new Date(iso).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' PT';
    } catch (_) { return iso; }
  }

  // —— SW ——
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

  render();
})();
