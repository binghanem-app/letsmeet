import { useEffect, Fragment, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import Avatar from '../components/Avatar'
import UserProfileSheet from '../components/UserProfileSheet'
import PlanCard from '../components/PlanCard'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'

const GAPI_KEY = import.meta.env.VITE_GAPI_KEY

// ─── Minimal place search for Edit sheet ─────────────────────────────────────
function PlaceSearchMini({ value, onChange }) {
  const [query, setQuery] = useState(value?.name || '')
  const [results, setResults] = useState([])
  const debounce = useRef(null)
  const isSelected = !!(value?.name && query === value.name)

  function handleType(q) {
    setQuery(q)
    if (isSelected && q !== value.name) onChange(null)
    clearTimeout(debounce.current)
    if (!q.trim()) { setResults([]); return }
    debounce.current = setTimeout(() => search(q), 400)
  }

  async function search(q) {
    try {
      const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GAPI_KEY, 'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location' },
        body: JSON.stringify({ textQuery: q }),
      })
      const data = await res.json()
      setResults((data.places || []).slice(0, 5).map(p => ({
        name: p.displayName?.text,
        address: p.formattedAddress,
        lat: p.location?.latitude,
        lng: p.location?.longitude,
      })))
    } catch { setResults([]) }
  }

  function pick(p) { setQuery(p.name); setResults([]); onChange(p) }
  function clear() { setQuery(''); setResults([]); onChange(null) }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1.5px solid #EBE2DB', borderRadius: 14, padding: '4px 14px', marginBottom: results.length ? 0 : 14 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#B6ADA4" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3-3"/></svg>
        <input value={query} onChange={e => handleType(e.target.value)} placeholder="Search a place…"
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', font: "500 16px -apple-system", color: '#1F2933', padding: '10px 0' }}/>
        {query && <span onClick={clear} style={{ fontSize: 19, color: '#C4BBB2', cursor: 'pointer', lineHeight: 1 }}>×</span>}
      </div>
      {results.length > 0 && !isSelected && (
        <div style={{ background: '#fff', border: '1px solid #F1E8E2', borderRadius: 14, marginBottom: 14, overflow: 'hidden' }}>
          {results.map((p, i) => (
            <div key={i} onClick={() => pick(p)} style={{ padding: '11px 14px', borderBottom: i < results.length - 1 ? '1px solid #F5F0EB' : 'none', cursor: 'pointer' }}>
              <div style={{ font: "600 14px -apple-system", color: '#1F2933' }}>{p.name}</div>
              <div style={{ fontSize: 12, color: '#9A9087', marginTop: 2 }}>{p.address}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Edit plan sheet ──────────────────────────────────────────────────────────
function EditPlanSheet({ plan, onClose, onSaved, onDelete }) {
  const BASE_TIMES = ['Morning','Noon','Afternoon','Evening','Night','Late night',
    '8:00 AM','9:00 AM','10:00 AM','11:00 AM','12:00 PM','1:00 PM','2:00 PM',
    '3:00 PM','4:00 PM','5:00 PM','6:00 PM','7:00 PM','8:00 PM','9:00 PM','10:00 PM']
  const existingTime = plan.time_label && !BASE_TIMES.includes(plan.time_label) ? plan.time_label : null
  const TIMES = existingTime ? [existingTime, ...BASE_TIMES] : BASE_TIMES

  const [date, setDate]         = useState(plan.date ? plan.date.slice(0, 10) : '')
  const [timeLabel, setTimeLabel] = useState(plan.time_label || '')
  const [place, setPlace]       = useState(plan.place ? { name: plan.place, address: plan.place_address, lat: plan.place_lat, lng: plan.place_lng } : null)
  const [saving, setSaving]           = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  async function save() {
    setSaving(true)

    const oldDateStr = plan.date ? plan.date.slice(0, 10) : ''
    const timeChanged = date !== oldDateStr || timeLabel !== (plan.time_label || '')

    // Build a full timestamp from the picked date, preserving the original
    // time-of-day. Writing the bare "YYYY-MM-DD" string would be parsed as UTC
    // midnight and render as the previous day in negative-offset timezones.
    let startsAtIso = null
    if (date) {
      const d = new Date(date + 'T12:00:00') // local noon baseline (no day-shift)
      const orig = plan.date ? new Date(plan.date) : null
      if (orig && !isNaN(orig.getTime())) d.setHours(orig.getHours(), orig.getMinutes(), orig.getSeconds(), 0)
      startsAtIso = d.toISOString()
    }

    await supabase.from('plans').update({
      starts_at: startsAtIso,
      time_label: timeLabel || null,
    }).eq('id', plan.id)

    if (timeChanged) {
      const { data: invitees } = await supabase
        .from('plan_invitees').select('invitee').eq('plan_id', plan.id)
      if (invitees?.length) {
        const { data: hp } = await supabase.from('profiles')
          .select('first_name, last_name').eq('id', plan.host).single()
        const hostName = hp ? `${hp.first_name || ''} ${hp.last_name || ''}`.trim() || 'The host' : 'The host'
        await supabase.from('notifications').insert(
          invitees.map(i => ({
            recipient: i.invitee,
            actor: plan.host,
            kind: 'plan_update',
            plan_id: plan.id,
            body: `${hostName} updated the time for "${plan.title}"`,
          }))
        )
      }
    }

    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(20,24,30,.45)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} className="sheet-up" style={{ background: '#FBF7F4', borderRadius: '28px 28px 0 0', maxHeight: '88%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ width: 42, height: 5, borderRadius: 5, background: '#E0D7CF', margin: '12px auto 0', flexShrink: 0 }}/>
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px 32px' }} className="no-scrollbar">
          <h3 style={{ margin: '0 0 18px', font: "600 22px -apple-system", color: '#1F2933' }}>Edit plan</h3>

          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: '0 0 calc(50% - 6px)', minWidth: 0, overflow: 'hidden' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#B6ADA4', letterSpacing: .7, marginBottom: 7 }}>DATE</div>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                style={{ width: '100%', border: '1.5px solid #EBE2DB', borderRadius: 14, padding: '13px 8px', fontSize: 13, color: '#1F2933', background: '#fff', outline: 'none', boxSizing: 'border-box' }}/>
            </div>
            <div style={{ flex: '0 0 calc(50% - 6px)', minWidth: 0, overflow: 'hidden' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#B6ADA4', letterSpacing: .7, marginBottom: 7 }}>TIME</div>
              <select value={timeLabel} onChange={e => setTimeLabel(e.target.value)}
                style={{ width: '100%', border: '1.5px solid #EBE2DB', borderRadius: 14, padding: '13px 8px', fontSize: 13, color: timeLabel ? '#1F2933' : '#B6ADA4', background: '#fff', outline: 'none', appearance: 'none', boxSizing: 'border-box' }}>
                <option value="">No time</option>
                {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <button onClick={save} disabled={saving}
            style={{ width: '100%', padding: 15, border: 'none', borderRadius: 16, background: saving ? '#E7DED7' : '#FF6B4A', color: '#fff', font: "600 16px -apple-system", cursor: saving ? 'default' : 'pointer', boxShadow: saving ? 'none' : '0 10px 22px -8px rgba(255,107,74,.7)', transition: 'all .2s' }}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>

          {onDelete && (
            showCancelConfirm ? (
              <div style={{ marginTop: 14, background: '#FEF0EE', border: '1px solid #FAD5CF', borderRadius: 13, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ flex: 1, fontSize: 13, color: '#E14F2E', fontWeight: 600 }}>Cancel this plan? Everyone will be notified.</span>
                <button onClick={() => { onClose(); onDelete() }} style={{ background: '#E14F2E', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, padding: '8px 13px', borderRadius: 10, cursor: 'pointer', flexShrink: 0 }}>Confirm</button>
                <button onClick={() => setShowCancelConfirm(false)} style={{ background: '#fff', color: '#7B7268', border: '1.5px solid #FAD5CF', fontSize: 12, fontWeight: 600, padding: '8px 12px', borderRadius: 10, cursor: 'pointer', flexShrink: 0 }}>Keep</button>
              </div>
            ) : (
              <button onClick={() => setShowCancelConfirm(true)}
                style={{ marginTop: 12, width: '100%', padding: '11px', border: '1px solid #FAD5CF', borderRadius: 16, background: '#FEF0EE', color: '#E14F2E', font: "600 16px -apple-system", cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#E14F2E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
                Cancel this plan…
              </button>
            )
          )}
        </div>
      </div>
    </div>
  )
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function initials(name = '') {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2)
}
function friendlyDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`
}
function shortDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[d.getMonth()]} ${d.getDate()}`
}
function relativeLabel(iso) {
  if (!iso) return null
  const today = new Date(); today.setHours(0,0,0,0)
  const target = new Date(iso); target.setHours(0,0,0,0)
  const days = Math.round((target - today) / 86400000)
  if (days < 0)   return null
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days < 7)   return `In ${days} days`
  if (days < 14)  return 'In a week'
  const weeks = Math.round(days / 7)
  if (weeks < 5)  return `In ${weeks} weeks`
  const months = Math.round(days / 30)
  return `In ${months} month${months === 1 ? '' : 's'}`
}
function shortAddr(addr) {
  if (!addr) return ''
  const parts = addr.split(',')
  return parts.slice(1, 3).map(s => s.trim()).filter(Boolean).join(', ') || parts[0]?.trim() || ''
}
function isPast(iso) {
  if (!iso) return false
  return new Date(iso) < new Date(new Date().toDateString())
}
function fmtTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
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

function CategoryIcon({ type, color = '#1F2933', size = 22 }) {
  const s = { width: size, height: size, fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (type === 'coffee')   return <svg viewBox="0 0 24 24" style={s}><path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><path d="M6 2v2M10 2v2M14 2v2"/></svg>
  if (type === 'dinner')   return <svg viewBox="0 0 24 24" style={s}><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>
  if (type === 'movies')   return <svg viewBox="0 0 24 24" style={s}><rect x="2" y="2" width="20" height="20" rx="2.18"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5"/></svg>
  if (type === 'hangout')  return <svg viewBox="0 0 24 24" style={s}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
  if (type === 'outdoors') return <svg viewBox="0 0 24 24" style={s}><path d="M3 20h18M8 20V9l4-6 4 6v11"/><path d="M12 14h.01"/></svg>
  if (type === 'trip')     return <svg viewBox="0 0 24 24" style={s}><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21 4 19 2c-2-2-4-2-5.5-.5L10 5 1.8 6.2c-.5.1-.8.5-.6.9l2 4c.2.4.6.6 1 .4l2.5-1.2 2.7 2.7-1.2 2.5c-.2.4 0 .8.4 1l4 2c.4.2.8.1.9-.4Z"/></svg>
  return null
}

function CategoryIconBadge({ type, color, bg }) {
  return (
    <div style={{ width: 38, height: 38, borderRadius: 12, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <CategoryIcon type={type} color={color}/>
    </div>
  )
}

const RSVP_CFG = [
  {
    val: 'going', label: 'Going',
    color: '#0E9C6B', bg: '#E4F6EE', border: '#A8DFC5', iconBg: '#C2EDDA', shadow: 'rgba(14,156,107,.25)',
    icon: (active) => (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={active ? '#0E9C6B' : '#B6ADA4'} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="m5 13 4 4L19 7"/>
      </svg>
    ),
  },
  {
    val: 'late', label: 'Late',
    color: '#E8922A', bg: '#FFF4E3', border: '#FFD08A', iconBg: '#FFE2A8', shadow: 'rgba(232,146,42,.25)',
    icon: (active) => (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={active ? '#E8922A' : '#B6ADA4'} strokeWidth="2.5" strokeLinecap="round">
        <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>
      </svg>
    ),
  },
  {
    val: 'cant', label: "Can't",
    color: '#E14F2E', bg: '#FEE9E9', border: '#F9B8B0', iconBg: '#FAC8C0', shadow: 'rgba(225,79,46,.25)',
    icon: (active) => (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={active ? '#E14F2E' : '#B6ADA4'} strokeWidth="2.8" strokeLinecap="round">
        <path d="m18 6-12 12M6 6l12 12"/>
      </svg>
    ),
  },
]
const PILL = {
  going:   { label: 'Going',   color: '#0E9C6B', bg: '#E4F6EE' },
  late:    { label: 'Late',    color: '#E8922A', bg: '#FFF4E3' },
  cant:    { label: "Can't",   color: '#E14F2E', bg: '#FEE9E9' },
  invited: { label: 'Invited', color: '#9A9087', bg: '#F5F2EE' },
}

// ─── RSVP buttons ─────────────────────────────────────────────────────────────
function RsvpButtons({ current, onChange, saving }) {
  return (
    <div style={{ display: 'flex', gap: 9 }}>
      {RSVP_CFG.map(opt => {
        const sel = current === opt.val
        return (
          <button
            key={opt.val}
            onClick={() => onChange(opt.val)}
            disabled={saving}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
              padding: '13px 6px 12px', borderRadius: 16,
              border: `1.5px solid ${sel ? opt.border : '#F1E8E2'}`,
              background: sel ? opt.bg : '#fff',
              cursor: saving ? 'default' : 'pointer',
              transition: 'all .15s',
              boxShadow: sel ? `0 4px 14px -4px ${opt.shadow}` : 'none',
            }}
          >
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
              background: sel ? opt.iconBg : '#F5F2EE',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background .15s',
            }}>
              {opt.icon(sel)}
            </div>
            <span style={{ font: "600 13px -apple-system", color: sel ? opt.color : '#9A9087', transition: 'color .15s' }}>
              {opt.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ─── Attendee row ─────────────────────────────────────────────────────────────
function AttendeeRow({ name, color, avatarUrl, pill, onTap }) {
  return (
    <div onClick={onTap} style={{ display: 'flex', alignItems: 'center', gap: 11, cursor: onTap ? 'pointer' : 'default', borderRadius: 12, padding: '2px 0' }}>
      <Avatar url={avatarUrl} name={name} color={color} size={38}/>
      <span style={{ flex: 1, font: "600 14px -apple-system", color: '#1F2933' }}>{name || 'Unknown'}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: pill.color, background: pill.bg, borderRadius: 20, padding: '3px 10px', flexShrink: 0 }}>{pill.label}</span>
    </div>
  )
}

// ─── Invite more sheet ───────────────────────────────────────────────────────
function InviteMoreSheet({ plan, myId, onClose, onDone }) {
  const [friends, setFriends] = useState([])
  const [selected, setSelected] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  const alreadyIn = new Set([plan.host, ...(plan.invitees || []).map(i => i.invitee)])

  useEffect(() => { loadFriends() }, [])

  async function loadFriends() {
    const { data: fs } = await supabase
      .from('friendships')
      .select('requester, addressee')
      .or(`requester.eq.${myId},addressee.eq.${myId}`)
      .eq('status', 'accepted')
    const fIds = (fs || []).map(f => f.requester === myId ? f.addressee : f.requester).filter(id => !alreadyIn.has(id))
    if (!fIds.length) { setLoading(false); return }
    const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name, username, avatar_color, avatar_url').in('id', fIds)
    setFriends((profiles || []).map(p => ({ ...p, displayName: `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.username || 'Unknown' })))
    setLoading(false)
  }

  function toggle(id) { setSelected(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]) }

  async function confirm() {
    if (!selected.length) return
    setSending(true)
    await supabase.from('plan_invitees').insert(selected.map(uid => ({ plan_id: plan.id, invitee: uid, rsvp: 'invited' })))
    const { data: hp } = await supabase.from('profiles').select('first_name, last_name, username').eq('id', myId).single()
    const hostName = hp ? (`${hp.first_name || ''} ${hp.last_name || ''}`.trim() || hp.username || 'Someone') : 'Someone'
    // Each invitee may have set a private nickname for the inviter — prefer it.
    const { data: nicks } = await supabase
      .from('friend_nicknames')
      .select('user_id, nickname')
      .eq('friend_id', myId)
      .in('user_id', selected)
    const nickFor = {}; (nicks || []).forEach(n => { nickFor[n.user_id] = n.nickname })
    // Show the place (Google Maps pick or typed name), falling back to the title.
    const placeLabel = plan.place_name || plan.place || plan.title
    await supabase.from('notifications').insert(
      selected.map(uid => ({ recipient: uid, actor: myId, kind: 'invite', plan_id: plan.id, body: `${nickFor[uid] || hostName} invited you to "${placeLabel}"` }))
    )
    selected.forEach(uid => {
      supabase.channel(`user-home-${uid}`).send({ type: 'broadcast', event: 'plan_invite', payload: { plan_id: plan.id } })
    })
    setSending(false)
    onDone()
    onClose()
  }

  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(20,24,30,.45)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} className="sheet-up" style={{ background: '#FBF7F4', borderRadius: '28px 28px 0 0', maxHeight: '75%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ width: 42, height: 5, borderRadius: 5, background: '#E0D7CF', margin: '12px auto 0', flexShrink: 0 }}/>
        <div style={{ padding: '16px 20px 12px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, font: "600 22px -apple-system", color: '#1F2933' }}>Invite more</h3>
          {selected.length > 0 && <span style={{ fontSize: 12.5, fontWeight: 700, color: '#FF6B4A', background: '#FFF1EC', borderRadius: 20, padding: '4px 12px' }}>{selected.length} selected</span>}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 16px' }} className="no-scrollbar">
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {[1,2,3].map(i => <div key={i} style={{ height: 58, borderRadius: 14, background: '#F1E8E2' }}/>)}
            </div>
          ) : friends.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '28px 0', fontSize: 13.5, color: '#9A9087' }}>All your friends are already invited!</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {friends.map(f => {
                const sel = selected.includes(f.id)
                return (
                  <div key={f.id} onClick={() => toggle(f.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, background: sel ? '#FFF1EC' : '#fff', border: `1.5px solid ${sel ? '#FF6B4A' : '#F1E8E2'}`, borderRadius: 14, padding: '11px 14px', cursor: 'pointer' }}>
                    <Avatar url={f.avatar_url} name={f.displayName} color={f.avatar_color} size={38} />
                    <span style={{ flex: 1, font: "600 14.5px -apple-system", color: sel ? '#FF6B4A' : '#1F2933' }}>{f.displayName}</span>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: sel ? '#FF6B4A' : '#F5F2EE', border: `2px solid ${sel ? '#FF6B4A' : '#E7DED7'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {sel && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L19 7"/></svg>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <div style={{ padding: '12px 20px 24px', flexShrink: 0, borderTop: '1px solid #F1E8E2' }}>
          <button onClick={confirm} disabled={sending || !selected.length}
            style={{ width: '100%', padding: 15, border: 'none', borderRadius: 16, background: selected.length ? '#FF6B4A' : '#E7DED7', color: '#fff', font: "600 16px -apple-system", cursor: selected.length && !sending ? 'pointer' : 'default', boxShadow: selected.length ? '0 10px 22px -8px rgba(255,107,74,.7)' : 'none', transition: 'all .2s' }}>
            {sending ? 'Sending…' : selected.length ? `Invite ${selected.length} friend${selected.length === 1 ? '' : 's'}` : 'Select friends to invite'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Plan detail — full page ──────────────────────────────────────────────────

function PlanDetail({ plan, myId, onClose, onUpdated, startOnRsvp, onDeletePlan }) {
  const isHost = plan.host === myId
  const myInvite = plan.invitees?.find(i => i.invitee === myId)
  const myRsvp = myInvite?.rsvp || (isHost ? 'going' : 'invited')
  const [rsvp, setRsvp]               = useState(myRsvp)
  const [saving, setSaving]           = useState(false)
  const [showEdit, setShowEdit]       = useState(false)
  const [showInviteMore, setShowInviteMore] = useState(false)
  const [viewUserId, setViewUserId]   = useState(null)
  const [whosInOpen, setWhosInOpen]   = useState(false)
  const [messages, setMessages]       = useState([])
  const [msgProfiles, setMsgProfiles] = useState({})
  const [msgBody, setMsgBody]         = useState('')
  const [msgSending, setMsgSending]   = useState(false)
  const [fullImg, setFullImg]         = useState(null)
  const [reportingMsg, setReportingMsg] = useState(null)
  const [reportDone, setReportDone]   = useState(false)
  const [reportError, setReportError] = useState(false)
  const chatChannelRef = useRef(null)
  // undefined = still loading, null = no read record, string = ISO timestamp
  const [lastReadAt, setLastReadAt]   = useState(undefined)
  // Divider position frozen on first render with data — never moves after that
  const frozenDividerIdx = useRef(-1)
  const [dividerReady, setDividerReady] = useState(false)
  const [dividerVisible, setDividerVisible] = useState(true)
  const chatEndRef       = useRef(null)
  const chatScrollRef    = useRef(null)
  const initialScrollDone = useRef(false)
  const newDividerRef    = useRef(null)
  const lastMsgTimestampRef = useRef(null)
  const fileInputRef = useRef(null)
  const knownSenders = useRef(new Set())
  const blockedIdsRef = useRef(new Set())
  const past = isPast(plan.date)

  // Load the set of users I've blocked or who've blocked me. RLS hides their
  // messages from the DB read, but realtime broadcasts bypass RLS — so we also
  // filter them client-side here (App Store Guideline 1.2 block enforcement).
  useEffect(() => {
    let active = true
    ;(async () => {
      const { data } = await supabase.from('blocks').select('blocker, blocked').or(`blocker.eq.${myId},blocked.eq.${myId}`)
      if (!active) return
      const s = new Set()
      ;(data || []).forEach(b => s.add(b.blocker === myId ? b.blocked : b.blocker))
      blockedIdsRef.current = s
      setMessages(prev => prev.filter(m => !s.has(m.sender)))
    })()
    return () => { active = false }
  }, [myId])

  const going   = plan.invitees?.filter(i => i.rsvp === 'going') || []
  const late    = plan.invitees?.filter(i => i.rsvp === 'late')  || []
  const cant    = plan.invitees?.filter(i => i.rsvp === 'cant')  || []
  const pending = plan.invitees?.filter(i => i.rsvp === 'invited') || []
  const goingCount = going.length + 1

  const mapsUrl = plan.place && plan.place_lat
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(plan.place + (plan.place_address ? ', ' + plan.place_address : ''))}`
    : null

  useEffect(() => {
    // Fetch fresh RSVP in case home screen RSVP is still in flight
    if (!isHost) {
      supabase.from('plan_invitees').select('rsvp')
        .eq('plan_id', plan.id).eq('invitee', myId).single()
        .then(({ data }) => { if (data?.rsvp) setRsvp(data.rsvp) })
    }
    // Get old lastReadAt FIRST, then mark as read — sequential to avoid race condition
    // where upsert commits before select returns and makes all msgs look already-read
    supabase.from('plan_message_reads')
      .select('last_read_at')
      .eq('user_id', myId)
      .eq('plan_id', plan.id)
      .single()
      .then(({ data }) => setLastReadAt(data?.last_read_at || null))
    loadMessages()

    const channel = supabase.channel(`plan-chat-${plan.id}`)
      .on('broadcast', { event: 'new_msg' }, async ({ payload: msg }) => {
        if (!msg?.id || msg.sender === myId || blockedIdsRef.current.has(msg.sender)) return
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
        lastMsgTimestampRef.current = msg.created_at
        setTimeout(() => { if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight }, 80)
        if (!knownSenders.current.has(msg.sender)) {
          knownSenders.current.add(msg.sender)
          const { data: p } = await supabase.from('profiles')
            .select('id, first_name, last_name, avatar_color, avatar_url')
            .eq('id', msg.sender).single()
          if (p) {
            const nickMap = { [plan.host]: plan.hostName }
            ;(plan.invitees || []).forEach(i => { nickMap[i.invitee] = i.name })
            setMsgProfiles(prev => ({
              ...prev,
              [p.id]: { ...p, name: nickMap[p.id] || `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown' },
            }))
          }
        }
      })
      .subscribe()

    chatChannelRef.current = channel
    return () => {
      if (lastMsgTimestampRef.current) {
        supabase.from('plan_message_reads').upsert(
          { user_id: myId, plan_id: plan.id, last_read_at: lastMsgTimestampRef.current },
          { onConflict: 'user_id,plan_id' }
        ).then(() => {})
      }
      supabase.removeChannel(channel)
      chatChannelRef.current = null
    }
  }, [plan.id])

  // Keep lastMsgTimestampRef in sync with the latest message (any sender)
  useEffect(() => {
    if (messages.length) lastMsgTimestampRef.current = messages[messages.length - 1].created_at
  }, [messages])

  // Freeze divider position once lastReadAt is ready (messages may still be empty)
  useEffect(() => {
    if (dividerReady || lastReadAt === undefined) return
    if (messages.length && lastReadAt) {
      frozenDividerIdx.current = messages.findIndex(m => m.sender !== myId && m.created_at > lastReadAt)
    }
    setDividerReady(true)
  }, [messages, lastReadAt, dividerReady])

  // Scroll to NEW divider (or bottom) once divider position is computed
  useEffect(() => {
    if (!dividerReady || initialScrollDone.current) return
    initialScrollDone.current = true
    setTimeout(() => {
      if (!chatScrollRef.current) return
      if (newDividerRef.current) {
        chatScrollRef.current.scrollTop = newDividerRef.current.offsetTop - 20
      } else {
        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
      }
    }, 100)
  }, [dividerReady])

  async function loadMessages() {
    const { data } = await supabase
      .from('plan_messages')
      .select('id, sender, body, photo_url, created_at')
      .eq('plan_id', plan.id)
      .order('created_at', { ascending: true })
    // Defense-in-depth alongside RLS: never show messages from blocked users.
    const visible = (data || []).filter(m => !blockedIdsRef.current.has(m.sender))
    setMessages(visible)
    if (!visible.length) return
    const ids = [...new Set(visible.map(m => m.sender))]
    const { data: profiles } = await supabase
      .from('profiles').select('id, first_name, last_name, avatar_color, avatar_url').in('id', ids)
    // Build nickname map from plan data (already nickname-resolved by the planner)
    const nickMap = { [plan.host]: plan.hostName }
    ;(plan.invitees || []).forEach(i => { nickMap[i.invitee] = i.name })
    const map = {}
    profiles?.forEach(p => {
      map[p.id] = { ...p, name: nickMap[p.id] || `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown' }
      knownSenders.current.add(p.id)
    })
    setMsgProfiles(map)
  }

  async function sendMessage() {
    const body = msgBody.trim()
    if (!body || msgSending) return
    setDividerVisible(false)
    setMsgSending(true)
    setMsgBody('')
    const { data: newMsg, error: msgErr } = await supabase.from('plan_messages').insert({
      plan_id: plan.id, sender: myId, body,
    }).select('id, sender, body, photo_url, created_at').single()
    if (newMsg) {
      setMessages(prev => [...prev, newMsg])
      setTimeout(() => { if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight }, 80)
      chatChannelRef.current?.send({ type: 'broadcast', event: 'new_msg', payload: newMsg })
    }
    if (!msgErr) {
      const recipients = [
        ...(plan.host !== myId ? [plan.host] : []),
        ...(plan.invitees || []).filter(i => i.invitee !== myId).map(i => i.invitee),
      ]
      if (recipients.length) {
        let senderName = msgProfiles[myId]?.name
        if (!senderName) {
          const { data: me } = await supabase.from('profiles').select('first_name, last_name').eq('id', myId).single()
          senderName = me ? `${me.first_name || ''} ${me.last_name || ''}`.trim() || 'Someone' : 'Someone'
        }
        const { error: notifErr } = await supabase.from('notifications').insert(
          recipients.map(uid => ({
            recipient: uid,
            actor: myId,
            kind: 'message',
            plan_id: plan.id,
            body: `${senderName} in "${plan.title}": "${body.length > 50 ? body.slice(0, 50) + '…' : body}"`,
          }))
        )
        if (notifErr) console.error('Message notif insert failed:', notifErr)
        chatChannelRef.current?.send({ type: 'broadcast', event: 'new_chat', payload: { plan_id: plan.id } })
      }
    }
    setMsgSending(false)
  }

  async function uploadAndSendPhoto(src, format) {
    setDividerVisible(false)
    setMsgSending(true)
    try {
      let blob
      if (src.startsWith('data:') || src.startsWith('http') || src.startsWith('https')) {
        // Web file input: data: URL, or standard http URL
        const res = await fetch(src)
        if (!res.ok) { alert(`Fetch failed (${res.status}): ${src}`); setMsgSending(false); return }
        blob = await res.blob()
      } else {
        // Native camera/gallery: raw base64 string — convert directly, no fetch needed
        const binary = atob(src)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        blob = new Blob([bytes], { type: `image/${format || 'jpeg'}` })
      }
      if (!blob?.size) { alert('Empty image data'); setMsgSending(false); return }
      const ext = format || 'jpeg'
      const path = `${plan.id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('chat-images').upload(path, blob, { contentType: `image/${ext}` })
      if (upErr) { alert(`Upload error: ${upErr.message}`); console.error(upErr); setMsgSending(false); return }
      const { data: { publicUrl } } = supabase.storage.from('chat-images').getPublicUrl(path)
      const { data: newMsg } = await supabase.from('plan_messages').insert({
        plan_id: plan.id, sender: myId, photo_url: publicUrl,
      }).select('id, sender, body, photo_url, created_at').single()
      if (newMsg) {
        setMessages(prev => [...prev, newMsg])
        setTimeout(() => { if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight }, 80)
        chatChannelRef.current?.send({ type: 'broadcast', event: 'new_msg', payload: newMsg })
        const recipients = [
          ...(plan.host !== myId ? [plan.host] : []),
          ...(plan.invitees || []).filter(i => i.invitee !== myId).map(i => i.invitee),
        ]
        if (recipients.length) {
          let senderName = msgProfiles[myId]?.name
          if (!senderName) {
            const { data: me } = await supabase.from('profiles').select('first_name, last_name').eq('id', myId).single()
            senderName = me ? `${me.first_name || ''} ${me.last_name || ''}`.trim() || 'Someone' : 'Someone'
          }
          await supabase.from('notifications').insert(
            recipients.map(uid => ({
              recipient: uid,
              actor: myId,
              kind: 'message',
              plan_id: plan.id,
              body: `${senderName} sent a photo in "${plan.title}"`,
            }))
          )
          chatChannelRef.current?.send({ type: 'broadcast', event: 'new_chat', payload: { plan_id: plan.id } })
        }
      }
    } catch (e) {
      alert(`Photo error: ${e?.message || String(e)}`)
      console.error(e)
    }
    setMsgSending(false)
  }

  async function pickAndSendPhoto(source) {
    if (!Capacitor.isNativePlatform()) {
      fileInputRef.current?.click()
      return
    }
    try {
      if (source === CameraSource.Camera) {
        const perm = await Camera.requestPermissions({ permissions: ['camera'] })
        if (perm.camera === 'denied') {
          alert("Camera access was denied. Please go to Settings → Let's Meet and enable Camera.")
          return
        }
      }
      const photo = await Camera.getPhoto({ resultType: CameraResultType.Base64, source, quality: 80, width: 1200 })
      if (!photo.base64String) throw new Error('No image data returned from camera')
      await uploadAndSendPhoto(photo.base64String, photo.format)
    } catch (e) {
      const msg = e?.message || ''
      if (msg === 'User cancelled photos app' || msg === 'User cancelled') return
      console.error('Camera error:', e)
      alert(`Camera error: ${msg || 'Unknown error'}`)
    }
  }

  const [showPhotoSheet, setShowPhotoSheet] = useState(false)

  async function saveRsvp(val) {
    if (val === rsvp || isHost) return
    setSaving(true)
    setRsvp(val)
    if (myInvite) {
      await supabase.from('plan_invitees').update({ rsvp: val })
        .eq('plan_id', plan.id).eq('invitee', myId)
    } else {
      await supabase.from('plan_invitees').insert({ plan_id: plan.id, invitee: myId, rsvp: val })
    }
    if (plan.host !== myId) {
      const { data: me } = await supabase.from('profiles').select('first_name, last_name').eq('id', myId).single()
      const name = me ? `${me.first_name || ''} ${me.last_name || ''}`.trim() || 'Someone' : 'Someone'
      const bodyMap = {
        going: `${name} is going to your ${plan.title}`,
        late:  `${name} is going (a bit late) to your ${plan.title}`,
        cant:  `${name} can't make it to your ${plan.title}`,
      }
      const b = bodyMap[val]
      if (b) {
        const { error } = await supabase.from('notifications').insert({ recipient: plan.host, actor: myId, kind: 'rsvp', plan_id: plan.id, body: b })
        if (error) console.error('RSVP notif insert failed:', error)
      }
    }
    setSaving(false)
    onUpdated?.()
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#EEEAE4' }}>

      {/* ── compact header ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #EFE8E2', flexShrink: 0, padding: '14px 16px 12px' }}>
        {/* Row 1: back + edit */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: '50%', background: '#F2EFEC', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7B7268" strokeWidth="2.4" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          {isHost && !past && (
            <button onClick={() => setShowEdit(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', border: '1.5px solid #E8E2DA', borderRadius: 10, background: '#fff', font: "600 13px -apple-system", color: '#7B7268', cursor: 'pointer' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
              Edit
            </button>
          )}
        </div>
        {/* Row 2: emoji + plan info */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: (CATEGORY_CONFIG[plan.vibe] || { accentBg: '#D0C9C2' }).accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <CategoryIcon type={(CATEGORY_CONFIG[plan.vibe] || {}).iconType} color={(CATEGORY_CONFIG[plan.vibe] || { accent: '#9A9087' }).accent} size={28} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#FF6B4A', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 }}>{plan.vibe || 'Plan'}</div>
            <div style={{ font: "700 22px -apple-system", color: '#1A1A1A', lineHeight: 1.2, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{plan.place || plan.title}</div>
            <div style={{ fontSize: 13, color: '#9A9087', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {(() => {
                const addr = shortAddr(plan.place_address)
                const when = plan.date ? shortDate(plan.date) + (plan.time_label ? ' · ' + plan.time_label : '') : null
                if (!addr && !when) return 'Date TBD'
                return (
                  <>
                    {addr && (mapsUrl
                      ? <a href={mapsUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: '#FF6B4A', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                          {addr}
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#FF6B4A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 3, verticalAlign: '-1px' }}><path d="M7 17 17 7M9 7h8v8"/></svg>
                        </a>
                      : <span>{addr}</span>)}
                    {addr && when ? ' · ' : ''}
                    {when}
                  </>
                )
              })()}
            </div>
          </div>
        </div>
        {/* Row 3: avatar stack + counts */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex' }}>
            {/* host avatar */}
            <Avatar url={plan.hostAvatarUrl} name={plan.hostName} color={plan.hostColor || '#5B7CFA'} size={26} style={{ border: '2.5px solid #fff', zIndex: 10 }} />
            {/* invitee going avatars, up to 3 */}
            {going.slice(0, 3).map((inv, i) => (
              <Avatar key={inv.invitee} url={inv.avatar_url} name={inv.name} color={inv.avatar_color || '#A78BFA'} size={26} style={{ border: '2.5px solid #fff', marginLeft: -8, zIndex: 9 - i }} />
            ))}
          </div>
          {goingCount > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: '#0E9C6B', background: '#E4F6EE', borderRadius: 20, padding: '3px 9px' }}>{goingCount} going</span>}
          {late.length > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: '#C8841A', background: '#FFF4E3', borderRadius: 20, padding: '3px 9px' }}>{late.length} late</span>}
          {isHost && !past && (
            <button onClick={() => setShowInviteMore(true)} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1.5px solid #FF6B4A', borderRadius: 20, background: '#FFF1EC', font: "600 11.5px -apple-system", color: '#FF6B4A', cursor: 'pointer', flexShrink: 0 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#FF6B4A" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
              Invite
            </button>
          )}
        </div>
      </div>

      {/* ── fixed info section (RSVP + Who's in) ── */}
      <div style={{ flexShrink: 0, padding: '14px 14px 0', background: '#EEEAE4' }}>

        {/* ── RSVP row ── */}
        {!isHost && !past && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {RSVP_CFG.map(opt => {
              const sel = rsvp === opt.val
              return (
                <button key={opt.val} onClick={() => saveRsvp(opt.val)} disabled={saving}
                  style={{ flex: 1, height: 44, border: `1.5px solid ${sel ? opt.border : '#E8E2DA'}`, borderRadius: 12, background: sel ? (opt.val === 'going' ? '#0E9C6B' : opt.bg) : '#fff', color: sel ? (opt.val === 'going' ? '#fff' : opt.color) : '#9A9087', font: "600 14px -apple-system", cursor: saving ? 'default' : 'pointer', transition: 'all .15s', boxShadow: sel ? `0 3px 10px ${opt.iconBg}66` : 'none' }}>
                  {opt.label}
                </button>
              )
            })}
          </div>
        )}
        {isHost && !past && (
          <div style={{ height: 44, borderRadius: 12, background: '#E4F6EE', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <span style={{ font: "600 14px -apple-system", color: '#0E9C6B' }}>You're hosting</span>
          </div>
        )}

        {/* ── Who's in (collapsible) ── */}
        <div style={{ background: '#fff', borderRadius: 16, marginBottom: 14, overflow: 'hidden' }}>
          <div onClick={() => setWhosInOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', cursor: 'pointer' }}>
            <span style={{ font: "600 15px -apple-system", color: '#1A1A1A', flex: 1 }}>Who&apos;s in</span>
            {/* mini avatar stack */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ display: 'flex' }}>
                {[
                  { name: plan.hostName, color: plan.hostColor, url: plan.hostAvatarUrl },
                  ...(plan.invitees || []).slice(0, 3).map(inv => ({ name: inv.name, color: inv.avatar_color, url: inv.avatar_url })),
                ].slice(0, 4).map((p, i) => (
                  <Avatar key={i} url={p.url} name={p.name} color={p.color || '#A78BFA'} size={22} style={{ border: '2px solid #fff', marginLeft: i === 0 ? 0 : -7, zIndex: 4 - i }} />
                ))}
              </div>
              <span style={{ fontSize: 13, color: '#9A9087' }}>
                {1 + (plan.invitees?.length || 0)} people
              </span>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C4BBB2" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: whosInOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s', flexShrink: 0 }}>
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </div>
          {whosInOpen && (
            <div style={{ borderTop: '1px solid #F5F0EB', padding: '8px 12px 12px' }}>
              {/* Host row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px' }}>
                <Avatar url={plan.hostAvatarUrl} name={plan.hostName} color={plan.hostColor || '#5B7CFA'} size={28} />
                <span style={{ flex: 1, font: "500 14px -apple-system", color: '#1A1A1A' }}>{plan.host === myId ? 'You' : plan.hostName}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#FF6B4A', background: '#FFF1EC', borderRadius: 20, padding: '2px 8px' }}>Hosting</span>
              </div>
              {/* Going */}
              {going.map(inv => (
                <div key={inv.invitee} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px' }}>
                  <Avatar url={inv.avatar_url} name={inv.name} color={inv.avatar_color || '#A78BFA'} size={28} />
                  <span style={{ flex: 1, font: "500 14px -apple-system", color: '#1A1A1A' }}>{inv.invitee === myId ? 'You' : inv.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#0E9C6B', background: '#E4F6EE', borderRadius: 20, padding: '2px 8px' }}>Going</span>
                </div>
              ))}
              {/* Late */}
              {late.map(inv => (
                <div key={inv.invitee} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px' }}>
                  <Avatar url={inv.avatar_url} name={inv.name} color={inv.avatar_color || '#A78BFA'} size={28} />
                  <span style={{ flex: 1, font: "500 14px -apple-system", color: '#1A1A1A' }}>{inv.invitee === myId ? 'You' : inv.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#C8841A', background: '#FFF4E3', borderRadius: 20, padding: '2px 8px' }}>Late</span>
                </div>
              ))}
              {/* Can't */}
              {cant.map(inv => (
                <div key={inv.invitee} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px' }}>
                  <Avatar url={inv.avatar_url} name={inv.name} color={inv.avatar_color || '#A78BFA'} size={28} />
                  <span style={{ flex: 1, font: "500 14px -apple-system", color: '#1A1A1A' }}>{inv.invitee === myId ? 'You' : inv.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#E5484D', background: '#FEE9E9', borderRadius: 20, padding: '2px 8px' }}>Can't</span>
                </div>
              ))}
              {/* Pending / invited */}
              {pending.map(inv => (
                <div key={inv.invitee} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px' }}>
                  <Avatar url={inv.avatar_url} name={inv.name} color={inv.avatar_color || '#D0C9C2'} size={28} />
                  <span style={{ flex: 1, font: "500 14px -apple-system", color: '#9A9087' }}>{inv.invitee === myId ? 'You' : inv.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#B6ADA4', background: '#F5F0EB', borderRadius: 20, padding: '2px 8px' }}>Invited</span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>{/* end fixed info section */}

      {/* ── scrollable chat ── */}
      <div ref={chatScrollRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 8px', background: '#EEEAE4' }} className="no-scrollbar">
        <div style={{ background: '#fff', borderRadius: 16, marginBottom: 8, overflow: 'hidden' }}>
          <div style={{ font: "600 15px -apple-system", color: '#1A1A1A', padding: '13px 16px 10px', borderBottom: '1px solid #F5F0EB' }}>Chat</div>
          <div style={{ padding: '10px 12px 12px' }}>
            {messages.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 13, color: '#B6ADA4' }}>No messages yet — say hi!</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {messages.map((msg, idx) => {
                  const isMe = msg.sender === myId
                  const sender = msgProfiles[msg.sender]
                  const senderName = sender?.name || 'Unknown'
                  const showNewDivider = dividerVisible && idx === frozenDividerIdx.current
                  return (
                    <Fragment key={msg.id}>
                      {showNewDivider && (
                        <div ref={newDividerRef} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 4px' }}>
                          <div style={{ flex: 1, height: 1, background: 'rgba(255,107,74,.4)' }}/>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#FF6B4A', letterSpacing: 0.6 }}>NEW</span>
                          <div style={{ flex: 1, height: 1, background: 'rgba(255,107,74,.4)' }}/>
                        </div>
                      )}
                      <div style={{ display: 'flex', flexDirection: isMe ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 8 }}>
                        {!isMe && <Avatar url={sender?.avatar_url} name={senderName} color={sender?.avatar_color} size={28}/>}
                        <div style={{ maxWidth: '74%' }}>
                          {!isMe && <div style={{ fontSize: 11, fontWeight: 600, color: '#9A9087', marginBottom: 3, paddingLeft: 3 }}>{senderName}</div>}
                          {msg.photo_url ? (
                            <div style={{ position: 'relative', display: 'inline-block' }}>
                              <img src={msg.photo_url} onClick={() => setFullImg(msg.photo_url)} style={{ display: 'block', width: 160, height: 110, borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px', cursor: 'pointer', objectFit: 'cover' }}/>
                              {!isMe && <div onClick={() => setReportingMsg(msg)} style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 6, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
                              </div>}
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexDirection: isMe ? 'row-reverse' : 'row' }}>
                              <div style={{ background: isMe ? '#FF6B4A' : '#F2EFEC', color: isMe ? '#fff' : '#1F2933', borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px', padding: '10px 14px', font: "500 14px -apple-system", lineHeight: 1.45 }}>
                                {msg.body}
                              </div>
                              {!isMe && <div onClick={() => setReportingMsg(msg)} style={{ width: 22, height: 22, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, opacity: 0.4 }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="#7B7268"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
                              </div>}
                            </div>
                          )}
                          <div style={{ fontSize: 10.5, color: '#B6ADA4', marginTop: 3, textAlign: isMe ? 'right' : 'left', padding: isMe ? '0 4px 0 0' : '0 0 0 3px' }}>
                            {fmtTime(msg.created_at)}
                          </div>
                        </div>
                      </div>
                    </Fragment>
                  )
                })}
                <div ref={chatEndRef}/>
              </div>
            )}
          </div>
        </div>
      </div>{/* end scrollable chat */}

      {/* hidden file input for web photo picking */}
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={async e => {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = async ev => {
          const ext = file.type.split('/')[1] || 'jpeg'
          await uploadAndSendPhoto(ev.target.result, ext)
        }
        reader.readAsDataURL(file)
        e.target.value = ''
      }}/>

      {/* ── chat input ── */}
      <div style={{ padding: '10px 16px 20px', borderTop: '1px solid #E8E2DA', background: '#FBF7F4', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 9 }}>
        <button
          onClick={() => Capacitor.isNativePlatform() ? setShowPhotoSheet(true) : fileInputRef.current?.click()}
          disabled={msgSending}
          style={{ width: 42, height: 42, borderRadius: '50%', background: '#F0EAE4', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7B7268" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
        </button>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: '#fff', border: '1.5px solid #E8E2DA', borderRadius: 24, padding: '4px 16px' }}>
          <input
            value={msgBody}
            onChange={e => setMsgBody(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
            placeholder="Message the group…"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', font: "500 16px -apple-system", color: '#1F2933', padding: '10px 0' }}
          />
        </div>
        <button
          onClick={sendMessage}
          disabled={!msgBody.trim() || msgSending}
          style={{ width: 42, height: 42, borderRadius: '50%', background: msgBody.trim() ? '#FF6B4A' : '#E7DED7', border: 'none', cursor: msgBody.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background .15s', boxShadow: msgBody.trim() ? '0 6px 14px -4px rgba(255,107,74,.5)' : 'none' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="m22 2-11 11"/></svg>
        </button>
      </div>

      {/* ── photo source picker ── */}
      {showPhotoSheet && (
        <div onClick={() => setShowPhotoSheet(false)} style={{ position: 'absolute', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.4)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#FBF7F4', borderRadius: '24px 24px 0 0', padding: '20px 16px 36px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ font: "600 16px -apple-system", color: '#1F2933', textAlign: 'center', marginBottom: 4 }}>Send a photo</div>
            <button onClick={() => { setShowPhotoSheet(false); pickAndSendPhoto(CameraSource.Camera) }}
              style={{ width: '100%', padding: 15, border: 'none', borderRadius: 16, background: '#FF6B4A', color: '#fff', font: "600 15px -apple-system", cursor: 'pointer' }}>
              Take Photo
            </button>
            <button onClick={() => { setShowPhotoSheet(false); pickAndSendPhoto(CameraSource.Photos) }}
              style={{ width: '100%', padding: 15, border: '1.5px solid #E7DED7', borderRadius: 16, background: '#fff', color: '#1F2933', font: "600 15px -apple-system", cursor: 'pointer' }}>
              Choose from Library
            </button>
            <button onClick={() => setShowPhotoSheet(false)}
              style={{ width: '100%', padding: 13, border: 'none', borderRadius: 16, background: 'transparent', color: '#9A9087', font: "600 14px -apple-system", cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── full-screen image viewer ── */}
      {fullImg && (
        <div onClick={() => setFullImg(null)} style={{ position: 'absolute', inset: 0, zIndex: 300, background: 'rgba(0,0,0,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={fullImg} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          <button onClick={() => setFullImg(null)} style={{ position: 'absolute', top: 20, right: 16, width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      )}

      {showEdit && (
        <EditPlanSheet plan={plan} onClose={() => setShowEdit(false)} onSaved={() => { onUpdated?.() }} onDelete={onDeletePlan}/>
      )}
      {showInviteMore && (
        <InviteMoreSheet plan={plan} myId={myId} onClose={() => setShowInviteMore(false)} onDone={() => onUpdated?.()}/>
      )}

      {/* ── report message / photo sheet ── */}
      {reportingMsg && !reportDone && (
        <div onClick={() => setReportingMsg(null)} style={{ position: 'absolute', inset: 0, zIndex: 400, background: 'rgba(0,0,0,.5)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#FBF7F4', borderRadius: '24px 24px 0 0', padding: '20px 20px 36px' }}>
            <div style={{ font: '600 17px -apple-system', color: '#1F2933', marginBottom: 6 }}>Report this {reportingMsg.photo_url ? 'photo' : 'message'}?</div>
            <div style={{ fontSize: 13, color: '#9A9087', marginBottom: 20 }}>This will be reviewed within 24 hours. The sender won't be notified.</div>
            {['Spam', 'Inappropriate content', 'Harassment', 'Hate speech', 'Other'].map(reason => (
              <div key={reason} onClick={async () => {
                const { error } = await supabase.from('reports').insert({
                  reporter: myId,
                  reported: reportingMsg.sender,
                  reason,
                  plan_message_id: reportingMsg.id,
                  content_type: reportingMsg.photo_url ? 'photo' : 'message',
                })
                setReportingMsg(null)
                if (error) { console.error('Report insert failed:', error); setReportError(true); setTimeout(() => setReportError(false), 3500); return }
                setReportDone(true)
                setTimeout(() => setReportDone(false), 3000)
              }} style={{ padding: '13px 0', borderBottom: '1px solid #F1E8E2', fontSize: 15, color: '#1F2933', cursor: 'pointer' }}>{reason}</div>
            ))}
            <div onClick={() => setReportingMsg(null)} style={{ marginTop: 14, padding: '13px 0', textAlign: 'center', fontSize: 15, fontWeight: 600, color: '#9A9087', cursor: 'pointer' }}>Cancel</div>
          </div>
        </div>
      )}
      {reportDone && (
        <div style={{ position: 'absolute', bottom: 90, left: '50%', transform: 'translateX(-50%)', background: '#1F2933', color: '#fff', borderRadius: 12, padding: '10px 18px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', zIndex: 400 }}>
          Report submitted — thank you
        </div>
      )}
      {reportError && (
        <div style={{ position: 'absolute', bottom: 90, left: '50%', transform: 'translateX(-50%)', background: '#E14F2E', color: '#fff', borderRadius: 12, padding: '10px 18px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', zIndex: 400 }}>
          Couldn't submit report — please try again
        </div>
      )}
    </div>
  )
}

// ─── PlansScreen ──────────────────────────────────────────────────────────────
export default function PlansScreen({ session, openPlanId, onPlanOpened, onBack, refreshTrigger, backToListTrigger, cancelledPlanIds, onPlanViewed, onUnreadCount, latestMessage, latestInvite }) {
  const [plans, setPlans]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState('upcoming')
  const [selectedId, setSelectedId] = useState(null)
  const [startRsvp, setStartRsvp]   = useState(false)
  const viewedPlanIds   = useRef(new Set())
  const selectedIdRef   = useRef(null)
  const fromExternalRef = useRef(false)

  const visiblePlans = cancelledPlanIds?.size ? plans.filter(p => !cancelledPlanIds.has(p.id)) : plans
  const selected = visiblePlans.find(p => p.id === selectedId) || null
  // We've been asked to open a plan that isn't selected yet (e.g. straight after
  // creating one). Show the loading spinner until selectedId catches up — never
  // the orphaned "Your plans" list, and never a stale plan's chat (privacy).
  const opening = !!openPlanId && openPlanId !== selectedId

  // Sync total unread count to parent whenever plans change (avoids calling onUnreadCount inside setPlans updaters)
  useEffect(() => {
    onUnreadCount?.(plans.reduce((s, p) => s + (p.unreadCount || 0), 0))
  }, [plans])

  async function deletePlan(planId) {
    const plan = plans.find(p => p.id === planId)
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
    await supabase.from('plans').delete().eq('id', planId)
    inviteeIds.forEach(uid => {
      const ch = supabase.channel(`user-home-${uid}`)
      ch.send({ type: 'broadcast', event: 'plan_deleted', payload: { plan_id: planId } }).then(() => supabase.removeChannel(ch))
    })
    // Tear down the detail view and return Home. Clearing selectedId first means
    // the orphaned "Your plans" list (no longer a navigable screen) can't flash
    // underneath while the screen switches.
    setSelectedId(null); selectedIdRef.current = null
    fromExternalRef.current = false
    load()
    onBack?.()
  }

  useEffect(() => {
    if (!session || refreshTrigger === 0) return
    load(true)
  }, [refreshTrigger])

  useEffect(() => {
    if (!session) return
    load()
    const inviteChannel = supabase
      .channel('plans-invites')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'plan_invitees',
        filter: `invitee=eq.${session.user.id}`,
      }, () => { load() })
      .subscribe()

    const feedChannel = supabase
      .channel('plans-notifs')
      .subscribe((status) => { if (status === 'SUBSCRIBED') load(true) })

    return () => { supabase.removeChannel(inviteChannel); supabase.removeChannel(feedChannel) }
  }, [session])

  useEffect(() => {
    if (!latestMessage?.planId) return
    const planId = latestMessage.planId
    if (selectedIdRef.current === planId) return
    setPlans(prev => {
      const idx = prev.findIndex(p => p.id === planId)
      if (idx === -1 || viewedPlanIds.current.has(planId)) return prev
      const updated = [...prev]
      updated[idx] = { ...updated[idx], unreadCount: (updated[idx].unreadCount || 0) + 1 }
      return updated
    })
  }, [latestMessage])

  useEffect(() => {
    if (latestInvite) load(true)
  }, [latestInvite])

  useEffect(() => {
    if (backToListTrigger === 0) return
    setSelectedId(null); selectedIdRef.current = null
  }, [backToListTrigger])

  useEffect(() => {
    if (!openPlanId) return
    // Search visiblePlans (not raw plans) so a cancelled plan is treated as absent
    // and never selected into a detail that would then resolve to null.
    const target = visiblePlans.find(p => p.id === openPlanId)
    if (!target) return // not loaded yet, or gone — the give-up timeout below handles permanent absence
    fromExternalRef.current = true
    setSelectedId(target.id); selectedIdRef.current = target.id; setStartRsvp(false); onPlanOpened?.()
    viewedPlanIds.current.add(target.id)
    setPlans(ps => ps.map(q => q.id === target.id ? { ...q, unreadCount: 0 } : q))
    onPlanViewed?.(target.id)
  }, [openPlanId, plans, cancelledPlanIds])

  // Give-up safety net: if a requested plan never resolves (deleted/cancelled/
  // inaccessible, or the user has none), don't spin forever — return Home.
  useEffect(() => {
    if (!openPlanId || selectedId === openPlanId) return
    const t = setTimeout(() => { onPlanOpened?.(); onBack?.() }, 5000)
    return () => clearTimeout(t)
  }, [openPlanId, selectedId])

  // A plan we're viewing disappeared (host cancelled/deleted it via realtime, or it
  // got filtered out) — leave the detail and go Home instead of falling through to
  // the orphaned "Your plans" list. Skip while a fresh open is still resolving.
  useEffect(() => {
    if (selectedId && !opening && !selected) {
      setSelectedId(null); selectedIdRef.current = null
      onBack?.()
    }
  }, [selectedId, selected, opening])

  async function load(silent = false) {
    if (!silent) setLoading(true)

    const { data: hosting } = await supabase
      .from('plans')
      .select('id, title, place_name, place_address, place_lat, place_lng, starts_at, time_label, host, vibe')
      .eq('host', session.user.id)
      .not('cancelled', 'is', true)

    const { data: myInvites } = await supabase
      .from('plan_invitees').select('plan_id, rsvp').eq('invitee', session.user.id)

    const invitedPlanIds = (myInvites || []).map(i => i.plan_id)
    const { data: invited } = invitedPlanIds.length
      ? await supabase.from('plans').select('id, title, place_name, place_address, place_lat, place_lng, starts_at, time_label, host, vibe').in('id', invitedPlanIds).not('cancelled', 'is', true)
      : { data: [] }

    const allPlans = [...(hosting || []), ...(invited || [])]
    if (!allPlans.length) { setPlans([]); setLoading(false); return }

    const planIds = allPlans.map(p => p.id)
    const hostIds = [...new Set(allPlans.map(p => p.host))]

    const [{ data: allInvitees }, { data: hostProfiles }] = await Promise.all([
      supabase.from('plan_invitees').select('plan_id, invitee, rsvp').in('plan_id', planIds),
      supabase.from('profiles').select('id, first_name, last_name, username, avatar_color, avatar_url').in('id', hostIds),
    ])

    // Detect which circle/group each hosted plan was shared with
    let planGroupMap = {}
    const hostedPlanIds = (hosting || []).map(p => p.id)
    if (hostedPlanIds.length) {
      const [{ data: myGroups }, { data: gMembers }] = await Promise.all([
        supabase.from('groups').select('id, name, color').eq('owner', session.user.id),
        supabase.from('group_members').select('group_id, member'),
      ])
      if (myGroups?.length && gMembers?.length) {
        const gMap = {}; myGroups.forEach(g => { gMap[g.id] = g })
        hostedPlanIds.forEach(planId => {
          const pInvitees = new Set((allInvitees || []).filter(i => i.plan_id === planId).map(i => i.invitee))
          if (!pInvitees.size) return
          const groupCounts = {}
          gMembers.filter(m => pInvitees.has(m.member)).forEach(m => {
            groupCounts[m.group_id] = (groupCounts[m.group_id] || 0) + 1
          })
          const [bestId] = Object.entries(groupCounts).sort((a, b) => b[1] - a[1])[0] || []
          if (bestId) planGroupMap[planId] = gMap[bestId]
        })
      }
    }

    const inviteeIds = [...new Set((allInvitees || []).map(i => i.invitee))]
    const { data: inviteeProfiles } = inviteeIds.length
      ? await supabase.from('profiles').select('id, first_name, last_name, avatar_color, avatar_url').in('id', inviteeIds)
      : { data: [] }

    const { data: nicknames } = await supabase
      .from('friend_nicknames').select('friend_id, nickname').eq('user_id', session.user.id)
    const nickMap = {}; (nicknames || []).forEach(n => { nickMap[n.friend_id] = n.nickname })

    const profileMap = {}
    ;[...(hostProfiles || []), ...(inviteeProfiles || [])].forEach(p => {
      profileMap[p.id] = { ...p, name: nickMap[p.id] || `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown' }
    })

    const inviteesByPlan = {}
    ;(allInvitees || []).forEach(i => {
      if (!inviteesByPlan[i.plan_id]) inviteesByPlan[i.plan_id] = []
      inviteesByPlan[i.plan_id].push({ ...i, ...profileMap[i.invitee], name: profileMap[i.invitee]?.name || 'Unknown' })
    })

    // Unread message counts per plan (same approach as HomeScreen)
    const uniquePlanIds = [...new Set(planIds)]
    const { data: myReads } = await supabase
      .from('plan_message_reads')
      .select('plan_id, last_read_at')
      .eq('user_id', session.user.id)
      .in('plan_id', uniquePlanIds)
    const readMap = {}
    ;(myReads || []).forEach(r => { readMap[r.plan_id] = r.last_read_at })
    const unreadResults = await Promise.all(uniquePlanIds.map(async id => {
      // No read record = chat never opened, so every message from others is unseen.
      let q = supabase
        .from('plan_messages')
        .select('id', { count: 'exact', head: true })
        .eq('plan_id', id)
        .neq('sender', session.user.id)
      if (readMap[id]) q = q.gt('created_at', readMap[id])
      const { count } = await q
      return [id, count || 0]
    }))
    const unreadByPlan = Object.fromEntries(unreadResults)

    const seen = new Set()
    const built = allPlans
      .filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true })
      .map(p => ({
        ...p,
        place: p.place_name,
        date: p.starts_at,
        invitees: inviteesByPlan[p.id] || [],
        hostName: profileMap[p.host]?.name || 'Unknown',
        hostColor: profileMap[p.host]?.avatar_color,
        hostAvatarUrl: profileMap[p.host]?.avatar_url,
        groupName: planGroupMap[p.id]?.name || null,
        groupColor: planGroupMap[p.id]?.color || null,
        unreadCount: unreadByPlan[p.id] || 0,
      }))
      .sort((a, b) => {
        if (!a.date && !b.date) return 0
        if (!a.date) return 1
        if (!b.date) return -1
        return new Date(a.date) - new Date(b.date)
      })

    const finalBuilt = built.map(p =>
      viewedPlanIds.current.has(p.id) ? { ...p, unreadCount: 0 } : p
    )
    setPlans(finalBuilt)
    setLoading(false)
  }

  const upcoming = visiblePlans.filter(p => !isPast(p.date))
  const past     = visiblePlans.filter(p => isPast(p.date))
  const shown    = tab === 'upcoming' ? upcoming : past

  return (
    <div className="fade-up" style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {opening ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #E0D7CF', borderTopColor: '#FF6B4A', animation: 'spin .7s linear infinite' }}/>
        </div>
      ) : selected ? (
        <PlanDetail
          key={selected.id}
          plan={selected}
          myId={session.user.id}
          startOnRsvp={startRsvp}
          onClose={() => {
            const viewedId = selected?.id
            viewedPlanIds.current.add(viewedId)
            setSelectedId(null); selectedIdRef.current = null
            setPlans(ps => ps.map(p => p.id === viewedId ? { ...p, unreadCount: 0 } : p))
            onPlanViewed?.(viewedId)
            load(true)
            if (fromExternalRef.current) { fromExternalRef.current = false; onBack?.() }
          }}
          onUpdated={load}
          onDeletePlan={() => deletePlan(selected.id)}
        />
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 22px 24px' }} className="no-scrollbar">

          <h2 style={{ margin: '6px 0 18px', font: "600 25px -apple-system", color: '#1F2933' }}>Your plans</h2>

          <div style={{ display: 'flex', gap: 0, background: '#F0EBE5', borderRadius: 14, padding: 4, marginBottom: 22 }}>
            {[
              { key: 'upcoming', label: 'Upcoming', count: upcoming.length },
              { key: 'past',     label: 'Past',     count: past.length },
            ].map(t => {
              const active = tab === t.key
              return (
                <div key={t.key} onClick={() => setTab(t.key)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 10px', borderRadius: 11, background: active ? '#fff' : 'transparent', cursor: 'pointer', boxShadow: active ? '0 1px 4px rgba(0,0,0,.08)' : 'none', transition: 'all .15s' }}>
                  <span style={{ font: "600 16px -apple-system", color: active ? '#1F2933' : '#9A9087' }}>
                    {t.label}
                  </span>
                </div>
              )
            })}
          </div>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[1,2,3].map(i => <div key={i} style={{ height: 140, borderRadius: 20, background: '#F1E8E2' }}/>)}
            </div>
          ) : shown.length === 0 ? (
            <div style={{ background: '#fff', border: '1.5px dashed #E7DED7', borderRadius: 20, padding: '40px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>{tab === 'past' ? '📅' : '🗓️'}</div>
              <p style={{ margin: '0 0 6px', font: "600 17px -apple-system", color: '#1F2933' }}>
                {tab === 'past' ? 'No past plans' : 'No upcoming plans'}
              </p>
              <p style={{ margin: 0, fontSize: 13.5, color: '#9A9087' }}>
                {tab === 'past' ? "Plans you've attended will show here." : 'Tap + to make your first plan.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {shown.map(p => (
                <PlanCard
                  key={p.id}
                  plan={p}
                  myId={session.user.id}
                  onOpen={() => {
                    fromExternalRef.current = false
                    setSelectedId(p.id); selectedIdRef.current = p.id; setStartRsvp(false)
                    viewedPlanIds.current.add(p.id)
                    setPlans(ps => ps.map(q => q.id === p.id ? { ...q, unreadCount: 0 } : q))
                    onPlanViewed?.(p.id)
                  }}
                  onRsvp={async (val) => {
                    setPlans(prev => prev.map(q => q.id !== p.id ? q : {
                      ...q,
                      invitees: q.invitees.map(i => i.invitee === session.user.id ? { ...i, rsvp: val } : i),
                    }))
                    await supabase.from('plan_invitees').update({ rsvp: val }).eq('plan_id', p.id).eq('invitee', session.user.id)
                  }}
                  onDelete={() => deletePlan(p.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Standalone plan detail overlay (open from any screen) ───────────────────
export function PlanDetailOverlay({ planId, session, onClose, onUpdated }) {
  const [plan, setPlan] = useState(null)

  async function load() {
    const { data: p } = await supabase.from('plans')
      .select('*, plan_invitees(invitee, rsvp)')
      .eq('id', planId).single()
    if (!p) return

      const allIds = [...new Set([p.host, ...(p.plan_invitees || []).map(i => i.invitee)])]
      const { data: profiles } = await supabase.from('profiles')
        .select('id, first_name, last_name, avatar_color, avatar_url').in('id', allIds)
      const profileMap = {}
      profiles?.forEach(pr => { profileMap[pr.id] = pr })

      const { data: nicknames } = await supabase
        .from('friend_nicknames').select('friend_id, nickname').eq('user_id', session.user.id)
      const nickMap = {}
      nicknames?.forEach(n => { nickMap[n.friend_id] = n.nickname })

      const hp = profileMap[p.host]
      setPlan({
        ...p,
        place: p.place_name,
        date: p.starts_at,
        hostName: nickMap[p.host] || (hp ? `${hp.first_name || ''} ${hp.last_name || ''}`.trim() : 'Unknown'),
        hostColor: hp?.avatar_color,
        hostAvatarUrl: hp?.avatar_url,
        invitees: (p.plan_invitees || []).map(i => {
          const pr = profileMap[i.invitee]
          return { ...i, name: nickMap[i.invitee] || (pr ? `${pr.first_name || ''} ${pr.last_name || ''}`.trim() : 'Unknown'), avatar_color: pr?.avatar_color, avatar_url: pr?.avatar_url }
        }),
      })
  }

  useEffect(() => { load() }, [planId])

  if (!plan) return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: '#EEEAE4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #E0D7CF', borderTopColor: '#FF6B4A', animation: 'spin .7s linear infinite' }}/>
    </div>
  )

  async function deletePlan() {
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
    await supabase.from('plans').delete().eq('id', planId)
    inviteeIds.forEach(uid => {
      const ch = supabase.channel(`user-home-${uid}`)
      ch.send({ type: 'broadcast', event: 'plan_deleted', payload: { plan_id: planId } }).then(() => supabase.removeChannel(ch))
    })
    onClose()
    onUpdated?.()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: '#FBF7F4', paddingTop: 'env(safe-area-inset-top)', boxSizing: 'border-box' }}>
      <PlanDetail
        plan={plan}
        myId={session.user.id}
        onClose={onClose}
        onUpdated={() => { load(); onUpdated?.() }}
        onDeletePlan={deletePlan}
      />
    </div>
  )
}
