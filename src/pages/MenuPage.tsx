// ════════════════════════════════════════════════════════════════════════════
//  MenuPage — the guest PWA. Session (restaurant + table) rises from URL or
//  localStorage via SessionContext. Restores a dropped cart from localStorage
//  once the menu arrives, persists progress, and keeps TWO realtime
//  subscriptions (orders + staff calls) — both cleaned up inside their hooks.
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { useNavigate } from 'react-router';
import { LiveBadge, Spinner } from '../components/ui/misc';
import WiFiBanner from '../components/customer/WiFiBanner';
import MenuBrowser, { type AddPayload } from '../components/customer/MenuBrowser';
import CartSheet, { CartBar } from '../components/customer/CartSheet';
import OrderTracker from '../components/customer/OrderTracker';
import useRestaurantMenu from '../hooks/useRestaurantMenu';
import useRealtimeOrders from '../hooks/useRealtimeOrders';
import useStaffCalls from '../hooks/useStaffCalls';
import { useSession } from '../context/SessionContext';
import { placeOrder, requestStaffCall, ApiError } from '../lib/api';
import { buzz } from '../lib/utils';
import type { CartLine, ItemModifierView, MenuItemView, RestaurantSettings } from '../types/models';
import type { CallType, OrderRow } from '../types/database';

type Tab = 'menu' | 'orders';

// ── cart (reducer + persistence) ─────────────────────────────────────────────
function lineKey(menuItemId: string, modifierIds: string[]): string {
  return `${menuItemId}:${[...modifierIds].sort().join(',')}`;
}

interface SavedLine {
  key: string;
  item: string;
  modifiers: string[];
  quantity: number;
}

type CartAction =
  | { type: 'add'; payload: AddPayload }
  | { type: 'quantity'; key: string; quantity: number }
  | { type: 'remove'; key: string }
  | { type: 'set'; lines: CartLine[] };

function cartReducer(state: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case 'add': {
      const line: CartLine = {
        key: lineKey(action.payload.item.id, action.payload.modifiers.map((m) => m.id)),
        menuItem: action.payload.item,
        modifiers: action.payload.modifiers,
        quantity: action.payload.quantity,
      };
      const existing = state.find((l) => l.key === line.key);
      if (existing) {
        return state.map((l) =>
          l.key === line.key ? { ...l, quantity: Math.min(50, l.quantity + line.quantity) } : l,
        );
      }
      return [...state, line];
    }
    case 'quantity': {
      if (action.quantity <= 0) return state.filter((l) => l.key !== action.key);
      return state.map((l) => (l.key === action.key ? { ...l, quantity: action.quantity } : l));
    }
    case 'remove':
      return state.filter((l) => l.key !== action.key);
    case 'set':
      return action.lines;
  }
}

const CART_KEY = (slug: string, table: string) => `paddys_cart:${slug}:${table}`;
const TRACKED_KEY = 'paddys_tracked_orders';

function readTracked(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(TRACKED_KEY) ?? '[]') as string[];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string').slice(-20) : [];
  } catch {
    return [];
  }
}

function twoHoursAgoIso(): string {
  return new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
}

