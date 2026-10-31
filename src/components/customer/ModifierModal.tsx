// ════════════════════════════════════════════════════════════════════════════
//  Modifier modal — group-by-group customization with required-group
//  enforcement and live line pricing. Confirmation hands back the exact rows
//  that will be sent to place_order() (ids never prices — server re-prices).
// ════════════════════════════════════════════════════════════════════════════
import { useMemo, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { formatPrice, cn } from '../../lib/utils';
import type { ItemModifierView, MenuItemView } from '../../types/models';

interface ModifierModalProps {
  item: MenuItemView;
  onClose: () => void;
  onConfirm: (modifiers: ItemModifierView[], quantity: number) => void;
}

export function ModifierModal({ item, onClose, onConfirm }: ModifierModalProps) {
  const grouped = useMemo(() => {
    const groups = new Map<string, ItemModifierView[]>();
    for (const m of item.modifiers) {
      const list = groups.get(m.group_name) ?? [];
      list.push(m);
      groups.set(m.group_name, list);
    }
    // Required groups first, then original order preserved.
    return [...groups.entries()].sort(
      ([a, listA], [b, listB]) =>
        Number(listB.some((m) => m.is_required)) - Number(listA.some((m) => m.is_required)) ||
        a.localeCompare(b),
    );
  }, [item]);

  const [selected, setSelected] = useState<Map<string, ItemModifierView>>(new Map());
  const [quantity, setQuantity] = useState(1);
  const [needsChoice, setNeedsChoice] = useState<string | null>(null);

  const toggle = (groupId: string, mod: ItemModifierView) => {
    setSelected((prev) => {
      const next = new Map(prev);
      const isMulti = itemsAllowedMultiple(item, groupId);
      if (next.get(groupId)?.id === mod.id) {
        next.delete(groupId);
      } else if (isMulti && next.has(groupId)) {
        next.delete(groupId); // single-choice per group keeps the math honest
        next.set(groupId, mod);
      } else {
        next.set(groupId, mod);
      }
      return next;
    });
    setNeedsChoice(null);
  };

  const chosen = useMemo(() => [...selected.values()], [selected]);
  const unitPrice = item.price + chosen.reduce((sum, m) => sum + m.additional_price, 0);
  const total = unitPrice * quantity;

  const missing = useMemo(() => {
    for (const [, mods] of grouped) {
      const required = mods.find((m) => m.is_required);
      if (required && !selected.has(required.group_name)) return required.group_name;
    }
    return null;
  }, [grouped, selected]);

  const confirm = () => {
    if (missing) {
      setNeedsChoice(missing);
      return;
    }
    onConfirm(chosen, quantity);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={item.name}
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-stone-200">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="text-lg font-bold text-stone-600 hover:text-emerald-700"
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="w-5 text-center text-sm font-bold text-stone-900">{quantity}</span>
            <button
              onClick={() => setQuantity((q) => Math.min(20, q + 1))}
              className="text-lg font-bold text-stone-600 hover:text-emerald-700"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
          <Button onClick={confirm} size="lg" className="flex-1">
            {missing ? `Choose ${missing}` : 'Add'} · {formatPrice(total)}
          </Button>
        </div>
      }
    >
      <div className="space-y-5 px-5 pb-5 pt-4">
        {item.description && <p className="text-sm text-stone-500">{item.description}</p>}

        {grouped.map(([groupName, mods]) => {
          const chosenOne = selected.get(groupName);
          const isMissing = needsChoice === groupName;
          return (
            <fieldset key={groupName} className={cn(isMissing && 'rounded-xl ring-2 ring-amber-300')}>
              <legend className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-bold uppercase tracking-wide text-stone-600">
                {groupName}
                {mods.some((m) => m.is_required) && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                    Required
                  </span>
                )}
              </legend>
              <div className="grid gap-1.5">
                {mods.map((mod) => (
                  <button
                    key={mod.id}
                    onClick={() => toggle(groupName, mod)}
                    role="checkbox"
                    aria-checked={chosenOne?.id === mod.id}
                    className={cn(
                      'flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm ring-1 transition',
                      chosenOne?.id === mod.id
                        ? 'bg-emerald-50 font-semibold text-emerald-900 ring-emerald-500'
                        : 'bg-stone-50 text-stone-700 ring-stone-200 hover:ring-emerald-300',
                    )}
                  >
                    <span>{mod.option_name}</span>
                    <span className={cn('text-xs font-bold', mod.additional_price > 0 ? 'text-emerald-700' : 'text-stone-400')}>
                      {mod.additional_price > 0 ? `+${formatPrice(mod.additional_price)}` : 'Free'}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>
    </Modal>
  );
}

// Groups named "Extras"/"Add-ons" are visually single-select here to keep the
// demo flow simple; the RPC accepts any set of ids, so multi-select is a
// one-line change (toggle without delete above).
function itemsAllowedMultiple(_item: MenuItemView, _groupId: string): boolean {
  return false;
}

export default ModifierModal;
