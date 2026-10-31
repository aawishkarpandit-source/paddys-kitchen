// ════════════════════════════════════════════════════════════════════════════
//  CartSheet — sticky bar + expandable review sheet. Totals are display-only:
//  the server recomputes everything inside place_order() before writing.
// ════════════════════════════════════════════════════════════════════════════
import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { Spinner } from '../ui/misc';
import { formatPrice, cn } from '../../lib/utils';
import type { CartLine } from '../../types/models';

export interface CartTotals {
  itemCount: number;
  total: number;
}

export function cartTotals(lines: CartLine[], currency = 'EUR'): CartTotals {
  let total = 0;
  let itemCount = 0;
  for (const line of lines) {
    const unit = line.menuItem.price + line.modifiers.reduce((s, m) => s + m.additional_price, 0);
    total += unit * line.quantity;
    itemCount += line.quantity;
  }
  void currency; // total is formatted by the caller
  return { itemCount, total };
}

interface CartSheetProps {
  lines: CartLine[];
  onChangeQuantity: (key: string, quantity: number) => void;
  onRemove: (key: string) => void;
  onPlaceOrder: (notes: string) => void;
  placing: boolean;
  error: string | null;
  onClose: () => void;
}

export function CartSheet({ lines, onChangeQuantity, onRemove, onPlaceOrder, placing, error, onClose }: CartSheetProps) {
  const [notes, setNotes] = useState('');
  const totals = cartTotals(lines);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Your order · ${totals.itemCount} item${totals.itemCount === 1 ? '' : 's'}`}
      footer={
        <div className="space-y-2">
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              {error}
            </p>
          )}
          <Button block size="lg" onClick={() => onPlaceOrder(notes)} disabled={placing || lines.length === 0}>
            {placing ? <Spinner className="h-4 w-4" /> : null}
            {placing ? 'Sending to kitchen…' : `Send order · ${formatPrice(totals.total)}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-2 px-5 py-4">
        {lines.map((line) => {
          const unit = line.menuItem.price + line.modifiers.reduce((s, m) => s + m.additional_price, 0);
          return (
            <div key={line.key} className="flex items-start gap-3 rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200/70">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <h4 className="text-sm font-bold text-stone-900">{line.menuItem.name}</h4>
                  <span className="text-sm font-extrabold text-emerald-700">{formatPrice(unit * line.quantity)}</span>
                </div>
                {line.modifiers.map((m) => (
                  <p key={m.id} className="text-xs text-stone-500">
                    + {m.option_name}
                    {m.additional_price > 0 ? ` (${formatPrice(m.additional_price)})` : ''}
                  </p>
                ))}
                <div className="mt-2 flex items-center gap-2">
                  <Stepper
                    quantity={line.quantity}
                    onDecrement={() => onChangeQuantity(line.key, line.quantity - 1)}
                    onIncrement={() => onChangeQuantity(line.key, line.quantity + 1)}
                  />
                  <button
                    onClick={() => onRemove(line.key)}
                    className="text-[11px] font-semibold text-stone-400 hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        <div className="pt-2">
          <label htmlFor="order-notes" className="text-[11px] font-bold uppercase tracking-widest text-stone-400">
            Kitchen notes (optional)
          </label>
          <textarea
            id="order-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="No onions, mild for kids, cut in half…"
            className="mt-1 w-full rounded-xl bg-stone-50 p-3 text-sm text-stone-800 ring-1 ring-stone-200 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center justify-between border-t border-stone-100 pt-3 text-sm font-bold text-stone-900">
          <span>Total</span>
          <span>{formatPrice(totals.total)}</span>
        </div>
        <p className="text-[11px] text-stone-400">Pay at the counter or when staff bring the bill.</p>
      </div>
    </Modal>
  );
}

function Stepper({ quantity, onDecrement, onIncrement }: { quantity: number; onDecrement: () => void; onIncrement: () => void }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-white px-2 py-1 ring-1 ring-stone-200">
      <button onClick={onDecrement} className="px-1 text-base font-bold text-stone-500 hover:text-emerald-700" aria-label="Decrease">
        −
      </button>
      <span className={cn('min-w-4 text-center text-sm font-bold', quantity > 1 ? 'text-stone-900' : 'text-red-600')}>
        {quantity}
      </span>
      <button onClick={onIncrement} className="px-1 text-base font-bold text-stone-500 hover:text-emerald-700" aria-label="Increase">
        +
      </button>
    </div>
  );
}

/** Collapsed sticky bar shown while browsing (opens CartSheet on click). */
export function CartBar({ lines, onOpen }: { lines: CartLine[]; onOpen: () => void }) {
  if (lines.length === 0) return null;
  const totals = cartTotals(lines);
  return (
    <div className="pointer-events-auto w-full px-4 pb-4">
      <button
        onClick={onOpen}
        className="mx-auto flex w-full max-w-md items-center justify-between rounded-2xl bg-emerald-600 px-5 py-3.5 text-white shadow-xl shadow-emerald-900/20 transition hover:bg-emerald-700 active:scale-[0.99]"
      >
        <span className="flex items-center gap-2 text-sm font-bold">
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white/20 px-1 text-xs font-black">
            {totals.itemCount}
          </span>
          View cart
        </span>
        <span className="text-sm font-extrabold">{formatPrice(totals.total)}</span>
      </button>
    </div>
  );
}

export default CartSheet;
