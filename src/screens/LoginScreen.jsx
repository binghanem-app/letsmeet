import { useState } from 'react'
import { supabase } from '../lib/supabase'

// ─── icon helpers ──────────────────────────────────────────────────────────
const PeopleIcon = () => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
    <circle cx="8.5" cy="9" r="3.4" fill="#fff"/>
    <circle cx="15.5" cy="9" r="3.4" fill="#fff" opacity=".7"/>
    <path d="M3 19c0-2.8 2.4-4.6 5.5-4.6S14 16.2 14 19"
          stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
  </svg>
)

const EmailIcon = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
       stroke="#fff" strokeWidth="2">
    <rect x="3" y="5" width="18" height="14" rx="3"/>
    <path d="m4 7 8 5 8-5" strokeLinecap="round"/>
  </svg>
)

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.5 12.2c0-.7-.06-1.4-.18-2.05H12v3.9h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.05-1.9 3.3-4.7 3.3-7.85z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.5-2.7c-1 .67-2.26 1.05-3.78 1.05-2.9 0-5.36-1.95-6.24-4.58H2.13v2.8A11 11 0 0 0 12 23z"/>
    <path fill="#FBBC05" d="M5.76 14.12a6.6 6.6 0 0 1 0-4.22V7.1H2.13a11 11 0 0 0 0 9.82z"/>
    <path fill="#EA4335" d="M12 4.96c1.62 0 3.06.56 4.2 1.64l3.12-3.12C17.45 1.7 14.96.7 12 .7A11 11 0 0 0 2.13 7.1l3.63 2.8C6.64 7.27 9.1 4.96 12 4.96z"/>
  </svg>
)

