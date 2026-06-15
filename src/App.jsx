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
import { supabase } from './lib/supabase'
import { PlanDetailOverlay } from './screens/PlansScreen'
import LoginScreen from './screens/LoginScreen'
import HomeScreen from './screens/HomeScreen'
import FriendsScreen, { AddFriendSheet } from './screens/FriendsScreen'
import CreateScreen from './screens/CreateScreen'
import PlansScreen from './screens/PlansScreen'
import ProfileScreen from './screens/ProfileScreen'
import OnboardingScreen from './screens/OnboardingScreen'
import PrivacyPolicyScreen from './screens/PrivacyPolicyScreen'
import TermsScreen from './screens/TermsScreen'

// Phone chrome — wraps every screen in the same outer shell
function ResponsiveLayout({ children }) {
  return (
    <div style={{ width: '100%', height: '100vh', background: '#FBF7F4', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 'env(safe-area-inset-top, 0px)', background: '#FFEFE9' }}/>
      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  )
}

// Bottom tab bar — shared across all post-login screens
function TabBar({ active, onHome, onFriends, onCreate, onPlans, onProfile }) {
  const tab = (label, icon, key, onClick) => (
    <div onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 4, cursor: 'pointer',
      color: active === key ? '#FF6B4A' : '#B6ADA4',
    }}>
      {icon}
      <span style={{ fontSize: 11, fontWeight: 600 }}>{label}</span>
    </div>
  )

  return (
    <div style={{
      flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-around',
      height: 84, padding: '0 14px 18px',
      background: '#fff', borderTop: '1px solid #F1E8E2',
    }}>
      {tab('Home', <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/></svg>, 'home', onHome)}
      {tab('Friends', <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c0-3 2.5-4.8 5.5-4.8s5.5 1.8 5.5 4.8"/><path d="M16 5.2a3.2 3.2 0 0 1 0 6M18.5 19c0-2.6-1.3-4.2-3.2-4.6"/></svg>, 'friends', onFriends)}

      {/* centre + button */}
      <div onClick={onCreate} style={{ cursor: 'pointer', marginTop: -6 }}>
        <div style={{
          width: 54, height: 54, borderRadius: 18, background: '#FF6B4A',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 10px 22px -8px rgba(255,107,74,.8)',
        }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
        </div>
      </div>

      {tab('Plans', <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>, 'plans', onPlans)}
      {tab('You', <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.4"/><path d="M5.5 20c0-3.4 2.9-5.4 6.5-5.4s6.5 2 6.5 5.4"/></svg>, 'profile', onProfile)}
    </div>
  )
}

// ─── App ────────────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession]           = useState(undefined)
  const [screen, setScreen]             = useState('home')
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [openPlanId, setOpenPlanId]     = useState(null)
  const [overlayPlanId, setOverlayPlanId] = useState(null)

  useEffect(() => {
    if (overlayPlanId) {
      document.body.style.overflow = 'hidden'
      document.body.style.position = 'fixed'
      document.body.style.width = '100%'
    } else {
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.width = ''
    }
  }, [overlayPlanId])
  const [openAddFriend, setOpenAddFriend] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [homeRefresh, setHomeRefresh]   = useState(0)
  const [plansRefresh, setPlansRefresh] = useState(0)
  const [cancelledPlanIds, setCancelledPlanIds] = useState(new Set())
  const friendSubRef = useRef(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) {
        checkOnboarding(data.session.user.id)
        loadPendingCount(data.session.user.id)
        subscribeFriendRequests(data.session.user.id)
      }
    })
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        supabase.auth.getSession().then(({ data }) => {
          if (data.session) setSession(data.session)
        })
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    // Capture OAuth deep link on native (letsmeet://localhost#access_token=...)
    let appUrlListener
    import('@capacitor/app').then(({ App: CapApp }) => {
      CapApp.addListener('appUrlOpen', async ({ url }) => {
        if (url && url.includes('access_token')) {
          const hash = url.split('#')[1] || ''
          const params = Object.fromEntries(new URLSearchParams(hash))
          if (params.access_token && params.refresh_token) {
            const { data, error } = await supabase.auth.setSession({
              access_token: params.access_token,
              refresh_token: params.refresh_token,
            })
            if (!error && data.session) setSession(data.session)
          }
        }
      }).then(listener => { appUrlListener = listener }).catch(() => {})
    }).catch(() => {})

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (s) {
        checkOnboarding(s.user.id)
        loadPendingCount(s.user.id)
        subscribeFriendRequests(s.user.id)
        if (_e === 'SIGNED_IN') setScreen('home')
      } else {
        setNeedsOnboarding(false)
        setPendingCount(0)
        friendSubRef.current?.unsubscribe()
      }
    })
    return () => {
      subscription.unsubscribe()
      friendSubRef.current?.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibility)
      appUrlListener?.remove()
    }
  }, [])

  async function loadPendingCount(userId) {
    const { count } = await supabase
      .from('friendships')
      .select('id', { count: 'exact', head: true })
      .eq('addressee', userId)
      .eq('status', 'pending')
    setPendingCount(count || 0)
  }

  function subscribeFriendRequests(userId) {
    friendSubRef.current?.unsubscribe()
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
    onHome:    () => setScreen('home'),
    onFriends: () => setScreen('friends'),
    onCreate:  () => setScreen('create'),
    onPlans:   () => { setScreen('plans'); setPlansRefresh(r => r + 1) },
    onProfile: () => setScreen('profile'),
  })

  function renderScreen() {
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
              onOpenPlan={(id) => setOverlayPlanId(id)}
              onOpenAddFriend={() => { setOpenAddFriend(true); setPendingCount(0) }}
              requestCount={pendingCount}
              onPlanCancelled={(id) => setCancelledPlanIds(s => new Set([...s, id]))}
            />
          </div>
          <div style={show('friends')}>
            <FriendsScreen session={session} externalAddFriendOpen={openAddFriend} onCloseAddFriend={() => setOpenAddFriend(false)} />
          </div>
          {screen === 'create' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <CreateScreen session={session} onDone={() => { setScreen('home'); setHomeRefresh(r => r + 1); setPlansRefresh(r => r + 1) }} onCancel={() => setScreen('home')} onViewPlan={id => { setOpenPlanId(id); setScreen('plans'); setPlansRefresh(r => r + 1) }} />
            </div>
          )}
          <div style={show('plans')}>
            <PlansScreen session={session} openPlanId={openPlanId} onPlanOpened={() => setOpenPlanId(null)} refreshTrigger={plansRefresh} cancelledPlanIds={cancelledPlanIds} />
          </div>
          <div style={show('profile')}>
            <ProfileScreen session={session} onLogout={() => setSession(null)} onPrivacy={() => setScreen('privacy')} onTerms={() => setScreen('terms')} />
          </div>
        </div>
        <TabBar active={screen} {...tabNav()} />
      </div>
    )
  }

  return (
    <ErrorBoundary>
    <ResponsiveLayout>
      {renderScreen()}
      {overlayPlanId && session && (
        <PlanDetailOverlay
          planId={overlayPlanId}
          session={session}
          onClose={() => setOverlayPlanId(null)}
          onUpdated={() => setHomeRefresh(r => r + 1)}
        />
      )}
      {openAddFriend && session && screen !== 'friends' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 70 }}>
          <AddFriendSheet
            session={session}
            onClose={() => setOpenAddFriend(false)}
          />
        </div>
      )}
    </ResponsiveLayout>
    </ErrorBoundary>
  )
}
