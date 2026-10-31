import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Env present? Pages render a "setup needed" state instead of crashing. */
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

if (!isConfigured && import.meta.env.DEV) {
  console.error(
    '[paddys-kitchen] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copy .env.example to .env.',
  );
}

/**
 * Single shared client.
 *
 * Free-tier rules baked in here:
 *  • One client per browser tab → ONE websocket → one realtime connection slot.
 *  • Throttle channel events to 3/s (kitchen taps hills, not floods).
 *  • `persistSession` keeps staff logins across reloads (PWA-friendly).
 */
export const supabase = createClient<Database>(
  SUPABASE_URL ?? 'http://localhost:54321', // placeholder — never used when isConfigured === false
  SUPABASE_ANON_KEY ?? 'placeholder-anon-key',
  {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  realtime: { params: { eventsPerSecond: 3 } },
});

if (import.meta.env.DEV) {
  // Guard the 200-connection budget: log channel leakage across HMR reloads.
  (window as unknown as Record<string, unknown>).__pkChannelAudit = () =>
    supabase.getChannels().map((c) => c.topic);
}
