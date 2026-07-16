import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Voice-note cleanup (Lets Meet 2.1, reworked 2026-07-17) ──────────────────
//
// Owner rule: voice notes are throwaway media — "ANY voice note older than 10
// days is purged", DMs and plan chats alike. Purged rows get voice_url nulled
// with deleted_at UNTOUCHED; voice_duration_ms stays set, and the app renders
// that combination as "Voice note expired — voice notes last 10 days" rather
// than the user-deleted text.
//
// This function does two passes:
//   1. BY ROW — any message older than 10 days with a voice_url: delete the
//      file, null the url. This is what produces the "expired" bubble.
//   2. BY FILE — delete any .m4a that NO row points at. Without this they are
//      immortal: nothing references them, so no row-based query can ever find
//      them. Unreferenced is an exact test, not a guess about age — a file
//      nothing links to can never be played again, whatever its date.
//
// Pass 2 exists because the original design was written against a false
// picture. It used to purge voice for plans ">5 days" past their start —
// unreachable, because cleanup-expired-plans DELETES every plan 24h after it
// starts (that function ran hourly in production while existing in no repo, so
// nobody could see it). The plan's messages cascaded away on day one, and their
// .m4a files stayed in the bucket forever: 22 orphans / 1.6 MB by the time
// anyone looked. cleanup-expired-plans now sweeps voice_url alongside
// photo_url, so no NEW orphans are made; pass 2 collects the legacy ones and
// any future stray.
//
// Scheduled daily (cron `purge-expired-voice`, 03:00) with the service role.
//
// LAYOUTS (chat-images):  {plan_id}/x.m4a  ·  dm/{peerA}_{peerB}/x.m4a
//   · stories/ belongs to cleanup-stories — never touched here.
//   · NOTHING is deleted on age alone in pass 2: a plan can be made weeks
//     ahead and its chat opens immediately, so an old file under a live plan
//     is still someone's unheard voice note. Only "no row points here" is
//     safe, and pass 1 owns the 10-day clock for files that ARE referenced.

const BUCKET = 'chat-images'
const BUCKET_MARKER = '/chat-images/'
const TEN_DAYS_MS = 10 * 24 * 3600 * 1000
/** Upload-to-insert window: younger files are never treated as orphans. */
const GRACE_MS = 60 * 60 * 1000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Public URL → storage path inside chat-images (null if not ours). */
function storagePath(url: string | null): string | null {
  if (!url) return null
  const i = url.indexOf(BUCKET_MARKER)
  if (i < 0) return null
  const path = url.slice(i + BUCKET_MARKER.length)
  return path.length > 0 ? path : null
}

/** Purge voice notes older than `cutoff` from one messages table. */
async function purgeAgedVoice(
  supabase: ReturnType<typeof createClient>,
  table: 'direct_messages' | 'plan_messages',
  cutoff: string
): Promise<number> {
  const { data: rows, error } = await supabase
    .from(table)
    .select('id, voice_url')
    .not('voice_url', 'is', null)
    .lt('created_at', cutoff)
    .limit(500)
  if (error) { console.error(`${table} select: ${error.message}`); return 0 }
  if (!rows || rows.length === 0) return 0

  const paths = rows.map((r) => storagePath(r.voice_url)).filter((p): p is string => p !== null)
  if (paths.length > 0) {
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove(paths)
    if (rmErr) { console.error(`${table} remove: ${rmErr.message}`); return 0 }
  }

  // voice_url null + deleted_at UNTOUCHED = the app's "expired" marker
  // (voice_duration_ms still set): bubbles render "Voice note expired -
  // voice notes last 10 days" instead of the user-delete text.
  const ids = rows.map((r) => r.id)
  await supabase.from(table)
    .update({ voice_url: null })
    .in('id', ids)
  return paths.length
}

/** Remove the given .m4a files, reporting how many actually went. */
async function removeVoice(
  supabase: ReturnType<typeof createClient>,
  paths: string[],
  label: string
): Promise<number> {
  if (paths.length === 0) return 0
  const { error } = await supabase.storage.from(BUCKET).remove(paths)
  if (error) { console.error(`remove ${label}: ${error.message}`); return 0 }
  return paths.length
}

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── Pass 1: by row (produces the "expired" bubble) ──
    const cutoff10d = new Date(Date.now() - TEN_DAYS_MS).toISOString()
    const agedDm = await purgeAgedVoice(supabase, 'direct_messages', cutoff10d)
    const agedPlan = await purgeAgedVoice(supabase, 'plan_messages', cutoff10d)

    // ── Pass 2: by file (collects what no row points at) ──
    //
    // Build the set of STILL-REFERENCED files first. Anything in the bucket
    // that isn't in it is unreachable by definition. The grace window keeps a
    // file that's mid-upload — object written, row not inserted yet — from
    // looking like an orphan for the few seconds in between.
    const live = new Set<string>()
    for (const table of ['plan_messages', 'direct_messages'] as const) {
      const { data, error } = await supabase.from(table)
        .select('voice_url').not('voice_url', 'is', null).limit(10000)
      if (error) { console.error(`${table} live-set: ${error.message}`); throw error }
      for (const r of data ?? []) {
        const p = storagePath(r.voice_url as string)
        if (p) live.add(p)
      }
    }
    const graceMs = Date.now() - GRACE_MS
    let orphanFilesRemoved = 0

    /** Sweep one folder's .m4a files, dropping any nothing references. */
    const sweep = async (prefix: string) => {
      const { data: files } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 })
      const dead = (files ?? [])
        .filter((f) => f.name.endsWith('.m4a'))
        .filter((f) => !f.created_at || new Date(f.created_at).getTime() < graceMs)
        .map((f) => `${prefix}/${f.name}`)
        .filter((p) => !live.has(p))
      orphanFilesRemoved += await removeVoice(supabase, dead, prefix)
    }

    const { data: roots, error: rootErr } = await supabase.storage
      .from(BUCKET).list('', { limit: 1000 })
    if (rootErr) console.error(`root list: ${rootErr.message}`)

    for (const entry of roots ?? []) {
      const folder = entry.name
      if (!folder || folder === 'stories') continue   // stories = cleanup-stories' job
      if (folder === 'dm') {
        const { data: pairs } = await supabase.storage.from(BUCKET).list('dm', { limit: 1000 })
        for (const pair of pairs ?? []) {
          if (pair.name) await sweep(`dm/${pair.name}`)
        }
      } else if (UUID_RE.test(folder)) {
        await sweep(folder)                            // a plan folder
      }
    }

    const summary = {
      aged10dDmFilesRemoved: agedDm,
      aged10dPlanFilesRemoved: agedPlan,
      orphanFilesRemoved,
      liveVoiceFiles: live.size,
    }
    console.log('cleanup-plan-voice:', JSON.stringify(summary))
    return new Response(JSON.stringify(summary), {
      headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response(String(err), { status: 500 })
  }
})
