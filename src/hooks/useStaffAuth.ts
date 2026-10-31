// ════════════════════════════════════════════════════════════════════════════
//  useStaffAuth — Supabase Auth session + tenant role resolution for KDS/Admin.
//  No realtime listeners (auth state comes from the SDK's local listener).
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { fetchStaffIdentity, type StaffIdentity } from '../lib/api';

export interface StaffAuth {
  loading: boolean;
  user: User | null;
  identity: StaffIdentity | null;
  /** Staff role but no membership row → tell the user to ask an owner. */
  missingMembership: boolean;
  error: string | null;
  refresh: () => void;
}

export function useStaffAuth(): StaffAuth {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [identity, setIdentity] = useState<StaffIdentity | null>(null);
  const [missingMembership, setMissingMembership] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = () => setTick((t) => t + 1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const resolve = async (): Promise<void> => {
      try {
        const {
          data: { user: current },
        } = await supabase.auth.getUser();
        if (cancelled) return;
        setUser(current);
        if (!current) {
          setIdentity(null);
          setMissingMembership(false);
          return;
        }
        const id = await fetchStaffIdentity();
        if (cancelled) return;
        setIdentity(id);
        setMissingMembership(id === null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Auth check failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void resolve();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setUser(session?.user ?? null);
      if (!session?.user) {
        setIdentity(null);
        setMissingMembership(false);
        setLoading(false);
      } else {
        // Sign-in / token refresh → re-resolve membership.
        void resolve();
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  return { loading, user, identity, missingMembership, error, refresh };
}

export default useStaffAuth;
