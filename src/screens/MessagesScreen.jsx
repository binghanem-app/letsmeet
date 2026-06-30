import { useEffect, useRef, useState, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import Avatar from '../components/Avatar'
import CategoryTile from '../components/CategoryTile'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'
import emptyChatUrl from '../assets/empty-chat.png'

// ─── helpers ──────────────────────────────────────────────────────────────────
function fullName(p) {
  if (!p) return 'Unknown'
  return `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.username || 'Unknown'
}

// Date/time formatting for the shared-plan chip — friendly "Tonight · 7:30"-style
// day label, matching the plan cards.
function shortDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[d.getMonth()]} ${d.getDate()}`
}
function dayWord(iso) {
  if (!iso) return ''
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const target = new Date(iso); target.setHours(0, 0, 0, 0)
  const days = Math.round((target - today) / 86400000)
  if (days === 0) return new Date(iso).getHours() >= 17 ? 'Tonight' : 'Today'
  if (days === 1) return 'Tomorrow'
  if (days > 1 && days < 7) return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(iso).getDay()]
  return shortDate(iso)
}
function fmtTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// list timestamp: "9:32 AM" today, "Yesterday", weekday this week, else date
function listTime(iso) {
  if (!iso) return ''
  const d = new Date(iso), now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const y = new Date(now); y.setDate(now.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  const diffDays = Math.floor((now - d) / 86400000)
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function bubbleTime(iso) {
  return iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''
}
function dayLabel(iso) {
  const d = new Date(iso), now = new Date()
  if (d.toDateString() === now.toDateString()) return 'Today'
  const y = new Date(now); y.setDate(now.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

// Avatar with an online dot on the bottom-left corner
function AvatarDot({ profile, size, online, ring = '#fff' }) {
  const dot = Math.round(size * 0.27)
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <Avatar url={profile?.avatar_url} name={fullName(profile)} color={profile?.avatar_color} size={size} />
      {online && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: dot, height: dot, borderRadius: '50%', background: '#12B886', border: `2.5px solid ${ring}` }} />
      )}
    </div>
  )
}

