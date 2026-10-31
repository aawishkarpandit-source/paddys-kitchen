// ════════════════════════════════════════════════════════════════════════════
//  AdminPage — owner/admin hub. Role-gated (owner|admin); staff role lands
//  back at KDS. Tabs: Menu, Tables+QR, Analytics. No realtime listeners here
//  (menus are refetch-on-write; keeps connection budget for KDS/guest pages).
// ════════════════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { useNavigate } from 'react-router';
import MenuManager from '../components/admin/MenuManager';
import TableManager from '../components/admin/TableManager';
import AnalyticsSummary from '../components/admin/AnalyticsSummary';
import StaffLogin from '../components/StaffLogin';
import { Spinner } from '../components/ui/misc';
import useStaffAuth from '../hooks/useStaffAuth';
import { signInStaff, signOutStaff } from '../lib/api';
import { cn } from '../lib/utils';

type Tab = 'menu' | 'tables' | 'analytics';

export function AdminPage() {
  const navigate = useNavigate();
  const auth = useStaffAuth();
  const [tab, setTab] = useState<Tab>('menu');

  if (auth.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100 text-stone-400">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }

  if (!auth.user) {
    return (
      <StaffLogin
        title="Admin hub"
        subtitle="Owner or admin access — you'll land right back here."
        onSignIn={signInStaff}
    />
    );
  }

  if (!auth.identity || auth.identity.role === 'staff') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-stone-100 px-6 text-center">
        <div className="text-4xl" aria-hidden>🔒</div>
        <h1 className="text-lg font-black text-stone-900">Admin access required</h1>
        <p className="max-w-sm text-sm text-stone-500">
          {auth.identity ? 'Your role is "staff" — the KDS is your home.' : 'This account has no restaurant attached yet.'}
        </p>
        <div className="flex gap-2">
          <button onClick={() => navigate('/kds')} className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-bold text-white">
            Go to KDS
          </button>
          <button
            onClick={() => void signOutStaff().catch(() => undefined)}
            className="rounded-xl bg-stone-100 px-4 py-2 text-sm font-bold text-stone-600"
          >
            Switch account
          </button>
        </div>
      </div>
    );
  }

  const restaurantId = auth.identity.restaurantId;

  return (
    <div className="min-h-screen bg-stone-100">
      <header className="border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-emerald-600">
              {auth.identity.restaurantName || 'Paddy\'s Kitchen'} · admin
            </p>
            <h1 className="text-lg font-black tracking-tight text-stone-900">
              {auth.identity.name || 'Admin Hub'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/kds')}
              className="rounded-xl bg-stone-100 px-3 py-2 text-xs font-bold text-stone-600 hover:bg-stone-200"
            >
              KDS
            </button>
            <button
              onClick={() => void signOutStaff().then(() => navigate('/')).catch(() => undefined)}
              className="rounded-xl bg-stone-100 px-3 py-2 text-xs font-bold text-stone-600 hover:bg-stone-200"
            >
              Sign out
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 px-4" role="tablist" aria-label="Admin sections">
          {(
            [
              ['menu', 'Menu & 86'],
              ['tables', 'Tables & QR'],
              ['analytics', 'Analytics'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                'rounded-t-xl px-4 py-2.5 text-sm font-bold transition-colors',
                tab === key ? 'bg-stone-100 text-emerald-700' : 'text-stone-500 hover:text-stone-800',
              )}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-4">
        {tab === 'menu' && <MenuManager restaurantId={restaurantId} />}
        {tab === 'tables' && <TableManager restaurantId={restaurantId} />}
        {tab === 'analytics' && <AnalyticsSummary restaurantId={restaurantId} />}
      </main>
    </div>
  );
}

export default AdminPage;
