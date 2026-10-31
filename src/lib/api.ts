// ════════════════════════════════════════════════════════════════════════════
//  Typed API surface — every network mutation the app performs.
//  RLS + the place_order() RPC enforce integrity server-side; this layer
//  just shapes the calls and normalizes errors for the UI.
// ════════════════════════════════════════════════════════════════════════════
import { supabase } from './supabase';
import type { OrderRow, OrderStatus, StaffCallRow, StaffMemberRow, StaffRole } from '../types/database';

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

function friendly(error: unknown, fallback: string): never {
  if (error instanceof ApiError) throw error;
  const message = error instanceof Error ? error.message : String(error);
  throw new ApiError(message || fallback);
}

// ── Ordering (customers) ─────────────────────────────────────────────────────

export interface PlaceOrderLine {
  menu_item_id: string;
  quantity: number;
  selected_modifier_ids: string[];
}

export interface PlaceOrderInput {
  restaurantId: string;
  tableId: string;
  notes?: string;
  lines: PlaceOrderLine[];
}

/** Calls the atomic place_order RPC — the single write path for customers. */
export async function placeOrder(input: PlaceOrderInput): Promise<OrderRow> {
  const { data, error } = await supabase.rpc('place_order', {
    p_restaurant_id: input.restaurantId,
    p_table_id: input.tableId,
    p_customer_notes: input.notes?.trim() || null,
    p_items: input.lines.map((l) => ({
      menu_item_id: l.menu_item_id,
      quantity: l.quantity,
      selected_modifier_ids: l.selected_modifier_ids,
    })),
  });
  if (error) throw friendly(error, 'Could not place the order');
  const payload = data as { order?: OrderRow | null } | null;
  if (!payload?.order) throw new ApiError('Order response was empty');
  return payload.order;
}

// ── Staff calls (customers) ──────────────────────────────────────────────────

export async function requestStaffCall(
  restaurantId: string,
  tableId: string,
  callType: 'assistance' | 'bill',
): Promise<StaffCallRow> {
  const { data, error } = await supabase
    .from('staff_calls')
    .insert({ restaurant_id: restaurantId, table_id: tableId, call_type: callType })
    .select('*')
    .single();
  if (error) throw friendly(error, 'Could not reach staff — try again');
  return data;
}

// ── KDS (staff) ──────────────────────────────────────────────────────────────

export async function setOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
  const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
  if (error) {
    friendly(error, `Could not move order to ${status}`);
  }
}

export async function resolveStaffCall(callId: string): Promise<void> {
  const { error } = await supabase
    .from('staff_calls')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('id', callId);
  if (error) friendly(error, 'Could not resolve the call');
}

// ── Admin hub ────────────────────────────────────────────────────────────────

export async function toggleMenuItemAvailability(itemId: string, isAvailable: boolean): Promise<void> {
  const { error } = await supabase.from('menu_items').update({ is_available: isAvailable }).eq('id', itemId);
  if (error) friendly(error, 'Could not update availability');
}

export async function updateMenuItem(
  itemId: string,
  patch: { name?: string; description?: string | null; price?: string; image_url?: string | null; category_id?: string; dietary_tags?: string[] },
): Promise<void> {
  const { error } = await supabase.from('menu_items').update(patch).eq('id', itemId);
  if (error) friendly(error, 'Could not save the item');
}

export async function insertMenuItem(
  values: { restaurant_id: string; category_id: string; name: string; description?: string | null; price: string; image_url?: string | null; dietary_tags?: string[]; display_order?: number },
): Promise<void> {
  const { error } = await supabase.from('menu_items').insert(values);
  if (error) friendly(error, 'Could not create the item');
}

export async function insertModifier(
  values: { menu_item_id: string; group_name: string; option_name: string; additional_price: string; is_required: boolean; display_order?: number },
): Promise<void> {
  const { error } = await supabase.from('item_modifiers').insert(values);
  if (error) friendly(error, 'Could not add the option');
}

export async function deleteModifier(modifierId: string): Promise<void> {
  const { error } = await supabase.from('item_modifiers').delete().eq('id', modifierId);
  if (error) friendly(error, 'Could not remove the option');
}

export async function createCategory(restaurantId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('categories')
    .insert({ restaurant_id: restaurantId, name: name.trim() });
  if (error) friendly(error, 'Could not create the category');
}

export async function createTable(restaurantId: string, tableNumber: string): Promise<void> {
  const { error } = await supabase
    .from('tables')
    .insert({ restaurant_id: restaurantId, table_number: tableNumber.trim() });
  if (error) friendly(error, 'Could not create the table');
}

export async function setTableStatus(tableId: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('tables').update({ status: active ? 'active' : 'inactive' }).eq('id', tableId);
  if (error) friendly(error, 'Could not update the table');
}

// ── Auth / staff bootstrap ───────────────────────────────────────────────────

export interface StaffIdentity {
  role: StaffRole;
  restaurantId: string;
  restaurantName: string;
  name: string;
}

/**
 * After sign-in, resolve the staff record through RLS (users only ever see
 * their own row) plus the tenant name for headers.
 */
export async function fetchStaffIdentity(): Promise<StaffIdentity | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: row, error: staffErr } = await supabase
    .from('staff_members')
    .select('*, restaurants(name)')
    .eq('user_id', user.id)
    .maybeSingle();
  if (staffErr) throw friendly(staffErr, 'Could not load staff profile');
  if (!row) return null;

  const { restaurants, ...membership } = row as StaffMemberRow & {
    restaurants?: { name?: string } | { name?: string }[] | null;
  };
  const restaurantName = Array.isArray(restaurants) ? restaurants[0]?.name : restaurants?.name;

  return {
    role: membership.role,
    restaurantId: membership.restaurant_id,
    restaurantName: restaurantName ?? '',
    name: membership.name,
  };
}

export async function signInStaff(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw friendly(error, 'Sign-in failed');
}

export async function signOutStaff(): Promise<void> {
  await supabase.auth.signOut();
}
