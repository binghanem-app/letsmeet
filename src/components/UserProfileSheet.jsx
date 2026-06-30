import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import Avatar from './Avatar'

function relDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
function friendDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export default function UserProfileSheet({ userId, myId, onClose, isSelf, onChanged, onMessage }) {
  const [profile, setProfile]       = useState(null)
  const [loading, setLoading]       = useState(true)
  const [planScore, setPlanScore]   = useState(0)
  const [mutual, setMutual]         = useState(0)
  const [together, setTogether]     = useState(0)
  const [friendCount, setFriendCount] = useState(0)
  const [friendship, setFriendship] = useState(null) // null | {status, created_at}
  const [acting, setActing]         = useState(false)
  const [reporting, setReporting]   = useState(false)
  const [reportDone, setReportDone] = useState(false)
  const [dragY, setDragY]           = useState(0)
  const [dragging, setDragging]     = useState(false)
  const dragStartY                  = useRef(0)
  function onDragStart(e) { dragStartY.current = e.touches[0].clientY; setDragging(true) }
  function onDragMove(e) { const d = e.touches[0].clientY - dragStartY.current; if (d > 0) setDragY(d) }
  function onDragEnd() { setDragging(false); if (dragY > 100) { onClose() } else { setDragY(0) } }

  useEffect(() => { if (userId && myId) load() }, [userId, myId])

  async function load() {
    setLoading(true)

    if (isSelf) {
      const [
        { data: prof },
        { count: hostedCount },
        { count: attendedCount },
        { count: fc },
      ] = await Promise.all([
        supabase.from('profiles').select('id, first_name, last_name, username, avatar_color, avatar_url, bio, created_at').eq('id', userId).single(),
        supabase.from('plans').select('id', { count: 'exact', head: true }).eq('host', userId),
        supabase.from('plan_invitees').select('id', { count: 'exact', head: true }).eq('invitee', userId).in('rsvp', ['going', 'late']),
        supabase.from('friendships').select('id', { count: 'exact', head: true }).or(`requester.eq.${userId},addressee.eq.${userId}`).eq('status', 'accepted'),
      ])
      setProfile(prof)
      setPlanScore((hostedCount || 0) + (attendedCount || 0))
      setFriendCount(fc || 0)
      setLoading(false)
      return
    }

    const [
      { data: prof },
      { count: hostedCount },
      { count: attendedCount },
      { data: myFriends },
      { data: theirFriends },
      { data: friendRow },
    ] = await Promise.all([
      supabase.from('profiles').select('id, first_name, last_name, username, avatar_color, avatar_url, bio, created_at').eq('id', userId).single(),
      supabase.from('plans').select('id', { count: 'exact', head: true }).eq('host', userId),
      supabase.from('plan_invitees').select('id', { count: 'exact', head: true }).eq('invitee', userId).in('rsvp', ['going', 'late']),
      supabase.from('friendships').select('requester, addressee').or(`requester.eq.${myId},addressee.eq.${myId}`).eq('status', 'accepted'),
      supabase.from('friendships').select('requester, addressee').or(`requester.eq.${userId},addressee.eq.${userId}`).eq('status', 'accepted'),
      supabase.from('friendships').select('id, status, created_at, requester').or(`and(requester.eq.${myId},addressee.eq.${userId}),and(requester.eq.${userId},addressee.eq.${myId})`).maybeSingle(),
    ])

    setProfile(prof)
    setPlanScore((hostedCount || 0) + (attendedCount || 0))

    // mutual friends
    const mySet = new Set((myFriends || []).map(f => f.requester === myId ? f.addressee : f.requester))
    const theirSet = new Set((theirFriends || []).map(f => f.requester === userId ? f.addressee : f.requester))
    setMutual([...mySet].filter(id => theirSet.has(id)).length)

    setFriendship(friendRow || null)

    // plans together
    if (friendRow?.status === 'accepted') {
      const { data: myPlans } = await supabase.from('plan_invitees').select('plan_id').eq('invitee', myId)
      const { data: theirPlans } = await supabase.from('plan_invitees').select('plan_id').eq('invitee', userId)
      const myPlanSet = new Set((myPlans || []).map(p => p.plan_id))
      setTogether((theirPlans || []).filter(p => myPlanSet.has(p.plan_id)).length)
    }

    setLoading(false)
  }

  async function sendRequest() {
    setActing(true)
    // The 'request' notification is created server-side by the
    // on_friendship_request trigger, so no client-side notification insert here.
    await supabase.from('friendships').insert({ requester: myId, addressee: userId, status: 'pending' })
    setFriendship({ status: 'pending', requester: myId })
    setActing(false)
    onChanged?.()
  }

  async function acceptRequest() {
    if (!friendship?.id) return
    setActing(true)
    await supabase.from('friendships').update({ status: 'accepted', responded_at: new Date().toISOString() }).eq('id', friendship.id)
    setFriendship(f => ({ ...f, status: 'accepted' }))
    setActing(false)
    onChanged?.()
  }

  async function declineRequest() {
    if (!friendship?.id) return
    setActing(true)
    await supabase.from('friendships').delete().eq('id', friendship.id)
    setFriendship(null)
    setActing(false)
    onChanged?.()
  }

  async function removeFriend() {
    setActing(true)
    await supabase.from('friendships').delete()
      .or(`and(requester.eq.${myId},addressee.eq.${userId}),and(requester.eq.${userId},addressee.eq.${myId})`)
    setFriendship(null)
    setActing(false)
    onChanged?.()
  }

  const REPORT_REASONS = ['Spam or fake account', 'Inappropriate content', 'Harassment', 'Hate speech', 'Other']

  async function reportUser(reason) {
    await supabase.from('reports').insert({ reporter: myId, reported: userId, reason })
    setReporting(false)
    setReportDone(true)
  }

  async function blockUser() {
    setActing(true)
    await supabase.from('friendships').delete()
      .or(`and(requester.eq.${myId},addressee.eq.${userId}),and(requester.eq.${userId},addressee.eq.${myId})`)
    await supabase.from('blocks').insert({ blocker: myId, blocked: userId })
    onChanged?.()
    onClose()
  }

  if (!userId) return null

  const name = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.username : '…'

  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(20,24,30,.5)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} className="sheet-up" style={{ background: '#FBF7F4', borderRadius: '28px 28px 0 0', maxHeight: '90%', display: 'flex', flexDirection: 'column', transform: `translateY(${dragY}px)`, transition: dragging ? 'none' : 'transform .3s ease' }}>
        <div onTouchStart={onDragStart} onTouchMove={onDragMove} onTouchEnd={onDragEnd} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: '14px 16px 6px', flexShrink: 0 }}>
          <div style={{ width: 42, height: 5, borderRadius: 5, background: '#E0D7CF' }}/>
          <button onClick={onClose} style={{ position: 'absolute', right: 14, top: 10, width: 30, height: 30, borderRadius: '50%', border: 'none', background: '#EDE8E3', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7B7268" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
            <div className="spin" style={{ width: 26, height: 26, borderRadius: '50%', border: '3px solid #F0E5DE', borderTopColor: '#FF6B4A' }}/>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px 36px' }} className="no-scrollbar">

            {/* avatar + name */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 20 }}>
              <Avatar url={profile?.avatar_url} name={name} color={profile?.avatar_color} size={80}
                style={{ boxShadow: '0 8px 20px -6px rgba(0,0,0,.18)', marginBottom: 12 }}/>
              <h2 style={{ margin: '0 0 3px', font: "600 22px -apple-system", color: '#1F2933', textAlign: 'center' }}>{name}</h2>
              <div style={{ fontSize: 14, color: '#9A9087', marginBottom: profile?.bio ? 8 : 0 }}>@{profile?.username || '—'}</div>
              {profile?.bio && (
                <div style={{ fontSize: 14, color: '#4A4540', textAlign: 'center', lineHeight: 1.5, maxWidth: 260, marginTop: 4 }}>{profile.bio}</div>
              )}
            </div>

            {/* plan score + member since */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
              <div style={{ flex: 1, background: '#fff', border: '1px solid #F1E8E2', borderRadius: 16, padding: '13px 0', textAlign: 'center' }}>
                <div style={{ font: "700 22px -apple-system", color: '#FF6B4A' }}>{planScore}</div>
                <div style={{ fontSize: 12, color: '#9A9087', marginTop: 2, fontWeight: 600 }}>Plan Score</div>
              </div>
              <div style={{ flex: 1, background: '#fff', border: '1px solid #F1E8E2', borderRadius: 16, padding: '13px 0', textAlign: 'center' }}>
                <div style={{ font: "700 14px -apple-system", color: '#1F2933', lineHeight: 1.3 }}>{relDate(profile?.created_at)}</div>
                <div style={{ fontSize: 12, color: '#9A9087', marginTop: 2, fontWeight: 600 }}>Member since</div>
              </div>
            </div>

            {/* self: friends count row */}
            {isSelf && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
                <div style={{ flex: 1, background: '#fff', border: '1px solid #F1E8E2', borderRadius: 16, padding: '13px 0', textAlign: 'center' }}>
                  <div style={{ font: "700 22px -apple-system", color: '#5B7CFA' }}>{friendCount}</div>
                  <div style={{ fontSize: 12, color: '#9A9087', marginTop: 2, fontWeight: 600 }}>Friends</div>
                </div>
              </div>
            )}

            {/* mutual / together / friends since (non-self) */}
            {!isSelf && (mutual > 0 || together > 0 || friendship?.status === 'accepted') && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
                {mutual > 0 && (
                  <div style={{ flex: 1, background: '#fff', border: '1px solid #F1E8E2', borderRadius: 16, padding: '13px 0', textAlign: 'center' }}>
                    <div style={{ font: "700 22px -apple-system", color: '#5B7CFA' }}>{mutual}</div>
                    <div style={{ fontSize: 12, color: '#9A9087', marginTop: 2, fontWeight: 600 }}>Mutual friends</div>
                  </div>
                )}
                {friendship?.status === 'accepted' && together >= 0 && (
                  <div style={{ flex: 1, background: '#fff', border: '1px solid #F1E8E2', borderRadius: 16, padding: '13px 0', textAlign: 'center' }}>
                    <div style={{ font: "700 22px -apple-system", color: '#0E9C6B' }}>{together}</div>
                    <div style={{ fontSize: 12, color: '#9A9087', marginTop: 2, fontWeight: 600 }}>Plans together</div>
                  </div>
                )}
                {friendship?.status === 'accepted' && friendship?.created_at && (
                  <div style={{ flex: 1, background: '#fff', border: '1px solid #F1E8E2', borderRadius: 16, padding: '13px 0', textAlign: 'center' }}>
                    <div style={{ font: "700 14px -apple-system", color: '#1F2933', lineHeight: 1.3 }}>{friendDate(friendship.created_at)}</div>
                    <div style={{ fontSize: 12, color: '#9A9087', marginTop: 2, fontWeight: 600 }}>Friends since</div>
                  </div>
                )}
              </div>
            )}

            {/* action buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {!isSelf && !friendship && (
                <button onClick={sendRequest} disabled={acting} style={{ width: '100%', padding: 15, border: 'none', borderRadius: 16, background: '#FF6B4A', color: '#fff', font: "600 15px -apple-system", cursor: 'pointer', boxShadow: '0 10px 22px -8px rgba(255,107,74,.6)' }}>
                  {acting ? 'Sending…' : '+ Add friend'}
                </button>
              )}
              {!isSelf && friendship?.status === 'pending' && friendship?.requester === myId && (
                <div style={{ textAlign: 'center', padding: '13px 0', font: "600 14px -apple-system", color: '#9A9087', background: '#F5F2EE', borderRadius: 16 }}>
                  Friend request sent ✓
                </div>
              )}
              {!isSelf && friendship?.status === 'pending' && friendship?.requester === userId && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={acceptRequest} disabled={acting} style={{ flex: 1, padding: 15, border: 'none', borderRadius: 16, background: '#FF6B4A', color: '#fff', font: "600 15px -apple-system", cursor: 'pointer', boxShadow: '0 10px 22px -8px rgba(255,107,74,.6)' }}>
                    {acting ? '…' : 'Accept'}
                  </button>
                  <button onClick={declineRequest} disabled={acting} style={{ flex: 1, padding: 15, border: '1.5px solid #E7DED7', borderRadius: 16, background: '#fff', color: '#7B7268', font: "600 15px -apple-system", cursor: 'pointer' }}>
                    Decline
                  </button>
                </div>
              )}
              {!isSelf && friendship?.status === 'accepted' && onMessage && (
                <button onClick={() => onMessage(userId)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: 15, border: 'none', borderRadius: 16, background: '#FF6B4A', color: '#fff', font: "600 15px -apple-system", cursor: 'pointer', boxShadow: '0 10px 22px -8px rgba(255,107,74,.6)' }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  Message
                </button>
              )}
              {!isSelf && friendship?.status === 'accepted' && (
                <button onClick={removeFriend} disabled={acting} style={{ width: '100%', padding: 15, border: '1.5px solid #E7DED7', borderRadius: 16, background: '#fff', color: '#7B7268', font: "600 15px -apple-system", cursor: 'pointer' }}>
                  {acting ? '…' : 'Remove friend'}
                </button>
              )}
              {!isSelf && (
                <>
                  <button onClick={blockUser} disabled={acting} style={{ width: '100%', padding: 15, border: '1.5px solid #E14F2E', borderRadius: 16, background: '#fff', color: '#E14F2E', font: "600 15px -apple-system", cursor: 'pointer' }}>
                    {acting ? '…' : 'Block'}
                  </button>
                  <button
                    onClick={() => { setReporting(true); setReportDone(false) }}
                    style={{ width: '100%', padding: 10, border: 'none', borderRadius: 16, background: 'transparent', color: '#B6ADA4', font: "500 13px -apple-system", cursor: 'pointer' }}
                  >
                    {reportDone ? 'Reported ✓' : 'Report this account'}
                  </button>
                </>
              )}
              {/* Report reason picker */}
              {reporting && (
                <div style={{ background: '#fff', border: '1.5px solid #F1E8E2', borderRadius: 18, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px 10px', font: "600 14px -apple-system", color: '#1F2933', borderBottom: '1px solid #F1E8E2' }}>Why are you reporting this account?</div>
                  {REPORT_REASONS.map(r => (
                    <button key={r} onClick={() => reportUser(r)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '13px 16px', border: 'none', borderBottom: '1px solid #F7F3F0', background: 'transparent', font: "400 14px -apple-system", color: '#1F2933', cursor: 'pointer' }}>
                      {r}
                    </button>
                  ))}
                  <button onClick={() => setReporting(false)}
                    style={{ display: 'block', width: '100%', textAlign: 'center', padding: '13px 16px', border: 'none', background: 'transparent', font: "600 14px -apple-system", color: '#9A9087', cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
