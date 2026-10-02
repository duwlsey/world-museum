import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Supabase connection settings are missing. Add them to .env.local and restart the dev server.')
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})

// Guest capabilities use an anonymous client without changing account sessions.
export const guestbookClient = createClient(supabaseUrl, supabasePublishableKey, { auth: { storageKey: 'world-museum-guestbook', autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
