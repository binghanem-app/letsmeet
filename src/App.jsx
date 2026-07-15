import { Component, useEffect, useRef, useState } from 'react'

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 24, fontFamily: 'monospace', fontSize: 13, color: '#c00', background: '#fff', height: '100vh', overflow: 'auto' }}>
        <b>Crash:</b> {String(this.state.error)}<br/><br/>
        {this.state.error?.stack}
      </div>
    )
    return this.props.children
  }
}
import { supabase, authIntent } from './lib/supabase'
import { haptics } from './lib/haptics'
import fabUrl from './assets/fab.png'
import LoginScreen from './screens/LoginScreen'
import HomeScreen from './screens/HomeScreen'
import FriendsScreen from './screens/FriendsScreen'
import CreateScreen from './screens/CreateScreen'
import PlansScreen from './screens/PlansScreen'
import MessagesScreen from './screens/MessagesScreen'
import UserProfileSheet from './components/UserProfileSheet'
import ProfileScreen from './screens/ProfileScreen'
import OnboardingScreen from './screens/OnboardingScreen'
import RecoverPasswordScreen from './screens/RecoverPasswordScreen'
import PrivacyPolicyScreen from './screens/PrivacyPolicyScreen'
import TermsScreen from './screens/TermsScreen'

// Phone chrome — wraps every screen in the same outer shell
function ResponsiveLayout({ screen, children }) {
  return (
    <div style={{ width: '100%', height: '100vh', background: '#FBF7F4', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 'env(safe-area-inset-top, 0px)', background: '#FBF7F4' }}/>
      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  )
}

