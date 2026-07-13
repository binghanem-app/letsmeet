import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── حد فاضي؟ stories cleanup (Lets Meet 2.1 Stage C) ─────────────────────────
//
// Owner rules (2026-07-13, Snapchat model):
//   · A story lives 24 hours; after that its row must go.
//   · Direct-sent copies are VIEW-ONCE — the app consumes them on watch
//     (nulls video_url/video_thumb_url client-side, instantly). This sweep is
//     the 24h BACKSTOP for copies nobody watched: "if the second friend did
//     not watch in 24h, deleted from the database anyway".
//   · Story files (video/photo + thumb) are shared by the story row and all
//     direct copies — once everything referencing them is gone/expired, the
//     files go too. Since EVERY story object expires at 24h by construction,
//     any file under stories/ older than 25h is dead weight: delete it.
//
// This function, in order:
//   1. deletes stories rows past expires_at (story_views cascades),
//   2. nulls video_url/video_thumb_url on direct_messages older than 24h
//      (deleted_at untouched — the app shows "Video no longer available"),
//   3. soft-deletes photo-story direct copies older than 24h (photo_url
//      points under stories/ — normal chat photos are NOT touched),
//   4. removes every storage object under chat-images/stories/ older than
//      25 hours (the 1h margin covers clock skew and in-flight viewing).
//
// Runs on a schedule (Supabase Dashboard → Integrations → Cron → daily,
// same as cleanup-plan-voice) with the service role.

const HOUR = 60 * 60 * 1000

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const nowIso = new Date().toISOString()
  const dmCutoffIso = new Date(Date.now() - 24 * HOUR).toISOString()
  const fileCutoffMs = Date.now() - 25 * HOUR

  // 1) expired story rows (story_views cascades via FK).
  const { data: deadStories, error: e1 } = await supabase
    .from('stories')
    .delete()
    .lt('expires_at', nowIso)
    .select('id')
  if (e1) console.error('stories delete failed:', e1.message)

  // 2) 24h backstop for unwatched video copies (view-once consume already
  //    nulled the watched ones). deleted_at stays null → the app renders
  //    "Video no longer available", not "This message was deleted".
  const { data: deadVids, error: e2 } = await supabase
    .from('direct_messages')
    .update({ video_url: null, video_thumb_url: null })
    .lt('created_at', dmCutoffIso)
    .not('video_url', 'is', null)
    .select('id')
  if (e2) console.error('dm video expiry failed:', e2.message)

  // 3) photo-story direct copies (they ride the normal photo pipeline, but
  //    their objects live under stories/ — regular chat photos are untouched).
  const { data: deadPhotos, error: e3 } = await supabase
    .from('direct_messages')
    .update({ photo_url: null, deleted_at: nowIso })
    .lt('created_at', dmCutoffIso)
    .like('photo_url', '%/chat-images/stories/%')
    .select('id')
  if (e3) console.error('dm photo-story expiry failed:', e3.message)

  // 4) storage sweep: anything under stories/ older than 25h is expired by
  //    construction (stories AND their direct copies all die at 24h).
  let filesRemoved = 0
  const { data: folders, error: e4 } = await supabase.storage
    .from('chat-images')
    .list('stories', { limit: 1000 })
  if (e4) console.error('storage list failed:', e4.message)

  for (const folder of folders ?? []) {
    if (!folder.name) continue
    const prefix = `stories/${folder.name}`
    const { data: files } = await supabase.storage
      .from('chat-images')
      .list(prefix, { limit: 1000 })
    const dead = (files ?? [])
      .filter((f) => f.created_at && new Date(f.created_at).getTime() < fileCutoffMs)
      .map((f) => `${prefix}/${f.name}`)
    if (dead.length > 0) {
      const { error } = await supabase.storage.from('chat-images').remove(dead)
      if (error) console.error(`remove ${prefix} failed:`, error.message)
      else filesRemoved += dead.length
    }
  }

  const summary = {
    expiredStories: deadStories?.length ?? 0,
    expiredDmVideos: deadVids?.length ?? 0,
    expiredDmPhotoStories: deadPhotos?.length ?? 0,
    filesRemoved,
  }
  console.log('cleanup-stories:', JSON.stringify(summary))
  return new Response(JSON.stringify(summary), {
    headers: { 'Content-Type': 'application/json' },
  })
})
