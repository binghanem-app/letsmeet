import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Voice-note storage cleanup for expired plans (Lets Meet 2.1) ─────────────
//
// Owner rule: voice notes are throwaway media — once a plan is well past its
// date, their .m4a files should not keep occupying storage. This function:
//   1. finds plans whose start time is > 5 days ago and that haven't been
//      purged yet (plans.media_purged_at is null),
//   2. deletes every *.m4a under that plan's chat-images/{plan_id}/ prefix
//      (photos are deliberately KEPT — past-plan chats stay viewable and
//      photos are the memories; voice notes are ephemeral),
//   3. marks the affected voice messages as deleted (deleted_at + null
//      voice_url) so old chats show "This message was deleted" instead of a
//      bubble with a dead audio URL,
//   4. stamps plans.media_purged_at so the plan is never re-scanned.
//
// PLUS the universal age rule (owner): ANY voice note older than 10 days is
// purged — DMs and plan chats alike — regardless of plan state. Purged rows
// get voice_url nulled, so they never match the sweep again (no bookkeeping).
//
// Runs on a schedule (Supabase Dashboard → Integrations → Cron → daily) with
// the service role. Batched — a backlog just drains over a few days.
// Requires the `plans.media_purged_at timestamptz` column.

const BUCKET_MARKER = '/chat-images/'

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
    const { error: rmErr } = await supabase.storage.from('chat-images').remove(paths)
    if (rmErr) { console.error(`${table} remove: ${rmErr.message}`); return 0 }
  }

  // Old bubbles show "This message was deleted" instead of a dead player.
  const ids = rows.map((r) => r.id)
  await supabase.from(table)
    .update({ deleted_at: new Date().toISOString(), voice_url: null })
    .in('id', ids)
  return paths.length
}

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Universal 10-day age rule — both chat kinds.
    const cutoff10d = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString()
    const agedDm = await purgeAgedVoice(supabase, 'direct_messages', cutoff10d)
    const agedPlan = await purgeAgedVoice(supabase, 'plan_messages', cutoff10d)

    const cutoff = new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString()
    const { data: plans, error } = await supabase
      .from('plans')
      .select('id')
      .not('starts_at', 'is', null)
      .lt('starts_at', cutoff)
      .is('media_purged_at', null)
      .limit(50)
    if (error) return new Response(error.message, { status: 500 })

    let filesRemoved = 0
    let plansPurged = 0

    for (const p of plans ?? []) {
      const { data: files, error: listErr } = await supabase.storage
        .from('chat-images')
        .list(p.id, { limit: 1000 })
      if (listErr) { console.error(`list ${p.id}: ${listErr.message}`); continue }

      const voicePaths = (files ?? [])
        .filter((f) => f.name.endsWith('.m4a'))
        .map((f) => `${p.id}/${f.name}`)

      if (voicePaths.length > 0) {
        const { error: rmErr } = await supabase.storage.from('chat-images').remove(voicePaths)
        if (rmErr) { console.error(`remove ${p.id}: ${rmErr.message}`); continue }
        filesRemoved += voicePaths.length

        // Old chats show "This message was deleted" rather than a dead player.
        await supabase.from('plan_messages')
          .update({ deleted_at: new Date().toISOString(), voice_url: null })
          .eq('plan_id', p.id)
          .not('voice_url', 'is', null)
      }

      await supabase.from('plans')
        .update({ media_purged_at: new Date().toISOString() })
        .eq('id', p.id)
      plansPurged += 1
    }

    return new Response(
      JSON.stringify({
        scanned: plans?.length ?? 0,
        plansPurged,
        expiredPlanFilesRemoved: filesRemoved,
        aged10dDmFilesRemoved: agedDm,
        aged10dPlanFilesRemoved: agedPlan,
      }),
      { headers: { 'content-type': 'application/json' } }
    )
  } catch (err) {
    console.error(err)
    return new Response(String(err), { status: 500 })
  }
})
