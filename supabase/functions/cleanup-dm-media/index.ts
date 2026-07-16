import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── DM media expiry (owner rule, 2026-07-17) ─────────────────────────────────
//
// "delete dm after period of time, like 2 weeks? enough to see react save
// whatever by user" — a photo sent in a DM had NO expiry at all: plan photos
// die with their plan at 24h (cleanup-expired-plans) and stories at 24h
// (cleanup-stories), but DM photos were kept forever, so this bucket could
// only ever grow. Two weeks is judged long enough to view it, react to it, or
// save it; after that the file goes.
//
// MEDIA ONLY — the conversation text stays forever (owner). Text costs nothing;
// files do.
//
// What the bubble becomes: `deleted_at` is set, so the message renders as
// "This message was deleted" — which is a small lie (the sender didn't delete
// it), accepted deliberately. There is no "photo expired" state the way voice
// has one, and the LIVE 2.0 app can't be changed from here: without deleted_at
// it would draw an empty bubble for everyone already on the App Store. When a
// build ships with a proper "Photo expired" notice, swap this for that.
//
// A message that has BOTH text and a photo keeps its text and loses only the
// photo — deleted_at would take the words with it. Nothing sends captions
// today (checked: 0 rows), so this is insurance against a future build.
//
// Scheduled daily (cron `cleanup-dm-media-daily`, 03:45) with the service role.
// Runs AFTER cleanup-stories (03:30): story sends are view-once and swept at
// 24h, so by 14 days they're already null and never reach this sweep.

const BUCKET = 'chat-images'
const BUCKET_MARKER = '/chat-images/'
const TWO_WEEKS_MS = 14 * 24 * 3600 * 1000

/** Public URL → storage path inside chat-images (null if not ours). */
function storagePath(url: string | null): string | null {
  if (!url) return null
  const i = url.indexOf(BUCKET_MARKER)
  if (i < 0) return null
  const path = url.slice(i + BUCKET_MARKER.length)
  return path.length > 0 ? path : null
}

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const cutoff = new Date(Date.now() - TWO_WEEKS_MS).toISOString()
    const { data: rows, error } = await supabase
      .from('direct_messages')
      .select('id, body, photo_url, video_url, video_thumb_url')
      .lt('created_at', cutoff)
      .or('photo_url.not.is.null,video_url.not.is.null')
      .limit(500)
    if (error) return new Response(error.message, { status: 500 })
    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({ purged: 0, filesRemoved: 0 }),
        { headers: { 'content-type': 'application/json' } })
    }

    // Files first: once the urls are nulled, nothing points at them any more
    // and they'd be orphans nobody could find.
    const paths = rows
      .flatMap((r) => [storagePath(r.photo_url), storagePath(r.video_url),
                       storagePath(r.video_thumb_url)])
      .filter((p): p is string => p !== null)
    let filesRemoved = 0
    if (paths.length > 0) {
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove(paths)
      if (rmErr) { console.error(`remove: ${rmErr.message}`); return new Response(rmErr.message, { status: 500 }) }
      filesRemoved = paths.length
    }

    // Split by whether the message would lose text if we marked it deleted.
    const withText = rows.filter((r) => r.body !== null && String(r.body).trim() !== '').map((r) => r.id)
    const mediaOnly = rows.filter((r) => !(r.body !== null && String(r.body).trim() !== '')).map((r) => r.id)

    if (withText.length > 0) {
      await supabase.from('direct_messages')
        .update({ photo_url: null, video_url: null, video_thumb_url: null })
        .in('id', withText)
    }
    if (mediaOnly.length > 0) {
      await supabase.from('direct_messages')
        .update({
          photo_url: null, video_url: null, video_thumb_url: null,
          deleted_at: new Date().toISOString(),
        })
        .in('id', mediaOnly)
    }

    const summary = { purged: rows.length, filesRemoved, keptText: withText.length }
    console.log('cleanup-dm-media:', JSON.stringify(summary))
    return new Response(JSON.stringify(summary), {
      headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response(String(err), { status: 500 })
  }
})
