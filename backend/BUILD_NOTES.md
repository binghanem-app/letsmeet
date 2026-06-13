# Let's Meet — Backend build notes (Supabase)

`schema.sql` creates every table + Row-Level Security policy. This doc covers
the rules that live in **app logic / Edge Functions**, plus a build order.

## Key business rules (enforce in code, not just SQL)

1. **Mutual-consent friendship.** Before inserting a `friendships` row, check
   no row already exists in *either* direction (A→B or B→A). On accept, flip
   `status` to `accepted` and set `responded_at`.

2. **Username rename = once / 90 days.** On username change, require
   `username_changed_at` is null OR older than 90 days; then set it to now().
   Reject otherwise (the prototype greys the field and shows "Available in N days").

3. **Group privacy (the big one).** When a host creates a plan:
   - Save the chosen circles in `plan_source_groups` (host-only via RLS).
   - **Expand** them — union of all `group_members` of those groups, plus any
     individually picked friends — into `plan_invitees`.
   - Invitees only ever read `plan_invitees`/`plans`, never `plan_source_groups`
     or `groups`. So they never learn which circle they were invited through.
   - In the UI, show invitees the **host's name**, never the group name.

4. **Blocking.**
   - Inserting a `blocks` row auto-deletes the friendship both ways (trigger).
   - Blocking a *pending request* should also delete/ignore that friend request
     so it does **not** reappear if the user later unblocks (unblock only removes
     the `blocks` row; it never restores a friendship or a stale request).
   - `is_blocked()` gates profile visibility and new requests both directions.
   - Blocking does **not** remove either person from shared plans hosted by a
     third party — they still see each other's RSVP/messages there (by design).

5. **RSVP is editable.** `plan_invitees.rsvp` can change any time
   (`going` / `late` / `cant`). Each change updates `responded_at` and inserts a
   `notifications` row for the host (kind `rsvp`) — respecting the host's
   `notification_settings`.

6. **Contact discovery is OFF by default.** Only when `contact_discovery=true`
   do you hash-match phone numbers. Email is *never* used for discovery.

## Suggested build order

1. **Auth** ✅ (done) — Google + email. Confirm the `handle_new_user` trigger
   creates a `profiles` + `notification_settings` row; add an onboarding step to
   set a real username (the trigger seeds a placeholder `user_xxxx`).
2. **Profiles & settings** — edit name/username/phone, password change,
   notification toggles, blocked-users list.
3. **Friends** — username search, send/accept/deny request, friends list.
4. **Groups** — create circles, add friends to one or more.
5. **Plans** — create flow (what/where/when/who), invitee expansion, feed,
   plans (upcoming/past).
6. **RSVP + event detail** — who's coming, change response, add-to-calendar.
7. **Chat** — per-plan messages (use Supabase Realtime for live updates).
8. **Notifications** — in-app list + push (FCM/APNs) gated by settings.
9. **Blocks** — block from friend menu and from a request.

## Integrations
- **Google Places (New)** — keep the key server-side or HTTP-referrer-restricted.
  Text Search with `locationBias` (user's lat/lng) for nearby venues.
- **Maps deep link** — `https://www.google.com/maps/search/?api=1&query=<place>`
  opens the native maps app on mobile (no key needed).
- **Calendar** — Google Calendar URL + `.ics` download (both already in the prototype).
- **Realtime** — Supabase Realtime channels for chat and live RSVP counts.

## The prototype as spec
`Lets Meet.dc.html` is the source of truth for screens, copy, states, and rules.
Build each screen to match it; this schema backs every piece of data it shows.
