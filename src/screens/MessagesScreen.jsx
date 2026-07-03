import { useEffect, useRef, useState, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import Avatar from '../components/Avatar'
import CategoryTile from '../components/CategoryTile'
import PullToRefresh from '../components/PullToRefresh'
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

// Quick-reaction set for the press-and-hold menu (iMessage-style).
const REACT_EMOJIS = ['❤️', '😂', '👍', '😮', '😢', '🙏']
// Expanded grid shown when the "+" is tapped (no way to open the iOS emoji
// keyboard from a webview, so we provide our own picker).
const MORE_EMOJIS = ['❤️','😂','👍','😮','😢','🙏','🔥','🎉','😍','😎','🥳','😅','😭','😡','👏','🙌','💯','✨','🤔','😴','😇','🤩','😘','😋','🤣','😉','🙂','😊','👌','🤝','💪','🫶','👀','🥹','😏','🤗','😱','🤯','🥺','😤','🙃','😆','😜','🤪','💔','🎂','☕','🍕']

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
  const [reactions, setReactions] = useState({}) // message_id -> [{user_id, emoji}]
  const [menuFor, setMenuFor] = useState(null)    // held message (context menu)
  const [emojiPicker, setEmojiPicker] = useState(false) // expanded "+" grid
  const [replyTo, setReplyTo] = useState(null)    // message being replied to
  const [editing, setEditing] = useState(null)    // message being edited
  const [reportingMsg, setReportingMsg] = useState(null)
  const [reportDone, setReportDone] = useState(false)
  const [reportError, setReportError] = useState(false)
  const [reactInfo, setReactInfo] = useState(null) // message whose reactions we're viewing
  const pillTimer = useRef(null)
  const pillHandled = useRef(false)
  const pressTimer = useRef(null)
  const pressPos = useRef({ x: 0, y: 0 })
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
        .select('id, sender, recipient, body, photo_url, created_at, read_at, reply_to, edited_at, deleted_at')
        .or(`and(sender.eq.${myId},recipient.eq.${peer.id}),and(sender.eq.${peer.id},recipient.eq.${myId})`)
        .order('created_at', { ascending: true })
      if (!alive) return
      setMessages(data || [])
      loadReactions((data || []).map(m => m.id))
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

    // Live reactions: any change refetches reactions for the messages on screen.
    const rch = supabase.channel(`dm-react-${myId}-${peer.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_reactions' }, () => {
        setMessages(cur => { loadReactions(cur.map(m => m.id)); return cur })
      })
      .subscribe()

    return () => { alive = false; supabase.removeChannel(ch); supabase.removeChannel(rch) }
  }, [peer.id])

  async function loadReactions(ids) {
    if (!ids || !ids.length) { setReactions({}); return }
    const { data } = await supabase.from('dm_reactions').select('message_id, user_id, emoji').in('message_id', ids)
    const map = {}
    ;(data || []).forEach(r => { (map[r.message_id] ||= []).push({ user_id: r.user_id, emoji: r.emoji }) })
    setReactions(map)
  }

  async function toggleReaction(messageId, emoji) {
    const mine = (reactions[messageId] || []).some(r => r.user_id === myId && r.emoji === emoji)
    // optimistic
    setReactions(prev => {
      const list = (prev[messageId] || []).filter(r => !(r.user_id === myId && r.emoji === emoji))
      return { ...prev, [messageId]: mine ? list : [...list, { user_id: myId, emoji }] }
    })
    if (mine) {
      await supabase.from('dm_reactions').delete().eq('message_id', messageId).eq('user_id', myId).eq('emoji', emoji)
    } else {
      await supabase.from('dm_reactions').insert({ message_id: messageId, user_id: myId, emoji })
    }
  }

  async function copyMessage(m) {
    const text = m.body || ''
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return }
    } catch { /* fall through */ }
    // Fallback for webviews without the async clipboard API.
    try {
      const ta = document.createElement('textarea'); ta.value = text
      ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
    } catch { /* ignore */ }
  }

  async function softDelete(m) {
    setMessages(prev => prev.map(x => x.id === m.id ? { ...x, deleted_at: new Date().toISOString(), body: null, photo_url: null } : x))
    await supabase.from('direct_messages').update({ deleted_at: new Date().toISOString(), body: null, photo_url: null }).eq('id', m.id)
  }

  // Press-and-hold a bubble (~420ms, without dragging) → open the reaction/action menu.
  function onBubbleDown(e, m) {
    if (m.deleted_at) return
    const t = e.touches ? e.touches[0] : e
    pressPos.current = { x: t.clientX, y: t.clientY }
    clearTimeout(pressTimer.current)
    pressTimer.current = setTimeout(() => setMenuFor(m), 420)
  }
  function onBubbleMove(e) {
    const t = e.touches ? e.touches[0] : e
    if (Math.abs(t.clientX - pressPos.current.x) > 10 || Math.abs(t.clientY - pressPos.current.y) > 10) clearTimeout(pressTimer.current)
  }
  function cancelPress() { clearTimeout(pressTimer.current) }

  // Collapse a message's raw reactions into [{emoji, count, mine}] for the pills.
  function reactionSummary(messageId) {
    const list = reactions[messageId] || []
    if (!list.length) return []
    const by = {}
    list.forEach(r => { (by[r.emoji] ||= { emoji: r.emoji, count: 0, mine: false }); by[r.emoji].count++; if (r.user_id === myId) by[r.emoji].mine = true })
    return Object.values(by)
  }
  const msgById = (id) => messages.find(x => x.id === id)
  function startReply(m) { setReplyTo(m); setEditing(null); setMenuFor(null) }
  function startEdit(m) { setEditing(m); setReplyTo(null); setBody(m.body || ''); setMenuFor(null) }

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
    // Editing an existing message: update in place instead of inserting.
    if (editing) {
      const ed = editing; setEditing(null)
      setMessages(prev => prev.map(x => x.id === ed.id ? { ...x, body: text, edited_at: new Date().toISOString() } : x))
      await supabase.from('direct_messages').update({ body: text, edited_at: new Date().toISOString() }).eq('id', ed.id)
      setSending(false)
      return
    }
    const rt = replyTo?.id || null; setReplyTo(null)
    const { data: msg } = await supabase.from('direct_messages')
      .insert({ sender: myId, recipient: peer.id, body: text, reply_to: rt })
      .select('id, sender, recipient, body, photo_url, created_at, read_at, reply_to, edited_at, deleted_at').single()
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
      const rt = replyTo?.id || null; setReplyTo(null)
      const { data: msg } = await supabase.from('direct_messages')
        .insert({ sender: myId, recipient: peer.id, photo_url: publicUrl, reply_to: rt })
        .select('id, sender, recipient, body, photo_url, created_at, read_at, reply_to, edited_at, deleted_at').single()
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
          const rx = reactionSummary(m.id)
          const quoted = m.reply_to ? msgById(m.reply_to) : null
          const deleted = !!m.deleted_at
          return (
            <Fragment key={m.id}>
              {showDay && (
                <div style={{ alignSelf: 'center', background: '#ECE6E0', color: '#9A9087', font: '500 11px -apple-system', padding: '4px 12px', borderRadius: 20, margin: '6px 0 2px' }}>{d}</div>
              )}
              <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 8 }}>
                {!mine && <Avatar url={peer.avatar_url} name={fullName(peer)} color={peer.avatar_color} size={28} />}
                <div style={{ maxWidth: mine ? 250 : 230, display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                  {deleted ? (
                    <div style={{ background: mine ? '#F3E7E2' : '#F1ECE7', borderRadius: mine ? '16px 16px 4px 16px' : '16px 16px 16px 4px', padding: '9px 13px' }}>
                      <span style={{ font: 'italic 400 13.5px/1.4 -apple-system', color: '#9A9087' }}>This message was deleted</span>
                    </div>
                  ) : (
                    <div onPointerDown={e => onBubbleDown(e, m)} onPointerUp={cancelPress} onPointerMove={onBubbleMove} onPointerLeave={cancelPress} onContextMenu={e => { e.preventDefault(); setMenuFor(m) }}
                      style={{ background: mine ? '#FF6B4A' : '#fff', border: mine ? 'none' : '1px solid #F1E8E2', borderRadius: mine ? '16px 16px 4px 16px' : '16px 16px 16px 4px', padding: m.photo_url ? 4 : '8px 13px 10px', boxShadow: mine ? 'none' : '0 1px 2px rgba(0,0,0,.06)', overflow: 'hidden', WebkitUserSelect: 'none', userSelect: 'none' }}>
                      {quoted && (
                        <div style={{ borderLeft: `3px solid ${mine ? 'rgba(255,255,255,.6)' : '#FFB59E'}`, background: mine ? 'rgba(255,255,255,.16)' : '#FBF1ED', borderRadius: 7, padding: '5px 9px', margin: m.photo_url ? '4px 4px 2px' : '0 0 6px' }}>
                          <div style={{ font: '700 11.5px -apple-system', color: mine ? '#fff' : '#FF6B4A', marginBottom: 1 }}>{quoted.sender === myId ? 'You' : (peer.first_name || fullName(peer))}</div>
                          <div style={{ font: '400 12.5px/1.35 -apple-system', color: mine ? 'rgba(255,255,255,.85)' : '#7B7268', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{quoted.deleted_at ? 'Deleted message' : (quoted.photo_url && !quoted.body ? '📷 Photo' : quoted.body)}</div>
                        </div>
                      )}
                      {m.photo_url
                        ? <img src={m.photo_url} onClick={() => setFullImg(m.photo_url)} style={{ display: 'block', maxWidth: mine ? 230 : 218, borderRadius: 12, cursor: 'pointer' }} />
                        : <span style={{ font: '400 14px/1.5 -apple-system', color: mine ? '#fff' : '#1A1A1A' }}>{m.body}</span>}
                    </div>
                  )}
                  {!deleted && rx.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginTop: -7, zIndex: 1, padding: mine ? '0 4px 0 0' : '0 0 0 4px' }}>
                      {rx.map(r => (
                        <div key={r.emoji}
                          onClick={() => { if (pillHandled.current) { pillHandled.current = false; return } setReactInfo(m) }}
                          onPointerDown={() => { if (!r.mine) return; clearTimeout(pillTimer.current); pillTimer.current = setTimeout(() => { pillHandled.current = true; toggleReaction(m.id, r.emoji) }, 450) }}
                          onPointerUp={() => clearTimeout(pillTimer.current)} onPointerLeave={() => clearTimeout(pillTimer.current)}
                          style={{ display: 'flex', alignItems: 'center', gap: 3, background: r.mine ? '#FFF1EC' : '#fff', border: `1px solid ${r.mine ? '#FFD9CC' : '#EFE6DF'}`, borderRadius: 11, padding: '1px 7px', cursor: 'pointer' }}>
                          <span style={{ fontSize: 12.5 }}>{r.emoji}</span>
                          {r.count > 1 && <span style={{ font: '600 11px -apple-system', color: '#7B7268' }}>{r.count}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {!deleted && (
                    <div style={{ fontSize: 10, color: '#C4BBB2', marginTop: rx.length ? 4 : 3, padding: mine ? '0 2px 0 0' : '0 0 0 2px' }}>
                      {bubbleTime(m.created_at)}{m.edited_at ? ' · Edited' : ''}{mine ? ` · ${m.read_at ? 'Read' : 'Sent'}` : ''}
                    </div>
                  )}
                </div>
              </div>
            </Fragment>
          )
        })}
      </div>

      {/* reply / edit preview above the input */}
      {(replyTo || editing) && (
        <div style={{ background: '#fff', borderTop: '0.5px solid #EFE6DF', flexShrink: 0, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 3, alignSelf: 'stretch', background: '#FF6B4A', borderRadius: 3 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: '700 12px -apple-system', color: '#FF6B4A' }}>{editing ? 'Editing message' : `Replying to ${replyTo.sender === myId ? 'yourself' : (peer.first_name || fullName(peer))}`}</div>
            <div style={{ font: '400 13px -apple-system', color: '#7B7268', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {(editing || replyTo).photo_url && !(editing || replyTo).body ? '📷 Photo' : (editing || replyTo).body}
            </div>
          </div>
          <button onClick={() => { setReplyTo(null); setEditing(null); if (editing) setBody('') }} style={{ width: 28, height: 28, borderRadius: '50%', background: '#F2EFEC', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9A9087" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
      )}

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

      {/* press-and-hold message menu: reactions on top, actions on the bottom */}
      {menuFor && (() => {
        const mMine = menuFor.sender === myId
        const hasText = !!menuFor.body
        return (
          <div onClick={() => { setMenuFor(null); setEmojiPicker(false) }} style={{ position: 'absolute', inset: 0, zIndex: 90, background: 'rgba(20,24,30,.5)', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 16px', alignItems: mMine ? 'flex-end' : 'flex-start' }}>
            {/* React only on others' messages — no reacting to your own. */}
            {!mMine && (emojiPicker ? (
              <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, padding: 10, marginBottom: 12, width: 280, maxHeight: 200, overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 4, boxShadow: '0 8px 22px -10px rgba(0,0,0,.5)' }} className="no-scrollbar">
                {MORE_EMOJIS.map((em, i) => (
                  <span key={em + i} onClick={() => { toggleReaction(menuFor.id, em); setMenuFor(null); setEmojiPicker(false) }}
                    style={{ fontSize: 24, cursor: 'pointer', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{em}</span>
                ))}
              </div>
            ) : (
              <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 24, padding: '8px 10px', display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12, boxShadow: '0 8px 22px -10px rgba(0,0,0,.5)' }}>
                {REACT_EMOJIS.map(em => {
                  const active = (reactions[menuFor.id] || []).some(r => r.user_id === myId && r.emoji === em)
                  return (
                    <span key={em} onClick={() => { toggleReaction(menuFor.id, em); setMenuFor(null) }}
                      style={{ fontSize: 22, cursor: 'pointer', borderRadius: '50%', padding: 2, background: active ? '#FFF1EC' : 'transparent' }}>{em}</span>
                  )
                })}
                <span onClick={() => setEmojiPicker(true)} style={{ width: 30, height: 30, borderRadius: '50%', background: '#F2EFEC', color: '#9A9087', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, cursor: 'pointer' }}>+</span>
              </div>
            ))}

            <div style={{ maxWidth: 250, background: mMine ? '#FF6B4A' : '#fff', border: mMine ? 'none' : '1px solid #F1E8E2', borderRadius: mMine ? '16px 16px 4px 16px' : '16px 16px 16px 4px', padding: menuFor.photo_url ? 4 : '10px 13px', marginBottom: 12, overflow: 'hidden' }}>
              {menuFor.photo_url
                ? <img src={menuFor.photo_url} style={{ display: 'block', maxWidth: 220, borderRadius: 12 }} />
                : <span style={{ font: '400 14px/1.5 -apple-system', color: mMine ? '#fff' : '#1A1A1A' }}>{menuFor.body}</span>}
            </div>

            <div style={{ background: '#fff', borderRadius: 14, width: 210, overflow: 'hidden', boxShadow: '0 8px 22px -10px rgba(0,0,0,.5)' }}>
              <MenuRow label="Reply" icon="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-1" onClick={() => startReply(menuFor)} />
              {hasText && <MenuRow label="Copy" icon="M9 9V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-4M15 9H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2z" onClick={() => { copyMessage(menuFor); setMenuFor(null) }} />}
              {mMine && hasText && <MenuRow label="Edit" icon="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" onClick={() => startEdit(menuFor)} />}
              {mMine && <MenuRow label="Delete" danger icon="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" onClick={() => { softDelete(menuFor); setMenuFor(null) }} />}
              {!mMine && <MenuRow label="Report" danger icon="M4 21V4h13l-2 4 2 4H4" onClick={() => { const m = menuFor; setMenuFor(null); setReportingMsg(m) }} />}
            </div>
          </div>
        )
      })()}

      {/* report sheet — required for user-generated content (App Store 1.2) */}
      {reportingMsg && (
        <div onClick={() => setReportingMsg(null)} style={{ position: 'absolute', inset: 0, zIndex: 95, background: 'rgba(0,0,0,.5)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} className="sheet-up" style={{ background: '#FBF7F4', borderRadius: '24px 24px 0 0', padding: '20px 20px calc(env(safe-area-inset-bottom,0px) + 28px)' }}>
            <div style={{ font: '600 17px -apple-system', color: '#1F2933', marginBottom: 6 }}>Report this {reportingMsg.photo_url ? 'photo' : 'message'}?</div>
            <div style={{ fontSize: 13, color: '#9A9087', marginBottom: 20 }}>This will be reviewed within 24 hours. {peer.first_name || 'They'} won't be notified.</div>
            {['Spam', 'Inappropriate content', 'Harassment', 'Hate speech', 'Other'].map(reason => (
              <div key={reason} onClick={async () => {
                const rm = reportingMsg; setReportingMsg(null)
                const { error } = await supabase.from('reports').insert({
                  reporter: myId, reported: rm.sender, reason,
                  direct_message_id: rm.id, content_type: rm.photo_url ? 'photo' : 'message',
                })
                if (error) { console.error('Report insert failed:', error); setReportError(true); setTimeout(() => setReportError(false), 3500); return }
                setReportDone(true); setTimeout(() => setReportDone(false), 3000)
              }} style={{ padding: '13px 0', borderBottom: '1px solid #F1E8E2', fontSize: 15, color: '#1F2933', cursor: 'pointer' }}>{reason}</div>
            ))}
            <div onClick={() => setReportingMsg(null)} style={{ marginTop: 14, padding: '13px 0', textAlign: 'center', fontSize: 15, fontWeight: 600, color: '#9A9087', cursor: 'pointer' }}>Cancel</div>
          </div>
        </div>
      )}
      {reportDone && (
        <div style={{ position: 'absolute', bottom: 90, left: '50%', transform: 'translateX(-50%)', background: '#1F2933', color: '#fff', borderRadius: 12, padding: '10px 18px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', zIndex: 95 }}>Report submitted — thank you</div>
      )}
      {reportError && (
        <div style={{ position: 'absolute', bottom: 90, left: '50%', transform: 'translateX(-50%)', background: '#E14F2E', color: '#fff', borderRadius: 12, padding: '10px 18px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', zIndex: 95 }}>Couldn't submit report — please try again</div>
      )}

      {/* who reacted — tap a reaction pill */}
      {reactInfo && (
        <div onClick={() => setReactInfo(null)} style={{ position: 'absolute', inset: 0, zIndex: 95, background: 'rgba(20,24,30,.5)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} className="sheet-up" style={{ background: '#FBF7F4', borderRadius: '24px 24px 0 0', padding: '10px 20px calc(env(safe-area-inset-bottom,0px) + 24px)' }}>
            <div style={{ width: 42, height: 5, borderRadius: 5, background: '#E0D7CF', margin: '0 auto 14px' }} />
            <div style={{ font: '700 15px -apple-system', color: '#1A1A1A', marginBottom: 12 }}>Reactions</div>
            {(reactions[reactInfo.id] || []).length === 0 && <div style={{ color: '#9A9087', fontSize: 14, padding: '8px 0 4px' }}>No reactions.</div>}
            {(reactions[reactInfo.id] || []).map((rr, i) => {
              const isMine = rr.user_id === myId
              const who = isMine ? 'You' : (peer.first_name || fullName(peer))
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid #F1E8E2' }}>
                  <span style={{ fontSize: 22 }}>{rr.emoji}</span>
                  <span style={{ flex: 1, font: '600 15px -apple-system', color: '#1A1A1A' }}>{who}</span>
                  {isMine && <button onClick={() => { toggleReaction(reactInfo.id, rr.emoji); setReactInfo(null) }} style={{ border: 'none', background: '#F2EFEC', color: '#E5484D', font: '600 13px -apple-system', padding: '7px 13px', borderRadius: 10, cursor: 'pointer' }}>Remove</button>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function MenuRow({ label, icon, onClick, danger }) {
  return (
    <>
      <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', font: '400 15px -apple-system', color: danger ? '#E5484D' : '#1A1A1A', cursor: 'pointer' }}>
        <span>{label}</span>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={danger ? '#E5484D' : '#5B5048'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg>
      </div>
      <div style={{ height: '0.5px', background: '#EFE6DF' }} className="menu-sep" />
    </>
  )
}
const photoOpt = { display: 'block', width: '100%', padding: 15, border: 'none', borderRadius: 14, background: '#fff', font: '600 15px -apple-system', color: '#1F2933', cursor: 'pointer', marginBottom: 8 }

// ─── Conversation list ────────────────────────────────────────────────────────
export default function MessagesScreen({ session, onlineIds, openPeerId, onPeerOpened, onUnreadChange, onOpenProfile, onOpenPlan, refreshTrigger, backToListTrigger, onChatChange }) {
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
  const [swipedPeer, setSwipedPeer] = useState(null) // conversation row swiped open
  const rowSwipe = useRef({ id: null, startX: 0, active: false })
  const searchTimer = useRef(null)

  function closeCompose() { setShowCompose(false); setComposeSearch('') }

  // Hide a conversation from MY list only (per-user; reappears if they message me).
  async function hideConversation(peerId) {
    setSwipedPeer(null)
    setConvos(prev => prev.filter(c => c.peer !== peerId))
    await supabase.from('dm_hidden').upsert({ user_id: myId, peer_id: peerId, hidden_at: new Date().toISOString() }, { onConflict: 'user_id,peer_id' })
  }
  function onRowSwipeStart(e, peerId) {
    const t = e.touches ? e.touches[0] : e
    rowSwipe.current = { id: peerId, startX: t.clientX, active: true }
  }
  function onRowSwipeMove(e, peerId) {
    if (!rowSwipe.current.active || rowSwipe.current.id !== peerId) return
    const t = e.touches ? e.touches[0] : e
    const dx = t.clientX - rowSwipe.current.startX
    if (dx < -30) setSwipedPeer(peerId)          // swipe left → reveal Delete
    else if (dx > 20 && swipedPeer === peerId) setSwipedPeer(null) // swipe right → close
  }
  function onRowSwipeEnd() { rowSwipe.current.active = false }

  useEffect(() => () => clearTimeout(searchTimer.current), [])

  // Tell App when a DM thread (or the full-page compose) is open so it can hide
  // the bottom tab bar — the chat input then sits right above the keyboard.
  useEffect(() => { onChatChange?.(!!active || showCompose) }, [active, showCompose])
  useEffect(() => () => onChatChange?.(false), [])

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
      <PullToRefresh onRefresh={loadConvos} className="no-scrollbar" style={{ flex: 1, overflowY: 'auto' }}>
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
          const open = swipedPeer === r.peer
          return (
            <div key={r.peer} style={{ position: 'relative', overflow: 'hidden' }}>
              {/* Delete button revealed behind the row */}
              <div onClick={() => hideConversation(r.peer)} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 88, background: '#E5484D', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, cursor: 'pointer' }}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                <span style={{ font: '600 11px -apple-system' }}>Delete</span>
              </div>
              <div
                onClick={() => { if (open) setSwipedPeer(null); else openChat(r.peer) }}
                onTouchStart={e => onRowSwipeStart(e, r.peer)} onTouchMove={e => onRowSwipeMove(e, r.peer)} onTouchEnd={onRowSwipeEnd}
                style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 20px', cursor: 'pointer', background: unread ? '#FFF7F4' : '#F9F4F0', transform: open ? 'translateX(-88px)' : 'translateX(0)', transition: 'transform .22s ease' }}>
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
            </div>
          )
        })}
      </PullToRefresh>

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
