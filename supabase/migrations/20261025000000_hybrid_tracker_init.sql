-- Hybrid Tracker — initial schema
-- Tables: public.sessions, public.set_logs, public.segment_logs, public.weigh_ins,
--         public.garmin_activities (reserved for a future Garmin Edge Function)
--
-- Every row is keyed by the Supabase auth user id (user_id → auth.users.id) and
-- row-level security restricts every table to its owner. The browser app only ever uses
-- the anon/publishable key + the signed-in user's JWT, so RLS is the security boundary.
--
-- NOT applied anywhere automatically. Apply with `supabase db push` or paste into the
-- Supabase SQL editor (see README → "Cloud sync (Supabase) setup").

begin;

-- ---------------------------------------------------------------------------
-- helper: keep updated_at current
-- ---------------------------------------------------------------------------
create or replace function public.ht_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- sessions: one row per planned/logged training day (e.g. 'w2_mon', 'wed')
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  user_id           uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  session_key       text        not null,             -- app session id: 'sun'…'sat' (week 1), 'w2_mon'… (week 2)
  week              smallint,
  session_date      date,
  title             text,
  modality          text        check (modality in ('run', 'row')),   -- null for lifting days
  notes             text,
  saved_at          timestamptz,                       -- when "Save session" was tapped
  blocks_done       jsonb       not null default '{}'::jsonb, -- {"bs": true, …} block-level check marks
  client_updated_at timestamptz not null default now(), -- last-write-wins clock from the device
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (user_id, session_key)
);

-- ---------------------------------------------------------------------------
-- set_logs: lifting sets (lettered blocks: warm-up, A, B, C …)
-- ---------------------------------------------------------------------------
create table if not exists public.set_logs (
  user_id           uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  session_key       text        not null,
  block_id          text        not null,
  set_id            text        not null,
  block_title       text,
  set_label         text,                               -- e.g. 'Set 1 · 6 reps', 'R2 · Chin Up · 6–10'
  done              boolean     not null default false,
  weight            numeric(7, 2),                      -- as entered, in weight_unit
  weight_unit       text        check (weight_unit in ('lb', 'kg')),
  weight_lb         numeric(7, 2),                      -- normalized for charts
  reps              numeric(6, 1),
  rpe               numeric(3, 1) check (rpe is null or (rpe >= 0 and rpe <= 10)),
  rir               numeric(3, 1) check (rir is null or (rir >= 0 and rir <= 10)),
  target_reps       text,
  target_load       text,
  notes             text,
  fields            jsonb       not null default '{}'::jsonb, -- raw app fields (lossless)
  client_updated_at timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (user_id, session_key, block_id, set_id)
);

-- ---------------------------------------------------------------------------
-- segment_logs: run / row segments (warm-up, tempo reps, 500 m pieces, TT …)
-- ---------------------------------------------------------------------------
create table if not exists public.segment_logs (
  user_id           uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  session_key       text        not null,
  block_id          text        not null,
  segment_id        text        not null,
  modality          text        check (modality in ('run', 'row')),
  block_title       text,
  segment_label     text,                               -- e.g. 'Tempo 1 · 1 km / 0.62 mi · HR 140–155'
  done              boolean     not null default false,
  distance_km       numeric(8, 3),
  time_text         text,                               -- as entered ('4:45', '10:00')
  duration_sec      integer     check (duration_sec is null or duration_sec >= 0),
  pace_sec_per_km   numeric(8, 2),
  avg_hr            smallint    check (avg_hr is null or (avg_hr between 30 and 250)),
  hr_target         text,                               -- e.g. '<137', '140–155'
  rpe               numeric(3, 1) check (rpe is null or (rpe >= 0 and rpe <= 10)),
  notes             text,
  fields            jsonb       not null default '{}'::jsonb,
  client_updated_at timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (user_id, session_key, block_id, segment_id)
);

