# Hybrid Tracker

Mobile-first daily workout tracker for the Hybrid program (Coach Patrick James), built as an installable PWA with no build step.

Live: https://tb809.github.io/hybrid-tracker/

## How data is stored

- **Local first.** Every tap is written straight to **IndexedDB** on the phone (`hybrid-tracker` database), with a `localStorage` mirror. The app works fully offline and with no account.
- On first launch of v2, the old `localStorage` key `hybrid-tracker-v1` is migrated automatically. Nothing is deleted: the original JSON is kept as a backup both in the legacy key and in IndexedDB meta (`legacy_localstorage_backup`).
- The app calls `navigator.storage.persist()` so the browser is less likely to evict the data. The result is shown under **More → Storage**.
- Export and Import JSON are still available under **More**.

## Cloud sync (optional, Supabase)

When `config.js` is left empty, the app runs **local-only**. Once it is filled in, changes go into an outbox and are pushed to Supabase whenever the app is open and online. Failed pushes retry with backoff (2 s doubling, capped at 5 min) and are retried again on `online` or when the app returns to the foreground. The pill in the top bar shows *Local*, *Saved on phone* (changes pending), *Syncing*, *Synced*, *Offline* or *Sync error*.

### Setup

1. Create a Supabase project.
2. Apply the migration `supabase/migrations/20261025000000_hybrid_tracker_init.sql`. Either paste it into **SQL Editor → Run**, or use the CLI: `supabase link --project-ref <ref>` then `supabase db push`.
   - It creates the tables `sessions`, `set_logs`, `segment_logs`, `weigh_ins` and `garmin_activities`.
   - Row Level Security is enabled and forced on all of them. Each row is readable and writable only by its owner (`user_id = auth.uid()`).
   - `garmin_activities` can be read by its owner, but only the service role can write to it.
3. **Authentication → Providers → Email:** enable Email. To use the 6-digit code, edit **Authentication → Email Templates → Magic Link** so it includes `{{ .Token }}`, for example `Your Hybrid Tracker code: {{ .Token }}`. The `{{ .ConfirmationURL }}` link can stay as well.
4. **Authentication → URL Configuration:**
   - Set Site URL to `https://tb809.github.io/hybrid-tracker/`.
   - Add the same URL under Redirect URLs.
5. Fill in `config.js` with the project URL and the **anon / publishable** key, then commit:

   ```js
   window.HYBRID_CONFIG = {
     SUPABASE_URL: 'https://<ref>.supabase.co',
     SUPABASE_ANON_KEY: '<anon key>',
   };
   ```

   The anon key is safe to publish because RLS protects the data. **Never put the `service_role` key in this repo.**
6. On the phone, go to **More → Cloud sync**, enter your email, and type in the 6-digit code. Anything already logged on the phone is backfilled to the cloud, and newer cloud rows are merged in (last write wins per set, segment or session).

**iPhone tip:** use the **code**, not the link. A link in Mail opens in Safari, which has separate storage from the installed home-screen app.

supabase-js is vendored at `vendor/supabase-js-2.118.0.js`, so no CDN or build step is needed.

## Install on iPhone

1. Open https://tb809.github.io/hybrid-tracker/ in **Safari**.
2. Tap **Share → Add to Home Screen → Add**.
3. Launch it from the home-screen icon. It runs full-screen and works offline.

When a new version is deployed, it downloads in the background. A banner offers **Reload**, and if the update lands within the first few seconds after launch, the app reloads by itself.

## Install on Android

Open the site in Chrome, then tap **⋮ → Install app** (or **Add to Home screen**).

## Units

Weights are logged in the program's unit (lb or kg), with the conversion shown underneath. Every distance and pace is shown in both **km · min/km** and **mi · min/mi**. Body weight (Weigh-in card on Today) is logged in **lb**.

## Future: Garmin import

A Supabase **Edge Function** (for example `supabase/functions/garmin-sync`) should pull activities from the Garmin Health/Activity API and upsert them into **`public.garmin_activities`**. It would run on a Garmin push webhook or a cron.

- Write with the **service-role key**, which is kept only in the function's secrets. RLS allows no client writes to this table.
- Key each row on `(user_id, garmin_activity_id)`.
- Fill in `start_time`, `activity_type`, `distance_km`, `duration_sec`, `avg_hr`, `max_hr`, and the full payload in `raw`.
- Optionally set `session_key` to link the activity to a tracker day.

The app can then read these rows with the user's session and show them next to logged runs and rows.

## Tests

The tests use headless Playwright (Python) with an iPhone 13 viewport:

```sh
pip install playwright && playwright install chromium
python3 -m http.server 8765 &        # from the repo root
python3 tests/e2e_phone.py           # migration (W1 lb + W2 kg), local-only, one-tap logging, reload, offline, units, weigh-in
python3 tests/e2e_sync_mock.py       # outbox + OTP sign-in + push/pull/retry against a mocked Supabase
```
