-- Game alerts, Pick'em leaderboard and chat replies — Supabase database addition
-- Paste this whole file into Supabase → SQL Editor → New snippet, then click Run. Running it again is safe.
-- (Builds on supabase-setup.sql and picks-setup.sql.)

-- ============ Chat replies ============
-- A message can answer another message in the same chat.
alter table public.messages add column if not exists reply_to bigint references public.messages (id) on delete set null;

-- ============ Finished games (grades Pick'em) ============
-- Filled in by the site's server as games go final. Anyone can read results; only the server can write them.
create table if not exists public.game_results (
  game_id text primary key check (game_id ~ '^[0-9]{4,12}$'),
  winner text not null check (winner in ('home', 'away')),
  home_score int,
  away_score int,
  played_at timestamptz not null default now()
);
create index if not exists game_results_played on public.game_results (played_at desc);
alter table public.game_results enable row level security;
drop policy if exists "results readable" on public.game_results;
create policy "results readable" on public.game_results for select using (true);

-- ============ Pick'em leaderboard ============
-- scope 'week' = games since Monday (Eastern time); 'season' = every graded pick.
-- streak = how many picks in a row someone has gotten right, counting back from their latest graded pick.
create or replace function public.pick_leaderboard(scope text default 'week')
returns table (place int, user_id uuid, username text, wins int, losses int, streak int)
language sql stable security definer set search_path = public as $$
  with graded as (
    select p.user_id, r.played_at, r.game_id, (p.side = r.winner) as ok
    from public.picks p
    join public.game_results r on r.game_id = p.game_id
    where scope = 'season'
       or r.played_at >= (date_trunc('week', now() at time zone 'America/New_York') at time zone 'America/New_York')
  ), seq as (
    select user_id, ok, row_number() over (partition by user_id order by played_at desc, game_id desc) as rn from graded
  ), tot as (
    select user_id, (count(*) filter (where ok))::int as wins, (count(*) filter (where not ok))::int as losses
    from graded group by user_id
  ), stk as (
    select user_id, coalesce(min(rn) filter (where not ok) - 1, count(*))::int as streak from seq group by user_id
  )
  select (rank() over (order by t.wins desc, t.losses asc))::int, t.user_id, pr.username, t.wins, t.losses, s.streak
  from tot t
  join stk s on s.user_id = t.user_id
  join public.profiles pr on pr.id = t.user_id
  where not coalesce(pr.banned, false)
  order by 1, pr.username
  limit 500;
$$;
grant execute on function public.pick_leaderboard(text) to anon, authenticated;

-- ============ Game alerts (push notifications) ============
-- One row per phone/browser that turned alerts on. Only the server can read this list.
create table if not exists public.push_subs (
  endpoint text primary key check (endpoint ~ '^https://' and char_length(endpoint) < 1000),
  p256dh text not null check (char_length(p256dh) between 20 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  teams text[] not null default '{}',
  kinds text[] not null default '{myteams}',
  user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.push_subs enable row level security;   -- no policies on purpose: browsers can't read it

-- The site calls this to turn alerts on or change which teams / kinds of alerts a device gets.
-- kinds: 'myteams' (tip-off, close finish, final for followed teams), 'upsets' (ranked teams in trouble),
--        'close' (any Top 25 game that's close late).
create or replace function public.save_push(ep text, key text, secret text, team_list text[], kind_list text[])
returns text language plpgsql security definer set search_path = public as $$
declare t text; k text;
begin
  if ep !~ '^https://' or char_length(ep) >= 1000 then raise exception 'Bad push address'; end if;
  team_list := coalesce(team_list, '{}'); kind_list := coalesce(kind_list, '{}');
  if cardinality(team_list) > 40 then raise exception 'Too many teams'; end if;
  foreach t in array team_list loop
    if t !~ '^[a-z0-9-]{1,60}$' then raise exception 'Bad team name'; end if;
  end loop;
  foreach k in array kind_list loop
    if k not in ('myteams', 'upsets', 'close') then raise exception 'Bad alert type'; end if;
  end loop;
  insert into public.push_subs (endpoint, p256dh, auth, teams, kinds, user_id)
  values (ep, key, secret, team_list, kind_list, auth.uid())
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, teams = excluded.teams,
    kinds = excluded.kinds, user_id = coalesce(excluded.user_id, public.push_subs.user_id), updated_at = now();
  return 'ok';
end;
$$;
grant execute on function public.save_push(text, text, text, text[], text[]) to anon, authenticated;

create or replace function public.delete_push(ep text)
returns text language sql security definer set search_path = public as $$
  delete from public.push_subs where endpoint = ep;
  select 'ok';
$$;
grant execute on function public.delete_push(text) to anon, authenticated;

-- Which alerts already went out, so nobody gets the same one twice. Only the server uses it.
create table if not exists public.alert_log (
  game_id text not null,
  kind text not null,
  sent_at timestamptz not null default now(),
  primary key (game_id, kind)
);
alter table public.alert_log enable row level security;

-- Admin page: how many devices have alerts on.
create or replace function public.push_count()
returns int language sql stable security definer set search_path = public as $$
  select case when public.is_admin() then (select count(*)::int from public.push_subs) else null end;
$$;
grant execute on function public.push_count() to authenticated;
