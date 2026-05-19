create extension if not exists pgcrypto;
create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists public.pins (
  id uuid primary key default gen_random_uuid(),
  lat double precision not null,
  lng double precision not null,
  note text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_by_installation_id text not null,
  constraint pins_expires_after_create check (expires_at > created_at)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  body text not null check (char_length(trim(body)) > 0 and char_length(body) <= 1000),
  created_at timestamptz not null default now(),
  installation_id text not null
);

create table if not exists public.device_preferences (
  installation_id text primary key,
  notifications_enabled boolean not null default true,
  expo_push_token text unique,
  updated_at timestamptz not null default now()
);

alter table public.pins enable row level security;
alter table public.chat_messages enable row level security;
alter table public.device_preferences enable row level security;

drop policy if exists "pins_read_all" on public.pins;
create policy "pins_read_all" on public.pins for select using (true);

drop policy if exists "pins_insert_all" on public.pins;
create policy "pins_insert_all" on public.pins for insert with check (true);

drop policy if exists "chat_read_all" on public.chat_messages;
create policy "chat_read_all" on public.chat_messages for select using (true);

drop policy if exists "chat_insert_all" on public.chat_messages;
create policy "chat_insert_all" on public.chat_messages for insert with check (true);

drop policy if exists "prefs_read_all" on public.device_preferences;
create policy "prefs_read_all" on public.device_preferences for select using (true);

drop policy if exists "prefs_upsert_all" on public.device_preferences;
create policy "prefs_upsert_all" on public.device_preferences for insert with check (true);

drop policy if exists "prefs_update_all" on public.device_preferences;
create policy "prefs_update_all" on public.device_preferences for update using (true) with check (true);

alter publication supabase_realtime add table public.pins;
alter publication supabase_realtime add table public.chat_messages;

create or replace function public.cleanup_expired_pins()
returns void
language sql
security definer
as $$
  delete from public.pins where expires_at <= now();
$$;

select cron.schedule(
  'cleanup-expired-pins-every-minute',
  '* * * * *',
  $$ select public.cleanup_expired_pins(); $$
)
where not exists (
  select 1 from cron.job where jobname = 'cleanup-expired-pins-every-minute'
);
