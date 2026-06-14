import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CreateCircleSheet } from './FriendsScreen'
import UserProfileSheet from '../components/UserProfileSheet'

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

const CIRCLE_COLORS = ['#FF6B4A','#5B7CFA','#12B886','#F5A623','#A78BFA','#EC6A9C']

// ─── icons ───────────────────────────────────────────────────────────────────
const BellIcon = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? '#FF6B4A' : 'none'} stroke={active ? '#FF6B4A' : '#1F2933'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.7 21a2 2 0 0 1-3.4 0"/>
  </svg>
)
const AddFriendIcon = () => (
  <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#1F2933" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="10" cy="8" r="3.4"/>
    <path d="M4 19c0-3 2.7-4.8 6-4.8"/>
    <path d="M17 13v6M14 16h6"/>
  </svg>
)
const PinIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF6B4A" strokeWidth="2">
    <path d="M12 21s7-6.4 7-11a7 7 0 1 0-14 0c0 4.6 7 11 7 11z"/>
    <circle cx="12" cy="10" r="2.4"/>
  </svg>
)
const ChevronRight = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FF6B4A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 6 6 6-6 6"/>
  </svg>
)
const PlusIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round">
    <path d="M12 5v14M5 12h14"/>
  </svg>
)

// ─── Notification kind icons ──────────────────────────────────────────────────
function KindDot({ kind }) {
  const colors = { rsvp: '#0E9C6B', request: '#5B7CFA', reminder: '#F5A623', message: '#FF6B4A', invite: '#FF6B4A', plan_update: '#A78BFA' }
  return <div style={{ width: 8, height: 8, borderRadius: '50%', background: colors[kind] || '#A78BFA', flexShrink: 0, marginTop: 4 }}/>
}

