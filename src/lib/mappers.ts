// Row → view mappers (numeric strings → numbers, jsonb → typed arrays).
import type { OrderItemRow, OrderRow } from '../types/database';
import type { MenuItemRow, ItemModifierRow } from '../types/database';
import type { MenuItemView, ItemModifierView, OrderItemView, OrderView } from '../types/models';

export function toModifierView(m: ItemModifierRow): ItemModifierView {
  return {
    id: m.id,
    menu_item_id: m.menu_item_id,
    group_name: m.group_name,
    option_name: m.option_name,
    additional_price: Number(m.additional_price),
    is_required: m.is_required,
    display_order: m.display_order,
  };
}

export function toMenuItemView(item: MenuItemRow, modifiers: ItemModifierRow[] = []): MenuItemView {
  return {
    id: item.id,
    restaurant_id: item.restaurant_id,
    category_id: item.category_id,
    name: item.name,
    description: item.description,
    price: Number(item.price),
    image_url: item.image_url,
    is_available: item.is_available,
    dietary_tags: item.dietary_tags ?? [],
    display_order: item.display_order,
    modifiers: modifiers
      .map(toModifierView)
      .sort((a, b) => a.group_name.localeCompare(b.group_name) || a.display_order - b.display_order),
  };
}

export function toOrderItemView(it: OrderItemRow): OrderItemView {
  const rawMods = Array.isArray(it.selected_modifiers) ? it.selected_modifiers : [];
  return {
    id: it.id,
    order_id: it.order_id,
    menu_item_id: it.menu_item_id,
    item_name: it.item_name,
    quantity: it.quantity,
    unit_price: Number(it.unit_price),
    item_total: Number(it.item_total),
    selected_modifiers: rawMods.map((m) => {
      const rec = (m ?? {}) as Record<string, unknown>;
      return {
        group_name: String(rec.group_name ?? ''),
        option_name: String(rec.option_name ?? ''),
        additional_price: Number(rec.additional_price ?? 0),
      };
    }),
  };
}

export function toOrderView(order: OrderRow, items: OrderItemRow[]): OrderView {
  return {
    id: order.id,
    restaurant_id: order.restaurant_id,
    table_id: order.table_id,
    status: order.status,
    total_amount: Number(order.total_amount),
    customer_notes: order.customer_notes,
    created_at: order.created_at,
    updated_at: order.updated_at,
    items: items.map(toOrderItemView).sort((a, b) => a.id.localeCompare(b.id)),
  };
}