export function MenuPage() {
  const navigate = useNavigate();
  const { restaurant, table, tables, loading } = useSession();
  const menu = useRestaurantMenu(restaurant?.id ?? null);

  const [tab, setTab] = useState<Tab>('menu');
  const [cart, dispatch] = useReducer(cartReducer, []);
  const [cartOpen, setCartOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [calling, setCalling] = useState(false);
  const [tracked, setTracked] = useState<string[]>(() => readTracked());

  // ── restore cart once this table's menu is available ────────────────────────
  useEffect(() => {
    if (!restaurant || !table || menu.items.length === 0) return;
    let saved: SavedLine[] = [];
    try {
      saved = JSON.parse(
        localStorage.getItem(CART_KEY(restaurant.slug, table.table_number)) ?? '[]',
      ) as SavedLine[];
    } catch {
      return;
    }
    if (!Array.isArray(saved) || saved.length === 0 || cart.length > 0) return;

    const itemsById = new Map<string, MenuItemView>(menu.items.map((i) => [i.id, i]));
    const modsById = new Map<string, ItemModifierView>();
    for (const item of menu.items) {
      for (const mod of item.modifiers) modsById.set(mod.id, mod);
    }

    const restored: CartLine[] = [];
    for (const entry of saved) {
      const item = itemsById.get(entry.item);
      if (!item || typeof entry.quantity !== 'number' || !Number.isFinite(entry.quantity)) continue;
      const modifiers: CartLine['modifiers'] = [];
      let valid = true;
      for (const id of entry.modifiers ?? []) {
        const mod = modsById.get(id);
        // Modifier must exist AND belong to this item (menu may have changed).
        if (!mod || mod.menu_item_id !== item.id) {
          valid = false;
          break;
        }
        modifiers.push(mod);
      }
      if (!valid) continue;
      restored.push({
        key: lineKey(item.id, modifiers.map((m) => m.id)),
        menuItem: item,
        modifiers,
        quantity: Math.min(50, Math.max(1, Math.floor(entry.quantity))),
      });
    }
    if (restored.length > 0) dispatch({ type: 'set', lines: restored });
    // cart.length intentionally omitted — one-shot hydration per menu load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant?.id, table?.id, menu.items.length]);

  // ── persist cart per (restaurant, table) ────────────────────────────────────
  useEffect(() => {
    if (!restaurant || !table) return;
    try {
      const bodies = cart.map<SavedLine>((l) => ({
        key: l.key,
        item: l.menuItem.id,
        modifiers: l.modifiers.map((m) => m.id),
        quantity: l.quantity,
      }));
      localStorage.setItem(CART_KEY(restaurant.slug, table.table_number), JSON.stringify(bodies));
    } catch {
      /* storage blocked — cart is per-navigation only */
    }
  }, [cart, restaurant, table]);

  // ── track newly visible orders (yours forever on this device) ──────────────
  const trackOrder = useCallback((orderId: string) => {
    setTracked((prev) => {
      if (prev.includes(orderId)) return prev;
      const next = [...prev, orderId].slice(-20);
      try {
        localStorage.setItem(TRACKED_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
    setTab('orders');
    buzz([30, 60, 30]);
  }, []);

  // Customer-scope realtime: this table only. On the initial load, the first
  // fetched batch also re-tracks orders we already know about (idempotent).
  const { orders, status } = useRealtimeOrders({
    restaurantId: restaurant?.id ?? null,
    tableId: table?.id ?? null,
    includeCompleted: true,
    onIncomingOrder: useCallback(
      (order: OrderRow) => {
        if (table && order.table_id === table.id) trackOrder(order.id);
      },
      [table, trackOrder],
    ),
  });

  const { calls, status: callStatus } = useStaffCalls({
    restaurantId: restaurant?.id ?? null,
  });

  // The hook already filters orders by table via a realtime filter AND the
  // initial fetch — this guard is belt & braces for UPDATE events.
  const tableOrders = useMemo(
    () => orders.filter((o) => o.table_id === (table?.id ?? null)),
    [orders, table?.id],
  );
  const tableCalls = useMemo(
    () => calls.filter((c) => c.table_id === table?.id),
    [calls, table?.id],
  );

  // ── actions ────────────────────────────────────────────────────────────────
  const onAdd = useCallback((payload: AddPayload) => {
    dispatch({ type: 'add', payload });
    buzz(15);
  }, []);

  const place = async (notes: string): Promise<void> => {
    if (!restaurant || !table || cart.length === 0) return;
    setPlacing(true);
    setOrderError(null);
    try {
      const order = await placeOrder({
        restaurantId: restaurant.id,
        tableId: table.id,
        notes,
        lines: cart.map((l) => ({
          menu_item_id: l.menuItem.id,
          quantity: l.quantity,
          selected_modifier_ids: l.modifiers.map((m) => m.id),
        })),
      });
      dispatch({ type: 'set', lines: [] });
      setCartOpen(false);
      setTab('orders');
      trackOrder(order.id);
    } catch (err) {
      setOrderError(err instanceof ApiError ? err.message : 'Could not send the order — try again.');
    } finally {
      setPlacing(false);
    }
  };

  const call = async (type: CallType): Promise<void> => {
    if (!restaurant || !table) return;
    setCalling(true);
    setCallError(null);
    try {
      await requestStaffCall(restaurant.id, table.id, type);
      buzz([40, 80, 40]);
    } catch (err) {
      setCallError(err instanceof ApiError ? err.message : 'Could not reach staff — try again.');
    } finally {
      setCalling(false);
    }
  };

  // ── render states ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-stone-50 text-stone-400">
        <Spinner className="h-7 w-7" />
        <p className="text-sm font-semibold">Setting the table…</p>
      </div>
    );
  }

  if (!restaurant || !table) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-stone-50 px-6 text-center">
        <div className="text-5xl" aria-hidden>🍽️</div>
        <h1 className="text-lg font-black text-stone-900">No table detected</h1>
        <p className="max-w-xs text-sm text-stone-500">
          Point your camera at the QR code on the table, or open the landing page to pick one manually.
        </p>
        <button
          onClick={() => navigate('/')}
          className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white"
        >
          Choose restaurant manually
        </button>
      </div>
    );
  }

  const activeOrders = tableOrders.filter((o) => tracked.includes(o.id) || o.created_at > twoHoursAgoIso());

  return (
    <div className="min-h-screen bg-stone-100">
      <WiFiBanner settings={(restaurant.settings ?? {}) as unknown as RestaurantSettings} />

      {/* Header */}
      <header className="sticky top-0 z-20 -mt-px flex items-center justify-between gap-3 bg-stone-100/90 px-4 py-3 backdrop-blur">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-black tracking-tight text-stone-900">{restaurant.name}</h1>
          <p className="text-[11px] font-semibold text-stone-400">
            Table {table.table_number}
            {typeof (restaurant.settings as Record<string, unknown> | null)?.hours === 'string'
              ? ` · ${(restaurant.settings as Record<string, unknown>).hours as string}`
              : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LiveBadge status={status} />
          <div className="flex rounded-xl bg-stone-200/70 p-1 text-xs font-bold" role="tablist">
            <button
              onClick={() => setTab('menu')}
              role="tab"
              aria-selected={tab === 'menu'}
              className={tab === 'menu' ? 'rounded-lg bg-white px-3.5 py-1.5 text-stone-900 shadow-sm' : 'rounded-lg px-3.5 py-1.5 text-stone-500'}
            >
              Menu
            </button>
            <button
              onClick={() => setTab('orders')}
              role="tab"
              aria-selected={tab === 'orders'}
              className={tab === 'orders' ? 'rounded-lg bg-white px-3.5 py-1.5 text-stone-900 shadow-sm' : 'rounded-lg px-3.5 py-1.5 text-stone-500'}
            >
              Orders{tableOrders.length > 0 ? ` (${tableOrders.length})` : ''}
            </button>
          </div>
        </div>
      </header>

      <main className="px-4 pb-32 pt-3">
        {tab === 'menu' ? (
          menu.loading && menu.categories.length === 0 ? (
            <div className="flex justify-center py-20 text-stone-400"><Spinner className="h-7 w-7" /></div>
          ) : menu.error ? (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{menu.error}</p>
          ) : (
            <MenuBrowser categories={menu.categories} onAdd={onAdd} />
          )
        ) : (
          <OrderTracker orders={activeOrders} calls={tableCalls} onStaffCall={call} calling={calling} error={callError} />
        )}
      </main>

      {/* Cart bar — menu tab only, sticky bottom */}
      {tab === 'menu' && cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center">
          <CartBar lines={cart} onOpen={() => setCartOpen(true)} />
        </div>
      )}
      {tab === 'menu' && cart.length === 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 h-0" aria-hidden />
      )}

      {cartOpen && (
        <CartSheet
          lines={cart}
          onChangeQuantity={(key, q) => dispatch({ type: 'quantity', key, quantity: q })}
          onRemove={(key) => dispatch({ type: 'remove', key })}
          onPlaceOrder={place}
          placing={placing}
          error={orderError}
          onClose={() => setCartOpen(false)}
        />
      )}
    </div>
  );
}

/** MenuBrowser's add handler lives in the component (stable via useCallback). */

export default MenuPage;
