// ════════════════════════════════════════════════════════════════════════════
//  KDSBoard — three FIFO columns (pending / preparing / ready), completed
//  strip, sound toggle, live indicator and unclaimed-count header.
//  No polling: state arrives via useRealtimeOrders (see that file for the
//  connection-budget guarantees).
// ════════════════════════════════════════════════════════════════════════════
import { useMemo } from 'react';
import OrderTicket from './OrderTicket';
import { LiveBadge } from '../ui/misc';
import { cn } from '../../lib/utils';
import type { OrderStatus } from '../../types/database';
import type { OrderView, RealtimeStatus } from '../../types/models';

interface KDSBoardProps {
  orders: OrderView[];
  status: RealtimeStatus;
  tableNames: Record<string, string | null>;
  muted: boolean;
  onToggleMute: () => void;
  onSetStatus: (orderId: string, status: OrderStatus) => void;
}

const COLUMNS: Array<{ key: OrderStatus; title: string; accent: string }> = [
  { key: 'pending', title: 'New orders', accent: 'bg-amber-400' },
  { key: 'preparing', title: 'In kitchen', accent: 'bg-sky-400' },
  { key: 'ready', title: 'Ready to serve', accent: 'bg-emerald-400' },
];

export function KDSBoard({ orders, status, tableNames, muted, onToggleMute, onSetStatus }: KDSBoardProps) {
  const byStatus = useMemo(() => {
    const map: Record<OrderStatus, OrderView[]> = {
      pending: [], preparing: [], ready: [], completed: [], cancelled: [],
    };
    for (const o of orders) {
      if (o.status in map) map[o.status].push(o);
    }
    // FIFO: oldest first within each column.
    for (const list of Object.values(map)) list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return map;
  }, [orders]);

  return (
    <div className="min-h-screen bg-stone-100">
      {/* Header */}
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-white/90 px-4 py-3 backdrop-blur">
        <div>
          <h1 className="text-base font-black tracking-tight text-stone-900">Kitchen Display</h1>
          <p className="text-[11px] font-semibold text-stone-400">
            {byStatus.pending.length} new · {byStatus.preparing.length} cooking · {byStatus.ready.length} ready
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LiveBadge status={status} />
          <button
            onClick={onToggleMute}
            aria-pressed={!muted}
            title={muted ? 'Unmute chime' : 'Mute chime'}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition',
              muted ? 'bg-stone-100 text-stone-500 ring-stone-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200',
            )}
          >
            {muted ? '🔇 Muted' : '🔔 Chime on'}
          </button>
        </div>
      </header>

      {/* Columns */}
      <div className="grid gap-3 p-3 lg:grid-cols-3">
        {COLUMNS.map(({ key, title, accent }) => (
          <section key={key} aria-label={title} className="min-w-0">
            <div className="mb-2 flex items-center gap-2 px-1">
              <span className={cn('h-2 w-2 rounded-full', accent)} aria-hidden />
              <h2 className="text-xs font-black uppercase tracking-widest text-stone-500">
                {title} ({byStatus[key].length})
              </h2>
            </div>
            <div className="space-y-2.5">
              {byStatus[key].length === 0 && (
                <div className="rounded-2xl border border-dashed border-stone-300 px-4 py-8 text-center text-xs font-semibold text-stone-400">
                  Nothing here — nice.
                </div>
              )}
              {byStatus[key].map((order) => (
                <OrderTicket
                  key={order.id}
                  order={order}
                  tableNumber={order.table_id ? tableNames[order.table_id] ?? null : null}
                  onSetStatus={(s) => onSetStatus(order.id, s)}
                  onCancel={() => onSetStatus(order.id, 'cancelled')}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Completed today strip */}
      {byStatus.completed.length > 0 && (
        <footer className="px-3 pb-6">
          <h2 className="mb-1.5 px-1 text-[11px] font-black uppercase tracking-widest text-stone-400">
            Recently completed ({byStatus.completed.length})
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {byStatus.completed.slice(0, 12).map((o) => (
              <span key={o.id} className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-stone-500 ring-1 ring-stone-200">
                T{tableNames[o.table_id ?? ''] ?? '?'} · #{o.id.slice(0, 5).toUpperCase()}
              </span>
            ))}
          </div>
        </footer>
      )}
    </div>
  );
}

export default KDSBoard;
