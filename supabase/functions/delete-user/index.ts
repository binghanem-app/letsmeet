import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Deletes the calling user's account end to end, with the service role, so the
// whole cascade is atomic-from-the-client's-view and cannot be left half-done by
// a client-side failure. Also removes the user's uploaded Storage media
// (avatars + chat photos) so no personal data survives — App Store 5.1.1(v).
Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Unauthorized', { status: 401 })

  // Identify the caller from their own JWT — only they can delete their account.
  const authed = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user }, error: userErr } = await authed.auth.getUser()
  if (userErr || !user) return new Response('Unauthorized', { status: 401 })
  const id = user.id

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  try {
    // ── 1. Collect Storage paths BEFORE deleting the rows that reference them ──
    const avatarNames: string[] = []
    try {
      const { data: avatarFiles } = await admin.storage.from('avatars').list('', { search: id })
      ;(avatarFiles ?? []).forEach(f => { if (f.name.startsWith(id)) avatarNames.push(f.name) })
    } catch (_) { /* best-effort */ }

    const chatPaths: string[] = []
    try {
      // Photos this user posted (in any plan).
      const { data: photoMsgs } = await admin
        .from('plan_messages').select('photo_url').eq('sender', id).not('photo_url', 'is', null)
      ;(photoMsgs ?? []).forEach((m: { photo_url: string }) => {
        const marker = '/chat-images/'
        const i = m.photo_url.indexOf(marker)
        if (i !== -1) chatPaths.push(m.photo_url.slice(i + marker.length).split('?')[0])
      })
      // Whole chat folders for plans this user hosts (covers other members' photos).
      const { data: hostedPlans } = await admin.from('plans').select('id').eq('host', id)
      for (const p of hostedPlans ?? []) {
        const { data: files } = await admin.storage.from('chat-images').list(`${p.id}`)
        ;(files ?? []).forEach(f => chatPaths.push(`${p.id}/${f.name}`))
      }
    } catch (_) { /* best-effort */ }

    // ── 2. Clear the one FK that won't cascade from profiles (plan_messages.sender = NO ACTION) ──
    await admin.from('plan_messages').delete().eq('sender', id)

    // ── 3. Tables with no FK to profiles would orphan — delete explicitly ──
    await admin.from('reports').delete().or(`reporter.eq.${id},reported.eq.${id}`)
    await admin.from('pro_waitlist').delete().eq('user_id', id)

    // ── 4. Deleting the profile cascades to everything else (blocks, friendships,
    //       groups, group_members, friend_nicknames, dismissed_suggestions,
    //       notification_settings, notifications, plan_invitees, and plans → which
    //       cascade to their plan_messages / reads / invitees / source_groups). ──
    const { error: profErr } = await admin.from('profiles').delete().eq('id', id)
    if (profErr) return new Response(`Profile delete failed: ${profErr.message}`, { status: 500 })

    // ── 5. Delete the auth user last ──
    const { error: delErr } = await admin.auth.admin.deleteUser(id)
    if (delErr) return new Response(delErr.message, { status: 500 })

    // ── 6. Remove Storage media (best-effort; the account is already gone) ──
    try {
      if (avatarNames.length) await admin.storage.from('avatars').remove(avatarNames)
      if (chatPaths.length) await admin.storage.from('chat-images').remove([...new Set(chatPaths)])
    } catch (e) { console.error('Storage cleanup failed (account already deleted):', e) }

    return new Response('OK', { status: 200 })
  } catch (e) {
    console.error('delete-user failed:', e)
    return new Response(String(e), { status: 500 })
  }
})
