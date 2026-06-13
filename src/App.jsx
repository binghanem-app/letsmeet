import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import LoginScreen from './screens/LoginScreen'
import HomeScreen from './screens/HomeScreen'
import FriendsScreen from './screens/FriendsScreen'
import CreateScreen from './screens/CreateScreen'
import PlansScreen from './screens/PlansScreen'
import ProfileScreen from './screens/ProfileScreen'
import OnboardingScreen from './screens/OnboardingScreen'
import PrivacyPolicyScreen from './screens/PrivacyPolicyScreen'
import TermsScreen from './screens/TermsScreen'

// Phone chrome — wraps every screen in the same outer shell
function PhoneShell({ children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 26 }}>
      {/* header above phone */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10, background: '#FF6B4A',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 6px 14px rgba(255,107,74,.38)',
        }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
            <circle cx="8.5" cy="9" r="3.4" fill="#fff"/>
            <circle cx="15.5" cy="9" r="3.4" fill="#fff" opacity=".7"/>
            <path d="M3 19c0-2.8 2.4-4.6 5.5-4.6S14 16.2 14 19"
                  stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
        <span style={{ font: "600 24px 'Fredoka'", color: '#1F2933' }}>Let's Meet</span>
      </div>
    </div>
  )
}

// The 390×844 phone frame
function PhoneFrame({ children }) {
  return (
    <div style={{
      padding: 11, background: '#15191e', borderRadius: 54,
      boxShadow: '0 40px 80px -20px rgba(20,24,30,.5),0 0 0 1.5px rgba(255,255,255,.06) inset',
    }}>
      <div style={{
        position: 'relative', width: 390, height: 844,
        borderRadius: 44, overflow: 'hidden',
        background: '#FBF7F4', display: 'flex', flexDirection: 'column',
      }}>
        {/* status bar */}
        <div style={{ position: 'relative', height: 52, flexShrink: 0, zIndex: 30 }}>
          <div style={{
            position: 'absolute', top: 11, left: '50%', transform: 'translateX(-50%)',
            width: 118, height: 31, background: '#15191e', borderRadius: 18,
          }}/>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '17px 30px 0', font: "600 15px 'Plus Jakarta Sans'", color: '#1F2933',
          }}>
            <span>9:41</span>
            <svg width="64" height="13" viewBox="0 0 64 13" fill="#1F2933">
              <rect x="0" y="5" width="3" height="8" rx="1"/>
              <rect x="5" y="3" width="3" height="10" rx="1"/>
              <rect x="10" y="1.5" width="3" height="11.5" rx="1"/>
              <rect x="15" y="0" width="3" height="13" rx="1"/>
              <path d="M27 3.5c2.8-2.6 7.2-2.6 10 0l-1.4 1.5c-2-1.9-5.2-1.9-7.2 0z"/>
              <circle cx="32" cy="8.4" r="1.9"/>
              <rect x="46" y="1.5" width="14" height="9" rx="2.6" fill="none" stroke="#1F2933" strokeWidth="1.4"/>
              <rect x="47.6" y="3.2" width="9" height="5.6" rx="1.2"/>
              <rect x="61" y="4" width="2" height="4" rx="1"/>
            </svg>
          </div>
        </div>

        {/* screen content */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

// Responsive wrapper: phone frame on desktop, full-screen on mobile
function ResponsiveLayout({ children }) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 500

  if (isMobile) {
    return (
      <div style={{ width: '100%', height: '100vh', background: '#FBF7F4', display: 'flex', flexDirection: 'column' }}>
        {/* mobile status bar spacer */}
        <div style={{ height: 'env(safe-area-inset-top, 0px)', background: '#FFEFE9' }}/>
        <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
          {children}
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#EAE7E2', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 24px 90px' }}>
      <PhoneShell/>
      <PhoneFrame>{children}</PhoneFrame>
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
  const [openAddFriend, setOpenAddFriend] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [homeRefresh, setHomeRefresh]   = useState(0)
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
    onHome:    () => { setScreen('home'); setHomeRefresh(r => r + 1) },
    onFriends: () => setScreen('friends'),
    onCreate:  () => setScreen('create'),
    onPlans:   () => setScreen('plans'),
    onProfile: () => setScreen('profile'),
  })

  function renderScreen() {
    if (screen === 'privacy') return <PrivacyPolicyScreen onBack={() => setScreen(session ? 'profile' : 'login')} />
    if (screen === 'terms')   return <TermsScreen onBack={() => setScreen(session ? 'profile' : 'login')} />
    if (!session || screen === 'login') return <LoginScreen onLogin={() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)); setScreen('home') }} onPrivacy={() => setScreen('privacy')} onTerms={() => setScreen('terms')} />
    if (needsOnboarding) return <OnboardingScreen session={session} onDone={() => setNeedsOnboarding(false)} />

    const postLoginScreen = (() => {
      switch (screen) {
        case 'home':
        default:
          return (
            <HomeScreen
              session={session}
              refreshTrigger={homeRefresh}
              onStartCreate={() => setScreen('create')}
              onGoFriends={() => setScreen('friends')}
              onOpenPlan={(id) => { setOpenPlanId(id); setScreen('plans') }}
              onOpenAddFriend={() => { setOpenAddFriend(true); setScreen('friends'); setPendingCount(0) }}
              requestCount={pendingCount}
            />
          )
        case 'friends':
          return <FriendsScreen session={session} externalAddFriendOpen={openAddFriend} onCloseAddFriend={() => setOpenAddFriend(false)} />
        case 'create':
          return <CreateScreen session={session} onDone={() => { setScreen('home'); setHomeRefresh(r => r + 1) }} onCancel={() => setScreen('home')} onViewPlan={id => { setOpenPlanId(id); setScreen('plans') }} />
        case 'plans':
          return <PlansScreen session={session} openPlanId={openPlanId} onPlanOpened={() => setOpenPlanId(null)} />
        case 'profile':
          return <ProfileScreen session={session} onLogout={() => setSession(null)} onPrivacy={() => setScreen('privacy')} onTerms={() => setScreen('terms')} />
      }
    })()

    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          {postLoginScreen}
        </div>
        <TabBar active={screen} {...tabNav()} />
      </div>
    )
  }

  return <ResponsiveLayout>{renderScreen()}</ResponsiveLayout>
}
