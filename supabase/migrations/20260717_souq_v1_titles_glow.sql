-- ═══════════════════════════════════════════════════════════════════════════
-- SOUQ v1 · titles + avatar glow  ·  APPLIED LIVE 2026-07-17 via MCP
-- ═══════════════════════════════════════════════════════════════════════════
-- Economy Phase 2, first slice. Design + reasons: letsmeet2 resource/souq-spec.md
-- (owner-approved scope: TITLES + AVATAR GLOW only; other perks deliberately
-- absent — Keep the Night is blocked on the 24h-cleanup trap, spec §8.3).
--
-- Shape: RPCs are the ONLY writers; clients never insert into these tables.
-- Prices/tiers live in souq_config (data, not code) because the tier numbers
-- are guesses — 5 people have ever made a plan; retune without a deploy.
--
-- profiles.chosen_title: 'host:1' style (track:tier), NULL = auto/highest.
-- Sticky-pick semantics are APP-side; the DB only enforces EARNED.

alter table public.profiles add column if not exists chosen_title text;

create table if not exists public.souq_config (
  key   text primary key,
  value jsonb not null
);
insert into public.souq_config (key, value) values
  ('prices', '{"glow_flow":{"3":200,"7":350},"glow_pulse":{"3":150,"7":250}}'),
  ('tiers',  '{"host":[3,5,10],"show":[5,15,30],"bring":[1,3,5]}'),
  ('glow_colors', '["#D69528","#26C6DA","#E255A1"]')
on conflict (key) do nothing;
alter table public.souq_config enable row level security;
create policy "config readable" on public.souq_config for select
  to authenticated using (true);

-- Inventory. activated_at null = "in your pocket" (buy ≠ activate, spec §8.1:
-- the clock starts at ACTIVATION or buying early is punished).
create table if not exists public.user_perks (
  id            bigserial primary key,
  user_id       uuid not null,
  perk          text not null check (perk in ('glow_flow','glow_pulse')),
  duration_days int  not null check (duration_days in (3,7)),
  purchased_at  timestamptz not null default now(),
  activated_at  timestamptz,
  expires_at    timestamptz,
  color         text          -- chosen at activation; colours are free
);
create index if not exists user_perks_user_idx on public.user_perks (user_id, purchased_at desc);
alter table public.user_perks enable row level security;
create policy "read own perks" on public.user_perks for select
  using (auth.uid() = user_id);

create unique index if not exists points_ledger_purchase_req_idx
  on public.points_ledger (user_id, (meta->>'req')) where reason = 'purchase';

-- ── the RPC surface (live definitions are the authority) ───────────────────
--   souq_track_counts(uuid) → (host_n, show_n, bring_n)
--       host = DISTINCT plan_ids with 'host_reward' — the unfakeable
--       credential (only mints with 2+ non-host Going). DO NOT count `plans`.
--       bring_n hardcoded 0 until signup attribution exists.
--   souq_buy_glow(perk, days, req uuid) → {ok, balance} | {ok, dup}
--       ⚠ DUP CHECK RUNS BEFORE THE BALANCE CHECK — a retry of a completed
--       purchase must return ok even though the balance already dropped below
--       the price. Found by testing the double-call; do not reorder.
--   souq_activate_glow(id, '#RRGGBB') → {ok, expires_at}
--       one active glow at a time (GLOW_ACTIVE), owner-only, pocket-only.
--   souq_set_title('host:2' | null) → validates EARNED against the ledger;
--       null returns to auto. Client-side naming would make titles worthless.
--   souq_cosmetics(uuid[]) → the ONLY cross-user read: active glow + chosen
--       title for the avatars on screen. Deliberately any-authenticated —
--       cosmetics are public by nature; balances/meters stay owner-only.
--   my_souq() → the whole Souq screen in one call (balance, counts, tiers,
--       prices, colors, pocket, active).
--
-- Verified in a rolled-back txn (impersonating via request.jwt.claims):
--   buy 250: 470→220 · dup req → {ok,dup} · activate stamps +7d · second
--   activate → GLOW_ACTIVE · souq_set_title('host:1') → NOT_EARNED (even the
--   creator can't wear The Host: 0 qualifying hosted plans — the ledger
--   doesn't care whose name is on the app).
--
--   select pg_get_functiondef('public.souq_buy_glow(text,int,uuid)'::regprocedure);
