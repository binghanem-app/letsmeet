import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// ─── helpers ────────────────────────────────────────────────────────────────
function initials(name = '') {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}
function relativeTime(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function friendlyDate(iso) {
  const d = new Date(iso)
  const now = new Date()
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
  if (d.toDateString() === now.toDateString()) return `Today · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function getPref(key, fallback = true) {
  const v = localStorage.getItem(key)
  return v === null ? fallback : v === 'true'
}

// ─── Category config ─────────────────────────────────────────────────────────
const CATEGORY_CONFIG = {
  Coffee:     { emoji: '☕',  gradient: 'linear-gradient(135deg,#F5A623,#F7C05A)', accent: '#C8841A' },
  Dinner:     { emoji: '🍽️', gradient: 'linear-gradient(135deg,#A78BFA,#C4B0FF)', accent: '#A78BFA' },
  Movies:     { emoji: '🎬', gradient: 'linear-gradient(135deg,#FF6B4A,#FF9070)', accent: '#FF6B4A' },
  'Hang out': { emoji: '🏠', gradient: 'linear-gradient(135deg,#EC6A9C,#F28CB8)', accent: '#EC6A9C' },
  Outdoors:   { emoji: '🌿', gradient: 'linear-gradient(135deg,#12B886,#3DCCA0)', accent: '#0E9C6B' },
  Trip:       { emoji: '✈️', gradient: 'linear-gradient(135deg,#5B7CFA,#7A9AFF)', accent: '#5B7CFA' },
}

// ─── FeedCard ────────────────────────────────────────────────────────────────
function FeedCard({ plan, onOpen, onDelete, onRsvp }) {
  const cat = CATEGORY_CONFIG[plan.vibe] || { emoji: '📅', gradient: 'linear-gradient(135deg,#B6ADA4,#D0C9C2)', accent: '#9A9087' }
  const past = plan.starts_at && new Date(plan.starts_at) < new Date()
  const isToday = plan.starts_at && new Date(plan.starts_at).toDateString() === new Date().toDateString()
  const [showDelConfirm, setShowDelConfirm] = useState(false)

  const RSVP = [
    { val: 'going', label: 'Going', activeColor: '#0E9C6B', ghostBorder: '#CDEBDD', ghostText: '#0E9C6B', activeShadow: 'rgba(14,156,107,.25)' },
    { val: 'late',  label: 'Late',  activeColor: '#C8841A', ghostBorder: '#F0D9B5', ghostText: '#C8841A', activeShadow: 'rgba(200,132,26,.25)' },
    { val: 'cant',  label: "Can't", activeColor: '#E5484D', ghostBorder: '#F3C9C9', ghostText: '#E5484D', activeShadow: 'rgba(229,72,77,.25)' },
  ]

  // avatar stack: host + invitees, up to 4
  const avatars = []
  if (plan.hostColor || plan.hostName) {
    avatars.push({ initials: initials(plan.hostName || ''), color: plan.hostColor || '#5B7CFA' })
  }
  ;(plan.inviteeProfiles || []).slice(0, 3).forEach(p => {
    avatars.push({ initials: initials(`${p.first_name || ''}`), color: p.avatar_color || '#A78BFA' })
  })

  const totalAttendees = plan.goingCount || 0
  const extraCount = Math.max(0, totalAttendees - 4)

  return (
    <div style={{ position: 'relative', marginBottom: 0 }}>
      {/* Unread badge */}
      {plan.unreadCount > 0 && (
        <div style={{ position: 'absolute', top: -9, right: 16, zIndex: 2, background: '#FF6B4A', borderRadius: 20, padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 4, boxShadow: '0 4px 10px rgba(255,107,74,.4)' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{plan.unreadCount}</span>
        </div>
      )}

      <div
        style={{ background: '#fff', borderRadius: 18, boxShadow: '0 1px 3px rgba(0,0,0,.05), 0 8px 22px rgba(0,0,0,.05)', overflow: 'visible', opacity: past ? 0.72 : 1 }}
      >
        {/* Main info row */}
        <div onClick={onOpen} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '16px 16px 13px', cursor: 'pointer' }}>
          {/* Emoji tile */}
          <div style={{ width: 50, height: 50, borderRadius: 15, background: cat.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
            {cat.emoji}
          </div>
          {/* Text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: '700 18px -apple-system', color: '#1A1A1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{plan.place || plan.title || 'No location'}</div>
            <div style={{ fontSize: 13, color: isToday ? '#0E9C6B' : '#9A9087', marginTop: 2, fontWeight: isToday ? 600 : 400 }}>{friendlyDate(plan.starts_at)}</div>
          </div>
          {/* Avatar stack + chevron */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <div style={{ display: 'flex' }}>
              {avatars.slice(0, 4).map((a, i) => (
                <div key={i} style={{ width: 24, height: 24, borderRadius: '50%', background: a.color, border: '2px solid #fff', marginLeft: i === 0 ? 0 : -8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9, fontWeight: 700, zIndex: 4 - i }}>
                  {a.initials}
                </div>
              ))}
              {extraCount > 0 && (
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#ECE6E0', border: '2px solid #fff', marginLeft: -8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9A9087', fontSize: 9, fontWeight: 700 }}>
                  +{extraCount}
                </div>
              )}
            </div>
            <svg width="9" height="15" viewBox="0 0 10 17" fill="none" stroke="#C4BBB2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m2 1 7 7.5L2 16"/></svg>
          </div>
        </div>

        {/* Host delete confirm */}
        {plan.isHost && showDelConfirm && (
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FEF0EE', border: '1px solid #FAD5CF', borderRadius: 12, margin: '0 14px 12px', padding: '10px 12px' }}>
            <span style={{ flex: 1, fontSize: 13, color: '#E14F2E', fontWeight: 600 }}>Cancel this plan?</span>
            <button onClick={() => { onDelete?.(); setShowDelConfirm(false) }} style={{ background: '#E14F2E', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 9, cursor: 'pointer' }}>Yes</button>
            <button onClick={() => setShowDelConfirm(false)} style={{ background: '#fff', color: '#7B7268', border: '1.5px solid #FAD5CF', fontSize: 12, fontWeight: 600, padding: '7px 10px', borderRadius: 9, cursor: 'pointer' }}>No</button>
          </div>
        )}

        {/* RSVP row */}
        {!plan.isHost && !past && (
          <div style={{ display: 'flex', gap: 8, padding: '0 14px 14px' }}>
            {RSVP.map(r => {
              const sel = plan.myRsvp === r.val
              return (
                <button key={r.val} onClick={() => onRsvp(plan.id, r.val)}
                  style={{ flex: 1, height: 40, border: `1.5px solid ${sel ? r.activeColor : r.ghostBorder}`, borderRadius: 11, background: sel ? r.activeColor : '#fff', color: sel ? '#fff' : r.ghostText, font: '600 14px -apple-system', cursor: 'pointer', transition: 'all .15s', boxShadow: sel ? `0 2px 8px ${r.activeShadow}` : 'none' }}>
                  {r.label}
                </button>
              )
            })}
          </div>
        )}
        {plan.isHost && !past && (
          <div style={{ padding: '0 14px 14px' }}>
            <div
              onClick={e => { e.stopPropagation(); setShowDelConfirm(true) }}
              style={{ height: 40, borderRadius: 11, background: '#E4F6EE', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', cursor: 'pointer' }}
            >
              <span style={{ font: '600 14px -apple-system', color: '#0E9C6B' }}>You're hosting</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E14F2E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── HomeScreen ──────────────────────────────────────────────────────────────
export default function HomeScreen({ session, refreshTrigger, onStartCreate, onGoFriends, onOpenPlan, onPlanCancelled, onUnreadChatCount }) {
  const [profile, setProfile] = useState(null)
  const [feed, setFeed]       = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session || refreshTrigger === 0) return
    loadData(true)
  }, [refreshTrigger])

  useEffect(() => {
    if (!session) return
    loadData()
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
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    const now = todayStart.toISOString()

    // get friend IDs
    const { data: friendships } = await supabase
      .from('friendships')
      .select('requester, addressee')
      .or(`requester.eq.${session.user.id},addressee.eq.${session.user.id}`)
      .eq('status', 'accepted')
    const friendIds = (friendships || []).map(f =>
      f.requester === session.user.id ? f.addressee : f.requester
    )

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
      { data: friendPlans },
    ] = await Promise.all([
      supabase.from('plans').select('id, title, place_name, starts_at, host, vibe')
        .eq('host', session.user.id).not('cancelled', 'is', true).gte('starts_at', now).order('starts_at').limit(10),
      inviteePlanIds.length
        ? supabase.from('plans').select('id, title, place_name, starts_at, host, vibe')
            .in('id', inviteePlanIds).not('cancelled', 'is', true).gte('starts_at', now).order('starts_at').limit(10)
        : Promise.resolve({ data: [] }),
      friendIds.length
        ? supabase.from('plans').select('id, title, place_name, starts_at, host, vibe')
            .in('host', friendIds).not('cancelled', 'is', true).gte('starts_at', now).order('starts_at').limit(10)
        : Promise.resolve({ data: [] }),
    ])

    const allPlans = [...(hostedPlans || []), ...(invitedPlans || []), ...(friendPlans || [])]
    const seen = new Set()
    const unique = allPlans.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true })
    unique.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))

    if (!unique.length) { setFeed([]); return }

    // Host profiles
    const hostIds = [...new Set(unique.map(p => p.host))]
    const { data: hostProfiles } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, avatar_color')
      .in('id', hostIds)
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
      let q = supabase.from('plan_messages').select('id', { count: 'exact', head: true })
        .eq('plan_id', id)
        .neq('sender', session.user.id)
      if (readMap[id]) q = q.gt('created_at', readMap[id])
      const { count } = await q
      return [id, count || 0]
    }))
    const unreadMap = Object.fromEntries(unreadResults)
    const totalUnread = Object.values(unreadMap).reduce((s, n) => s + n, 0)
    onUnreadChatCount?.(totalUnread)

    // Invitee avatar profiles (up to 4 per plan)
    const allInviteeIds = []
    const inviteeIdsByPlan = {}
    rsvps?.forEach(r => {
      if (r.invitee !== session.user.id) {
        if (!inviteeIdsByPlan[r.plan_id]) inviteeIdsByPlan[r.plan_id] = []
        if (inviteeIdsByPlan[r.plan_id].length < 4) {
          inviteeIdsByPlan[r.plan_id].push(r.invitee)
          allInviteeIds.push(r.invitee)
        }
      }
    })
    const uniqueInviteeIds = [...new Set(allInviteeIds)]
    let inviteeProfileMap = {}
    if (uniqueInviteeIds.length) {
      const { data: inviteeProfiles } = await supabase
        .from('profiles')
        .select('id, first_name, avatar_color')
        .in('id', uniqueInviteeIds)
      inviteeProfiles?.forEach(p => { inviteeProfileMap[p.id] = p })
    }

    setFeed(unique.slice(0, 5).map(plan => {
      const host = hostMap[plan.host]
      const hostName = host ? `${host.first_name || ''} ${host.last_name || ''}`.trim() : 'Someone'
      const isHost = plan.host === session.user.id
      const planRsvps = rsvpByPlan[plan.id] || []
      const goingCount = planRsvps.filter(r => r.rsvp === 'going').length + (isHost ? 1 : 0)
      const lateCount = planRsvps.filter(r => r.rsvp === 'late').length
      const cantCount = planRsvps.filter(r => r.rsvp === 'cant').length
      const inviteeProfiles = (inviteeIdsByPlan[plan.id] || []).map(id => inviteeProfileMap[id]).filter(Boolean)
      return {
        ...plan,
        isHost,
        hostName,
        hostInitials: initials(hostName),
        hostColor: host?.avatar_color || '#A78BFA',
        goingCount,
        lateCount,
        cantCount,
        myRsvp: isHost ? 'going' : (myRsvpByPlan[plan.id] || null),
        unreadCount: unreadMap[plan.id] || 0,
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
    const newVal = plan.myRsvp === val ? null : val
    // optimistic update
    setFeed(prev => prev.map(p => p.id === planId ? { ...p, myRsvp: newVal } : p))
    if (newVal) {
      await supabase.from('plan_invitees')
        .upsert({ plan_id: planId, invitee: session.user.id, rsvp: newVal }, { onConflict: 'plan_id,invitee' })
    } else {
      await supabase.from('plan_invitees')
        .update({ rsvp: 'invited' })
        .eq('plan_id', planId).eq('invitee', session.user.id)
    }
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
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '0 20px' }}>
            {feed.map(plan => (
              <FeedCard
                key={plan.id}
                plan={plan}
                onOpen={() => onOpenPlan(plan.id)}
                onDelete={() => deletePlan(plan.id)}
                onRsvp={saveRsvp}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
