// ════════════════════════════════════════════════════════════════════════════
//  MenuManager — the "86 board". Category filter, availability toggles with
//  optimistic UI + rollback, inline search, and the item editor modal.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react';
import Button from '../ui/Button';
import { Badge, EmptyState, Spinner } from '../ui/misc';
import MenuItemFormModal from './MenuItemFormModal';
import useRestaurantMenu from '../../hooks/useRestaurantMenu';
import { toggleMenuItemAvailability } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { formatPrice, cn } from '../../lib/utils';
import type { CategoryRow, ItemModifierRow } from '../../types/database';
import type { MenuItemView } from '../../types/models';

interface MenuManagerProps {
  restaurantId: string;
}

export function MenuManager({ restaurantId }: MenuManagerProps) {
  const menu = useRestaurantMenu(restaurantId);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<MenuItemView | null>(null);
  const [creating, setCreating] = useState(false);
  // Raw modifier rows for the editor (the flattened view types hide ids).
  const [modifierRows, setModifierRows] = useState<ItemModifierRow[]>([]);

  const categoryRows = useMemo<CategoryRow[]>(
    () =>
      menu.categories.map((c) => ({
        id: c.id,
        restaurant_id: c.restaurant_id,
        name: c.name,
        display_order: c.display_order,
        created_at: '',
      })),
    [menu.categories],
  );

  // Raw modifier rows for the editor need real table ids (view types fold the
  // relation away), so re-pull them alongside the menu refetch (cheap + indexed).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('item_modifiers')
        .select('*')
        .in('menu_item_id', menu.items.length > 0 ? menu.items.map((i) => i.id) : ['-none-']);
      if (!cancelled && data) setModifierRows(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [menu.items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return menu.items
      .filter((item) => (categoryFilter === 'all' ? true : item.category_id === categoryFilter))
      .filter((item) => (q ? item.name.toLowerCase().includes(q) : true))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [menu.items, query, categoryFilter]);

  const onToggle = async (item: MenuItemView): Promise<void> => {
    setSavingId(item.id);
    const next = !item.is_available;
    try {
      await toggleMenuItemAvailability(item.id, next);
      menu.refetch();
    } finally {
      setSavingId(null);
    }
  };

  if (menu.loading && menu.categories.length === 0) {
    return (
      <div className="flex justify-center py-16 text-stone-400">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (menu.error) {
    return (
      <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200">
        {menu.error}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find item…"
          className="min-w-40 flex-1 rounded-xl bg-white px-3.5 py-2 text-sm ring-1 ring-stone-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-stone-700 ring-1 ring-stone-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="all">All categories</option>
          {categoryRows.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <Button onClick={() => setCreating(true)}>+ New item</Button>
      </div>

      {/* Availability stats */}
      <div className="flex flex-wrap gap-1.5">
        <Badge tone="green">{menu.items.filter((i) => i.is_available).length} on menu</Badge>
        <Badge tone="red">{menu.items.filter((i) => !i.is_available).length} 86'd</Badge>
        <Badge tone="slate">{menu.items.length} total</Badge>
      </div>

      {/* Item list */}
      {filtered.length === 0 ? (
        <EmptyState title="No items here" subtitle="Create your first menu item or adjust the filters." />
      ) : (
        <ul className="grid gap-2">
          {filtered.map((item) => (
            <li
              key={item.id}
              className={cn(
                'flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1',
                item.is_available ? 'ring-stone-200/70' : 'ring-red-200 bg-red-50/40',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className={cn('truncate text-sm font-bold', item.is_available ? 'text-stone-900' : 'text-stone-400 line-through')}>
                    {item.name}
                  </h4>
                  <span className="shrink-0 text-xs font-extrabold text-emerald-700">{formatPrice(item.price)}</span>
                </div>
                <p className="truncate text-[11px] text-stone-400">
                  {categoryRows.find((c) => c.id === item.category_id)?.name ?? '—'}
                  {item.modifiers.length > 0 ? ` · ${item.modifiers.length} options` : ''}
                </p>
              </div>

              {/* 86 toggle */}
              <button
                onClick={() => onToggle(item)}
                disabled={savingId === item.id}
                className={cn(
                  'relative h-7 w-12 shrink-0 rounded-full p-1 transition-colors',
                  item.is_available ? 'bg-emerald-500' : 'bg-stone-300',
                )}
                aria-pressed={item.is_available}
                title={item.is_available ? 'Served — tap to 86' : "86'd — tap to restore"}
              >
                <span
                  className={cn(
                    'block h-5 w-5 rounded-full bg-white shadow transition-transform',
                    item.is_available ? 'translate-x-5' : 'translate-x-0',
                  )}
                />
              </button>

              <Button size="sm" variant="secondary" onClick={() => setEditing(item)}>
                Edit
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* Editors */}
      {(editing || creating) && (
        <MenuItemFormModal
          item={editing}
          restaurantId={restaurantId}
          categories={categoryRows}
          modifierRows={modifierRows}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={menu.refetch}
        />
      )}
    </div>
  );
}

export default MenuManager;
