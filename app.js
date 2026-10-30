/* Hybrid Tracker v2.1.12 — Phase 6 Weeks 1–3 — Terry Baggett
   Local-first: every tap is written to IndexedDB (db.js) + a localStorage mirror,
   queued in an outbox and synced to Supabase when configured (sync.js).
   Distances stored as km; always displayed as km · /km · mi · /mi. */
(function () {
  'use strict';
  const APP_VERSION = '2.1.12';

  function start(BOOT) {

  const STORAGE_KEY = 'hybrid-tracker-v1';
  const TODAY_ISO = '2026-10-15'; // box/user date context
  const REAL_TODAY = (() => {
    // Device-local calendar date (Terry's phone is America/Los_Angeles). Built from local
    // Date fields so it doesn't depend on locale formatting; LA via Intl as a fallback.
    try {
      const d = new Date();
      if (isNaN(d.getTime())) throw new Error('bad date');
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    } catch (_) {}
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

  // Phase 6 Week 2 (Mon Oct 19–Sun Oct 25, 2026; same order as Week 1 as executed, starting FB1 Mon). Session ids are prefixed w2_ so Week 1 logs (keyed by sun..sat) stay untouched.
  const WEEK2 = [
    { id: 'w2_mon', date: '2026-10-19', dow: 'Mon', short: '10/19', title: 'Full Body 1', subtitle: 'Squat Focused · ~45 min', type: 'strength' },
    { id: 'w2_tue', date: '2026-10-20', dow: 'Tue', short: '10/20', title: 'Easy Conditioning', subtitle: 'Run or Row', type: 'conditioning' },
    { id: 'w2_wed', date: '2026-10-21', dow: 'Wed', short: '10/21', title: 'Full Body 2', subtitle: 'Press Focused', type: 'strength' },
    // 10/22 schedule change (tentative): Thu = rest (NYC conference) / FB3 optional; Interval moved to Fri. Ids unchanged so logs stay keyed.
    { id: 'w2_fri', date: '2026-10-22', dow: 'Thu', short: '10/22', title: 'Rest / Full Body 3', subtitle: 'Likely rest (conference) · FB3 Deadlift optional / usually skipped', type: 'strength' },
    { id: 'w2_thu', date: '2026-10-23', dow: 'Fri', short: '10/23', title: 'Interval Conditioning', subtitle: 'Race pace 8×2 min / 8×500m row · moved from Thu (tentative)', type: 'conditioning' },
    { id: 'w2_sat', date: '2026-10-24', dow: 'Sat', short: '10/24', title: 'Tempo Conditioning', subtitle: 'Run or Row', type: 'conditioning' },
    { id: 'w2_sun', date: '2026-10-25', dow: 'Sun', short: '10/25', title: 'Rest', subtitle: 'Recovery day', type: 'rest' },
  ];
  // Phase 6 Week 3 (Mon Oct 26–Sun Nov 1, 2026). Ids prefixed w3_. Thu–Sun are placeholders until the app screenshots come in.
  const WEEK3 = [
    { id: 'w3_mon', date: '2026-10-26', dow: 'Mon', short: '10/26', title: 'Full Body 1', subtitle: 'Squat Focused · done 10/26 · squat 4×6 @ 100 kg', type: 'strength' },
    { id: 'w3_tue', date: '2026-10-27', dow: 'Tue', short: '10/27', title: 'Easy Conditioning', subtitle: 'Run 50 min progressive easy or Row 3×10 min @ 18/20/22 s/m', type: 'conditioning' },
    { id: 'w3_wed', date: '2026-10-28', dow: 'Wed', short: '10/28', title: 'Full Body 2', subtitle: 'Press Focused · done 10/28 (partial: A–C) · press/lunge loads pending', type: 'strength' },
    { id: 'w3_thu', date: '2026-10-29', dow: 'Thu', short: '10/29', title: 'Pace Assessment', subtitle: '✓ Done 10/29 · treadmill 6×400m (of 8) @ 7.6–7.7 mph · cool-down skipped', type: 'conditioning' },
    { id: 'w3_fri', date: '2026-10-30', dow: 'Fri', short: '10/30', title: 'Awaiting screenshots', subtitle: 'Session added once the app screenshot comes in', type: 'rest' },
    { id: 'w3_sat', date: '2026-10-31', dow: 'Sat', short: '10/31', title: 'Awaiting screenshots', subtitle: 'Session added once the app screenshot comes in', type: 'rest' },
    { id: 'w3_sun', date: '2026-11-01', dow: 'Sun', short: '11/01', title: 'Awaiting screenshots', subtitle: 'Session added once the app screenshot comes in', type: 'rest' },
  ];
  WEEK.forEach(d => { d.week = 1; });
  WEEK2.forEach(d => { d.week = 2; });
  WEEK3.forEach(d => { d.week = 3; });
  const WEEKS = {
    1: { label: 'Week 1', range: 'Oct 11–17, 2026', days: WEEK },
    2: { label: 'Week 2', range: 'Oct 19–25, 2026', days: WEEK2 },
    3: { label: 'Week 3', range: 'Oct 26–Nov 1, 2026', days: WEEK3 },
  };
  const ALL_DAYS = WEEK.concat(WEEK2, WEEK3);

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
          cues: "Done Mon 10/12: 142.9 kg (315 lb) × 3 @ RPE 9 (Remy's log, workout 867). Back-off sets not logged.",
          sets: [
            { id: 'bs_build', label: '3RM build / result', fields: ['weight', 'reps', 'rpe'], kpiField: true },
            { id: 'bs_bo1', label: 'Back-off set 1', fields: ['weight', 'reps', 'rpe'] },
            { id: 'bs_bo2', label: 'Back-off set 2', fields: ['weight', 'reps', 'rpe'] },
            { id: 'bs_bo3', label: 'Back-off set 3', fields: ['weight', 'reps', 'rpe'] },
          ],
        },
        {
          id: 'pp', title: 'Push + Pull', meta: 'Weighted push-ups · Cable seated row',
          cues: "Done Mon 10/12: weighted push-up 3 × 10 @ 20.4 kg (45 lb); cable seated row 36.3 kg (80 lb) × 10, then 40.8 kg (90 lb) × 12 × 2 (Remy's log).",
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
          id: 'easy_run', title: 'Easy Run', meta: 'Z2 · HR under 139 bpm · ~7:30–8:15/km · 12:04–13:17/mi',
          sets: [
            { id: 'er10', label: '10 min easy · Z2 HR <139', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
            { id: 'er25', label: '25 min base · Z2 HR <139', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
            { id: 'er5', label: '5 min easy · Z2 HR <139', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
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
          id: 'wu_run', title: 'Easy Warm-up + Strides', meta: '20 min easy · Z2 HR <139 · 3×20s strides',
          sets: [
            { id: 'wu20', label: '20 min easy · Z2 HR <139 (~7:30–8:15/km · 12:04–13:17/mi)', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
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
          id: 'cd', title: 'Cooldown', meta: '10 min easy · Z2 HR <139',
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
          id: 'wu', title: 'Easy Warm-up', meta: '15 min easy · Z2 HR <139',
          sets: [{ id: 'wu15', label: '15 min easy · Z2 HR <139', fields: ['distance', 'avgHr', 'notes'] }],
        },
        {
          id: 'tempo', title: 'Tempo Intervals', meta: 'MODERATE · 6 min @ Z3 HR 139–158 (cap 158) + 2 min easy × 3–4',
          sets: [
            { id: 't1', label: 'Tempo 1 · 6 min · HR 139–158', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
            { id: 'tr1', label: 'Easy jog 2 min', fields: ['notes'] },
            { id: 't2', label: 'Tempo 2 · 6 min · HR 139–158', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
            { id: 'tr2', label: 'Easy jog 2 min', fields: ['notes'] },
            { id: 't3', label: 'Tempo 3 · 6 min · HR 139–158', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
            { id: 'tr3', label: 'Easy jog 2 min', fields: ['notes'] },
            { id: 't4', label: 'Tempo 4 · 6 min · HR 139–158 (optional)', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
          ],
        },
        {
          id: 'cd', title: 'Cooldown', meta: '5 min easy · Z2 HR <139',
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
          id: 'tempo_r', title: 'Tempo Row', meta: 'MODERATE · 6 min @ 20–24 s/m · HR 139–158 (cap 158) + 2 min rest × 4',
          sets: [
            { id: 'rt1', label: 'Tempo 1 · 6 min · HR 139–158', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
            { id: 'rtr1', label: 'Rest 2 min', fields: ['notes'] },
            { id: 'rt2', label: 'Tempo 2 · 6 min · HR 139–158', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
            { id: 'rtr2', label: 'Rest 2 min', fields: ['notes'] },
            { id: 'rt3', label: 'Tempo 3 · 6 min · HR 139–158', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
            { id: 'rtr3', label: 'Rest 2 min', fields: ['notes'] },
            { id: 'rt4', label: 'Tempo 4 · 6 min · HR 139–158', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
          ],
        },
        {
          id: 'cd_r', title: 'Cooldown', meta: '10 min easy',
          sets: [{ id: 'rcd10', label: '10 min easy', fields: ['distance', 'avgHr', 'notes'] }],
        },
      ],
    },
    w2_mon: {
      name: 'Full Body 1 (Squat Focused)',
      weightUnit: 'kg',
      duration: '~45 min',
      blocks: [
        {
          id: 'wu', title: 'Warm Up', meta: 'Circuit · repeat 2x · rest as needed',
          cues: '1 min Bike Erg · 10/10 Split Stance Leaps · 6 reps 90/90 Hip Rotations. Can add med ball load to leaps. Use 20kg plate to increase ROM. Keep knees at 90° on hip rotations.',
          sets: [
            { id: 'wu1', label: 'Round 1 · Bike Erg 1 min · Leaps 10/10 · 90/90 x6', fields: ['notes'] },
            { id: 'wu2', label: 'Round 2 · Bike Erg 1 min · Leaps 10/10 · 90/90 x6', fields: ['notes'] },
          ],
        },
        {
          id: 'bs', title: 'A. Back Squat', meta: '4 x 6 Barbell Back Squat · 2 min rest · RPE 6/7',
          cues: 'Keep loads close together across sets, can increase each set. Hotel swap: goblet / DB front squat 4x8–10.',
          sets: [
            { id: 'bs1', label: 'Set 1 · 6 reps', fields: ['weight', 'reps', 'rpe'] },
            { id: 'bs2', label: 'Set 2 · 6 reps', fields: ['weight', 'reps', 'rpe'] },
            { id: 'bs3', label: 'Set 3 · 6 reps', fields: ['weight', 'reps', 'rpe'] },
            { id: 'bs4', label: 'Set 4 · 6 reps', fields: ['weight', 'reps', 'rpe'] },
          ],
        },
        {
          id: 'pp', title: 'B. Pec + Lat Accessory', meta: 'Push + Pull superset · 3 sets · 2 min rest between · 0–1 RIR',
          cues: 'Progress loads/reps from last week. Push up: bodyweight or plate on back, can push up off DBs for ROM. Row: lat focused, elbow finishes in line with body, neutral grip, straps if you can. Swap: 1-arm DB row. Dual pulley row OK.',
          sets: [
            { id: 'pu1', label: 'Weighted Push Up 1 · 10–15', fields: ['weight', 'reps', 'rpe'] },
            { id: 'csr1', label: 'Cable Seated Row 1 · 8–12', fields: ['weight', 'reps', 'rpe'] },
            { id: 'pu2', label: 'Weighted Push Up 2 · 10–15', fields: ['weight', 'reps', 'rpe'] },
            { id: 'csr2', label: 'Cable Seated Row 2 · 8–12', fields: ['weight', 'reps', 'rpe'] },
            { id: 'pu3', label: 'Weighted Push Up 3 · 10–15', fields: ['weight', 'reps', 'rpe'] },
            { id: 'csr3', label: 'Cable Seated Row 3 · 8–12', fields: ['weight', 'reps', 'rpe'] },
          ],
        },
        {
          id: 'gl', title: 'C. Glute Accessory', meta: 'Barbell Hip Thrust · 3 x 8–12 · 2 min rest · 0–1 RIR',
          cues: 'Ribs tucked, drive hips high. Smith machine OK. Swap: single-leg DB hip thrust.',
          sets: [
            { id: 'ht1', label: 'Hip Thrust 1 · 8–12', fields: ['weight', 'reps', 'rpe'] },
            { id: 'ht2', label: 'Hip Thrust 2 · 8–12', fields: ['weight', 'reps', 'rpe'] },
            { id: 'ht3', label: 'Hip Thrust 3 · 8–12', fields: ['weight', 'reps', 'rpe'] },
          ],
        },
        {
          id: 'fin', title: 'D. Bicep, Tricep + Ab Accessory', meta: 'Arms + Abs · repeat 3x · 2 min rest between rounds · 0–1 RIR',
          cues: 'Ez Bar Preacher Curl: full arm extension at bottom (standing curl if no preacher bench). Cable Rope Push Down: upper arm stays at side. Rope Cable Crunch: move through spine, not hips.',
          sets: [
            { id: 'bi1', label: 'R1 · Ez Bar Preacher Curl · 10–15', fields: ['weight', 'reps'] },
            { id: 'tr1', label: 'R1 · Cable Rope Push Down · 10–15', fields: ['weight', 'reps'] },
            { id: 'ab1', label: 'R1 · Rope Cable Crunch · 10–15', fields: ['weight', 'reps'] },
            { id: 'bi2', label: 'R2 · Ez Bar Preacher Curl · 10–15', fields: ['weight', 'reps'] },
            { id: 'tr2', label: 'R2 · Cable Rope Push Down · 10–15', fields: ['weight', 'reps'] },
            { id: 'ab2', label: 'R2 · Rope Cable Crunch · 10–15', fields: ['weight', 'reps'] },
            { id: 'bi3', label: 'R3 · Ez Bar Preacher Curl · 10–15', fields: ['weight', 'reps'] },
            { id: 'tr3', label: 'R3 · Cable Rope Push Down · 10–15', fields: ['weight', 'reps'] },
            { id: 'ab3', label: 'R3 · Rope Cable Crunch · 10–15', fields: ['weight', 'reps'] },
          ],
        },
      ],
    },
    w2_tue: {
      name: 'Easy Conditioning',
      modality: true,
      hrCard: 'easy2',
      blocksRun: [
        {
          id: 'pogo', title: 'Pogo Jump Series', meta: '1 set of 1–2 reps · take yourself through 1–2 full rounds',
          sets: [{ id: 'pogo1', label: 'Pogo jumps', fields: ['notes'] }],
        },
        {
          id: 'easy_run', title: 'Easy Run Warm-up', meta: '10 min easy · RPE 3–4 (low Z2) · HR <139',
          cues: 'Option 1 (Run) or Option 2 (Row), not both.',
          sets: [{ id: 'er10', label: '10 min easy · RPE 3–4', fields: ['distance', 'avgHr', 'rpe', 'notes'] }],
        },
        {
          id: 'base', title: 'Base Intervals', meta: 'Repeat 3x · 8 min @ base · 2 min easy jog (float) · RPE 4–5 (high Z2 / low Z3)',
          sets: [
            { id: 'b1', label: 'Base 1 · 8 min · RPE 4–5', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
            { id: 'b2', label: 'Base 2 · 8 min · RPE 4–5', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
            { id: 'b3', label: 'Base 3 · 8 min · RPE 4–5', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
          ],
        },
        {
          id: 'cd', title: 'Cool Down', meta: '5 min easy',
          sets: [{ id: 'cd5', label: '5 min cool down', fields: ['distance', 'avgHr', 'notes'] }],
        },
      ],
      blocksRow: [
        {
          id: 'pogo_r', title: 'Pogo Jump Series', meta: '1 set of 1–2 reps · 1–2 full rounds',
          sets: [{ id: 'pogo_r1', label: 'Pogo jumps', fields: ['notes'] }],
        },
        {
          id: 'easy_row', title: 'Easy Row Warm-up', meta: '10 min easy row · RPE 3–4 (low Z2)',
          cues: 'Option 1 (Run) or Option 2 (Row), not both.',
          sets: [{ id: 'row10', label: '10 min easy row', fields: ['distance', 'avgHr', 'rpe', 'notes'] }],
        },
        {
          id: 'base_r', title: 'Base Intervals (Row)', meta: 'Repeat 3x · 8 min row erg @ 20–22 s/m (base) · 2 min complete rest · RPE 4–5 (high Z2 / low Z3)',
          sets: [
            { id: 'rb1', label: 'Base 1 · 8 min · 20–22 s/m', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
            { id: 'rb2', label: 'Base 2 · 8 min · 20–22 s/m', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
            { id: 'rb3', label: 'Base 3 · 8 min · 20–22 s/m', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
          ],
        },
        {
          id: 'cd_r', title: 'Cool Down', meta: '5 min easy row',
          sets: [{ id: 'rcd5', label: '5 min cool down', fields: ['distance', 'avgHr', 'notes'] }],
        },
      ],
    },
    w2_wed: {
      name: 'Full Body 2 (Press Focused)',
      weightUnit: 'kg',
      blocks: [
        {
          id: 'sm', title: 'Warm up · Shoulder WU', meta: 'Repeat 2x · 1 min Ski Erg · 5/5 KB Arm Bar · 10–15 Cable Face Pull · 2 min rest between rounds',
          cues: 'KB Arm Bar: 5 reps on each arm; focus on reaching to the ceiling on each arm. Cable Face Pull: can use a band if this is easier. Rest as much as you need between rounds.',
          sets: [
            { id: 'sm1', label: 'Round 1 · Ski Erg 1 min · KB Arm Bar 5/5 · Face Pull 10–15', fields: ['notes'] },
            { id: 'sm2', label: 'Round 2 · Ski Erg 1 min · KB Arm Bar 5/5 · Face Pull 10–15', fields: ['notes'] },
          ],
        },
        {
          id: 'sp', title: 'A. Strict Press', meta: '4 sets x 6 reps Barbell Strict Press · 2 min rest · RPE 6/7',
          cues: 'Make sure the bar touches the collarbone with each rep. Aim to hit similar loads across all sets or aim to increase from set to set. Rest as much as you need between sets.',
          sets: [
            { id: 'sp1', label: 'Set 1 · 6 reps', fields: ['weight', 'reps', 'rpe'] },
            { id: 'sp2', label: 'Set 2 · 6 reps', fields: ['weight', 'reps', 'rpe'] },
            { id: 'sp3', label: 'Set 3 · 6 reps', fields: ['weight', 'reps', 'rpe'] },
            { id: 'sp4', label: 'Set 4 · 6 reps', fields: ['weight', 'reps', 'rpe'] },
          ],
        },
        {
          id: 'qg', title: 'B. Quad + Glute Accessory', meta: 'DB Lunge · 3 sets x 8–10 reps Deficit DB Reverse Lunge (each leg) · 2 min rest · 0–1 RIR',
          cues: 'Progress loads or reps from last week where possible. Use a 20kg plate or something to raise the front leg. Allow both the knee and the hip to bend equally. Use straps if you have access. 8–10 on each leg. 2 min programmed but rest as much as you need. Options: Smith machine or barbell instead if more comfortable.',
          sets: [
            { id: 'sl1', label: 'Set 1 · 8–10 each leg', fields: ['weight', 'reps', 'rpe'] },
            { id: 'sl2', label: 'Set 2 · 8–10 each leg', fields: ['weight', 'reps', 'rpe'] },
            { id: 'sl3', label: 'Set 3 · 8–10 each leg', fields: ['weight', 'reps', 'rpe'] },
          ],
        },
        {
          id: 'pu', title: 'C. Pull Up + Dip', meta: 'Chin up + Dip superset · 3 sets · 6–10 Chin Up · 6–10 Strict Dip · 2 min rest between supersets · 0–1 RIR',
          cues: 'Add weight if you can to either exercise; progress loads or reps from last week. Chin up: palms facing you, straps if you have access, arms fully straight at the bottom and chin over the bar at the top, band if you need assistance. Dip: elbow comes below the line of the shoulder at the bottom, band if you need assistance.',
          sets: [
            { id: 'chin1', label: 'R1 · Chin Up · 6–10', fields: ['weight', 'reps', 'rpe'] },
            { id: 'dip1', label: 'R1 · Strict Dip · 6–10', fields: ['weight', 'reps', 'rpe'] },
            { id: 'chin2', label: 'R2 · Chin Up · 6–10', fields: ['weight', 'reps', 'rpe'] },
            { id: 'dip2', label: 'R2 · Strict Dip · 6–10', fields: ['weight', 'reps', 'rpe'] },
            { id: 'chin3', label: 'R3 · Chin Up · 6–10', fields: ['weight', 'reps', 'rpe'] },
            { id: 'dip3', label: 'R3 · Strict Dip · 6–10', fields: ['weight', 'reps', 'rpe'] },
          ],
        },
        {
          id: 'dc', title: 'D. Delts + Calfs Accessory', meta: 'Superset · 3 sets · 10–15 Single Arm Rear Delt Fly · 10–15 Single Leg Seated Calf Raise · 2 min rest · 0–1 RIR',
          cues: 'Progress loads or reps from last week. Cable rear delt fly: slight bend in the elbow, drive the arm behind the body, cuffs if you have them. Seated calf raise: calf machine if you have one, if not a DB or sandbag on the knee works well.',
          sets: [
            { id: 'rdf1', label: 'R1 · Single Arm Rear Delt Fly · 10–15', fields: ['weight', 'reps'] },
            { id: 'calf1', label: 'R1 · Single Leg Seated Calf Raise · 10–15', fields: ['weight', 'reps'] },
            { id: 'rdf2', label: 'R2 · Single Arm Rear Delt Fly · 10–15', fields: ['weight', 'reps'] },
            { id: 'calf2', label: 'R2 · Single Leg Seated Calf Raise · 10–15', fields: ['weight', 'reps'] },
            { id: 'rdf3', label: 'R3 · Single Arm Rear Delt Fly · 10–15', fields: ['weight', 'reps'] },
            { id: 'calf3', label: 'R3 · Single Leg Seated Calf Raise · 10–15', fields: ['weight', 'reps'] },
          ],
        },
        {
          id: 'arms', title: 'E. Bicep + Tricep Accessory', meta: 'Arms superset · 3 sets · 10–15 Cable Standing Curl · 10–15 Cable Tricep Pushdown · 2 min rest',
          cues: 'Progress loads or reps from last week where possible. Curl: palms facing the ceiling, straight bar attachment if you have one. Pushdown: elbows tucked in by your sides, straight bar attachment.',
          sets: [
            { id: 'bi1', label: 'R1 · Cable Standing Curl · 10–15', fields: ['weight', 'reps'] },
            { id: 'tr1', label: 'R1 · Cable Tricep Pushdown · 10–15', fields: ['weight', 'reps'] },
            { id: 'bi2', label: 'R2 · Cable Standing Curl · 10–15', fields: ['weight', 'reps'] },
            { id: 'tr2', label: 'R2 · Cable Tricep Pushdown · 10–15', fields: ['weight', 'reps'] },
            { id: 'bi3', label: 'R3 · Cable Standing Curl · 10–15', fields: ['weight', 'reps'] },
            { id: 'tr3', label: 'R3 · Cable Tricep Pushdown · 10–15', fields: ['weight', 'reps'] },
          ],
        },
      ],
    },
    w2_thu: {
      name: 'Interval Conditioning · Race Pace',
      modality: true,
      hrCard: 'hard2',
      blocksRun: [
        {
          id: 'pogo', title: 'Pogo Jump Series', meta: '1 set of 1–2 reps · 1–2 full rounds',
          sets: [{ id: 'pogo1', label: 'Pogo jumps', fields: ['notes'] }],
        },
        {
          id: 'wu_run', title: 'Easy Run + Strides', meta: '15 min easy · Z2 HR <139 · 3×20s strides',
          cues: '15 min easy run with some progressive strides to warm up. A stride is a faster run but not an all-out sprint. Option 1 (Run) or Option 2 (Row), not both.',
          sets: [
            { id: 'wu15', label: '15 min easy · Z2 HR <139', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
            { id: 'str1', label: 'Stride 1 · 20s', fields: ['notes'] },
            { id: 'str2', label: 'Stride 2 · 20s', fields: ['notes'] },
            { id: 'str3', label: 'Stride 3 · 20s', fields: ['notes'] },
          ],
        },
        {
          id: 'rpi', title: 'Race Pace Intervals', meta: 'HARD · repeat 8x · 2 min @ race pace · 2 min rest easy jog',
          cues: 'Race pace = what you held for 10 min, now held for 2 min. Oct 15 TT: 2.08 km · 4:49/km · 1.29 mi · 7:45/mi → ~0.41 km / 0.26 mi per 2 min rep.',
          sets: [
            { id: 'i1', label: 'Rep 1 · 2 min @ race pace (~4:49/km · 7:45/mi)', fields: ['distance', 'time', 'avgHr', 'rpe', 'notes'] },
            { id: 'i2', label: 'Rep 2 · 2 min @ race pace (~4:49/km · 7:45/mi)', fields: ['distance', 'time', 'avgHr', 'rpe', 'notes'] },
            { id: 'i3', label: 'Rep 3 · 2 min @ race pace (~4:49/km · 7:45/mi)', fields: ['distance', 'time', 'avgHr', 'rpe', 'notes'] },
            { id: 'i4', label: 'Rep 4 · 2 min @ race pace (~4:49/km · 7:45/mi)', fields: ['distance', 'time', 'avgHr', 'rpe', 'notes'] },
            { id: 'i5', label: 'Rep 5 · 2 min @ race pace (~4:49/km · 7:45/mi)', fields: ['distance', 'time', 'avgHr', 'rpe', 'notes'] },
            { id: 'i6', label: 'Rep 6 · 2 min @ race pace (~4:49/km · 7:45/mi)', fields: ['distance', 'time', 'avgHr', 'rpe', 'notes'] },
            { id: 'i7', label: 'Rep 7 · 2 min @ race pace (~4:49/km · 7:45/mi)', fields: ['distance', 'time', 'avgHr', 'rpe', 'notes'] },
            { id: 'i8', label: 'Rep 8 · 2 min @ race pace (~4:49/km · 7:45/mi)', fields: ['distance', 'time', 'avgHr', 'rpe', 'notes'] },
          ],
        },
        {
          id: 'cd', title: 'Cool Down', meta: '15 min easy · Z2 HR <139',
          sets: [{ id: 'cd15', label: '15 min easy jog', fields: ['distance', 'avgHr', 'notes'] }],
        },
      ],
      blocksRow: [
        {
          id: 'pogo_r', title: 'Pogo Jump Series', meta: '1 set of 1–2 reps · 1–2 full rounds',
          sets: [{ id: 'pogo_r1', label: 'Pogo jumps', fields: ['notes'] }],
        },
        {
          id: 'wu_r', title: 'Easy Row Warm-up', meta: '10 min easy row · 18–22 s/m',
          cues: 'Can be a Row, Ski or Bike (C2 bike: double the distance). Option 1 (Run) or Option 2 (Row), not both.',
          sets: [{ id: 'rwu10', label: '10 min easy · 18–22 s/m', fields: ['distance', 'avgHr', 'notes'] }],
        },
        {
          id: 'r500', title: '500m Intervals', meta: 'HARD · repeat 8x · 500m @ 2k pace +3s · 2 min rest',
          cues: 'Race pace effort: e.g. if 2k race pace is 1:45/500m, today is 1:48/500m. C2 bike: 1000m.',
          sets: [
            { id: 'r500_1', label: '500m #1 · 2k pace +3s', fields: ['time', 'avgHr', 'rpe', 'notes'] },
            { id: 'r500_2', label: '500m #2 · 2k pace +3s', fields: ['time', 'avgHr', 'rpe', 'notes'] },
            { id: 'r500_3', label: '500m #3 · 2k pace +3s', fields: ['time', 'avgHr', 'rpe', 'notes'] },
            { id: 'r500_4', label: '500m #4 · 2k pace +3s', fields: ['time', 'avgHr', 'rpe', 'notes'] },
            { id: 'r500_5', label: '500m #5 · 2k pace +3s', fields: ['time', 'avgHr', 'rpe', 'notes'] },
            { id: 'r500_6', label: '500m #6 · 2k pace +3s', fields: ['time', 'avgHr', 'rpe', 'notes'] },
            { id: 'r500_7', label: '500m #7 · 2k pace +3s', fields: ['time', 'avgHr', 'rpe', 'notes'] },
            { id: 'r500_8', label: '500m #8 · 2k pace +3s', fields: ['time', 'avgHr', 'rpe', 'notes'] },
          ],
        },
        {
          id: 'cd_r', title: 'Cool Down', meta: '5 min easy',
          sets: [{ id: 'rcd5', label: '5 min easy', fields: ['distance', 'avgHr', 'notes'] }],
        },
      ],
    },
    w2_fri: {
      name: 'Full Body 3 (Deadlift Focused) · optional / usually skipped',
      weightUnit: 'kg',
      blocks: [
        {
          id: 'wu', title: 'Warm up · Circuit', meta: 'Repeat 2x · 1 min Bike Erg · 10–15 DB RDL · 6 Tall Kneeling Around The World Slams',
          cues: 'Optional / usually skipped. DB RDLs: use a load heavy enough to actually warm up your hinge. Tall kneeling ball slams: done with some intensity. Rest as much as you need between rounds.',
          sets: [
            { id: 'wu1', label: 'Round 1 · Bike Erg 1 min · DB RDL 10–15 · Slams x6', fields: ['notes'] },
            { id: 'wu2', label: 'Round 2 · Bike Erg 1 min · DB RDL 10–15 · Slams x6', fields: ['notes'] },
          ],
        },
        {
          id: 'dl', title: 'A. Deadlift', meta: '3 sets x 5 reps Deficit Barbell Deadlift · 2 min rest · RPE 6/7',
          cues: 'Make sure you are not touching and going here. Use a 20kg plate as a deficit. Rest as much as you need between sets.',
          sets: [
            { id: 'dl1', label: 'Set 1 · 5 reps', fields: ['weight', 'reps', 'rpe'] },
            { id: 'dl2', label: 'Set 2 · 5 reps', fields: ['weight', 'reps', 'rpe'] },
            { id: 'dl3', label: 'Set 3 · 5 reps', fields: ['weight', 'reps', 'rpe'] },
          ],
        },
        {
          id: 'bp', title: 'B. Bench Press', meta: 'Bench Maintenance · 4 sets x 5 reps Barbell Bench Press · 2 min rest · RPE 6/7',
          cues: 'Same as last week, so progress loads from last week on one set or across multiple sets. Goal is to maintain technical efficiency during this phase without pushing the bench hard. Aim for similar or the same load across all sets.',
          sets: [
            { id: 'bp1', label: 'Set 1 · 5 reps', fields: ['weight', 'reps', 'rpe'] },
            { id: 'bp2', label: 'Set 2 · 5 reps', fields: ['weight', 'reps', 'rpe'] },
            { id: 'bp3', label: 'Set 3 · 5 reps', fields: ['weight', 'reps', 'rpe'] },
            { id: 'bp4', label: 'Set 4 · 5 reps', fields: ['weight', 'reps', 'rpe'] },
          ],
        },
        {
          id: 'qg', title: 'C. Quad + Glute Accessory', meta: 'Squat Accessory · 3 sets x 8–10 reps Machine Leg Press · 2 min rest · 0–1 RIR',
          cues: 'Same as last week, progress loads or reps. Feet around squat stance width. Hit similar depth to your squat. No leg press: barbell front squat instead.',
          sets: [
            { id: 'lp1', label: 'Set 1 · 8–10 reps', fields: ['weight', 'reps', 'rpe'] },
            { id: 'lp2', label: 'Set 2 · 8–10 reps', fields: ['weight', 'reps', 'rpe'] },
            { id: 'lp3', label: 'Set 3 · 8–10 reps', fields: ['weight', 'reps', 'rpe'] },
          ],
        },
        {
          id: 'ubd', title: 'D. Upper Back + Delt Accessory', meta: 'Superset · 3 sets · 8–12 Plate Loaded Chest Supported Row · 10–15 DB Seated Lateral Raise · 2 min rest · 0–1 RIR',
          cues: 'Same as last week, progress loads or reps. Chest supported row: hands and elbows around 45°, big reach at the bottom, drive elbows back behind the body at the top, machine row if possible. Seated lateral raise: knuckles facing the ceiling, arms out and away from you.',
          sets: [
            { id: 'csr1', label: 'R1 · Chest Supported Row · 8–12', fields: ['weight', 'reps', 'rpe'] },
            { id: 'lat1', label: 'R1 · DB Seated Lateral Raise · 10–15', fields: ['weight', 'reps'] },
            { id: 'csr2', label: 'R2 · Chest Supported Row · 8–12', fields: ['weight', 'reps', 'rpe'] },
            { id: 'lat2', label: 'R2 · DB Seated Lateral Raise · 10–15', fields: ['weight', 'reps'] },
            { id: 'csr3', label: 'R3 · Chest Supported Row · 8–12', fields: ['weight', 'reps', 'rpe'] },
            { id: 'lat3', label: 'R3 · DB Seated Lateral Raise · 10–15', fields: ['weight', 'reps'] },
          ],
        },
        {
          id: 'fin', title: 'E. Arms + Abs', meta: '3 rounds · 10–15 Cable Crossover Tricep Extensions · 10–15 Barbell Curls · 5–20 Roll Out · 2 min rest · 0–1 RIR',
          cues: 'Same as last week, progress loads or reps. Tricep extension: cuffs if you have them, fully straighten the arm at the bottom. Curl: supinated grip (palms up). Ab wheel roll out: start on the knees, progress to standing if able (very hard); a band around the waist tied behind you can assist. No ab wheel: short bar or EZ bar.',
          sets: [
            { id: 'tri1', label: 'R1 · Cable Crossover Tricep Ext · 10–15', fields: ['weight', 'reps'] },
            { id: 'bbc1', label: 'R1 · Barbell Curl · 10–15', fields: ['weight', 'reps'] },
            { id: 'ro1', label: 'R1 · Roll Out · 5–20', fields: ['reps', 'notes'] },
            { id: 'tri2', label: 'R2 · Cable Crossover Tricep Ext · 10–15', fields: ['weight', 'reps'] },
            { id: 'bbc2', label: 'R2 · Barbell Curl · 10–15', fields: ['weight', 'reps'] },
            { id: 'ro2', label: 'R2 · Roll Out · 5–20', fields: ['reps', 'notes'] },
            { id: 'tri3', label: 'R3 · Cable Crossover Tricep Ext · 10–15', fields: ['weight', 'reps'] },
            { id: 'bbc3', label: 'R3 · Barbell Curl · 10–15', fields: ['weight', 'reps'] },
            { id: 'ro3', label: 'R3 · Roll Out · 5–20', fields: ['reps', 'notes'] },
          ],
        },
      ],
    },
    w2_sat: {
      name: 'Tempo Conditioning',
      modality: true,
      hrCard: 'tempo',
      blocksRun: [
        {
          id: 'pogo', title: 'Pogo Jump Series', meta: '1 set of 1–2 reps · 1–2 full rounds',
          sets: [{ id: 'pogo1', label: 'Pogo jumps', fields: ['notes'] }],
        },
        {
          id: 'wu', title: 'Easy Run Warm-up', meta: '10 min easy · Z2 HR <139',
          cues: 'Option 1 (Run) or Option 2 (Row), not both.',
          sets: [{ id: 'wu10', label: '10 min easy · Z2 HR <139', fields: ['distance', 'avgHr', 'notes'] }],
        },
        {
          id: 'tempo', title: 'Tempo Run', meta: 'MODERATE · repeat 4x · 1 km @ tempo (Z3 HR 139–158, cap 158) · 2 min rest easy jog',
          cues: 'Aim for consistency across sets; choice of 3–4 sets.',
          sets: [
            { id: 't1', label: 'Tempo 1 · 1 km / 0.62 mi · HR 139–158', fields: ['distance', 'time', 'avgHr', 'rpe', 'notes'] },
            { id: 'tr1', label: 'Easy jog 2 min', fields: ['notes'] },
            { id: 't2', label: 'Tempo 2 · 1 km / 0.62 mi · HR 139–158', fields: ['distance', 'time', 'avgHr', 'rpe', 'notes'] },
            { id: 'tr2', label: 'Easy jog 2 min', fields: ['notes'] },
            { id: 't3', label: 'Tempo 3 · 1 km / 0.62 mi · HR 139–158', fields: ['distance', 'time', 'avgHr', 'rpe', 'notes'] },
            { id: 'tr3', label: 'Easy jog 2 min', fields: ['notes'] },
            { id: 't4', label: 'Tempo 4 · 1 km / 0.62 mi · HR 139–158 (optional)', fields: ['distance', 'time', 'avgHr', 'rpe', 'notes'] },
          ],
        },
        {
          id: 'cd', title: 'Cool Down', meta: '5 min easy · Z2 HR <139',
          sets: [{ id: 'cd5', label: '5 min cool down', fields: ['distance', 'avgHr', 'notes'] }],
        },
      ],
      blocksRow: [
        {
          id: 'pogo_r', title: 'Pogo Jump Series', meta: '1 set of 1–2 reps · 1–2 full rounds',
          sets: [{ id: 'pogo_r1', label: 'Pogo jumps', fields: ['notes'] }],
        },
        {
          id: 'wu_r', title: 'Easy Row Warm-up', meta: '10 min easy row · 18–20 s/m',
          cues: 'Option 1 (Run) or Option 2 (Row), not both.',
          sets: [{ id: 'rwu10', label: '10 min easy · 18–20 s/m', fields: ['distance', 'avgHr', 'notes'] }],
        },
        {
          id: 'tempo_r', title: 'Tempo Row', meta: 'MODERATE · repeat 4x · 1.5 km row @ tempo 20–24 s/m · HR 139–158 (cap 158) · 2 min rest',
          cues: 'Aim for consistency across sets; choice of 3–4 sets.',
          sets: [
            { id: 'rt1', label: 'Tempo 1 · 1.5 km · 20–24 s/m', fields: ['distance', 'time', 'avgHr', 'rpe', 'notes'] },
            { id: 'rtr1', label: 'Rest 2 min', fields: ['notes'] },
            { id: 'rt2', label: 'Tempo 2 · 1.5 km · 20–24 s/m', fields: ['distance', 'time', 'avgHr', 'rpe', 'notes'] },
            { id: 'rtr2', label: 'Rest 2 min', fields: ['notes'] },
            { id: 'rt3', label: 'Tempo 3 · 1.5 km · 20–24 s/m', fields: ['distance', 'time', 'avgHr', 'rpe', 'notes'] },
            { id: 'rtr3', label: 'Rest 2 min', fields: ['notes'] },
            { id: 'rt4', label: 'Tempo 4 · 1.5 km · 20–24 s/m (optional)', fields: ['distance', 'time', 'avgHr', 'rpe', 'notes'] },
          ],
        },
        {
          id: 'cd_r', title: 'Cool Down', meta: '5 min easy row · 18–20 s/m',
          sets: [{ id: 'rcd5', label: '5 min easy · 18–20 s/m', fields: ['distance', 'avgHr', 'notes'] }],
        },
      ],
    },
    w2_sun: {
      name: 'Rest Day',
      blocks: [
        {
          id: 'rest', title: 'Rest / Recovery', meta: 'Walk, stretch, sleep — optional notes',
          sets: [{ id: 'rest1', label: 'How you feel', fields: ['notes', 'rpe'] }],
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

  // —— Week 3 sessions ——
  // FB1 / FB2 repeat the Week 2 prescriptions (same block + set ids, so last week's loads prefill); deep-cloned before normalization.
  const cloneSession = sid => JSON.parse(JSON.stringify(SESSIONS[sid]));
  const coreBlock = (note) => ({
    id: 'core', title: 'Added · Core', meta: 'Hanging Knee Raise · 3 sets x 8–12 · added by Terry',
    cues: note,
    sets: [
      { id: 'kr1', label: 'Set 1 · Hanging Knee Raise · 8–12', fields: ['reps', 'notes'] },
      { id: 'kr2', label: 'Set 2 · Hanging Knee Raise · 8–12', fields: ['reps', 'notes'] },
      { id: 'kr3', label: 'Set 3 · Hanging Knee Raise · 8–12', fields: ['reps', 'notes'] },
    ],
  });

  SESSIONS.w3_mon = cloneSession('w2_mon');
  (function () {
    const s = SESSIONS.w3_mon;
    const b = id => s.blocks.find(x => x.id === id);
    b('bs').cues = 'Done 10/26: 4 × 6 @ 100 kg (220 lb) on the Nautilus Freedom Rack (its own 20 kg / 44 lb bar that moves vertically and horizontally, so not directly comparable to a free bar or Smith). RPE not reported. ' + b('bs').cues;
    b('pp').cues = 'Done 10/26: weighted push-up 3 × 10 @ +20 kg (44 lb); no cable available, so the cable seated row was subbed with a DB 3-point bench row 3 × 8 @ 22.7 kg (50 lb) DB. ' + b('pp').cues;
    b('gl').meta = 'Skipped 10/26 (time) · ' + b('gl').meta;
    b('fin').meta = 'Skipped 10/26 (time) · ' + b('fin').meta;
    s.blocks.push(coreBlock('Done 10/26: 3 sets; set 1 = 8 reps, sets 2–3 counts not reported (~8).'));
  })();

  SESSIONS.w3_tue = {
    name: 'Easy Conditioning',
    modality: true,
    hrCard: 'easy3',
    duration: '~45 min',
    blocksRun: [
      {
        id: 'pogo', title: 'Warm up · Pogo Warm Up', meta: '1 set · 1–2 reps Pogo Jump Series',
        cues: 'Take yourself through 1–2 full rounds of the pogo jump series.',
        sets: [{ id: 'pogo1', label: 'Pogo jumps', fields: ['notes'] }],
      },
      {
        id: 'prog', title: 'A. Easy Conditioning (Run Option)', meta: 'Progressive Easy Run · 50 min @ Easy run · continuous, no rest between stages',
        cues: 'Choose Option 1 or Option 2, not both. First 20 min easy; next 20 min comfortable aerobic effort; final 10 min slightly quicker, still conversational. Target: Z2, keep under 139 bpm for the first 40 min; last 10 min may drift slightly but stay conversational and below Z3 (<139). Est. total 6.06 km–6.67 km at 7:30–8:15/km.',
        sets: [
          { id: 'pr1', label: '0–20 min · 20 min easy · HR <139', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
          { id: 'pr2', label: '20–40 min · 20 min comfortable aerobic · HR <139', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
          { id: 'pr3', label: '40–50 min · 10 min slightly quicker, conversational · HR <139', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
        ],
      },
    ],
    blocksRow: [
      {
        id: 'pogo_r', title: 'Warm up · Pogo Warm Up', meta: '1 set · 1–2 reps Pogo Jump Series',
        cues: 'Take yourself through 1–2 full rounds of the pogo jump series.',
        sets: [{ id: 'pogo_r1', label: 'Pogo jumps', fields: ['notes'] }],
      },
      {
        id: 'easy_row', title: 'B. Warm Up (Row Option)', meta: '10 min Row Erg · easy · 18 s/m',
        cues: 'Choose Option 1 or Option 2, not both.',
        sets: [{ id: 'row10', label: '10 min easy row · 18 s/m', fields: ['distance', 'avgHr', 'rpe', 'notes'] }],
      },
      {
        id: 'base_r', title: 'Base Intervals', meta: 'Repeat 3x continuous · 10 min Row Erg: 4 min @ 18 · 4 min @ 20 · 2 min @ 22 s/m · no rest between stages or rounds',
        sets: [
          { id: 'rb1', label: 'Round 1 · 10 min · 4/4/2 min @ 18/20/22 s/m', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
          { id: 'rb2', label: 'Round 2 · 10 min · 4/4/2 min @ 18/20/22 s/m', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
          { id: 'rb3', label: 'Round 3 · 10 min · 4/4/2 min @ 18/20/22 s/m', fields: ['distance', 'avgHr', 'rpe', 'notes'] },
        ],
      },
      {
        id: 'cd_r', title: 'Cool Down', meta: '10 min Row Erg · easy · 18 s/m',
        sets: [{ id: 'rcd10', label: '10 min easy row · 18 s/m', fields: ['distance', 'avgHr', 'notes'] }],
      },
    ],
  };

  SESSIONS.w3_thu = {
    name: 'Pace Assessment',
    modality: true,
    hrCard: 'pace3',
    blocksRun: [
      {
        id: 'wu_p', title: 'A. Warm Up (Run Option)', meta: '15 min easy run incl. 3 × 20 s progressive strides · 40 s easy jog after each',
        cues: 'Choose Option 1 or Option 2, not both. Z2, HR under 139 bpm (~7:30–8:15/km · 12:04–13:17/mi). Strides build to about rep pace. Treadmill (1% incline): warm-up 4.5–5.0 mph (7.3–8.0 km/h); strides build 6.0 → ~7.7 mph (9.7 → 12.4 km/h; 10:00 → 7:45/mi, 6:13 → 4:49/km), 40 s jog at ~4.5 mph (7.2 km/h).',
        sets: [
          { id: 'wup15', label: '15 min easy · HR <139', fields: ['distance', 'avgHr', 'notes'] },
          { id: 'strides', label: '3 × 20 s progressive strides', fields: ['notes'] },
        ],
      },
      {
        id: 'p400', title: 'Race Pace Intervals', meta: 'repeat 8x · 400m @ race / test pace · 1:30 easy jog rest',
        cues: 'Test pace 4:49/km (7:45/mi) from the Oct 15 test → each 400m ≈ 1:56. Hold 1:54–1:58; back off if rep 1 is under 1:52. Jog the full 90 s, slowly. Treadmill (1% incline): reps 7.7 mph (12.4 km/h) = 7:45/mi, 4:49/km, ~1:56/rep; band 7.6–7.9 mph (12.2–12.7 km/h) = 7:36–7:54/mi, 4:43–4:55/km, ~1:53–1:58/rep. Recovery jog 4.0–4.5 mph (6.4–7.2 km/h; 13:20–15:00/mi, 8:17–9:19/km). Press the speed change ~5 s before each change. Today (10/29): run the reps by pace, not HR — ignore HR caps on the reps but keep the watch recording. 0% incline is fine at the same speeds; if 7.7 mph feels comfortable by rep 3, nudge to 7.8. Too fast: fall back to 7.3–7.5 mph (11.7–12.1 km/h, ~8:00–8:13/mi, ~4:58–5:06/km, ~2:00–2:02 per 400m) and hold it even across all reps; on a bad day cut to 6 reps.',
        sets: [
          { id: 'p400_1', label: '400m #1 · target ~1:56 (1:54–1:58)', fields: ['time', 'avgHr', 'rpe', 'notes'] },
          { id: 'p400_2', label: '400m #2 · target ~1:56 (1:54–1:58)', fields: ['time', 'avgHr', 'rpe', 'notes'] },
          { id: 'p400_3', label: '400m #3 · target ~1:56 (1:54–1:58)', fields: ['time', 'avgHr', 'rpe', 'notes'] },
          { id: 'p400_4', label: '400m #4 · target ~1:56 (1:54–1:58)', fields: ['time', 'avgHr', 'rpe', 'notes'] },
          { id: 'p400_5', label: '400m #5 · target ~1:56 (1:54–1:58)', fields: ['time', 'avgHr', 'rpe', 'notes'] },
          { id: 'p400_6', label: '400m #6 · target ~1:56 (1:54–1:58)', fields: ['time', 'avgHr', 'rpe', 'notes'] },
          { id: 'p400_7', label: '400m #7 · target ~1:56 (1:54–1:58)', fields: ['time', 'avgHr', 'rpe', 'notes'] },
          { id: 'p400_8', label: '400m #8 · target ~1:56 (1:54–1:58)', fields: ['time', 'avgHr', 'rpe', 'notes'] },
        ],
      },
      {
        id: 'cd_p', title: 'Cool Down', meta: '15 min easy run',
        cues: 'Z2, HR under 139 bpm. Treadmill (1% incline): 4.5–5.0 mph (7.3–8.0 km/h; 12:04–13:17/mi, 7:30–8:15/km).',
        sets: [{ id: 'cdp15', label: '15 min easy · HR <139', fields: ['distance', 'avgHr', 'notes'] }],
      },
    ],
    blocksRow: [
      {
        id: 'easy_row_p', title: 'B. Easy Row (Row Option)', meta: '10 min Row Erg · easy · 18–22 s/m',
        cues: 'Choose Option 1 or Option 2, not both.',
        sets: [{ id: 'rowp10', label: '10 min easy row · 18–22 s/m', fields: ['distance', 'avgHr', 'rpe', 'notes'] }],
      },
      {
        id: 'p500', title: '500m Intervals', meta: 'repeat 8x · 500m @ 2k pace +3s · 1:30 rest',
        cues: 'Rest of the row option (after the intervals) was not visible in the screenshot.',
        sets: [
          { id: 'p500_1', label: '500m #1 · 2k pace +3s', fields: ['time', 'avgHr', 'rpe', 'notes'] },
          { id: 'p500_2', label: '500m #2 · 2k pace +3s', fields: ['time', 'avgHr', 'rpe', 'notes'] },
          { id: 'p500_3', label: '500m #3 · 2k pace +3s', fields: ['time', 'avgHr', 'rpe', 'notes'] },
          { id: 'p500_4', label: '500m #4 · 2k pace +3s', fields: ['time', 'avgHr', 'rpe', 'notes'] },
          { id: 'p500_5', label: '500m #5 · 2k pace +3s', fields: ['time', 'avgHr', 'rpe', 'notes'] },
          { id: 'p500_6', label: '500m #6 · 2k pace +3s', fields: ['time', 'avgHr', 'rpe', 'notes'] },
          { id: 'p500_7', label: '500m #7 · 2k pace +3s', fields: ['time', 'avgHr', 'rpe', 'notes'] },
          { id: 'p500_8', label: '500m #8 · 2k pace +3s', fields: ['time', 'avgHr', 'rpe', 'notes'] },
        ],
      },
    ],
  };

  // Thu 10/29 actuals (Terry): treadmill, 0% incline, run by pace not HR.
  (function () {
    const s = SESSIONS.w3_thu;
    const b = id => s.blocksRun.find(x => x.id === id);
    
    b('wu_p').meta = '✓ Done 10/29 (per plan; details not reported) · ' + b('wu_p').meta;
    b('p400').meta = '✓ Done 10/29 · 6 of 8 reps (stopped at 6 by choice) · ' + b('p400').meta;
    b('p400').cues = 'Done 10/29 on the treadmill at 0% incline, run by pace (not HR): reps 1–4 @ 7.6 mph (12.2 km/h, ~4:54/km · ~7:54/mi, ~1:58 per 400m); reps 5–6 @ 7.7 mph (12.4 km/h, ~4:51/km · ~7:48/mi, ~1:56 per 400m). Reps 7–8 not run (stopped at 6 by choice). Cool-down skipped (left early for an evening event). HR not reported. ' + b('p400').cues;
    b('p400').sets.forEach((set, i) => {
      if (i < 4) set.label += ' · done @ 7.6 mph (~1:58)';
      else if (i < 6) set.label += ' · done @ 7.7 mph (~1:56)';
      else set.label += ' · not run (stopped at 6)';
    });
    b('cd_p').meta = 'Skipped 10/29 (left early for an evening event) · ' + b('cd_p').meta;
  })();

  SESSIONS.w3_wed = cloneSession('w2_wed');
  (function () {
    const s = SESSIONS.w3_wed;
    const b = id => s.blocks.find(x => x.id === id);
    b('sp').meta += ' · start 55 kg (121 lb) → 57.5 kg (127 lb)';
    b('sp').cues = 'Target (based on last week\'s 4×6 @ 52.2 kg / 115 lb): start at 55 kg (121 lb); if 3–4 reps in reserve, go to 57.5 kg (127 lb); 60 kg (132 lb) only on the last set if 57.5 felt easy. 3RM 83.9 kg / 185 lb. ' + b('sp').cues;
    b('qg').meta += ' · 15.9 kg (35 lb) DBs 3×8/leg';
    b('pu').meta += ' · ✓ DONE 10/28';
    b('pu').cues = 'Done 10/28 (all sets): chin-up 3 × 6 bodyweight, strict dip 3 × 10 bodyweight (same as last week). ' + (b('pu').cues || '');
    b('qg').cues = 'Target (based on last week\'s 3×8 @ 13.6 kg / 30 lb DBs): 15.9 kg (35 lb) DBs, 3×8 each leg; push sets 2–3 toward 10 reps if easy. If form breaks before 8, drop to 13.6 kg (30 lb) for 3×10. ' + (b('qg').cues || '');
    b('dc').meta = 'Skipped 10/28 · ' + b('dc').meta + ' · time tip: 60–75 s rest';
    b('arms').meta = 'Skipped 10/28 · ' + b('arms').meta + ' · 0–1 RIR · time tip: 60–75 s rest';
    s.blocks.push(coreBlock('Skipped 10/28.'));
    s.blocks[s.blocks.length - 1].meta = 'Skipped 10/28 · ' + s.blocks[s.blocks.length - 1].meta;
    b('sm').meta = '✓ Done 10/28 · ' + b('sm').meta;
    b('sp').meta += ' · ✓ DONE 10/28 (loads pending)';
    b('sp').cues = 'Done 10/28: all 4 sets; loads not reported yet. ' + b('sp').cues;
    b('qg').meta += ' · ✓ DONE 10/28 (loads pending)';
  })();

  // Week 2 Wed actual (old app history, dated 19 Oct there). Added after the w3 clone so Week 3 doesn't inherit it.
  (function () {
    const sp = SESSIONS.w2_wed.blocks.find(x => x.id === 'sp');
    sp.cues = 'Actual: 4 sets × 6 reps @ 52.2 kg (115 lb) (old app history). ' + sp.cues;
    const qg = SESSIONS.w2_wed.blocks.find(x => x.id === 'qg');
    qg.cues = 'Actual: 3 sets × 8 reps each leg @ 13.6 kg (30 lb) DBs (old app history). ' + (qg.cues || '');
    const pu = SESSIONS.w2_wed.blocks.find(x => x.id === 'pu');
    pu.cues = 'Actual: chin-up 3 × 6 bodyweight, strict dip 3 × 10 bodyweight (Terry 10/28: same as Week 3). ' + (pu.cues || '');
    // Week 1 FB2 (app history dated 14 Oct)
    const qg1 = SESSIONS.tue.blocks.find(x => x.id === 'qg');
    qg1.cues = 'Actual: Deficit DB reverse lunge 3 × 8 each leg @ 9.1 / 11.3 / 13.6 kg (20 / 25 / 30 lb) DBs (old app history). ' + (qg1.cues || '');
  })();

  ['w3_fri', 'w3_sat', 'w3_sun'].forEach(id => {
    SESSIONS[id] = {
      name: 'Awaiting screenshots',
      blocks: [{
        id: 'tbd', title: 'Session not added yet', meta: 'Added once the coach app screenshot comes in · notes only for now',
        sets: [{ id: 'tbd1', label: 'Notes', fields: ['notes'] }],
      }],
    };
  });

  // —— v2: normalize set fields ——
  // RIR blocks log RIR (not RPE); every run/row segment gets a time field; fixed-distance
  // row pieces (500m, 2000m) get a distance field so pace shows in /km and /mi.
  Object.keys(SESSIONS).forEach(sid => {
    const s = SESSIONS[sid];
    const lists = s.modality ? [s.blocksRun || [], s.blocksRow || []] : [s.blocks || []];
    lists.forEach(list => list.forEach(block => {
      const rir = /\bRIR\b/.test(block.meta || '');
      (block.sets || []).forEach(set => {
        let f = set.fields.slice();
        if (!s.modality && rir && f.includes('rpe')) { f = f.map(x => (x === 'rpe' ? 'rir' : x)); set.legacyRpe = true; }
        if (s.modality) {
          if (!f.includes('time') && (f.includes('distance') || f.includes('avgHr'))) {
            const i = f.indexOf('distance');
            f.splice(i >= 0 ? i + 1 : 0, 0, 'time');
          }
          if (!f.includes('distance') && f.includes('time') && (labelDistanceKm(set.label) != null || labelDistanceKm(block.meta) != null)) f.unshift('distance');
        }
        set.fields = f;
      });
    }));
  });

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
  const TODAY_DAY = ALL_DAYS.find(d => d.date === REAL_TODAY);
  let selectedSessionId = (TODAY_DAY && state.todayOverrideDate !== REAL_TODAY) ? TODAY_DAY.id : (
    (state.todayOverrideSession && SESSIONS[state.todayOverrideSession]) ? state.todayOverrideSession : (
    REAL_TODAY === '2026-10-15' ? DEFAULT_SESSION_FOR_TODAY :
    (TODAY_DAY || {}).id || (REAL_TODAY >= WEEK3[0].date ? WEEK3[0].id : REAL_TODAY >= WEEK2[0].date ? WEEK2[0].id : DEFAULT_SESSION_FOR_TODAY)
  ));
  function dayFor(id) { return ALL_DAYS.find(d => d.id === id); }
  let selectedWeek = (dayFor(selectedSessionId) || {}).week || 3;
  function weightUnitFor(sessionId) { return (SESSIONS[sessionId] && SESSIONS[sessionId].weightUnit) || 'lb'; }
  function kgToLbLabel(v) {
    const n = parseNum(v);
    return n == null ? '' : '= ' + (Math.round(n * 2.20462 * 10) / 10) + ' lb';
  }
  let openBlocks = new Set();

  function defaultState() {
    return {
      version: 2,
      logs: {}, // sessionId -> { modality, blocks: {blockId:{done,sets:{setId:{done,fields,updatedAt}}}}, notes, savedAt, updatedAt }
      todayOverrideSession: null,
      kpis: {},
      weighins: [], // [{id, measuredAt, weightLb, notes, deleted, updatedAt}]
      updatedAt: 0,
    };
  }

  function loadState() {
    let parsed = BOOT && BOOT.state ? BOOT.state : null;
    if (!parsed) {
      try { const raw = localStorage.getItem(STORAGE_KEY); parsed = raw ? JSON.parse(raw) : null; } catch (_) { parsed = null; }
    }
    if (!parsed || typeof parsed !== 'object') return defaultState();
    const merged = Object.assign(defaultState(), parsed);
    delete merged.unit; // v2: canonical km only; dual display always
    merged.version = 2;
    if (!merged.logs || typeof merged.logs !== 'object') merged.logs = {};
    if (!Array.isArray(merged.weighins)) merged.weighins = [];
    return merged;
  }

  /** Give every legacy (v1.x) log/set a timestamp so cloud merges are deterministic. */
  function stampMissingTimestamps() {
    const fallback = Date.parse(state.migratedAt || '') || Date.now();
    let stamped = 0;
    Object.keys(state.logs || {}).forEach(sid => {
      const log = state.logs[sid];
      if (!log || typeof log !== 'object') return;
      const base = Date.parse(log.savedAt || '') || fallback;
      if (!log.updatedAt) { log.updatedAt = base; stamped++; }
      Object.keys(log.blocks || {}).forEach(bid => {
        const sets = (log.blocks[bid] && log.blocks[bid].sets) || {};
        Object.keys(sets).forEach(k => { if (sets[k] && !sets[k].updatedAt) { sets[k].updatedAt = base; stamped++; } });
      });
    });
    (state.weighins || []).forEach(w => { if (!w.updatedAt) { w.updatedAt = Date.parse(w.measuredAt) || fallback; stamped++; } });
    return stamped;
  }

  // —— Change tracking → outbox rows ——
  const rowSigs = new Map();   // row key -> JSON signature of last saved/synced content
  const remoteTs = new Map();  // row key -> cloud client_updated_at (ms), learned on pull
  let syncStatus = { state: 'local-only', pending: 0 };

  function saveState() {
    const now = Date.now();
    state.updatedAt = now;
    const changed = [];
    collectRows().forEach(r => {
      if (rowSigs.get(r.key) !== r.sig) {
        rowSigs.set(r.key, r.sig);
        if (r.obj) r.obj.updatedAt = now;
        changed.push(r);
      }
    });
    const syncing = !!(window.HTSync && window.HTSync.configured);
    const items = syncing ? changed.map(outboxItem) : [];
    let p;
    if (window.HTStore) p = window.HTStore.commit(state, items);
    else {
      p = new Promise((resolve, reject) => {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); resolve(); } catch (e) { reject(e); }
      });
    }
    p.catch(() => toast('Could not save — storage full?'));
    if (items.length) window.HTSync.kick();
    paintSyncMarks();
    return p;
  }

  function outboxItem(r) {
    const ts = (r.obj && r.obj.updatedAt) || Date.now();
    return { key: r.key, table: r.table, row: Object.assign({}, r.row, { client_updated_at: new Date(ts).toISOString() }) };
  }

  function num(v, lo, hi, digits) {
    const n = parseNum(v);
    if (n == null) return null;
    if (lo != null && n < lo) return null;
    if (hi != null && n > hi) return null;
    const f = Math.pow(10, digits == null ? 2 : digits);
    return Math.round(n * f) / f;
  }

  function findBlockSet(sid, bid, setId) {
    const s = SESSIONS[sid];
    if (!s) return {};
    let lists = s.modality ? [['run', s.blocksRun || []], ['row', s.blocksRow || []]] : [[null, s.blocks || []]];
    const log = state.logs[sid];
    if (s.modality && log && log.modality === 'row') lists = lists.slice().reverse();
    for (const [mod, list] of lists) {
      const b = list.find(x => x.id === bid);
      if (b) return { block: b, set: (b.sets || []).find(x => x.id === setId), modality: mod };
    }
    return {};
  }

  function setRow(sid, bid, setId, sLog) {
    const { block, set } = findBlockSet(sid, bid, setId);
    const f = sLog.fields || {};
    const unit = weightUnitFor(sid);
    const w = num(f.weight, 0, 9999);
    const tgt = sLog.target || {};
    return {
      table: 'set_logs',
      row: {
        session_key: sid, block_id: bid, set_id: setId,
        block_title: block ? block.title : null, set_label: set ? set.label : null,
        done: !!sLog.done,
        weight: w, weight_unit: w != null ? unit : null,
        weight_lb: w != null ? (unit === 'kg' ? Math.round(w * 2.20462 * 100) / 100 : w) : null,
        reps: num(f.reps, 0, 9999, 1), rpe: num(f.rpe, 0, 10, 1), rir: num(f.rir, 0, 10, 1),
        target_reps: (set && targetReps(set)) || (tgt.reps ? String(tgt.reps) : null),
        target_load: tgt.weight ? String(tgt.weight) + ' ' + unit : null,
        notes: f.notes || null,
        fields: f,
      },
    };
  }

  function segmentRow(sid, bid, setId, sLog) {
    const { block, set, modality } = findBlockSet(sid, bid, setId);
    const f = sLog.fields || {};
    const km = num(f.distance, 0, 9999, 3);
    const sec = parseTimeToSec(f.time);
    const dur = sec != null && sec >= 0 && sec < 864000 ? Math.round(sec) : null;
    const pace = km && dur ? Math.round((dur / km) * 100) / 100 : null;
    const hr = num(f.avgHr, 30, 250, 0);
    return {
      table: 'segment_logs',
      row: {
        session_key: sid, block_id: bid, segment_id: setId,
        modality: modality || ((state.logs[sid] || {}).modality === 'row' ? 'row' : 'run'),
        block_title: block ? block.title : null, segment_label: set ? set.label : null,
        done: !!sLog.done,
        distance_km: km, time_text: f.time || null, duration_sec: dur,
        pace_sec_per_km: pace != null && pace < 999999 ? pace : null,
        avg_hr: hr, hr_target: set ? (hrTarget(set, block) || null) : null,
        rpe: num(f.rpe, 0, 10, 1), notes: f.notes || null,
        fields: f,
      },
    };
  }

  function mkRow(table, key, row, obj) { return { table, key, row, obj, sig: JSON.stringify(row) }; }

  function collectRows() {
    const out = [];
    Object.keys(state.logs || {}).forEach(sid => {
      const sess = SESSIONS[sid];
      const day = dayFor(sid);
      const log = state.logs[sid];
      if (!log || typeof log !== 'object') return;
      const blocks = log.blocks || {};
      const blocksDone = {};
      Object.keys(blocks).forEach(b => { if (blocks[b] && blocks[b].done) blocksDone[b] = true; });
      // set/segment rows carry their own data; a session row only when it holds something of its own
      const hasContent = log.notes || log.savedAt || Object.keys(blocksDone).length || log.modality === 'row';
      if (hasContent) {
        out.push(mkRow('sessions', 'sessions|' + sid, {
          session_key: sid,
          week: day ? day.week : null,
          session_date: day ? day.date : null,
          title: sess ? sess.name : (day ? day.title : null),
          modality: sess && sess.modality ? (log.modality === 'row' ? 'row' : 'run') : null,
          notes: log.notes || null,
          saved_at: log.savedAt || null,
          blocks_done: blocksDone,
        }, log));
      }
      Object.keys(blocks).forEach(bid => {
        const sets = (blocks[bid] && blocks[bid].sets) || {};
        Object.keys(sets).forEach(setId => {
          const sLog = sets[setId];
          if (!sLog || typeof sLog !== 'object') return;
          const r = sess && sess.modality ? segmentRow(sid, bid, setId, sLog) : setRow(sid, bid, setId, sLog);
          out.push(mkRow(r.table, r.table + '|' + sid + '|' + bid + '|' + setId, r.row, sLog));
        });
      });
    });
    (state.weighins || []).forEach(w => {
      if (!w || !w.id) return;
      out.push(mkRow('weigh_ins', 'weigh_ins|' + w.id, {
        id: w.id, measured_at: w.measuredAt, weight_lb: num(w.weightLb, 50.01, 699.99), notes: w.notes || null, deleted: !!w.deleted,
      }, w));
    });
    return out.filter(r => !(r.table === 'weigh_ins' && r.row.weight_lb == null));
  }

  /** After sign-in: queue every local row the cloud doesn't already have a newer copy of. */
  function backfill() {
    const items = [];
    collectRows().forEach(r => {
      rowSigs.set(r.key, r.sig);
      const localT = (r.obj && r.obj.updatedAt) || 0;
      const remoteT = remoteTs.get(r.key);
      if (remoteT == null || localT > remoteT) items.push(outboxItem(r));
    });
    if (!items.length) return Promise.resolve();
    return window.HTStore.commit(state, items);
  }

  /** Merge rows pulled from Supabase (last write wins on client_updated_at). */
  function mergeRemote(table, rows) {
    const merged = [];
    rows.forEach(row => {
      const t = Date.parse(row.client_updated_at) || 0;
      if (table === 'sessions') {
        const key = 'sessions|' + row.session_key;
        remoteTs.set(key, t);
        const cur = state.logs[row.session_key];
        if (cur && (cur.updatedAt || 0) >= t) return;
        const L = ensureLog(row.session_key);
        L.notes = row.notes || '';
        L.savedAt = row.saved_at || null;
        if (row.modality) L.modality = row.modality;
        L.blocks = L.blocks || {};
        const bd = row.blocks_done || {};
        Object.keys(L.blocks).forEach(b => { L.blocks[b].done = !!bd[b]; });
        Object.keys(bd).forEach(b => { if (!L.blocks[b]) L.blocks[b] = { done: true, sets: {} }; });
        L.updatedAt = t;
        merged.push(key);
      } else if (table === 'set_logs' || table === 'segment_logs') {
        const setId = row.set_id || row.segment_id;
        const key = table + '|' + row.session_key + '|' + row.block_id + '|' + setId;
        remoteTs.set(key, t);
        const cur = ((((state.logs[row.session_key] || {}).blocks || {})[row.block_id] || {}).sets || {})[setId];
        if (cur && (cur.updatedAt || 0) >= t) return;
        const L = ensureLog(row.session_key);
        if (!L.updatedAt) L.updatedAt = t;
        L.blocks = L.blocks || {};
        if (!L.blocks[row.block_id]) L.blocks[row.block_id] = { done: false, sets: {} };
        if (!L.blocks[row.block_id].sets) L.blocks[row.block_id].sets = {};
        L.blocks[row.block_id].sets[setId] = { done: !!row.done, fields: row.fields || {}, updatedAt: t };
        merged.push(key);
      } else if (table === 'weigh_ins') {
        const key = 'weigh_ins|' + row.id;
        remoteTs.set(key, t);
        const list = state.weighins || (state.weighins = []);
        const cur = list.find(w => w.id === row.id);
        if (cur && (cur.updatedAt || 0) >= t) return;
        const w = { id: row.id, measuredAt: row.measured_at, weightLb: Number(row.weight_lb), notes: row.notes || '', deleted: !!row.deleted, updatedAt: t };
        if (cur) Object.assign(cur, w); else list.push(w);
        merged.push(key);
      }
    });
    if (!merged.length) return;
    const set = new Set(merged);
    collectRows().forEach(r => { if (set.has(r.key)) rowSigs.set(r.key, r.sig); });
    window.HTStore.outboxDrop(merged);
    window.HTStore.commit(state, []);
    softRender();
  }

  /** Re-render unless the user is typing (then retry shortly). */
  let softTimer = null;
  function softRender() {
    clearTimeout(softTimer);
    const active = document.activeElement;
    if (active && /INPUT|TEXTAREA/.test(active.tagName) && root.contains(active)) {
      softTimer = setTimeout(softRender, 1500);
      return;
    }
    render();
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
    ALL_DAYS.forEach(day => {
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
    paintSyncMarks();
  }

  function renderToday() {
    const dayMeta = dayFor(selectedSessionId) || WEEK[3];
    const weekDays = WEEKS[selectedWeek].days;
    const sess = SESSIONS[selectedSessionId];
    const log = ensureLog(selectedSessionId);
    const prog = sessionProgress(selectedSessionId);
    const isShiftedToday = REAL_TODAY === '2026-10-15' && selectedSessionId === 'wed';

    let html = '';
    html += `<div class="card">
      <div class="row space">
        <div>
          <div class="muted">${formatDateLabel(REAL_TODAY)} · logging as · Wk ${dayMeta.week} ${dayMeta.dow} ${dayMeta.short}${sess.duration ? ' · ' + sess.duration : ''}</div>
          <h2 style="margin:4px 0 0">${escapeHtml(sess.name)}</h2>
        </div>
        ${sess.kpi ? `<span class="badge kpi">KPI</span>` : ''}
      </div>
      ${isShiftedToday ? `<p class="muted" style="margin:8px 0 0">Schedule shifted: doing Interval / 10-min TT today (calendar was Deadlift). Pick any session below.</p>` : ''}
      <div class="session-picker" style="margin-top:12px">
        ${Object.keys(WEEKS).map(w => `<button type="button" class="chip ${String(selectedWeek) === w ? 'active' : ''}" data-week="${w}">${WEEKS[w].label}</button>`).join('')}
      </div>
      <div class="session-picker" style="margin-top:8px">
        ${weekDays.map(d => `<button type="button" class="chip ${d.id === selectedSessionId ? 'active' : ''}" data-pick="${d.id}">${d.dow} · ${d.title.split(' ')[0]}${(d.id === 'wed' && REAL_TODAY === '2026-10-15') || (d.date === REAL_TODAY && REAL_TODAY !== '2026-10-15') ? ' ★' : ''}</button>`).join('')}
      </div>
      <div class="progress-bar"><span style="width:${prog.pct}%"></span></div>
      <div class="muted" style="margin-top:6px" data-prog-text>${prog.done}/${prog.total} sets · ${prog.pct}%</div>
    </div>`;
    html += weighinCardHtml();

    if (sess.modality) {
      html += `<div class="card row" style="gap:8px">
        <span class="muted" style="margin-right:4px">Modality</span>
        <button type="button" class="chip ${log.modality !== 'row' ? 'active' : ''}" data-mod="run">Run</button>
        <button type="button" class="chip ${log.modality === 'row' ? 'active' : ''}" data-mod="row">Row</button>
        <span class="muted" style="margin-left:auto;font-size:11px">Dist in km · shows mi + paces</span>
      </div>`;
    }

    if (log.modality !== 'row' || !sess.modality || selectedSessionId === 'fri' || sess.hrCard === 'tempo') html += hrTargetsHtml(selectedSessionId);
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
    if (selectedSessionId === 'fri' || sess.hrCard === 'tempo') {
      html += `<div class="card"><button type="button" class="btn lg" id="btn-open-tempo-timer" style="width:100%">⏱ Start Tempo Timer</button></div>`;
    }

    root.innerHTML = html;
    bindTodayEvents();
  }

  function hrTargetsHtml(id) {
    const z2 = dualPaceRange('7:30', '8:15');
    const card = (SESSIONS[id] || {}).hrCard;
    if (card === 'tempo') id = 'fri';
    if (card === 'easy2') {
      return `<div class="target-card hr-card easy">
        <h4>HR target · EASY / BASE (Z2)</h4>
        <ul>
          <li><strong>Easy (warm-up, cooldown): RPE 3–4, low Z2, HR under 139 bpm</strong> (~<span class="pace">${z2}</span>)</li>
          <li><strong>Base intervals: RPE 4–5</strong>, high Z2 — may touch low Z3 (~140)</li>
          <li>If HR drifts well above that: slow down. Don't chase pace.</li>
        </ul>
      </div>`;
    }
    if (card === 'pace3') {
      return `<div class="target-card hr-card hard">
        <h4>PACE TARGET · 8 × 400m @ TEST PACE</h4>
        <ul>
          <li><strong>Each 400m ≈ 1:56</strong> (hold 1:54–1:58) — test pace ~<span class="pace">${dualPace('4:49')}</span> (Oct 15 test)</li>
          <li>Back off if rep 1 is under 1:52. Jog the full 90 s, slowly.</li>
          <li><strong>Warm-up + cooldown: Z2, HR under 139</strong> (~<span class="pace">${z2}</span>). Strides build to about rep pace.</li>
        </ul>
        <h4>TREADMILL · 1% INCLINE</h4>
        <ul>
          <li><strong>Warm-up / cool-down: 4.5–5.0 mph</strong> (7.3–8.0 km/h) · 12:04–13:17/mi · 7:30–8:15/km · HR &lt;139</li>
          <li><strong>Strides: build 6.0 → ~7.7 mph</strong> (9.7 → 12.4 km/h) · 10:00 → 7:45/mi · 40 s jog ~4.5 mph (7.2 km/h)</li>
          <li><strong>400m reps: 7.7 mph (12.4 km/h)</strong> = 7:45/mi · 4:49/km · ~1:56/rep · band 7.6–7.9 mph (12.2–12.7 km/h) = 7:36–7:54/mi, ~1:53–1:58/rep</li>
          <li><strong>Recovery jog: 4.0–4.5 mph</strong> (6.4–7.2 km/h) · 13:20–15:00/mi · 8:17–9:19/km</li>
          <li>Tip: press the speed change ~5 s before each change.</li>
        </ul>
        <h4>TODAY'S NOTES · THU 10/29</h4>
        <ul>
          <li><strong>Run by pace today, not HR.</strong> Ignore HR caps on the reps, but keep the watch recording.</li>
          <li><strong>0% incline is fine:</strong> keep the same speeds. If 7.7 mph feels comfortable by rep 3, nudge to 7.8.</li>
          <li><strong>Too fast? Fall back to 7.3–7.5 mph</strong> (11.7–12.1 km/h) · ~8:00–8:13/mi · ~4:58–5:06/km · ~2:00–2:02 per 400m. Hold it even across all reps.</li>
          <li>Bad day: cut to 6 reps.</li>
        </ul>
      </div>`;
    }
    if (card === 'easy3') {
      return `<div class="target-card hr-card easy">
        <h4>HR target · PROGRESSIVE EASY RUN (Z2)</h4>
        <ul>
          <li><strong>0–40 min: Z2, HR under 139 bpm</strong> (~<span class="pace">${z2}</span>)</li>
          <li><strong>40–50 min: slightly quicker</strong>, HR may drift but stays conversational and below Z3 (<139)</li>
          <li>Est. 6.06–6.67 km · 3.77–4.14 mi for the 50 min. Don't chase pace.</li>
        </ul>
      </div>`;
    }
    if (card === 'hard2') {
      return `<div class="target-card hr-card hard">
        <h4>HR target · RACE PACE INTERVALS (HARD)</h4>
        <ul>
          <li><strong>Warm-up + cooldown: Z2, HR under 139</strong> (~<span class="pace">${z2}</span>)</li>
          <li><strong>8 × 2 min @ race pace: HARD</strong> — ~<span class="pace">${dualPace('4:49')}</span> (Oct 15 TT pace) · ~${dualKmLabel(0.415)} per rep</li>
          <li>2 min easy jog between efforts. Strides = faster run, not all-out sprint.</li>
        </ul>
      </div>`;
    }
    if (id === 'mon') {
      return `<div class="target-card hr-card easy">
        <h4>HR target · EASY / BASE (Z2)</h4>
        <ul>
          <li><strong>HR under 139 bpm</strong> the whole run (warm-up, base, cooldown)</li>
          <li>Pace is whatever Z2 gives — roughly <span class="pace">${z2}</span></li>
          <li>If HR drifts above 138: slow down or walk briefly. Don't chase pace.</li>
          <li class="muted">Zones from max HR 199 (chest strap, Oct 1 &amp; 4): Z2 119–138 · Z3 139–158 · Z4 159–178</li>
        </ul>
      </div>`;
    }
    if (id === 'fri') {
      return `<div class="moderate-banner">⚠️ MODERATE — don't race it</div>
      <div class="target-card hr-card tempo">
        <h4>HR target · TEMPO (Z3, moderate)</h4>
        <ul>
          <li><strong>Tempo reps: HR 139–158 bpm</strong> (Z3) · <strong>hard cap 158</strong></li>
          <li>Not hard. If HR reaches 158, ease off — Z4 (159+) is too much for this session.</li>
          <li>Oct 10 tempo work laps averaged 159–162 bpm (Z4) — that was too hard.</li>
          <li>Warm-up / jog recoveries / cooldown: Z2, HR under 139 (~<span class="pace">${z2}</span>)</li>
          <li class="muted">Zones from max HR 199 (chest strap, Oct 1 &amp; 4): Z2 119–138 · Z3 139–158 · Z4 159–178</li>
        </ul>
      </div>`;
    }
    if (id === 'wed') {
      return `<div class="target-card hr-card hard">
        <h4>HR target · INTERVALS / TT (HARD)</h4>
        <ul>
          <li><strong>Warm-up + cooldown: Z2, HR under 139</strong> (~<span class="pace">${z2}</span>)</li>
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
        <li><strong>Warm-up:</strong> 20 min easy Z2, <strong>HR under 139</strong> (~<span class="pace">${easy}</span>) · then 3×20s strides</li>
        <li><strong>TT goal:</strong> <span class="pace">${goal}</span> · stretch <span class="pace">${stretch}</span> (avg ~${avgGoal})</li>
        <li><strong>Pacing:</strong> first 2 min ~<span class="pace">${first}</span> (no faster than 4:58/km · ${dualPace('4:58').split(' · ')[1]} first min) · middle <span class="pace">${mid}</span> · push last 2 min</li>
        <li><strong>Checkpoint:</strong> ${cp}</li>
        <li><strong>HR (HARD):</strong> climbs into 180s, 190s at finish · Oct 1 mile was 7:43/mi (4:48/km) but went out ~6:45/mi (4:12/km) and faded — stay patient</li>
        <li><strong>Cooldown:</strong> 10 min easy · Z2 HR under 139</li>
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
        <button type="button" class="check" data-block-done="${block.id}" aria-label="Mark block done">${bLog.done ? '✓' : ''}</button>
        <div style="flex:1">
          <div class="block-title">${escapeHtml(block.title)} ${block.kpi ? '<span class="badge kpi">KPI</span>' : ''}</div>
          <div class="block-meta">${escapeHtml(withUnits(block.meta || ''))}</div>
        </div>
        <span class="muted chev">${isOpen ? '▾' : '▸'}</span>
      </div>
      <div class="block-body">${block.cues ? `<p class="muted" style="margin:0 0 8px;font-size:12px">${escapeHtml(withUnits(block.cues))}</p>` : ''}`;

    block.sets.forEach(set => {
      const sLog = (bLog.sets || {})[set.id] || { done: false, fields: {} };
      const vals = sLog.fields || {};
      let fields = set.fields.slice();
      if (set.legacyRpe && vals.rpe != null && vals.rpe !== '' && !fields.includes('rpe')) fields.push('rpe'); // show RPE typed before v2
      const hr = fields.includes('avgHr') || (SESSIONS[sessionId] || {}).modality ? hrChip(set, block) : '';
      const isSeg = !!(SESSIONS[sessionId] || {}).modality;
      const tKey = (isSeg ? 'segment_logs' : 'set_logs') + '|' + sessionId + '|' + block.id + '|' + set.id;
      const numericCount = fields.filter(f => f !== 'notes').length;
      html += `<div class="set-row ${sLog.done ? 'is-done' : ''}" data-set-row="${block.id}|${set.id}">
        <button type="button" class="set-check ${sLog.done ? 'on' : ''}" data-set-done="${block.id}|${set.id}" aria-label="${sLog.done ? 'Undo set' : 'Log set'}">${sLog.done ? '✓' : ''}</button>
        <div class="set-main">
          <div class="set-label">${escapeHtml(withUnits(set.label))}${hr ? ` <span class="hr-chip">HR ${escapeHtml(hr)}</span>` : ''}</div>
          <div class="set-fields n${numericCount}">
            ${fields.map(f => fieldHtml(sessionId, block, set, f, vals)).join('')}
          </div>
          ${dualPreviewHtml(fields, displayValues(sessionId, block, set, vals), block.id, set.id, sessionId)}
          ${weightUnitFor(sessionId) === 'kg' && fields.includes('weight') ? `<div class="lb-line" id="lb-${block.id}-${set.id}">${escapeHtml(kgToLbLabel(displayValues(sessionId, block, set, vals).weight))}</div>` : ''}
          <div class="sync-mark" data-sync-key="${escapeAttr(tKey)}"></div>
        </div>
      </div>`;
    });

    html += `</div></div>`;
    return html;
  }

  /** Logged values, falling back to prefilled targets for display/preview. */
  function displayValues(sessionId, block, set, vals) {
    const out = Object.assign({}, vals);
    set.fields.forEach(f => {
      if (out[f] == null || String(out[f]) === '') {
        const pre = prefillFor(sessionId, block, set, f);
        if (pre) out[f] = pre;
      }
    });
    return out;
  }

  function dualPreviewHtml(fields, values, blockId, setId, sessionId) {
    if (!fields.includes('distance')) return '';
    const dual = formatDualDistance(values.distance, values.time);
    const id = `dual-${blockId}-${setId}`;
    const split = rowSplit(sessionId, values.distance, values.time);
    if (!dual) {
      return `<div class="dual-preview muted" id="${id}" data-dual-for="${blockId}|${setId}">Enter km (+ time) → km · /km · mi · /mi</div>`;
    }
    return `<div class="dual-preview" id="${id}" data-dual-for="${blockId}|${setId}"><span class="pace">${escapeHtml(dual + split)}</span></div>`;
  }

  /** Rowing: also show the /500m split. */
  function rowSplit(sessionId, km, time) {
    const log = state.logs[sessionId];
    if (!log || log.modality !== 'row' || !(SESSIONS[sessionId] || {}).modality) return '';
    const k = parseNum(km), sec = parseTimeToSec(time);
    if (!k || !sec) return '';
    const sp = formatPace(sec / (k * 2));
    return sp ? ' · ' + sp + '/500m' : '';
  }

  const FIELD_LABELS = {
    reps: 'Reps', rpe: 'RPE', rir: 'RIR', distance: 'Dist (km)', time: 'Time', avgHr: 'Avg HR', notes: 'Notes',
  };

  function fieldHtml(sessionId, block, set, field, values) {
    const blockId = block.id, setId = set.id;
    const key = `${sessionId}|${blockId}|${setId}|${field}`;
    const logged = values[field] != null && String(values[field]) !== '';
    const pre = logged ? '' : prefillFor(sessionId, block, set, field);
    const val = logged ? values[field] : pre;
    const unit = weightUnitFor(sessionId);
    const label = field === 'weight' ? 'Load (' + unit + ')' : (FIELD_LABELS[field] || field);
    const inputmode = ['weight', 'reps', 'rpe', 'rir', 'distance', 'avgHr'].includes(field) ? (field === 'reps' || field === 'avgHr' ? 'numeric' : 'decimal') : 'text';
    let ph = '';
    if (field === 'time') ph = 'mm:ss';
    else if (field === 'distance') ph = 'km';
    else if (field === 'avgHr') ph = hrTarget(set, block) || 'bpm';
    else if (field === 'rpe') { const m = (block.meta || '').match(/RPE\s*([\d\/–-]+)/); ph = m ? m[1] : '1–10'; }
    else if (field === 'rir') { const m = (block.meta || '').match(/([\d–-]+)\s*RIR/); ph = m ? m[1] : '0–3'; }
    const dualAttr = (field === 'distance' || field === 'time') ? ` data-dual-input="${blockId}|${setId}"` : '';
    const preAttr = pre ? ` data-prefill="${escapeAttr(pre)}"` : '';
    const cls = pre ? ' class="prefill"' : '';
    if (field === 'notes') {
      return `<label class="fld fld-notes">${label}<input type="text" data-field="${key}" value="${escapeAttr(val)}" placeholder="optional" autocomplete="off" /></label>`;
    }
    const input = `<input type="text" inputmode="${inputmode}" data-field="${key}"${dualAttr}${preAttr}${cls} value="${escapeAttr(val)}" placeholder="${escapeAttr(ph)}" autocomplete="off" aria-label="${escapeAttr(label)}" />`;
    if (field === 'weight' || field === 'reps') {
      const step = field === 'reps' ? 1 : (unit === 'kg' ? 2.5 : 5);
      return `<div class="fld fld-step"><span class="fld-label">${label}</span><div class="stepper">
        <button type="button" class="step" data-step="${key}" data-delta="${-step}" aria-label="${label} minus ${step}">−</button>
        ${input}
        <button type="button" class="step" data-step="${key}" data-delta="${step}" aria-label="${label} plus ${step}">+</button>
      </div></div>`;
    }
    return `<label class="fld">${label}${input}</label>`;
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
      el.innerHTML = '<span class="pace">' + escapeHtml(dual + rowSplit(selectedSessionId, distInp && distInp.value, timeInp && timeInp.value)) + '</span>';
    }
  }

  // —— Targets / prefill ——
  // Week 2 sessions → the Week 1 session they repeat (for "last week's load" prefill)
  const PREV_SESSION = { w2_mon: 'sun', w2_tue: 'mon', w2_wed: 'tue', w2_fri: 'thu', w2_thu: 'wed', w2_sat: 'fri', w3_mon: 'w2_mon', w3_wed: 'w2_wed' };

  function setStem(setId) { return String(setId).replace(/\d+$/, ''); }

  function targetReps(set) {
    const l = set.label || '';
    let m = l.match(/(\d+)\s*reps?\b/i);
    if (m) return m[1];
    m = l.match(/·\s*(\d+)\s*[–-]\s*(\d+)(?!\s*(?:s\/m|min|km|m\b|s\b))/);
    if (m) return m[1];
    return '';
  }

  function labelDistanceKm(text) {
    const t = String(text || '');
    let m = t.match(/(\d+(?:\.\d+)?)\s*km\b/i);
    if (m) return parseFloat(m[1]);
    m = t.match(/(?:^|[^\/\d.:])(\d{3,5})\s?m\b(?![\/\w])/);
    if (m) return parseInt(m[1], 10) / 1000;
    return null;
  }

  function targetTimeText(set, block) {
    let m = String(set.label || '').match(/(\d+)\s*min\b/);
    if (m) return m[1] + ':00';
    if (block.kpi) { m = String(block.title || '').match(/(\d+)-min/); if (m) return m[1] + ':00'; }
    return '';
  }

  const HR_RE = /HR\s*~?\s*(<\s*~?\s*\d{2,3}|\d{2,3}\s*[–-]\s*\d{2,3})/;
  function hrFrom(text) {
    const m = String(text || '').match(HR_RE);
    return m ? m[1].replace(/\s+/g, '').replace('-', '–').replace('~', '') : '';
  }
  /** HR target for a segment: from its own label, else the block's (not for jogs/strides/rest). */
  function hrTarget(set, block) {
    const own = hrFrom(set.label);
    if (own) return own;
    if (/jog|stride|rest|cool/i.test(set.label || '')) return '';
    return hrFrom(block && block.meta);
  }
  /** Chip only when the label doesn't already say the HR target. */
  function hrChip(set, block) { return hrFrom(set.label) ? '' : hrTarget(set, block); }

  function loggedField(sid, bid, setId, f) {
    const v = (((((state.logs[sid] || {}).blocks || {})[bid] || {}).sets || {})[setId] || {}).fields;
    return v && v[f] != null && String(v[f]).trim() !== '' ? String(v[f]) : null;
  }

  function convertLoad(v, from, to) {
    const n = parseNum(v);
    if (n == null || from === to) return v;
    const out = from === 'lb' ? n / 2.20462 : n * 2.20462;
    return String(Math.round(out * 10) / 10);
  }

  /** Target value to prefill (reps/load for lifts; time/distance for segments). Never HR/RPE. */
  function prefillFor(sid, block, set, field) {
    if (block.kpi === '10min_tt' && field === 'distance') return '';
    if (block.kpi === '2k_row' && field === 'time') return '';
    const stem = setStem(set.id);
    if (field === 'weight' || field === 'reps') {
      if (field === 'reps') { const t = targetReps(set); if (t) return t; }
      const idx = block.sets.indexOf(set);
      for (let i = idx - 1; i >= 0; i--) {
        const s2 = block.sets[i];
        if (setStem(s2.id) !== stem) continue;
        const v = loggedField(sid, block.id, s2.id, field);
        if (v) return v;
      }
      if (field === 'weight' && !block.kpi) {
        const prev = PREV_SESSION[sid];
        const pb = prev && SESSIONS[prev] ? (SESSIONS[prev].blocks || []).find(b => b.id === block.id) : null;
        if (pb && !pb.kpi) {
          let v = loggedField(prev, pb.id, set.id, 'weight');
          for (let i = pb.sets.length - 1; !v && i >= 0; i--) {
            if (setStem(pb.sets[i].id) === stem) v = loggedField(prev, pb.id, pb.sets[i].id, 'weight');
          }
          if (v) return convertLoad(v, weightUnitFor(prev), weightUnitFor(sid));
        }
      }
      return '';
    }
    if (field === 'time') return targetTimeText(set, block);
    if (field === 'distance') { const km = labelDistanceKm(set.label); return km != null ? String(km) : ''; }
    return '';
  }

  /** Append mi / min-per-mi to any km, m, or /km value in plan text that lacks them. */
  function withUnits(text) {
    if (!text) return text || '';
    let s = String(text);
    const toSec = p => { const [m, x] = p.split(':').map(Number); return m * 60 + x; };
    s = s.replace(/(\d{1,2}:\d{2})(?:\s*[–-]\s*(\d{1,2}:\d{2}))?\s*\/km(?!\s*(?:·|\/|\(|,)\s*~?\d{1,2}:\d{2}(?:\s*[–-]\s*\d{1,2}:\d{2})?\s*\/mi)/g,
      (m, a, b) => m + ' (' + formatPace(toSec(a) * KM_PER_MI) + (b ? '–' + formatPace(toSec(b) * KM_PER_MI) : '') + '/mi)');
    s = s.replace(/(\d+(?:\.\d+)?)\s?km\b(?!\/h)(?!\s*(?:\/|·|\(|,)\s*~?\d+(?:\.\d+)?\s*mi\b)/g,
      (m, n) => m + ' (' + fmtDistFixed(parseFloat(n) / KM_PER_MI, 2) + ' mi)');
    s = s.replace(/(^|[^\/\d.:])(\d{3,5})\s?m\b(?![\/\w])/g,
      (m, pre, n) => { const km = parseInt(n, 10) / 1000; return pre + n + 'm (' + fmtDistFixed(km, 2) + ' km · ' + fmtDistFixed(km / KM_PER_MI, 2) + ' mi)'; });
    return s;
  }

  function secToTime(sec) {
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), x = sec % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
  }

  function historyDualSummary(sid, log) {
    const sess = SESSIONS[sid];
    if (!sess || !log) return '';
    const blocks = getBlocksForLog(sid, log);
    const fieldsOf = (b, st) => ((((log.blocks || {})[b.id] || {}).sets || {})[st.id] || {}).fields || {};
    if (sess.modality) {
      let km = 0, sec = 0, timed = true, any = false;
      blocks.forEach(b => b.sets.forEach(st => {
        const f = fieldsOf(b, st);
        const k = parseNum(f.distance);
        if (k && k > 0) {
          any = true; km += k;
          const t = parseTimeToSec(f.time);
          if (t) sec += t; else timed = false;
        }
      }));
      if (!any) return '';
      return 'Total ' + formatDualDistance(km, timed && sec ? secToTime(sec) : '');
    }
    let best = null;
    blocks.forEach(b => b.sets.forEach(st => {
      const f = fieldsOf(b, st);
      const w = parseNum(f.weight);
      if (w != null && (!best || w > best.w)) best = { w, reps: f.reps, title: b.title };
    }));
    if (!best) return '';
    const unit = weightUnitFor(sid);
    return 'Top: ' + best.title.replace(/^[A-Z]\.\s*/, '') + ' ' + best.w + ' ' + unit +
      (unit === 'kg' ? ' (' + Math.round(best.w * 2.20462 * 10) / 10 + ' lb)' : '') + (best.reps ? ' × ' + best.reps : '');
  }

  // —— Weigh-in ——
  function activeWeighins() {
    return (state.weighins || []).filter(w => !w.deleted).sort((a, b) => String(b.measuredAt).localeCompare(String(a.measuredAt)));
  }
  function weighinCardHtml() {
    const last = activeWeighins()[0];
    const v = last ? String(last.weightLb) : '';
    return `<div class="card weigh-card">
      <div class="row space"><h3 style="margin:0">Weigh-in</h3><span class="muted" id="weigh-last">${last ? 'Last ' + escapeHtml(v) + ' lb · ' + escapeHtml(formatTime(last.measuredAt)) : 'No weigh-ins yet'}</span></div>
      <div class="weigh-row">
        <div class="stepper">
          <button type="button" class="step" data-wstep="-0.2" aria-label="minus 0.2 lb">−</button>
          <input type="text" inputmode="decimal" id="weigh-input" value="${escapeAttr(v)}" placeholder="lb" aria-label="Body weight (lb)" autocomplete="off" />
          <button type="button" class="step" data-wstep="0.2" aria-label="plus 0.2 lb">+</button>
        </div>
        <span class="unit">lb</span>
        <button type="button" class="btn primary" id="btn-weigh">Log</button>
      </div>
      <div class="muted weigh-kg" id="weigh-kg">${v ? '= ' + (Math.round(parseNum(v) / 2.20462 * 10) / 10) + ' kg' : ''}</div>
    </div>`;
  }
  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
  function bindWeighin() {
    const inp = document.getElementById('weigh-input');
    if (!inp) return;
    const kg = document.getElementById('weigh-kg');
    const paint = () => { const n = parseNum(inp.value); kg.textContent = n ? '= ' + (Math.round(n / 2.20462 * 10) / 10) + ' kg' : ''; };
    inp.addEventListener('input', paint);
    inp.addEventListener('focus', () => inp.select());
    root.querySelectorAll('[data-wstep]').forEach(b => b.addEventListener('click', () => {
      const n = parseNum(inp.value) || (activeWeighins()[0] || {}).weightLb || 0;
      inp.value = String(Math.round((n + Number(b.getAttribute('data-wstep'))) * 10) / 10);
      paint();
    }));
    document.getElementById('btn-weigh').addEventListener('click', () => {
      const n = parseNum(inp.value);
      if (n == null || n <= 50 || n >= 700) { toast('Enter weight in lb'); inp.focus(); return; }
      state.weighins = state.weighins || [];
      state.weighins.push({ id: newId(), measuredAt: new Date().toISOString(), weightLb: Math.round(n * 10) / 10, notes: '', deleted: false, updatedAt: Date.now() });
      saveState();
      toast('Weigh-in saved · ' + (Math.round(n * 10) / 10) + ' lb');
      const last = document.getElementById('weigh-last');
      if (last) last.textContent = 'Last ' + (Math.round(n * 10) / 10) + ' lb · ' + formatTime(new Date().toISOString());
      inp.blur();
    });
  }

  // —— Sync status UI ——
  function syncKeyHasData(key) {
    const parts = key.split('|');
    const sLog = ((((state.logs[parts[1]] || {}).blocks || {})[parts[2]] || {}).sets || {})[parts[3]];
    if (!sLog) return false;
    return !!sLog.done || Object.keys(sLog.fields || {}).some(k => String(sLog.fields[k] || '') !== '');
  }
  function paintSyncMarks() {
    const configured = !!(window.HTSync && window.HTSync.configured);
    const pending = window.HTStore ? window.HTStore.pendingKeys : new Set();
    const signedIn = !!(window.HTSync && window.HTSync.signedIn);
    root.querySelectorAll('[data-sync-key]').forEach(el => {
      const key = el.getAttribute('data-sync-key');
      if (!syncKeyHasData(key)) { el.textContent = ''; el.className = 'sync-mark'; return; }
      if (configured && signedIn && !pending.has(key)) { el.textContent = '✓ synced'; el.className = 'sync-mark synced'; }
      else { el.textContent = '● saved on phone'; el.className = 'sync-mark local'; }
    });
    paintSyncPill();
  }
  function paintSyncPill() {
    const pill = document.getElementById('sync-pill');
    if (!pill) return;
    const st = (window.HTSync && window.HTSync.status) || { state: 'local-only' };
    const n = st.pending || 0;
    const map = {
      'local-only': ['On phone', 'local'],
      'starting': ['Saved', 'local'],
      'signed-out': [n ? n + ' on phone · sign in' : 'Sign in to sync', 'warn'],
      'offline': [n ? 'Offline · ' + n + ' queued' : 'Offline · saved', 'warn'],
      'syncing': [n ? 'Syncing ' + n + '…' : 'Syncing…', 'busy'],
      'synced': ['✓ Synced', 'ok'],
      'error': [n ? 'Retrying · ' + n + ' queued' : 'Sync error', 'err'],
    };
    const [txt, cls] = map[st.state] || ['Saved', 'local'];
    pill.textContent = txt;
    pill.className = 'sync-pill ' + cls;
    pill.title = st.error ? 'Last error: ' + st.error : 'Every tap is saved on this phone first';
  }

  // re-apply prefills in a block after an earlier set changed
  function refreshPrefills(blockId) {
    const sid = selectedSessionId;
    const { block } = findBlockSet(sid, blockId, '');
    if (!block) return;
    root.querySelectorAll(`[data-block="${blockId}"] input.prefill[data-field]`).forEach(inp => {
      const [, , setId, field] = inp.getAttribute('data-field').split('|');
      const set = block.sets.find(x => x.id === setId);
      if (!set) return;
      const pre = prefillFor(sid, block, set, field);
      inp.value = pre;
      inp.setAttribute('data-prefill', pre);
      if (field === 'weight') { const el = document.getElementById(`lb-${blockId}-${setId}`); if (el && weightUnitFor(sid) === 'kg') el.textContent = kgToLbLabel(pre); }
    });
  }

  function bindTodayEvents() {
    root.querySelectorAll('[data-week]').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedWeek = Number(btn.getAttribute('data-week'));
        render();
      });
    });
    root.querySelectorAll('[data-field$="|weight"]').forEach(inp => {
      inp.addEventListener('input', () => {
        const [sid, bid, setId] = inp.getAttribute('data-field').split('|');
        const el = document.getElementById(`lb-${bid}-${setId}`);
        if (el && weightUnitFor(sid) === 'kg') el.textContent = kgToLbLabel(inp.value);
      });
    });
    root.querySelectorAll('[data-pick]').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedSessionId = btn.getAttribute('data-pick');
        state.todayOverrideSession = selectedSessionId;
        state.todayOverrideDate = REAL_TODAY;
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
        if (!log.blocks[blockId].sets) log.blocks[blockId].sets = {};
        if (!log.blocks[blockId].sets[setId]) log.blocks[blockId].sets[setId] = { done: false, fields: {} };
        const sLog = log.blocks[blockId].sets[setId];
        sLog.fields = sLog.fields || {};
        const row = el.closest('.set-row');
        // write whatever is in the row (typed values + confirmed prefills) in the same save
        row.querySelectorAll('input[data-field]').forEach(inp => {
          const field = inp.getAttribute('data-field').split('|')[3];
          if (inp.classList.contains('prefill')) {
            if (!sLog.done && inp.value !== '') {
              sLog.fields[field] = inp.value;
              sLog.target = sLog.target || {};
              if (field === 'weight' || field === 'reps') sLog.target[field] = inp.getAttribute('data-prefill');
              inp.classList.remove('prefill');
              inp.removeAttribute('data-prefill');
            }
          } else if (inp.value !== (sLog.fields[field] || '')) {
            sLog.fields[field] = inp.value;
          }
        });
        sLog.done = !sLog.done;
        saveState();
        el.classList.toggle('on', sLog.done);
        el.textContent = sLog.done ? '✓' : '';
        el.setAttribute('aria-label', sLog.done ? 'Undo set' : 'Log set');
        row.classList.toggle('is-done', sLog.done);
        if (sLog.done && navigator.vibrate) { try { navigator.vibrate(15); } catch (_) {} }
        refreshPrefills(blockId);
        const prog = sessionProgress(selectedSessionId);
        const bar = root.querySelector('.progress-bar > span');
        if (bar) bar.style.width = prog.pct + '%';
        const pt = root.querySelector('[data-prog-text]');
        if (pt) pt.textContent = `${prog.done}/${prog.total} sets · ${prog.pct}%`;
      });
    });
    root.querySelectorAll('[data-step]').forEach(btn => {
      btn.addEventListener('click', () => {
        const inp = root.querySelector(`[data-field="${btn.getAttribute('data-step')}"]`);
        if (!inp) return;
        const delta = Number(btn.getAttribute('data-delta'));
        const cur = parseNum(inp.value);
        const next = Math.max(0, Math.round(((cur == null ? 0 : cur) + delta) * 100) / 100);
        inp.value = String(next);
        inp.classList.remove('prefill');
        inp.removeAttribute('data-prefill');
        persistField(inp);
        const [sid, bid, setId, field] = inp.getAttribute('data-field').split('|');
        if (field === 'weight') { const el = document.getElementById(`lb-${bid}-${setId}`); if (el && weightUnitFor(sid) === 'kg') el.textContent = kgToLbLabel(inp.value); }
      });
    });
    root.querySelectorAll('[data-field]').forEach(inp => {
      let t = null;
      inp.addEventListener('focus', () => { try { inp.select(); } catch (_) {} });
      inp.addEventListener('input', () => {
        inp.classList.remove('prefill');
        inp.removeAttribute('data-prefill');
        clearTimeout(t);
        t = setTimeout(() => persistField(inp), 300);
      });
      inp.addEventListener('change', () => { clearTimeout(t); persistField(inp); });
      inp.addEventListener('blur', () => { clearTimeout(t); persistField(inp); });
    });
    bindWeighin();
    const notes = document.getElementById('session-notes');
    if (notes) {
      let nt = null;
      const saveNotes = () => { clearTimeout(nt); const log = ensureLog(selectedSessionId); if (log.notes !== notes.value) { log.notes = notes.value; saveState(); } };
      notes.addEventListener('input', () => { clearTimeout(nt); nt = setTimeout(saveNotes, 400); });
      notes.addEventListener('change', saveNotes);
      notes.addEventListener('blur', saveNotes);
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
    if (inp.classList.contains('prefill')) return; // untouched target — only saved when the set is confirmed
    const [sessionId, blockId, setId, field] = key.split('|');
    const log = ensureLog(sessionId);
    if (!log.blocks[blockId]) log.blocks[blockId] = { done: false, sets: {} };
    if (!log.blocks[blockId].sets) log.blocks[blockId].sets = {};
    const existing = log.blocks[blockId].sets[setId];
    if (!existing && inp.value === '') return;
    if (!existing) log.blocks[blockId].sets[setId] = { done: false, fields: {} };
    const sLog = log.blocks[blockId].sets[setId];
    sLog.fields = sLog.fields || {};
    if ((sLog.fields[field] == null ? '' : String(sLog.fields[field])) === inp.value) return;
    sLog.fields[field] = inp.value;
    saveState();
    if (field === 'weight' || field === 'reps') refreshPrefills(blockId);
  }

  function renderWeek() {
    let html = `<div class="card"><h2>Phase 6 · ${WEEKS[selectedWeek].label}</h2><p class="muted" style="margin:0">${WEEKS[selectedWeek].range} · Coach Patrick James</p>
      <div class="session-picker" style="margin-top:10px">${Object.keys(WEEKS).map(w => `<button type="button" class="chip ${String(selectedWeek) === w ? 'active' : ''}" data-week="${w}">${WEEKS[w].label}</button>`).join('')}</div></div>`;
    WEEKS[selectedWeek].days.forEach(d => {
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
    root.querySelectorAll('[data-week]').forEach(btn => {
      btn.addEventListener('click', () => { selectedWeek = Number(btn.getAttribute('data-week')); render(); });
    });
    root.querySelectorAll('[data-goto]').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedSessionId = btn.getAttribute('data-goto');
        state.todayOverrideSession = selectedSessionId;
        state.todayOverrideDate = REAL_TODAY;
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

  // Pre-Phase 6 completed sets from Remy's Training Log (imported 2026-10-30; read-only, not synced).
  // Source: fitness repo data/imports/remy_2026-10-30/sets.csv. Reps '?' = set marked done without reps.
  const PRE_PHASE6_SETS = [{"date": "2026-09-23", "title": "Remy workout 1 · bench loads confirmed by Terrance 10/30", "items": [["Barbell Bench Press", "115.7 kg (255 lb) × 2 @8 (×2), 124.7 kg (275 lb) × 2 @8 (×3)"], ["Front Foot Elevated Barbell Split Squat", "56.7 kg (125 lb) × 7 (×3)"], ["Narrow Grip Cable Lat Pulldown", "40.8 kg (90 lb) × 10, 45.4 kg (100 lb) × 7, 47.6 kg (105 lb) × 7"], ["Cable Lean-Away Lateral Raise", "4.5 kg (10 lb) × 7 (×3)"], ["DB Skull Crusher", "20.4 kg (45 lb) × 7 (×3)"], ["Barbell Curl", "27.2 kg (60 lb) × 7, 29.5 kg (65 lb) × ?, 29.5 kg (65 lb) × 7"], ["Machine Calf Raise", "40.8 kg (90 lb) × 8, 20.4 kg (45 lb) × 8 (×2)"]]}, {"date": "2026-09-28", "title": "Remy workout 860 · front squat test", "items": [["Barbell Front Squat", "20 kg (44 lb) × 10, 60 kg (132 lb) × 8, 74.8 kg (165 lb) × 5, 100 kg (220 lb) × 3, 115.7 kg (255 lb) × 1, 120.2 kg (265 lb) × 3 @10"], ["Smith Machine Behind-the-Neck Press", "43.1 kg (95 lb) × 5, 52.2 kg (115 lb) × 5 (×2)"], ["DB Chest-Supported Upper Back Row", "27.2 kg (60 lb) × 7, 27.2 kg (60 lb) × ? (×2)"], ["Machine Lying Prone Hamstring Curl", "60 kg (132 lb) × 10 (×3)"], ["DB Preacher Curl", "13.6 kg (30 lb) × 7 (×2), 15.9 kg (35 lb) × 7"], ["Strict Dip", "BW × 7 (×3)"]]}, {"date": "2026-09-30", "title": "Remy workout 858 · bench test", "items": [["Barbell Bench Press", "20 kg (44 lb) × 10, 61.2 kg (135 lb) × 8, 79.4 kg (175 lb) × 5, 102.1 kg (225 lb) × 3, 111.1 kg (245 lb) × 1, 122.5 kg (270 lb) × 5 @10"], ["Front Foot Elevated Barbell Split Squat", "61.2 kg (135 lb) × ? (×3)"], ["Narrow Grip Cable Lat Pulldown", "45.4 kg (100 lb) × 7, 45.4 kg (100 lb) × ? (×2)"], ["Cable Lean-Away Lateral Raise", "4.5 kg (10 lb) × ? (×2)"], ["DB Skull Crusher", "20.4 kg (45 lb) × 7, 20.4 kg (45 lb) × 5 (×2)"], ["Barbell Curl", "11.3 kg (25 lb) × 7, 13.6 kg (30 lb) × 7 (×2)"], ["Machine Leg Press Calf Raise", "31.8 kg (70 lb) × 10, 49.9 kg (110 lb) × 10 (×2)"]]}, {"date": "2026-10-05", "title": "Remy workout 863 · deload", "items": [["Barbell Front Squat", "100 kg (220 lb) × 5 (×2)"], ["Smith Machine Behind the Neck Press", "43.1 kg (95 lb) × 5 (×2)"], ["DB Chest Supported Upper Back Row", "20.4 kg (45 lb) × 7 (×2)"], ["Machine Lying Prone Hamstring Curl", "40.8 kg (90 lb) × 7 (×2)"], ["DB Preacher Curl", "13.6 kg (30 lb) × 5 (×2)"], ["Strict Dip", "BW × 5 (×2)"]]}, {"date": "2026-10-08", "title": "Remy workout 864 · bench + split squat", "items": [["Barbell Bench Press", "102.1 kg (225 lb) × 5 (×2)"], ["Front Foot Elevated Barbell Split Squat", "52.2 kg (115 lb) × 7 (×2)"]]}, {"date": "2026-10-12", "title": "Remy workout 867 · FB1 back squat 3RM (done Mon 10/12)", "items": [["Barbell Back Squat", "142.9 kg (315 lb) × 3 @9"], ["Weighted Push Up", "20.4 kg (45 lb) × 10 (×3)"], ["Cable Seated Row", "36.3 kg (80 lb) × 10, 40.8 kg (90 lb) × 12 (×2)"]]}];

  function renderHistory() {
    const items = ALL_DAYS.map(d => {
      const log = state.logs[d.id];
      const prog = sessionProgress(d.id);
      return { d, log, prog };
    }).filter(x => x.log && (x.prog.done > 0 || x.log.notes || x.log.savedAt));

    let html = `<div class="card"><h2>History</h2><p class="muted" style="margin:0">Logged days · Phase 6 Weeks 1–3</p></div><div class="card" style="padding:0">`;
    if (!items.length) {
      html += `<div class="history-item"><span class="muted">No sessions logged yet</span></div>`;
    } else {
      items.forEach(({ d, log, prog }) => {
        const when = log.savedAt ? formatTime(log.savedAt) : 'in progress';
        const highlight = historyDualSummary(d.id, log);
        html += `<div class="history-item">
          <div>
            <div style="font-weight:700">Wk${d.week} ${d.dow} ${d.short} · ${escapeHtml(d.title)}</div>
            <div class="muted">${prog.done}/${prog.total} sets · ${when}${log.modality ? ' · ' + log.modality : ''}</div>
            ${highlight ? `<div class="pace" style="font-size:12px;margin-top:4px">${escapeHtml(highlight)}</div>` : ''}
          </div>
          <button type="button" class="chip sm" data-goto="${d.id}">Open</button>
        </div>`;
      });
    }
    html += `</div>`;
    html += `<div class="card"><h2>Pre-Phase 6 lifts</h2><p class="muted" style="margin:0">Completed sets from Remy's Training Log · read-only</p></div><div class="card pre6" style="padding:0">`
      + PRE_PHASE6_SETS.map(sx => `<div class="history-item"><div>
          <div style="font-weight:700">${escapeHtml(sx.date.slice(5).replace('-', '/'))} · ${escapeHtml(sx.title)}</div>
          ${sx.items.map(it => `<div class="muted" style="font-size:12px;margin-top:2px"><strong>${escapeHtml(it[0])}:</strong> ${escapeHtml(it[1])}</div>`).join('')}
        </div></div>`).join('') + `</div>`;
    const wis = activeWeighins();
    html += `<div class="card"><h2>Weigh-ins</h2>${wis.length ? '' : '<p class="muted" style="margin:0">None yet — log one on Today.</p>'}</div>`;
    if (wis.length) {
      html += `<div class="card" style="padding:0">` + wis.map(w => `<div class="history-item">
          <div><div style="font-weight:700">${escapeHtml(String(w.weightLb))} lb <span class="muted" style="font-weight:400">· ${Math.round(w.weightLb / 2.20462 * 10) / 10} kg</span></div>
          <div class="muted">${escapeHtml(formatTime(w.measuredAt))}</div></div>
          <button type="button" class="chip sm" data-del-weigh="${escapeAttr(w.id)}" aria-label="Delete weigh-in">Delete</button>
        </div>`).join('') + `</div>`;
    }
    root.innerHTML = html;
    root.querySelectorAll('[data-del-weigh]').forEach(btn => {
      btn.addEventListener('click', () => {
        const w = (state.weighins || []).find(x => x.id === btn.getAttribute('data-del-weigh'));
        if (!w || !confirm('Delete weigh-in ' + w.weightLb + ' lb?')) return;
        w.deleted = true;
        saveState();
        render();
      });
    });
    root.querySelectorAll('[data-goto]').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedSessionId = btn.getAttribute('data-goto');
        selectedWeek = (dayFor(selectedSessionId) || {}).week || selectedWeek;
        view = 'today';
        setActiveTab('today');
        render();
      });
    });
  }

  function cloudCardHtml() {
    const S = window.HTSync;
    if (!S || !S.configured) {
      return `<div class="card" id="cloud-card"><h2>Cloud sync</h2>
        <p class="muted" style="margin:0">Local-only mode — nothing leaves this phone. To back up and sync to Supabase, add <code>SUPABASE_URL</code> and the anon key to <code>config.js</code> (see README).</p></div>`;
    }
    const st = S.status;
    if (S.signedIn) {
      return `<div class="card" id="cloud-card"><h2>Cloud sync</h2>
        <p class="muted" style="margin:0 0 10px">Signed in as <strong>${escapeHtml(st.email || '')}</strong> · ${escapeHtml(st.state)}${st.pending ? ' · ' + st.pending + ' queued' : ''}${st.lastSyncAt ? ' · last sync ' + escapeHtml(formatTime(st.lastSyncAt)) : ''}</p>
        ${st.error && st.state === 'error' ? `<p class="muted" style="margin:0 0 10px;color:var(--warn)">Last error: ${escapeHtml(st.error)} — will retry automatically.</p>` : ''}
        <div class="stack"><button type="button" class="btn primary" id="btn-sync-now">Sync now</button>
        <button type="button" class="btn ghost" id="btn-signout">Sign out (keeps data on phone)</button></div></div>`;
    }
    return `<div class="card" id="cloud-card"><h2>Cloud sync</h2>
      <p class="muted" style="margin:0 0 10px">Optional. Logging works without signing in; sign in to back up to Supabase. We email you a one-time code${st.pending ? ' · ' + st.pending + ' changes waiting on this phone' : ''}.</p>
      <div class="stack">
        <input type="email" id="auth-email" placeholder="you@example.com" autocomplete="email" inputmode="email" autocapitalize="off" value="${escapeAttr(localStorage.getItem('hybrid-tracker-auth-email') || '')}" />
        <button type="button" class="btn primary" id="btn-send-code">Email me a sign-in code</button>
        <div id="code-step" class="${localStorage.getItem('hybrid-tracker-auth-email') ? '' : 'hidden'} stack">
          <input type="text" id="auth-code" placeholder="6-digit code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" />
          <button type="button" class="btn primary" id="btn-verify">Verify code &amp; sign in</button>
          <p class="muted" style="margin:0;font-size:12px">On iPhone, type the code here rather than tapping the email link — links open in Safari, which can't sign in the home-screen app.</p>
        </div>
      </div></div>`;
  }

  function bindCloudCard() {
    const S = window.HTSync;
    if (!S || !S.configured) return;
    const again = () => { if (view === 'more') renderMore(); };
    const syncNow = document.getElementById('btn-sync-now');
    if (syncNow) syncNow.addEventListener('click', async () => { await S.pull(); S.kick(0); toast('Syncing…'); });
    const so = document.getElementById('btn-signout');
    if (so) so.addEventListener('click', async () => { try { await S.signOut(); toast('Signed out — logs stay on this phone'); } catch (e) { toast('Sign-out failed'); } again(); });
    const send = document.getElementById('btn-send-code');
    if (send) send.addEventListener('click', async () => {
      const email = document.getElementById('auth-email').value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast('Enter your email'); return; }
      if (navigator.onLine === false) { toast('Offline — try again when connected'); return; }
      send.disabled = true; send.textContent = 'Sending…';
      try {
        await S.sendCode(email);
        localStorage.setItem('hybrid-tracker-auth-email', email);
        document.getElementById('code-step').classList.remove('hidden');
        toast('Code sent — check your email');
        const c = document.getElementById('auth-code'); if (c) c.focus();
      } catch (e) { toast('Could not send: ' + String(e.message || e).slice(0, 80)); }
      send.disabled = false; send.textContent = 'Email me a sign-in code';
    });
    const verify = document.getElementById('btn-verify');
    if (verify) verify.addEventListener('click', async () => {
      const email = document.getElementById('auth-email').value.trim();
      const code = document.getElementById('auth-code').value.replace(/\s+/g, '');
      if (!code) { toast('Enter the code from the email'); return; }
      verify.disabled = true; verify.textContent = 'Verifying…';
      try { await S.verifyCode(email, code); toast('Signed in — syncing'); setTimeout(again, 300); }
      catch (e) { toast('Code rejected: ' + String(e.message || e).slice(0, 80)); verify.disabled = false; verify.textContent = 'Verify code & sign in'; }
    });
  }

  function renderMore() {
    root.innerHTML = cloudCardHtml() + `<div class="card">
      <h2>Data</h2>
      <p class="muted">Every tap is saved on this phone first (IndexedDB, plus a localStorage copy) and works offline. <span id="persist-status"></span> Export a backup before clearing browser data.</p>
      <div class="stack">
        <button type="button" class="btn primary" id="btn-export">Export JSON</button>
        <label class="btn file-btn">Import JSON<input type="file" id="import-file" accept="application/json,.json" /></label>
        <button type="button" class="btn danger" id="btn-reset">Reset all data on this phone</button>
      </div>
    </div>
    <div class="card">
      <h2>Distance units</h2>
      <p class="muted" style="margin:0">Enter run distance in <strong>km</strong> (watch default). The app always shows km, pace/km, miles, and pace/mi together when distance (+ time) is logged.</p>
    </div>
    <div class="card">
      <h2>Install on iPhone</h2>
      <p class="muted" style="margin:0">Safari → Share → <strong>Add to Home Screen</strong>. Open it from the home-screen icon so logs stay in the app's own storage.</p>
    </div>
    <div class="card">
      <h2>About</h2>
      <p class="muted" style="margin:0">Hybrid Phase 6 Weeks 1–3 (Oct 11–Nov 1, 2026) · Coach Patrick James · Offline-first PWA · v${APP_VERSION}</p>
    </div>`;

    bindCloudCard();
    const ps = document.getElementById('persist-status');
    if (ps && navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then(p => { ps.textContent = p ? 'Persistent storage: on.' : 'Persistent storage: not granted yet (installing to the home screen helps).'; }).catch(() => {});
    }
    document.getElementById('btn-export').addEventListener('click', exportJson);
    document.getElementById('import-file').addEventListener('change', importJson);
    document.getElementById('btn-reset').addEventListener('click', () => {
      if (confirm('Erase all logged workouts on this device? (Cloud copies, if any, are not deleted.)')) {
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
      version: 2,
      appVersion: APP_VERSION,
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
        if (!Array.isArray(state.weighins)) state.weighins = [];
        stampMissingTimestamps();
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

  // —— Service worker: offline + reliable updates ——
  function showUpdateBanner() {
    if (document.getElementById('update-banner')) return;
    const b = document.createElement('button');
    b.id = 'update-banner'; b.type = 'button'; b.className = 'update-banner';
    b.textContent = 'New version ready — tap to reload (your logs are saved)';
    b.addEventListener('click', () => location.reload());
    document.body.appendChild(b);
  }
  if ('serviceWorker' in navigator) {
    const bootAt = Date.now();
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return; // first install: nothing to refresh
      const typing = document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName);
      if (Date.now() - bootAt < 10000 && !typing) { reloading = true; location.reload(); }
      else showUpdateBanner();
    });
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => {
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    }).catch(() => {});
  }

  // —— Boot ——
  if (BOOT && BOOT.migrated) state.migratedAt = state.migratedAt || new Date().toISOString();
  // Known weigh-ins reported to the coach (fasted AM). Seeded once by stable id; skipped if
  // that id exists (incl. deleted) or a weigh-in is already logged on the same LA date.
  const SEED_WEIGHINS = [
    // From Remy's Training Log export (imported 2026-10-30). Time of day not logged; only 9/27 stated fasted.
    { id: 'seed-wi-2026-09-25', measuredAt: '2026-09-25T12:00:00-07:00', weightLb: 240.0, notes: "Remy's log" },
    { id: 'seed-wi-2026-09-27', measuredAt: '2026-09-27T12:00:00-07:00', weightLb: 240.9, notes: "Fasted · Remy's log" },
    { id: 'seed-wi-2026-10-02', measuredAt: '2026-10-02T12:00:00-07:00', weightLb: 240.9, notes: "Remy's log" },
    { id: 'seed-wi-2026-10-05', measuredAt: '2026-10-05T12:00:00-07:00', weightLb: 240.5, notes: "Remy's log" },
    { id: 'seed-wi-2026-10-07', measuredAt: '2026-10-07T12:00:00-07:00', weightLb: 243.4, notes: "Remy's log" },
    { id: 'seed-wi-2026-10-10', measuredAt: '2026-10-10T12:00:00-07:00', weightLb: 245.0, notes: "Remy's log" },
    { id: 'seed-wi-2026-10-12', measuredAt: '2026-10-12T12:00:00-07:00', weightLb: 242.8, notes: "Remy's log" },
    { id: 'seed-wi-2026-10-16', measuredAt: '2026-10-16T06:30:00-07:00', weightLb: 240.1 },
    { id: 'seed-wi-2026-10-17', measuredAt: '2026-10-17T06:30:00-07:00', weightLb: 240.9 },
    { id: 'seed-wi-2026-10-18', measuredAt: '2026-10-18T06:30:00-07:00', weightLb: 243.0 },
    { id: 'seed-wi-2026-10-29', measuredAt: '2026-10-29T06:30:00-07:00', weightLb: 241.8, notes: 'Fasted' },
    { id: 'seed-wi-2026-10-30', measuredAt: '2026-10-30T06:30:00-07:00', weightLb: 242.8, notes: 'Fasted' },
  ];
  function seedWeighins() {
    const laDate = iso => { try { return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }); } catch (e) { return String(iso).slice(0, 10); } };
    const list = state.weighins || (state.weighins = []);
    let added = 0;
    SEED_WEIGHINS.forEach(sw => {
      if (list.some(w => w.id === sw.id)) return;
      if (list.some(w => !w.deleted && laDate(w.measuredAt) === laDate(sw.measuredAt))) return;
      list.push({ id: sw.id, measuredAt: sw.measuredAt, weightLb: sw.weightLb, notes: sw.notes || 'Fasted', deleted: false, updatedAt: Date.parse(sw.measuredAt) });
      added++;
    });
    return added;
  }
  const stamped = seedWeighins() + stampMissingTimestamps();
  collectRows().forEach(r => rowSigs.set(r.key, r.sig));
  if (stamped || (BOOT && BOOT.source !== 'idb')) {
    // persist migration stamps (no outbox: the sign-in backfill pushes everything)
    if (window.HTStore) window.HTStore.commit(state, []).catch(() => {});
  }
  if (window.HTStore) window.HTStore.requestPersist();
  if (window.HTSync) {
    window.HTSync.init({
      onStatus: (st) => { syncStatus = st; paintSyncMarks(); },
      onPull: mergeRemote,
      onSignedIn: backfill,
    });
  }
  const pill = document.getElementById('sync-pill');
  if (pill) pill.addEventListener('click', () => { view = 'more'; setActiveTab('more'); render(); window.scrollTo(0, 0); });
  window.__HT = {
    get state() { return state; }, boot: BOOT, version: APP_VERSION,
    open(sid) { selectedSessionId = sid; selectedWeek = (dayFor(sid) || {}).week || selectedWeek; view = 'today'; setActiveTab('today'); render(); },
  };
  if (BOOT && BOOT.migrated) setTimeout(() => toast('Logs moved to on-phone database ✓'), 400);
  render();
  } // end start()

  function go(boot) {
    try { start(boot); } catch (e) {
      console.error(e);
      const r = document.getElementById('view-root');
      if (r) r.innerHTML = '<div class="card"><h2>Startup error</h2><p class="muted">' + String((e && e.message) || e).replace(/</g, '&lt;') + '</p></div>';
    }
  }
  if (window.HTStore) window.HTStore.init().then(go, () => go(null));
  else go(null);
})();
