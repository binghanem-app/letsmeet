import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://wmexrzdrsrbahprczmsv.supabase.co',
    import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      flowType: 'implicit',
      detectSessionInUrl: true,
    }
  }
)
