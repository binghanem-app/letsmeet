import { useState } from 'react'

function initials(name = '') {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function CategoryIcon({ type, color = '#1F2933', size = 22 }) {
  const s = { width: size, height: size, fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (type === 'coffee')   return <svg viewBox="0 0 24 24" style={s}><path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><path d="M6 2v2M10 2v2M14 2v2"/></svg>
  if (type === 'dinner')   return <svg viewBox="0 0 24 24" style={s}><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>
  if (type === 'movies')   return <svg viewBox="0 0 24 24" style={s}><rect x="2" y="2" width="20" height="20" rx="2.18"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5"/></svg>
  if (type === 'hangout')  return <svg viewBox="0 0 24 24" style={s}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
  if (type === 'outdoors') return <svg viewBox="0 0 24 24" style={s}><path d="M3 20h18M8 20V9l4-6 4 6v11"/><path d="M12 14h.01"/></svg>
  if (type === 'trip')     return <svg viewBox="0 0 24 24" style={s}><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21 4 19 2c-2-2-4-2-5.5-.5L10 5 1.8 6.2c-.5.1-.8.5-.6.9l2 4c.2.4.6.6 1 .4l2.5-1.2 2.7 2.7-1.2 2.5c-.2.4 0 .8.4 1l4 2c.4.2.8.1.9-.4Z"/></svg>
  return <svg viewBox="0 0 24 24" style={s}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
}

function extractCity(address) {
  if (!address) return null
  const parts = address.split(' - ').map(p => p.trim()).filter(Boolean)
  if (parts.length < 2) return null
  return parts[parts.length - 2] || null
}

function friendlyDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  const now = new Date()
  const tom = new Date(now); tom.setDate(now.getDate() + 1)
  if (d.toDateString() === now.toDateString()) return `Today · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  if (d.toDateString() === tom.toDateString()) return `Tomorrow · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

const CATEGORY_CONFIG = {
  Coffee:     { bg: '#FBF0DA', color: '#C8841A', type: 'coffee'   },
  Dinner:     { bg: '#F0EBFF', color: '#A78BFA', type: 'dinner'   },
  Movies:     { bg: '#FFEFE9', color: '#FF6B4A', type: 'movies'   },
  'Hang out': { bg: '#FDEAF3', color: '#EC6A9C', type: 'hangout'  },
  Outdoors:   { bg: '#E4F6EE', color: '#0E9C6B', type: 'outdoors' },
  Trip:       { bg: '#EAF1FF', color: '#5B7CFA', type: 'trip'     },
}

const RSVP_OPTIONS = [
  { val: 'going', label: 'Going', activeColor: '#0E9C6B', ghostBorder: '#CDEBDD', ghostText: '#0E9C6B', activeShadow: 'rgba(14,156,107,.25)' },
  { val: 'late',  label: 'Late',  activeColor: '#C8841A', ghostBorder: '#F0D9B5', ghostText: '#C8841A', activeShadow: 'rgba(200,132,26,.25)' },
  { val: 'cant',  label: "Can't", activeColor: '#E5484D', ghostBorder: '#F3C9C9', ghostText: '#E5484D', activeShadow: 'rgba(229,72,77,.25)' },
]

// Accepts data from both HomeScreen (pre-computed isHost/myRsvp/goingCount/inviteeProfiles)
// and PlansScreen (raw invitees array + myId).
export default function PlanCard({ plan, myId, onOpen, onRsvp, onDelete }) {
  const isHost = plan.isHost !== undefined ? plan.isHost : plan.host === myId
  const myInvite = plan.invitees?.find(i => i.invitee === myId)
  const myRsvp = plan.myRsvp || myInvite?.rsvp || (isHost ? 'going' : 'invited')

  const placeName = plan.place_name || plan.place || 'No location'
  const cityName = extractCity(plan.place_address)
  const dateVal = plan.starts_at || plan.date
  const past = dateVal && new Date(dateVal) < new Date()
  const isToday = dateVal && new Date(dateVal).toDateString() === new Date().toDateString()

  const cat = CATEGORY_CONFIG[plan.vibe] || { bg: '#FFEFE9', color: '#FF6B4A', type: null }
  const [showConfirm, setShowConfirm] = useState(false)
  const [saving, setSaving] = useState(false)

  // Avatar stack: prefer pre-computed inviteeProfiles, fall back to all invitees
  const going = plan.invitees?.filter(i => i.rsvp === 'going') || []
  const goingCount = plan.goingCount ?? (going.length + 1)
  const allInvitees = plan.invitees || []
  const extraCount = Math.max(0, (plan.inviteeProfiles ? plan.inviteeProfiles.length + 1 : allInvitees.length + 1) - 4)
  const avatarProfiles = plan.inviteeProfiles
    || allInvitees.slice(0, 3).map(i => ({ first_name: i.name, avatar_color: i.avatar_color }))
  const avatars = [
    { initials: initials(plan.hostName || ''), color: plan.hostColor || '#5B7CFA', url: plan.hostAvatarUrl || null },
    ...avatarProfiles.slice(0, 3).map(p => ({ initials: initials(p.first_name || ''), color: p.avatar_color || '#A78BFA', url: p.avatar_url || null })),
  ]

  const dateStr = dateVal ? friendlyDate(dateVal) : (plan.time_label || 'Date TBD')

  return (
    <div style={{ position: 'relative', marginBottom: 0 }}>
      {plan.unreadCount > 0 && !past && (
        <div style={{ position: 'absolute', top: -10, right: 10, zIndex: 10, display: 'flex', alignItems: 'center', gap: 4, background: '#FF6B4A', borderRadius: 20, padding: '4px 9px 4px 7px', boxShadow: '0 2px 8px rgba(255,107,74,.4)' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span style={{ color: '#fff', fontSize: 12, fontWeight: 700, lineHeight: 1 }}>{plan.unreadCount}</span>
        </div>
      )}
      <div onClick={past ? undefined : onOpen} style={{ background: '#fff', borderRadius: 18, boxShadow: '0 1px 3px rgba(0,0,0,.05), 0 8px 22px rgba(0,0,0,.05)', overflow: 'visible', opacity: past ? 0.45 : 1, filter: past ? 'grayscale(40%)' : 'none', cursor: past ? 'default' : 'pointer' }}>

        {/* Main info row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '16px 16px 13px' }}>
          <div style={{ width: 50, height: 50, borderRadius: 15, background: cat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <CategoryIcon type={cat.type} color={cat.color} size={26} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: '700 18px -apple-system', color: '#1A1A1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {placeName}
            </div>
            {cityName && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                <svg width="11" height="14" viewBox="0 0 9 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4.5 0C2.01 0 0 2.01 0 4.5c0 3.375 4.5 7.5 4.5 7.5S9 7.875 9 4.5C9 2.01 6.99 0 4.5 0zm0 6a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" fill="#B6ADA4"/>
                </svg>
                <span style={{ fontSize: 13, color: '#B6ADA4' }}>{cityName}</span>
              </div>
            )}
            <div style={{ fontSize: 13, color: isToday ? '#0E9C6B' : '#9A9087', marginTop: 2, fontWeight: isToday ? 600 : 400, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {dateStr}
              {past && <span style={{ background: '#ECE6E0', color: '#9A9087', fontSize: 11, fontWeight: 600, borderRadius: 20, padding: '2px 8px' }}>Ended</span>}
            </div>
            {plan.hostName && !isHost && (
              <div style={{ fontSize: 12, marginTop: 3 }}>
                <span style={{ color: '#B6ADA4' }}>Hosted by </span>
                <span style={{ color: past ? '#B6ADA4' : '#FF6B4A', fontWeight: 600 }}>{plan.hostName}</span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <div style={{ display: 'flex' }}>
              {avatars.slice(0, 4).map((a, i) => (
                a.url
                  ? <img key={i} src={a.url} style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', border: '2px solid #fff', marginLeft: i === 0 ? 0 : -8, display: 'block', zIndex: 4 - i, flexShrink: 0 }} />
                  : <div key={i} style={{ width: 24, height: 24, borderRadius: '50%', background: a.color, border: '2px solid #fff', marginLeft: i === 0 ? 0 : -8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9, fontWeight: 700, zIndex: 4 - i, flexShrink: 0 }}>
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

        {/* Host cancel confirm */}
        {isHost && showConfirm && (
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FEF0EE', border: '1px solid #FAD5CF', borderRadius: 12, margin: '0 14px 12px', padding: '10px 12px' }}>
            <span style={{ flex: 1, fontSize: 13, color: '#E14F2E', fontWeight: 600 }}>Cancel this plan for everyone?</span>
            <button onClick={() => { onDelete?.(); setShowConfirm(false) }} style={{ background: '#E14F2E', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 9, cursor: 'pointer' }}>Yes</button>
            <button onClick={() => setShowConfirm(false)} style={{ background: '#fff', color: '#7B7268', border: '1.5px solid #FAD5CF', fontSize: 12, fontWeight: 600, padding: '7px 10px', borderRadius: 9, cursor: 'pointer' }}>No</button>
          </div>
        )}

        {/* RSVP / host row */}
        {!past && (
          <div style={{ padding: '0 14px 14px' }}>
            {isHost ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, height: 40, borderRadius: 11, background: '#E4F6EE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ font: '600 14px -apple-system', color: '#0E9C6B' }}>You&apos;re hosting</span>
                </div>
                <button onClick={e => { e.stopPropagation(); setShowConfirm(s => !s) }}
                  style={{ width: 40, height: 40, borderRadius: 11, background: '#FEF0EE', border: '1px solid #FAD5CF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#E14F2E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                  </svg>
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                {RSVP_OPTIONS.map(r => {
                  const sel = myRsvp === r.val
                  return (
                    <button key={r.val} disabled={saving} onClick={async e => {
                      e.stopPropagation()
                      if (sel || saving) return
                      setSaving(true)
                      await onRsvp?.(r.val)
                      setSaving(false)
                    }}
                      style={{ flex: 1, height: 40, border: `1.5px solid ${sel ? r.activeColor : r.ghostBorder}`, borderRadius: 11, background: sel ? r.activeColor : '#fff', color: sel ? '#fff' : r.ghostText, font: '600 14px -apple-system', cursor: saving ? 'default' : 'pointer', transition: 'all .15s', boxShadow: sel ? `0 2px 8px ${r.activeShadow}` : 'none', opacity: saving && !sel ? 0.6 : 1 }}>
                      {r.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
