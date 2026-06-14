import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://wmexrzdrsrbahprczmsv.supabase.co',
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtZXhyemRyc3JiYWhwcmN6bXN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExODQ2MTYsImV4cCI6MjA5Njc2MDYxNn0.jGJBnJBWfY-XzRdfn884L-syIdKSuxbqoPpWF9Vwdgc',
  {
    auth: {
      flowType: 'implicit',
      detectSessionInUrl: true,
    }
  }
)
