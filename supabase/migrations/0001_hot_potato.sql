-- HOT POTATO — Supabase / PostgreSQL reference backend
--
-- This is the blueprint's alternative to the bundled local trusted server.
-- The React client in this repo is wired to the local server (src/lib/api.js),
-- so this migration is a documented starting point, not a drop-in replacement:
-- wire the RPCs below into src/lib/api.js and add a Realtime broadcast trigger
-- before using it. Test it in a scratch Supabase project first.
--
-- Security model: no client may read or write base tables directly. Every
-- action goes through a SECURITY DEFINER RPC that authenticates the player by
-- a raw session token sent over HTTPS and stores only its SHA-256 hash.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique check (room_code ~ '^[A-HJ-NP-Z2-9]{5}$'),
  host_player_id uuid,
  status text not null default 'WAITING' check (status in ('WAITING', 'PLAYING', 'FINISHED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 16),
  session_token_hash text not null unique,
  lives integer not null default 3 check (lives between 0 and 3),
  player_status text not null default 'ALIVE' check (player_status in ('ALIVE', 'ELIMINATED')),
  ready boolean not null default false,
  joined_at timestamptz not null default now(),
  eliminated_at timestamptz,
  last_seen timestamptz not null default now()
);
create index if not exists players_room_idx on public.players(room_id);

create table if not exists public.game_state (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  match_id uuid not null,
  round_number integer not null default 0,
  bomb_holder_id uuid references public.players(id),
  status text not null check (status in ('WAITING', 'ACTIVE', 'RESOLVING', 'COMPLETE')),
  -- Private: must never be returned by an RPC, view, Realtime payload or log.
  secret_explosion_at timestamptz,
  state_version bigint not null default 0,
  winner_id uuid references public.players(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.game_events (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  match_id uuid,
  round_number integer not null,
  event_type text not null check (event_type in ('PASS', 'EXPLOSION', 'ELIMINATION', 'MATCH_END', 'ROUND_START', 'MATCH_START')),
  actor_id uuid references public.players(id),
  target_id uuid references public.players(id),
  created_at timestamptz not null default now()
);
create index if not exists game_events_room_idx on public.game_events(room_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS: enabled with no policies, so direct client access is denied.
-- ---------------------------------------------------------------------------

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.game_state enable row level security;
alter table public.game_events enable row level security;

revoke all on public.rooms, public.players, public.game_state, public.game_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.hp_new_code()
returns text language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
  from generate_series(1, 5);
$$;

create or replace function public.hp_token_hash(p_token text)
returns text language sql immutable as $$
  select encode(digest(p_token, 'sha256'), 'hex');
$$;

create or replace function public.hp_player(p_code text, p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select p.id into v_id
  from public.players p
  join public.rooms r on r.id = p.room_id
  where r.room_code = upper(p_code) and p.session_token_hash = public.hp_token_hash(p_token);
  return v_id;
end $$;

create or replace function public.hp_log(p_room uuid, p_match uuid, p_round int, p_type text, p_actor uuid, p_target uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.game_events(room_id, match_id, round_number, event_type, actor_id, target_id)
  values (p_room, p_match, p_round, p_type, p_actor, p_target);
$$;

-- ---------------------------------------------------------------------------
-- Lobby RPCs
-- ---------------------------------------------------------------------------

create or replace function public.hp_create_room(p_name text, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_room public.rooms%rowtype; v_player public.players%rowtype; v_code text;
begin
  if p_name is null or char_length(btrim(p_name)) not between 2 and 16 then
    raise exception 'Name must be 2-16 characters' using errcode = '22023';
  end if;
  if p_token is null or char_length(p_token) < 20 then
    raise exception 'Invalid session token' using errcode = '22023';
  end if;
  loop
    v_code := public.hp_new_code();
    exit when not exists (select 1 from public.rooms where room_code = v_code);
  end loop;
  insert into public.rooms(room_code) values (v_code) returning * into v_room;
  insert into public.players(room_id, display_name, session_token_hash)
  values (v_room.id, btrim(p_name), public.hp_token_hash(p_token)) returning * into v_player;
  update public.rooms set host_player_id = v_player.id where id = v_room.id;
  return jsonb_build_object('code', v_code, 'playerId', v_player.id);
end $$;

create or replace function public.hp_join_room(p_code text, p_name text, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_room public.rooms%rowtype; v_player public.players%rowtype;
begin
  select * into v_room from public.rooms where room_code = upper(p_code);
  if not found then raise exception 'Room not found' using errcode = '22023'; end if;
  if v_room.status <> 'WAITING' then raise exception 'Match already started' using errcode = '22023'; end if;
  if (select count(*) from public.players where room_id = v_room.id) >= 10 then
    raise exception 'Room is full (10 players max)' using errcode = '22023';
  end if;
  if exists (select 1 from public.players where room_id = v_room.id and lower(display_name) = lower(btrim(p_name))) then
    raise exception 'Name already taken' using errcode = '22023';
  end if;
  insert into public.players(room_id, display_name, session_token_hash)
  values (v_room.id, btrim(p_name), public.hp_token_hash(p_token)) returning * into v_player;
  return jsonb_build_object('code', v_room.room_code, 'playerId', v_player.id);
end $$;

create or replace function public.hp_set_ready(p_code text, p_token text, p_ready boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_room public.rooms%rowtype; v_player_id uuid;
begin
  select * into v_room from public.rooms where room_code = upper(p_code);
  v_player_id := public.hp_player(p_code, p_token);
  if v_player_id is null then raise exception 'Unauthorized' using errcode = '42501'; end if;
  if v_room.status <> 'WAITING' then raise exception 'Not in lobby' using errcode = '22023'; end if;
  update public.players set ready = p_ready where id = v_player_id;
  return public.hp_get_state(p_code, p_token);
end $$;

-- ---------------------------------------------------------------------------
-- Public state: deliberately excludes secret_explosion_at and token hashes.
-- ---------------------------------------------------------------------------

create or replace function public.hp_get_state(p_code text, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_room public.rooms%rowtype; v_player_id uuid; v_result jsonb;
begin
  select * into v_room from public.rooms where room_code = upper(p_code);
  if not found then raise exception 'Room not found' using errcode = '22023'; end if;
  v_player_id := public.hp_player(p_code, p_token);
  if v_player_id is null then raise exception 'Unauthorized' using errcode = '42501'; end if;

  select jsonb_build_object(
    'code', v_room.room_code,
    'status', v_room.status,
    'hostId', v_room.host_player_id,
    'maxPlayers', 10,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.display_name, 'lives', p.lives,
        'status', p.player_status, 'ready', p.ready, 'connected', true,
        'eliminatedAt', p.eliminated_at, 'isHost', p.id = v_room.host_player_id
      ) order by p.joined_at)
      from public.players p where p.room_id = v_room.id
    ), '[]'::jsonb),
    'game', (
      select jsonb_build_object(
        'matchId', g.match_id, 'round', g.round_number, 'status', g.status,
        'holderId', g.bomb_holder_id, 'winnerId', g.winner_id,
        'version', g.state_version, 'fuse', '?',
        'activeCount', (select count(*) from public.players p where p.room_id = v_room.id and p.player_status = 'ALIVE')
      ) from public.game_state g where g.room_id = v_room.id
    )
  ) into v_result;
  return v_result;
end $$;

-- ---------------------------------------------------------------------------
-- Trusted game logic
-- ---------------------------------------------------------------------------

create or replace function public.hp_start_round(p_room uuid, p_now timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare v_game public.game_state%rowtype; v_holder uuid; v_fuse int;
begin
  select * into v_game from public.game_state where room_id = p_room for update;
  if v_game.status = 'COMPLETE' then return; end if;
  if (select count(*) from public.players where room_id = p_room and player_status = 'ALIVE') <= 1 then
    perform public.hp_finish_match(p_room);
    return;
  end if;
  select id into v_holder from public.players
  where room_id = p_room and player_status = 'ALIVE' order by random() limit 1;
  v_fuse := 5 + floor(random() * 26)::int; -- hidden 5-30s fuse
  update public.game_state
  set round_number = round_number + 1, bomb_holder_id = v_holder, status = 'ACTIVE',
      secret_explosion_at = p_now + make_interval(secs => v_fuse),
      state_version = state_version + 1, updated_at = p_now
  where room_id = p_room;
  perform public.hp_log(p_room, v_game.match_id, v_game.round_number + 1, 'ROUND_START', v_holder, null);
end $$;

create or replace function public.hp_finish_match(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_winner uuid; v_match uuid; v_round int;
begin
  select id into v_winner from public.players where room_id = p_room and player_status = 'ALIVE' limit 1;
  select match_id, round_number into v_match, v_round from public.game_state where room_id = p_room;
  update public.game_state set status = 'COMPLETE', winner_id = v_winner, state_version = state_version + 1 where room_id = p_room;
  update public.rooms set status = 'FINISHED', updated_at = now() where id = p_room;
  perform public.hp_log(p_room, v_match, v_round, 'MATCH_END', v_winner, null);
end $$;

create or replace function public.hp_start_match(p_code text, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_room public.rooms%rowtype; v_player_id uuid; v_match uuid;
begin
  select * into v_room from public.rooms where room_code = upper(p_code) for update;
  v_player_id := public.hp_player(p_code, p_token);
  if v_player_id is null or v_player_id <> v_room.host_player_id then
    raise exception 'Only the host can start' using errcode = '42501';
  end if;
  if v_room.status <> 'WAITING' then raise exception 'Not in lobby' using errcode = '22023'; end if;
  if (select count(*) from public.players where room_id = v_room.id and ready) < 2 then
    raise exception 'At least two ready players are required' using errcode = '22023';
  end if;

  v_match := gen_random_uuid();
  update public.players set lives = 3, player_status = 'ALIVE', ready = false, eliminated_at = null where room_id = v_room.id;
  insert into public.game_state(room_id, match_id, status)
  values (v_room.id, v_match, 'ACTIVE')
  on conflict (room_id) do update set match_id = excluded.match_id, round_number = 0,
    bomb_holder_id = null, status = 'ACTIVE', secret_explosion_at = null,
    state_version = game_state.state_version + 1, winner_id = null;
  update public.rooms set status = 'PLAYING' where id = v_room.id;
  perform public.hp_log(v_room.id, v_match, 0, 'MATCH_START', null, null);
  perform public.hp_start_round(v_room.id, now());
  return public.hp_get_state(p_code, p_token);
end $$;

-- Idempotent per round: only a round still ACTIVE past its private deadline
-- can be resolved. Returns a JSON description used by the scheduler/broadcast.
create or replace function public.hp_resolve_overdue(p_room uuid, p_now timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_game public.game_state%rowtype; v_victim public.players%rowtype; v_eliminated boolean := false; v_finished boolean;
begin
  select * into v_game from public.game_state where room_id = p_room for update;
  if v_game.status <> 'ACTIVE' or p_now < v_game.secret_explosion_at then return null; end if;

  update public.game_state set status = 'RESOLVING', state_version = state_version + 1 where room_id = p_room;
  select * into v_victim from public.players where id = v_game.bomb_holder_id;
  if found then
    update public.players set lives = greatest(0, lives - 1) where id = v_victim.id returning * into v_victim;
    if v_victim.lives = 0 then
      update public.players set player_status = 'ELIMINATED', eliminated_at = p_now where id = v_victim.id;
      v_eliminated := true;
      perform public.hp_log(p_room, v_game.match_id, v_game.round_number, 'ELIMINATION', v_victim.id, null);
    end if;
    perform public.hp_log(p_room, v_game.match_id, v_game.round_number, 'EXPLOSION', v_victim.id, null);
  end if;

  if (select count(*) from public.players where room_id = p_room and player_status = 'ALIVE') <= 1 then
    perform public.hp_finish_match(p_room);
    v_finished := true;
  end if;

  return jsonb_build_object(
    'victimId', v_victim.id, 'victimName', v_victim.display_name,
    'eliminated', v_eliminated, 'round', v_game.round_number, 'matchFinished', v_finished
  );
end $$;

create or replace function public.hp_pass_bomb(p_code text, p_token text, p_target uuid, p_version bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_room public.rooms%rowtype; v_player_id uuid; v_game public.game_state%rowtype; v_explosion jsonb; v_now timestamptz := now();
begin
  select * into v_room from public.rooms where room_code = upper(p_code);
  v_player_id := public.hp_player(p_code, p_token);
  if v_player_id is null then raise exception 'Unauthorized' using errcode = '42501'; end if;

  -- Lock the state row: two simultaneous passes cannot both succeed.
  select * into v_game from public.game_state where room_id = v_room.id for update;
  if v_game.status <> 'ACTIVE' then raise exception 'Round is not active' using errcode = '22023'; end if;

  v_explosion := public.hp_resolve_overdue(v_room.id, v_now);
  if v_explosion is not null then
    return jsonb_build_object('ok', false, 'expired', true, 'explosion', v_explosion);
  end if;
  if p_version is distinct from v_game.state_version then
    raise exception 'Outdated screen' using errcode = '22023';
  end if;
  if v_game.bomb_holder_id <> v_player_id then raise exception 'Only the holder can pass' using errcode = '22023'; end if;
  if not exists (select 1 from public.players where id = p_target and room_id = v_room.id and player_status = 'ALIVE') then
    raise exception 'Target must be alive in this room' using errcode = '22023';
  end if;

  update public.game_state set bomb_holder_id = p_target, state_version = state_version + 1, updated_at = v_now where room_id = v_room.id;
  perform public.hp_log(v_room.id, v_game.match_id, v_game.round_number, 'PASS', v_player_id, p_target);
  return public.hp_get_state(p_code, p_token);
end $$;

create or replace function public.hp_check_overdue(p_code text, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_room public.rooms%rowtype; v_result jsonb;
begin
  select * into v_room from public.rooms where room_code = upper(p_code);
  if public.hp_player(p_code, p_token) is null then raise exception 'Unauthorized' using errcode = '42501'; end if;
  v_result := public.hp_resolve_overdue(v_room.id, now());
  return coalesce(v_result, public.hp_get_state(p_code, p_token));
end $$;

-- Trusted scheduled process (pg_cron): resolves overdue rounds even when every
-- browser disconnects. Enable the extension in Supabase and schedule, e.g.:
-- select cron.schedule('hot-potato-resolver', '1 seconds', 'select public.hp_resolve_all_overdue();');
create or replace function public.hp_resolve_all_overdue()
returns integer language plpgsql security definer set search_path = public as $$
declare v_room uuid; v_count integer := 0;
begin
  for v_room in
    select g.room_id from public.game_state g
    where g.status = 'ACTIVE' and g.secret_explosion_at <= now()
  loop
    if public.hp_resolve_overdue(v_room, now()) is not null then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end $$;

create or replace function public.hp_play_again(p_code text, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_room public.rooms%rowtype; v_player_id uuid;
begin
  select * into v_room from public.rooms where room_code = upper(p_code) for update;
  v_player_id := public.hp_player(p_code, p_token);
  if v_player_id is null or v_player_id <> v_room.host_player_id then
    raise exception 'Only the host can reset the match' using errcode = '42501';
  end if;
  delete from public.game_state where room_id = v_room.id;
  update public.players set lives = 3, player_status = 'ALIVE', ready = false, eliminated_at = null where room_id = v_room.id;
  update public.rooms set status = 'WAITING', updated_at = now() where id = v_room.id;
  return public.hp_get_state(p_code, p_token);
end $$;

-- ---------------------------------------------------------------------------
-- Grants. Never grant service-role access to browsers; use only the public
-- publishable/anon key in frontend environment variables.
-- ---------------------------------------------------------------------------

grant execute on function
  public.hp_create_room(text, text),
  public.hp_join_room(text, text, text),
  public.hp_get_state(text, text),
  public.hp_set_ready(text, text, boolean),
  public.hp_start_match(text, text),
  public.hp_pass_bomb(text, text, uuid, bigint),
  public.hp_check_overdue(text, text),
  public.hp_play_again(text, text)
to anon, authenticated;

revoke all on function public.hp_resolve_all_overdue() from anon, authenticated;
