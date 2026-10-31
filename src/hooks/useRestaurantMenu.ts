// ════════════════════════════════════════════════════════════════════════════
//  useRestaurantMenu — one request for the whole menu tree.
//  PostgREST FK-embedding: categories → menu_items → item_modifiers in a
//  single round trip (cheapest possible menu load; no realtime listeners).
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react';
import { supabase, isConfigured } from '../lib/supabase';
import { toMenuItemView } from '../lib/mappers';
import type { ItemModifierRow, MenuItemRow } from '../types/database';
import type { CategoryWithItems, MenuItemView } from '../types/models';

interface MenuApiCategory {
  id: string;
  restaurant_id: string;
  name: string;
  display_order: number;
  menu_items: Array<MenuItemRow & { item_modifiers?: ItemModifierRow[] | null }>;
}

export interface RestaurantMenu {
  categories: CategoryWithItems[];
  items: MenuItemView[];
  tables: Array<{ id: string; table_number: string; status: 'active' | 'inactive' }>;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useRestaurantMenu(restaurantId: string | null | undefined): RestaurantMenu {
  const [categories, setCategories] = useState<CategoryWithItems[]>([]);
  const [tables, setTables] = useState<RestaurantMenu['tables']>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!restaurantId || !isConfigured) {
      setCategories([]);
      setError(isConfigured ? null : 'Supabase is not configured (missing .env).');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = async (): Promise<void> => {
      try {
        const [menuRes, tablesRes] = await Promise.all([
          // ── single round trip for the whole tree ─────────────────────────
          supabase
            .from('categories')
            .select(`
              id,
              restaurant_id,
              name,
              display_order,
              menu_items ( * , item_modifiers ( * ) )
            `)
            .eq('restaurant_id', restaurantId)
            .order('display_order', { ascending: true }),
          supabase
            .from('tables')
            .select('id, table_number, status')
            .eq('restaurant_id', restaurantId)
            .order('table_number', { ascending: true }),
        ]);

        if (cancelled) return;
        if (menuRes.error) throw menuRes.error;
        if (tablesRes.error) throw tablesRes.error;

        const resCategories = ((menuRes.data ?? []) as unknown as MenuApiCategory[]).map((c) => {
          const items = (c.menu_items ?? [])
            .map((row) => {
              const { item_modifiers, ...item } = row;
              return toMenuItemView(item, item_modifiers ?? []);
            })
            .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name));
          return {
            id: c.id,
            restaurant_id: c.restaurant_id,
            name: c.name,
            display_order: c.display_order,
            items,
          };
        });

        setCategories(resCategories);
        setTables(tablesRes.data ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load menu');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [restaurantId, tick]);

  const items = categories.flatMap((c) => c.items);
  return { categories, items, tables, loading, error, refetch };
}

export default useRestaurantMenu;
