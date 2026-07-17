-- ═══════════════════════════════════════════════════════════════════════════
-- POINTS ECONOMY · PHASE 1  ·  APPLIED LIVE 2026-07-17 via MCP
-- ═══════════════════════════════════════════════════════════════════════════
-- Owner-approved from the proposal artifact (672b2e9a). EARN-only: no store
-- yet. Phase 1 exists so history accumulates and ranks mean something when the
-- store ("the Souq") lands later.
--
-- ACCRUAL (owner): 100 host a plan that HAPPENED (cancelled = 0) · 50 Going ·
-- 25 Late · 0 Can't or silence. Owner asked about 20/10/5; kept 100/50/25 —
-- scaling both sides changes nothing, scarcity lives in prices/rank-gates/rate
-- limits. Late=25 pays for honesty (the lazy alternative to Late is ghosting
-- for 0); don't move it in either direction.
--
-- TWO-LEDGER RULE (the load-bearing decision): rank runs on LIFETIME EARNED
-- (sum of positive deltas); the future store spends BALANCE (sum of all
-- deltas). Buying perks must NEVER demote you or the store fights the ladder.
--
-- PRIVACY: no leaderboards, no public totals — a ranked number between real
-- friends is a standing chart of who matters least (the Snapchat best-friends
-- lesson). Friends see the LEVEL via profile_rank(); balances are readable
-- only by their owner (RLS + my_points()).
--
-- App side: UserProfileSheet (points tile, progress bar, rank pill, RankLadder)
-- and ActivityScreen (rankUpCard) on branch v2.2 — commit 2bbadc8.

create table if not exists public.points_ledger (
  id       bigserial primary key,
  user_id  uuid        not null,
  delta    int         not null,     -- + earn, − spend (store, later)
  reason   text        not null,     -- host_reward|going_reward|late_reward|rank_bonus|purchase
  plan_id  uuid,                     -- NO FK: cleanup-expired-plans kills plans at 24h
  at       timestamptz not null default now(),
  meta     jsonb       not null default '{}'::jsonb
);
create index if not exists points_ledger_user_idx on public.points_ledger (user_id, at desc);
-- The economy's integrity in one line: a plan can never pay the same person
-- twice for the same reason. This is why the hourly sweep is safe to re-run.
create unique index if not exists points_ledger_once_idx
  on public.points_ledger (user_id, plan_id, reason) where plan_id is not null;

alter table public.points_ledger enable row level security;
create policy "read own ledger" on public.points_ledger
for select using (auth.uid() = user_id);
-- No insert/update/delete policies: only settle_points() (security definer) mints.

-- ── the ladder ─────────────────────────────────────────────────────────────
-- Tuned to the MEASURED earn curve (regular user ≈ 600/mo): R2 lands in week
-- one (the hook), R7 takes 16+ months (nobody maxes out, per owner's ask).
-- MIRRORED in Swift's RankLadder.floor() — change both together.
create or replace function public.rank_for(p int)
returns int language sql immutable as $$
  select case
    when p >= 10000 then 7   -- Legend of the Majlis · أسطورة المجلس
    when p >=  5000 then 6   -- Pillar · عمود المجلس
    when p >=  2500 then 5   -- Plan Maker · صاحب السوالف
    when p >=  1000 then 4   -- The Gatherer · اللمّام   (will gate the Glowing Plan)
    when p >=   400 then 3   -- One of the Crew · من الربع
    when p >=   150 then 2   -- Show-Up · اللي يحضر
    else 1                   -- Newcomer · الواصل
  end;
$$;

-- Last CELEBRATED rank — separate from the computed rank so a crossing is
-- detected exactly once and never re-congratulated.
alter table public.profiles add column if not exists rank_level int not null default 1;

alter type notif_kind add value if not exists 'rank_up';

-- ── settle_points(): the only faucet. Hourly at :15. ───────────────────────
-- Live definition (long; the authority is the database):
--   select pg_get_functiondef('public.settle_points()'::regprocedure);
--
-- Anti-farm rules it enforces (the exploit is 2 friends ping-ponging fake
-- plans to mint 100s):
--   · host payout requires 2+ non-host Going  → a fake plan mints nothing
--   · host cap 3 / rolling 7 days             → max 300/wk hosting
--   · attendance cap 2 / calendar day         → max 100/day attending
--   · PRE-START rsvps only (app_events.at < plans.starts_at) → no flipping to
--     Going after the event to farm points
--   · unique(user, plan, reason)              → double-mint impossible
-- Verified on real data: essa's padel game paid 100 + 3×50; a fabricated test
-- plan (1 invitee, rsvp written after start) correctly paid NOTHING.
--
-- Rank-ups inside the sweep: profiles.rank_level ratchets up, a notifications
-- row (kind 'rank_up', body = level) drives the Activity celebration card, and
-- a one-time +50 'rank_bonus' mints — the economy's only free faucet.

-- ── read paths ─────────────────────────────────────────────────────────────
--   my_points()          → {balance, lifetime, level, next_at} — auth.uid()
--                          only; takes no argument, so a balance cannot leak.
--   profile_rank(target) → int level. The ONLY points-derived thing a friend
--                          may learn. Never a number.
-- Both security definer (the ledger denies non-owner reads), authenticated-only.
-- Live definitions via pg_get_functiondef.

-- ── cron ───────────────────────────────────────────────────────────────────
--   select cron.schedule('settle-points-hourly', '15 * * * *',
--                        $$ select public.settle_points(); $$);
-- Plain SQL, no edge function: nothing to deploy, no auth header to get wrong
-- (see the 01:00 outage of 2026-07-17 for why that matters). Runs at :15 so it
-- never races cleanup-expired-plans at :00 — and settlement at start+3h always
-- precedes the 24h deletion anyway.

-- ── backfill: deliberately NONE ────────────────────────────────────────────
-- Checked: only 2 plans in app_events had already been deleted, both my own
-- test rows, neither qualifying (needed 2+ Going). Every other historical plan
-- was destroyed by the 24h cleanup before app_events existed (2026-07-17).
-- So everyone starts at zero and the ledger's history begins with the events
-- table. Honest, and the alternative (crediting plans we can't verify) would
-- have poisoned the ladder on day one.
