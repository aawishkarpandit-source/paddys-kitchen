// ════════════════════════════════════════════════════════════════════════════
//  LandingPage — demo landing: pick restaurant + table (simulates a QR),
//  jump into KDS/Admin, and surface setup state when Supabase isn't wired.
//  One optional REST ping (1 row) to verify connectedness when env exists.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { supabase, isConfigured } from '../lib/supabase';

type Connection = 'checking' | 'ok' | 'error' | 'unconfigured';

export function LandingPage() {
  const navigate = useNavigate();
  const [slug, setSlug] = useState('paddys-kitchen');
  const [tableNumber, setTableNumber] = useState('4');
  const [connection, setConnection] = useState<Connection>(() => (isConfigured ? 'checking' : 'unconfigured'));

  useEffect(() => {
    if (!isConfigured) return;
    let cancelled = false;
    void supabase
      .from('restaurants')
      .select('id')
      .limit(1)
      .then(({ error }) => {
        if (!cancelled) setConnection(error ? 'error' : 'ok');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const enter = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '');
    if (!clean) return;
    navigate(`/menu?r=${encodeURIComponent(clean)}&table=${encodeURIComponent(tableNumber.trim() || '1')}`);
  };

  return (
    <div className="min-h-screen bg-stone-950 bg-gradient-to-b from-stone-950 via-emerald-950/40 to-stone-950 text-white">
      <div className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
        {/* Hero */}
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300 ring-1 ring-emerald-500/30">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            {connection === 'ok' && 'Connected to Supabase'}
            {connection === 'checking' && 'Checking connection…'}
            {connection === 'error' && '⚠️ Supabase unreachable — run supabase/schema.sql'}
            {connection === 'unconfigured' && '⚠️ Setup needed — copy .env.example → .env'}
          </span>
          <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-5xl">
            Paddy's Kitchen <span aria-hidden>🍀</span>
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-stone-300 sm:text-base">
            Scan-to-order demo built to run forever on the free tier: multi-tenant SQL with
            RLS, atomic server-priced ordering, realtime KDS, nightly cleanup and keepalive.
          </p>
        </div>

        {/* Manual QR entry */}
        <form
          onSubmit={enter}
          className="mx-auto mt-10 flex max-w-xl flex-col gap-3 rounded-3xl bg-white/5 p-5 ring-1 ring-white/10 backdrop-blur sm:flex-row sm:items-end"
        >
          <label className="flex-1">
            <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-300">Restaurant slug</span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="mt-1 w-full rounded-xl bg-stone-900/80 px-3.5 py-2.5 text-sm text-white ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="paddys-kitchen"
            />
          </label>
          <label className="w-full sm:w-28">
            <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-300">Table</span>
            <input
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
              className="mt-1 w-full rounded-xl bg-stone-900/80 px-3.5 py-2.5 text-sm text-white ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="4"
            />
          </label>
          <button
            type="submit"
            className="h-11 shrink-0 rounded-xl bg-emerald-500 px-5 text-sm font-black text-stone-950 transition hover:bg-emerald-400 active:scale-[0.98]"
          >
            Open menu →
          </button>
        </form>
        <p className="mt-2 text-center text-[11px] text-stone-500">
          This is what a scanned QR does: <code className="text-stone-400">/menu?r=paddys-kitchen&table=4</code>
        </p>

        {/* Entry points */}
        <div className="mx-auto mt-10 grid max-w-xl gap-3 sm:grid-cols-2">
          <button
            onClick={() => navigate('/kds')}
            className="rounded-2xl bg-white/5 p-5 text-left ring-1 ring-white/10 transition hover:bg-white/10"
          >
            <div className="text-2xl" aria-hidden>👨‍🍳</div>
            <h2 className="mt-1.5 text-sm font-black">Kitchen Display (KDS)</h2>
            <p className="mt-1 text-xs text-stone-400">Realtime tickets, chime, status flow. Staff sign-in.</p>
          </button>
          <button
            onClick={() => navigate('/admin')}
            className="rounded-2xl bg-white/5 p-5 text-left ring-1 ring-white/10 transition hover:bg-white/10"
          >
            <div className="text-2xl" aria-hidden>🛠️</div>
            <h2 className="mt-1.5 text-sm font-black">Admin Hub</h2>
            <p className="mt-1 text-xs text-stone-400">86 an item, generate table QRs, see the day's numbers.</p>
          </button>
        </div>

        {/* Free-tier contract */}
        <div className="mx-auto mt-12 max-w-xl rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-emerald-300">
            Free-tier engineering, as shipped
          </h3>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-stone-300">
            <li>• <strong>DB size:</strong> nightly pg_cron purges finished orders & calls after 48h; items cascade.</li>
            <li>• <strong>Realtime budget:</strong> 1 websocket per tab, 1–2 channels per page, removed on every unmount.</li>
            <li>• <strong>Media:</strong> zero files in Supabase Storage — menu images & QRs are external/client-side.</li>
            <li>• <strong>Keepalive:</strong> GitHub Action pings the REST endpoint daily so the project never pauses.</li>
          </ul>
        </div>

        <p className="mt-10 text-center text-[11px] text-stone-600">
          Template forking guide in README — swap the seed, change nothing else.
        </p>
      </div>
    </div>
  );
}

export default LandingPage;
