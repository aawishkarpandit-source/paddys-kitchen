// ════════════════════════════════════════════════════════════════════════════
//  AnalyticsSummary — ad-hoc numbers for the admin hub. Computed client-side
//  from one bounded query (lib/analytics.ts); no SQL views, no RPC, no extra
//  connections — the whole feature costs one lazily-fetched snapshot.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { Spinner } from '../ui/misc';
import { loadLocationStats, type LocationStats } from '../../lib/analytics';
import { formatPrice } from '../../lib/utils';

interface AnalyticsSummaryProps {
  restaurantId: string;
}

export function AnalyticsSummary({ restaurantId }: AnalyticsSummaryProps) {
  const [stats, setStats] = useState<LocationStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadLocationStats(restaurantId)
      .then((s) => {
        if (!cancelled) {
          setStats(s);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load analytics');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  if (loading) {
    return <div className="flex justify-center py-12 text-stone-400"><Spinner className="h-6 w-6" /></div>;
  }
  if (error || !stats) {
    return <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200">{error ?? 'No data'}</div>;
  }

  const weeklyMax = Math.max(1, ...stats.weekly.map((d) => d.revenue));

  return (
    <div className="space-y-3">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Kpi label="Orders today" value={stats.todayOrders.toString()} icon="🧾" />
        <Kpi label="Revenue today" value={formatPrice(stats.todayRevenue)} icon="💶" />
        <Kpi label="Average order" value={formatPrice(stats.avgOrderValue)} icon="🧮" />
        <Kpi label="Live now" value={`${stats.byStatus.pending + stats.byStatus.preparing + stats.byStatus.ready}`} icon="⏱️" />
      </div>

      {/* Funnel */}
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70">
        <h3 className="text-[11px] font-black uppercase tracking-widest text-stone-400">Status breakdown (last {stats.totalOrders} orders)</h3>
        <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-stone-100">
          {(
            [
              ['completed', 'bg-emerald-500'],
              ['ready', 'bg-emerald-300'],
              ['preparing', 'bg-sky-400'],
              ['pending', 'bg-amber-400'],
              ['cancelled', 'bg-red-400'],
            ] as const
          ).map(([status, color]) => {
            const share = stats.byStatus[status] / Math.max(1, stats.totalOrders);
            return share > 0 ? <span key={status} className={color} style={{ width: `${share * 100}%` }} title={`${status}: ${stats.byStatus[status]}`} /> : null;
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-stone-500">
          <span>🟠 Received {stats.byStatus.pending}</span>
          <span>🔵 Cooking {stats.byStatus.preparing}</span>
          <span>🟢 Ready {stats.byStatus.ready}</span>
          <span>✅ Completed {stats.byStatus.completed}</span>
          <span>✖️ Cancelled {stats.byStatus.cancelled}</span>
        </div>
      </div>

      {/* Weekly bars */}
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70">
        <h3 className="text-[11px] font-black uppercase tracking-widest text-stone-400">Last 7 days (revenue)</h3>
        <div className="mt-3 flex items-end gap-2">
          {stats.weekly.map((d) => (
            <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-24 w-full items-end rounded-lg bg-stone-50">
                <div
                  className="w-full rounded-lg bg-emerald-500/85 transition-all"
                  style={{ height: `${Math.max(4, (d.revenue / weeklyMax) * 100)}%` }}
                  title={`${d.day}: ${formatPrice(d.revenue)} · ${d.orders} orders`}
                />
              </div>
              <span className="text-[9px] font-bold text-stone-400">{d.day.slice(5)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top items */}
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70">
        <h3 className="text-[11px] font-black uppercase tracking-widest text-stone-400">Best sellers</h3>
        {stats.topItems.length === 0 ? (
          <p className="mt-2 text-xs text-stone-400">Not enough orders yet.</p>
        ) : (
          <ol className="mt-2 space-y-1.5">
            {stats.topItems.map((item, i) => (
              <li key={item.name} className="flex items-center gap-3 text-sm">
                <span className="text-xs font-black text-stone-300">{i + 1}.</span>
                <span className="min-w-0 flex-1 truncate font-semibold text-stone-700">{item.name}</span>
                <span className="text-xs font-bold text-stone-400">{item.quantity}×</span>
                <span className="text-xs font-extrabold text-emerald-700">{formatPrice(item.revenue)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-stone-200/70">
      <span className="text-2xl" aria-hidden>{icon}</span>
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">{label}</p>
        <p className="text-lg font-black text-stone-900">{value}</p>
      </div>
    </div>
  );
}

export default AnalyticsSummary;
