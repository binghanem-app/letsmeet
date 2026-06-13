import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import Avatar from '../components/Avatar'

// ─── helpers ─────────────────────────────────────────────────────────────────
function initials(name = '') {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
}

// ─── Section / Row building blocks ───────────────────────────────────────────
function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      {label && <div style={{ fontSize: 11, fontWeight: 700, color: '#B6ADA4', letterSpacing: .7, marginBottom: 8, paddingLeft: 4 }}>{label}</div>}
      <div style={{ background: '#fff', border: '1px solid #F1E8E2', borderRadius: 18, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  )
}

function Row({ icon, iconBg, label, value, onPress, toggle, toggled, onToggle, danger, last, muted }) {
  return (
    <div
      onClick={muted ? undefined : onPress}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: last ? 'none' : '1px solid #F5F0EB', cursor: muted ? 'default' : onPress ? 'pointer' : 'default', opacity: muted ? 0.42 : 1, transition: 'opacity .2s' }}
    >
      {icon && (
        <div style={{ width: 34, height: 34, borderRadius: 10, background: iconBg || '#F5F2EE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {icon}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: "600 14.5px 'Plus Jakarta Sans'", color: danger ? '#E14F2E' : '#1F2933', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
        {value && <div style={{ fontSize: 12.5, color: '#9A9087', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>}
      </div>
      {toggle ? (
        <div onClick={muted ? undefined : e => { e.stopPropagation(); onToggle?.() }} style={{ width: 44, height: 26, borderRadius: 13, background: toggled && !muted ? '#FF6B4A' : '#E0D7CF', position: 'relative', cursor: muted ? 'default' : 'pointer', flexShrink: 0, transition: 'background .2s' }}>
          <div style={{ position: 'absolute', top: 3, left: toggled && !muted ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.2)', transition: 'left .2s' }}/>
        </div>
      ) : onPress ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C4BBB2" strokeWidth="2.2" strokeLinecap="round"><path d="m9 6 6 6-6 6"/></svg>
      ) : null}
    </div>
  )
}

// ─── Bottom sheet wrapper ─────────────────────────────────────────────────────
function Sheet({ onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(20,24,30,.45)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} className="sheet-up" style={{ background: '#FBF7F4', borderRadius: '28px 28px 0 0', maxHeight: '88%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ width: 42, height: 5, borderRadius: 5, background: '#E0D7CF', margin: '12px auto 0', flexShrink: 0 }}/>
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px 32px' }} className="no-scrollbar">
          {children}
        </div>
      </div>
    </div>
  )
}

function SheetTitle({ children }) {
  return <h3 style={{ margin: '0 0 6px', font: "600 22px 'Fredoka'", color: '#1F2933' }}>{children}</h3>
}
function SheetSub({ children }) {
  return <p style={{ margin: '0 0 20px', fontSize: 13.5, color: '#9A9087', lineHeight: 1.5 }}>{children}</p>
}
function FieldLabel({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: '#B6ADA4', letterSpacing: .7, marginBottom: 7 }}>{children}</div>
}
function TextInput({ value, onChange, placeholder, prefix, type = 'text', autoFocus }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1.5px solid #EBE2DB', borderRadius: 14, padding: '4px 14px', marginBottom: 14 }}>
      {prefix && <span style={{ fontSize: 15, color: '#B6ADA4', fontWeight: 700 }}>{prefix}</span>}
      <input
        autoFocus={autoFocus}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', font: "600 14.5px 'Plus Jakarta Sans'", color: '#1F2933', padding: '13px 0' }}
      />
    </div>
  )
}
function PrimaryBtn({ children, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ width: '100%', padding: 15, border: 'none', borderRadius: 16, background: disabled ? '#E7DED7' : '#FF6B4A', color: '#fff', font: "600 16px 'Fredoka'", cursor: disabled ? 'default' : 'pointer', boxShadow: disabled ? 'none' : '0 10px 22px -8px rgba(255,107,74,.7)', transition: 'all .2s' }}>
      {children}
    </button>
  )
}
function Toast({ msg }) {
  if (!msg) return null
  return (
    <div style={{ position: 'absolute', bottom: 100, left: '50%', transform: 'translateX(-50%)', background: '#1F2933', color: '#fff', borderRadius: 14, padding: '10px 20px', fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', zIndex: 60, pointerEvents: 'none' }}>
      {msg}
    </div>
  )
}

// ─── Change username sheet ────────────────────────────────────────────────────
function UsernameSheet({ current, onClose, onSaved }) {
  const [val, setVal] = useState(current || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    const clean = val.trim().toLowerCase()
    if (!/^[a-z0-9_]{3,}$/.test(clean)) { setErr('Letters, numbers and underscores only · at least 3 characters.'); return }
    setSaving(true); setErr('')
    // check uniqueness
    const { data: existing } = await supabase.from('profiles').select('id').eq('username', clean).neq('id', (await supabase.auth.getUser()).data.user.id)
    if (existing?.length) { setErr('That username is taken.'); setSaving(false); return }
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('profiles').update({ username: clean }).eq('id', user.id)
    setSaving(false)
    if (error) { setErr('Could not save. Try again.'); return }
    onSaved(clean)
    onClose()
  }

  return (
    <Sheet onClose={onClose}>
      <SheetTitle>Change username</SheetTitle>
      <SheetSub>You can only change this once every 90 days, so choose carefully.</SheetSub>
      <FieldLabel>USERNAME</FieldLabel>
      <TextInput value={val} onChange={v => { setVal(v); setErr('') }} placeholder="your_username" prefix="@" autoFocus/>
      {err && <div style={{ fontSize: 13, color: '#E14F2E', marginBottom: 12, marginTop: -6 }}>{err}</div>}
      <PrimaryBtn onClick={save} disabled={saving || !val.trim()}>
        {saving ? 'Saving…' : 'Save username'}
      </PrimaryBtn>
    </Sheet>
  )
}

// ─── Change name sheet ────────────────────────────────────────────────────────
function NameSheet({ firstName, lastName, onClose, onSaved }) {
  const [first, setFirst] = useState(firstName || '')
  const [last, setLast] = useState(lastName || '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('profiles').update({ first_name: first.trim(), last_name: last.trim() }).eq('id', user.id)
    setSaving(false)
    onSaved(first.trim(), last.trim())
    onClose()
  }

  return (
    <Sheet onClose={onClose}>
      <SheetTitle>Edit name</SheetTitle>
      <SheetSub>This is shown to friends in Let's Meet.</SheetSub>
      <FieldLabel>FIRST NAME</FieldLabel>
      <TextInput value={first} onChange={setFirst} placeholder="First name" autoFocus/>
      <FieldLabel>LAST NAME</FieldLabel>
      <TextInput value={last} onChange={setLast} placeholder="Last name"/>
      <PrimaryBtn onClick={save} disabled={saving || !first.trim()}>
        {saving ? 'Saving…' : 'Save name'}
      </PrimaryBtn>
    </Sheet>
  )
}

// ─── Change password sheet ────────────────────────────────────────────────────
function PasswordSheet({ onClose }) {
  const [newPw, setNewPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  async function save() {
    if (newPw.length < 8) { setErr('Use at least 8 characters.'); return }
    if (newPw !== confirm) { setErr('New password and confirmation must match.'); return }
    setSaving(true); setErr('')
    const { error } = await supabase.auth.updateUser({ password: newPw })
    setSaving(false)
    if (error) { setErr(error.message); return }
    setDone(true)
    setTimeout(onClose, 1500)
  }

  return (
    <Sheet onClose={onClose}>
      <SheetTitle>Change password</SheetTitle>
      <SheetSub>Use at least 8 characters. New password and confirmation must match.</SheetSub>
      {done ? (
        <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 15, color: '#0E9C6B', fontWeight: 600 }}>Password updated ✓</div>
      ) : (
        <>
          <FieldLabel>NEW PASSWORD</FieldLabel>
          <TextInput type="password" value={newPw} onChange={v => { setNewPw(v); setErr('') }} placeholder="New password" autoFocus/>
          <FieldLabel>CONFIRM PASSWORD</FieldLabel>
          <TextInput type="password" value={confirm} onChange={v => { setConfirm(v); setErr('') }} placeholder="Confirm password"/>
          {err && <div style={{ fontSize: 13, color: '#E14F2E', marginBottom: 12, marginTop: -6 }}>{err}</div>}
          <PrimaryBtn onClick={save} disabled={saving || !newPw || !confirm}>
            {saving ? 'Updating…' : 'Update password'}
          </PrimaryBtn>
        </>
      )}
    </Sheet>
  )
}

// ─── Blocked users sheet ──────────────────────────────────────────────────────
function BlockedSheet({ myId, onClose }) {
  const [blocked, setBlocked] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('friendships')
      .select('requester, addressee')
      .or(`requester.eq.${myId},addressee.eq.${myId}`)
      .eq('status', 'blocked')
    const ids = (data || []).map(f => f.requester === myId ? f.addressee : f.requester)
    if (!ids.length) { setBlocked([]); setLoading(false); return }
    const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name, username, avatar_color').in('id', ids)
    setBlocked((profiles || []).map(p => ({ ...p, name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.username })))
    setLoading(false)
  }

  async function unblock(id) {
    await supabase.from('friendships').delete()
      .or(`and(requester.eq.${myId},addressee.eq.${id}),and(requester.eq.${id},addressee.eq.${myId})`)
      .eq('status', 'blocked')
    setBlocked(b => b.filter(u => u.id !== id))
  }

  return (
    <Sheet onClose={onClose}>
      <SheetTitle>Blocked users</SheetTitle>
      <SheetSub>Blocked people are removed from your friends and can't add you. Unblocking won't re-add them.</SheetSub>
      {loading ? (
        <div style={{ height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="spin" style={{ width: 22, height: 22, borderRadius: '50%', border: '3px solid #F0E5DE', borderTopColor: '#FF6B4A' }}/>
        </div>
      ) : blocked.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: '#9A9087', fontSize: 14 }}>No one blocked</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {blocked.map(u => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: '50%', background: u.avatar_color || '#A78BFA', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', font: "700 14px 'Plus Jakarta Sans'", flexShrink: 0 }}>
                {initials(u.name)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ font: "600 14.5px 'Plus Jakarta Sans'", color: '#1F2933' }}>{u.name}</div>
                <div style={{ fontSize: 12.5, color: '#9A9087' }}>@{u.username}</div>
              </div>
              <button onClick={() => unblock(u.id)} style={{ padding: '8px 14px', border: '1.5px solid #E7DED7', borderRadius: 12, background: '#fff', font: "600 13px 'Plus Jakarta Sans'", color: '#7B7268', cursor: 'pointer' }}>
                Unblock
              </button>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  )
}

// ─── Delete account sheet ─────────────────────────────────────────────────────
function DeleteAccountSheet({ onClose, onDeleted }) {
  const [confirm, setConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [err, setErr] = useState('')
  const ready = confirm.trim().toLowerCase() === 'delete'

  async function deleteAccount() {
    if (!ready) return
    setDeleting(true); setErr('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const id = user.id
      // wipe all user data
      await Promise.all([
        supabase.from('plan_invitees').delete().eq('invitee', id),
        supabase.from('plans').delete().eq('host', id),
        supabase.from('group_members').delete().eq('member', id),
        supabase.from('groups').delete().eq('owner', id),
        supabase.from('friend_nicknames').delete().or(`user_id.eq.${id},friend_id.eq.${id}`),
        supabase.from('friendships').delete().or(`requester.eq.${id},addressee.eq.${id}`),
      ])
      await supabase.from('profiles').delete().eq('id', id)
      await supabase.auth.signOut()
      onDeleted()
    } catch (e) {
      setErr('Something went wrong. Please try again.')
      setDeleting(false)
    }
  }

  return (
    <Sheet onClose={onClose}>
      <div style={{ width: 52, height: 52, borderRadius: 16, background: '#FEE9E9', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E14F2E" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </div>
      <SheetTitle>Delete account</SheetTitle>
      <SheetSub>This permanently deletes your account, all your plans, friend connections, and circles. This cannot be undone.</SheetSub>

      <div style={{ background: '#FEE9E9', border: '1px solid #FACAC4', borderRadius: 14, padding: '12px 14px', marginBottom: 20 }}>
        <p style={{ margin: 0, fontSize: 13.5, color: '#E14F2E', lineHeight: 1.5 }}>
          Type <strong>delete</strong> below to confirm.
        </p>
      </div>

      <FieldLabel>CONFIRM</FieldLabel>
      <TextInput value={confirm} onChange={v => { setConfirm(v); setErr('') }} placeholder="delete" autoFocus/>
      {err && <div style={{ fontSize: 13, color: '#E14F2E', marginBottom: 12, marginTop: -6 }}>{err}</div>}

      <button
        onClick={deleteAccount}
        disabled={!ready || deleting}
        style={{ width: '100%', padding: 15, border: 'none', borderRadius: 16, background: ready && !deleting ? '#E14F2E' : '#E7DED7', color: '#fff', font: "600 16px 'Fredoka'", cursor: ready && !deleting ? 'pointer' : 'default', transition: 'all .2s' }}
      >
        {deleting ? 'Deleting…' : 'Delete my account'}
      </button>
    </Sheet>
  )
}

// ─── Phone sheet ─────────────────────────────────────────────────────────────
function PhoneSheet({ current, onClose, onSaved }) {
  const [val, setVal] = useState(current || '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('profiles').update({ phone: val.trim() || null }).eq('id', user.id)
    setSaving(false)
    onSaved(val.trim() || null)
    onClose()
  }

  return (
    <Sheet onClose={onClose}>
      <SheetTitle>Phone number</SheetTitle>
      <SheetSub>Used so friends can find you by phone number. Never shown publicly.</SheetSub>
      <FieldLabel>PHONE</FieldLabel>
      <TextInput type="tel" value={val} onChange={setVal} placeholder="+1 555 000 0000" autoFocus/>
      <PrimaryBtn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save number'}</PrimaryBtn>
    </Sheet>
  )
}

// ─── Bio sheet ────────────────────────────────────────────────────────────────
function BioSheet({ current, onClose, onSaved }) {
  const [val, setVal] = useState(current || '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('profiles').update({ bio: val.trim() }).eq('id', user.id)
    setSaving(false)
    onSaved(val.trim())
    onClose()
  }

  return (
    <Sheet onClose={onClose}>
      <SheetTitle>Your bio</SheetTitle>
      <SheetSub>A short line that friends see on your profile. Keep it fun.</SheetSub>
      <FieldLabel>BIO</FieldLabel>
      <div style={{ background: '#fff', border: '1.5px solid #EBE2DB', borderRadius: 14, padding: '13px 14px', marginBottom: 14 }}>
        <textarea
          autoFocus
          value={val}
          onChange={e => setVal(e.target.value)}
          maxLength={80}
          placeholder="e.g. Always up for tacos 🌮"
          rows={3}
          style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', font: "600 14.5px 'Plus Jakarta Sans'", color: '#1F2933', resize: 'none', lineHeight: 1.5 }}
        />
        <div style={{ textAlign: 'right', fontSize: 11.5, color: '#C4BBB2', marginTop: 4 }}>{val.length}/80</div>
      </div>
      <PrimaryBtn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save bio'}</PrimaryBtn>
    </Sheet>
  )
}

// ─── ProfileScreen ────────────────────────────────────────────────────────────
export default function ProfileScreen({ session, onLogout, onPrivacy, onTerms }) {
  const [profile, setProfile] = useState(null)
  const [sheet, setSheet] = useState(null) // 'name'|'username'|'phone'|'password'|'blocked'|'delete'|'bio'
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [notifPrefs, setNotifPrefs] = useState(() => ({
    push:           localStorage.getItem('notif_push')            === 'true',
    planResponses:  localStorage.getItem('notif_plan_responses')  !== 'false',
    friendRequests: localStorage.getItem('notif_friend_requests') !== 'false',
    reminders:      localStorage.getItem('notif_reminders')       !== 'false',
  }))
  const [discoveryOn, setDiscoveryOn] = useState(true)

  function toggleNotifPref(key) {
    const keyMap = { push: 'notif_push', planResponses: 'notif_plan_responses', friendRequests: 'notif_friend_requests', reminders: 'notif_reminders' }
    setNotifPrefs(prev => {
      if (key === 'push') {
        const pushOn = !prev.push
        const next = { push: pushOn, planResponses: pushOn, friendRequests: pushOn, reminders: pushOn }
        Object.entries(keyMap).forEach(([k, lk]) => localStorage.setItem(lk, String(next[k])))
        if (pushOn) Notification?.requestPermission?.()
        return next
      }
      if (!prev.push) return prev // sub-prefs locked while push is off
      const next = { ...prev, [key]: !prev[key] }
      localStorage.setItem(keyMap[key], String(next[key]))
      return next
    })
  }
  const [toast, setToast] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)

  async function toggleDiscovery() {
    const next = !discoveryOn
    setDiscoveryOn(next)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('profiles').update({ phone_discoverable: next }).eq('id', user.id)
    showToast(next ? 'Contacts can find you' : 'Hidden from contact search')
  }

  async function toggleMutualVisibility() {
    const next = !(profile?.show_in_mutual ?? true)
    setProfile(p => ({ ...p, show_in_mutual: next }))
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('profiles').update({ show_in_mutual: next }).eq('id', user.id)
    showToast(next ? 'You can appear in suggestions' : 'Hidden from suggestions')
  }

  useEffect(() => { load() }, [session])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile({ ...prof, email: user.email })
    setDiscoveryOn(prof?.phone_discoverable ?? true)
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  async function logout() {
    setLoggingOut(true)
    await supabase.auth.signOut()
    onLogout?.()
  }

  async function handleAvatarFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${user.id}.${ext}`
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type })
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      const url = `${publicUrl}?t=${Date.now()}`
      await supabase.from('profiles').update({ avatar_url: url }).eq('id', user.id)
      setProfile(p => ({ ...p, avatar_url: url }))
      showToast('Photo updated')
    } else {
      showToast('Upload failed')
    }
    setUploading(false)
    e.target.value = ''
  }

  if (!profile) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spin" style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid #F0E5DE', borderTopColor: '#FF6B4A' }}/>
      </div>
    )
  }

  const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Your name'
  const myId = session.user.id
  const isGoogle = session.user.app_metadata?.provider === 'google'

  return (
    <div className="fade-up" style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 22px 32px' }} className="no-scrollbar">

        {/* hidden file input */}
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarFile}/>

        {/* profile header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '18px 0 22px' }}>
          {/* tappable avatar */}
          <div
            onClick={() => !uploading && fileInputRef.current?.click()}
            style={{ position: 'relative', cursor: 'pointer', marginBottom: 12 }}
          >
            <Avatar url={profile.avatar_url} name={fullName} color={profile.avatar_color} size={82}
              style={{ boxShadow: '0 8px 20px -6px rgba(0,0,0,.18)' }}/>
            <div style={{ position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: '50%', background: '#FF6B4A', border: '2.5px solid #FBF7F4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {uploading
                ? <div className="spin" style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(255,255,255,.4)', borderTopColor: '#fff' }}/>
                : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
              }
            </div>
          </div>
          <div style={{ font: "600 20px 'Fredoka'", color: '#1F2933', marginBottom: 2 }}>{fullName}</div>
          <div style={{ fontSize: 13.5, color: '#9A9087', marginBottom: profile.bio ? 6 : 0 }}>@{profile.username || 'no username'}</div>
          {profile.bio
            ? <div onClick={() => setSheet('bio')} style={{ fontSize: 13.5, color: '#4A4540', textAlign: 'center', lineHeight: 1.5, maxWidth: 240, cursor: 'pointer' }}>{profile.bio}</div>
            : <div onClick={() => setSheet('bio')} style={{ fontSize: 13, color: '#C4BBB2', cursor: 'pointer', marginTop: 4 }}>+ Add a bio</div>
          }
        </div>

        {/* ACCOUNT */}
        <Section label="ACCOUNT">
          <Row
            iconBg="#FF6B4A"
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M5.5 20c0-3.4 2.9-5.4 6.5-5.4s6.5 2 6.5 5.4"/></svg>}
            label="Name"
            value={fullName}
            onPress={() => setSheet('name')}
          />
          <Row
            iconBg="#EC6A9C"
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>}
            label="Bio"
            value={profile.bio || 'Add a short bio'}
            onPress={() => setSheet('bio')}
          />
          <Row
            iconBg="#5B7CFA"
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/></svg>}
            label="Username"
            value={`@${profile.username || '—'}`}
            onPress={() => setSheet('username')}
          />
          <Row
            iconBg="#0E9C6B"
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="m2 7 10 7 10-7"/></svg>}
            label="Email"
            value={profile.email}
          />
          <Row
            iconBg="#A78BFA"
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92V19a2 2 0 0 1-2.18 2A19.86 19.86 0 0 1 3 5.18 2 2 0 0 1 5 3h2.09a2 2 0 0 1 2 1.72c.13.97.36 1.92.69 2.83a2 2 0 0 1-.45 2.11L8.09 11a16 16 0 0 0 5 5l1.27-1.27a2 2 0 0 1 2.11-.45c.9.33 1.86.56 2.83.69A2 2 0 0 1 21 17z"/></svg>}
            label="Phone number"
            value={profile.phone || 'Add phone number'}
            onPress={() => setSheet('phone')}
          />
          {!isGoogle && (
            <Row
              iconBg="#F5A623"
              icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><rect x="5" y="11" width="14" height="11" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>}
              label="Password"
              value="Change password"
              onPress={() => setSheet('password')}
              last
            />
          )}
          {isGoogle && (
            <Row
              iconBg="#4285F4"
              icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 3"/></svg>}
              label="Sign-in method"
              value="Google account"
              last
            />
          )}
        </Section>

        {/* DISCOVERY */}
        <Section label="DISCOVERY">
          <Row
            iconBg="#A78BFA"
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92V19a2 2 0 0 1-2.18 2A19.86 19.86 0 0 1 3 5.18 2 2 0 0 1 5 3h2.09a2 2 0 0 1 2 1.72c.13.97.36 1.92.69 2.83a2 2 0 0 1-.45 2.11L8.09 11a16 16 0 0 0 5 5l1.27-1.27a2 2 0 0 1 2.11-.45c.9.33 1.86.56 2.83.69A2 2 0 0 1 21 17z"/></svg>}
            label="Find friends from contacts"
            value="Off by default · uses phone numbers only"
            toggle
            toggled={discoveryOn}
            onToggle={toggleDiscovery}
            last
          />
        </Section>

        {/* NOTIFICATIONS */}
        <Section label="NOTIFICATIONS">
          <Row
            iconBg="#EC6A9C"
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>}
            label="Push notifications"
            value={notifPrefs.push ? 'On' : 'Off · tap to enable'}
            toggle
            toggled={notifPrefs.push}
            onToggle={() => toggleNotifPref('push')}
          />
          <Row
            iconBg="#5B7CFA"
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>}
            label="Plan responses"
            value="When someone RSVPs to your plan"
            toggle
            toggled={notifPrefs.planResponses}
            onToggle={() => toggleNotifPref('planResponses')}
            muted={!notifPrefs.push}
          />
          <Row
            iconBg="#0E9C6B"
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><circle cx="9" cy="8" r="3"/><path d="M4 19c0-3 2.3-4.8 5-4.8"/><path d="M17 13v6M14 16h6"/></svg>}
            label="Friend requests"
            value="When someone adds you"
            toggle
            toggled={notifPrefs.friendRequests}
            onToggle={() => toggleNotifPref('friendRequests')}
            muted={!notifPrefs.push}
          />
          <Row
            iconBg="#F5A623"
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>}
            label="Reminders"
            value="Day-before plan reminders"
            toggle
            toggled={notifPrefs.reminders}
            onToggle={() => toggleNotifPref('reminders')}
            muted={!notifPrefs.push}
            last
          />
        </Section>

        {/* PRIVACY & SAFETY */}
        <Section label="PRIVACY & SAFETY">
          <Row
            iconBg="#12B886"
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><circle cx="9" cy="8" r="3"/><path d="M4 19c0-3 2.3-4.8 5-4.8"/><path d="M17 13v6M14 16h6"/></svg>}
            label="Show in mutual friend suggestions"
            value="Let others see you in 'People you may know'"
            toggle
            toggled={profile?.show_in_mutual ?? true}
            onToggle={toggleMutualVisibility}
          />
          <Row
            iconBg="#6B7280"
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}
            label="Blocked users"
            onPress={() => setSheet('blocked')}
          />
          <Row
            iconBg="#E14F2E"
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>}
            label="Log out"
            danger
            onPress={logout}
          />
          <Row
            iconBg="#B91C1C"
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>}
            label="Delete account"
            danger
            onPress={() => setSheet('delete')}
            last
          />
        </Section>

        {/* LEGAL */}
        <Section label="LEGAL">
          <Row
            iconBg="#7B7268"
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/></svg>}
            label="Privacy Policy"
            onPress={onPrivacy}
          />
          <Row
            iconBg="#7B7268"
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>}
            label="Terms of Service"
            onPress={onTerms}
            last
          />
        </Section>

        <div style={{ textAlign: 'center', fontSize: 12, color: '#C4BBB2', marginTop: -10, marginBottom: 8 }}>
          Let's Meet · made with ♥
        </div>
      </div>

      {/* sheets */}
      {sheet === 'bio' && (
        <BioSheet current={profile.bio} onClose={() => setSheet(null)} onSaved={b => { setProfile(p => ({ ...p, bio: b })); showToast('Bio updated') }}/>
      )}
      {sheet === 'phone' && (
        <PhoneSheet current={profile.phone} onClose={() => setSheet(null)} onSaved={ph => { setProfile(p => ({ ...p, phone: ph })); showToast('Phone number saved') }}/>
      )}
      {sheet === 'name' && (
        <NameSheet
          firstName={profile.first_name}
          lastName={profile.last_name}
          onClose={() => setSheet(null)}
          onSaved={(f, l) => { setProfile(p => ({ ...p, first_name: f, last_name: l })); showToast('Name updated') }}
        />
      )}
      {sheet === 'username' && (
        <UsernameSheet
          current={profile.username}
          onClose={() => setSheet(null)}
          onSaved={u => { setProfile(p => ({ ...p, username: u })); showToast('Username saved') }}
        />
      )}
      {sheet === 'password' && (
        <PasswordSheet onClose={() => setSheet(null)}/>
      )}
      {sheet === 'blocked' && (
        <BlockedSheet myId={myId} onClose={() => setSheet(null)}/>
      )}
      {sheet === 'delete' && (
        <DeleteAccountSheet onClose={() => setSheet(null)} onDeleted={onLogout}/>
      )}

      <Toast msg={toast}/>
    </div>
  )
}
