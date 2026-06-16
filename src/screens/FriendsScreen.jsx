import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import UserProfileSheet from '../components/UserProfileSheet'
import AvatarImg from '../components/Avatar'

// ─── helpers ────────────────────────────────────────────────────────────────
function initials(name = '') {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

const CIRCLE_COLORS = ['#FF6B4A','#5B7CFA','#12B886','#F5A623','#A78BFA','#EC6A9C']

// ─── small shared bits ───────────────────────────────────────────────────────
const Avatar = ({ url, name, color, size = 44, style }) => (
  <AvatarImg url={url} name={name} color={color} size={size} style={style} />
)

const Pill = ({ label, color }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 5,
    font: "600 11px -apple-system", color,
    background: `color-mix(in srgb, ${color} 13%, #fff)`,
    padding: '3px 9px', borderRadius: 20,
  }}>
    <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }}/>
    {label}
  </span>
)

// ─── AddFriendSheet ───────────────────────────────────────────────────────────
export function AddFriendSheet({ session, onClose, onRequestAccepted }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [sent, setSent] = useState({})
  const [pendingIn, setPendingIn] = useState([])
  const [accepted, setAccepted] = useState({})
  const [denied, setDenied] = useState({})
  const [suggestions, setSuggestions] = useState([])
  const [dismissed, setDismissed] = useState(new Set())
  const [contactsState, setContactsState] = useState(null) // null | 'loading' | 'done'
  const [contactsResults, setContactsResults] = useState([])
  const debounce = useRef(null)
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const dragStartY = useRef(0)
  function onDragStart(e) { dragStartY.current = e.touches[0].clientY; setDragging(true) }
  function onDragMove(e) { const d = e.touches[0].clientY - dragStartY.current; if (d > 0) setDragY(d) }
  function onDragEnd() { setDragging(false); if (dragY > 100) { onClose() } else { setDragY(0) } }

  useEffect(() => { loadIncoming(); loadSuggestions(); loadDismissed() }, [])

  // real-time: new pending friend requests
  useEffect(() => {
    const channel = supabase.channel(`friend-reqs-${session.user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'friendships',
        filter: `addressee=eq.${session.user.id}`,
      }, payload => {
        const row = payload.new
        if (row.status !== 'pending') return
        setPendingIn(prev => {
          if (prev.some(r => r.id === row.id)) return prev
          return [{ id: row.id, requester: row.requester, profiles: null, _needsProfile: true }, ...prev]
        })
        // fetch requester profile
        supabase.from('profiles')
          .select('id, first_name, last_name, username, avatar_color, avatar_url')
          .eq('id', row.requester).single()
          .then(({ data: p }) => {
            if (p) setPendingIn(prev => prev.map(r => r.requester === row.requester ? { ...r, profiles: p, _needsProfile: false } : r))
          })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [session.user.id])

  async function loadIncoming() {
    const { data } = await supabase
      .from('friendships')
      .select('id, requester, profiles!friendships_requester_fkey(first_name, last_name, username, avatar_color, avatar_url)')
      .eq('addressee', session.user.id)
      .eq('status', 'pending')
    setPendingIn(data || [])
  }

  async function loadSuggestions() {
    const { data: rows } = await supabase.rpc('get_friend_suggestions', {
      p_user_id: session.user.id, p_limit: 8,
    })
    if (!rows?.length) return
    const ids = rows.map(r => r.user_id)
    const { data: profiles } = await supabase
      .from('profiles').select('id, first_name, last_name, username, avatar_color, avatar_url').in('id', ids)
    const countMap = {}; rows.forEach(r => { countMap[r.user_id] = Number(r.mutual_count) })
    setSuggestions((profiles || []).map(p => ({ ...p, mutuals: countMap[p.id] || 0 })))
  }

  async function loadDismissed() {
    const { data } = await supabase
      .from('dismissed_suggestions').select('dismissed_id').eq('user_id', session.user.id)
    if (data?.length) setDismissed(new Set(data.map(r => r.dismissed_id)))
  }

  async function dismiss(userId) {
    setDismissed(prev => new Set([...prev, userId]))
    await supabase.from('dismissed_suggestions').insert({ user_id: session.user.id, dismissed_id: userId })
  }

  async function findFromContacts() {
    if (!navigator.contacts) { setContactsState('done'); return }
    setContactsState('loading')
    try {
      const contacts = await navigator.contacts.select(['tel', 'name'], { multiple: true })
      const phones = contacts
        .flatMap(c => c.tel || [])
        .map(t => t.value?.replace(/\D/g, ''))
        .filter(p => p && p.length >= 7)
      if (!phones.length) { setContactsState('done'); return }
      const suffixes = phones.map(p => p.slice(-10))
      const { data } = await supabase.rpc('match_contacts', { phone_suffixes: suffixes })
      setContactsResults(data || [])
      setContactsState('done')
    } catch { setContactsState('done') }
  }

  function handleQueryChange(val) {
    setQuery(val)
    clearTimeout(debounce.current)
    if (!val.trim()) { setResults([]); return }
    debounce.current = setTimeout(() => search(val.trim()), 350)
  }

  async function search(q) {
    setSearching(true)
    const clean = q.replace(/^@/, '')
    const { data } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, username, avatar_color, avatar_url')
      .ilike('username', `%${clean}%`)
      .neq('id', session.user.id)
      .limit(8)
    const users = data || []
    setResults(users)
    if (users.length > 0) {
      const ids = users.map(u => u.id)
      const { data: fships } = await supabase
        .from('friendships')
        .select('requester, addressee, status')
        .or(`and(requester.eq.${session.user.id},addressee.in.(${ids.join(',')})),and(requester.in.(${ids.join(',')}),addressee.eq.${session.user.id})`)
      if (fships?.length) {
        const statusMap = {}
        fships.forEach(f => {
          const otherId = f.requester === session.user.id ? f.addressee : f.requester
          statusMap[otherId] = f.status === 'accepted' ? 'already' : 'pending'
        })
        setSent(s => ({ ...s, ...statusMap }))
      }
    }
    setSearching(false)
  }

  async function sendRequest(userId) {
    const { data: existing } = await supabase
      .from('friendships')
      .select('id, status')
      .or(`and(requester.eq.${session.user.id},addressee.eq.${userId}),and(requester.eq.${userId},addressee.eq.${session.user.id})`)
      .limit(1)
    if (existing?.length) {
      const status = existing[0].status
      setSent(s => ({ ...s, [userId]: status === 'accepted' ? 'already' : 'pending' }))
      return
    }
    await supabase.from('friendships').insert({ requester: session.user.id, addressee: userId })
    setSent(s => ({ ...s, [userId]: 'sent' }))
  }

  async function acceptRequest(friendship) {
    await supabase.from('friendships').update({ status: 'accepted', responded_at: new Date().toISOString() }).eq('id', friendship.id)
    setAccepted(a => ({ ...a, [friendship.requester]: true }))
    onRequestAccepted?.()
  }

  async function denyRequest(friendship) {
    await supabase.from('friendships').delete().eq('id', friendship.id)
    setDenied(d => ({ ...d, [friendship.requester]: true }))
  }

  const showSearch = query.trim().length > 0

  function PersonRow({ u, actionSlot, onDismiss }) {
    const name = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid #F1E8E2', borderRadius: 15, padding: '11px 13px' }}>
        <Avatar url={u.avatar_url} name={name} color={u.avatar_color} size={44}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "600 15px -apple-system", color: '#1F2933' }}>{name}</div>
          <div style={{ fontSize: 12.5, color: '#9A9087' }}>
            {u.username}{u.mutuals > 0 ? ` · ${u.mutuals} mutual` : ''}
          </div>
        </div>
        {actionSlot}
        {onDismiss && (
          <button onClick={e => { e.stopPropagation(); onDismiss() }}
            style={{ border: 'none', background: 'none', color: '#C4BBB2', fontSize: 20, lineHeight: 1, cursor: 'pointer', padding: '2px 4px', flexShrink: 0 }}>
            ×
          </button>
        )}
      </div>
    )
  }

  function AddBtn({ userId }) {
    const wasSent = sent[userId]
    return (
      <button
        onClick={() => !wasSent && sendRequest(userId)}
        style={{ border: 'none', borderRadius: 12, padding: '9px 16px', cursor: wasSent ? 'default' : 'pointer', font: "600 13px -apple-system", background: wasSent === 'already' ? '#E4F6EE' : wasSent ? '#F5F2EE' : '#FF6B4A', color: wasSent === 'already' ? '#0E9C6B' : wasSent ? '#7B7268' : '#fff', flexShrink: 0 }}
      >
        {wasSent === 'already' ? 'Already friends' : wasSent === 'pending' ? 'Sent' : wasSent === 'sent' ? 'Sent ✓' : 'Add'}
      </button>
    )
  }

  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(20,24,30,.4)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} className="sheet-up" style={{ background: '#FBF7F4', borderRadius: '28px 28px 0 0', padding: '0 22px 32px', maxHeight: '88%', display: 'flex', flexDirection: 'column', transform: `translateY(${dragY}px)`, transition: dragging ? 'none' : 'transform .3s ease' }}>
        <div onTouchStart={onDragStart} onTouchMove={onDragMove} onTouchEnd={onDragEnd} style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 10px' }}>
          <div style={{ width: 42, height: 5, borderRadius: 5, background: '#E0D7CF' }}/>
        </div>
        <h3 style={{ margin: '0 0 18px', font: "600 22px -apple-system", color: '#1F2933' }}>Add friends</h3>

        {/* username search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1.5px solid #EBE2DB', borderRadius: 14, padding: '4px 14px', marginBottom: 16 }}>
          <span style={{ font: "700 16px -apple-system", color: '#B6ADA4' }}>@</span>
          <input
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            placeholder="search by username"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', font: "600 16px -apple-system", color: '#1F2933', padding: '9px 0' }}
          />
          {searching && <div className="spin" style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #F0E5DE', borderTopColor: '#FF6B4A', flexShrink: 0 }}/>}
          {query && !searching && <span onClick={() => { setQuery(''); setResults([]) }} style={{ fontSize: 18, color: '#C4BBB2', cursor: 'pointer' }}>×</span>}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── username search results ── */}
          {showSearch && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {results.length === 0 && !searching && (
                <p style={{ textAlign: 'center', padding: '22px 10px', color: '#9A9087', fontSize: 14 }}>No one found with that username.</p>
              )}
              {results.map(u => <PersonRow key={u.id} u={u} actionSlot={<AddBtn userId={u.id}/>}/>)}
            </div>
          )}

          {/* ── idle state ── */}
          {!showSearch && (
            <>
              {/* share invite link — top */}
              <div onClick={() => navigator.share?.({ title: "Let's Meet", url: 'https://letsmeet.app' }) || navigator.clipboard?.writeText('https://letsmeet.app')}
                style={{ display: 'flex', alignItems: 'center', gap: 13, background: '#fff', border: '1px solid #F1E8E2', borderRadius: 15, padding: '14px 15px', cursor: 'pointer' }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: '#FBF0DA', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C8841A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.5 13.5 7 4M15.5 6.5l-7 4"/></svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ font: "600 15px -apple-system", color: '#1F2933' }}>Invite friends</div>
                  <div style={{ fontSize: 12.5, color: '#9A9087' }}>Share your link · letsmeet.app</div>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C4BBB2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6"/></svg>
              </div>

              {/* 1 — friend requests */}
              {pendingIn.filter(r => !denied[r.requester]).length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 11 }}>
                    <span style={{ font: "700 12px -apple-system", color: '#9A9087', letterSpacing: .3 }}>WANTS TO ADD YOU</span>
                    <span style={{ background: '#FF6B4A', color: '#fff', fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 20 }}>
                      {pendingIn.filter(r => !denied[r.requester]).length}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {pendingIn.filter(r => !denied[r.requester]).map(r => {
                      const p = r.profiles
                      const name = p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.username : 'Someone'
                      const isAccepted = accepted[r.requester]
                      return (
                        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid #F1E8E2', borderRadius: 15, padding: '11px 13px' }}>
                          <Avatar url={p?.avatar_url} name={name} color={p?.avatar_color} size={44}/>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ font: "600 15px -apple-system", color: '#1F2933' }}>{name}</div>
                            <div style={{ fontSize: 12.5, color: '#9A9087' }}>{p?.username}</div>
                          </div>
                          {isAccepted
                            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#0E9C6B', fontWeight: 600, fontSize: 13, background: '#E4F6EE', padding: '8px 13px', borderRadius: 12 }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0E9C6B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L19 7"/></svg>
                                Friends
                              </span>
                            : <div style={{ display: 'flex', gap: 6 }}>
                                <button onClick={() => acceptRequest(r)} style={{ border: 'none', background: '#FF6B4A', color: '#fff', font: "600 13px -apple-system", padding: '9px 14px', borderRadius: 12, cursor: 'pointer' }}>Accept</button>
                                <button onClick={() => denyRequest(r)} style={{ border: '1.5px solid #E7DED7', background: '#fff', color: '#7B7268', font: "600 13px -apple-system", padding: '9px 13px', borderRadius: 12, cursor: 'pointer' }}>Deny</button>
                              </div>
                          }
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 2 — contacts section: button → results → mutual suggestions below */}
              <div>
                {/* scan button / loading state (shown until scan completes) */}
                {contactsState !== 'done' && (
                  <div onClick={contactsState === 'loading' ? undefined : findFromContacts}
                    style={{ display: 'flex', alignItems: 'center', gap: 13, background: '#fff', border: '1px solid #F1E8E2', borderRadius: 15, padding: '14px 15px', cursor: contactsState === 'loading' ? 'default' : 'pointer', marginBottom: 16 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: '#EEF0FD', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {contactsState === 'loading'
                        ? <div className="spin" style={{ width: 18, height: 18, borderRadius: '50%', border: '2.5px solid #D0D7F8', borderTopColor: '#5B7CFA' }}/>
                        : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5B7CFA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                      }
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ font: "600 15px -apple-system", color: '#1F2933' }}>
                        {contactsState === 'loading' ? 'Scanning your contacts…' : 'Find from contacts'}
                      </div>
                      <div style={{ fontSize: 12.5, color: '#9A9087' }}>
                        {contactsState === 'loading' ? 'Matching phone numbers' : 'See which contacts use the app'}
                      </div>
                    </div>
                    {!contactsState && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C4BBB2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6"/></svg>}
                  </div>
                )}

                {/* from your contacts results */}
                {contactsState === 'done' && contactsResults.filter(u => !dismissed.has(u.id)).length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ font: "700 12px -apple-system", color: '#9A9087', letterSpacing: .3, marginBottom: 11 }}>FROM YOUR CONTACTS</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {contactsResults.filter(u => !dismissed.has(u.id)).map(u => (
                        <PersonRow key={u.id} u={u} actionSlot={<AddBtn userId={u.id}/>} onDismiss={() => dismiss(u.id)}/>
                      ))}
                    </div>
                  </div>
                )}

                {/* no contacts match */}
                {contactsState === 'done' && contactsResults.filter(u => !dismissed.has(u.id)).length === 0 && (
                  <div style={{ textAlign: 'center', padding: '4px 0 16px', fontSize: 13, color: '#9A9087' }}>
                    None of your contacts use the app yet — invite them above!
                  </div>
                )}

                {/* people you may know — always below contacts */}
                {suggestions.filter(u => !dismissed.has(u.id)).length > 0 && (
                  <div>
                    <div style={{ font: "700 12px -apple-system", color: '#9A9087', letterSpacing: .3, marginBottom: 11 }}>PEOPLE YOU MAY KNOW</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {suggestions.filter(u => !dismissed.has(u.id)).map(u => (
                        <PersonRow key={u.id} u={u} actionSlot={<AddBtn userId={u.id}/>} onDismiss={() => dismiss(u.id)}/>
                      ))}
                    </div>
                  </div>
                )}
              </div>

            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── FriendMenuSheet ─────────────────────────────────────────────────────────
function FriendMenuSheet({ friend, allGroups, session, onClose, onSaved, onRemoved }) {
  const realName = `${friend.first_name || ''} ${friend.last_name || ''}`.trim() || friend.username
  const [nickname, setNickname] = useState(friend.nickname || '')
  const [selectedGroups, setSelectedGroups] = useState(friend.groupIds || [])
  const [saving, setSaving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  function toggleGroup(gid) {
    setSelectedGroups(prev => prev.includes(gid) ? prev.filter(id => id !== gid) : [...prev, gid])
  }

  async function save() {
    setSaving(true)

    // save or clear nickname
    const trimmed = nickname.trim()
    if (trimmed) {
      await supabase.from('friend_nicknames').upsert({ user_id: session.user.id, friend_id: friend.id, nickname: trimmed })
    } else {
      await supabase.from('friend_nicknames').delete().match({ user_id: session.user.id, friend_id: friend.id })
    }

    // update group memberships
    const currentGroupIds = friend.groupIds || []
    const toAdd = selectedGroups.filter(id => !currentGroupIds.includes(id))
    const toRemove = currentGroupIds.filter(id => !selectedGroups.includes(id))
    if (toAdd.length) {
      await supabase.from('group_members').upsert(toAdd.map(gid => ({ group_id: gid, member: friend.id })))
    }
    if (toRemove.length) {
      await supabase.from('group_members').delete().eq('member', friend.id).in('group_id', toRemove)
    }

    setSaving(false)
    onSaved?.()
    onClose()
  }

  async function removeFriend() {
    await supabase.from('friendships').delete()
      .or(`and(requester.eq.${session.user.id},addressee.eq.${friend.id}),and(requester.eq.${friend.id},addressee.eq.${session.user.id})`)
    onRemoved?.()
    onClose()
  }

  async function blockFriend() {
    await supabase.from('blocks').insert({ blocker: session.user.id, blocked: friend.id })
    onRemoved?.()
    onClose()
  }

  const displayName = friend.nickname || realName

  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(20,24,30,.4)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} className="sheet-up" style={{ background: '#FBF7F4', borderRadius: '28px 28px 0 0', padding: '10px 22px 28px' }}>
        <div style={{ width: 42, height: 5, borderRadius: 5, background: '#E0D7CF', margin: '0 auto 18px' }}/>

        <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 20 }}>
          <Avatar url={friend.avatar_url} name={displayName} color={friend.avatar_color} size={54}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#9A9087', marginBottom: 3 }}>FRIEND</div>
            <div style={{ font: "600 17px -apple-system", color: '#1F2933' }}>{displayName}</div>
            {friend.nickname && <div style={{ fontSize: 12.5, color: '#9A9087' }}>Real name: {realName}</div>}
            {!friend.nickname && <div style={{ fontSize: 12.5, color: '#9A9087' }}>{friend.username}</div>}
          </div>
        </div>

        {/* nickname field */}
        <div style={{ fontSize: 12, fontWeight: 600, color: '#9A9087', marginBottom: 8, letterSpacing: .3 }}>NICKNAME (ONLY YOU SEE THIS)</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1.5px solid #EBE2DB', borderRadius: 14, padding: '4px 14px', marginBottom: 20 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B6ADA4" strokeWidth="2" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          <input
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            placeholder={`e.g. "Alex from work"`}
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', font: "600 16px -apple-system", color: '#1F2933', padding: '9px 0' }}
          />
          {nickname.trim() && (
            <span onClick={() => setNickname('')} style={{ fontSize: 18, color: '#C4BBB2', cursor: 'pointer', lineHeight: 1 }}>×</span>
          )}
        </div>
        {friend.nickname && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: -14, marginBottom: 20 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#B6ADA4" strokeWidth="2" strokeLinecap="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            <span onClick={() => setNickname('')} style={{ fontSize: 12, fontWeight: 600, color: '#B6ADA4', cursor: 'pointer' }}>
              Reset to {realName}
            </span>
          </div>
        )}

        <div style={{ fontSize: 12, fontWeight: 600, color: '#9A9087', marginBottom: 10, letterSpacing: .3 }}>CIRCLES · TAP TO ADD OR REMOVE</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 22 }}>
          {allGroups.map((g, i) => {
            const sel = selectedGroups.includes(g.id)
            const color = g.color || CIRCLE_COLORS[i % CIRCLE_COLORS.length]
            return (
              <div
                key={g.id}
                onClick={() => toggleGroup(g.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: `2px solid ${sel ? color : '#F1E8E2'}`, borderRadius: 15, padding: '13px 14px', cursor: 'pointer' }}
              >
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: color }}/>
                <span style={{ flex: 1, font: "600 15px -apple-system", color: '#1F2933' }}>{g.name}</span>
                <div style={{
                  width: 24, height: 24, borderRadius: 8,
                  border: `2px solid ${sel ? color : '#E0D7CF'}`,
                  background: sel ? color : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {sel && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L19 7"/></svg>}
                </div>
              </div>
            )
          })}
          {allGroups.length === 0 && (
            <p style={{ margin: 0, fontSize: 13.5, color: '#9A9087', textAlign: 'center', padding: '8px 0' }}>No circles yet — create one first.</p>
          )}
        </div>

        {confirmRemove ? (
          <div style={{ background: '#FFF1EC', border: '1.5px solid #FFD8CC', borderRadius: 18, padding: '16px 18px', marginBottom: 10 }}>
            <p style={{ margin: '0 0 12px', font: "600 15px -apple-system", color: '#1F2933' }}>
              Remove {displayName} from friends?
            </p>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: '#9A9087', lineHeight: 1.5 }}>
              They won't be notified. You can add them again anytime.
            </p>
            <div style={{ display: 'flex', gap: 9 }}>
              <button onClick={() => setConfirmRemove(false)} style={{ flex: 1, padding: '13px 0', border: '1.5px solid #E7DED7', borderRadius: 14, background: '#fff', color: '#7B7268', font: "600 14px -apple-system", cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={removeFriend} style={{ flex: 1, padding: '13px 0', border: 'none', borderRadius: 14, background: '#E14F2E', color: '#fff', font: "600 14px -apple-system", cursor: 'pointer' }}>
                Yes, remove
              </button>
            </div>
          </div>
        ) : (
          <>
            <button onClick={save} disabled={saving} style={{ width: '100%', padding: 16, border: 'none', borderRadius: 16, background: '#FF6B4A', color: '#fff', font: "600 16px -apple-system", cursor: 'pointer', boxShadow: '0 10px 22px -8px rgba(255,107,74,.7)', marginBottom: 10 }}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <div style={{ display: 'flex', gap: 9 }}>
              <button onClick={() => setConfirmRemove(true)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: 15, border: '1.5px solid #E7DED7', borderRadius: 16, background: '#fff', color: '#7B7268', font: "600 14.5px -apple-system", cursor: 'pointer' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7B7268" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>
                Remove
              </button>
              <button onClick={blockFriend} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: 15, border: '1.5px solid #F3D2CC', borderRadius: 16, background: '#fff', color: '#E14F2E', font: "600 14.5px -apple-system", cursor: 'pointer' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E14F2E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/></svg>
                Block
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── CreateCircleSheet ────────────────────────────────────────────────────────
export function CreateCircleSheet({ session, onClose, onCreated }) {
  const [step, setStep] = useState(1)         // 1 = name, 2 = color, 3 = friends
  const [name, setName] = useState('')
  const [color, setColor] = useState(CIRCLE_COLORS[0])
  const [friends, setFriends] = useState([])   // all friends loaded
  const [selected, setSelected] = useState([]) // selected friend ids
  const [loadingFriends, setLoadingFriends] = useState(false)
  const [saving, setSaving] = useState(false)

  async function goToStep3() {
    setStep(3)
    setLoadingFriends(true)
    const { data: fs } = await supabase
      .from('friendships')
      .select('requester, addressee')
      .or(`requester.eq.${session.user.id},addressee.eq.${session.user.id}`)
      .eq('status', 'accepted')
    const ids = (fs || []).map(f => f.requester === session.user.id ? f.addressee : f.requester)
    if (ids.length) {
      const { data: profiles } = await supabase
        .from('profiles').select('id, first_name, last_name, username, avatar_color, avatar_url').in('id', ids)
      setFriends(profiles || [])
    }
    setLoadingFriends(false)
  }

  function toggle(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  async function create() {
    if (!name.trim()) return
    setSaving(true)
    const { data: group } = await supabase
      .from('groups')
      .insert({ owner: session.user.id, name: name.trim(), color })
      .select('id').single()
    if (group && selected.length) {
      await supabase.from('group_members').insert(selected.map(uid => ({ group_id: group.id, member: uid })))
    }
    setSaving(false)
    onCreated?.()
    onClose()
  }

  // step labels
  const STEPS = ['Name', 'Color', 'Add friends']

  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(20,24,30,.4)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} className="sheet-up" style={{ background: '#F9F4F0', borderRadius: '28px 28px 0 0', padding: '0 0 0', maxHeight: '85%', display: 'flex', flexDirection: 'column' }}>
        {/* drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
          <div style={{ width: 42, height: 5, borderRadius: 5, background: '#E0D7CF' }}/>
        </div>

        {/* step header */}
        <div style={{ padding: '16px 20px 0' }}>
          {/* step dots */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
            {STEPS.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: i + 1 === step ? 20 : 8, height: 8, borderRadius: 4, background: i + 1 <= step ? color : '#E0D7CF', transition: 'all .2s' }}/>
                {i < STEPS.length - 1 && <div style={{ width: 16, height: 2, background: i + 1 < step ? color : '#E0D7CF', borderRadius: 1, transition: 'background .2s' }}/>}
              </div>
            ))}
            <span style={{ fontSize: 12, fontWeight: 600, color: '#9A9087', marginLeft: 6 }}>{STEPS[step - 1]}</span>
          </div>
          <div style={{ font: '700 22px -apple-system', color: '#1A1A1A', marginBottom: 18 }}>
            {step === 1 ? 'Name your circle' : step === 2 ? 'Pick a color' : 'Add friends'}
          </div>
        </div>

        {/* step content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }} className="no-scrollbar">
          {step === 1 && (
            <div>
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && name.trim() && setStep(2)}
                placeholder="e.g. Close Friends, Work, Family..."
                style={{ width: '100%', border: '1.5px solid #EBE2DB', borderRadius: 16, padding: '14px 16px', font: '600 17px -apple-system', color: '#1A1A1A', outline: 'none', background: '#fff', boxSizing: 'border-box' }}
              />
            </div>
          )}

          {step === 2 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
              {CIRCLE_COLORS.map(c => (
                <div key={c} onClick={() => setColor(c)}
                  style={{ width: 48, height: 48, borderRadius: '50%', background: c, cursor: 'pointer', outline: c === color ? `4px solid ${c}` : 'none', outlineOffset: 4, boxShadow: c === color ? `0 6px 16px ${c}55` : 'none', transition: 'all .15s' }}/>
              ))}
            </div>
          )}

          {step === 3 && (
            <div>
              {loadingFriends ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[1,2,3].map(i => <div key={i} style={{ height: 58, borderRadius: 14, background: '#EFE8E2' }}/>)}
                </div>
              ) : friends.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '28px 0', fontSize: 13.5, color: '#9A9087' }}>
                  No friends yet - you can add them later.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingBottom: 8 }}>
                  {friends.map(f => {
                    const fname = `${f.first_name || ''} ${f.last_name || ''}`.trim() || f.username
                    const sel = selected.includes(f.id)
                    return (
                      <div key={f.id} onClick={() => toggle(f.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, background: sel ? '#FFF1EC' : '#fff', border: `1.5px solid ${sel ? '#FF6B4A' : '#F1E8E2'}`, borderRadius: 14, padding: '11px 14px', cursor: 'pointer' }}>
                        <Avatar url={f.avatar_url} name={fname} color={f.avatar_color} size={38} />
                        <span style={{ flex: 1, font: '600 14.5px -apple-system', color: sel ? '#FF6B4A' : '#1A1A1A' }}>{fname}</span>
                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: sel ? '#FF6B4A' : '#F5F2EE', border: `2px solid ${sel ? '#FF6B4A' : '#E7DED7'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {sel && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L19 7"/></svg>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* sticky footer CTA */}
        <div style={{ padding: '14px 20px 32px', borderTop: '1px solid #EFE8E2', background: '#F9F4F0', flexShrink: 0 }}>
          {step < 3 ? (
            <div style={{ display: 'flex', gap: 10 }}>
              {step > 1 && (
                <button onClick={() => setStep(s => s - 1)}
                  style={{ flex: 1, padding: 15, border: '1.5px solid #E7DED7', borderRadius: 16, background: '#fff', color: '#7B7268', font: '600 16px -apple-system', cursor: 'pointer' }}>
                  Back
                </button>
              )}
              <button
                onClick={() => step === 1 ? (name.trim() && setStep(2)) : goToStep3()}
                disabled={step === 1 && !name.trim()}
                style={{ flex: 2, padding: 15, border: 'none', borderRadius: 16, background: (step === 1 && !name.trim()) ? '#E7DED7' : '#FF6B4A', color: '#fff', font: '600 16px -apple-system', cursor: (step === 1 && !name.trim()) ? 'default' : 'pointer', boxShadow: (step === 1 && !name.trim()) ? 'none' : '0 10px 22px -8px rgba(255,107,74,.7)', transition: 'all .2s' }}>
                Next
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep(2)}
                style={{ flex: 1, padding: 15, border: '1.5px solid #E7DED7', borderRadius: 16, background: '#fff', color: '#7B7268', font: '600 16px -apple-system', cursor: 'pointer' }}>
                Back
              </button>
              <button onClick={create} disabled={saving}
                style={{ flex: 2, padding: 15, border: 'none', borderRadius: 16, background: '#FF6B4A', color: '#fff', font: '600 16px -apple-system', cursor: 'pointer', boxShadow: '0 10px 22px -8px rgba(255,107,74,.7)' }}>
                {saving ? 'Creating...' : selected.length ? `Create with ${selected.length}` : 'Create circle'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── CircleDetailScreen ───────────────────────────────────────────────────────
function CircleDetailScreen({ circle, allFriends, session, onClose, onSaved, onDeleted }) {
  const [name, setName] = useState(circle.name)
  const [color, setColor] = useState(circle.color || CIRCLE_COLORS[0])
  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState(circle.name)
  const [editColor, setEditColor] = useState(circle.color || CIRCLE_COLORS[0])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [addableFriends, setAddableFriends] = useState([])
  const [selectedToAdd, setSelectedToAdd] = useState([])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadMembers() }, [circle.id])

  async function loadMembers() {
    setLoading(true)
    const { data: rows } = await supabase
      .from('group_members')
      .select('member')
      .eq('group_id', circle.id)
    const ids = (rows || []).map(r => r.member)
    if (!ids.length) { setMembers([]); setLoading(false); return }
    const { data: profiles } = await supabase
      .from('profiles').select('id, first_name, last_name, username, avatar_color, avatar_url').in('id', ids)
    setMembers(profiles || [])
    setLoading(false)
  }

  async function removeMember(memberId) {
    setMembers(prev => prev.filter(m => m.id !== memberId))
    await supabase.from('group_members').delete().eq('group_id', circle.id).eq('member', memberId)
  }

  async function saveEdit() {
    if (!editName.trim()) return
    setSaving(true)
    await supabase.from('groups').update({ name: editName.trim(), color: editColor }).eq('id', circle.id)
    setName(editName.trim())
    setColor(editColor)
    setSaving(false)
    setEditOpen(false)
    onSaved?.()
  }

  async function deleteCircle() {
    await supabase.from('groups').delete().eq('id', circle.id)
    onDeleted?.()
    onClose()
  }

  function openAddPeople() {
    const memberIds = new Set(members.map(m => m.id))
    setAddableFriends(allFriends.filter(f => !memberIds.has(f.id)))
    setSelectedToAdd([])
    setAddOpen(true)
  }

  async function addPeople() {
    if (!selectedToAdd.length) { setAddOpen(false); return }
    setSaving(true)
    await supabase.from('group_members').insert(selectedToAdd.map(uid => ({ group_id: circle.id, member: uid })))
    setSaving(false)
    setAddOpen(false)
    loadMembers()
    onSaved?.()
  }

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40, background: '#F9F4F0', display: 'flex', flexDirection: 'column' }} className="fade-up">

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #EFE8E2', padding: '14px 16px 14px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: '50%', background: '#F2EFEC', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7B7268" strokeWidth="2.4" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <div style={{ width: 14, height: 14, borderRadius: '50%', background: color, flexShrink: 0 }}/>
          <span style={{ flex: 1, font: '700 20px -apple-system', color: '#1A1A1A' }}>{name}</span>
          <button onClick={() => { setEditName(name); setEditColor(color); setEditOpen(true) }}
            style={{ width: 36, height: 36, borderRadius: 10, background: '#F2EFEC', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7B7268" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }} className="no-scrollbar">

        {/* Add people button */}
        <div onClick={openAddPeople}
          style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1.5px dashed #D8D0C8', borderRadius: 16, padding: '13px 16px', marginBottom: 16, cursor: 'pointer', background: '#fff' }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#F2EFEC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9A9087" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
          </div>
          <span style={{ font: '600 15px -apple-system', color: '#9A9087' }}>Add people</span>
        </div>

        {/* Members list */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1,2].map(i => <div key={i} style={{ height: 64, borderRadius: 14, background: '#EFE8E2' }}/>)}
          </div>
        ) : members.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '28px 0', fontSize: 14, color: '#9A9087' }}>No members yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {members.map(m => {
              const mname = `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.username
              return (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', borderRadius: 14, padding: '11px 14px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
                  <Avatar url={m.avatar_url} name={mname} color={m.avatar_color} size={40} />
                  <span style={{ flex: 1, font: '600 15px -apple-system', color: '#1A1A1A' }}>{mname}</span>
                  <button onClick={() => removeMember(m.id)}
                    style={{ border: 'none', background: '#F2EFEC', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9A9087" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Delete footer */}
      <div style={{ padding: '12px 20px 32px', borderTop: '1px solid #EFE8E2', background: '#F9F4F0', flexShrink: 0 }}>
        {confirmDelete ? (
          <div style={{ background: '#FFF1EC', border: '1.5px solid #FFD8CC', borderRadius: 16, padding: '14px 16px', marginBottom: 0 }}>
            <p style={{ margin: '0 0 10px', font: '600 15px -apple-system', color: '#1A1A1A' }}>Delete "{circle.name}"?</p>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#9A9087' }}>All members will be removed from this circle.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirmDelete(false)}
                style={{ flex: 1, padding: '12px 0', border: '1.5px solid #E7DED7', borderRadius: 12, background: '#fff', color: '#7B7268', font: '600 14px -apple-system', cursor: 'pointer' }}>Cancel</button>
              <button onClick={deleteCircle}
                style={{ flex: 1, padding: '12px 0', border: 'none', borderRadius: 12, background: '#E14F2E', color: '#fff', font: '600 14px -apple-system', cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)}
            style={{ width: '100%', padding: 15, border: '1.5px solid #F3D2CC', borderRadius: 16, background: '#fff', color: '#E14F2E', font: '600 15px -apple-system', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E14F2E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>
            Delete circle
          </button>
        )}
      </div>

      {/* Edit circle sheet */}
      {editOpen && (
        <div onClick={() => setEditOpen(false)} style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(20,24,30,.4)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} className="sheet-up" style={{ background: '#F9F4F0', borderRadius: '28px 28px 0 0', padding: '0 0 32px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
              <div style={{ width: 42, height: 5, borderRadius: 5, background: '#E0D7CF' }}/>
            </div>
            <div style={{ padding: '14px 20px 20px', font: '700 20px -apple-system', color: '#1A1A1A' }}>Edit circle</div>

            {/* Name input */}
            <div style={{ padding: '0 20px 20px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#9A9087', letterSpacing: .3, marginBottom: 8 }}>NAME</div>
              <input
                autoFocus
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveEdit()}
                placeholder="Circle name"
                style={{ width: '100%', border: '1.5px solid #EBE2DB', borderRadius: 14, padding: '13px 16px', font: '600 16px -apple-system', color: '#1A1A1A', outline: 'none', background: '#fff', boxSizing: 'border-box' }}
              />
            </div>

            {/* Color swatches */}
            <div style={{ padding: '0 20px 24px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#9A9087', letterSpacing: .3, marginBottom: 14 }}>COLOR</div>
              <div style={{ display: 'flex', gap: 16 }}>
                {CIRCLE_COLORS.map(c => (
                  <div key={c} onClick={() => setEditColor(c)}
                    style={{ width: 44, height: 44, borderRadius: '50%', background: c, cursor: 'pointer', outline: c === editColor ? `3px solid ${c}` : 'none', outlineOffset: 3, boxShadow: c === editColor ? `0 4px 14px ${c}66` : 'none', transition: 'all .15s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {c === editColor && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L19 7"/></svg>}
                  </div>
                ))}
              </div>
            </div>

            {/* Save button */}
            <div style={{ padding: '0 20px' }}>
              <button onClick={saveEdit} disabled={saving || !editName.trim()}
                style={{ width: '100%', padding: 15, border: 'none', borderRadius: 16, background: editName.trim() ? editColor : '#E7DED7', color: '#fff', font: '600 16px -apple-system', cursor: editName.trim() ? 'pointer' : 'default', boxShadow: editName.trim() ? `0 10px 22px -8px ${editColor}99` : 'none', transition: 'all .2s' }}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add people sub-sheet */}
      {addOpen && (
        <div onClick={() => setAddOpen(false)} style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(20,24,30,.4)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} className="sheet-up" style={{ background: '#F9F4F0', borderRadius: '28px 28px 0 0', padding: '0', maxHeight: '70%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
              <div style={{ width: 42, height: 5, borderRadius: 5, background: '#E0D7CF' }}/>
            </div>
            <div style={{ padding: '14px 20px 10px', font: '700 20px -apple-system', color: '#1A1A1A', flexShrink: 0 }}>Add to circle</div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }} className="no-scrollbar">
              {addableFriends.length === 0 ? (
                <p style={{ fontSize: 14, color: '#9A9087', textAlign: 'center', padding: '20px 0' }}>All friends are already in this circle.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingBottom: 8 }}>
                  {addableFriends.map(f => {
                    const fname = `${f.first_name || ''} ${f.last_name || ''}`.trim() || f.username
                    const sel = selectedToAdd.includes(f.id)
                    return (
                      <div key={f.id} onClick={() => setSelectedToAdd(prev => sel ? prev.filter(i => i !== f.id) : [...prev, f.id])}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, background: sel ? '#FFF1EC' : '#fff', border: `1.5px solid ${sel ? '#FF6B4A' : '#F1E8E2'}`, borderRadius: 14, padding: '11px 14px', cursor: 'pointer' }}>
                        <Avatar url={f.avatar_url} name={fname} color={f.avatar_color} size={38} />
                        <span style={{ flex: 1, font: '600 14.5px -apple-system', color: sel ? '#FF6B4A' : '#1A1A1A' }}>{fname}</span>
                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: sel ? '#FF6B4A' : '#F5F2EE', border: `2px solid ${sel ? '#FF6B4A' : '#E7DED7'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {sel && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L19 7"/></svg>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div style={{ padding: '12px 20px 28px', borderTop: '1px solid #EFE8E2', flexShrink: 0 }}>
              <button onClick={addPeople} disabled={saving}
                style={{ width: '100%', padding: 15, border: 'none', borderRadius: 16, background: selectedToAdd.length ? '#FF6B4A' : '#E7DED7', color: '#fff', font: '600 16px -apple-system', cursor: selectedToAdd.length ? 'pointer' : 'default', boxShadow: selectedToAdd.length ? '0 10px 22px -8px rgba(255,107,74,.7)' : 'none' }}>
                {saving ? 'Adding...' : selectedToAdd.length ? `Add ${selectedToAdd.length}` : 'Select friends to add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── FriendsScreen ────────────────────────────────────────────────────────────
export default function FriendsScreen({ session, onOpenAddFriend, externalAddFriendOpen, onCloseAddFriend }) {
  const [friends, setFriends] = useState([])
  const [circles, setCircles] = useState([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [createCircleOpen, setCreateCircleOpen] = useState(false)
  const [menuFriend, setMenuFriend] = useState(null)
  const [activeCircle, setActiveCircle] = useState(null)
  const [circleDetail, setCircleDetail] = useState(null)
  const [viewFriendId, setViewFriendId] = useState(null)
  const [pendingIn, setPendingIn] = useState([])
  const [acceptedMap, setAcceptedMap] = useState({})
  const [deniedMap, setDeniedMap] = useState({})
  const [suggestions, setSuggestions] = useState([])
  const [dismissed, setDismissed] = useState(new Set())

  // If parent signals to open add sheet (e.g. from home bell)
  useEffect(() => {
    if (externalAddFriendOpen) setAddOpen(true)
  }, [externalAddFriendOpen])

  useEffect(() => {
    if (!session) return
    loadAll()
  }, [session])

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadFriends(), loadCircles(), loadIncoming(), loadSuggestions(), loadDismissed()])
    setLoading(false)
  }

  async function loadCircles() {
    const { data } = await supabase
      .from('groups')
      .select('id, name, color')
      .eq('owner', session.user.id)
      .order('created_at')
    setCircles((data || []).map((g, i) => ({ ...g, color: g.color || CIRCLE_COLORS[i % CIRCLE_COLORS.length] })))
  }

  async function loadFriends() {
    const { data: fs } = await supabase
      .from('friendships')
      .select('id, requester, addressee, status')
      .or(`requester.eq.${session.user.id},addressee.eq.${session.user.id}`)
      .eq('status', 'accepted')

    if (!fs?.length) { setFriends([]); return }

    const friendIds = fs.map(f => f.requester === session.user.id ? f.addressee : f.requester)

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, username, avatar_color, avatar_url')
      .in('id', friendIds)

    const { data: memberships } = await supabase
      .from('group_members')
      .select('group_id, member')
      .in('member', friendIds)

    const { data: myGroups } = await supabase
      .from('groups')
      .select('id, name, color')
      .eq('owner', session.user.id)

    const groupMap = {}
    myGroups?.forEach(g => { groupMap[g.id] = g })

    const membershipsByFriend = {}
    memberships?.forEach(m => {
      if (!membershipsByFriend[m.member]) membershipsByFriend[m.member] = []
      if (groupMap[m.group_id]) membershipsByFriend[m.member].push(groupMap[m.group_id])
    })

    const { data: nicknames } = await supabase
      .from('friend_nicknames')
      .select('friend_id, nickname')
      .eq('user_id', session.user.id)
      .in('friend_id', friendIds)

    const nicknameMap = {}
    nicknames?.forEach(n => { nicknameMap[n.friend_id] = n.nickname })

    setFriends((profiles || []).map((p) => ({
      ...p,
      nickname: nicknameMap[p.id] || null,
      groupIds: (membershipsByFriend[p.id] || []).map(g => g.id),
      groupTags: membershipsByFriend[p.id] || [],
    })))
  }

  async function loadIncoming() {
    const { data } = await supabase
      .from('friendships')
      .select('id, requester, profiles!friendships_requester_fkey(first_name, last_name, username, avatar_color, avatar_url)')
      .eq('addressee', session.user.id)
      .eq('status', 'pending')
    setPendingIn(data || [])
  }

  async function loadSuggestions() {
    const { data: rows } = await supabase.rpc('get_friend_suggestions', { p_user_id: session.user.id, p_limit: 6 })
    if (!rows?.length) return
    const ids = rows.map(r => r.user_id)
    const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name, username, avatar_color, avatar_url').in('id', ids)
    const countMap = {}; rows.forEach(r => { countMap[r.user_id] = Number(r.mutual_count) })
    setSuggestions((profiles || []).map(p => ({ ...p, mutuals: countMap[p.id] || 0 })))
  }

  async function loadDismissed() {
    const { data } = await supabase.from('dismissed_suggestions').select('dismissed_id').eq('user_id', session.user.id)
    if (data?.length) setDismissed(new Set(data.map(r => r.dismissed_id)))
  }

  async function acceptRequest(r) {
    await supabase.from('friendships').update({ status: 'accepted', responded_at: new Date().toISOString() }).eq('id', r.id)
    setAcceptedMap(m => ({ ...m, [r.requester]: true }))
    loadFriends()
  }

  async function denyRequest(r) {
    await supabase.from('friendships').delete().eq('id', r.id)
    setDeniedMap(m => ({ ...m, [r.requester]: true }))
  }

  async function dismissSuggestion(userId) {
    setDismissed(prev => new Set([...prev, userId]))
    await supabase.from('dismissed_suggestions').insert({ user_id: session.user.id, dismissed_id: userId })
  }

  const displayed = activeCircle
    ? friends.filter(f => f.groupIds?.includes(activeCircle))
    : friends

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#F9F4F0' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 28px' }} className="no-scrollbar">

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 14px' }}>
          <div style={{ font: "700 28px -apple-system", color: '#1A1A1A' }}>Friends</div>
          <button
            onClick={() => navigator.share?.({ title: "Let's Meet", url: 'https://letsmeet.app' }) || navigator.clipboard?.writeText('https://letsmeet.app')}
            style={{ width: 40, height: 40, borderRadius: 12, background: '#F2EFEC', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7B7268" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.5 13.5 7 4M15.5 6.5l-7 4"/></svg>
          </button>
        </div>

        {/* Search bar */}
        <div onClick={() => setAddOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 9, background: '#fff', border: '1.5px solid #EFE8E2', borderRadius: 14, padding: '13px 15px', margin: '0 20px 20px', cursor: 'pointer' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#B6ADA4" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3-3"/></svg>
          <span style={{ color: '#B6ADA4', fontSize: 14.5 }}>Search by username…</span>
        </div>

        {/* Requests section (inline) */}
        {pendingIn.filter(r => !deniedMap[r.requester]).length > 0 && (
          <div style={{ padding: '0 20px', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ font: "700 13px -apple-system", color: '#9A9087', letterSpacing: 0.5, textTransform: 'uppercase' }}>Requests</span>
              <span style={{ background: '#E5484D', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>
                {pendingIn.filter(r => !deniedMap[r.requester]).length}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pendingIn.filter(r => !deniedMap[r.requester]).map(r => {
                const p = r.profiles
                const name = p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.username : 'Someone'
                const isAccepted = acceptedMap[r.requester]
                return (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', borderRadius: 16, padding: '12px 14px', boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: p?.avatar_color || '#A78BFA', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', font: "600 15px -apple-system", flexShrink: 0 }}>
                      {name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: "600 15px -apple-system", color: '#1A1A1A' }}>{name}</div>
                      <div style={{ fontSize: 12.5, color: '#9A9087' }}>{p?.username}</div>
                    </div>
                    {isAccepted
                      ? <span style={{ fontSize: 13, fontWeight: 600, color: '#0E9C6B', background: '#E4F6EE', padding: '8px 13px', borderRadius: 12 }}>Friends ✓</span>
                      : <div style={{ display: 'flex', gap: 7 }}>
                          <button onClick={() => acceptRequest(r)} style={{ border: 'none', background: '#FF6B4A', color: '#fff', font: "600 13px -apple-system", padding: '9px 14px', borderRadius: 12, cursor: 'pointer' }}>Accept</button>
                          <button onClick={() => denyRequest(r)} style={{ border: '1.5px solid #E7DED7', background: '#fff', color: '#7B7268', font: "600 13px -apple-system", padding: '8px 13px', borderRadius: 12, cursor: 'pointer' }}>Decline</button>
                        </div>
                    }
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Circles horizontal row */}
        <div style={{ padding: '0 0 0 20px', marginBottom: 24 }}>
          <div style={{ font: "700 17px -apple-system", color: '#1A1A1A', marginBottom: 12 }}>Circles</div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingRight: 20, paddingBottom: 4 }} className="no-scrollbar">
            {/* + New always first */}
            <div onClick={() => setCreateCircleOpen(true)}
              style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', background: '#fff', border: '1.5px dashed #D8D0C8', borderRadius: 14, cursor: 'pointer' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9A9087" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
              <span style={{ font: "600 13.5px -apple-system", color: '#9A9087', whiteSpace: 'nowrap' }}>New</span>
            </div>
            {circles.map(c => {
              const memberCount = friends.filter(f => f.groupIds?.includes(c.id)).length
              return (
                <div key={c.id} onClick={() => setCircleDetail(c)}
                  style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px 10px 12px', background: '#fff', border: '1.5px solid #EFE8E2', borderRadius: 14, cursor: 'pointer', transition: 'all .15s' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.color }}/>
                  <span style={{ font: "600 13.5px -apple-system", color: '#1A1A1A', whiteSpace: 'nowrap' }}>{c.name}</span>
                  <span style={{ fontSize: 12, color: '#9A9087' }}>{memberCount}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* People you may know */}
        {suggestions.filter(s => !dismissed.has(s.id)).length > 0 && !activeCircle && (
          <div style={{ padding: '0 20px', marginBottom: 24 }}>
            <div style={{ font: "700 17px -apple-system", color: '#1A1A1A', marginBottom: 12 }}>People you may know</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {suggestions.filter(s => !dismissed.has(s.id)).map(u => {
                const name = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username
                return (
                  <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', borderRadius: 16, padding: '12px 14px', boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: u.avatar_color || '#A78BFA', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', font: "600 15px -apple-system", flexShrink: 0 }}>
                      {name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: "600 15px -apple-system", color: '#1A1A1A' }}>{name}</div>
                      <div style={{ fontSize: 12.5, color: '#9A9087' }}>{u.username}{u.mutuals > 0 ? ` · ${u.mutuals} mutual` : ''}</div>
                    </div>
                    <button onClick={() => dismissSuggestion(u.id)}
                      style={{ border: 'none', background: 'none', color: '#C4BBB2', fontSize: 20, lineHeight: 1, cursor: 'pointer', padding: '4px 6px', marginRight: 4 }}>
                      ×
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* All friends / filtered list */}
        <div style={{ padding: '0 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 13 }}>
            <div style={{ font: "700 17px -apple-system", color: '#1A1A1A' }}>
              {activeCircle ? circles.find(c => c.id === activeCircle)?.name : 'All friends'}
            </div>
            <span style={{ fontSize: 13, color: '#9A9087', fontWeight: 600 }}>{displayed.length}</span>
          </div>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[1, 2, 3].map(i => <div key={i} style={{ height: 68, borderRadius: 16, background: '#EFE8E2' }}/>)}
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 16, padding: '28px 20px', textAlign: 'center' }}>
              <p style={{ margin: '0 0 4px', font: "600 16px -apple-system", color: '#1A1A1A' }}>
                {activeCircle ? 'No friends in this circle' : 'No friends yet'}
              </p>
              <p style={{ margin: 0, fontSize: 13.5, color: '#9A9087', lineHeight: 1.5 }}>
                {activeCircle
                  ? "Tap a friend's ⋯ menu to add them here."
                  : 'Use the search bar to find friends.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {displayed.map(f => {
                const realName = `${f.first_name || ''} ${f.last_name || ''}`.trim() || f.username
                const displayName = f.nickname || realName
                return (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', borderRadius: 16, padding: '12px 8px 12px 14px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
                    <div onClick={() => setViewFriendId(f.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, cursor: 'pointer' }}>
                      <AvatarImg url={f.avatar_url} name={displayName} color={f.avatar_color} size={44}/>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ font: "600 15px -apple-system", color: '#1A1A1A' }}>{displayName}</div>
                        {f.nickname && <div style={{ fontSize: 12, color: '#B6ADA4', marginBottom: 2 }}>{realName}</div>}
                        {f.groupTags.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 3 }}>
                            {f.groupTags.map(t => (
                              <span key={t.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: t.color || '#A78BFA', background: `color-mix(in srgb, ${t.color || '#A78BFA'} 13%, #fff)`, padding: '2px 8px', borderRadius: 20 }}>
                                <span style={{ width: 5, height: 5, borderRadius: '50%', background: t.color || '#A78BFA' }}/>
                                {t.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div onClick={() => setMenuFriend(f)}
                      style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="#B6ADA4"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>

      {/* sheets */}
      {addOpen && (
        <AddFriendSheet
          session={session}
          onClose={() => { setAddOpen(false); onCloseAddFriend?.(); loadAll() }}
          onRequestAccepted={loadAll}
        />
      )}
      {createCircleOpen && (
        <CreateCircleSheet
          session={session}
          onClose={() => setCreateCircleOpen(false)}
          onCreated={loadAll}
        />
      )}
      {menuFriend && (
        <FriendMenuSheet
          friend={menuFriend}
          allGroups={circles}
          session={session}
          onClose={() => setMenuFriend(null)}
          onSaved={loadAll}
          onRemoved={loadAll}
        />
      )}
      {viewFriendId && (
        <UserProfileSheet
          userId={viewFriendId}
          myId={session.user.id}
          onClose={() => setViewFriendId(null)}
        />
      )}
      {circleDetail && (
        <CircleDetailScreen
          circle={circleDetail}
          allFriends={friends}
          session={session}
          onClose={() => setCircleDetail(null)}
          onSaved={() => { setCircleDetail(null); loadAll() }}
          onDeleted={() => { setCircleDetail(null); loadAll() }}
        />
      )}
    </div>
  )
}