-- ---------------------------------------------------------------------------
-- weigh_ins: quick body-weight log (lb)
-- ---------------------------------------------------------------------------
create table if not exists public.weigh_ins (
  id                uuid        primary key,            -- generated on the device
  user_id           uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  measured_at       timestamptz not null,
  weight_lb         numeric(6, 2) not null check (weight_lb > 50 and weight_lb < 700),
  notes             text,
  deleted           boolean     not null default false, -- soft delete so other devices learn about it
  client_updated_at timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- garmin_activities: written ONLY by a future Garmin Edge Function (service role),
-- read-only for the owner in the app.
-- ---------------------------------------------------------------------------
create table if not exists public.garmin_activities (
  user_id            uuid        not null references auth.users (id) on delete cascade,
  garmin_activity_id text        not null,
  start_time         timestamptz not null,
  activity_type      text,                              -- 'running', 'indoor_rowing', 'strength_training' …
  name               text,
  distance_km        numeric(8, 3),
  duration_sec       integer,
  avg_hr             smallint,
  max_hr             smallint,
  session_key        text,                              -- optional link to sessions.session_key
  raw                jsonb       not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  primary key (user_id, garmin_activity_id)
);

-- indexes (PKs already lead with user_id)
create index if not exists weigh_ins_user_measured_idx on public.weigh_ins (user_id, measured_at desc);
create index if not exists garmin_activities_user_start_idx on public.garmin_activities (user_id, start_time desc);

-- updated_at triggers
drop trigger if exists ht_sessions_updated_at on public.sessions;
create trigger ht_sessions_updated_at before update on public.sessions
  for each row execute function public.ht_set_updated_at();
drop trigger if exists ht_set_logs_updated_at on public.set_logs;
create trigger ht_set_logs_updated_at before update on public.set_logs
  for each row execute function public.ht_set_updated_at();
drop trigger if exists ht_segment_logs_updated_at on public.segment_logs;
create trigger ht_segment_logs_updated_at before update on public.segment_logs
  for each row execute function public.ht_set_updated_at();
drop trigger if exists ht_weigh_ins_updated_at on public.weigh_ins;
create trigger ht_weigh_ins_updated_at before update on public.weigh_ins
  for each row execute function public.ht_set_updated_at();
drop trigger if exists ht_garmin_activities_updated_at on public.garmin_activities;
create trigger ht_garmin_activities_updated_at before update on public.garmin_activities
  for each row execute function public.ht_set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security: owner-only, every table, every operation
-- ---------------------------------------------------------------------------
alter table public.sessions          enable row level security;
alter table public.set_logs          enable row level security;
alter table public.segment_logs      enable row level security;
alter table public.weigh_ins         enable row level security;
alter table public.garmin_activities enable row level security;

alter table public.sessions          force row level security;
alter table public.set_logs          force row level security;
alter table public.segment_logs      force row level security;
alter table public.weigh_ins         force row level security;
alter table public.garmin_activities force row level security;

-- the app never talks to these tables without a signed-in user
revoke all on public.sessions, public.set_logs, public.segment_logs, public.weigh_ins, public.garmin_activities from anon;
grant select, insert, update, delete on public.sessions, public.set_logs, public.segment_logs, public.weigh_ins to authenticated;
grant select on public.garmin_activities to authenticated;

do $$
declare t text;
begin
  foreach t in array array['sessions', 'set_logs', 'segment_logs', 'weigh_ins'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);

    execute format($p$create policy %I on public.%I for select to authenticated
                     using (user_id = (select auth.uid()))$p$, t || '_select_own', t);
    execute format($p$create policy %I on public.%I for insert to authenticated
                     with check (user_id = (select auth.uid()))$p$, t || '_insert_own', t);
    execute format($p$create policy %I on public.%I for update to authenticated
                     using (user_id = (select auth.uid()))
                     with check (user_id = (select auth.uid()))$p$, t || '_update_own', t);
    execute format($p$create policy %I on public.%I for delete to authenticated
                     using (user_id = (select auth.uid()))$p$, t || '_delete_own', t);
  end loop;
end;
$$;

drop policy if exists garmin_activities_select_own on public.garmin_activities;
create policy garmin_activities_select_own on public.garmin_activities
  for select to authenticated
  using (user_id = (select auth.uid()));
-- No insert/update/delete policies: only the service role (Edge Function) writes here.

commit;
