import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import welcomeUrl from '../assets/onboarding-welcome.png'

export default function OnboardingScreen({ session, onDone }) {
  const [first, setFirst]     = useState('')
  const [last, setLast]       = useState('')
  const [username, setUsername] = useState('')
  const [err, setErr]         = useState('')
  const [saving, setSaving]   = useState(false)
  const usernameRef = useRef(null)

  async function save() {
    const cleanFirst = first.trim()
    const cleanLast  = last.trim()
    const cleanUser  = username.trim().toLowerCase()

    if (!cleanFirst) { setErr('Please enter your first name.'); return }
    if (!cleanUser)  { setErr('Please choose a username.'); return }
    if (!/^[a-z0-9_]{3,}$/.test(cleanUser)) {
      setErr('Username: letters, numbers and underscores only · at least 3 characters.')
      return
    }

    setSaving(true); setErr('')

    // check uniqueness
    const { data: taken } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', cleanUser)
      .neq('id', session.user.id)

    if (taken?.length) {
      setErr('That username is already taken — try another.')
      setSaving(false)
      return
    }

    const { error } = await supabase
      .from('profiles')
      .update({ first_name: cleanFirst, last_name: cleanLast, username: cleanUser })
      .eq('id', session.user.id)

    setSaving(false)
    if (error) {
      // A unique-username violation can race past the pre-check above — guide the
      // user to change it instead of a dead-end "try again".
      const m = (error.message || '').toLowerCase()
      if (error.code === '23505' || m.includes('duplicate') || m.includes('unique')) {
        setErr('That username is already taken — try another.')
      } else {
        setErr('Could not save. Please try again.')
      }
      return
    }
    onDone()
  }

  const canSave = first.trim() && username.trim()

  return (
    <div className="fade-up" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#FBF7F4' }}>

      {/* Everything lives in ONE scroll container — including the CTA — so the
          button is always reachable above the keyboard. The app runs with
          Keyboard.resize "none" + ios.scrollEnabled false, so a footer button
          pinned outside the scroll area ends up hidden under the keyboard, which
          left first-time users unable to finish onboarding (the reviewer's
          account authenticated but never got a name → "stuck after login"). */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 28px', WebkitOverflowScrolling: 'touch' }} className="no-scrollbar">

        {/* top illustration area */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 52, paddingBottom: 32 }}>
          <img src={welcomeUrl} alt="" style={{ width: 132, marginBottom: 12 }} />
          <h1 style={{ margin: '0 0 8px', font: "600 28px Fredoka, -apple-system", color: '#1F2933', textAlign: 'center' }}>
            Welcome to Let's Meet
          </h1>
          <p style={{ margin: 0, fontSize: 14.5, color: '#9A9087', textAlign: 'center', lineHeight: 1.6 }}>
            Quick setup — takes 30 seconds.{'\n'}You can change all of this later.
          </p>
        </div>

        {/* form */}
        <Field label="FIRST NAME">
          <Input
            value={first}
            onChange={v => { setFirst(v); setErr('') }}
            placeholder="Your first name"
            autoFocus
            onNext={() => usernameRef.current?.focus()}
          />
        </Field>

        <Field label="LAST NAME" hint="Optional">
          <Input
            value={last}
            onChange={v => { setLast(v); setErr('') }}
            placeholder="Your last name"
          />
        </Field>

        <Field label="USERNAME" hint="How friends find you">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: `1.5px solid ${username ? '#FF6B4A' : '#EBE2DB'}`, borderRadius: 16, padding: '4px 16px' }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#B6ADA4' }}>@</span>
            <input
              ref={usernameRef}
              value={username}
              onChange={e => { setUsername(e.target.value); setErr('') }}
              onKeyDown={e => { if (e.key === 'Enter' && canSave && !saving) save() }}
              placeholder="choose_username"
              autoCapitalize="none"
              autoCorrect="off"
              enterKeyHint="done"
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', font: "600 16px -apple-system", color: '#1F2933', padding: '11px 0' }}
            />
          </div>
          <div style={{ fontSize: 12, color: '#B6ADA4', marginTop: 6, paddingLeft: 2 }}>
            Letters, numbers and underscores · at least 3 characters
          </div>
        </Field>

        {err && (
          <div style={{ background: '#FEE9E9', border: '1px solid #FACAC4', borderRadius: 13, padding: '11px 14px', marginBottom: 20, fontSize: 13.5, color: '#E14F2E', lineHeight: 1.5 }}>
            {err}
          </div>
        )}

        {/* CTA — inside the scroll area so the keyboard can never hide it */}
        <button
          onClick={save}
          disabled={!canSave || saving}
          style={{ width: '100%', padding: 17, border: 'none', borderRadius: 18, background: canSave && !saving ? '#FF6B4A' : '#E7DED7', color: '#fff', font: "600 17px -apple-system", cursor: canSave && !saving ? 'pointer' : 'default', boxShadow: canSave && !saving ? '0 12px 26px -10px rgba(255,107,74,.75)' : 'none', transition: 'all .2s' }}
        >
          {saving ? 'Saving…' : "Let's go 🎉"}
        </button>

        {/* bottom spacer so the button can scroll clear of the keyboard */}
        <div style={{ height: 48, flexShrink: 0 }} />
      </div>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#B6ADA4', letterSpacing: .7 }}>{label}</span>
        {hint && <span style={{ fontSize: 12, color: '#C4BBB2' }}>{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function Input({ value, onChange, placeholder, autoFocus, onNext }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', background: '#fff', border: `1.5px solid ${value ? '#FF6B4A' : '#EBE2DB'}`, borderRadius: 16, padding: '4px 16px' }}>
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        enterKeyHint={onNext ? 'next' : 'done'}
        onKeyDown={e => e.key === 'Enter' && onNext?.()}
        style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', font: "600 15px -apple-system", color: '#1F2933', padding: '13px 0' }}
      />
    </div>
  )
}
