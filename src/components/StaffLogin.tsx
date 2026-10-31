// ════════════════════════════════════════════════════════════════════════════
//  StaffLogin — Supabase Auth email/password for KDS + Admin.
//  Signing in also arms the WebAudio context (user gesture), which unlocks
//  the incoming-order chime for the KDS session.
// ════════════════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { Button } from './ui/Button';
import { Spinner } from './ui/misc';
import { armAudio, audioReady } from '../lib/chime';

interface StaffLoginProps {
  title: string;
  subtitle?: string;
  disabled?: boolean;
  onSignIn: (email: string, password: string) => Promise<void>;
}

export function StaffLogin({ title, subtitle, disabled, onSignIn }: StaffLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [soundReady, setSoundReady] = useState(audioReady);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    armAudio(); // gesture → chime becomes audible for the rest of the session
    setSoundReady(true);
    setBusy(true);
    setError(null);
    try {
      await onSignIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-100 px-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-7 shadow-lg ring-1 ring-stone-200">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-2xl" aria-hidden>
            🍀
          </div>
          <h1 className="text-lg font-black tracking-tight text-stone-900">{title}</h1>
          {subtitle && <p className="mt-1 text-xs text-stone-500">{subtitle}</p>}
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label htmlFor="staff-email" className="text-[11px] font-bold uppercase tracking-widest text-stone-400">
              Work email
            </label>
            <input
              id="staff-email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl bg-stone-50 px-3.5 py-2.5 text-sm text-stone-900 ring-1 ring-stone-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="chef@paddys-kitchen.ie"
            />
          </div>
          <div>
            <label htmlFor="staff-password" className="text-[11px] font-bold uppercase tracking-widest text-stone-400">
              Password
            </label>
            <input
              id="staff-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl bg-stone-50 px-3.5 py-2.5 text-sm text-stone-900 ring-1 ring-stone-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              {error}
            </p>
          )}

          <Button type="submit" block size="lg" disabled={busy || disabled}>
            {busy ? <Spinner className="h-4 w-4" /> : null}
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        {!soundReady && (
          <p className="mt-3 text-center text-[11px] text-stone-400">
            Signing in also enables the kitchen chime.
          </p>
        )}
      </div>
    </div>
  );
}

export default StaffLogin;
