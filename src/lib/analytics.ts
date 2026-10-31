// ════════════════════════════════════════════════════════════════════════════
//  Client-side analytics — no extra DB objects, no RPC calls.
//  Pulls the last N orders once and aggregates in memory; trivially cheap.
// ════════════════════════════════════════════════════════════════════════════
import { supabase } from './supabase';
import { dayKey } from './utils';
import { toOrderView } from './mappers';
import type { OrderStatus } from '../types/database';
import type { OrderView } from '../types/models';

export interface LocationStats {
  totalOrders: number;
  todayOrders: number;
  todayRevenue: number;
  avgOrderValue: number;
  byStatus: Record<OrderStatus, number>;
  /** Last 7 local days, oldest → newest (deltas = revenue). */
  weekly: Array<{ day: string; orders: number; revenue: number }>;
  topItems: Array<{ name: string; quantity: number; revenue: number }>;
}

export async function loadLocationStats(restaurantId: string): Promise<LocationStats> {
  const { data: orderRows, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;

  // Embedding returns orders with their items inline (typed via Database).
  const orders: OrderView[] = (orderRows ?? []).map((row) => {
    const items = row.order_items ?? [];
    return toOrderView(row, items);
  });

  const todayKey = dayKey(new Date().toISOString());

  const byStatus: Record<OrderStatus, number> = {
    pending: 0, preparing: 0, ready: 0, completed: 0, cancelled: 0,
  };
  const dayBuckets = new Map<string, { orders: number; revenue: number }>();
  const itemBuckets = new Map<string, { name: string; quantity: number; revenue: number }>();

  for (const o of orders) {
    byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
    const key = dayKey(o.created_at);
    const bucket = dayBuckets.get(key) ?? { orders: 0, revenue: 0 };
    bucket.orders += 1;
    // Cancelled orders contribute no revenue.
    if (o.status !== 'cancelled') bucket.revenue += o.total_amount;
    dayBuckets.set(key, bucket);

    for (const item of o.items) {
      const b = itemBuckets.get(item.item_name) ?? { name: item.item_name, quantity: 0, revenue: 0 };
      b.quantity += item.quantity;
      if (o.status !== 'cancelled') b.revenue += item.item_total;
      itemBuckets.set(item.item_name, b);
    }
  }

  const today = dayBuckets.get(todayKey) ?? { orders: 0, revenue: 0 };
  const weekly: LocationStats['weekly'] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dayKey(d.toISOString());
    const b = dayBuckets.get(key) ?? { orders: 0, revenue: 0 };
    weekly.push({ day: key, orders: b.orders, revenue: b.revenue });
  }

  const liveOrders = orders.filter((o) => o.status !== 'cancelled');
  const totalRevenue = liveOrders.reduce((sum, o) => sum + o.total_amount, 0);

  return {
    totalOrders: orders.length,
    todayOrders: today.orders,
    todayRevenue: today.revenue,
    avgOrderValue: liveOrders.length ? totalRevenue / liveOrders.length : 0,
    byStatus,
    weekly,
    topItems: [...itemBuckets.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 6),
  };
}
