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
// Runs on a schedule (Supabase Dashboard → Integrations → Cron → daily) with
// the service role. Batched to 50 plans/run — a backlog just drains over a
// few days. Requires the `plans.media_purged_at timestamptz` column.

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

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
      JSON.stringify({ scanned: plans?.length ?? 0, plansPurged, voiceFilesRemoved: filesRemoved }),
      { headers: { 'content-type': 'application/json' } }
    )
  } catch (err) {
    console.error(err)
    return new Response(String(err), { status: 500 })
  }
})
