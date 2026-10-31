// ════════════════════════════════════════════════════════════════════════════
//  useStaffCalls — realtime "Call waiter / Request bill" stream.
//  Same free-tier contract as useRealtimeOrders: one channel, hard cleanup,
//  heal-on-resubscribe. DELETE events go out with full old rows because
//  cleanup_old_orders() purges resolved calls after 48h (schema §9).
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { StaffCallRow } from '../types/database';
import type { RealtimeStatus } from '../types/models';

export interface UseStaffCallsOptions {
  restaurantId?: string | null;
  /** Optional UI scope; staff calls have no per-table realtime filter — filter client-side. */
  tableId?: string | null;
  /** New pending call (chime/toast). */
  onIncomingCall?: (call: StaffCallRow) => void;
  limit?: number;
}

export interface RealtimeCalls {
  calls: StaffCallRow[];
  status: RealtimeStatus;
  refresh: () => void;
}

const EMPTY: StaffCallRow[] = [];

export function useStaffCalls(options: UseStaffCallsOptions = {}): RealtimeCalls {
  const { restaurantId, onIncomingCall, limit = 50 } = options;

  const [calls, setCalls] = useState<StaffCallRow[]>(EMPTY);
  const [status, setStatus] = useState<RealtimeStatus>('connecting');
  const incomingRef = useRef(onIncomingCall);
  const pullRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    incomingRef.current = onIncomingCall;
  }, [onIncomingCall]);

  useEffect(() => {
    if (!restaurantId) {
      pullRef.current = null;
      setCalls(EMPTY);
      setStatus('disconnected');
      return;
    }

    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    const pull = async (): Promise<void> => {
      const { data, error } = await supabase
        .from('staff_calls')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (!error && !cancelled && data) setCalls(data);
    };

    pullRef.current = () => void pull();
    void pull();

    // One channel with a wildcard postgres_changes listener: payload.eventType
    // distinguishes INSERT/UPDATE/DELETE (cheaper than three .on() setups).
    channel = supabase
      .channel(`db-staff-calls:${restaurantId}`)
      .on(
        'postgres_changes' as const,
        { event: '*', schema: 'public', table: 'staff_calls', filter: `restaurant_id=eq.${restaurantId}` },
        (payload) => {
          const next = payload.new as StaffCallRow | undefined;
          const old = payload.old as Partial<StaffCallRow> | undefined;
          switch (payload.eventType) {
            case 'INSERT':
              if (next) {
                setCalls((prev) => [next, ...prev.filter((c) => c.id !== next.id)].slice(0, limit));
                incomingRef.current?.(next);
              }
              break;
            case 'UPDATE':
              if (next) {
                setCalls((prev) => prev.map((c) => (c.id === next.id ? next : c)));
              }
              break;
            case 'DELETE':
              if (old?.id) {
                setCalls((prev) => prev.filter((c) => c.id !== old.id));
              }
              break;
          }
        },
      )
      .subscribe((channelStatus) => {
        if (cancelled) return;
        switch (channelStatus) {
          case 'SUBSCRIBED':
            setStatus('live');
            void pull(); // heal missed events
            break;
          case 'CHANNEL_ERROR':
            setStatus('error');
            break;
          case 'TIMED_OUT':
            setStatus('connecting');
            break;
          default:
            setStatus('disconnected');
        }
      });

    return () => {
      cancelled = true;
      incomingRef.current = undefined;
      pullRef.current = null;
      if (channel) {
        const ch = channel;
        channel = null;
        void supabase.removeChannel(ch).catch(() => undefined);
      }
      setCalls(EMPTY);
      setStatus('disconnected');
    };
    // onIncomingCall via ref — never re-subscribe for changing callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, limit]);

  return { calls, status, refresh: () => pullRef.current?.() };
}

export default useStaffCalls;