// ─── Email modal ────────────────────────────────────────────────────────────
function EmailModal({ onClose, onDone }) {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'signup') {
        const { error: err } = await supabase.auth.signUp({ email, password })
        if (err) throw err
        setSent(true)
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password })
        if (err) throw err
        onDone()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    // backdrop
    <div
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0, zIndex: 60,
        background: 'rgba(20,24,30,.5)',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      }}
    >
      {/* sheet */}
      <div
        onClick={e => e.stopPropagation()}
        className="sheet-up"
        style={{
          background: '#FBF7F4', borderRadius: '28px 28px 0 0',
          padding: '10px 24px 36px',
        }}
      >
        {/* drag handle */}
        <div style={{
          width: 42, height: 5, borderRadius: 5, background: '#E0D7CF',
          margin: '0 auto 20px',
        }}/>

        {sent ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%', background: '#E4F6EE',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none"
                   stroke="#0E9C6B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 13 4 4L19 7"/>
              </svg>
            </div>
            <h3 style={{ margin: '0 0 8px', font: "600 22px 'Fredoka'", color: '#1F2933' }}>
              Check your email
            </h3>
            <p style={{ margin: '0 0 24px', fontSize: 14.5, color: '#7B7268', lineHeight: 1.5 }}>
              We sent a confirmation link to <b style={{ color: '#1F2933' }}>{email}</b>.
              Click it to finish signing up.
            </p>
            <button onClick={onClose} style={btnOutline}>Got it</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <h3 style={{ margin: '0 0 6px', font: "600 22px 'Fredoka'", color: '#1F2933' }}>
              {mode === 'signup' ? 'Create account' : 'Sign in'}
            </h3>
            <p style={{ margin: '0 0 22px', fontSize: 14, color: '#7B7268' }}>
              {mode === 'signup'
                ? 'Use an email and password.'
                : 'Welcome back.'}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginBottom: 14 }}>
              <input
                type="email" required placeholder="Email address"
                value={email} onChange={e => setEmail(e.target.value)}
                style={inputStyle}
              />
              <input
                type="password" required placeholder="Password" minLength={8}
                value={password} onChange={e => setPassword(e.target.value)}
                style={inputStyle}
              />
            </div>

            {error && (
              <p style={{ margin: '0 0 12px', fontSize: 13, color: '#E14F2E', fontWeight: 600 }}>
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} style={btnPrimary}>
              {loading ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
            </button>

            <button
              type="button"
              onClick={() => { setMode(m => m === 'signup' ? 'signin' : 'signup'); setError('') }}
              style={{ ...btnOutline, marginTop: 10 }}
            >
              {mode === 'signup' ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

// ─── shared button styles ───────────────────────────────────────────────────
const btnPrimary = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 11,
  width: '100%', padding: 16, border: 'none', borderRadius: 17,
  background: '#FF6B4A', color: '#fff',
  font: "600 16px 'Plus Jakarta Sans'", cursor: 'pointer',
  boxShadow: '0 10px 22px -8px rgba(255,107,74,.7)',
}
const btnOutline = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 11,
  width: '100%', padding: 16, border: '1.5px solid #E7DED7', borderRadius: 17,
  background: '#fff', color: '#1F2933',
  font: "600 16px 'Plus Jakarta Sans'", cursor: 'pointer',
}
const inputStyle = {
  width: '100%', border: '1.5px solid #EBE2DB', borderRadius: 14,
  padding: '14px 15px', font: "500 15px 'Plus Jakarta Sans'",
  color: '#1F2933', outline: 'none', background: '#fff',
}

// ─── LoginScreen ─────────────────────────────────────────────────────────────
export default function LoginScreen({ onLogin, onPrivacy, onTerms }) {
  const [showEmail, setShowEmail] = useState(false)
  const [loadingGoogle, setLoadingGoogle] = useState(false)
  const [error, setError] = useState('')

  async function handleGoogle() {
    setError('')
    setLoadingGoogle(true)
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (err) { setError(err.message); setLoadingGoogle(false) }
    // on success the browser redirects — no further action needed
  }

  return (
    <div
      className="fade-up"
      style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        padding: '6px 26px 30px',
        background: 'linear-gradient(180deg,#FFEFE9 0%,#FBF7F4 52%)',
      }}
    >
      {/* logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 12, background: '#FF6B4A',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 6px 14px rgba(255,107,74,.4)',
        }}>
          <PeopleIcon />
        </div>
        <span style={{ font: "600 21px 'Fredoka'", color: '#1F2933' }}>Let's Meet</span>
      </div>

      {/* hero */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22, padding: '14px 0' }}>

        {/* social-proof card */}
        <div style={{
          position: 'relative', height: 172,
          background: '#fff', borderRadius: 28,
          border: '1px solid #F1E8E2',
          boxShadow: '0 18px 40px -22px rgba(20,24,30,.25)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16, overflow: 'hidden',
        }}>
          {/* decorative circles */}
          <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: '#FFEFE9' }}/>
          <div style={{ position: 'absolute', bottom: -40, left: -25, width: 110, height: 110, borderRadius: '50%', background: '#EAF1FF' }}/>

          {/* avatar stack */}
          <div style={{ display: 'flex', zIndex: 2 }}>
            {[
              ['AM', '#5B7CFA'], ['JL', '#12B886'],
              ['PS', '#F5A623'], ['+9', '#FF6B4A'],
            ].map(([label, color]) => (
              <div key={label} style={{
                width: 50, height: 50, borderRadius: '50%', background: color,
                border: '3px solid #fff', display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: '#fff',
                font: `600 ${label.startsWith('+') ? '15px' : '17px'} 'Plus Jakarta Sans'`,
                marginLeft: label === 'AM' ? 0 : -14,
              }}>
                {label}
              </div>
            ))}
          </div>

          {/* pill */}
          <div style={{
            zIndex: 2, background: '#F4F7EE', color: '#0E9C6B',
            font: "600 13px 'Plus Jakarta Sans'",
            padding: '7px 14px', borderRadius: 20,
          }}>
            50k+ plans made this month
          </div>
        </div>

        {/* headline */}
        <div>
          <h1 style={{ margin: '0 0 10px', font: "600 33px/1.12 'Fredoka'", color: '#1F2933', letterSpacing: '-.3px' }}>
            Make plans that<br/>actually happen.
          </h1>
          <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.5, color: '#7B7268' }}>
            Group your friends, pick a place, pick a time, and see who's in — in a couple of taps.
          </p>
        </div>
      </div>

      {/* auth buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {error && (
          <p style={{ margin: '0 0 4px', fontSize: 13, color: '#E14F2E', fontWeight: 600, textAlign: 'center' }}>
            {error}
          </p>
        )}

        <button onClick={() => { setShowEmail(true); setError('') }} style={btnPrimary}>
          <EmailIcon/>
          Continue with email
        </button>

        <button onClick={handleGoogle} disabled={loadingGoogle} style={btnOutline}>
          {loadingGoogle
            ? <span style={{ fontSize: 14, color: '#7B7268' }}>Redirecting…</span>
            : <><GoogleIcon/> Continue with Google</>}
        </button>

        {/* Apple — placeholder until keys are configured */}
        <button disabled style={{ ...btnOutline, opacity: .45, cursor: 'not-allowed', gap: 10 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#1F2933"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
          Continue with Apple
          <span style={{ fontSize: 11, background: '#F5F2EE', color: '#9A9087', borderRadius: 6, padding: '2px 7px', marginLeft: 2 }}>Soon</span>
        </button>

        <p style={{ margin: '8px 0 0', textAlign: 'center', fontSize: 12, color: '#A79E95', lineHeight: 1.5 }}>
          By continuing you agree to our{' '}
          <span onClick={onTerms} style={{ color: '#7B7268', fontWeight: 700, cursor: 'pointer' }}>Terms</span>
          {' '}&amp;{' '}
          <span onClick={onPrivacy} style={{ color: '#7B7268', fontWeight: 700, cursor: 'pointer' }}>Privacy Policy</span>
        </p>
      </div>

      {/* email modal */}
      {showEmail && (
        <EmailModal
          onClose={() => setShowEmail(false)}
          onDone={onLogin}
        />
      )}
    </div>
  )
}
