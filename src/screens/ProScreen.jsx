import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const DEMO_AVATARS = [
  { initials: 'JL', color: '#FF6B4A' },
  { initials: 'PS', color: '#5B7CFA' },
  { initials: 'AM', color: '#0E9C6B' },
  { initials: 'KR', color: '#F5A623' },
]

const FEATURES = [
  { bg: '#FFF1EC', emoji: '✨', title: 'Glowing card',        sub: 'Your plan stands out in the feed' },
  { bg: '#F0FBF7', emoji: '🎟️', title: 'Capacity + waitlist', sub: 'Set a limit, auto-waitlist the rest' },
  { bg: '#FFF8EC', emoji: '⏱️', title: 'Reply countdown',     sub: 'Set a deadline, everyone sees the timer' },
  { bg: '#F3EEFF', emoji: '🔁', title: 'Recurring plans',     sub: 'Weekly movie night, set it once' },
]

function pad(n) { return String(n).padStart(2, '0') }

function initials(first = '', last = '') {
  return ((first[0] || '') + (last[0] || '')).toUpperCase() || '?'
}

export default function ProScreen({ session }) {
  const [onList,  setOnList]  = useState(false)
  const [joining, setJoining] = useState(false)
  const [profile, setProfile] = useState(null)
  const [countdown, setCountdown] = useState({ h: '02', m: '00', s: '00' })

  useEffect(() => {
    function tick() {
      const now = new Date()
      const target = new Date()
      target.setHours(18, 0, 0, 0)
      if (target <= now) target.setDate(target.getDate() + 1)
      const diff = Math.max(0, target - now)
      setCountdown({
        h: pad(Math.floor(diff / 3600000)),
        m: pad(Math.floor((diff % 3600000) / 60000)),
        s: pad(Math.floor((diff % 60000) / 1000)),
      })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!session) return
    supabase.from('profiles').select('first_name, last_name, avatar_color, avatar_url').eq('id', session.user.id).single()
      .then(({ data }) => { if (data) setProfile(data) })
    supabase.from('pro_waitlist').select('id').eq('user_id', session.user.id).maybeSingle()
      .then(({ data }) => { if (data) setOnList(true) })
  }, [session])

  async function joinWaitlist() {
    if (!session || onList || joining) return
    setJoining(true)
    await supabase.from('pro_waitlist').upsert({ user_id: session.user.id }, { onConflict: 'user_id' })
    setOnList(true)
    setJoining(false)
  }

  const userInitials = initials(profile?.first_name, profile?.last_name)
  const userColor    = profile?.avatar_color || '#FF6B4A'

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#F9F4F0' }} className="no-scrollbar">

      {/* ── Hero (dark) ─────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(160deg, #1A1A1A 0%, #2D1A0E 100%)', position: 'relative', overflow: 'hidden', padding: '28px 22px 26px' }}>
        <div style={{ position: 'absolute', top: -70, right: -70, width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,107,74,.18) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -70, left: -70, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(245,166,35,.12) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, position: 'relative' }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg, #FF6B4A, #F5A623)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>👑</div>
          <div>
            <div style={{ font: '700 22px -apple-system', color: '#fff', lineHeight: 1.2 }}>
              Let's Meet <span className="shimmer-text">Pro</span>
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.45)', marginTop: 2 }}>Supercharge your social life</div>
          </div>
        </div>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(255,107,74,.18)', border: '1px solid rgba(255,107,74,.4)', borderRadius: 20, padding: '6px 13px', marginBottom: 18 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#FF6B4A', flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, color: '#FF9070', fontWeight: 600 }}>Coming soon · Be the first to know</span>
        </div>

        <button
          onClick={joinWaitlist}
          disabled={onList || joining}
          style={{ width: '100%', height: 50, borderRadius: 15, border: 'none', background: onList ? '#0E9C6B' : 'linear-gradient(135deg, #FF6B4A, #FF8A5B)', color: '#fff', font: '600 16px -apple-system', cursor: onList ? 'default' : 'pointer', boxShadow: onList ? 'none' : '0 6px 20px rgba(255,107,74,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, transition: 'all .3s' }}
        >
          <span style={{ fontSize: 18 }}>{onList ? '✅' : '🔔'}</span>
          {onList ? "You're on the list!" : joining ? 'Saving…' : "Notify me when it's ready"}
        </button>
        <div style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,.25)', marginTop: 9 }}>$2.99 / month when it launches</div>
      </div>

      {/* ── Light body ──────────────────────────────────────────── */}
      <div style={{ padding: '22px 18px 48px' }}>

        <div style={{ fontSize: 11, fontWeight: 700, color: '#9A9087', letterSpacing: .7, marginBottom: 20, paddingLeft: 2 }}>WHAT YOU GET</div>

        {/* ── Animated Pro card preview ── */}
        {/* Extra top margin so the floating badge pill isn't clipped */}
        <div style={{ animation: 'float 3s ease-in-out infinite', marginBottom: 14, paddingTop: 18 }}>

          {/* Outer container — overflow:visible so badge pill floats above */}
          <div style={{ position: 'relative' }}>

            {/* Floating "Pro host" badge pill */}
            <div style={{ position: 'absolute', top: -13, left: 14, zIndex: 20, background: '#1A1A1A', borderRadius: 20, padding: '4px 11px 4px 8px', display: 'flex', alignItems: 'center', gap: 5, boxShadow: '0 2px 10px rgba(0,0,0,.25)' }}>
              <span style={{ fontSize: 12 }}>👑</span>
              <span className="shimmer-text" style={{ fontWeight: 700, fontSize: 12 }}>Pro host</span>
            </div>

            {/* LED border wrapper */}
            <div style={{ position: 'relative', borderRadius: 19, padding: 2, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.05), 0 8px 22px rgba(0,0,0,.08)' }}>
              {/* Spinning gradient — single comet: transparent tail → coral → gold peak → coral → transparent */}
              <div style={{ position: 'absolute', inset: '-60%', borderRadius: '50%', background: 'conic-gradient(from 0deg, transparent 0%, transparent 60%, #FF6B4A 72%, #FFD580 80%, #FF6B4A 88%, transparent 100%)', animation: 'led-spin 2s linear infinite' }} />

              {/* Inner card */}
              <div style={{ position: 'relative', background: '#fff', borderRadius: 17, zIndex: 1, padding: 16 }}>

                {/* Venue row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <div style={{ width: 50, height: 50, borderRadius: 15, background: 'linear-gradient(135deg, #FF6B4A, #FF9070)', boxShadow: '0 4px 12px rgba(255,107,74,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>🎬</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ font: '700 16px -apple-system', color: '#1A1A1A' }}>Your plan</div>
                    <div style={{ fontSize: 13, color: '#9A9087', marginTop: 2 }}>Stands out in everyone's feed</div>
                  </div>
                  {/* User avatar + crown */}
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: userColor, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700 }}>{userInitials}</div>
                    )}
                    <div style={{ position: 'absolute', top: -18, left: '50%', transform: 'translateX(-50%)', fontSize: 20, lineHeight: 1 }}>👑</div>
                  </div>
                </div>

                {/* Ticket stub capacity bar */}
                <div style={{ position: 'relative', background: '#F9F4F0', borderRadius: 12, padding: '11px 14px', marginBottom: 12, overflow: 'visible' }}>
                  {/* Left notch */}
                  <div style={{ position: 'absolute', left: -8, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, borderRadius: '50%', background: '#F9F4F0', zIndex: 2, boxShadow: 'inset 2px 0 0 #EFE6DE' }} />
                  {/* Right notch */}
                  <div style={{ position: 'absolute', right: -8, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, borderRadius: '50%', background: '#F9F4F0', zIndex: 2, boxShadow: 'inset -2px 0 0 #EFE6DE' }} />
                  {/* Dashed perforation */}
                  <div style={{ position: 'absolute', left: 8, right: 8, top: '50%', height: 0, borderTop: '1.5px dashed #E0D8D0', zIndex: 1 }} />

                  {/* SPOTS label + count */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, position: 'relative', zIndex: 3 }}>
                    <span style={{ font: '700 12px -apple-system', color: '#9A9087', letterSpacing: .3 }}>SPOTS</span>
                    <span style={{ font: '700 13px -apple-system', color: '#1A1A1A' }}>4 of 10 taken</span>
                  </div>

                  {/* Avatar row */}
                  <div style={{ display: 'flex', gap: 5, position: 'relative', zIndex: 3 }}>
                    {DEMO_AVATARS.map((a, i) => (
                      <div key={i} style={{ width: 26, height: 26, borderRadius: '50%', background: a.color, border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9, fontWeight: 700 }}>{a.initials}</div>
                    ))}
                    {[...Array(6)].map((_, i) => (
                      <div key={i} style={{ width: 26, height: 26, borderRadius: 8, background: '#ECE6E0', border: '2px dashed #C4BBB2' }} />
                    ))}
                  </div>
                </div>

                {/* Reply countdown */}
                <div style={{ background: '#FFF1EC', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ font: '500 13px -apple-system', color: '#FF6B4A', flex: 1 }}>⏱️ Reply by 6:00 PM</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <div style={{ background: '#FF6B4A', borderRadius: 6, padding: '3px 7px' }}>
                      <span style={{ font: '700 14px/1 -apple-system', color: '#fff' }}>{countdown.h}</span>
                    </div>
                    <span className="colon-blink" style={{ font: '700 14px -apple-system', color: '#FF6B4A' }}>:</span>
                    <div style={{ background: '#FF6B4A', borderRadius: 6, padding: '3px 7px' }}>
                      <span style={{ font: '700 14px/1 -apple-system', color: '#fff' }}>{countdown.m}</span>
                    </div>
                    <span className="colon-blink" style={{ font: '700 14px -apple-system', color: '#FF6B4A' }}>:</span>
                    <div style={{ background: '#FF6B4A', borderRadius: 6, padding: '3px 7px' }}>
                      <span style={{ font: '700 14px/1 -apple-system', color: '#fff' }}>{countdown.s}</span>
                    </div>
                  </div>
                </div>

              </div>{/* /inner card */}
            </div>{/* /LED wrapper */}
          </div>{/* /outer position:relative */}
        </div>{/* /float animation */}

        {/* Feature pills */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {FEATURES.map((f, i) => (
            <div key={i} style={{ background: '#fff', borderRadius: 14, padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: f.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{f.emoji}</div>
              <div>
                <div style={{ font: '600 14.5px -apple-system', color: '#1A1A1A' }}>{f.title}</div>
                <div style={{ fontSize: 12.5, color: '#9A9087', marginTop: 2 }}>{f.sub}</div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
