import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Capacitor } from '@capacitor/core'
import logoUrl from '../assets/logo.png'
import bannerUrl from '../assets/login-banner.png'

// ─── icon helpers ──────────────────────────────────────────────────────────
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
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [sentKind, setSentKind] = useState('signup') // 'signup' | 'reset'

  async function sendReset() {
    setError('')
    if (!email) { setError('Enter your email address above first.'); return }
    setLoading(true)
    try {
      const isNative = window.location.protocol === 'capacitor:' || window.location.protocol === 'letsmeet:'
      const redirectTo = isNative ? 'letsmeet://localhost' : window.location.origin
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
      if (err) throw err
      setSentKind('reset'); setSent(true)
    } catch (err) {
      setError(err.message || 'Could not send the reset email. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (mode === 'signup' && password !== confirm) {
      setError("Passwords don't match")
      return
    }
    setLoading(true)
    try {
      if (mode === 'signup') {
        // Send the confirmation link back to the app's scheme on native so the
        // user lands back in the app (not stranded in Safari) after confirming.
        const isNative = window.location.protocol === 'capacitor:' || window.location.protocol === 'letsmeet:'
        const emailRedirectTo = isNative ? 'letsmeet://localhost' : window.location.origin
        const { error: err } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo } })
        if (err) throw err
        setSentKind('signup'); setSent(true)
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password })
        if (err) throw err
        onDone()
      }
    } catch (err) {
      const msg = err.message || ''
      if (msg.toLowerCase().includes('not confirmed') || msg.toLowerCase().includes('email not confirmed'))
        setError('Please check your email and click the confirmation link first.')
      else if (msg.toLowerCase().includes('invalid login') || msg.toLowerCase().includes('invalid credentials'))
        setError('Wrong email or password.')
      else if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('user already'))
        setError('An account with this email already exists. Try signing in instead.')
      else
        setError(msg)
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
            <h3 style={{ margin: '0 0 8px', font: "600 22px -apple-system", color: '#1F2933' }}>
              Check your email
            </h3>
            <p style={{ margin: '0 0 24px', fontSize: 14.5, color: '#7B7268', lineHeight: 1.5 }}>
              {sentKind === 'reset' ? (
                <>We sent a password reset link to <b style={{ color: '#1F2933' }}>{email}</b>.
                  Open it to set a new password.</>
              ) : (
                <>We sent a confirmation link to <b style={{ color: '#1F2933' }}>{email}</b>.
                  Click it to finish signing up.</>
              )}
            </p>
            <button onClick={onClose} style={btnOutline}>Got it</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <h3 style={{ margin: '0 0 6px', font: "600 22px -apple-system", color: '#1F2933' }}>
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
              {mode === 'signup' && (
                <input
                  type="password" required placeholder="Confirm password" minLength={8}
                  value={confirm} onChange={e => setConfirm(e.target.value)}
                  style={{ ...inputStyle, borderColor: confirm && confirm !== password ? '#E14F2E' : inputStyle.borderColor }}
                />
              )}
            </div>

            {mode === 'signin' && (
              <div style={{ textAlign: 'right', marginBottom: 14, marginTop: -4 }}>
                <button type="button" onClick={sendReset} disabled={loading}
                  style={{ border: 'none', background: 'none', padding: 0, font: '600 13.5px -apple-system', color: '#FF6B4A', cursor: 'pointer' }}>
                  Forgot password?
                </button>
              </div>
            )}

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
              onClick={() => { setMode(m => m === 'signup' ? 'signin' : 'signup'); setError(''); setConfirm('') }}
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
  font: "600 16px -apple-system", cursor: 'pointer',
  boxShadow: '0 10px 22px -8px rgba(255,107,74,.7)',
}
const btnOutline = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 11,
  width: '100%', padding: 16, border: '1.5px solid #E7DED7', borderRadius: 17,
  background: '#fff', color: '#1F2933',
  font: "600 16px -apple-system", cursor: 'pointer',
}
const inputStyle = {
  width: '100%', border: '1.5px solid #EBE2DB', borderRadius: 14,
  padding: '13px 15px', font: "500 16px -apple-system",
  color: '#1F2933', outline: 'none', background: '#fff',
}

