import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Expired-plan cleanup (the app's REAL retention policy) ───────────────────
//
// Runs HOURLY (cron `cleanup-expired-plans-hourly`). A plan whose start time is
// more than 24h in the past is deleted outright, and the CASCADE takes
// plan_invitees, plan_messages, plan_message_reads, plan_source_groups and
// notifications with it. Nothing about a plan survives its first day.
//
// THIS FILE WAS VENDORED IN AFTER THE FACT (2026-07-17). It had only ever
// existed as a deployed function — not in either repo — so the code said plans
// lived forever while production deleted them at 24h. Every other retention
// rule was written against that wrong picture:
//   · cleanup-plan-voice purges voice for plans ">5 days" past — unreachable,
//     since no plan reaches day 2. Its 10-day DM rule is the only live part.
//   · its comment claims photos are "deliberately KEPT ... the memories" —
//     they aren't; the sweep below deletes them with the plan.
// If you change the window here, those are the notes to reconcile.
//
// EDIT THIS FILE, then redeploy — never edit in the dashboard, or the repo goes
// stale again and the next person inherits the same trap.

/** Public URL → path inside chat-images (null if it isn't ours). */
function storagePath(url: string | null): string | null {
  if (!url) return null
  const m = url.match(/\/chat-images\/(.+)$/)
  return m?.[1] ?? null
}

Deno.serve(async () => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Plans whose start time was more than 24 hours ago
    const { data: expired, error: fetchErr } = await supabase
      .from('plans')
      .select('id')
      .lt('starts_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

    if (fetchErr) throw fetchErr
    if (!expired?.length) {
      console.log('No expired plans to delete')
      return new Response(JSON.stringify({ deleted: 0 }), { headers: { 'content-type': 'application/json' } })
    }

    const planIds = expired.map((p: { id: string }) => p.id)
    console.log(`Found ${planIds.length} expired plans:`, planIds)

    // Collect media paths BEFORE the rows go — once the messages are cascaded
    // away, nothing points at the files and they can never be found again.
    //
    // voice_url is swept alongside photo_url. It used not to be: the message
    // vanished with the plan but its .m4a stayed in the bucket forever, and the
    // function meant to catch that (cleanup-plan-voice) was looking for plans
    // 5 days old — which this function had already deleted on day one. The two
    // covered for each other on paper and missed by four days in practice.
    const { data: media } = await supabase
      .from('plan_messages')
      .select('photo_url, voice_url')
      .in('plan_id', planIds)
      .or('photo_url.not.is.null,voice_url.not.is.null')

    if (media?.length) {
      const paths = media
        .flatMap((m: { photo_url: string | null; voice_url: string | null }) =>
          [storagePath(m.photo_url), storagePath(m.voice_url)])
        .filter((p): p is string => p !== null)

      if (paths.length) {
        const { error: storageErr } = await supabase.storage.from('chat-images').remove(paths)
        if (storageErr) console.error('Storage cleanup error:', storageErr.message)
        else console.log(`Deleted ${paths.length} chat media files from storage`)
      }
    }

    // Delete plans — CASCADE removes plan_invitees, plan_messages, plan_message_reads,
    // plan_source_groups, notifications, messages
    const { error: deleteErr } = await supabase
      .from('plans')
      .delete()
      .in('id', planIds)

    if (deleteErr) throw deleteErr

    console.log(`Successfully deleted ${planIds.length} expired plans`)
    return new Response(
      JSON.stringify({ deleted: planIds.length }),
      { headers: { 'content-type': 'application/json' } }
    )
  } catch (err) {
    console.error('cleanup-expired-plans error:', err)
    return new Response(String(err), { status: 500 })
  }
})