// Bottom tab bar — shared across all post-login screens
function TabBar({ active, onHome, onFriends, onCreate, onMessages, onProfile, friendsBadge, messagesBadge }) {
  const tabs = [
    { key: 'home',    label: 'Home',    onClick: onHome,    badge: 0,
      icon: (sel) => sel
        ? <svg width="24" height="24" viewBox="0 0 24 24" fill="#FF6B4A"><path d="M4 11 12 4l8 7v9h-5v-5h-6v5H4z"/></svg>
        : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9A9087" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/></svg>
    },
    { key: 'friends', label: 'Friends', onClick: onFriends, badge: friendsBadge,
      icon: (sel) => sel
        ? <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FF6B4A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.2" fill="#FF6B4A" stroke="none"/><path d="M3.5 19c0-3 2.5-4.8 5.5-4.8s5.5 1.8 5.5 4.8" stroke="#FF6B4A"/><path d="M16 5.2a3.2 3.2 0 0 1 0 6" stroke="#FF6B4A"/><path d="M18.5 19c0-2.6-1.3-4.2-3.2-4.6" stroke="#FF6B4A"/></svg>
        : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9A9087" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c0-3 2.5-4.8 5.5-4.8s5.5 1.8 5.5 4.8"/><path d="M16 5.2a3.2 3.2 0 0 1 0 6M18.5 19c0-2.6-1.3-4.2-3.2-4.6"/></svg>
    },
    { key: 'messages', label: 'Messages', onClick: onMessages, badge: messagesBadge,
      icon: (sel) => sel
        ? <svg width="24" height="24" viewBox="0 0 24 24" fill="#FF6B4A" stroke="#FF6B4A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9A9087" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    },
    { key: 'profile', label: 'You',     onClick: onProfile, badge: 0,
      icon: (sel) => sel
        ? <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FF6B4A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.4" fill="#FF6B4A" fillOpacity=".2"/><path d="M5.5 20c0-3.4 2.9-5.4 6.5-5.4s6.5 2 6.5 5.4" stroke="#FF6B4A"/></svg>
        : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9A9087" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.4"/><path d="M5.5 20c0-3.4 2.9-5.4 6.5-5.4s6.5 2 6.5 5.4"/></svg>
    },
  ]

  return (
    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-around', height: 83, paddingTop: 11, paddingBottom: 18, paddingLeft: 14, paddingRight: 14, background: '#fff', borderTop: '1px solid #EFE8E2' }}>
      {tabs.slice(0, 2).map(t => {
        const sel = active === t.key
        return (
          <div key={t.key} onClick={() => { if (!sel) haptics.tap(); t.onClick() }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', position: 'relative', minWidth: 48 }}>
            {t.icon(sel)}
            {t.badge > 0 && (
              <div style={{ position: 'absolute', top: -5, right: -7, background: '#E5484D', borderRadius: 9, minWidth: 17, height: 17, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff', padding: '0 3px' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{t.badge > 99 ? '99+' : t.badge}</span>
              </div>
            )}
            <span style={{ fontSize: 10, fontWeight: sel ? 600 : 400, color: sel ? '#FF6B4A' : '#9A9087' }}>{t.label}</span>
          </div>
        )
      })}

      {/* FAB */}
      <div onClick={() => { haptics.tap(); onCreate() }} style={{ cursor: 'pointer', marginTop: -18 }}>
        <img src={fabUrl} alt="Create" style={{ width: 78, height: 78, display: 'block' }} />
      </div>

      {tabs.slice(2).map(t => {
        const sel = active === t.key
        return (
          <div key={t.key} onClick={() => { if (!sel) haptics.tap(); t.onClick() }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', position: 'relative', minWidth: 48 }}>
            {t.icon(sel)}
            {t.badge > 0 && (
              <div style={{ position: 'absolute', top: -5, right: -7, background: '#E5484D', borderRadius: 9, minWidth: 17, height: 17, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff', padding: '0 3px' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{t.badge > 99 ? '99+' : t.badge}</span>
              </div>
            )}
            <span style={{ fontSize: 10, fontWeight: sel ? 600 : 400, color: sel ? '#FF6B4A' : '#9A9087' }}>{t.label}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── App ────────────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession]           = useState(undefined)
  const [screen, setScreen]             = useState('home')
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [recoveryMode, setRecoveryMode] = useState(false)
  const [openPlanId, setOpenPlanId]     = useState(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [homeRefresh, setHomeRefresh]   = useState(0)
  const [plansRefresh, setPlansRefresh] = useState(0)
  const [plansBackToList, setPlansBackToList] = useState(0)
  const [messagesToList, setMessagesToList] = useState(0)
  const [cancelledPlanIds, setCancelledPlanIds] = useState(new Set())
  const [viewedPlanIds, setViewedPlanIds] = useState(() => new Set())
  const [latestMessage, setLatestMessage] = useState(null)
  const [latestInvite, setLatestInvite] = useState(0)
  const [dmUnread, setDmUnread]         = useState(0)
  const [planDetailOpen, setPlanDetailOpen] = useState(false)
  const [dmChatOpen, setDmChatOpen]     = useState(false)
  const [profileSheetOpen, setProfileSheetOpen] = useState(false)
  const [onlineIds, setOnlineIds]       = useState(() => new Set())
  const [openDmPeerId, setOpenDmPeerId] = useState(null)
  const [profileSheetUserId, setProfileSheetUserId] = useState(null)
  const friendSubRef       = useRef(null)
  const presenceRef        = useRef(null)
  const pushRegisteredRef  = useRef(false)
  const pushListenersRef   = useRef([])
  const sessionRef         = useRef(null)
  const logoutGraceRef     = useRef(false)

  async function registerPush(userId) {
    if (pushRegisteredRef.current) return
    pushRegisteredRef.current = true
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications')
      const regListener = await PushNotifications.addListener('registration', async ({ value: token }) => {
        // Write to whoever is signed in right now, not a stale closured id —
        // a second user on the same device must save their OWN token.
        const uid = sessionRef.current?.user?.id || userId
        await supabase.from('profiles').update({ apns_token: token }).eq('id', uid)
      })
      pushListenersRef.current.push(regListener)
      const { receive } = await PushNotifications.requestPermissions()
      if (receive !== 'granted') return
      await PushNotifications.register()
      const recvListener = await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        const { type, plan_id: planId } = notification.data || {}
        if (type === 'chat') {
          // The Home + Plans realtime subscriptions already bump the per-plan unread
          // badge the instant the message lands. Do NOT also setHomeRefresh here: a
          // full feed reload races with that live increment and clobbers it — the
          // badge appears, then vanishes ~2s later when the reload's count query
          // (slightly behind the realtime broadcast) comes back without the new
          // message. Just nudge the open-plan badge; realtime handles the cards.
          if (planId) setLatestMessage(prev => ({ planId, seq: (prev?.seq || 0) + 1 }))
        } else if (type === 'plan_invite' || type === 'plan_response') {
          setHomeRefresh(r => r + 1)
          setLatestInvite(n => n + 1)
        }
      })
      pushListenersRef.current.push(recvListener)
    } catch(e) {
      console.error('registerPush failed:', e)
    }
  }

  // Realtime presence — track this user as online and expose the live set of
  // online user ids for the green dots in Messages.
  function setupPresence(userId) {
    if (presenceRef.current) return
    const ch = supabase.channel('presence-online', { config: { presence: { key: userId } } })
    ch.on('presence', { event: 'sync' }, () => {
      setOnlineIds(new Set(Object.keys(ch.presenceState())))
    })
    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await ch.track({ online_at: Date.now() })
    })
    presenceRef.current = ch
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) {
        checkOnboarding(data.session.user.id)
        loadPendingCount(data.session.user.id)
        subscribeFriendRequests(data.session.user.id)
        registerPush(data.session.user.id)
        setupPresence(data.session.user.id)
        clearNotifBadge(data.session.user.id)
      }
    })
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        supabase.auth.getSession().then(({ data }) => {
          // Only update session if not already signed in — prevents spurious SIGNED_IN
          // events after camera/gallery use on iOS from resetting the screen to home
          if (data.session && !sessionRef.current) setSession(data.session)
          // Opening/foregrounding the app = you've seen it → mark notifications read
          // so the icon badge (send-push counts unread rows) doesn't pile up.
          if (data.session) clearNotifBadge(data.session.user.id)
        })
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    // Route to the right screen when user taps a push notification
    let pushTapListener
    import('@capacitor/push-notifications').then(({ PushNotifications }) => {
      PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
        const data = notification.data || {}
        const { type, plan_id: planId, peer } = data
        if (type === 'dm') {
          if (peer) setOpenDmPeerId(peer)
          setScreen('messages')
        } else if (type === 'chat' || type === 'plan_response' || type === 'plan_invite') {
          if (planId) {
            setOpenPlanId(planId)
            setScreen('plans')
            setPlansRefresh(r => r + 1)
          } else {
            setScreen('home')
            setHomeRefresh(r => r + 1)
          }
        } else if (type === 'friend_request') {
          setScreen('friends')
        }
      }).then(listener => { pushTapListener = listener }).catch(() => {})
    }).catch(() => {})

    // Capture OAuth deep link on native (letsmeet://localhost#access_token=...)
    let appUrlListener
    let appStateListener
    import('@capacitor/app').then(({ App: CapApp }) => {
      // Native background/foreground → pause/resume supabase's token auto-refresh.
      // JS timers freeze while the app is suspended, so the refresh timer stalls;
      // stopping it on background and (re)starting on foreground makes supabase-js
      // fire an immediate refresh on resume instead of letting the token lapse.
      CapApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          supabase.auth.startAutoRefresh()
          // Proactively re-check the session on resume; if it's healthy this also
          // cancels any recovery grace period that a stale token kicked off.
          supabase.auth.getSession().then(({ data }) => {
            if (data.session) {
              logoutGraceRef.current = false
              if (!sessionRef.current) { sessionRef.current = data.session; setSession(data.session) }
              clearNotifBadge(data.session.user.id)
            }
          }).catch(() => {})
        } else {
          supabase.auth.stopAutoRefresh()
        }
      }).then(listener => { appStateListener = listener }).catch(() => {})
      CapApp.addListener('appUrlOpen', async ({ url }) => {
        if (url && url.includes('access_token')) {
          const hash = url.split('#')[1] || ''
          const params = Object.fromEntries(new URLSearchParams(hash))
          if (params.access_token && params.refresh_token) {
            const { data, error } = await supabase.auth.setSession({
              access_token: params.access_token,
              refresh_token: params.refresh_token,
            })
            if (!error && data.session) {
              // Password-reset links carry type=recovery — drop the user into the
              // "set a new password" screen instead of straight into the app.
              if (params.type === 'recovery') setRecoveryMode(true)
              setSession(data.session)
            }
          }
          // Dismiss the external Safari view opened for Google OAuth so the user
          // lands straight back in the app instead of staring at a finished page.
          try {
            const { Browser } = await import('@capacitor/browser')
            await Browser.close()
          } catch { /* browser plugin not open / web build — ignore */ }
        }
      }).then(listener => { appUrlListener = listener }).catch(() => {})
    }).catch(() => {})

    // Full teardown for a CONFIRMED logout (intentional sign-out, or an
    // unrecoverable session after retries are exhausted).
    const performSignedOutCleanup = () => {
      sessionRef.current = null
      setSession(null)
      setNeedsOnboarding(false)
      setPendingCount(0)
      setDmUnread(0)
      setOnlineIds(new Set())
      if (presenceRef.current) { supabase.removeChannel(presenceRef.current); presenceRef.current = null }
      if (friendSubRef.current) { supabase.removeChannel(friendSubRef.current); friendSubRef.current = null }
      // Let the next user on this device re-register push with their own token.
      pushRegisteredRef.current = false
      pushListenersRef.current.forEach(l => l?.remove?.())
      pushListenersRef.current = []
    }

    // A null session from supabase-js is ambiguous: it fires SIGNED_OUT both for a
    // real logout AND for a token-refresh that failed (expired/offline on resume,
    // transient server hiccup). Historically we kicked the user to login on the
    // first null — a single flaky refresh logged people out. Instead, when we
    // unexpectedly lose a session we were holding, try to refresh a few times
    // before giving up. UI state (setSession) is left untouched during the grace
    // window so the user stays on their current screen.
    const recoverOrSignOut = async () => {
      if (logoutGraceRef.current) return   // a recovery loop is already running
      logoutGraceRef.current = true
      const delays = [600, 1500, 3000]
      for (const wait of delays) {
        await new Promise(r => setTimeout(r, wait))
        // Another auth event may have restored the session while we waited.
        if (sessionRef.current) { logoutGraceRef.current = false; return }
        try {
          const { data } = await supabase.auth.refreshSession()
          if (data?.session) {
            sessionRef.current = data.session
            setSession(data.session)
            logoutGraceRef.current = false
            return
          }
        } catch { /* keep retrying */ }
      }
      logoutGraceRef.current = false
      // Retries exhausted — the refresh token is genuinely dead; log out for real.
      performSignedOutCleanup()
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      const prevSession = sessionRef.current
      // Web/PKCE recovery: supabase-js fires this after processing the reset link.
      if (_e === 'PASSWORD_RECOVERY') setRecoveryMode(true)

      if (s) {
        // Signed in / token refreshed / user updated — a live session cancels any
        // in-flight recovery grace period.
        logoutGraceRef.current = false
        sessionRef.current = s
        setSession(s)
        checkOnboarding(s.user.id)
        loadPendingCount(s.user.id)
        subscribeFriendRequests(s.user.id)
        setupPresence(s.user.id)
        // registerPush on every sign-in; don't call setScreen('home') here
        // because it fires again after camera/gallery use on iOS and resets navigation
        if (_e === 'SIGNED_IN') { registerPush(s.user.id) }
        return
      }

      // s is null from here.
      sessionRef.current = null
      if (authIntent.intentionalSignOut) {
        // Deliberate logout (button / account deletion) — tear down immediately.
        authIntent.intentionalSignOut = false
        performSignedOutCleanup()
      } else if (!prevSession) {
        // Never had a session (cold start while logged out) — just show login,
        // no point retrying a refresh we never had a token for.
        setSession(null)
      } else {
        // We were holding a session and unexpectedly lost it — try to recover
        // before kicking the user out.
        recoverOrSignOut()
      }
    })
    return () => {
      subscription.unsubscribe()
      if (friendSubRef.current) { supabase.removeChannel(friendSubRef.current); friendSubRef.current = null }
      if (presenceRef.current) { supabase.removeChannel(presenceRef.current); presenceRef.current = null }
      document.removeEventListener('visibilitychange', handleVisibility)
      appUrlListener?.remove()
      appStateListener?.remove()
      pushTapListener?.remove()
    }
  }, [])

  // Mark all of the user's notifications read on app open/foreground. The iOS
  // icon badge is send-push's count of unread `notifications` rows; nothing else
  // marked them read, so it grew unbounded (in-app tab badges are separate and
  // unaffected — those use read_at / plan_message_reads / pending friendships).
  async function clearNotifBadge(userId) {
    try {
      await supabase.from('notifications').update({ read: true }).eq('recipient', userId).eq('read', false)
    } catch { /* best-effort */ }
  }

  async function loadPendingCount(userId) {
    const { count } = await supabase
      .from('friendships')
      .select('id', { count: 'exact', head: true })
      .eq('addressee', userId)
      .eq('status', 'pending')
    setPendingCount(count || 0)
  }

  function subscribeFriendRequests(userId) {
    if (friendSubRef.current) supabase.removeChannel(friendSubRef.current)
    friendSubRef.current = supabase
      .channel(`pending-reqs-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'friendships',
        filter: `addressee=eq.${userId}`,
      }, payload => {
        if (payload.new.status === 'pending') setPendingCount(c => c + 1)
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'friendships',
        filter: `addressee=eq.${userId}`,
      }, () => {
        loadPendingCount(userId)
      })
      .subscribe()
  }

  async function checkOnboarding(userId) {
    const { data } = await supabase.from('profiles').select('first_name').eq('id', userId).single()
    setNeedsOnboarding(!data?.first_name)
  }

  if (session === undefined) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFEFE9' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid #FFD3C6', borderTopColor: '#FF6B4A', animation: 'spin .7s linear infinite' }}/>
      </div>
    )
  }

  const tabNav = (key) => ({
    onHome:    () => { setScreen('home'); setHomeRefresh(r => r + 1) },
    onFriends: () => setScreen('friends'),
    onCreate:  () => setScreen('create'),
    onMessages: () => { if (screen === 'messages') setMessagesToList(c => c + 1); setScreen('messages') },
    onProfile: () => setScreen('profile'),
  })

  function renderScreen() {
    // Password recovery overrides everything: the reset-link session is "logged in",
    // but the user must set a new password before using the app.
    if (recoveryMode) return <RecoverPasswordScreen onDone={() => { setRecoveryMode(false); setScreen('home') }} />
    if (screen === 'privacy') return <PrivacyPolicyScreen onBack={() => setScreen(session ? 'profile' : 'login')} />
    if (screen === 'terms')   return <TermsScreen onBack={() => setScreen(session ? 'profile' : 'login')} />
    if (!session || screen === 'login') return <LoginScreen onLogin={() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)); setScreen('home') }} onPrivacy={() => setScreen('privacy')} onTerms={() => setScreen('terms')} />
    if (needsOnboarding) return <OnboardingScreen session={session} onDone={() => setNeedsOnboarding(false)} />

    const show = (key) => ({ display: screen === key ? 'flex' : 'none', flexDirection: 'column', height: '100%' })

    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <div style={show('home')}>
            <HomeScreen
              session={session}
              refreshTrigger={homeRefresh}
              onStartCreate={() => setScreen('create')}
              onGoFriends={() => setScreen('friends')}
              onOpenPlan={(id) => { setOpenPlanId(id); setScreen('plans'); setPlansRefresh(r => r + 1) }}
              onPlanCancelled={(id) => setCancelledPlanIds(s => new Set([...s, id]))}
              onNewChatMessage={(planId) => setLatestMessage(prev => ({ planId, seq: (prev?.seq || 0) + 1 }))}
              onNewInvite={() => setLatestInvite(n => n + 1)}
              viewedPlanIds={viewedPlanIds}
            />
          </div>
          <div style={show('friends')}>
            <FriendsScreen session={session} onOpenDM={(uid) => { setOpenDmPeerId(uid); setScreen('messages') }} />
          </div>
          {screen === 'create' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <CreateScreen session={session} onDone={() => { setScreen('home'); setHomeRefresh(r => r + 1); setPlansRefresh(r => r + 1) }} onCancel={() => setScreen('home')} onViewPlan={id => { setOpenPlanId(id); setScreen('plans'); setPlansRefresh(r => r + 1); setHomeRefresh(r => r + 1) }} />
            </div>
          )}
          <div style={show('plans')}>
            <PlansScreen session={session} openPlanId={openPlanId} onPlanOpened={() => setOpenPlanId(null)} onBack={() => { setScreen('home'); setOpenPlanId(null) }} refreshTrigger={plansRefresh} backToListTrigger={plansBackToList} cancelledPlanIds={cancelledPlanIds} onPlanViewed={(planId) => { if (planId) setViewedPlanIds(s => new Set([...s, planId])); setHomeRefresh(r => r + 1) }} onPlanClosed={(planId) => { if (planId) setViewedPlanIds(s => { if (!s.has(planId)) return s; const n = new Set(s); n.delete(planId); return n }); setHomeRefresh(r => r + 1) }} latestMessage={latestMessage} latestInvite={latestInvite} onDetailChange={setPlanDetailOpen} />
          </div>
          <div style={show('messages')}>
            <MessagesScreen
              session={session}
              onlineIds={onlineIds}
              openPeerId={openDmPeerId}
              onPeerOpened={() => setOpenDmPeerId(null)}
              onUnreadChange={setDmUnread}
              onOpenProfile={(uid) => setProfileSheetUserId(uid)}
              onOpenPlan={(id) => { setOpenPlanId(id); setScreen('plans'); setPlansRefresh(r => r + 1) }}
              backToListTrigger={messagesToList}
              onChatChange={setDmChatOpen}
            />
          </div>
          <div style={show('profile')}>
            <ProfileScreen session={session} onLogout={() => setSession(null)} onPrivacy={() => setScreen('privacy')} onTerms={() => setScreen('terms')} onDetailChange={setProfileSheetOpen} />
          </div>
        </div>
        {/* Hide the bottom tab bar while inside a chat/detail/settings sheet so
            the keyboard doesn't push it up between the input and itself
            (iMessage/WhatsApp style). */}
        {!((screen === 'plans' && planDetailOpen) || (screen === 'messages' && dmChatOpen) || (screen === 'profile' && profileSheetOpen)) && (
          <TabBar active={screen} {...tabNav()} friendsBadge={pendingCount} messagesBadge={dmUnread} />
        )}
      </div>
    )
  }

  return (
    <ErrorBoundary>
    <ResponsiveLayout screen={screen}>
      {renderScreen()}
      {profileSheetUserId && session && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 75 }}>
          <UserProfileSheet
            userId={profileSheetUserId}
            myId={session.user.id}
            isSelf={profileSheetUserId === session.user.id}
            onClose={() => setProfileSheetUserId(null)}
            onMessage={(uid) => { setProfileSheetUserId(null); setOpenDmPeerId(uid); setScreen('messages') }}
          />
        </div>
      )}
    </ResponsiveLayout>
    </ErrorBoundary>
  )
}
