// ════════════════════════════════════════════════════════════════════════════
//  OrderTracker — the customer's live ticket(s): status timeline, items,
//  plus "Call staff" / "Request bill" (deduped while one is pending).
//  Data arrives through useRealtimeOrders + useStaffCalls (scoped in MenuPage).
// ════════════════════════════════════════════════════════════════════════════
import { formatPrice, relativeTime } from '../../lib/utils';
import { Badge, EmptyState, StatusChip } from '../ui/misc';
import type { OrderView } from '../../types/models';
import type { CallType, StaffCallRow } from '../../types/database';

interface OrderTrackerProps {
  orders: OrderView[];
  calls: StaffCallRow[];
  onStaffCall: (type: CallType) => void;
  calling: boolean;
  error: string | null;
}

const STEP_ORDER = ['pending', 'preparing', 'ready', 'completed'] as const;

function Timeline({ status }: { status: OrderView['status'] }) {
  if (status === 'cancelled') {
    return <p className="mt-2 text-xs font-semibold text-red-600">This order was cancelled — ask staff if that's wrong.</p>;
  }
  const activeIndex = STEP_ORDER.indexOf(status as (typeof STEP_ORDER)[number]);
  return (
    <ol className="mt-3 flex items-center gap-1.5" aria-label="Order progress">
      {STEP_ORDER.map((step, i) => (
        <li key={step} className="flex flex-1 flex-col items-center gap-1">
          <span
            className={
              i < activeIndex
                ? 'h-1.5 w-full rounded-full bg-emerald-500'
                : i === activeIndex
                  ? 'h-1.5 w-full animate-pulse rounded-full bg-emerald-600'
                  : 'h-1.5 w-full rounded-full bg-stone-200'
            }
          />
          <span className={i <= activeIndex ? 'text-[9px] font-bold uppercase text-emerald-700' : 'text-[9px] font-bold uppercase text-stone-300'}>
            {step === 'pending' ? 'Received' : step === 'preparing' ? 'Cooking' : step === 'ready' ? 'Ready' : 'Done'}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function OrderTracker({ orders, calls, onStaffCall, calling, error }: OrderTrackerProps) {
  const pendingCall = calls.find((c) => c.status === 'pending');

  if (orders.length === 0 && !pendingCall) {
    return (
      <EmptyState
        icon="🧾"
        title="No orders yet"
        subtitle="Your placed orders will appear here with live kitchen updates."
      />
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          {error}
        </p>
      )}

      {pendingCall && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">
          <span className="animate-bounce text-base" aria-hidden>👋</span>
          Staff called ({pendingCall.call_type === 'bill' ? 'bill' : 'assistance'}) — already on the way.
        </div>
      )}

      {orders.map((order) => (
        <article key={order.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70">
          <div className="flex items-center justify-between gap-2">
            <StatusChip status={order.status} />
            <span className="text-[11px] font-semibold text-stone-400">{relativeTime(order.created_at)}</span>
          </div>

          <h3 className="mt-2 text-sm font-black uppercase tracking-widest text-stone-400">
            Order #{order.id.slice(0, 5).toUpperCase()}
          </h3>

          <ul className="mt-1.5 space-y-1">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-baseline justify-between gap-2 text-sm text-stone-700">
                <span>
                  <strong className="font-bold">{item.quantity}×</strong> {item.item_name}
                  {item.selected_modifiers.length > 0 && (
                    <span className="text-xs text-stone-500">
                      {' '}
                      · {item.selected_modifiers.map((m) => m.option_name).join(', ')}
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-semibold">{formatPrice(item.item_total)}</span>
              </li>
            ))}
          </ul>

          {order.customer_notes && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-800 ring-1 ring-amber-100">
              📝 {order.customer_notes}
            </p>
          )}

          <div className="mt-2 flex items-center justify-between">
            <Badge tone="white">Total {formatPrice(order.total_amount)}</Badge>
          </div>
          <Timeline status={order.status} />
        </article>
      ))}

      {/* Call staff */}
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70">
        <h4 className="text-xs font-black uppercase tracking-widest text-stone-400">Need something?</h4>
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <button
            onClick={() => onStaffCall('assistance')}
            disabled={calling || !!pendingCall}
            className="rounded-xl bg-stone-100 py-3 text-sm font-bold text-stone-800 ring-1 ring-stone-200 transition hover:bg-stone-200 disabled:opacity-50 active:scale-[0.98]"
          >
            👋 Call staff
          </button>
          <button
            onClick={() => onStaffCall('bill')}
            disabled={calling || !!pendingCall}
            className="rounded-xl bg-stone-900 py-3 text-sm font-bold text-white transition hover:bg-stone-700 disabled:opacity-50 active:scale-[0.98]"
          >
            💶 Request bill
          </button>
        </div>
      </div>
    </div>
  );
}

export default OrderTracker;
