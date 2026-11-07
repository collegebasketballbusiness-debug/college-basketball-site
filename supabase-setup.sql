-- College Basketball live game chat — Supabase database setup
-- Paste this whole file into Supabase → SQL Editor → New query, then click Run. Running it again is safe.

-- ============ Tables ============

-- One row per chat user. Created automatically when someone signs up.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  is_admin boolean not null default false,
  banned boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_username_lower on public.profiles (lower(username));

-- Chat messages. game_id is the NCAA game number.
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  game_id text not null check (game_id ~ '^[0-9]{4,12}$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  username text not null,
  body text not null,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  check (deleted or char_length(body) between 1 and 280)
);
create index if not exists messages_game_time on public.messages (game_id, created_at desc);
create index if not exists messages_user_time on public.messages (user_id, created_at desc);

-- Reports from users about messages.
create table if not exists public.reports (
  id bigint generated always as identity primary key,
  message_id bigint not null references public.messages (id) on delete cascade,
  game_id text not null,
  reporter uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (message_id, reporter)
);

-- Words that are blocked in messages. Add more any time:
--   insert into public.banned_words (word) values ('example');
create table if not exists public.banned_words (word text primary key);
insert into public.banned_words (word) values
  ('fuck'),('fucking'),('fucker'),('motherfucker'),('shit'),('bullshit'),('bitch'),('cunt'),('cock'),('dick'),
  ('pussy'),('asshole'),('bastard'),('whore'),('slut'),('fag'),('faggot'),('retard'),('retarded'),
  ('nigger'),('nigga'),('chink'),('spic'),('kike'),('tranny'),('dyke'),('wetback'),('gook'),('coon')
on conflict do nothing;

-- ============ Helper ============

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- ============ New users get a profile ============

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uname text := new.raw_user_meta_data ->> 'username';
begin
  if uname is null or uname !~ '^[A-Za-z0-9_]{3,20}$' then
    raise exception 'Choose a username of 3 to 20 letters, numbers or underscores';
  end if;
  if coalesce((new.raw_user_meta_data ->> 'age_ok')::boolean, false) is not true then
    raise exception 'You must be 13 or older to join the chat';
  end if;
  if exists (select 1 from public.banned_words b where lower(uname) like '%' || b.word || '%') then
    raise exception 'That username is not allowed';
  end if;
  insert into public.profiles (id, username) values (new.id, uname);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ Checks on every new message ============

create or replace function public.check_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  pattern text;
begin
  select * into p from public.profiles where id = new.user_id;
  if p.id is null then raise exception 'Sign in to chat'; end if;
  if p.banned then raise exception 'You have been banned from the chat'; end if;

  -- slow mode: one message every 3 seconds per person
  if exists (select 1 from public.messages
             where user_id = new.user_id and created_at > now() - interval '3 seconds') then
    raise exception 'Slow down — you can send one message every 3 seconds';
  end if;

  new.body := btrim(regexp_replace(new.body, '\s+', ' ', 'g'));
  if char_length(new.body) not between 1 and 280 then
    raise exception 'Messages must be 1 to 280 characters';
  end if;

  select string_agg(regexp_replace(word, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '|') into pattern from public.banned_words;
  if pattern is not null and lower(new.body) ~ ('(^|[^a-z])(' || pattern || ')s?([^a-z]|$)') then
    raise exception 'That message has language that is not allowed here';
  end if;

  new.username := p.username;   -- always the real username, whatever the browser sent
  new.created_at := now();
  new.deleted := false;
  return new;
end;
$$;

drop trigger if exists messages_check on public.messages;
create trigger messages_check before insert on public.messages
  for each row execute function public.check_message();

-- When an admin removes a message, wipe its text so it can't be read later.
create or replace function public.wipe_deleted() returns trigger
language plpgsql as $$
begin
  if new.deleted and not old.deleted then new.body := ''; end if;
  return new;
end;
$$;
drop trigger if exists messages_wipe on public.messages;
create trigger messages_wipe before update on public.messages
  for each row execute function public.wipe_deleted();

-- ============ Security rules (who can read and write what) ============

alter table public.profiles enable row level security;
alter table public.messages enable row level security;
alter table public.reports enable row level security;
alter table public.banned_words enable row level security;

drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles for select using (true);
drop policy if exists "admins update profiles" on public.profiles;
create policy "admins update profiles" on public.profiles for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "messages readable" on public.messages;
create policy "messages readable" on public.messages for select using (true);
drop policy if exists "signed-in users post as themselves" on public.messages;
create policy "signed-in users post as themselves" on public.messages for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "admins remove messages" on public.messages;
create policy "admins remove messages" on public.messages for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "users report as themselves" on public.reports;
create policy "users report as themselves" on public.reports for insert to authenticated
  with check (reporter = auth.uid());
drop policy if exists "admins read reports" on public.reports;
create policy "admins read reports" on public.reports for select using (public.is_admin());
drop policy if exists "admins clear reports" on public.reports;
create policy "admins clear reports" on public.reports for delete using (public.is_admin());

-- banned_words: no policies, so nobody can read or change it from the website (only from this SQL editor).

-- Only admins may change these columns; everyone else can't update profiles at all.
revoke update on public.messages from anon, authenticated;
grant update (deleted, body) on public.messages to authenticated;
revoke update on public.profiles from anon, authenticated;
grant update (banned) on public.profiles to authenticated;

-- ============ Live updates ============

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
