// ════════════════════════════════════════════════════════════════════════════
//  KdsPage — auth gate + board + guest-call panel.
//  Streams: useRealtimeOrders (orders + order_items, one channel) and
//  useStaffCalls (one channel) = 2 channels, 1 websocket per device.
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react';
import KDSBoard from '../components/kds/KDSBoard';
import StaffCallPanel from '../components/kds/StaffCallPanel';
import StaffLogin from '../components/StaffLogin';
import { Spinner } from '../components/ui/misc';
import useRealtimeOrders from '../hooks/useRealtimeOrders';
import useStaffCalls from '../hooks/useStaffCalls';
import useStaffAuth from '../hooks/useStaffAuth';
import { setOrderStatus, resolveStaffCall, signInStaff, signOutStaff } from '../lib/api';
import { supabase } from '../lib/supabase';
import { armAudio, playOrderChime } from '../lib/chime';

export function KdsPage() {
  const auth = useStaffAuth();
  const [muted, setMuted] = useState(() => localStorage.getItem('paddys_kds_muted') === '1');
  const [tableNames, setTableNames] = useState<Record<string, string | null>>({});

  // One gentle chime per incoming order (INSERT, pending only on KDS).
  const onIncomingOrder = useCallback(
    (order: { status: string }) => {
      if (!muted && order.status === 'pending') playOrderChime(0.3);
    },
    [muted],
  );

  const { orders, status: ordersStatus } = useRealtimeOrders({
    restaurantId: auth.identity?.restaurantId ?? null,
    includeCompleted: true,
    onIncomingOrder,
  });

  const { calls, status: callsStatus, refresh: refetchCalls } = useStaffCalls({
    restaurantId: auth.identity?.restaurantId ?? null,
    onIncomingCall: useCallback(() => {
      if (!muted) playOrderChime(0.35);
    }, [muted]),
  });

  // Table id → number map for ticket headers (tiny one-time fetch).
  useEffect(() => {
    const restaurantId = auth.identity?.restaurantId;
    if (!restaurantId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('tables')
        .select('id, table_number')
        .eq('restaurant_id', restaurantId);
      if (cancelled) return;
      const map: Record<string, string | null> = {};
      for (const t of data ?? []) map[t.id] = t.table_number;
      setTableNames(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [auth.identity?.restaurantId]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      localStorage.setItem('paddys_kds_muted', next ? '1' : '0');
      if (!next) {
        armAudio();
        playOrderChime(0.3); // instant confirmation the chime works
      }
      return next;
    });
  }, []);

  // ── gates ─────────────────────────────────────────────────────────────────
  if (auth.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100 text-stone-400">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }

  if (!auth.user) {
    return (
      <StaffLogin
        title="Kitchen sign-in"
        subtitle="Staff access only — this device becomes a KDS station."
        onSignIn={signInStaff}
      />
    );
  }

  if (auth.missingMembership || !auth.identity) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-stone-100 px-6 text-center">
        <div className="text-4xl" aria-hidden>🚫</div>
        <h1 className="text-lg font-black text-stone-900">No staff profile</h1>
        <p className="max-w-sm text-sm text-stone-500">
          {auth.user.email} isn't linked to a restaurant yet. Run the step at the bottom of
          <code className="mx-1 rounded bg-stone-200 px-1.5 py-0.5 text-xs">supabase/seed.sql</code>
          to attach this account to a tenant.
        </p>
        <button onClick={auth.refresh} className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-bold text-white">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-100 pb-10" onPointerDown={armAudio}>
      <div className="mx-auto max-w-5xl space-y-3 px-2 py-3 sm:px-4">
        <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-emerald-600">
                {auth.identity.restaurantName || 'Paddy\'s Kitchen'}
              </p>
              <p className="text-sm font-bold text-stone-700">
                Staff board · {auth.identity.role}
              </p>
            </div>
            <button
              onClick={() =>
                void signOutStaff()
                  .then(() => auth.refresh())
                  .catch(() => undefined)
              }
              className="rounded-xl bg-stone-100 px-3 py-2 text-xs font-bold text-stone-600 hover:bg-stone-200"
            >
              Sign out
            </button>
          </div>
        </div>

        <StaffCallPanel
          calls={calls}
          status={callsStatus}
          tableNames={tableNames}
          onResolve={(id) => void resolveStaffCall(id).then(refetchCalls).catch(() => undefined)}
        />

        <KDSBoard
          orders={orders}
          status={ordersStatus}
          tableNames={tableNames}
          muted={muted}
          onToggleMute={toggleMute}
          onSetStatus={(orderId, next) => void setOrderStatus(orderId, next)}
        />
      </div>
    </div>
  );
}

export default KdsPage;