// ─── Chat thread ──────────────────────────────────────────────────────────────
function DMThread({ session, peer, online, onBack, onOpenProfile, onOpenPlan }) {
  const myId = session.user.id
  const [messages, setMessages] = useState([])
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sharedPlans, setSharedPlans] = useState([])
  const [plansOpen, setPlansOpen] = useState(false)
  const [showPhotoSheet, setShowPhotoSheet] = useState(false)
  const [fullImg, setFullImg] = useState(null)
  const scrollRef = useRef(null)
  const channelRef = useRef(null)
  const fileInputRef = useRef(null)
  const myNameRef = useRef('Someone')

  // Edge-swipe-right to go back (iOS pop gesture; webviews don't give this free).
  const swipe = useRef({ active: false, startX: 0, startY: 0, dx: 0 })
  const [dragX, setDragX] = useState(0)
  const [swiping, setSwiping] = useState(false)
  function onSwipeStart(e) {
    const t = e.touches[0]
    if (t.clientX > 28) { swipe.current.active = false; return } // only from the left edge
    swipe.current = { active: true, startX: t.clientX, startY: t.clientY, dx: 0 }
    setSwiping(true)
  }
  function onSwipeMove(e) {
    if (!swipe.current.active) return
    const t = e.touches[0]
    const dx = t.clientX - swipe.current.startX
    const dy = t.clientY - swipe.current.startY
    if (dx < Math.abs(dy)) { swipe.current.active = false; setSwiping(false); setDragX(0); return } // vertical → let it scroll
    swipe.current.dx = Math.max(0, dx)
    setDragX(swipe.current.dx)
  }
  function onSwipeEnd() {
    if (!swipe.current.active) return
    swipe.current.active = false
    setSwiping(false)
    if (swipe.current.dx > 90) onBack()
    else setDragX(0)
  }

  const scrollDown = () => setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, 60)

  async function markRead() {
    await supabase.from('direct_messages').update({ read_at: new Date().toISOString() })
      .eq('sender', peer.id).eq('recipient', myId).is('read_at', null)
  }

  // Insert a notification so the existing push pipeline (on_notification_inserted
  // → send-push) fires an APNs push to the peer. `actor` = me, which the app
  // uses as the conversation peer to open on tap. No plan_id for DMs.
  async function notifyPeer(preview) {
    try {
      await supabase.from('notifications').insert({
        recipient: peer.id, actor: myId, kind: 'dm',
        body: `${myNameRef.current}: ${preview}`,
      })
    } catch { /* best-effort; never block sending on the notification */ }
  }

  useEffect(() => {
    let alive = true
    setSharedPlans([]); setPlansOpen(false) // clear stale chip while switching peers
    ;(async () => {
      supabase.from('profiles').select('first_name').eq('id', myId).maybeSingle()
        .then(({ data: me }) => { if (me?.first_name) myNameRef.current = me.first_name })
      const { data } = await supabase.from('direct_messages')
        .select('id, sender, recipient, body, photo_url, created_at, read_at')
        .or(`and(sender.eq.${myId},recipient.eq.${peer.id}),and(sender.eq.${peer.id},recipient.eq.${myId})`)
        .order('created_at', { ascending: true })
      if (!alive) return
      setMessages(data || [])
      scrollDown()
      markRead()
      // shared upcoming plan between the two (the "active card" bridge)
      findSharedPlan()
    })()

    // All DM rows I can see are RLS-scoped to my own conversations; filter to
    // this peer. Cover INSERTs (incoming + my own sends from another device) and
    // UPDATEs (peer marking my messages read → live "· Read").
    const ch = supabase.channel(`dm-thread-${myId}-${peer.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_messages' }, ({ eventType, new: m }) => {
        if (!m) return
        const inConvo = (m.sender === myId && m.recipient === peer.id) || (m.sender === peer.id && m.recipient === myId)
        if (!inConvo) return
        if (eventType === 'INSERT') {
          setMessages(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m])
          scrollDown()
          if (m.sender === peer.id) markRead()
        } else if (eventType === 'UPDATE') {
          setMessages(prev => prev.map(x => x.id === m.id ? { ...x, ...m } : x))
        }
      })
      .subscribe()
    channelRef.current = ch
    return () => { alive = false; supabase.removeChannel(ch) }
  }, [peer.id])

  // All active (upcoming/ongoing) plans the two share, most-relevant first, in ONE
  // round-trip (was 5 chained queries that made the chip pop in ~1s after open).
  async function findSharedPlan() {
    const { data } = await supabase.rpc('dm_shared_plan', { peer: peer.id })
    setSharedPlans(Array.isArray(data) ? data : data ? [data] : [])
  }

  async function send() {
    const text = body.trim()
    if (!text || sending) return
    setSending(true); setBody('')
    const { data: msg } = await supabase.from('direct_messages')
      .insert({ sender: myId, recipient: peer.id, body: text })
      .select('id, sender, recipient, body, photo_url, created_at, read_at').single()
    if (msg) { setMessages(prev => [...prev, msg]); scrollDown(); notifyPeer(text) }
    setSending(false)
  }

  async function uploadAndSendPhoto(src, format) {
    setSending(true)
    try {
      let blob
      if (src.startsWith('data:') || src.startsWith('http')) {
        const res = await fetch(src); blob = await res.blob()
      } else {
        const bin = atob(src); const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        blob = new Blob([bytes], { type: `image/${format || 'jpeg'}` })
      }
      if (!blob?.size) { setSending(false); return }
      const ext = format || 'jpeg'
      const pair = [myId, peer.id].sort().join('_')
      const path = `dm/${pair}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('chat-images').upload(path, blob, { contentType: `image/${ext}` })
      if (upErr) { alert(`Upload error: ${upErr.message}`); setSending(false); return }
      const { data: { publicUrl } } = supabase.storage.from('chat-images').getPublicUrl(path)
      const { data: msg } = await supabase.from('direct_messages')
        .insert({ sender: myId, recipient: peer.id, photo_url: publicUrl })
        .select('id, sender, recipient, body, photo_url, created_at, read_at').single()
      if (msg) { setMessages(prev => [...prev, msg]); scrollDown(); notifyPeer('📷 Photo') }
    } catch (e) { alert(`Photo error: ${e?.message || e}`) }
    setSending(false)
  }

  async function pickPhoto(source) {
    setShowPhotoSheet(false)
    if (!Capacitor.isNativePlatform()) { fileInputRef.current?.click(); return }
    try {
      if (source === CameraSource.Camera) {
        const perm = await Camera.requestPermissions({ permissions: ['camera'] })
        if (perm.camera === 'denied') { alert("Camera access was denied. Enable it in Settings → Let's Meet."); return }
      }
      const photo = await Camera.getPhoto({ resultType: CameraResultType.Base64, source, quality: 80, width: 1200 })
      if (photo.base64String) await uploadAndSendPhoto(photo.base64String, photo.format)
    } catch (e) {
      const m = e?.message || ''
      if (m === 'User cancelled photos app' || m === 'User cancelled') return
      alert(`Camera error: ${m || 'Unknown error'}`)
    }
  }

  let lastDay = null

  return (
    <div onTouchStart={onSwipeStart} onTouchMove={onSwipeMove} onTouchEnd={onSwipeEnd} onTouchCancel={onSwipeEnd}
      style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#F9F4F0', position: 'relative', transform: dragX ? `translateX(${dragX}px)` : undefined, transition: swiping ? 'none' : 'transform .25s ease', boxShadow: dragX ? '-12px 0 24px rgba(20,24,30,.12)' : undefined }}>
      {/* header */}
      <div style={{ background: '#fff', boxShadow: '0 1px 0 rgba(0,0,0,.05)', flexShrink: 0, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 11 }}>
        <button onClick={onBack} style={{ width: 38, height: 38, borderRadius: '50%', background: '#F2EFEC', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1A1A1A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <div onClick={() => onOpenProfile?.(peer.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, cursor: 'pointer' }}>
          <AvatarDot profile={peer} size={42} online={online} />
          <div style={{ minWidth: 0 }}>
            <div style={{ font: '700 17px -apple-system', color: '#1A1A1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullName(peer)}</div>
            {online && <div style={{ fontSize: 12, fontWeight: 500, color: '#12B886' }}>Online</div>}
          </div>
        </div>
        <button onClick={() => onOpenProfile?.(peer.id)} style={{ width: 38, height: 38, borderRadius: '50%', background: '#F2EFEC', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9A9087" strokeWidth="2.4" strokeLinecap="round"><circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></svg>
        </button>
      </div>

      {/* shared-plan chip — real plan-card icon + "Venue · When". One plan taps
          straight in; 2+ collapse behind a "+N" badge that expands to a list. */}
      {sharedPlans.length > 0 && (() => {
        const planLine = (p) => {
          const title = p.title || p.place_name
          const time = p.time_label || fmtTime(p.starts_at)
          const when = p.starts_at ? [dayWord(p.starts_at), time].filter(Boolean).join(' ') : null
          return [title, when].filter(Boolean).join(' · ')
        }
        const multi = sharedPlans.length > 1
        const first = sharedPlans[0]
        const wrap = { margin: '14px 16px 0', background: '#fff', border: '1px solid #F1E8E2', borderRadius: 18, boxShadow: '0 8px 22px -16px rgba(20,24,30,.4)', overflow: 'hidden' }
        const rowBase = { display: 'flex', alignItems: 'center', gap: 13, padding: '12px 14px', cursor: 'pointer' }
        return (
          <div className="fade-up" style={wrap}>
            {/* single: whole card opens the plan. multi: content opens the soonest
                plan, the arrow/+N region toggles the list. */}
            {!multi ? (
              <div onClick={() => onOpenPlan?.(first.id)} style={rowBase}>
                <CategoryTile vibe={first.vibe} size={50} radius={14} />
                <div style={{ flex: 1, minWidth: 0, font: '700 16px/1.3 -apple-system', color: '#1A1A1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {planLine(first)}
                </div>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF7A5A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="m9 18 6-6-6-6"/></svg>
              </div>
            ) : (
              <div style={rowBase}>
                <div onClick={() => onOpenPlan?.(first.id)} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 13, cursor: 'pointer' }}>
                  <CategoryTile vibe={first.vibe} size={50} radius={14} />
                  <div style={{ flex: 1, minWidth: 0, font: '700 16px/1.3 -apple-system', color: '#1A1A1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {planLine(first)}
                  </div>
                </div>
                <div onClick={() => setPlansOpen(o => !o)} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7, padding: '8px 4px 8px 12px', marginRight: -4, cursor: 'pointer' }}>
                  {!plansOpen && (
                    <span style={{ minWidth: 24, height: 22, borderRadius: 11, background: '#FFF1EC', color: '#FF6B4A', font: '700 12px -apple-system', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 7px' }}>+{sharedPlans.length - 1}</span>
                  )}
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF7A5A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: `rotate(${plansOpen ? -90 : 90}deg)`, transition: 'transform .2s ease' }}><path d="m9 18 6-6-6-6"/></svg>
                </div>
              </div>
            )}
            {/* expanded list: the remaining plans, each opens its plan */}
            {multi && plansOpen && sharedPlans.slice(1).map(p => (
              <div key={p.id} onClick={() => onOpenPlan?.(p.id)} style={{ ...rowBase, borderTop: '1px solid #F5F0EB' }}>
                <CategoryTile vibe={p.vibe} size={42} radius={12} />
                <div style={{ flex: 1, minWidth: 0, font: '600 15px/1.3 -apple-system', color: '#1A1A1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {planLine(p)}
                </div>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C4BBB2" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="m9 18 6-6-6-6"/></svg>
              </div>
            ))}
          </div>
        )
      })()}

      {/* messages */}
      <div ref={scrollRef} className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 6px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        {messages.map((m) => {
          const mine = m.sender === myId
          const d = dayLabel(m.created_at)
          const showDay = d !== lastDay; lastDay = d
          return (
            <Fragment key={m.id}>
              {showDay && (
                <div style={{ alignSelf: 'center', background: '#ECE6E0', color: '#9A9087', font: '500 11px -apple-system', padding: '4px 12px', borderRadius: 20, margin: '6px 0 2px' }}>{d}</div>
              )}
              {mine ? (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{ maxWidth: 250 }}>
                    <div style={{ background: '#FF6B4A', color: '#fff', borderRadius: '16px 16px 4px 16px', padding: m.photo_url ? 4 : '10px 13px', overflow: 'hidden' }}>
                      {m.photo_url
                        ? <img src={m.photo_url} onClick={() => setFullImg(m.photo_url)} style={{ display: 'block', maxWidth: 230, borderRadius: 12, cursor: 'pointer' }} />
                        : <span style={{ font: '400 14px/1.5 -apple-system' }}>{m.body}</span>}
                    </div>
                    <div style={{ fontSize: 10, color: '#C4BBB2', textAlign: 'right', marginTop: 3 }}>{bubbleTime(m.created_at)} · {m.read_at ? 'Read' : 'Sent'}</div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  <Avatar url={peer.avatar_url} name={fullName(peer)} color={peer.avatar_color} size={28} />
                  <div style={{ maxWidth: 230 }}>
                    <div style={{ background: '#fff', border: '1px solid #F1E8E2', borderRadius: '16px 16px 16px 4px', padding: m.photo_url ? 4 : '10px 13px', boxShadow: '0 1px 2px rgba(0,0,0,.06)', overflow: 'hidden' }}>
                      {m.photo_url
                        ? <img src={m.photo_url} onClick={() => setFullImg(m.photo_url)} style={{ display: 'block', maxWidth: 218, borderRadius: 12, cursor: 'pointer' }} />
                        : <span style={{ font: '400 14px/1.5 -apple-system', color: '#1A1A1A' }}>{m.body}</span>}
                    </div>
                    <div style={{ fontSize: 10, color: '#C4BBB2', marginTop: 3, marginLeft: 2 }}>{bubbleTime(m.created_at)}</div>
                  </div>
                </div>
              )}
            </Fragment>
          )
        })}
      </div>

      {/* input bar */}
      <div style={{ background: '#fff', boxShadow: '0 -1px 0 rgba(0,0,0,.05)', flexShrink: 0, padding: '11px 14px calc(env(safe-area-inset-bottom, 0px) + 14px)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => (Capacitor.isNativePlatform() ? setShowPhotoSheet(true) : fileInputRef.current?.click())} style={{ width: 38, height: 38, borderRadius: '50%', background: '#F2EFEC', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9A9087" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
        </button>
        <input value={body} onChange={e => setBody(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Message…" style={{ flex: 1, height: 42, background: '#F2EFEC', border: 'none', borderRadius: 21, padding: '0 18px', font: '400 15px -apple-system', color: '#1A1A1A', outline: 'none' }} />
        <button onClick={send} disabled={sending || !body.trim()} style={{ width: 42, height: 42, borderRadius: '50%', background: '#FF6B4A', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: body.trim() ? 1 : .5, boxShadow: '0 3px 10px rgba(255,107,74,.4)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 3 3 10.5l6.5 2.5L12 21l3-7 6-11Z"/><path d="m21 3-11.5 10"/></svg>
        </button>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = () => uploadAndSendPhoto(r.result); r.readAsDataURL(f) } e.target.value = '' }} />

      {/* photo source sheet (native) */}
      {showPhotoSheet && (
        <div onClick={() => setShowPhotoSheet(false)} style={{ position: 'absolute', inset: 0, zIndex: 70, background: 'rgba(20,24,30,.5)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} className="sheet-up" style={{ background: '#FBF7F4', borderRadius: '24px 24px 0 0', padding: '10px 16px calc(env(safe-area-inset-bottom,0px) + 16px)' }}>
            <div style={{ width: 42, height: 5, borderRadius: 5, background: '#E0D7CF', margin: '0 auto 14px' }}/>
            <button onClick={() => pickPhoto(CameraSource.Camera)} style={photoOpt}>Take photo</button>
            <button onClick={() => pickPhoto(CameraSource.Photos)} style={photoOpt}>Choose from library</button>
            <button onClick={() => setShowPhotoSheet(false)} style={{ ...photoOpt, color: '#9A9087', marginTop: 4 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* fullscreen image */}
      {fullImg && (
        <div onClick={() => setFullImg(null)} style={{ position: 'absolute', inset: 0, zIndex: 80, background: 'rgba(0,0,0,.9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={fullImg} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        </div>
      )}
    </div>
  )
}
const photoOpt = { display: 'block', width: '100%', padding: 15, border: 'none', borderRadius: 14, background: '#fff', font: '600 15px -apple-system', color: '#1F2933', cursor: 'pointer', marginBottom: 8 }

// ─── Conversation list ────────────────────────────────────────────────────────
export default function MessagesScreen({ session, onlineIds, openPeerId, onPeerOpened, onUnreadChange, onOpenProfile, onOpenPlan, refreshTrigger, backToListTrigger }) {
  const myId = session.user.id
  const [convos, setConvos] = useState([])
  const [profiles, setProfiles] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState(null)
  const [active, setActive] = useState(null) // peer profile object
  const [showCompose, setShowCompose] = useState(false)
  const [friends, setFriends] = useState([])
  const [composeSearch, setComposeSearch] = useState('')
  const searchTimer = useRef(null)

  function closeCompose() { setShowCompose(false); setComposeSearch('') }

  useEffect(() => () => clearTimeout(searchTimer.current), [])

  async function openCompose() {
    setShowCompose(true)
    const { data: fr } = await supabase.from('friendships')
      .select('requester, addressee').or(`requester.eq.${myId},addressee.eq.${myId}`).eq('status', 'accepted')
    const ids = (fr || []).map(f => (f.requester === myId ? f.addressee : f.requester))
    if (!ids.length) { setFriends([]); return }
    const { data: profs } = await supabase.from('profiles')
      .select('id, first_name, last_name, username, avatar_color, avatar_url').in('id', ids)
    setFriends((profs || []).sort((a, b) => fullName(a).localeCompare(fullName(b))))
  }

  async function loadConvos() {
    const { data } = await supabase.rpc('dm_conversations')
    const rows = data || []
    setConvos(rows)
    const ids = rows.map(r => r.peer)
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, first_name, last_name, username, avatar_color, avatar_url').in('id', ids)
      const map = {}; (profs || []).forEach(p => { map[p.id] = p }); setProfiles(map)
    }
    setLoading(false)
    const total = rows.reduce((n, r) => n + (r.unread || 0), 0)
    onUnreadChange?.(total)
  }

  useEffect(() => { loadConvos() }, [refreshTrigger])

  // live list updates: any new incoming DM refreshes the list/badge
  useEffect(() => {
    const ch = supabase.channel(`dm-list-${myId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `recipient=eq.${myId}` }, () => loadConvos())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [myId])

  // open a DM when asked from outside (profile sheet)
  useEffect(() => {
    if (!openPeerId) return
    ;(async () => {
      let p = profiles[openPeerId]
      if (!p) { const { data } = await supabase.from('profiles').select('id, first_name, last_name, username, avatar_color, avatar_url').eq('id', openPeerId).single(); p = data }
      if (p) setActive(p)
      onPeerOpened?.()
    })()
  }, [openPeerId])

  // Tapping the Messages tab while already on it pops back to the conversation
  // list (iOS "tap active tab → root"). A plain tab switch keeps `active` intact.
  useEffect(() => {
    if (!backToListTrigger) return
    setActive(null)
    closeCompose()
    loadConvos()
  }, [backToListTrigger])

  function openChat(peerId) {
    const p = profiles[peerId]
    if (p) setActive(p)
  }
  function closeChat() {
    setActive(null)
    loadConvos() // refresh unread after reading
  }

  function runSearch(q) {
    setSearch(q)
    clearTimeout(searchTimer.current)
    if (!q.trim()) { setResults(null); return }
    searchTimer.current = setTimeout(async () => {
      const { data } = await supabase.rpc('dm_search', { q: q.trim() })
      // ensure we have profiles for any peers in results
      const ids = [...new Set((data || []).map(r => r.peer))].filter(id => !profiles[id])
      if (ids.length) {
        const { data: profs } = await supabase.from('profiles').select('id, first_name, last_name, username, avatar_color, avatar_url').in('id', ids)
        setProfiles(prev => { const m = { ...prev }; (profs || []).forEach(p => { m[p.id] = p }); return m })
      }
      setResults(data || [])
    }, 300)
  }

  if (active) {
    return <DMThread session={session} peer={active} online={onlineIds?.has(active.id)} onBack={closeChat} onOpenProfile={onOpenProfile} onOpenPlan={onOpenPlan} />
  }

  const previewText = (r) => r.last_photo && !r.last_body ? '📷 Photo' : (r.last_body || '')

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#F9F4F0', position: 'relative' }}>
      {/* header */}
      <div style={{ background: '#F9F4F0', flexShrink: 0, padding: '8px 20px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, marginTop: 6 }}>
          <span style={{ font: '700 28px -apple-system', color: '#1A1A1A' }}>Messages</span>
          <button onClick={openCompose} style={{ width: 40, height: 40, borderRadius: '50%', background: '#FFF1EC', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#FF6B4A" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </button>
        </div>
        <div style={{ height: 40, background: '#F2EFEC', borderRadius: 13, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 9 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B6ADA4" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3-3"/></svg>
          <input value={search} onChange={e => runSearch(e.target.value)} placeholder="Search messages" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', font: '400 14px -apple-system', color: '#1A1A1A' }} />
          {search && <span onClick={() => runSearch('')} style={{ color: '#C4BBB2', fontSize: 18, cursor: 'pointer' }}>×</span>}
        </div>
      </div>

      {/* body */}
      <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div className="spin" style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid #E0D7CF', borderTopColor: '#FF6B4A' }}/>
          </div>
        ) : results !== null ? (
          // search results
          results.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 24px', fontSize: 14, color: '#9A9087' }}>No messages found.</div>
          ) : results.map(r => {
            const p = profiles[r.peer]
            return (
              <div key={r.message_id} onClick={() => openChat(r.peer)} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 20px', cursor: 'pointer' }}>
                <AvatarDot profile={p} size={48} online={onlineIds?.has(r.peer)} ring="#F9F4F0" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: '600 15px -apple-system', color: '#1A1A1A' }}>{fullName(p)}</div>
                  <div style={{ fontSize: 13, color: '#9A9087', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{r.is_mine ? 'You: ' : ''}{r.body}</div>
                </div>
                <span style={{ fontSize: 11, color: '#B6ADA4', flexShrink: 0 }}>{listTime(r.created_at)}</span>
              </div>
            )
          })
        ) : convos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 30px' }}>
            <img src={emptyChatUrl} alt="" style={{ width: 130, display: 'block', margin: '0 auto 14px' }} />
            <p style={{ font: '600 17px -apple-system', color: '#1A1A1A', margin: '0 0 6px' }}>No messages yet</p>
            <p style={{ fontSize: 14, color: '#9A9087', margin: 0, lineHeight: 1.5 }}>Open a friend's profile and tap Message to start a conversation.</p>
          </div>
        ) : convos.map(r => {
          const p = profiles[r.peer]
          const unread = r.unread > 0
          const mineLast = r.last_sender === myId
          return (
            <div key={r.peer} onClick={() => openChat(r.peer)} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 20px', cursor: 'pointer', background: unread ? '#FFF7F4' : 'transparent' }}>
              <AvatarDot profile={p} size={54} online={onlineIds?.has(r.peer)} ring={unread ? '#FFF7F4' : '#F9F4F0'} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ font: `${unread ? 700 : 600} 16px -apple-system`, color: '#1A1A1A' }}>{fullName(p)}</span>
                  <span style={{ font: `${unread ? 600 : 400} 12px -apple-system`, color: unread ? '#FF6B4A' : '#B6ADA4', flexShrink: 0, marginLeft: 8 }}>{listTime(r.last_at)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  <span style={{ flex: 1, minWidth: 0, font: `${unread ? 500 : 400} 13px -apple-system`, color: unread ? '#5B5048' : '#9A9087', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {mineLast ? 'You: ' : ''}{previewText(r)}
                  </span>
                  {unread && (
                    <span style={{ minWidth: 22, height: 22, borderRadius: 11, background: '#FF6B4A', color: '#fff', font: '700 11px -apple-system', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px', flexShrink: 0 }}>{r.unread > 99 ? '99+' : r.unread}</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {showCompose && (() => {
        const q = composeSearch.trim().toLowerCase()
        const shown = !q ? friends : friends.filter(f =>
          fullName(f).toLowerCase().includes(q) || (f.username || '').toLowerCase().includes(q))
        return (
          <div className="fade-up" style={{ position: 'absolute', inset: 0, zIndex: 70, background: '#F9F4F0', display: 'flex', flexDirection: 'column' }}>
            {/* title bar */}
            <div style={{ background: '#fff', boxShadow: '0 1px 0 rgba(0,0,0,.05)', flexShrink: 0, padding: '10px 16px 14px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <button onClick={closeCompose} style={{ width: 38, height: 38, borderRadius: '50%', background: '#F2EFEC', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1A1A1A" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
              <span style={{ flex: 1, font: '700 19px -apple-system', color: '#1A1A1A' }}>New message</span>
            </div>
            {/* "To:" search */}
            <div style={{ background: '#fff', boxShadow: '0 1px 0 rgba(0,0,0,.05)', flexShrink: 0, padding: '0 16px 14px' }}>
              <div style={{ height: 42, background: '#F2EFEC', borderRadius: 13, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ font: '600 14px -apple-system', color: '#9A9087', flexShrink: 0 }}>To:</span>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#B6ADA4" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="7"/><path d="m20 20-3-3"/></svg>
                <input autoFocus value={composeSearch} onChange={e => setComposeSearch(e.target.value)} placeholder="Search friends" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', font: '400 14px -apple-system', color: '#1A1A1A' }} />
              </div>
            </div>
            {/* friends list */}
            <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 20px)' }}>
              {friends.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 24px', color: '#9A9087', fontSize: 14 }}>Add friends first to start a conversation.</div>
              ) : shown.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 24px', color: '#9A9087', fontSize: 14 }}>No friends match “{composeSearch.trim()}”.</div>
              ) : (
                <>
                  <div style={{ font: '700 12px -apple-system', letterSpacing: .4, color: '#9A9087', padding: '16px 20px 8px' }}>ALL FRIENDS</div>
                  {shown.map(f => (
                    <div key={f.id} onClick={() => { closeCompose(); setActive(f) }} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '10px 20px', cursor: 'pointer' }}>
                      <AvatarDot profile={f} size={48} online={onlineIds?.has(f.id)} ring="#F9F4F0" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ font: '600 15px -apple-system', color: '#1A1A1A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fullName(f)}</div>
                        {f.username && <div style={{ fontSize: 12, color: '#9A9087', marginTop: 1 }}>@{f.username}</div>}
                      </div>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C4BBB2" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="m9 18 6-6-6-6"/></svg>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
