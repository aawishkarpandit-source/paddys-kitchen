// ════════════════════════════════════════════════════════════════════════════
//  OrderTicket — one kitchen ticket. Age timer re-renders on a 15s tick
//  (a shared interval, not per-ticket one — cheap).
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { formatPrice, timeOf, minutesSince, cn } from '../../lib/utils';
import type { OrderStatus } from '../../types/database';
import type { OrderView } from '../../types/models';

/** Shared wall-clock for ticket ages — one interval for all mounted tickets. */
function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

const NEXT_STATUS: Partial<Record<OrderStatus, { next: OrderStatus; label: string; variant: 'primary' | 'success' }>> = {
  pending: { next: 'preparing', label: 'Start cooking', variant: 'primary' },
  preparing: { next: 'ready', label: 'Mark ready', variant: 'success' },
  ready: { next: 'completed', label: 'Picked up ✓', variant: 'success' },
};

interface OrderTicketProps {
  order: OrderView;
  tableNumber: string | null;
  onSetStatus: (status: OrderStatus) => void;
  onCancel: () => void;
}

export function OrderTicket({ order, tableNumber, onSetStatus, onCancel }: OrderTicketProps) {
  const now = useNow();
  const mins = minutesSince(order.created_at, now);
  const late = mins >= 15 && (order.status === 'pending' || order.status === 'preparing');
  const advancement = NEXT_STATUS[order.status];

  return (
    <article
      className={cn(
        'flex flex-col rounded-2xl bg-white p-4 shadow-sm ring-1 transition',
        late ? 'ring-2 ring-red-400' : 'ring-stone-200/70',
      )}
      aria-label={`Order ${order.id}, ${order.status}, ${mins} minutes old`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 text-base font-black',
              late ? 'bg-red-100 text-red-700' : 'bg-stone-900 text-white',
            )}
          >
            {tableNumber ?? '—'}
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-stone-400">
              #{order.id.slice(0, 5).toUpperCase()}
            </p>
            <p className={cn('text-[11px] font-bold', late ? 'text-red-600' : 'text-stone-400')}>
              {timeOf(order.created_at)} · {mins}m {late ? '⚠ LATE' : 'in queue'}
            </p>
          </div>
        </div>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider',
            order.status === 'pending' && 'bg-amber-100 text-amber-900',
            order.status === 'preparing' && 'bg-sky-100 text-sky-900',
            order.status === 'ready' && 'bg-emerald-100 text-emerald-900',
            order.status === 'completed' && 'bg-stone-100 text-stone-500',
            order.status === 'cancelled' && 'bg-red-100 text-red-700',
          )}
        >
          {order.status}
        </span>
      </div>

      {/* Lines */}
      <ul className="mt-3 space-y-1.5 border-t border-dashed border-stone-200 pt-3">
        {order.items.map((item) => (
          <li key={item.id}>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm text-stone-900">
                <strong className="font-black">{item.quantity}×</strong> {item.item_name}
              </p>
              <span className="text-xs font-semibold text-stone-400">{formatPrice(item.item_total)}</span>
            </div>
            {item.selected_modifiers.length > 0 && (
              <p className="text-[11px] font-semibold text-emerald-700">
                → {item.selected_modifiers.map((m) => `${m.option_name}${m.additional_price ? ` (+${formatPrice(m.additional_price)})` : ''}`).join(' · ')}
              </p>
            )}
          </li>
        ))}
      </ul>

      {order.customer_notes && (
        <p className="mt-2.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 ring-1 ring-amber-200">
          📝 {order.customer_notes}
        </p>
      )}

      <p className="mt-2 text-right text-xs font-bold text-stone-500">Total {formatPrice(order.total_amount)}</p>

      {/* Actions */}
      <div className="mt-3 flex items-center gap-2">
        {advancement && (
          <Button onClick={() => onSetStatus(advancement.next)} variant={advancement.variant} className="flex-1">
            {advancement.label}
          </Button>
        )}
        {order.status === 'ready' && (
          <Button onClick={() => onSetStatus('completed')} variant="success" className="flex-1">
            Picked up ✓
          </Button>
        )}
        {(order.status === 'pending' || order.status === 'preparing') && (
          <Button onClick={onCancel} variant="ghost" size="md" className="text-red-600 hover:bg-red-50">
            Void
          </Button>
        )}
      </div>
    </article>
  );
}

export default OrderTicket;
