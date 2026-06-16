import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import PlanCard from '../components/PlanCard'

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

    // Host profiles + viewer's nicknames for those hosts
    const hostIds = [...new Set(unique.map(p => p.host))]
    const [{ data: hostProfiles }, { data: nicknames }] = await Promise.all([
      supabase.from('profiles').select('id, first_name, last_name, avatar_color, avatar_url').in('id', hostIds),
      supabase.from('friend_nicknames').select('friend_id, nickname').eq('user_id', session.user.id),
    ])
    const nickMap = {}
    nicknames?.forEach(n => { nickMap[n.friend_id] = n.nickname })
    const hostMap = {}
    hostProfiles?.forEach(p => { hostMap[p.id] = p })

    // RSVP counts
    const { data: rsvps } = await supabase
      .from('plan_invitees')
      .select('plan_id, rsvp, invitee')
      .in('plan_id', unique.map(p => p.id))
    const rsvpByPlan = {}
    rsvps?.forEach(r => {
      if (!rsvpByPlan[r.plan_id]) rsvpByPlan[r.plan_id] = []
      rsvpByPlan[r.plan_id].push(r)
    })

    // Unread message counts
    const planIds = unique.map(p => p.id)
    const { data: reads } = await supabase
      .from('plan_message_reads')
      .select('plan_id, last_read_at')
      .eq('user_id', session.user.id)
      .in('plan_id', planIds)
    const readMap = {}
    reads?.forEach(r => { readMap[r.plan_id] = r.last_read_at })

    const unreadResults = await Promise.all(planIds.map(async id => {
      if (!readMap[id]) return [id, 0]
      const { count } = await supabase.from('plan_messages').select('id', { count: 'exact', head: true })
        .eq('plan_id', id)
        .neq('sender', session.user.id)
        .gt('created_at', readMap[id])
      return [id, count || 0]
    }))
    const unreadMap = Object.fromEntries(unreadResults)
    const totalUnread = Object.values(unreadMap).reduce((s, n) => s + n, 0)
    onUnreadChatCount?.(totalUnread)

    // Invitee avatar profiles (up to 4 per plan)
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
    let inviteeProfileMap = {}
    if (uniqueInviteeIds.length) {
      const { data: inviteeProfiles } = await supabase
        .from('profiles')
        .select('id, first_name, avatar_color, avatar_url')
        .in('id', uniqueInviteeIds)
      inviteeProfiles?.forEach(p => { inviteeProfileMap[p.id] = p })
    }

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
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#F9F4F0' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 24px' }} className="no-scrollbar">

        {/* Header */}
        <div style={{ padding: '16px 20px 14px' }}>
          <div style={{ fontSize: 14, color: '#9A9087', marginBottom: 4 }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </div>
          <div style={{ font: '700 28px -apple-system', color: '#1A1A1A' }}>
            Hey, {profile?.first_name || 'there'} 👋
          </div>
        </div>

        {/* Let's Meet Banner */}
        <div onClick={onStartCreate} style={{ position: 'relative', margin: '0 20px 20px', borderRadius: 20, background: 'linear-gradient(110deg, #FF5E3A, #FF7A52 60%, #FF8E63)', padding: '20px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 8px 24px rgba(255,94,58,.28)', cursor: 'pointer', overflow: 'hidden', minHeight: 80 }}>
          <div style={{ position: 'absolute', right: -20, top: -30, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,.12)' }}/>
          <div>
            <div style={{ font: '700 24px -apple-system', color: '#fff', marginBottom: 4 }}>Let's Meet</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,.9)' }}>Start a plan in seconds</div>
          </div>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,255,255,.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
          </div>
        </div>

        {/* Your plans */}
        <div style={{ padding: '0 20px', marginBottom: 14 }}>
          <div style={{ font: '700 19px -apple-system', color: '#1A1A1A' }}>Your plans</div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #E0D7CF', borderTopColor: '#FF6B4A', animation: 'spin .7s linear infinite' }}/>
          </div>
        ) : feed.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 24px' }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>🗓️</div>
            <p style={{ font: '600 17px -apple-system', color: '#1A1A1A', margin: '0 0 6px' }}>No plans yet</p>
            <p style={{ fontSize: 14, color: '#9A9087', margin: 0 }}>Tap the banner above to start one.</p>
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
