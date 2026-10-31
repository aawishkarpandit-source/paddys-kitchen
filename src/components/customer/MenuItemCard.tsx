// ════════════════════════════════════════════════════════════════════════════
//  Menu item card. Images are external URLs (Unsplash) — zero Storage usage;
//  broken/missing images degrade to a clean placeholder (no layout shift).
// ════════════════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { formatPrice, cn } from '../../lib/utils';
import type { MenuItemView } from '../../types/models';

const TAG_EMOJI: Record<string, string> = {
  vegetarian: '🌱',
  vegan: '🌿',
  'gluten-free': '🌾',
};

interface MenuItemCardProps {
  item: MenuItemView;
  onSelect: (item: MenuItemView) => void;
}

export function MenuItemCard({ item, onSelect }: MenuItemCardProps) {
  const [imgBroken, setImgBroken] = useState(false);
  const soldOut = !item.is_available;

  return (
    <button
      onClick={() => !soldOut && onSelect(item)}
      disabled={soldOut}
      className={cn(
        'group flex w-full gap-3 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-stone-200/70 transition',
        soldOut ? 'opacity-60' : 'hover:shadow-md hover:ring-emerald-300 active:scale-[0.99]',
      )}
      aria-label={soldOut ? `${item.name} (sold out)` : `Add ${item.name}`}
    >
      {/* Image */}
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-stone-100">
        {item.image_url && !imgBroken ? (
          <img
            src={item.image_url}
            alt={item.name}
            loading="lazy"
            onError={() => setImgBroken(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100 text-2xl" aria-hidden>
            🍴
          </div>
        )}
        {soldOut && (
          <span className="absolute inset-0 flex items-center justify-center bg-stone-900/55 text-[10px] font-black uppercase tracking-widest text-white">
            Sold out
          </span>
        )}
      </div>

      {/* Text */}
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-sm font-bold text-stone-900">{item.name}</h3>
            <span className="shrink-0 text-sm font-extrabold text-emerald-700">
              {formatPrice(item.price)}
            </span>
          </div>
          {item.description && (
            <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-stone-500">{item.description}</p>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {item.dietary_tags.map((tag) => (
            <span
              key={tag}
              title={tag}
              className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600"
            >
              {TAG_EMOJI[tag] ?? '•'} {tag}
            </span>
          ))}
          {item.modifiers.length > 0 && !soldOut && (
            <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
              Customizable
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export default MenuItemCard;
