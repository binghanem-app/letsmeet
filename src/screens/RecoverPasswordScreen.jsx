import { useState } from 'react'
import { supabase } from '../lib/supabase'
import logoUrl from '../assets/logo.png'

// Shown when the app is opened from a password-reset email link (Supabase fires
// PASSWORD_RECOVERY / the deep link carries type=recovery). The user is in a
// temporary recovery session, so updateUser can set a new password.
export default function RecoverPasswordScreen({ onDone }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Use at least 8 characters.'); return }
    if (password !== confirm) { setError("Passwords don't match"); return }
    setLoading(true)
    try {
      const { error: err } = await supabase.auth.updateUser({ password })
      if (err) throw err
      onDone()
    } catch (err) {
      setError(err.message || 'Could not update your password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 26px', background: 'linear-gradient(180deg,#FFEFE9 0%,#FBF7F4 52%)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 26 }}>
        <img src={logoUrl} alt="" style={{ width: 44, height: 44, filter: 'drop-shadow(0 6px 14px rgba(255,107,74,.4))' }} />
        <span style={{ font: "600 21px Fredoka, -apple-system", color: '#1F2933' }}>Let's Meet</span>
      </div>

      <h2 style={{ margin: '0 0 6px', font: '600 24px -apple-system', color: '#1F2933' }}>Set a new password</h2>
      <p style={{ margin: '0 0 22px', fontSize: 14.5, color: '#7B7268', lineHeight: 1.5 }}>
        Choose a new password for your account.
      </p>

      <form onSubmit={submit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginBottom: 14 }}>
          <input type="password" required placeholder="New password" minLength={8}
            value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} />
          <input type="password" required placeholder="Confirm new password" minLength={8}
            value={confirm} onChange={e => setConfirm(e.target.value)}
            style={{ ...inputStyle, borderColor: confirm && confirm !== password ? '#E14F2E' : inputStyle.borderColor }} />
        </div>

        {error && (
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#E14F2E', fontWeight: 600 }}>{error}</p>
        )}

        <button type="submit" disabled={loading} style={btnPrimary}>
          {loading ? 'Please wait…' : 'Update password'}
        </button>
      </form>
    </div>
  )
}

const btnPrimary = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 11,
  width: '100%', padding: 16, border: 'none', borderRadius: 17,
  background: '#FF6B4A', color: '#fff', font: '600 16px -apple-system',
  cursor: 'pointer', boxShadow: '0 10px 22px -8px rgba(255,107,74,.7)',
}
const inputStyle = {
  width: '100%', border: '1.5px solid #EBE2DB', borderRadius: 14,
  padding: '13px 15px', font: '500 16px -apple-system',
  color: '#1F2933', outline: 'none', background: '#fff',
}
