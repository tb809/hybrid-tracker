/* Hybrid Tracker cloud-sync config.
 *
 * Leave both values empty to run fully local-only (IndexedDB on this device, no network).
 * To enable Supabase sync, fill in your project's URL and its anon / publishable key
 * (Supabase dashboard → Project Settings → API). The anon key is public by design;
 * row-level security in supabase/migrations/*.sql is what protects the data.
 * Never put a service_role / secret key here.
 */
window.HYBRID_CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
};
