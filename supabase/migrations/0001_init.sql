-- Ready v1 schema. Apply with: supabase db push  (or paste into the SQL editor).
-- Every table is owner-only via RLS; the client uses the anon key + user JWT.

-- Profiles mirror auth.users (created lazily on first sign-in).
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- One row per user: the full session envelope, synced last-write-wins.
create table if not exists public.user_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  envelope jsonb not null,
  updated_at timestamptz not null default now()
);

-- Append-only event log (block completions, mocks, stop-screen, outcomes).
-- Feeds the anti-metrics dashboard later; nothing in-app reads it.
create table if not exists public.events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  type text not null,
  payload jsonb not null default '{}'::jsonb
);
create index if not exists events_user_at on public.events (user_id, at);

-- Post-test outcome collection — the P0 calibration loop.
create table if not exists public.outcomes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  result text not null check (result in ('passed', 'failed', 'not_yet')),
  predicted_pct int,
  test_date date,
  reported_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.user_state enable row level security;
alter table public.events enable row level security;
alter table public.outcomes enable row level security;

create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own state" on public.user_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own events" on public.events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own outcomes" on public.outcomes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