// ─── Notifications sheet ──────────────────────────────────────────────────────
function NotificationsSheet({ notifs, onClose, onClearAll, onDismiss, onOpenPlan, onOpenFriends }) {
  return (
    <div
      onClick={onClose}
      style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(20,24,30,.45)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="sheet-up"
        style={{ background: '#FBF7F4', borderRadius: '28px 28px 0 0', maxHeight: '80%', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ width: 42, height: 5, borderRadius: 5, background: '#E0D7CF', margin: '12px auto 0', flexShrink: 0 }}/>

        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 10px', flexShrink: 0 }}>
          <h3 style={{ margin: 0, font: "600 20px 'Fredoka'", color: '#1F2933' }}>Notifications</h3>
          {notifs.length > 0 && (
            <button onClick={onClearAll} style={{ fontSize: 13, fontWeight: 700, color: '#FF6B4A', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              Clear all
            </button>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 32px' }} className="no-scrollbar">
          {notifs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 24px' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🔔</div>
              <p style={{ margin: '0 0 6px', font: "600 16px 'Fredoka'", color: '#1F2933' }}>All caught up</p>
              <p style={{ margin: 0, fontSize: 13.5, color: '#9A9087' }}>Activity on your plans will show up here.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {notifs.map(n => (
                <div
                  key={n.id}
                  onClick={() => {
                    if (n.kind === 'request') { onClose(); onOpenFriends?.() }
                    else if (n.plan_id) { onClose(); onOpenPlan?.(n.plan_id) }
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: n.read ? '#F5F0EB' : '#FFF0EC',
                    border: `1px solid ${n.read ? '#EBE4DC' : '#FFD5C8'}`,
                    borderRadius: 14, padding: '10px 13px',
                    cursor: (n.kind === 'request' || n.plan_id) ? 'pointer' : 'default',
                  }}
                >
                  <KindDot kind={n.kind}/>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: '0 0 2px', fontSize: 13.5, color: '#1F2933', lineHeight: 1.4, fontWeight: n.read ? 400 : 600 }}>
                      {n.body}
                    </p>
                    <span style={{ fontSize: 11.5, color: '#B6ADA4' }}>{relativeTime(n.created_at)}</span>
                  </div>
                  <button
                    onClick={() => onDismiss(n.id)}
                    style={{ width: 24, height: 24, borderRadius: 8, background: n.read ? '#EBE4DC' : '#FFD5C8', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={n.read ? '#9A9087' : '#E14F2E'} strokeWidth="3" strokeLinecap="round">
                      <path d="M18 6 6 18M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const CATEGORY_CONFIG = {
  Coffee:     { gradient: 'linear-gradient(90deg,#F5A623,#F7C05A)', accent: '#C8841A', accentBg: '#FBF0DA', iconType: 'coffee'  },
  Dinner:     { gradient: 'linear-gradient(90deg,#A78BFA,#C4B0FF)', accent: '#A78BFA', accentBg: '#F0EBFF', iconType: 'dinner'  },
  Movies:     { gradient: 'linear-gradient(90deg,#FF6B4A,#FF9A7A)', accent: '#FF6B4A', accentBg: '#FFEFE9', iconType: 'movies'  },
  'Hang out': { gradient: 'linear-gradient(90deg,#EC6A9C,#F28CB8)', accent: '#EC6A9C', accentBg: '#FDEAF3', iconType: 'hangout' },
  Outdoors:   { gradient: 'linear-gradient(90deg,#12B886,#38D3A0)', accent: '#0E9C6B', accentBg: '#E4F6EE', iconType: 'outdoors'},
  Trip:       { gradient: 'linear-gradient(90deg,#5B7CFA,#7C9AFF)', accent: '#5B7CFA', accentBg: '#EAF1FF', iconType: 'trip'    },
}

function smartDateLabel(iso) {
  if (!iso) return null
  const today = new Date(); today.setHours(0,0,0,0)
  const d = new Date(iso); d.setHours(0,0,0,0)
  const diff = Math.round((d - today) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff <= 6) return `In ${diff} days`
  if (diff <= 13) return 'In a week'
  if (diff <= 20) return 'In 2 weeks'
  if (diff <= 45) return 'Next month'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function CategoryIcon({ type, color }) {
  const p = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: '1.8', strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (type === 'movies')  return <svg {...p}><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M6 2v4M18 2v4M2 12h20M7 16h.01M12 16h.01M17 16h.01"/></svg>
  if (type === 'coffee')  return <svg {...p}><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><path d="M6 2v3M10 2v3M14 2v3"/></svg>
  if (type === 'outdoors') return <svg {...p}><path d="M3 17l4-8 4 5 3-4 4 7H3z"/><path d="M12 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" fill={color}/></svg>
  if (type === 'dinner')  return <svg {...p}><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>
  if (type === 'hangout') return <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
  if (type === 'trip')    return <svg {...p}><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21 4 19 2c-2-2-4-2-5.5-.5L10 5 1.8 6.2c-.5.1-.9.6-.8 1.1l1 5c.1.5.5.8 1 .9l2 .4 3-3 1 7c.1.5.5.9 1 1l5 1c.5.1 1-.3 1.1-.8l.4-2-.1-1.4"/></svg>
  return null
}

function CategoryIconBadge({ type, color, bg }) {
  return (
    <div style={{ width: 38, height: 38, borderRadius: 12, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <CategoryIcon type={type} color={color}/>
    </div>
  )
}

// ─── FeedCard ────────────────────────────────────────────────────────────────
function FeedCard({ plan, onOpen, onDelete }) {
  const cat = CATEGORY_CONFIG[plan.vibe]
  const past = plan.starts_at && new Date(plan.starts_at) < new Date(new Date().toDateString())
  const [showDelConfirm, setShowDelConfirm] = useState(false)

  const RSVP_BADGE = {
    going:   { label: "You're in",     color: '#0E9C6B', bg: '#E4F6EE' },
    late:    { label: 'Going, late',   color: '#C8841A', bg: '#FBF0DA' },
    cant:    { label: "Can't make it", color: '#8A94A0', bg: '#EFEBE7' },
    invited: { label: 'Pending',       color: '#8A94A0', bg: '#EFEBE7' },
  }
  const rsvpBadge = !plan.isHost && plan.myRsvp ? (RSVP_BADGE[plan.myRsvp] || RSVP_BADGE.invited) : null
  const dateLabel = smartDateLabel(plan.starts_at)
  const timeStr = plan.starts_at ? new Date(plan.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''

  return (
    <div onClick={onOpen} style={{ background: '#fff', borderRadius: 22, overflow: 'hidden', cursor: 'pointer', boxShadow: '0 4px 22px -10px rgba(20,24,30,.22)', opacity: past ? 0.72 : 1 }}>
      <div style={{ height: 5, background: cat ? cat.gradient : '#EBE4DC', opacity: past ? 0.4 : 1 }}/>
      <div style={{ padding: '16px 17px 17px' }}>

        {/* TOP ROW */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 11 }}>
          {/* LEFT: title + host chip */}
          <div style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
            <div style={{ font: "600 21px 'Fredoka'", color: '#1F2933', marginBottom: 3 }}>{plan.title || 'Untitled'}</div>
            {plan.isHost ? (
              <span style={{ font: "700 11px 'Plus Jakarta Sans'", color: '#E14F2E', background: '#FFE7E0', padding: '4px 9px', borderRadius: 20 }}>Hosting</span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: "600 11px 'Plus Jakarta Sans'", color: '#5B6770', background: '#F2EFEC', padding: '4px 9px', borderRadius: 20 }}>
                <span style={{ width: 16, height: 16, borderRadius: '50%', background: plan.hostColor || '#A78BFA', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', font: "700 8px 'Plus Jakarta Sans'", flexShrink: 0 }}>{plan.hostInitials}</span>
                by {plan.hostName}
              </span>
            )}
          </div>
          {/* RIGHT: trash (host) or rsvp badge, then category icon */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 7, marginTop: 2, flexShrink: 0 }}>
            {plan.isHost && !showDelConfirm ? (
              <div onClick={e => { e.stopPropagation(); setShowDelConfirm(true) }} style={{ padding: '2px 4px', cursor: 'pointer', borderRadius: 8 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E14F2E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
              </div>
            ) : rsvpBadge ? (
              <span style={{ font: "700 11px 'Plus Jakarta Sans'", color: rsvpBadge.color, background: rsvpBadge.bg, padding: '4px 9px', borderRadius: 20 }}>{rsvpBadge.label}</span>
            ) : null}
            {cat && <CategoryIconBadge type={cat.iconType} color={cat.accent} bg={cat.accentBg}/>}
          </div>
        </div>

        {/* host delete confirm */}
        {plan.isHost && showDelConfirm && (
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FEF0EE', border: '1px solid #FAD5CF', borderRadius: 12, padding: '10px 12px', marginBottom: 10 }}>
            <span style={{ flex: 1, fontSize: 13, color: '#E14F2E', fontWeight: 600 }}>Cancel this plan?</span>
            <button onClick={() => onDelete?.()} style={{ background: '#E14F2E', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 9, cursor: 'pointer' }}>Yes</button>
            <button onClick={() => setShowDelConfirm(false)} style={{ background: '#fff', color: '#7B7268', border: '1.5px solid #FAD5CF', fontSize: 12, fontWeight: 600, padding: '7px 10px', borderRadius: 9, cursor: 'pointer' }}>No</button>
          </div>
        )}

        {/* LOCATION */}
        {plan.place_name && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FF6B4A" strokeWidth="2.2" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M12 21s7-6.4 7-11a7 7 0 1 0-14 0c0 4.6 7 11 7 11z"/><circle cx="12" cy="10" r="2.2"/></svg>
            <span style={{ font: "600 16px 'Fredoka'", color: '#1F2933' }}>{plan.place_name}</span>
          </div>
        )}

        {/* DATE */}
        {dateLabel && (
          <div style={{ fontSize: 13, color: '#7B7268', marginBottom: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF6B4A" strokeWidth="2" strokeLinecap="round"><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>
            <b style={{ color: '#1F2933' }}>{dateLabel}</b>{timeStr && <> · {timeStr}</>}
          </div>
        )}

        {/* STATUS PILLS */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {plan.goingCount > 0 && <span style={{ font: "700 11.5px 'Plus Jakarta Sans'", color: '#0E9C6B', background: '#E4F6EE', padding: '4px 10px', borderRadius: 20 }}>{plan.goingCount} going</span>}
          {plan.lateCount  > 0 && <span style={{ font: "700 11.5px 'Plus Jakarta Sans'", color: '#C8841A', background: '#FBF0DA', padding: '4px 10px', borderRadius: 20 }}>{plan.lateCount} late</span>}
          {plan.cantCount  > 0 && <span style={{ font: "700 11.5px 'Plus Jakarta Sans'", color: '#8A94A0', background: '#EFEBE7', padding: '4px 10px', borderRadius: 20 }}>{plan.cantCount} can't</span>}
        </div>
      </div>
    </div>
  )
}

// ─── HomeScreen ──────────────────────────────────────────────────────────────
export default function HomeScreen({ session, refreshTrigger, onStartCreate, onGoFriends, onOpenPlan, onOpenAddFriend, requestCount }) {
  const [profile, setProfile]         = useState(null)
  const [circles, setCircles]         = useState([])
  const [feed, setFeed]               = useState([])
  const [loading, setLoading]         = useState(true)
  const [createCircleOpen, setCreateCircleOpen] = useState(false)
  const [viewCircle, setViewCircle] = useState(null) // { id, name, color }
  const [circleMembers, setCircleMembers] = useState([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [viewMemberId, setViewMemberId] = useState(null)
  const [notifs, setNotifs]     = useState([])
  const [showSheet, setShowSheet] = useState(false)
  const pushOn = getPref('notif_push', false)
  const subRef = useRef(null)

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  const unreadCount = notifs.filter(n => !n.read).length

  useEffect(() => {
    if (!session || refreshTrigger === 0) return
    loadData()
  }, [refreshTrigger])

  useEffect(() => {
    if (!session) return
    loadData()
    loadNotifs()

    // realtime: new notifications + new plan invites
    subRef.current = supabase
      .channel('home-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `recipient=eq.${session.user.id}`,
      }, payload => {
        setNotifs(prev => [payload.new, ...prev])
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'plan_invitees',
        filter: `invitee=eq.${session.user.id}`,
      }, () => { loadFeed() })
      .subscribe()

    return () => { subRef.current?.unsubscribe() }
  }, [session])

  async function loadNotifs() {
    const { data } = await supabase
      .from('notifications')
      .select('id, kind, body, read, created_at, plan_id')
      .eq('recipient', session.user.id)
      .order('created_at', { ascending: false })
      .limit(50)
    // preserve any locally-marked-as-read state to avoid re-appearing on remount
    setNotifs(prev => {
      const alreadyRead = new Set(prev.filter(n => n.read).map(n => n.id))
      return (data || []).map(n => alreadyRead.has(n.id) ? { ...n, read: true } : n)
    })
  }

  async function openSheet() {
    setShowSheet(true)
    const unreadIds = notifs.filter(n => !n.read).map(n => n.id)
    if (unreadIds.length) {
      setNotifs(prev => prev.map(n => ({ ...n, read: true })))
      await supabase.from('notifications').update({ read: true }).in('id', unreadIds)
    }
  }

  async function clearAll() {
    await supabase.from('notifications').delete().eq('recipient', session.user.id)
    setNotifs([])
  }

  async function dismissOne(id) {
    await supabase.from('notifications').delete().eq('id', id)
    setNotifs(prev => prev.filter(n => n.id !== id))
  }

  async function loadData() {
    setLoading(true)
    await Promise.all([loadProfile(), loadCircles(), loadFeed()])
    setLoading(false)
  }

  async function loadProfile() {
    const { data } = await supabase
      .from('profiles')
      .select('first_name, last_name, username, avatar_color')
      .eq('id', session.user.id)
      .single()
    if (data) setProfile(data)
  }

  async function loadCircles() {
    const { data: groups } = await supabase
      .from('groups')
      .select('id, name, color')
      .eq('owner', session.user.id)
      .order('created_at')

    if (!groups?.length) { setCircles([]); return }

    const { data: friendships } = await supabase
      .from('friendships')
      .select('requester, addressee')
      .or(`requester.eq.${session.user.id},addressee.eq.${session.user.id}`)
      .eq('status', 'accepted')
    const friendIds = new Set((friendships || []).map(f => f.requester === session.user.id ? f.addressee : f.requester))

    const { data: members } = await supabase
      .from('group_members')
      .select('group_id, member')
      .in('group_id', groups.map(g => g.id))

    const counts = {}
    members?.forEach(m => {
      if (friendIds.has(m.member)) counts[m.group_id] = (counts[m.group_id] || 0) + 1
    })

    setCircles(groups.map((g, i) => ({
      ...g,
      color: g.color || CIRCLE_COLORS[i % CIRCLE_COLORS.length],
      count: counts[g.id] || 0,
    })))
  }

  async function loadCircleMembers(circleId) {
    setLoadingMembers(true)
    const { data: members } = await supabase
      .from('group_members')
      .select('member')
      .eq('group_id', circleId)
    if (!members?.length) { setCircleMembers([]); setLoadingMembers(false); return }
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, username, avatar_color')
      .in('id', members.map(m => m.member))
    setCircleMembers((profiles || []).map(p => ({
      ...p,
      name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.username,
    })))
    setLoadingMembers(false)
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
        .eq('host', session.user.id).eq('cancelled', false).gte('starts_at', now).order('starts_at').limit(10),
      inviteePlanIds.length
        ? supabase.from('plans').select('id, title, place_name, starts_at, host, vibe')
            .in('id', inviteePlanIds).eq('cancelled', false).gte('starts_at', now).order('starts_at').limit(10)
        : Promise.resolve({ data: [] }),
      friendIds.length
        ? supabase.from('plans').select('id, title, place_name, starts_at, host, vibe')
            .in('host', friendIds).eq('cancelled', false).gte('starts_at', now).order('starts_at').limit(10)
        : Promise.resolve({ data: [] }),
    ])

    const allPlans = [...(hostedPlans || []), ...(invitedPlans || []), ...(friendPlans || [])]
    const seen = new Set()
    const unique = allPlans.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true })
    unique.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))

    if (!unique.length) { setFeed([]); return }

    const hostIds = [...new Set(unique.map(p => p.host))]
    const { data: hostProfiles } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, avatar_color')
      .in('id', hostIds)

    const hostMap = {}
    hostProfiles?.forEach(p => { hostMap[p.id] = p })

    const { data: rsvps } = await supabase
      .from('plan_invitees')
      .select('plan_id, rsvp')
      .in('plan_id', unique.map(p => p.id))

    const rsvpByPlan = {}
    rsvps?.forEach(r => {
      if (!rsvpByPlan[r.plan_id]) rsvpByPlan[r.plan_id] = []
      rsvpByPlan[r.plan_id].push(r)
    })

    setFeed(unique.slice(0, 5).map(plan => {
      const host = hostMap[plan.host]
      const hostName = host ? `${host.first_name || ''} ${host.last_name || ''}`.trim() : 'Someone'
      const isHost = plan.host === session.user.id
      const planRsvps = rsvpByPlan[plan.id] || []
      const goingCount = planRsvps.filter(r => r.rsvp === 'going').length + (isHost ? 1 : 0)
      const lateCount = planRsvps.filter(r => r.rsvp === 'late').length
      const cantCount = planRsvps.filter(r => r.rsvp === 'cant').length
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
      }
    }))
  }

  async function deletePlan(planId) {
    await supabase.from('plans').update({ cancelled: true }).eq('id', planId)
    setFeed(f => f.filter(p => p.id !== planId))
  }

  const greeting = profile?.first_name
    ? `Hey, ${profile.first_name}`
    : session.user.email?.split('@')[0]
      ? `Hey, ${session.user.email.split('@')[0]}`
      : 'Hey there'

  return (
    <div className="fade-up" style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 22px 24px' }}>

        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '6px 0 18px' }}>
          <div>
            <p style={{ margin: 0, fontSize: 13, color: '#9A9087' }}>{today}</p>
            <h2 style={{ margin: '2px 0 0', font: "600 25px 'Fredoka'", color: '#1F2933' }}>{greeting}</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* notifications bell */}
            <div
              onClick={openSheet}
              style={{
                position: 'relative', width: 46, height: 46, borderRadius: 14,
                background: '#fff', border: `1px solid ${unreadCount > 0 ? '#FFD5C8' : '#F1E8E2'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', boxShadow: '0 6px 16px -10px rgba(20,24,30,.3)',
              }}
            >
              <BellIcon active={unreadCount > 0}/>
              {unreadCount > 0 && (
                <div style={{
                  position: 'absolute', top: -4, right: -4,
                  minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9,
                  background: '#FF6B4A', border: '2px solid #FBF7F4',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', font: "700 10px 'Plus Jakarta Sans'",
                }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </div>
              )}
            </div>
            {/* add friend */}
            <div
              onClick={onOpenAddFriend}
              style={{
                position: 'relative', width: 46, height: 46, borderRadius: 14,
                background: '#fff', border: '1px solid #F1E8E2',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', boxShadow: '0 6px 16px -10px rgba(20,24,30,.3)',
              }}
            >
              <AddFriendIcon/>
              {requestCount > 0 && (
                <div style={{
                  position: 'absolute', top: -4, right: -4,
                  minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9,
                  background: '#FF6B4A', border: '2px solid #FBF7F4',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', font: "700 10px 'Plus Jakarta Sans'",
                }}>
                  {requestCount}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Let's Meet CTA */}
        <button
          onClick={onStartCreate}
          style={{
            position: 'relative', width: '100%', border: 'none', borderRadius: 24,
            padding: 22, background: 'linear-gradient(120deg,#FF6B4A,#FF8A5B)',
            color: '#fff', cursor: 'pointer', textAlign: 'left', overflow: 'hidden',
            boxShadow: '0 16px 32px -14px rgba(255,107,74,.8)',
          }}
        >
          <div style={{ position: 'absolute', right: -20, top: -20, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,.13)' }}/>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
            <div>
              <div style={{ font: "600 24px 'Fredoka'" }}>Let's Meet</div>
              <div style={{ fontSize: 14, opacity: .92, marginTop: 3 }}>Start a plan in seconds</div>
            </div>
            <div style={{
              width: 54, height: 54, borderRadius: '50%',
              background: 'rgba(255,255,255,.22)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <PlusIcon/>
            </div>
          </div>
        </button>

        {/* circles */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '26px 0 13px' }}>
          <h3 style={{ margin: 0, font: "600 18px 'Fredoka'", color: '#1F2933' }}>Your circles</h3>
          <span onClick={onGoFriends} style={{ fontSize: 13, fontWeight: 600, color: '#FF6B4A', cursor: 'pointer' }}>See all</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', gap: 11, overflow: 'hidden' }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ flexShrink: 0, width: 120, height: 56, borderRadius: 16, background: '#F1E8E2' }}/>
            ))}
          </div>
        ) : circles.length === 0 ? (
          <div
            onClick={() => setCreateCircleOpen(true)}
            style={{
              background: '#fff', border: '1.5px dashed #E7DED7', borderRadius: 16,
              padding: '14px 16px', cursor: 'pointer', textAlign: 'center',
              color: '#9A9087', fontSize: 13.5, fontWeight: 600,
            }}
          >
            + Create your first circle
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 11, overflowX: 'auto', margin: '0 -22px', padding: '2px 22px 4px' }}>
            {circles.map(c => (
              <div key={c.id} onClick={() => { setViewCircle(c); loadCircleMembers(c.id) }} style={{
                flexShrink: 0, display: 'flex', alignItems: 'center', gap: 9,
                padding: '11px 16px 11px 12px', background: '#fff',
                border: '1px solid #F1E8E2', borderRadius: 16,
                boxShadow: '0 6px 16px -12px rgba(20,24,30,.3)', cursor: 'pointer',
              }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: c.color, opacity: .16 }}/>
                <div>
                  <div style={{ font: "600 14px 'Plus Jakarta Sans'", color: '#1F2933', whiteSpace: 'nowrap' }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: '#9A9087' }}>{c.count} {c.count === 1 ? 'person' : 'people'}</div>
                </div>
              </div>
            ))}
            <div
              onClick={() => setCreateCircleOpen(true)}
              style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7, padding: '11px 16px', background: '#fff', border: '1.5px dashed #E7DED7', borderRadius: 16, cursor: 'pointer' }}
            >
              <span style={{ font: "600 13.5px 'Plus Jakarta Sans'", color: '#9A9087', whiteSpace: 'nowrap' }}>+ New</span>
            </div>
          </div>
        )}

        {/* feed */}
        <h3 style={{ margin: '26px 0 13px', font: "600 18px 'Fredoka'", color: '#1F2933' }}>
          Happening in your circles
        </h3>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[1,2].map(i => (
              <div key={i} style={{ height: 130, borderRadius: 22, background: '#F1E8E2' }}/>
            ))}
          </div>
        ) : feed.length === 0 ? (
          <div style={{
            background: '#fff', border: '1px solid #F1E8E2', borderRadius: 22,
            padding: '28px 20px', textAlign: 'center',
          }}>
            <p style={{ margin: '0 0 4px', font: "600 16px 'Fredoka'", color: '#1F2933' }}>No plans yet</p>
            <p style={{ margin: 0, fontSize: 13.5, color: '#9A9087', lineHeight: 1.5 }}>
              Tap <b style={{ color: '#FF6B4A' }}>Let's Meet</b> to start one.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {feed.map(plan => (
              <FeedCard key={plan.id} plan={plan} onOpen={() => onOpenPlan(plan.id)} onDelete={() => deletePlan(plan.id)} />
            ))}
          </div>
        )}
      </div>

      {/* notifications sheet */}
      {showSheet && (
        <NotificationsSheet
          notifs={notifs}
          onClose={() => setShowSheet(false)}
          onClearAll={clearAll}
          onDismiss={dismissOne}
          onOpenPlan={onOpenPlan}
          onOpenFriends={onGoFriends}
        />
      )}

      {viewCircle && (
        <div onClick={() => setViewCircle(null)} style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(20,24,30,.45)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} className="sheet-up" style={{ background: '#FBF7F4', borderRadius: '28px 28px 0 0', maxHeight: '80%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ width: 42, height: 5, borderRadius: 5, background: '#E0D7CF', margin: '12px auto 0', flexShrink: 0 }}/>
            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px 32px' }} className="no-scrollbar">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <div style={{ width: 14, height: 14, borderRadius: '50%', background: viewCircle.color, flexShrink: 0 }}/>
                <h3 style={{ margin: 0, font: "600 22px 'Fredoka'", color: '#1F2933' }}>{viewCircle.name}</h3>
              </div>
              {loadingMembers ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                  <div className="spin" style={{ width: 24, height: 24, borderRadius: '50%', border: '3px solid #F0E5DE', borderTopColor: '#FF6B4A' }}/>
                </div>
              ) : circleMembers.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#9A9087', fontSize: 14, padding: '20px 0' }}>No friends in this circle yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {circleMembers.map(m => (
                    <div key={m.id} onClick={() => setViewMemberId(m.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid #F1E8E2', borderRadius: 15, padding: '12px 14px', cursor: 'pointer' }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: m.avatar_color || '#A78BFA', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ color: '#fff', font: "700 14px 'Plus Jakarta Sans'" }}>{m.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'}</span>
                      </div>
                      <div>
                        <div style={{ font: "600 15px 'Plus Jakarta Sans'", color: '#1F2933' }}>{m.name}</div>
                        {m.username && <div style={{ fontSize: 12.5, color: '#9A9087' }}>@{m.username}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {viewMemberId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9100 }}>
          <UserProfileSheet userId={viewMemberId} myId={session.user.id} onClose={() => setViewMemberId(null)} />
        </div>
      )}

      {createCircleOpen && (
        <CreateCircleSheet
          session={session}
          onClose={() => setCreateCircleOpen(false)}
          onCreated={() => { setCreateCircleOpen(false); loadCircles() }}
        />
      )}
    </div>
  )
}
