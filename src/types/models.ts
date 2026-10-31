// ════════════════════════════════════════════════════════════════════════════
//  Domain / view types — the normalized shapes the UI consumes.
//  Row types (src/types/database.ts) stay faithful to PostgREST; these layers
//  convert numeric strings to numbers and attach relations.
// ════════════════════════════════════════════════════════════════════════════
import type {
  CategoryRow,
  ItemModifierRow,
  MenuItemRow,
  OrderItemRow,
  OrderRow,
  OrderStatus,
  RestaurantRow,
  StaffCallRow,
  TableRowSchema,
} from './database';

// ── Restaurant settings (jsonb, defensively parsed) ──────────────────────────
export interface WifiSettings {
  ssid?: string;
  password?: string;
  note?: string;
}

export interface RestaurantSettings {
  currency?: string;
  wifi?: WifiSettings;
  hours?: string;
  contact?: string;
  theme?: { primary?: string; accent?: string };
}

// ── Menu with relations ──────────────────────────────────────────────────────
export interface ItemModifierView {
  id: string;
  menu_item_id: string;
  group_name: string;
  option_name: string;
  additional_price: number;
  is_required: boolean;
  display_order: number;
}

export interface MenuItemView {
  id: string;
  restaurant_id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  dietary_tags: string[];
  display_order: number;
  modifiers: ItemModifierView[];
}

export interface CategoryWithItems {
  id: string;
  restaurant_id: string;
  name: string;
  display_order: number;
  items: MenuItemView[];
}

// ── Orders with joined items (KDS + customer tracker) ────────────────────────
export interface OrderItemView {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  item_name: string;
  quantity: number;
  unit_price: number;
  item_total: number;
  selected_modifiers: { group_name: string; option_name: string; additional_price: number }[];
}

export interface OrderView {
  id: string;
  restaurant_id: string;
  table_id: string | null;
  status: OrderStatus;
  total_amount: number;
  customer_notes: string | null;
  created_at: string;
  updated_at: string;
  items: OrderItemView[];
}

// ── Cart ─────────────────────────────────────────────────────────────────────
export interface CartLine {
  /** menuItemId + sorted modifier ids — identity for deduping/merging lines */
  key: string;
  menuItem: MenuItemView;
  modifiers: ItemModifierView[];
  quantity: number;
}

// ── Realtime ─────────────────────────────────────────────────────────────────
export type RealtimeStatus = 'connecting' | 'live' | 'error' | 'disconnected';

// ── QR / session ─────────────────────────────────────────────────────────────
export interface TrackedOrderRef {
  id: string;
  placedAt: string;
}

// Re-exports for convenience
export type {
  CategoryRow,
  ItemModifierRow,
  MenuItemRow,
  OrderItemRow,
  OrderRow,
  OrderStatus,
  RestaurantRow,
  StaffCallRow,
  TableRowSchema,
};
