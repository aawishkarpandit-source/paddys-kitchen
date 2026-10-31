// ════════════════════════════════════════════════════════════════════════════
//  useRealtimeOrders — one channel, welcome + healing + HARD cleanup.
//
//  Free-tier contract (the 200-connection limit is our budget):
//   1. ONE channel per hook instance (postgres_changes multiplex on a single
//      websocket, so N tabs ≈ N connections — never N × listeners).
//   2. `supabase.removeChannel(channel)` on every unmount, including React
//      StrictMode's dev double-mount. No leaks across HMR.
//   3. Orders filter by restaurant (single-column realtime filters only);
//      optional tightened table filter for customer pages. order_items stream
//      restaurant-wide and are matched client-side.
//   4. On (re)SUBSCRIBED we re-pull a small initial snapshot so brief
//      disconnects can never leave a stale board ("healing").
//
//  Requires schema.sql §8: orders/order_items/staff_calls in the
//  supabase_realtime publication with REPLICA IDENTITY FULL (DELETE payloads
//  otherwise carry only the PK — we rely on the full old rows).
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { OrderRow, OrderItemRow } from '../types/database';
import type { OrderView, RealtimeStatus } from '../types/models';
import { toOrderView } from '../lib/mappers';

export interface UseRealtimeOrdersOptions {
  /** Tenant scope (required in practice). */
  restaurantId?: string | null;
  /** Narrow orders to one table (customer page). Leave off for KDS. */
  tableId?: string | null;
  /** KDS keeps recently completed tickets; customers don't need them. */
  includeCompleted?: boolean;
  /** Fired once per genuinely new order (INSERT) — audio chime, toast, haptics. */
  onIncomingOrder?: (order: OrderRow) => void;
  /** Max snapshot rows pulled on (re)connect. Default 100. */
  limit?: number;
}

interface OrdersState {
  orders: Record<string, OrderRow>;
  itemsByOrder: Record<string, Record<string, OrderItemRow>>;
}

type OrdersAction =
  | { type: 'reset' }
  | { type: 'hydrate'; orders: OrderRow[]; items: OrderItemRow[] }
  | { type: 'upsertOrder'; order: OrderRow }
  | { type: 'deleteOrder'; orderId: string }
  | { type: 'upsertItem'; item: OrderItemRow }
  | { type: 'deleteItem'; item: OrderItemRow };

function reducer(state: OrdersState, action: OrdersAction): OrdersState {
  switch (action.type) {
    case 'reset':
      return { orders: {}, itemsByOrder: {} };
    case 'hydrate': {
      const orders = { ...state.orders };
      for (const o of action.orders) orders[o.id] = o;
      const itemsByOrder = { ...state.itemsByOrder };
      for (const it of action.items) {
        itemsByOrder[it.order_id] = { ...(itemsByOrder[it.order_id] ?? {}), [it.id]: it };
      }
      return { orders, itemsByOrder };
    }
    case 'upsertOrder':
      return { ...state, orders: { ...state.orders, [action.order.id]: action.order } };
    case 'deleteOrder': {
      const { [action.orderId]: _gone, ...orders } = state.orders;
      void _gone;
      const itemsByOrder = { ...state.itemsByOrder };
      delete itemsByOrder[action.orderId];
      return { orders, itemsByOrder };
    }
    case 'upsertItem': {
      const bucket = state.itemsByOrder[action.item.order_id] ?? {};
      return {
        ...state,
        itemsByOrder: {
          ...state.itemsByOrder,
          [action.item.order_id]: { ...bucket, [action.item.id]: action.item },
        },
      };
    }
    case 'deleteItem': {
      const orderId = action.item.order_id;
      if (!orderId) return state;
      const bucket = { ...(state.itemsByOrder[orderId] ?? {}) };
      delete bucket[action.item.id];
      return { ...state, itemsByOrder: { ...state.itemsByOrder, [orderId]: bucket } };
    }
  }
}

function mapChannelStatus(status: string): RealtimeStatus {
  switch (status) {
    case 'SUBSCRIBED':
      return 'live';
    case 'CHANNEL_ERROR':
      return 'error';
    case 'TIMED_OUT':
      return 'connecting'; // supabase-js retries automatically
    case 'CLOSED':
    default:
      return 'disconnected';
  }
}

export interface RealtimeOrders {
  /** Joined orders (items attached), newest first. */
  orders: OrderView[];
  status: RealtimeStatus;
  /** Manual heal — refetches the snapshot (used by a "reconnect" affordance). */
  refresh: () => void;
}

