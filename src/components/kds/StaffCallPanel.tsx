// ════════════════════════════════════════════════════════════════════════════
//  StaffCallPanel — "👋 table 4 needs help" / "bill please" queue with a
//  chime, resolved history, and one-tap resolve.
// ════════════════════════════════════════════════════════════════════════════
import { relativeTime } from '../../lib/utils';
import { LiveBadge } from '../ui/misc';
import type { StaffCallRow } from '../../types/database';
import type { RealtimeStatus } from '../../types/models';

interface StaffCallPanelProps {
  calls: StaffCallRow[];
  status: RealtimeStatus;
  tableNames: Record<string, string | null>;
  onResolve: (callId: string) => void;
}

export function StaffCallPanel({ calls, status, tableNames, onResolve }: StaffCallPanelProps) {
  const pending = calls.filter((c) => c.status === 'pending');
  const resolved = calls.filter((c) => c.status === 'resolved').slice(0, 8);

  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest text-stone-500">Guest calls</h2>
          <p className="text-[11px] font-semibold text-stone-400">
            {pending.length > 0 ? `${pending.length} waiting` : 'All quiet'}
          </p>
        </div>
        <LiveBadge status={status} />
      </div>

      {pending.length === 0 ? (
        <p className="mt-3 rounded-xl bg-stone-50 px-4 py-3 text-xs font-semibold text-stone-400">
          ☕ No assistance or bill requests right now.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {pending.map((call) => (
            <li
              key={call.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200"
            >
              <div className="min-w-0">
                <p className="text-sm font-black text-amber-900">
                  {call.call_type === 'bill' ? '💷 Table' : '👋 Table'}{' '}
                  {call.table_id ? tableNames[call.table_id] ?? '—' : '—'} needs
                  {call.call_type === 'bill' ? 'the bill' : ' help'}
                </p>
                <p className="text-[11px] font-bold text-amber-700">{relativeTime(call.created_at)} — called</p>
              </div>
              <button
                onClick={() => onResolve(call.id)}
                className="shrink-0 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 active:scale-95"
              >
                Resolve
              </button>
            </li>
          ))}
        </ul>
      )}

      {resolved.length > 0 && (
        <div className="mt-3 border-t border-stone-100 pt-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-stone-300">Recently resolved</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {resolved.map((c) => (
              <span key={c.id} className="rounded-lg bg-stone-50 px-2 py-1 text-[10px] font-bold text-stone-400 ring-1 ring-stone-200">
                T{c.table_id ? tableNames[c.table_id] ?? '?' : '?'} · {relativeTime(c.resolved_at ?? c.created_at)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default StaffCallPanel;
