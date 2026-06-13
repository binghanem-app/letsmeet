-- ============================================================
-- Let's Meet — Supabase schema (Postgres + RLS)
-- Run in Supabase SQL editor. Assumes Supabase Auth is enabled
-- (Google + email). auth.users is managed by Supabase; we extend
-- it with a public.profiles row.
-- ============================================================

-- ---------- Extensions ----------
create extension if not exists "pgcrypto";

-- ============================================================
-- 1. PROFILES  (1:1 with auth.users)
-- ============================================================
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text unique not null,
  first_name    text,
  last_name     text,
  email         text,                       -- private: never exposed for discovery
  phone         text,                        -- E.164, e.g. +9715xxxxxxx
  country_code  text,                        -- e.g. +971
  avatar_color  text default '#A78BFA',
  username_changed_at timestamptz,           -- enforce 90-day rename rule
  contact_discovery boolean default false,   -- OFF by default (privacy-first)
  created_at    timestamptz default now()
);

-- username: 3+ chars, letters/numbers/underscore
alter table public.profiles
  add constraint username_format check (username ~ '^[A-Za-z0-9_]{3,}$');

-- ============================================================
-- 2. FRIENDSHIPS  (mutual consent: request + accept)
--    One row per directed request; status flips to 'accepted'.
-- ============================================================
create type friend_status as enum ('pending', 'accepted');

create table public.friendships (
  id          uuid primary key default gen_random_uuid(),
  requester   uuid not null references public.profiles(id) on delete cascade,
  addressee   uuid not null references public.profiles(id) on delete cascade,
  status      friend_status not null default 'pending',
  created_at  timestamptz default now(),
  responded_at timestamptz,
  check (requester <> addressee),
  unique (requester, addressee)
);
-- prevent A→B and B→A duplicates at app layer (check both directions on insert)

