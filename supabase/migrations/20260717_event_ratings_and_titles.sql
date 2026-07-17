-- ═══════════════════════════════════════════════════════════════════════════
-- Post-event ratings + profile titles  ·  APPLIED LIVE 2026-07-17 via MCP
-- ═══════════════════════════════════════════════════════════════════════════
-- Owner spec (2026-07-17, verbatim intent): after an event concludes, each
-- attendee gets ONE sheet — happy/neutral/sad — "how you rate the event
-- Coffee Corner hosted by Ahmed". Ratings feed the HOST's profile title;
-- RSVP history feeds attendance titles ("for the one who always attends …
-- for late and for cant and for ppl dont answer"). Titles show on profiles
-- as pulsing green/yellow/amber/red badges.
--
-- App side: HomeScreen.swift (RateEventSheet + checkPendingRating) and
-- UserProfileSheet.swift (earnedTitles/titleBadges) on branch v2.2.
--
-- DESIGN CONSTRAINTS THAT SHAPED THIS:
--  · cleanup-expired-plans DELETES every plan 24h after it starts, so
--    event_ratings has NO foreign key to plans and snapshots host/title/vibe.
--    The rating window is start+3h → the 24h deletion.
--  · Ratings are ANONYMOUS to the host: SELECT is rater-only; aggregates come
--    out exclusively through profile_titles() (security definer, counts only).
--  · Attendance stats come from app_events (which also survives deletion),
--    taking the LAST rsvp per plan — people flip answers.

create table if not exists public.event_ratings (
  plan_id    uuid not null,
  rater      uuid not null,
  host       uuid not null,
  title      text,
  vibe       text,
  rating     smallint not null check (rating between 0 and 2),  -- 0 sad · 1 neutral · 2 happy
  created_at timestamptz not null default now(),
  primary key (plan_id, rater)
);
create index if not exists event_ratings_host_idx on public.event_ratings (host);
alter table public.event_ratings enable row level security;

create policy "rate attended concluded plans" on public.event_ratings
for insert with check (
  auth.uid() = rater
  and rater <> host
  and exists (
    select 1 from public.plans p
    join public.plan_invitees pi on pi.plan_id = p.id
    where p.id = event_ratings.plan_id
      and p.host = event_ratings.host
      and not p.cancelled
      and pi.invitee = auth.uid()
      and pi.rsvp in ('going','late')
      and p.starts_at is not null
      and p.starts_at + interval '3 hours' <= now()
  )
);

create policy "read own ratings" on public.event_ratings
for select using (auth.uid() = rater);
-- No UPDATE/DELETE: a rating is final.

create or replace function public.ev_event_rated()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into app_events(kind, actor, plan_id, meta)
  values ('event_rated', new.rater, new.plan_id,
          jsonb_build_object('rating', new.rating, 'host', new.host));
  return null;
end $$;
drop trigger if exists trg_ev_event_rated on public.event_ratings;
create trigger trg_ev_event_rated after insert on public.event_ratings
for each row execute function public.ev_event_rated();

create or replace function public.profile_titles(target uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'host_rated', (select count(*) from event_ratings where host = target),
    'host_avg',   (select round(avg(rating) / 2.0, 2) from event_ratings where host = target),
    'hosted',     (select count(*) from app_events where kind='plan_created' and actor = target),
    'invited',    (select count(distinct plan_id) from app_events
                   where kind='invited' and actor = target),
    'going',      (select count(*) from (
                     select distinct on (plan_id) meta->>'rsvp' as r
                     from app_events
                     where kind='rsvp_set' and actor = target and plan_id is not null
                     order by plan_id, at desc) s where s.r = 'going'),
    'late',       (select count(*) from (
                     select distinct on (plan_id) meta->>'rsvp' as r
                     from app_events
                     where kind='rsvp_set' and actor = target and plan_id is not null
                     order by plan_id, at desc) s where s.r = 'late'),
    'cant',       (select count(*) from (
                     select distinct on (plan_id) meta->>'rsvp' as r
                     from app_events
                     where kind='rsvp_set' and actor = target and plan_id is not null
                     order by plan_id, at desc) s where s.r = 'cant'),
    'answered',   (select count(distinct plan_id) from app_events
                   where kind='rsvp_set' and actor = target and plan_id is not null)
  ) into result;
  return result;
end $$;

revoke all on function public.profile_titles(uuid) from public, anon;
grant execute on function public.profile_titles(uuid) to authenticated;

-- ── plan_stats (added same day): the profile "Plan score" ───────────────────
-- The app called this RPC since 2.2 and fell back to 0/0 because it was never
-- created — the score tile showed 0 for everyone. Counts from app_events so
-- the score is LIFETIME (plans table resets daily via the 24h deletion):
-- hosted = created − cancelled, attended = plans whose FINAL rsvp was
-- going/late. Live def:
--   select pg_get_functiondef('public.plan_stats(uuid)'::regprocedure);
