-- ═══════════════════════════════════════════════════════════════════════════
-- app_events + admin stats  ·  APPLIED LIVE 2026-07-17 via MCP
-- ═══════════════════════════════════════════════════════════════════════════
-- Recorded here because cleanup-expired-plans taught us the lesson the hard
-- way: a database object that exists only in the cloud is invisible to
-- everyone reading the code, and the next person builds against a fiction.
-- This file is the source of truth. Applied state should match it.
--
-- WHY: plans are deleted 24h after they start (cleanup-expired-plans, hourly),
-- and the cascade takes their messages, RSVPs and notifications. So the app had
-- no memory: 40 signups, 9 actives, and no way to see where the other 31 went.
-- app_events is the record that outlives the plan.
--
-- PRIVACY CONTRACT: ids, kinds, counts, flags. NEVER message text, never a
-- place name, never a guest list. The only read path is stats_overview(),
-- which is aggregate-by-construction — no call returns a person.

-- ── the table ──────────────────────────────────────────────────────────────
-- NO foreign key to plans. That single omission IS the feature: notifications
-- has one, which is exactly why the cascade destroys them. NO fk on actor
-- either, so deleting an account doesn't erase history — the id just stops
-- resolving to anyone, which is the point (pseudonymous, not personal).
create table if not exists public.app_events (
  id      bigserial primary key,
  at      timestamptz not null default now(),
  kind    text        not null,
  actor   uuid,
  plan_id uuid,
  meta    jsonb       not null default '{}'::jsonb
);
create index if not exists app_events_at_idx      on public.app_events (at desc);
create index if not exists app_events_kind_at_idx on public.app_events (kind, at desc);
create index if not exists app_events_actor_idx   on public.app_events (actor, at desc);

-- RLS on, ZERO policies: nothing reaches this table through the API. Triggers
-- write it (security definer), stats_overview() reads it (security definer).
alter table public.app_events enable row level security;

-- ── who may look ───────────────────────────────────────────────────────────
create table if not exists public.admins (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.admins enable row level security;   -- no policies: RPC-only

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.admins a where a.user_id = auth.uid()) $$;
grant execute on function public.is_admin() to authenticated;

-- Grant access with:  insert into admins(user_id) select id from auth.users
--                     where lower(email) = 'someone@example.com';

-- ── triggers ───────────────────────────────────────────────────────────────
-- SECURITY DEFINER so they can write past the deny-all RLS, and so they cover
-- BOTH clients — live 2.0 and the old 1.0 web app — with no release and no
-- App Review. That's why this is triggers and not app code.

create or replace function public.ev_profile_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into app_events(at, kind, actor)
  values (coalesce(new.created_at, now()), 'signed_up', new.id);
  return null;
end $$;
drop trigger if exists trg_ev_profile_created on public.profiles;
create trigger trg_ev_profile_created after insert on public.profiles
for each row execute function public.ev_profile_created();

-- TWO rows — one per side. Emitting only for the addressee undercounted the
-- funnel's most important step ("added a friend": 16 vs the true 27), because
-- whoever SENT the accepted request was never recorded. kpi divides by 2.
create or replace function public.ev_friend_accepted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'accepted' and (old.status is distinct from 'accepted') then
    insert into app_events(kind, actor, meta) values
      ('friend_added', new.addressee, jsonb_build_object('peer', new.requester)),
      ('friend_added', new.requester, jsonb_build_object('peer', new.addressee));
  end if;
  return null;
end $$;
drop trigger if exists trg_ev_friend_accepted on public.friendships;
create trigger trg_ev_friend_accepted after update on public.friendships
for each row execute function public.ev_friend_accepted();

-- The shape of a plan: this is the media-kit row (group size, lead time, night
-- of week, category). No place name — the vibe is the audience signal.
create or replace function public.ev_plan_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into app_events(kind, actor, plan_id, meta)
  values ('plan_created', new.host, new.id, jsonb_build_object(
    'vibe', new.vibe,
    'days_ahead', case when new.starts_at is null then null
                  else round(extract(epoch from (new.starts_at - now()))/86400.0, 1) end,
    'dow',  case when new.starts_at is null then null else extract(isodow from new.starts_at) end,
    'hour', case when new.starts_at is null then null else extract(hour from new.starts_at) end,
    'spot_limit', new.spot_limit,
    'open',  coalesce(new.open_to_friends, false),
    'bring', coalesce(new.bring_enabled, false),
    'has_place', (new.place_name is not null)
  ));
  return null;