export function useRealtimeOrders(options: UseRealtimeOrdersOptions = {}): RealtimeOrders {
  const { restaurantId, tableId, includeCompleted = false, onIncomingOrder, limit = 100 } = options;

  const [state, dispatch] = useReducer(reducer, { orders: {}, itemsByOrder: {} });
  const [status, setStatus] = useState<RealtimeStatus>('connecting');

  // Callback via ref so callers can pass inline handlers without re-subscribing.
  const incomingRef = useRef(onIncomingOrder);
  useEffect(() => {
    incomingRef.current = onIncomingOrder;
  }, [onIncomingOrder]);

  // Keep the active snapshot puller reachable for manual refresh.
  const pullRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!restaurantId) {
      pullRef.current = null;
      dispatch({ type: 'reset' });
      setStatus('disconnected');
      return;
    }

    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    // ── initial snapshot + heal-on-resubscribe pull ────────────────────────
    const pull = async (): Promise<void> => {
      let query = supabase
        .from('orders')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (!includeCompleted) query = query.neq('status', 'completed');
      const { data: orderRows, error } = await query;
      if (error || cancelled || !orderRows) return;

      const ids = orderRows.map((o) => o.id);
      let itemRows: OrderItemRow[] = [];
      if (ids.length > 0) {
        const { data: rows } = await supabase.from('order_items').select('*').in('order_id', ids);
        itemRows = rows ?? [];
      }
      if (!cancelled) dispatch({ type: 'hydrate', orders: orderRows, items: itemRows });
    };

    pullRef.current = () => void pull();
    void pull();

    // ── one channel, three data streams multiplexed ─────────────────────────
    const ordersFilter = tableId ? `table_id=eq.${tableId}` : `restaurant_id=eq.${restaurantId}`;

    channel = supabase
      .channel(`db-orders:${restaurantId}:${tableId ?? 'all'}`)
      .on(
        'postgres_changes' as const,
        { event: 'INSERT', schema: 'public', table: 'orders', filter: ordersFilter },
        (payload) => {
          const order = payload.new as OrderRow;
          dispatch({ type: 'upsertOrder', order });
          incomingRef.current?.(order);
        },
      )
      .on(
        'postgres_changes' as const,
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: ordersFilter },
        (payload) => {
          dispatch({ type: 'upsertOrder', order: payload.new as OrderRow });
        },
      )
      .on(
        'postgres_changes' as const,
        { event: 'DELETE', schema: 'public', table: 'orders', filter: ordersFilter },
        (payload) => {
          // REPLICA IDENTITY FULL → old row carries the id.
          const old = payload.old as { id?: string };
          if (old?.id) dispatch({ type: 'deleteOrder', orderId: old.id });
        },
      )
      .on(
        'postgres_changes' as const,
        { event: '*', schema: 'public', table: 'order_items', filter: `restaurant_id=eq.${restaurantId}` },
        (payload) => {
          switch (payload.eventType) {
            case 'INSERT':
            case 'UPDATE': {
              const item = payload.new as OrderItemRow;
              if (item) dispatch({ type: 'upsertItem', item });
              break;
            }
            case 'DELETE': {
              const old = payload.old as OrderItemRow | { id: string };
              if ('order_id' in (old as OrderItemRow) && (old as OrderItemRow).order_id) {
                dispatch({ type: 'deleteItem', item: old as OrderItemRow });
              } else if ((old as { id?: string }).id) {
                // Fallback when replica identity would ever lose the composite key.
                const id = (old as { id: string }).id;
                dispatch({ type: 'deleteItem', item: { id, order_id: '' } as OrderItemRow });
              }
              break;
            }
          }
        },
      )
      .subscribe((channelStatus) => {
        if (cancelled) return;
        setStatus(mapChannelStatus(channelStatus));
        // Heal: re-pull once live so missed events during reconnect merge in.
        if (channelStatus === 'SUBSCRIBED') void pull();
      });

    // ── HARD cleanup — removeChannel is the connection-budget guarantee ────
    return () => {
      cancelled = true;
      incomingRef.current = undefined;
      if (channel) {
        const ch = channel;
        channel = null;
        void supabase
          .removeChannel(ch)
          .catch(() => undefined)
          .finally(() => {
            // In dev, surface any accidental channel leakage immediately.
            if (import.meta.env.DEV) {
              const left = supabase.getChannels().length;
              if (left > 0) console.debug(`[realtime] ${left} channel(s) still open after cleanup`);
            }
          });
      }
      dispatch({ type: 'reset' });
      setStatus('disconnected');
    };
    // NOTE: onIncomingOrder is intentionally absent (ref pattern) — the
    // subscription must NOT be torn down when call sites re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, tableId, includeCompleted, limit]);

  const orders = useMemo<OrderView[]>(() => {
    const views = Object.values(state.orders).map((order) =>
      toOrderView(order, Object.values(state.itemsByOrder[order.id] ?? {})),
    );
    views.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return views;
  }, [state]);

  return { orders, status, refresh: () => pullRef.current?.() };
}

export default useRealtimeOrders;