// ─── LoginScreen ─────────────────────────────────────────────────────────────
export default function LoginScreen({ onLogin, onPrivacy, onTerms }) {
  const [showEmail, setShowEmail] = useState(false)
  const [loadingGoogle, setLoadingGoogle] = useState(false)
  const [loadingApple, setLoadingApple] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const reset = () => {
      if (document.visibilityState === 'visible') {
        setLoadingGoogle(false)
        setLoadingApple(false)
      }
    }
    document.addEventListener('visibilitychange', reset)
    return () => document.removeEventListener('visibilitychange', reset)
  }, [])

  const isNative = window.location.protocol === 'capacitor:' || window.location.protocol === 'letsmeet:'
  const redirectTo = isNative ? 'letsmeet://localhost' : window.location.origin

  async function handleGoogle() {
    setError('')
    setLoadingGoogle(true)
    try {
      if (Capacitor.isNativePlatform()) {
        // On native we must NOT let supabase-js navigate the WKWebView to Google:
        // the OAuth redirect back to letsmeet://localhost would happen *inside* the
        // webview and never fire the appUrlOpen deep-link listener (so the session is
        // lost and the user lands back on the login page). Instead get the URL with
        // skipBrowserRedirect, open it in an external Safari view, and let the
        // appUrlOpen handler in App.jsx capture the returned tokens + close the browser.
        const { data, error: err } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo,
            skipBrowserRedirect: true,
            // Force Google's account chooser every time. Without this, the Safari
            // view reuses Google's cookie and silently re-logs the last account,
            // making it impossible to switch to a different Gmail.
            queryParams: { prompt: 'select_account' },
          },
        })
        if (err) throw err
        if (data?.url) {
          const { Browser } = await import('@capacitor/browser')
          // If the user dismisses the Safari view (tapped "Done"/cancel) without
          // completing sign-in, no deep link fires — clear loading so the button
          // isn't stuck on "Redirecting…" forever with no way to retry.
          const finished = await Browser.addListener('browserFinished', () => {
            setLoadingGoogle(false)
            finished.remove()
          })
          await Browser.open({ url: data.url })
        }
        // Session is set via the appUrlOpen listener; loading clears on return.
      } else {
        const { error: err } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo, queryParams: { prompt: 'select_account' } },
        })
        if (err) throw err
      }
    } catch (err) {
      setError(err?.message || 'Google sign-in failed. Please try again.')
      setLoadingGoogle(false)
    }
  }

  async function handleApple() {
    setError('')
    setLoadingApple(true)
    try {
      if (Capacitor.isNativePlatform()) {
        // Web-based Apple OAuth in an external Safari view — same approach as
        // Google. This deliberately does NOT use native Sign in with Apple: the
        // native ASAuthorization path failed with error 1000 because the App ID's
        // SIWA capability was never authorized in the signing profile. Safari
        // OAuth needs no entitlement and works on iPhone and iPad compat mode.
        const { data, error: err } = await supabase.auth.signInWithOAuth({
          provider: 'apple',
          options: { redirectTo, skipBrowserRedirect: true },
        })
        if (err) throw err
        if (data?.url) {
          const { Browser } = await import('@capacitor/browser')
          // Clear loading if the user dismisses the Safari view without finishing.
          const finished = await Browser.addListener('browserFinished', () => {
            setLoadingApple(false)
            finished.remove()
          })
          await Browser.open({ url: data.url })
        }
        // Session is set via the appUrlOpen listener in App.jsx; loading clears on return.
      } else {
        const { error: err } = await supabase.auth.signInWithOAuth({
          provider: 'apple',
          options: { redirectTo },
        })
        if (err) throw err
      }
    } catch (err) {
      setError(err?.message || 'Apple sign-in failed. Please try again.')
      setLoadingApple(false)
    }
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 8 }}>
        <img src={logoUrl} alt="Let's Meet" style={{ width: 44, height: 44, filter: 'drop-shadow(0 6px 14px rgba(255,107,74,.4))' }} />
        <span style={{ font: "600 21px Fredoka, -apple-system", color: '#1F2933' }}>Let's Meet</span>
      </div>

      {/* hero */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22, padding: '14px 0' }}>

        {/* hero illustration card */}
        <div style={{
          background: '#fff', borderRadius: 28,
          border: '1px solid #F1E8E2',
          boxShadow: '0 18px 40px -22px rgba(20,24,30,.25)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          overflow: 'hidden', padding: '14px 14px 18px',
        }}>
          <img src={bannerUrl} alt="" style={{ width: '100%', objectFit: 'contain' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#FFEAE2', color: '#FF6B4A', font: '600 13.5px Fredoka, -apple-system', padding: '8px 16px', borderRadius: 22, marginTop: 2 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#FF6B4A"><path d="M12 21s-7.5-4.6-10-9.2C.3 8.4 1.6 4.8 5 4.1c2-.4 3.8.5 5 2 1.2-1.5 3-2.4 5-2 3.4.7 4.7 4.3 3 7.7C19.5 16.4 12 21 12 21z"/></svg>
            Plan meetups in seconds
          </div>
        </div>

        {/* headline */}
        <div>
          <h1 style={{ margin: '0 0 10px', font: "600 31px/1.16 Fredoka, -apple-system", color: '#1F2933', letterSpacing: '-.2px' }}>
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

        {/* Google + Apple sign-in temporarily removed for App Store submission.
            Offering ONLY email avoids the Sign in with Apple requirement
            (Guideline 4.8 only applies when other social logins are present).
            handleGoogle / handleApple are kept below — re-add the two buttons
            here to restore them in a later update. */}

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
