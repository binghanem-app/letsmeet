import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import Avatar from '../components/Avatar'
import UserProfileSheet from '../components/UserProfileSheet'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'

const GAPI_KEY = import.meta.env.VITE_GAPI_KEY || 'AIzaSyCNapPdmmlN0RO1vCFijGivCUcqtQLsJdM'

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
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', font: "500 16px 'Plus Jakarta Sans'", color: '#1F2933', padding: '10px 0' }}/>
        {query && <span onClick={clear} style={{ fontSize: 19, color: '#C4BBB2', cursor: 'pointer', lineHeight: 1 }}>×</span>}
      </div>
      {results.length > 0 && !isSelected && (
        <div style={{ background: '#fff', border: '1px solid #F1E8E2', borderRadius: 14, marginBottom: 14, overflow: 'hidden' }}>
          {results.map((p, i) => (
            <div key={i} onClick={() => pick(p)} style={{ padding: '11px 14px', borderBottom: i < results.length - 1 ? '1px solid #F5F0EB' : 'none', cursor: 'pointer' }}>
              <div style={{ font: "600 14px 'Plus Jakarta Sans'", color: '#1F2933' }}>{p.name}</div>
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

    await supabase.from('plans').update({
      starts_at: date || null,
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
          <h3 style={{ margin: '0 0 18px', font: "600 22px 'Fredoka'", color: '#1F2933' }}>Edit plan</h3>

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
            style={{ width: '100%', padding: 15, border: 'none', borderRadius: 16, background: saving ? '#E7DED7' : '#FF6B4A', color: '#fff', font: "600 16px 'Fredoka'", cursor: saving ? 'default' : 'pointer', boxShadow: saving ? 'none' : '0 10px 22px -8px rgba(255,107,74,.7)', transition: 'all .2s' }}>
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
                style={{ marginTop: 12, width: '100%', padding: '11px', border: '1px solid #FAD5CF', borderRadius: 16, background: '#FEF0EE', color: '#E14F2E', font: "600 16px 'Plus Jakarta Sans'", cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
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

// ─── Plan card ────────────────────────────────────────────────────────────────
function PlanCard({ plan, myId, onOpen, onEditResponse, onDelete }) {
  const isHost = plan.host === myId
  const myInvite = plan.invitees?.find(i => i.invitee === myId)
  const myRsvp = myInvite?.rsvp || (isHost ? 'going' : 'invited')
  const past = isPast(plan.date)
  const cat = CATEGORY_CONFIG[plan.vibe]
  const [showConfirm, setShowConfirm] = useState(false)

  const goingCount = (plan.invitees?.filter(i => i.rsvp === 'going').length || 0) + (isHost ? 1 : 0)
  const lateCount  = plan.invitees?.filter(i => i.rsvp === 'late').length || 0
  const cantCount  = plan.invitees?.filter(i => i.rsvp === 'cant').length || 0

  const RSVP_BADGE = {
    going:   { label: "You're in",     color: '#0E9C6B', bg: '#E4F6EE' },
    late:    { label: 'Going, late',   color: '#C8841A', bg: '#FBF0DA' },
    cant:    { label: "Can't make it", color: '#8A94A0', bg: '#EFEBE7' },
    invited: { label: 'Pending',       color: '#8A94A0', bg: '#EFEBE7' },
  }
  const rsvpBadge = RSVP_BADGE[myRsvp] || RSVP_BADGE.invited
  const groupLabel = plan.groupName
  const dateLabel = smartDateLabel(plan.date)
  const timeStr = fmtTime(plan.date)

  return (
    <div onClick={onOpen} style={{ background: '#fff', borderRadius: 22, overflow: 'hidden', boxShadow: '0 4px 22px -10px rgba(20,24,30,.22)', cursor: 'pointer', opacity: past ? 0.72 : 1 }}>
      <div style={{ height: 5, background: cat ? cat.gradient : '#EBE4DC', opacity: past ? 0.4 : 1 }}/>
      <div style={{ padding: '16px 17px 17px' }}>

        {/* TOP ROW */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 11 }}>
          {/* LEFT: title + chip */}
          <div style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
            <div style={{ font: "600 21px 'Fredoka'", color: '#1F2933', marginBottom: 3 }}>{plan.title || 'Untitled'}</div>
            {isHost ? (
              groupLabel && <span style={{ font: "700 11px 'Plus Jakarta Sans'", color: cat?.accent || '#FF6B4A', background: cat?.accentBg || '#FFEFE9', padding: '4px 9px', borderRadius: 20 }}>{groupLabel}</span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: "600 11px 'Plus Jakarta Sans'", color: '#5B6770', background: '#F2EFEC', padding: '4px 9px', borderRadius: 20 }}>
                <span style={{ width: 16, height: 16, borderRadius: '50%', background: plan.hostColor || '#A78BFA', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', font: "700 8px 'Plus Jakarta Sans'", flexShrink: 0 }}>{initials(plan.hostName || '')}</span>
                by {plan.hostName || 'Someone'}
              </span>
            )}
          </div>

          {/* RIGHT: badges column */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 7, marginTop: 2, flexShrink: 0 }}>
            {isHost ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ font: "700 11px 'Plus Jakarta Sans'", color: '#E14F2E', background: '#FFE7E0', padding: '4px 9px', borderRadius: 20 }}>Hosting</span>
                  {!past && (
                    <button onClick={e => { e.stopPropagation(); setShowConfirm(s => !s) }}
                      style={{ width: 30, height: 30, borderRadius: 9, background: '#FEF0EE', border: '1px solid #FAD5CF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#E14F2E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                      </svg>
                    </button>
                  )}
                </div>
                {cat && <CategoryIconBadge type={cat.iconType} color={cat.accent} bg={cat.accentBg}/>}
              </>
            ) : (
              <>
                <span style={{ font: "700 11px 'Plus Jakarta Sans'", color: rsvpBadge.color, background: rsvpBadge.bg, padding: '4px 9px', borderRadius: 20 }}>{rsvpBadge.label}</span>
                {cat && <CategoryIconBadge type={cat.iconType} color={cat.accent} bg={cat.accentBg}/>}
              </>
            )}
          </div>
        </div>

        {/* LOCATION */}
        {plan.place && (
          <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FF6B4A" strokeWidth="2.2" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M12 21s7-6.4 7-11a7 7 0 1 0-14 0c0 4.6 7 11 7 11z"/><circle cx="12" cy="10" r="2.2"/></svg>
            <span style={{ font: "600 18px 'Fredoka'", color: '#1F2933' }}>{plan.place}</span>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: isHost ? 0 : 11 }}>
          {goingCount > 0 && <span style={{ font: "700 11.5px 'Plus Jakarta Sans'", color: '#0E9C6B', background: '#E4F6EE', padding: '4px 10px', borderRadius: 20 }}>{goingCount} going</span>}
          {lateCount  > 0 && <span style={{ font: "700 11.5px 'Plus Jakarta Sans'", color: '#C8841A', background: '#FBF0DA', padding: '4px 10px', borderRadius: 20 }}>{lateCount} late</span>}
          {cantCount  > 0 && <span style={{ font: "700 11.5px 'Plus Jakarta Sans'", color: '#8A94A0', background: '#EFEBE7', padding: '4px 10px', borderRadius: 20 }}>{cantCount} can't</span>}
        </div>

        {/* EDIT RESPONSE — guest + upcoming */}
        {!isHost && !past && (
          <button onClick={e => { e.stopPropagation(); onEditResponse() }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', padding: 10, border: '1.5px solid #EBE4DC', borderRadius: 12, background: '#FBF7F4', color: '#1F2933', font: "600 13px 'Plus Jakarta Sans'", cursor: 'pointer', marginTop: 11 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF6B4A" strokeWidth="2.2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
            Edit my response
          </button>
        )}

        {/* CANCEL CONFIRM BAR — host */}
        {isHost && showConfirm && (
          <div style={{ background: '#FEF0EE', border: '1px solid #FAD5CF', borderRadius: 13, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, marginTop: 11 }}>
            <span style={{ flex: 1, fontSize: 13, color: '#E14F2E', fontWeight: 600 }}>Cancel this plan? Everyone will be notified.</span>
            <button onClick={e => { e.stopPropagation(); onDelete?.() }} style={{ background: '#E14F2E', color: '#fff', border: 'none', font: "700 12px 'Plus Jakarta Sans'", padding: '8px 13px', borderRadius: 10, cursor: 'pointer', flexShrink: 0 }}>Confirm</button>
            <button onClick={e => { e.stopPropagation(); setShowConfirm(false) }} style={{ border: '1.5px solid #FAD5CF', background: '#fff', color: '#7B7268', font: "600 12px 'Plus Jakarta Sans'", padding: '8px 12px', borderRadius: 10, cursor: 'pointer', flexShrink: 0 }}>Keep</button>
          </div>
        )}
      </div>
    </div>
  )
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
            <span style={{ font: "600 13px 'Plus Jakarta Sans'", color: sel ? opt.color : '#9A9087', transition: 'color .15s' }}>
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
      <span style={{ flex: 1, font: "600 14px 'Plus Jakarta Sans'", color: '#1F2933' }}>{name || 'Unknown'}</span>
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
    const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name, username, avatar_color').in('id', fIds)
    setFriends((profiles || []).map(p => ({ ...p, displayName: `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.username || 'Unknown' })))
    setLoading(false)
  }

  function toggle(id) { setSelected(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]) }

  async function confirm() {
    if (!selected.length) return
    setSending(true)
    await supabase.from('plan_invitees').insert(selected.map(uid => ({ plan_id: plan.id, invitee: uid, rsvp: 'invited' })))
    const { data: hp } = await supabase.from('profiles').select('first_name, last_name').eq('id', myId).single()
    const hostName = hp ? `${hp.first_name || ''} ${hp.last_name || ''}`.trim() || 'Someone' : 'Someone'
    await supabase.from('notifications').insert(
      selected.map(uid => ({ recipient: uid, actor: myId, kind: 'invite', plan_id: plan.id, body: `${hostName} invited you to "${plan.title}"` }))
    )
    setSending(false)
    onDone()
    onClose()
  }

  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(20,24,30,.45)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} className="sheet-up" style={{ background: '#FBF7F4', borderRadius: '28px 28px 0 0', maxHeight: '75%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ width: 42, height: 5, borderRadius: 5, background: '#E0D7CF', margin: '12px auto 0', flexShrink: 0 }}/>
        <div style={{ padding: '16px 20px 12px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, font: "600 22px 'Fredoka'", color: '#1F2933' }}>Invite more</h3>
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
                    <div style={{ width: 38, height: 38, borderRadius: '50%', background: f.avatar_color || '#A78BFA', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', font: "600 13px 'Plus Jakarta Sans'", flexShrink: 0 }}>
                      {f.displayName.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                    <span style={{ flex: 1, font: "600 14.5px 'Plus Jakarta Sans'", color: sel ? '#FF6B4A' : '#1F2933' }}>{f.displayName}</span>
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
            style={{ width: '100%', padding: 15, border: 'none', borderRadius: 16, background: selected.length ? '#FF6B4A' : '#E7DED7', color: '#fff', font: "600 16px 'Fredoka'", cursor: selected.length && !sending ? 'pointer' : 'default', boxShadow: selected.length ? '0 10px 22px -8px rgba(255,107,74,.7)' : 'none', transition: 'all .2s' }}>
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
  const [showAll, setShowAll]         = useState(false)
  const [showEdit, setShowEdit]       = useState(false)
  const [showInviteMore, setShowInviteMore] = useState(false)
  const [viewUserId, setViewUserId]   = useState(null)
  const [messages, setMessages]       = useState([])
  const [msgProfiles, setMsgProfiles] = useState({})
  const [msgBody, setMsgBody]         = useState('')
  const [msgSending, setMsgSending]   = useState(false)
  const [fullImg, setFullImg]         = useState(null)
  const chatEndRef  = useRef(null)
  const fileInputRef = useRef(null)
  const knownSenders = useRef(new Set())
  const past = isPast(plan.date)

  const going   = plan.invitees?.filter(i => i.rsvp === 'going') || []
  const late    = plan.invitees?.filter(i => i.rsvp === 'late')  || []
  const cant    = plan.invitees?.filter(i => i.rsvp === 'cant')  || []
  const pending = plan.invitees?.filter(i => i.rsvp === 'invited') || []
  const goingCount = going.length + (isHost ? 1 : 0)

  const mapsUrl = plan.place && plan.place_lat
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(plan.place + (plan.place_address ? ', ' + plan.place_address : ''))}`
    : null

  useEffect(() => {
    loadMessages()

    const channel = supabase.channel(`plan-detail-${plan.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'plan_messages',
        filter: `plan_id=eq.${plan.id}`,
      }, async payload => {
        const msg = payload.new
        // own messages are already added optimistically
        if (msg.sender === myId) return
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
        if (!knownSenders.current.has(msg.sender)) {
          knownSenders.current.add(msg.sender)
          const { data: p } = await supabase.from('profiles')
            .select('id, first_name, last_name, avatar_color, avatar_url')
            .eq('id', msg.sender).single()
          if (p) setMsgProfiles(prev => ({
            ...prev,
            [p.id]: { ...p, name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown' },
          }))
        }
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'plan_invitees',
        filter: `plan_id=eq.${plan.id}`,
      }, () => { onUpdated?.() })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [plan.id])

  async function loadMessages() {
    const { data } = await supabase
      .from('plan_messages')
      .select('id, sender, body, photo_url, created_at')
      .eq('plan_id', plan.id)
      .order('created_at', { ascending: true })
    if (!data?.length) return
    setMessages(data)
    const ids = [...new Set(data.map(m => m.sender))]
    const { data: profiles } = await supabase
      .from('profiles').select('id, first_name, last_name, avatar_color, avatar_url').in('id', ids)
    const map = {}
    profiles?.forEach(p => {
      map[p.id] = { ...p, name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown' }
      knownSenders.current.add(p.id)
    })
    setMsgProfiles(map)
  }

  async function sendMessage() {
    const body = msgBody.trim()
    if (!body || msgSending) return
    setMsgSending(true)
    setMsgBody('')
    const { data: newMsg, error: msgErr } = await supabase.from('plan_messages').insert({
      plan_id: plan.id, sender: myId, body,
    }).select('id, sender, body, photo_url, created_at').single()
    if (newMsg) {
      setMessages(prev => [...prev, newMsg])
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
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
      }
    }
    setMsgSending(false)
  }

  async function uploadAndSendPhoto(dataUrl, format) {
    setMsgSending(true)
    try {
      const res = await fetch(dataUrl)
      const blob = await res.blob()
      const ext = format || 'jpeg'
      const path = `${plan.id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('chat-images').upload(path, blob, { contentType: `image/${ext}` })
      if (upErr) { console.error(upErr); setMsgSending(false); return }
      const { data: { publicUrl } } = supabase.storage.from('chat-images').getPublicUrl(path)
      const { data: newMsg } = await supabase.from('plan_messages').insert({
        plan_id: plan.id, sender: myId, photo_url: publicUrl,
      }).select('id, sender, body, photo_url, created_at').single()
      if (newMsg) {
        setMessages(prev => [...prev, newMsg])
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
      }
    } catch (e) {
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
      const perm = await Camera.checkPermissions()
      const permKey = source === CameraSource.Camera ? 'camera' : 'photos'
      if (perm[permKey] === 'denied') {
        alert("Camera access was denied. Please go to Settings → Privacy → Camera and enable Let's Meet.")
        return
      }
      const photo = await Camera.getPhoto({ resultType: CameraResultType.DataUrl, source, quality: 80, width: 1200 })
      await uploadAndSendPhoto(photo.dataUrl, photo.format)
    } catch (e) {
      const msg = e?.message || ''
      if (msg === 'User cancelled photos app' || msg === 'User cancelled') return
      console.error('Camera error:', e)
      alert("Camera access was denied. Please go to Settings → Privacy → Camera and enable Let's Meet.")
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

  const allAttendees = [
    ...going,
    ...late,
    ...(showAll ? [...cant, ...pending] : []),
  ]

  const relBadge = relativeLabel(plan.date)
  const addrShort = shortAddr(plan.place_address)
  const dayName = plan.date ? new Date(plan.date).toLocaleDateString('en-US', { weekday: 'long' }) : ''

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#EEEAE4' }}>

      {/* ── sticky header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px 11px', background: '#FBF7F4', borderBottom: '1px solid #E8E2DA', flexShrink: 0 }}>
        <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 3, border: 'none', background: 'transparent', padding: '6px 4px', font: "600 14px 'Plus Jakarta Sans'", color: '#7B7268', cursor: 'pointer', flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <h2 style={{ flex: 1, margin: 0, font: "700 19px 'Fredoka'", color: '#1F2933', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {plan.title || 'Untitled'}
        </h2>
        {isHost && !past && (
          <button onClick={() => setShowEdit(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 12px', border: '1.5px solid #E8E2DA', borderRadius: 10, background: '#fff', font: "600 12.5px 'Plus Jakarta Sans'", color: '#7B7268', cursor: 'pointer', flexShrink: 0 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
            Edit
          </button>
        )}
      </div>

      {/* ── scrollable body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px 16px' }} className="no-scrollbar">

        {/* ── host row ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 2px 10px' }}>
          <Avatar url={plan.hostAvatarUrl} name={plan.hostName} color={plan.hostColor} size={36}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#9A9087', fontWeight: 500, marginBottom: 1 }}>
              {isHost ? "You're hosting" : 'Invited by'}
            </div>
            <div style={{ font: "600 14px 'Plus Jakarta Sans'", color: '#1F2933' }}>
              {isHost ? 'You' : plan.hostName || 'Unknown'}
            </div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#0E9C6B', background: '#E4F6EE', borderRadius: 20, padding: '3px 10px', flexShrink: 0 }}>
            {isHost ? 'Hosting' : 'Invited'}
          </span>
        </div>

        {/* ── 2-column WHERE / WHEN grid ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>

          {/* WHERE card */}
          <div style={{ background: '#fff', borderRadius: 14, padding: '10px 11px', display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF6B4A" strokeWidth="2.2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#B6ADA4', letterSpacing: .6 }}>WHERE</span>
            </div>
            {plan.place ? (
              <>
                <div style={{ font: "600 14px 'Plus Jakarta Sans'", color: '#1F2933', lineHeight: 1.3, marginBottom: 2 }}>{plan.place}</div>
                {addrShort && <div style={{ fontSize: 11, color: '#9A9087', lineHeight: 1.4, marginBottom: 6 }}>{addrShort}</div>}
              </>
            ) : (
              <div style={{ font: "600 13px 'Plus Jakarta Sans'", color: '#B6ADA4', marginBottom: 6 }}>TBD</div>
            )}
            {mapsUrl && plan.place && (
              <a href={mapsUrl} target="_blank" rel="noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 700, color: '#FF6B4A', textDecoration: 'none', marginTop: 'auto' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#FF6B4A" strokeWidth="2.5" strokeLinecap="round"><path d="m7 17 10-10M9 7h8v8"/></svg>
                Open maps
              </a>
            )}
          </div>

          {/* WHEN card */}
          <div style={{ background: '#fff', borderRadius: 14, padding: '10px 11px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5B7CFA" strokeWidth="2.2" strokeLinecap="round"><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#B6ADA4', letterSpacing: .6 }}>WHEN</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
              <span style={{ font: "600 12px 'Plus Jakarta Sans'", color: '#1F2933' }}>
                {plan.date ? shortDate(plan.date) : 'TBD'}
              </span>
              {relBadge && (
                <span style={{ fontSize: 10, fontWeight: 700, color: relBadge === 'Today' || relBadge === 'Tomorrow' ? '#0E9C6B' : '#5B7CFA', background: relBadge === 'Today' || relBadge === 'Tomorrow' ? '#E4F6EE' : '#EEF2FF', borderRadius: 20, padding: '2px 6px' }}>
                  {relBadge}
                </span>
              )}
            </div>
            {plan.time_label && (
              <div style={{ font: "700 18px 'Fredoka'", color: '#1F2933', lineHeight: 1.15, marginBottom: 1 }}>{plan.time_label}</div>
            )}
            {dayName && (
              <div style={{ fontSize: 11, color: '#9A9087', marginTop: 1 }}>{dayName}</div>
            )}
          </div>
        </div>

        {/* ── Add to calendar ── */}
        {!past && plan.date && (
          <div
            onClick={() => {
              const d = new Date(plan.date)
              const pad = n => String(n).padStart(2, '0')
              const dtStr = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
              const params = new URLSearchParams({ title: plan.title || 'Plan', date: dtStr, place: plan.place || '' })
              window.open(`https://wmexrzdrsrbahprczmsv.supabase.co/functions/v1/create-ics?${params}`, '_system')
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', borderRadius: 12, padding: '10px 12px', marginBottom: 8, cursor: 'pointer' }}
          >
            <div style={{ width: 28, height: 28, borderRadius: 8, background: '#FFF4E3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#E8922A" strokeWidth="2.2" strokeLinecap="round"><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/><path d="M12 14v4M10 16h4"/></svg>
            </div>
            <span style={{ flex: 1, font: "600 13px 'Plus Jakarta Sans'", color: '#1F2933' }}>Add to calendar</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#C4BBB2" strokeWidth="2.2" strokeLinecap="round"><path d="m9 6 6 6-6 6"/></svg>
          </div>
        )}

        {/* ── RSVP card ── */}
        {!isHost && !past && (
          <div style={{ background: '#fff', borderRadius: 18, padding: '14px 13px 13px', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ font: "600 14px 'Plus Jakarta Sans'", color: '#1F2933' }}>
                {rsvp === 'invited' ? "Are you going?" : `You're ${rsvp === 'going' ? 'going' : rsvp === 'late' ? 'going (late)' : 'not going'}`}
              </span>
              {rsvp !== 'invited' && <span style={{ fontSize: 11.5, color: '#B6ADA4' }}>Tap to change</span>}
            </div>
            {/* RSVP buttons — Going is taller+filled, Late/Can't are outlined */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
              {RSVP_CFG.map(opt => {
                const sel = rsvp === opt.val
                const isGoing = opt.val === 'going'
                return (
                  <button
                    key={opt.val}
                    onClick={() => saveRsvp(opt.val)}
                    disabled={saving}
                    style={{
                      flex: 1,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      gap: isGoing ? 8 : 6,
                      padding: isGoing ? '18px 8px' : '12px 8px',
                      borderRadius: 14,
                      border: sel && !isGoing ? `1.5px solid ${opt.border}` : isGoing && sel ? 'none' : '1.5px solid #EDE7E0',
                      background: isGoing && sel ? '#0E9C6B' : sel ? opt.bg : '#fff',
                      cursor: saving ? 'default' : 'pointer',
                      transition: 'all .15s',
                    }}
                  >
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%',
                      background: isGoing && sel ? 'rgba(255,255,255,.22)' : sel ? opt.iconBg : '#F5F2EE',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isGoing && sel
                        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L19 7"/></svg>
                        : opt.icon(sel)
                      }
                    </div>
                    <span style={{ font: "600 12.5px 'Plus Jakarta Sans'", color: isGoing && sel ? '#fff' : sel ? opt.color : '#9A9087' }}>
                      {opt.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── WHO'S COMING ── */}
        <div style={{ background: '#EEF2FF', borderRadius: 18, padding: '12px 12px 14px', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px 10px' }}>
            <span style={{ font: "600 18px 'Fredoka'", color: '#1F2933' }}>Who's coming</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {isHost && !past && (
                <button onClick={() => setShowInviteMore(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1.5px solid #FF6B4A', borderRadius: 20, background: '#FFF1EC', font: "600 11.5px 'Plus Jakarta Sans'", color: '#FF6B4A', cursor: 'pointer' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#FF6B4A" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                  Invite
                </button>
              )}
              {goingCount > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#0E9C6B', background: '#E4F6EE', borderRadius: 20, padding: '2px 8px' }}>{goingCount} going</span>}
              {late.length > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#E8922A', background: '#FFF4E3', borderRadius: 20, padding: '2px 8px' }}>{late.length} late</span>}
              {cant.length > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#9A9087', background: '#F5F2EE', borderRadius: 20, padding: '2px 8px' }}>{cant.length} can't</span>}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ background: '#fff', borderRadius: 14, padding: '10px 14px' }}>
              <AttendeeRow name={isHost ? 'You' : plan.hostName} color={plan.hostColor} avatarUrl={plan.hostAvatarUrl} pill={{ label: 'Hosting', color: '#FF6B4A', bg: '#FFF1EC' }} onTap={plan.host !== myId ? () => setViewUserId(plan.host) : undefined}/>
            </div>
            {allAttendees.map(a => (
              <div key={a.invitee} style={{ background: '#fff', borderRadius: 14, padding: '10px 14px' }}>
                <AttendeeRow name={a.invitee === myId ? 'You' : a.name} color={a.avatar_color} avatarUrl={a.avatar_url} pill={PILL[a.rsvp] || PILL.invited} onTap={a.invitee !== myId ? () => setViewUserId(a.invitee) : undefined}/>
              </div>
            ))}
          </div>
          {(cant.length > 0 || pending.length > 0) && (
            <div onClick={() => setShowAll(s => !s)} style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: '#9A9087', cursor: 'pointer', textAlign: 'center', padding: '4px 0' }}>
              {showAll ? 'Show less' : `+${cant.length + pending.length} more`}
            </div>
          )}
        </div>

        {/* ── CHAT ── */}
        <div style={{ background: '#FFF8F0', borderRadius: 18, padding: '12px 12px 14px', marginBottom: 8 }}>
          <div style={{ font: "600 18px 'Fredoka'", color: '#1F2933', padding: '0 2px 10px' }}>Chat</div>
          {messages.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 14, padding: '18px 14px', textAlign: 'center', fontSize: 13, color: '#B6ADA4' }}>
              No messages yet — say hi!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {messages.map(msg => {
                const isMe = msg.sender === myId
                const sender = msgProfiles[msg.sender]
                const senderName = sender?.name || 'Unknown'
                return (
                  <div key={msg.id} style={{ display: 'flex', flexDirection: isMe ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 8 }}>
                    {!isMe && <Avatar url={sender?.avatar_url} name={senderName} color={sender?.avatar_color} size={28}/>}
                    <div style={{ maxWidth: '74%' }}>
                      {!isMe && <div style={{ fontSize: 11, fontWeight: 600, color: '#9A9087', marginBottom: 3, paddingLeft: 3 }}>{senderName}</div>}
                      {msg.photo_url ? (
                        <img
                          src={msg.photo_url}
                          onClick={() => setFullImg(msg.photo_url)}
                          style={{ display: 'block', maxWidth: '100%', borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px', cursor: 'pointer', objectFit: 'cover' }}
                        />
                      ) : (
                        <div style={{ background: isMe ? '#FF6B4A' : '#fff', color: isMe ? '#fff' : '#1F2933', borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px', padding: '10px 14px', font: "500 14px 'Plus Jakarta Sans'", lineHeight: 1.45 }}>
                          {msg.body}
                        </div>
                      )}
                      <div style={{ fontSize: 10.5, color: '#B6ADA4', marginTop: 3, textAlign: isMe ? 'right' : 'left', padding: isMe ? '0 4px 0 0' : '0 0 0 3px' }}>
                        {fmtTime(msg.created_at)}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={chatEndRef}/>
            </div>
          )}
        </div>

      </div>

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
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', font: "500 16px 'Plus Jakarta Sans'", color: '#1F2933', padding: '10px 0' }}
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
            <div style={{ font: "600 16px 'Fredoka'", color: '#1F2933', textAlign: 'center', marginBottom: 4 }}>Send a photo</div>
            <button onClick={() => { setShowPhotoSheet(false); pickAndSendPhoto(CameraSource.Camera) }}
              style={{ width: '100%', padding: 15, border: 'none', borderRadius: 16, background: '#FF6B4A', color: '#fff', font: "600 15px 'Fredoka'", cursor: 'pointer' }}>
              Take Photo
            </button>
            <button onClick={() => { setShowPhotoSheet(false); pickAndSendPhoto(CameraSource.Photos) }}
              style={{ width: '100%', padding: 15, border: '1.5px solid #E7DED7', borderRadius: 16, background: '#fff', color: '#1F2933', font: "600 15px 'Fredoka'", cursor: 'pointer' }}>
              Choose from Library
            </button>
            <button onClick={() => setShowPhotoSheet(false)}
              style={{ width: '100%', padding: 13, border: 'none', borderRadius: 16, background: 'transparent', color: '#9A9087', font: "600 14px 'Plus Jakarta Sans'", cursor: 'pointer' }}>
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
      {viewUserId && (
        <UserProfileSheet userId={viewUserId} myId={myId} onClose={() => setViewUserId(null)}/>
      )}
    </div>
  )
}

// ─── PlansScreen ──────────────────────────────────────────────────────────────
export default function PlansScreen({ session, openPlanId, onPlanOpened, refreshTrigger }) {
  const [plans, setPlans]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState('upcoming')
  const [selectedId, setSelectedId] = useState(null)
  const [startRsvp, setStartRsvp]   = useState(false)

  const selected = plans.find(p => p.id === selectedId) || null

  async function deletePlan(planId) {
    const plan = plans.find(p => p.id === planId)
    if (plan?.invitees?.length) {
      const { data: me } = await supabase.from('profiles').select('first_name, last_name').eq('id', session.user.id).single()
      const name = me ? `${me.first_name || ''} ${me.last_name || ''}`.trim() || 'The host' : 'The host'
      await supabase.from('notifications').insert(
        plan.invitees.map(i => ({
          recipient: i.invitee,
          actor: session.user.id,
          kind: 'plan_update',
          plan_id: null,
          body: `${name} cancelled "${plan.title}"`,
        }))
      )
    }
    await supabase.from('plans').delete().eq('id', planId)
    load()
  }

  useEffect(() => {
    if (!session || refreshTrigger === 0) return
    load(true)
  }, [refreshTrigger])

  useEffect(() => {
    if (!session) return
    load()
    const channel = supabase
      .channel('plans-invites')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'plan_invitees',
        filter: `invitee=eq.${session.user.id}`,
      }, () => { load() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [session])

  useEffect(() => {
    if (openPlanId && plans.length) {
      const target = plans.find(p => p.id === openPlanId)
      if (target) { setSelectedId(target.id); setStartRsvp(false); onPlanOpened?.() }
    }
  }, [openPlanId, plans])

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
      supabase.from('profiles').select('id, first_name, last_name, avatar_color, avatar_url').in('id', hostIds),
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
      }))
      .sort((a, b) => {
        if (!a.date && !b.date) return 0
        if (!a.date) return 1
        if (!b.date) return -1
        return new Date(a.date) - new Date(b.date)
      })

    setPlans(built)
    setLoading(false)
  }

  const upcoming = plans.filter(p => !isPast(p.date))
  const past     = plans.filter(p => isPast(p.date))
  const shown    = tab === 'upcoming' ? upcoming : past

  return (
    <div className="fade-up" style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {selected ? (
        <PlanDetail
          plan={selected}
          myId={session.user.id}
          startOnRsvp={startRsvp}
          onClose={() => setSelectedId(null)}
          onUpdated={load}
          onDeletePlan={() => deletePlan(selected.id)}
        />
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 22px 24px' }} className="no-scrollbar">

          <h2 style={{ margin: '6px 0 18px', font: "600 25px 'Fredoka'", color: '#1F2933' }}>Your plans</h2>

          <div style={{ display: 'flex', gap: 0, background: '#F0EBE5', borderRadius: 14, padding: 4, marginBottom: 22 }}>
            {[
              { key: 'upcoming', label: 'Upcoming', count: upcoming.length },
              { key: 'past',     label: 'Past',     count: past.length },
            ].map(t => {
              const active = tab === t.key
              return (
                <div key={t.key} onClick={() => setTab(t.key)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 10px', borderRadius: 11, background: active ? '#fff' : 'transparent', cursor: 'pointer', boxShadow: active ? '0 1px 4px rgba(0,0,0,.08)' : 'none', transition: 'all .15s' }}>
                  <span style={{ font: "600 16px 'Plus Jakarta Sans'", color: active ? '#1F2933' : '#9A9087' }}>
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
              <p style={{ margin: '0 0 6px', font: "600 17px 'Fredoka'", color: '#1F2933' }}>
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
                  onOpen={() => { setSelectedId(p.id); setStartRsvp(false) }}
                  onEditResponse={() => { setSelectedId(p.id); setStartRsvp(true) }}
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
    if (plan?.invitees?.length) {
      const { data: me } = await supabase.from('profiles').select('first_name, last_name').eq('id', session.user.id).single()
      const hostName = me ? `${me.first_name || ''} ${me.last_name || ''}`.trim() || 'The host' : 'The host'
      await supabase.from('notifications').insert(
        plan.invitees.map(i => ({
          recipient: i.invitee,
          actor: session.user.id,
          kind: 'plan_update',
          plan_id: null,
          body: `${hostName} cancelled "${plan.title}"`,
        }))
      )
    }
    await supabase.from('plans').delete().eq('id', planId)
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
