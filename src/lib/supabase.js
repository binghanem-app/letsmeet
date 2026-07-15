import { createClient } from '@supabase/supabase-js'
import { Preferences } from '@capacitor/preferences'

// ── Durable native session storage ───────────────────────────────────────────
// The old default was WebView `localStorage`, which iOS/WKWebView evicts under
// storage pressure — that silently wiped the auth session and kicked users to
// the login screen "for no reason". @capacitor/preferences persists to native
// storage (UserDefaults on iOS), which survives eviction and app restarts. On a
// web build Preferences falls back to localStorage, so this is safe everywhere.
const nativeStorage = {
  getItem: async (key) => {
    const { value } = await Preferences.get({ key })
    if (value != null) return value
    // One-time migration: existing users still have their session in the old
    // WebView localStorage key. Seed it into Preferences on first read so the
    // upgrade to this build does NOT itself log everyone out.
    try {
      const legacy = globalThis.localStorage?.getItem(key)
      if (legacy != null) {
        await Preferences.set({ key, value: legacy })
        return legacy
      }
    } catch { /* localStorage unavailable — ignore */ }
    return null
  },
  setItem: async (key, value) => {
    await Preferences.set({ key, value })
  },
  removeItem: async (key) => {
    await Preferences.remove({ key })
  },
}

// Set when the user deliberately signs out (logout button / account deletion) so
// the auth-state handler in App.jsx can tell an intentional logout apart from a
// transient token-refresh failure and skip the recovery-retry grace period.
export const authIntent = { intentionalSignOut: false }

/** Deliberate sign-out. Flags intent, then signs out. */
export async function signOutIntentionally() {
  authIntent.intentionalSignOut = true
  return supabase.auth.signOut()
}

export const supabase = createClient(
  'https://wmexrzdrsrbahprczmsv.supabase.co',
  // Supabase ANON key — public by design (it ships in every client; access is
  // gated by RLS). The fallback guarantees the build works even when the CI env
  // doesn't inject VITE_SUPABASE_ANON_KEY (otherwise createClient throws at load
  // and the whole app white-screens).
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtZXhyemRyc3JiYWhwcmN6bXN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExODQ2MTYsImV4cCI6MjA5Njc2MDYxNn0.jGJBnJBWfY-XzRdfn884L-syIdKSuxbqoPpWF9Vwdgc',
  {
    auth: {
      storage: nativeStorage,
      persistSession: true,
      autoRefreshToken: true,
      flowType: 'implicit',
      detectSessionInUrl: true,
    }
  }
)
