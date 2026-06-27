import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import PlanCard from '../components/PlanCard'
import noPlansUrl from '../assets/no-plans.png'
import waveUrl from '../assets/wave.png'
import homeBannerUrl from '../assets/home-banner.png'

function initials(name = '') {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function getPref(key, fallback = true) {
  const v = localStorage.getItem(key)
  return v === null ? fallback : v === 'true'
}

// ─── HomeScreen ──────────────────────────────────────────────────────────────
export default function HomeScreen({ session, refreshTrigger, onStartCreate, onGoFriends, onOpenPlan, onPlanCancelled, onUnreadChatCount, onNewChatMessage, onNewInvite, viewedPlanIds }) {
  const [profile, setProfile] = useState(null)
  const [feed, setFeed]       = useState([])
  const [loading, setLoading] = useState(true)
  const feedRef               = useRef([])

  // Keep feedRef in sync so postgres_changes handler can read current feed without stale closure
  useEffect(() => { feedRef.current = feed }, [feed])

  useEffect(() => {
    if (!session || refreshTrigger === 0) return
    loadData(true)
  }, [refreshTrigger])

  useEffect(() => {
    if (!session) return
    loadData()

    const feedChannel = supabase
      .channel(`user-home-${session.user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'plan_messages' }, (payload) => {
        const planId = payload.new?.plan_id
        const senderId = payload.new?.sender
        if (!planId || senderId === session.user.id) return
        const inFeed = feedRef.current.some(p => p.id === planId)
        if (!inFeed) return
        onNewChatMessage?.(planId)
        setFeed(prev => {
          const idx = prev.findIndex(p => p.id === planId)
          if (idx === -1 || viewedPlanIds?.has(planId)) return prev
          const updated = [...prev]
          updated[idx] = { ...updated[idx], unreadCount: (updated[idx].unreadCount || 0) + 1 }
          return updated
        })
      })
      .on('broadcast', { event: 'plan_invite' }, () => { loadData(true); onNewInvite?.() })
      .on('broadcast', { event: 'plan_deleted' }, ({ payload }) => {
        // Host cancelled a plan — drop it from the feed live instead of waiting for a reload.
        if (payload?.plan_id) setFeed(f => f.filter(p => p.id !== payload.plan_id))
      })
      .subscribe((status) => { if (status === 'SUBSCRIBED') loadData(true) })

    return () => { supabase.removeChannel(feedChannel) }
  }, [session])

  async function loadData(silent = false) {
    if (!silent) setLoading(true)
    await Promise.all([loadProfile(), loadFeed()])
    if (!silent) setLoading(false)
  }

  async function loadProfile() {
    const { data } = await supabase
      .from('profiles')
      .select('first_name, last_name, username, avatar_color')
      .eq('id', session.user.id)
      .single()
    if (data) setProfile(data)
  }

  async function loadFeed() {
    const now = new Date()
    const nowIso = now.toISOString()
    const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

    // get invitee plan IDs
    const { data: inviteeRows } = await supabase
      .from('plan_invitees')
      .select('plan_id, rsvp')
      .eq('invitee', session.user.id)
    const inviteePlanIds = inviteeRows?.map(r => r.plan_id) || []
    const myRsvpByPlan = {}
    inviteeRows?.forEach(r => { myRsvpByPlan[r.plan_id] = r.rsvp })

    const [
      { data: hostedPlans },
      { data: invitedPlans },
    ] = await Promise.all([
      supabase.from('plans').select('id, title, place_name, place_address, starts_at, time_label, host, vibe')
        .eq('host', session.user.id).not('cancelled', 'is', true).gte('starts_at', cutoff24h).order('starts_at').limit(20),
      inviteePlanIds.length
        ? supabase.from('plans').select('id, title, place_name, place_address, starts_at, time_label, host, vibe')
            .in('id', inviteePlanIds).not('cancelled', 'is', true).gte('starts_at', cutoff24h).order('starts_at').limit(20)
        : Promise.resolve({ data: [] }),
    ])

    const allPlans = [...(hostedPlans || []), ...(invitedPlans || [])]
    const seen = new Set()
    const deduped = allPlans.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true })

    // Split and sort: upcoming asc, past desc (most recent first)
    const upcoming = deduped.filter(p => new Date(p.starts_at) >= now).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)).slice(0, 5)
    const pastPlans = deduped.filter(p => new Date(p.starts_at) < now).sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at)).slice(0, 5)
    const unique = [...upcoming, ...pastPlans]

    if (!unique.length) { setFeed([]); return }

    const planIds = unique.map(p => p.id)
    const hostIds = [...new Set(unique.map(p => p.host))]

    // These four reads are independent — run them together to cut round-trips:
    // host profiles, the viewer's nicknames, RSVP rows, and last-read markers.
    const [
      { data: hostProfiles },
      { data: nicknames },
      { data: rsvps },
      { data: reads },
    ] = await Promise.all([
      supabase.from('profiles').select('id, first_name, last_name, avatar_color, avatar_url').in('id', hostIds),
      supabase.from('friend_nicknames').select('friend_id, nickname').eq('user_id', session.user.id),
      supabase.from('plan_invitees').select('plan_id, rsvp, invitee').in('plan_id', planIds),
      supabase.from('plan_message_reads').select('plan_id, last_read_at').eq('user_id', session.user.id).in('plan_id', planIds),
    ])
    const nickMap = {}
    nicknames?.forEach(n => { nickMap[n.friend_id] = n.nickname })
    const hostMap = {}
    hostProfiles?.forEach(p => { hostMap[p.id] = p })
    const rsvpByPlan = {}
    rsvps?.forEach(r => {
      if (!rsvpByPlan[r.plan_id]) rsvpByPlan[r.plan_id] = []
      rsvpByPlan[r.plan_id].push(r)
    })
    const readMap = {}
    reads?.forEach(r => { readMap[r.plan_id] = r.last_read_at })

    // Invitee avatar profile IDs (up to 4 per plan), derived from the RSVP rows
    const allInviteeIds = []
    const inviteeIdsByPlan = {}
    rsvps?.forEach(r => {
      if (!inviteeIdsByPlan[r.plan_id]) inviteeIdsByPlan[r.plan_id] = []
      if (inviteeIdsByPlan[r.plan_id].length < 4) {
        inviteeIdsByPlan[r.plan_id].push(r.invitee)
        allInviteeIds.push(r.invitee)
      }
    })
    const uniqueInviteeIds = [...new Set(allInviteeIds)]

    // Final batch in parallel: per-plan unread counts + invitee avatar profiles
    const [unreadResults, { data: inviteeProfiles }] = await Promise.all([
      Promise.all(planIds.map(async id => {
        // No read record = chat never opened, so every message from others is unseen.
        let q = supabase.from('plan_messages').select('id', { count: 'exact', head: true })
          .eq('plan_id', id)
          .neq('sender', session.user.id)
        if (readMap[id]) q = q.gt('created_at', readMap[id])
        const { count } = await q
        return [id, count || 0]
      })),
      uniqueInviteeIds.length
        ? supabase.from('profiles').select('id, first_name, avatar_color, avatar_url').in('id', uniqueInviteeIds)
        : Promise.resolve({ data: [] }),
    ])
    const unreadMap = Object.fromEntries(unreadResults)
    const totalUnread = Object.values(unreadMap).reduce((s, n) => s + n, 0)
    onUnreadChatCount?.(totalUnread)
    const inviteeProfileMap = {}
    ;(inviteeProfiles || []).forEach(p => { inviteeProfileMap[p.id] = p })

    setFeed(unique.slice(0, 5).map(plan => {
      const host = hostMap[plan.host]
      const hostName = host ? (nickMap[plan.host] || `${host.first_name || ''} ${host.last_name || ''}`.trim() || 'Someone') : 'Someone'
      const isHost = plan.host === session.user.id
      const planRsvps = rsvpByPlan[plan.id] || []
      const goingCount = planRsvps.filter(r => r.rsvp === 'going').length + 1
      const lateCount = planRsvps.filter(r => r.rsvp === 'late').length
      const cantCount = planRsvps.filter(r => r.rsvp === 'cant').length
      const inviteeProfiles = (inviteeIdsByPlan[plan.id] || []).map(id => inviteeProfileMap[id]).filter(Boolean)
      return {
        ...plan,
        isHost,
        hostName,
        hostInitials: initials(hostName),
        hostColor: host?.avatar_color || '#A78BFA',
        hostAvatarUrl: host?.avatar_url || null,
        goingCount,
        lateCount,
        cantCount,
        myRsvp: isHost ? 'going' : (myRsvpByPlan[plan.id] || null),
        unreadCount: viewedPlanIds?.has(plan.id) ? 0 : (unreadMap[plan.id] || 0),
        inviteeProfiles,
      }
    }))
  }

  async function deletePlan(planId) {
    const plan = feed.find(p => p.id === planId)
    const placeLabel = plan?.place_name || plan?.title || 'The plan'
    const { data: inviteeRows } = await supabase.from('plan_invitees').select('invitee').eq('plan_id', planId)
    const inviteeIds = (inviteeRows || []).map(r => r.invitee)
    if (inviteeIds.length) {
      await supabase.from('notifications').insert(
        inviteeIds.map(uid => ({
          recipient: uid,
          actor: session.user.id,
          kind: 'plan_update',
          plan_id: planId,
          body: `"${placeLabel}" has been cancelled`,
        }))
      )
    }
    await supabase.from('plans').update({ cancelled: true }).eq('id', planId)
    setFeed(f => f.filter(p => p.id !== planId))
    onPlanCancelled?.(planId)
  }

  async function saveRsvp(planId, val) {
    const plan = feed.find(p => p.id === planId)
    if (!plan || plan.isHost) return
    const newVal = plan.myRsvp === val ? 'invited' : val
    const displayRsvp = newVal === 'invited' ? null : newVal
    // optimistic update
    setFeed(prev => prev.map(p => p.id === planId ? { ...p, myRsvp: displayRsvp } : p))
    await supabase.from('plan_invitees')
      .update({ rsvp: newVal })
      .eq('plan_id', planId).eq('invitee', session.user.id)
    // Notify the host that I responded (skip when un-RSVPing back to "invited")
    if (newVal !== 'invited' && plan.host !== session.user.id) {
      const name = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || profile?.username || 'Someone'
      const bodyMap = {
        going: `${name} is going to your ${plan.title}`,
        late:  `${name} is going (a bit late) to your ${plan.title}`,
        cant:  `${name} can't make it to your ${plan.title}`,
      }
      const b = bodyMap[newVal]
      if (b) {
        const { error } = await supabase.from('notifications').insert({ recipient: plan.host, actor: session.user.id, kind: 'rsvp', plan_id: plan.id, body: b })
        if (error) console.error('RSVP notif insert failed:', error)
      }
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#FBF7F4' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 24px' }} className="no-scrollbar">

        {/* Header */}
        <div style={{ padding: '16px 20px 14px' }}>
          <div style={{ fontSize: 14, color: '#9A9087', marginBottom: 4 }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </div>
          <div style={{ font: '700 28px -apple-system', color: '#1A1A1A', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Hey, {profile?.first_name || 'there'}</span>
            <img src={waveUrl} alt="" style={{ width: 30, height: 30, flexShrink: 0, transform: 'rotate(-20deg)' }} />
          </div>
        </div>

        {/* Let's Meet Banner */}
        <img
          src={homeBannerUrl}
          alt="Make a plan"
          onClick={onStartCreate}
          style={{ display: 'block', width: '100%', marginBottom: 16, cursor: 'pointer' }}
        />

        {/* Your plans */}
        <div style={{ padding: '0 20px', marginBottom: 14 }}>
          <div style={{ font: '700 19px -apple-system', color: '#1A1A1A' }}>Your plans</div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #E0D7CF', borderTopColor: '#FF6B4A', animation: 'spin .7s linear infinite' }}/>
          </div>
        ) : feed.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 24px 40px' }}>
            <img src={noPlansUrl} alt="" style={{ width: 200, maxWidth: '64%', display: 'block', margin: '0 auto 14px' }} />
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#FFEAE2', color: '#FF6B4A', font: '600 14px Fredoka, -apple-system', padding: '8px 16px', borderRadius: 22 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF6B4A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4"/></svg>
              No plans yet
            </div>
            <p style={{ fontSize: 14, color: '#9A9087', margin: '12px 0 0' }}>Tap the banner above to start one.</p>
          </div>
        ) : (() => {
          const now = new Date()
          const upcoming = feed.filter(p => new Date(p.starts_at) >= now)
          const pastFeed = feed.filter(p => new Date(p.starts_at) < now)
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '0 20px' }}>
              {upcoming.map(plan => (
                <PlanCard key={plan.id} plan={plan} onOpen={() => onOpenPlan(plan.id)} onDelete={() => deletePlan(plan.id)} onRsvp={async (val) => saveRsvp(plan.id, val)} />
              ))}
              {pastFeed.length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 0' }}>
                    <div style={{ flex: 1, height: 1, background: '#E0D8D0' }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#B6ADA4', letterSpacing: '.4px' }}>PAST</span>
                    <div style={{ flex: 1, height: 1, background: '#E0D8D0' }} />
                  </div>
                  {pastFeed.map(plan => (
                    <PlanCard key={plan.id} plan={plan} onOpen={() => onOpenPlan(plan.id)} onDelete={() => deletePlan(plan.id)} onRsvp={async (val) => saveRsvp(plan.id, val)} />
                  ))}
                </>
              )}
            </div>
          )
        })()}
      </div>
    </div>
  )
}
