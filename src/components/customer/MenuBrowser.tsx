// ════════════════════════════════════════════════════════════════════════════
//  MenuBrowser — search, category pills, item grid. Owns the shared
//  ModifierModal (one instance, not one per card) and normalizes its
//  selection back into `MenuItemLike` for the cart.
// ════════════════════════════════════════════════════════════════════════════
import { useMemo, useState } from 'react';
import MenuItemCard from './MenuItemCard';
import ModifierModal from './ModifierModal';
import { EmptyState } from '../ui/misc';
import type { CartLine, CategoryWithItems, ItemModifierView, MenuItemView } from '../../types/models';

/** What MenuPage receives per "add" — cart builds its line key from it. */
export interface AddPayload {
  item: MenuItemView;
  modifiers: ItemModifierView[];
  quantity: number;
}

interface MenuBrowserProps {
  categories: CategoryWithItems[];
  onAdd: (payload: AddPayload) => void;
}

export function MenuBrowser({ categories, onAdd }: MenuBrowserProps) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [customizing, setCustomizing] = useState<MenuItemView | null>(null);

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pick = (items: MenuItemView[]) =>
      q
        ? items.filter(
            (i) =>
              i.name.toLowerCase().includes(q) ||
              i.description?.toLowerCase().includes(q) ||
              i.dietary_tags.some((t) => t.includes(q)),
          )
        : items;
    if (activeCategory === 'all') {
      return categories.flatMap((c) => pick(c.items));
    }
    const category = categories.find((c) => c.id === activeCategory);
    return category ? pick(category.items) : [];
  }, [categories, query, activeCategory]);

  const handleAdd = (payload: AddPayload) => {
    setCustomizing(null);
    onAdd(payload);
  };

  if (categories.length === 0) {
    return <EmptyState title="Menu is being prepped" subtitle="No items published yet — check back soon." />;
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the menu…"
          className="w-full rounded-xl border-0 bg-white py-2.5 pl-10 pr-4 text-sm text-stone-800 ring-1 ring-stone-200 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          aria-label="Search menu"
        />
      </div>

      {/* Category pills */}
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 scrollbar-none">
        <Pill active={activeCategory === 'all'} onClick={() => setActiveCategory('all')}>
          All
        </Pill>
        {categories.map((c) => (
          <Pill key={c.id} active={activeCategory === c.id} onClick={() => setActiveCategory(c.id)}>
            {c.name}
          </Pill>
        ))}
      </div>

      {/* Grid */}
      {visibleItems.length === 0 ? (
        <EmptyState icon="🔎" title="Nothing matches" subtitle="Try a different search or category." />
      ) : (
        <div className="grid gap-2.5">
          {visibleItems.map((item) => (
            <MenuItemCard
              key={item.id}
              item={item}
              onSelect={(it) =>
                it.modifiers.length > 0 ? setCustomizing(it) : handleAdd({ item: it, modifiers: [], quantity: 1 })
              }
            />
          ))}
        </div>
      )}

      {customizing && (
        <ModifierModal
          item={customizing}
          onClose={() => setCustomizing(null)}
          onConfirm={(modifiers, quantity) => handleAdd({ item: customizing, modifiers, quantity })}
        />
      )}
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: MultiProps) {
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={
        active
          ? 'shrink-0 whitespace-nowrap rounded-full bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm'
          : 'shrink-0 whitespace-nowrap rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-stone-600 ring-1 ring-stone-200 hover:ring-emerald-300'
      }
    >
      {children}
    </button>
  );
}

interface MultiProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

export default MenuBrowser;