end $$;
drop trigger if exists trg_ev_plan_created on public.plans;
create trigger trg_ev_plan_created after insert on public.plans
for each row execute function public.ev_plan_created();

create or replace function public.ev_plan_cancelled()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.cancelled and not coalesce(old.cancelled, false) then
    insert into app_events(kind, actor, plan_id) values ('plan_cancelled', new.host, new.id);
  end if;
  return null;
end $$;
drop trigger if exists trg_ev_plan_cancelled on public.plans;
create trigger trg_ev_plan_cancelled after update on public.plans
for each row execute function public.ev_plan_cancelled();

-- INSERT rsvp='invited' is an invitation; anything else is a self-join on an
-- open plan (2.2) — that's an answer, not an invite.
create or replace function public.ev_invitee_ins()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.rsvp = 'invited' then
    insert into app_events(kind, actor, plan_id) values ('invited', new.invitee, new.plan_id);
  else
    insert into app_events(kind, actor, plan_id, meta)
    values ('rsvp_set', new.invitee, new.plan_id,
            jsonb_build_object('rsvp', new.rsvp, 'self_join', true));
  end if;
  return null;
end $$;
drop trigger if exists trg_ev_invitee_ins on public.plan_invitees;
create trigger trg_ev_invitee_ins after insert on public.plan_invitees
for each row execute function public.ev_invitee_ins();

create or replace function public.ev_invitee_rsvp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.rsvp is distinct from old.rsvp then
    insert into app_events(kind, actor, plan_id, meta)
    values ('rsvp_set', new.invitee, new.plan_id,
            jsonb_build_object('rsvp', new.rsvp, 'from', old.rsvp));
  end if;
  return null;
end $$;
drop trigger if exists trg_ev_invitee_rsvp on public.plan_invitees;
create trigger trg_ev_invitee_rsvp after update on public.plan_invitees
for each row execute function public.ev_invitee_rsvp();

-- WHICH KIND was sent, never what it said.
create or replace function public.ev_plan_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into app_events(kind, actor, plan_id, meta)
  values ('plan_message', new.sender, new.plan_id, jsonb_build_object(
    'media', case when new.voice_url is not null then 'voice'
                  when new.photo_url like '%.gif' then 'gif'
                  when new.photo_url is not null then 'photo' else 'text' end,
    'mentions', coalesce(jsonb_array_length(new.mentions), 0),
    'reply', (new.reply_to is not null)));
  return null;
end $$;
drop trigger if exists trg_ev_plan_message on public.plan_messages;
create trigger trg_ev_plan_message after insert on public.plan_messages
for each row execute function public.ev_plan_message();

create or replace function public.ev_dm_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into app_events(kind, actor, meta)
  values ('dm_message', new.sender, jsonb_build_object(
    'media', case when new.voice_url is not null then 'voice'
                  when new.video_url is not null then 'video'
                  when new.photo_url like '%.gif' then 'gif'
                  when new.photo_url is not null then 'photo' else 'text' end));
  return null;
end $$;
drop trigger if exists trg_ev_dm_message on public.direct_messages;
create trigger trg_ev_dm_message after insert on public.direct_messages
for each row execute function public.ev_dm_message();

create or replace function public.ev_story_posted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into app_events(kind, actor, plan_id, meta)
  values ('story_posted', new.user_id, new.plan_id,
          jsonb_build_object('to_plan', (new.plan_id is not null)));
  return null;
end $$;
drop trigger if exists trg_ev_story_posted on public.stories;
create trigger trg_ev_story_posted after insert on public.stories
for each row execute function public.ev_story_posted();

-- ── the only read path ─────────────────────────────────────────────────────
-- See the live definition with:
--   select pg_get_functiondef('public.stats_overview()'::regprocedure);
-- Aggregate-by-construction + admin-gated + security definer. Revoked from
-- anon, so an unauthenticated caller gets "permission denied for function";
-- a signed-in non-admin gets 42501 'not authorised'. Verified 2026-07-17.
--
-- Returns jsonb: {generated_at, data_since, kpi{}, active{}, funnel{}, rsvp{},
--                 features{}, plans{}, daily[]}
--
-- (Body omitted here for length — it is long and lives in the database. If you
--  change it, paste the new body into this file so the two never drift.)

-- ── one-time backfill (already run 2026-07-17) ─────────────────────────────
-- Seeded 372 events from surviving rows: profiles, friendships, plans,
-- plan_invitees, plan_messages, direct_messages, stories — back to 2026-06-11.
-- Everything the plan cascade already ate is NOT recoverable; the seed is a
-- floor, not a history. Do NOT re-run: the triggers cover everything since.