-- ============================================================
-- 3. GROUPS / CIRCLES  (a user's PRIVATE labels for friends)
--    Never visible to invitees — enforced by RLS below.
-- ============================================================
create table public.groups (
  id        uuid primary key default gen_random_uuid(),
  owner     uuid not null references public.profiles(id) on delete cascade,
  name      text not null,
  color     text default '#FF6B4A',
  created_at timestamptz default now(),
  unique (owner, name)
);

create table public.group_members (
  group_id  uuid not null references public.groups(id) on delete cascade,
  member    uuid not null references public.profiles(id) on delete cascade,   -- a friend
  primary key (group_id, member)
);

-- ============================================================
-- 4. BLOCKS  (A blocks B → friendship removed; B can't re-add)
-- ============================================================
create table public.blocks (
  blocker    uuid not null references public.profiles(id) on delete cascade,
  blocked    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);

-- ============================================================
-- 5. PLANS  ("Let's Meet" events)
-- ============================================================
create type rsvp_status as enum ('going', 'late', 'cant', 'invited');

create table public.plans (
  id          uuid primary key default gen_random_uuid(),
  host        uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  place_name  text,                 -- free-typed OR from Google Places
  place_lat   double precision,
  place_lng   double precision,
  place_query text,                 -- for "open in maps" deep link
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  created_at  timestamptz default now()
);

-- Which group(s) the host invited THROUGH (private to host; used to expand invitees).
create table public.plan_source_groups (
  plan_id   uuid not null references public.plans(id) on delete cascade,
  group_id  uuid not null references public.groups(id) on delete cascade,
  primary key (plan_id, group_id)
);

-- The expanded, flat invitee list (group members ∪ individually picked).
-- Invitees NEVER learn which group they came from.
create table public.plan_invitees (
  plan_id   uuid not null references public.plans(id) on delete cascade,
  invitee   uuid not null references public.profiles(id) on delete cascade,
  rsvp      rsvp_status not null default 'invited',
  responded_at timestamptz,
  primary key (plan_id, invitee)
);

-- ============================================================
-- 6. MESSAGES  (per-plan group chat)
-- ============================================================
create table public.messages (
  id        uuid primary key default gen_random_uuid(),
  plan_id   uuid not null references public.plans(id) on delete cascade,
  sender    uuid not null references public.profiles(id) on delete cascade,
  body      text not null,
  created_at timestamptz default now()
);

-- ============================================================
-- 7. NOTIFICATIONS  + settings
-- ============================================================
create type notif_kind as enum ('rsvp', 'request', 'reminder', 'message');

create table public.notifications (
  id        uuid primary key default gen_random_uuid(),
  recipient uuid not null references public.profiles(id) on delete cascade,
  actor     uuid references public.profiles(id) on delete set null,
  kind      notif_kind not null,
  plan_id   uuid references public.plans(id) on delete cascade,
  read      boolean default false,
  created_at timestamptz default now()
);

create table public.notification_settings (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  push       boolean default true,   -- master switch
  rsvp       boolean default true,
  requests   boolean default true,
  reminders  boolean default true
);

-- ============================================================
-- HELPER: are two users blocked in either direction?
-- ============================================================
create or replace function public.is_blocked(a uuid, b uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.blocks
    where (blocker = a and blocked = b) or (blocker = b and blocked = a)
  );
$$;

-- When A blocks B, drop any friendship both ways.
create or replace function public.on_block() returns trigger language plpgsql as $$
begin
  delete from public.friendships
  where (requester = new.blocker and addressee = new.blocked)
     or (requester = new.blocked and addressee = new.blocker);
  return new;
end; $$;

create trigger trg_on_block after insert on public.blocks
for each row execute function public.on_block();

-- Auto-create profile + settings rows when a user signs up.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, username, email)
  values (new.id, 'user_' || substr(new.id::text, 1, 8), new.email)
  on conflict (id) do nothing;
  insert into public.notification_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end; $$;

create trigger trg_new_user after insert on auth.users
for each row execute function public.handle_new_user();

-- ============================================================
-- ROW-LEVEL SECURITY
-- ============================================================
alter table public.profiles            enable row level security;
alter table public.friendships         enable row level security;
alter table public.groups              enable row level security;
alter table public.group_members       enable row level security;
alter table public.blocks              enable row level security;
alter table public.plans               enable row level security;
alter table public.plan_source_groups  enable row level security;
alter table public.plan_invitees       enable row level security;
alter table public.messages            enable row level security;
alter table public.notifications       enable row level security;
alter table public.notification_settings enable row level security;

-- PROFILES: anyone authenticated can look up a profile by username
-- (needed for friend search) UNLESS blocked. Only owner can edit.
create policy "profiles readable (not blocked)" on public.profiles
  for select using (
    auth.uid() = id or not public.is_blocked(auth.uid(), id)
  );
create policy "edit own profile" on public.profiles
  for update using (auth.uid() = id);

-- FRIENDSHIPS: visible to the two parties; you can request, and the
-- addressee can accept/decline (update).
create policy "see own friendships" on public.friendships
  for select using (auth.uid() in (requester, addressee));
create policy "send request" on public.friendships
  for insert with check (
    auth.uid() = requester and not public.is_blocked(requester, addressee)
  );
create policy "respond to request" on public.friendships
  for update using (auth.uid() = addressee);
create policy "remove friendship" on public.friendships
  for delete using (auth.uid() in (requester, addressee));

-- GROUPS + members: PRIVATE to the owner. This is the key privacy rule —
-- nobody but you can read which circle a friend is in.
create policy "own groups" on public.groups
  for all using (auth.uid() = owner) with check (auth.uid() = owner);
create policy "own group members" on public.group_members
  for all using (
    auth.uid() = (select owner from public.groups g where g.id = group_id)
  ) with check (
    auth.uid() = (select owner from public.groups g where g.id = group_id)
  );

-- BLOCKS: only you manage your own block list.
create policy "own blocks" on public.blocks
  for all using (auth.uid() = blocker) with check (auth.uid() = blocker);

-- PLANS: host manages; host + invitees can read.
create policy "host manages plan" on public.plans
  for all using (auth.uid() = host) with check (auth.uid() = host);
create policy "invitees read plan" on public.plans
  for select using (
    auth.uid() = host or exists (
      select 1 from public.plan_invitees pi
      where pi.plan_id = id and pi.invitee = auth.uid()
    )
  );

-- PLAN SOURCE GROUPS: host-only (this is what would leak the circle).
create policy "host only source groups" on public.plan_source_groups
  for all using (
    auth.uid() = (select host from public.plans p where p.id = plan_id)
  ) with check (
    auth.uid() = (select host from public.plans p where p.id = plan_id)
  );

-- PLAN INVITEES: host manages; everyone on the plan can SEE the list
-- and each person updates only their OWN rsvp.
create policy "see plan invitees" on public.plan_invitees
  for select using (
    auth.uid() = (select host from public.plans p where p.id = plan_id)
    or auth.uid() = invitee
    or exists (select 1 from public.plan_invitees x
               where x.plan_id = plan_id and x.invitee = auth.uid())
  );
create policy "host adds invitees" on public.plan_invitees
  for insert with check (
    auth.uid() = (select host from public.plans p where p.id = plan_id)
  );
create policy "update own rsvp" on public.plan_invitees
  for update using (auth.uid() = invitee);

-- MESSAGES: any plan participant can read/post.
create policy "plan chat read" on public.messages
  for select using (
    auth.uid() = (select host from public.plans p where p.id = plan_id)
    or exists (select 1 from public.plan_invitees pi
               where pi.plan_id = plan_id and pi.invitee = auth.uid())
  );
create policy "plan chat post" on public.messages
  for insert with check (
    auth.uid() = sender and (
      auth.uid() = (select host from public.plans p where p.id = plan_id)
      or exists (select 1 from public.plan_invitees pi
                 where pi.plan_id = plan_id and pi.invitee = auth.uid())
    )
  );

-- NOTIFICATIONS: you only see your own.
create policy "own notifications" on public.notifications
  for select using (auth.uid() = recipient);
create policy "own notif update" on public.notifications
  for update using (auth.uid() = recipient);

-- NOTIFICATION SETTINGS: own only.
create policy "own notif settings" on public.notification_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
